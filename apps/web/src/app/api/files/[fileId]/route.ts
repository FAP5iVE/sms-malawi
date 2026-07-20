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
 *     - prisma.payslip.findFirst({ where: { appwriteFileId } }) — the
 *       real fields are payslipKey and staffUid, not appwriteFileId/
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
  const uid = decoded.uid
  const role = (decoded.role as string | undefined) ?? 'student'

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
    } else if (fileId.startsWith('transcript_')) {
      const student = await prisma.student.findFirst({
        where: { transcriptKey: fileId },
        select: { firebaseUid: true },
      })
      ownerUid = student?.firebaseUid ?? undefined
    }
  } catch {
    // Non-fatal — access control still enforces role check
  }

  // ── 3. Server-side access control ────────────────────────────────────────
  if (!canReadFile(fileId, role, uid, ownerUid)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── 4. Stream file bytes ──────────────────────────────────────────────────
  try {
    const { buffer, mimeType, filename } = await streamFile(fileId)
    return new NextResponse(buffer as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
        'Cache-Control': 'private, max-age=3600, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (err) {
    console.error('[file-proxy] stream error', fileId, err)
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }
}
