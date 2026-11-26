/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/app/api/files/[fileId]/route.ts
 * [R-PHASE]: R12 — Library Domain & the Storage API Contract Fix
 * [PURPOSE]: This phase's own roadmap text claimed "no code change
 *   required" here, on the assumption that the storage-contract
 *   prefix-vs-bucket bug (fixed elsewhere this phase) was the only thing
 *   blocking __self ownership resolution. Direct inspection of this file
 *   found a second, independent defect on the same causal chain: all
 *   three ownership-lookup branches queried Prisma shapes that don't
 *   exist in schema.prisma —
 *     - prisma.payslip.findFirst({ where: { <old file-id field> } }) — the
 *       real fields are payslipKey and staffUid, not the old file-id field/
 *       staffId.
 *     - prisma.reportCard.findFirst(...) — there is no ReportCard model;
 *       a report card's key lives on TermResult.reportCardKey, resolved
 *       by value, then joined to Student.firebaseUid (TermResult.studentId
 *       is a plain string with no Prisma relation, matching this
 *       codebase's established plain-FK convention — sms-erp-schema
 *       Rule 2).
 *     - prisma.transcript.findFirst(...) — there is no Transcript model;
 *       a transcript's key lives directly on Student.transcriptKey.
 *   All three were wrapped in a try/catch that silently swallowed the
 *   error, so this compiled fine and crashed silently at runtime — every
 *   __self access attempt for these three categories fell through to
 *   canReadFile()'s role-only check, denying the owning student/staff
 *   member their own document unless their role independently qualified.
 *   Fixed to query the real fields above; ownerUid now resolves to a
 *   real Firebase UID in all three cases, matching what canReadFile()'s
 *   userUid comparison expects.
 * [DEPENDS ON]: apps/web/prisma/schema.prisma (Payslip, TermResult,
 *   Student — unchanged, read directly from source this phase)
 *
 * [CHANGE TYPE]: TARGETED EDIT (post-R19 production build fix)
 * [PURPOSE]: Vercel production build failed TypeScript checking —
 *   GET's second parameter was still typed as the pre-Next.js-15 synchronous
 *   `{ params: { fileId: string } }` shape. Next.js 16 dynamic route
 *   handlers require `params` to be a `Promise` that's awaited before use
 *   (matches `RouteHandlerConfig`'s generated constraint). Fixed to
 *   `{ params: Promise<{ fileId: string }> }` and `await params` before
 *   reading `fileId`. Confirmed the only route handler in the app with a
 *   dynamic segment using this old shape (`api/[[...slug]]/route.ts`
 *   doesn't destructure `params` at all; the two dynamic `page.tsx` files
 *   read the id client-side via `useParams()`, unaffected).
 */
import { type NextRequest, NextResponse } from 'next/server'
import { getIdTokenFromRequest } from '@/lib/verifyAuth'
import { canReadFile, streamFile } from '@/lib/storage'
import { prisma } from '@/lib/prisma'
import { canAccessAssignmentFile } from '@/server/services/assignmentService'
import { isSuperUserClaim } from '@shared/constants/superUser'
import { isInlineSafeMime } from '@shared/utils/assignment'
import { resolveFileCaller, tokenSourceOf } from '@/lib/fileCaller'

/**
 * F3 — Secure file proxy route.
 * Every protected file download flows through here.
 * Access is verified server-side before any bytes are returned.
 *
 * GET /api/files/<fileId>
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
): Promise<NextResponse> {
  // ── 1. Verify Firebase ID token ───────────────────────────────────────────
  const decoded = await getIdTokenFromRequest(request)
  if (!decoded) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const { fileId: rawFileId } = await params
  const fileId = decodeURIComponent(rawFileId)
  // [Guardian portal] Decide who is calling BEFORE any file-specific lookup.
  // No role defaulting (a roleless token used to become 'student'), and a parent
  // may only present the token in the Authorization header, never in the URL.
  const caller = resolveFileCaller({
    uid: decoded.uid,
    roleClaim: decoded['role'],
    source: tokenSourceOf(request.headers.get('authorization'), request.nextUrl.searchParams.get('token')),
  })
  if (!caller.ok) {
    return NextResponse.json({ error: caller.error }, { status: caller.status })
  }
  const { uid, role } = caller

  // ── 2. Resolve file owner for __self checks ───────────────────────────────
  // For payslips and personal docs we look up the ownerUid stored in the db.
  let ownerUid: string | undefined
  try {
    if (fileId.startsWith('payslip_')) {
      const slip = await prisma.payslip.findFirst({
        where: { payslipKey: fileId },
        select: { staffUid: true },
      })
      ownerUid = slip?.staffUid ?? undefined
    } else if (fileId.startsWith('report_card_')) {
      // TermResult.studentId is a plain string, not a Prisma relation
      // (sms-erp-schema Rule 2's established convention) — resolve in
      // two steps rather than a nested include.
      const tr = await prisma.termResult.findFirst({
        where: { reportCardKey: fileId },
        select: { studentId: true },
      })
      if (tr) {
        const student = await prisma.student.findUnique({
          where: { id: tr.studentId },
          select: { firebaseUid: true },
        })
        ownerUid = student?.firebaseUid ?? undefined
      }
    } else if (fileId.startsWith('receipt_')) {
      // Payment -> Invoice -> Student. Receipts used to have no ownership
      // branch (and READ_ROLES had no __self entry), so the student who PAID
      // was refused their own receipt with a 403 even though the API route
      // had already authorised them.
      const payment = await prisma.payment.findFirst({
        where: { receiptKey: fileId },
        select: { invoice: { select: { studentId: true } } },
      })
      if (payment) {
        const student = await prisma.student.findUnique({
          where: { id: payment.invoice.studentId },
          select: { firebaseUid: true },
        })
        ownerUid = student?.firebaseUid ?? undefined
      }
    } else if (fileId.startsWith('assignment_submission_')) {
      // [2026-10-27] A student's own submission file: owner = that student.
      // (No branch existed, so students were refused the file they uploaded.)
      const sub = await prisma.assignmentSubmission.findFirst({
        where: { fileKey: fileId },
        select: { studentId: true },
      })
      if (sub) {
        const student = await prisma.student.findUnique({
          where: { id: sub.studentId },
          select: { firebaseUid: true },
        })
        ownerUid = student?.firebaseUid ?? undefined
      }
    } else if (fileId.startsWith('transcript_')) {
      const student = await prisma.student.findFirst({
        where: { transcriptKey: fileId },
        select: { firebaseUid: true },
      })
      ownerUid = student?.firebaseUid ?? undefined
    }
  } catch (err) {
    // FAIL CLOSED. This used to swallow the error and fall through to
    // canReadFile with ownerUid undefined, which still admitted every staff role
    // in READ_ROLES. A database error is not a reason to serve a file whose
    // owner could not be established.
    console.error('[file-proxy] owner lookup failed', fileId, err)
    return NextResponse.json({ error: 'Temporarily unavailable' }, { status: 503 })
  }

  // ── 3. Server-side access control ────────────────────────────────────────
  if (!canReadFile(fileId, role, uid, ownerUid)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── 3b. Assignment material needs more than a role: the viewer must be in
  //        the class / teach the subject (assignmentService decides). ────────
  if (fileId.startsWith('assignment_')) {
    const ok = await canAccessAssignmentFile(fileId, {
      uid,
      role,
      superUser: isSuperUserClaim(decoded['superUser']),
    })
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── 4. Stream file bytes ──────────────────────────────────────────────────
  try {
    const { buffer, mimeType, filename } = await streamFile(fileId)
    // [2026-10-28] Teachers' attachments and students' hand-ins are user-supplied
    // and served from the APP's origin, so a script-capable file (html, svg, xml...)
    // opened here would run with the viewer's session. Uploads are allowlisted at
    // claim time (shared/utils/assignment.ts); as defence in depth, anything that is
    // not a PDF or a raster image is forced to DOWNLOAD, and non-PDF responses carry
    // a sandboxing CSP. (PDFs stay inline-capable: PDF.js reads them through fetch.)
    const isAssignmentFile = fileId.startsWith('assignment_')
    const inline = !isAssignmentFile || isInlineSafeMime(mimeType)
    const sandbox = isAssignmentFile && ((mimeType ?? '').split(';')[0] ?? '').trim().toLowerCase() !== 'application/pdf'
    return new NextResponse(buffer as BodyInit, {
      status: 200,
      headers: {
        // The MIME type stored with the object is authoritative for the browser
        // response. PDF.js consumes the bytes through fetch, so it does not
        // depend on Chrome's built-in PDF plugin.
        'Content-Type': mimeType,
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        ...(sandbox ? { 'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox" } : {}),
      },
    })
  } catch (err) {
    console.error('[file-proxy] stream error', fileId, err)
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }
}
