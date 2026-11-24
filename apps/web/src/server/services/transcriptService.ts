/**
 * [DESIGN REWRITE — document redesign] generateTranscriptPDF() now uses the shared
 *   document kit (pdfBranding): common letterhead, running header + "Page x of y"
 *   on every page, per-term blocks that follow the grading track (JCE: average;
 *   MSCE: aggregate points + a Points column with the counted subjects marked),
 *   grade colours from the system's scale rows, and a "Certified Correct" block
 *   signed by the head teacher from the staff directory with the authentication
 *   stamp. getTranscriptData() carries the extra system-derived fields.
 *
 * apps/web/src/server/services/transcriptService.ts — Phase D10
 *
 * [CHANGE TYPE]: TARGETED EDIT (output in full — the data-assembly and
 *   upload functions both change)
 * [R-PHASE]: R8 — Academics IV: Report Cards, Transcripts, Promotion & Risk
 *   Assessment
 * [PURPOSE]:
 *   1. Repointed the assumed-shape `prisma.attendance.aggregate({_sum:
 *      {present, absent}})` call at attendanceService.
 *      getAttendanceSummaryForTerm() (R6's real Attendance model) —
 *      matching the identical fix applied to reportCardService.ts.
 *   2. Fixed getTranscriptData()'s speculative `(tr as
 *      {className?:string}).className` cast — TermResult has no
 *      className field at all, only classId; a cast cannot manufacture a
 *      field that was never queried. Now joins through Class (via
 *      TermResult.classId) to get the real name instead of a permanent
 *      placeholder dash. The same was true of the `classPosition`/
 *      `classTotal` casts — both are real TermResult columns, so this is
 *      a direct field read, not a speculative cast, once selected.
 *   3. subjectResults's real shape is an object keyed by subject name
 *      (matching examService.computeTermResults()'s actual output), not
 *      an array — the previous cast-to-array changed nothing about the
 *      runtime value, so `.map()` on it would throw. Each subject's grade
 *      is already computed and stored — this file no longer recomputes it
 *      via calcGrade() (which, given the shape bug, was reading `s.total`
 *      off a non-existent array index and always computing a fallback
 *      grade regardless of the shape fix).
 *   4. Added the same Appwrite permissions treatment
 *      reportCardService.uploadReportCard() now has — this file's own
 *      `storageClient`/`BUCKET_ID`/`ID` imports (@/lib/storage,
 *      node-appwrite) referenced exports that never existed at all (a
 *      confirmed build-breaking error, not merely an inconsistent
 *      permissions grant). Rewired onto the canonical uploadFile/
 *      getSignedViewUrl/FILE_PREFIX API — FILE_PREFIX.TRANSCRIPT's
 *      READ_ROLES entry (admin/high_rank/exam_officer/__self) already
 *      implements exactly the "authenticated-owner-and-staff-only" model
 *      this phase asks for.
 *   5. Replaced hardcoded identity-string fallbacks ('SMS Malawi
 *      Secondary School', 'Blantyre, Malawi') with settingsService.
 *      getIdentitySettings(), matching reportCardService.ts.
 * [DEPENDS ON]: apps/web/src/lib/storage.ts (uploadFile, getSignedViewUrl,
 *   FILE_PREFIX), apps/web/src/server/services/attendanceService.ts
 *   (getAttendanceSummaryForTerm), apps/web/src/server/services/
 *   settingsService.ts (getIdentitySettings)
 *
 * Academic transcript generator.
 * Aggregates all term results across a student's academic history into a
 * single multi-page A4 PDF and uploads to Appwrite.
 *
 * Transcript contents (per academic year → per term):
 *   • Student details header (same as report card)
 *   • Per-year / per-term table: subject | Total | Grade
 *   • Term average, class position
 *   • Attendance per term
 *   • School signature block on the final page
 */

import 'server-only'
import { prisma }             from '@/lib/prisma'
import { logger }             from '@/lib/logger'
import { uploadFile, getSignedViewUrl, FILE_PREFIX } from '@/lib/storage'
import * as settingsService   from '@/server/services/settingsService'
import { getRasterSchoolLogo } from '@/server/services/schoolLogoService'
import {
  PDF_COLORS as C, PT, createPdfDoc, drawCard, drawDocumentFooters, drawDocumentTitle, drawLetterhead, drawSignatory, drawStamp,
  ellipsize, fillColor, fmtDate, gradeInk, put, resolveHeadTeacher, setFace, stampPlace, strokeColor, tint, tracked, withSignature,
  type GradeTier, type PdfBranding, type PdfSignatory,
} from '@/server/services/pdfBranding'
import { getGradePoints, listGradingScales } from '@/server/services/gradeService'
import { getGradingTrack } from '@shared/constants/malawi'
import * as attendanceService from '@/server/services/attendanceService'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface TranscriptTermRecord {
  academicYear: string
  term:         number
  className:    string
  subjects:     Array<{
    subject:    string
    caScore?:   number
    examScore?: number
    total:      number
    grade:      string
    /** MSCE track only — the grade's point value, and whether it counts in the aggregate. */
    points?:      number | null
    inAggregate?: boolean
  }>
  /** Which grading system produced this term (JCE letter grades / MSCE 1–9 points). */
  gradingTrack:    'JCE' | 'MSCE'
  /** MSCE track only: best-six aggregate (null when it could not be formed). */
  aggregatePoints: number | null
  termAverage:   number
  classPosition: number
  classTotal:    number
  daysPresent:   number
  daysAbsent:    number
}

export interface TranscriptData {
  studentId:       string
  registrationNo:  string
  firstName:       string
  lastName:        string
  sex:             string
  dateOfBirth?:    string
  schoolName:      string
  schoolAddress:   string
  schoolMotto?:    string
  schoolPhone?:    string
  schoolEmail?:    string
  /** Stamp lower-arc text derived from the address ("Northern Region · Malawi"). */
  schoolPlace?:    string
  /** IANA timezone from Settings > Identity — dates print in it. */
  timezone?:       string
  /** Inline PNG/JPEG data URI of the school logo (see schoolLogoService). */
  schoolLogoDataUri?: string
  /** The head teacher who certifies the transcript, from the staff directory. */
  headTeacher:     PdfSignatory | null
  /** The system's grading scales per track — colours/labels for every grade printed. */
  gradeScales:     Record<'JCE' | 'MSCE', GradeTier[]>
  records:         TranscriptTermRecord[]
  generatedAt:     string
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA ASSEMBLY
// ─────────────────────────────────────────────────────────────────────────────

export async function getTranscriptData(studentId: string): Promise<TranscriptData> {
  const [student, termResults, identity, headTeacher, scales] = await Promise.all([
    prisma.student.findUniqueOrThrow({
      where:   { id: studentId },
      include: { class: { select: { form: true } } },
    }),
    prisma.termResult.findMany({
      where:   { studentId },
      orderBy: [{ academicYear: 'asc' }, { term: 'asc' }],
    }),
    settingsService.getIdentitySettings(),
    resolveHeadTeacher(),
    listGradingScales(),
  ])
  const tiers = (key: string): GradeTier[] =>
    scales.filter((r) => r.examType === key).sort((a, b) => a.displayOrder - b.displayOrder)
      .map((r) => ({ grade: r.grade, pass: r.pass, label: r.label }))

  // TermResult.classId is a bare scalar FK with no Prisma relation to Class
  // (no @relation on either side in schema.prisma), so class names must be
  // resolved via a manual, batched lookup rather than a Prisma `include`.
  const classIds = [...new Set(termResults.map((tr) => tr.classId))]
  const classes = await prisma.class.findMany({
    where:  { id: { in: classIds } },
    select: { id: true, name: true, form: true },
  })
  const classNameById = new Map(classes.map((c) => [c.id, c.name]))
  const classFormById = new Map(classes.map((c) => [c.id, c.form]))

  const records: TranscriptTermRecord[] = await Promise.all(
    termResults.map(async (tr) => {
      const { daysPresent, daysAbsent } = await attendanceService.getAttendanceSummaryForTerm(
        studentId,
        tr.academicYear,
        tr.term,
      )

      // subjectResults is an object keyed by subject name (examService.
      // computeTermResults()'s real output shape) — grades are already
      // computed and stored there; read directly, never recompute.
      const subjectResults = (tr.subjectResults ?? {}) as Record<
        string,
        { average: number; grade: string; pass: boolean; ca?: { points: number }; exam?: { points: number } }
      >
      // The grading system that produced THIS term (stored at compute time;
      // the system's getGradingTrack(form) for rows that pre-date it).
      const gradingTrack: 'JCE' | 'MSCE' =
        (tr.gradingTrack as 'JCE' | 'MSCE' | null) ?? getGradingTrack(classFormById.get(tr.classId) ?? student.class?.form ?? 1)
      const aggregateSubjects = (tr.aggregateSubjects as string[] | null) ?? []
      const subjects = await Promise.all(Object.entries(subjectResults).map(async ([subject, s]) => {
        const points = gradingTrack === 'MSCE' ? await getGradePoints('INTERNAL_F3F4', s.grade) : undefined
        return {
          subject,
          total: s.average,
          grade: s.grade,
          // CA / Exam contribution to the final mark - only when continuous
          // assessments were aggregated (examService.computeTermResults).
          ...(s.ca   ? { caScore:   s.ca.points }   : {}),
          ...(s.exam ? { examScore: s.exam.points } : {}),
          ...(points !== undefined ? { points, inAggregate: aggregateSubjects.includes(subject) } : {}),
        }
      }))

      return {
        academicYear:  tr.academicYear,
        term:          tr.term,
        className:     classNameById.get(tr.classId) ?? '—',
        subjects,
        gradingTrack,
        aggregatePoints: tr.aggregatePoints ?? null,
        termAverage:   Number(tr.average),
        classPosition: tr.classPosition,
        classTotal:    tr.classTotal,
        daysPresent,
        daysAbsent,
      }
    }),
  )

  return {
    studentId,
    registrationNo: student.registrationNo,
    firstName:      student.firstName,
    lastName:       student.lastName,
    sex:            student.sex as string,
    dateOfBirth:    student.dateOfBirth?.toISOString(),
    schoolName:     identity.schoolName,
    schoolAddress:  identity.schoolAddress,
    ...(identity.schoolSlogan ? { schoolMotto: identity.schoolSlogan } : {}),
    schoolPhone:    identity.schoolPhone,
    ...(identity.schoolEmail ? { schoolEmail: identity.schoolEmail } : {}),
    schoolPlace:    stampPlace(identity.schoolAddress),
    timezone:       identity.timezone,
    schoolLogoDataUri: (await getRasterSchoolLogo()).dataUri,
    headTeacher,
    gradeScales:    { JCE: tiers('INTERNAL_F1F2'), MSCE: tiers('INTERNAL_F3F4') },
    records,
    generatedAt:    new Date().toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF GENERATION
// ─────────────────────────────────────────────────────────────────────────────

export function generateTranscriptPDF(data: TranscriptData): Buffer {
  const doc = createPdfDoc()
  const M_X = 15
  const CW = 180
  const PAGE_W = 210
  const BOTTOM = 276            // content stops here; the footer owns 281–290
  const tz = data.timezone
  const branding: PdfBranding = {
    schoolName:   data.schoolName,
    motto:        data.schoolMotto ?? '',
    contactLines: [data.schoolAddress, data.schoolPhone ? `Tel: ${data.schoolPhone}` : '', data.schoolEmail ?? ''].filter(Boolean),
    logoDataUri:  data.schoolLogoDataUri ?? '',
    place:        data.schoolPlace ?? '',
    timezone:     data.timezone ?? '',
  }
  const fullName = `${data.firstName} ${data.lastName}`.trim()
  const issued = fmtDate(data.generatedAt, 'long', tz)

  // ── page 1: letterhead, title, student ─────────────────────────────────────
  let y = drawLetterhead(doc, branding, { x: M_X, y: 14, w: CW })
  y = drawDocumentTitle(doc, PAGE_W / 2, y + 7, 'Official Academic Transcript', `Issued ${issued}`) + 3

  const sex = data.sex ? data.sex.charAt(0).toUpperCase() + data.sex.slice(1).toLowerCase() : '—'
  const facts: Array<[[string, string], [string, string]]> = [
    [['Student', fullName], ['Reg. no.', data.registrationNo]],
    [['Sex', sex], ['Date of birth', data.dateOfBirth ? fmtDate(data.dateOfBirth, 'long', tz) : '—']],
  ]
  const rowH = 6.2
  const cardH = facts.length * rowH + 2.4
  drawCard(doc, M_X, y, CW, cardH)
  strokeColor(doc, C.border)
  doc.setLineWidth(0.15)
  doc.line(M_X + CW / 2, y + 1.6, M_X + CW / 2, y + cardH - 1.6)
  facts.forEach((pair, i) => {
    const ty = y + 1.2 + i * rowH + rowH / 2 + 1
    if (i > 0) doc.line(M_X + 3, y + 1.2 + i * rowH, M_X + CW - 3, y + 1.2 + i * rowH)
    pair.forEach(([label, value], j) => {
      const x = M_X + (j === 0 ? 5 : CW / 2 + 5)
      setFace(doc, 'body', 7.4, C.muted)
      put(doc, label, x, ty)
      setFace(doc, 'bodyBold', 8.8, C.ink)
      put(doc, ellipsize(doc, value || '—', CW / 2 - 38), x + 27, ty)
    })
  })
  y += cardH + 6

  // ── terms ──────────────────────────────────────────────────────────────────
  const newPage = (): number => {
    doc.addPage()
    // running header: who this is, on every continuation page
    setFace(doc, 'headingBold', 7.5, C.navy)
    put(doc, data.schoolName.toUpperCase(), M_X, 13)
    setFace(doc, 'body', 7.5, C.muted)
    put(doc, `Academic transcript  ·  ${fullName}  ·  ${data.registrationNo}`, M_X + CW, 13, 'right')
    strokeColor(doc, C.border)
    doc.setLineWidth(0.25)
    doc.line(M_X, 15.5, M_X + CW, 15.5)
    return 21
  }

  const HEAD = 7.2
  const COLHEAD = 5.8
  const ROW = 5.4

  for (const rec of data.records) {
    const isMsce = rec.gradingTrack === 'MSCE'
    const tiers = new Map((data.gradeScales[rec.gradingTrack] ?? []).map((t) => [t.grade, t]))
    const cols: Array<{ label: string; w: number; align: 'left' | 'center' }> = isMsce
      ? [{ label: 'Subject', w: 66, align: 'left' }, { label: 'C.A. (%)', w: 22, align: 'center' }, { label: 'Exam (%)', w: 22, align: 'center' }, { label: 'Total (%)', w: 24, align: 'center' }, { label: 'Grade', w: 22, align: 'center' }, { label: 'Points', w: 24, align: 'center' }]
      : [{ label: 'Subject', w: 72, align: 'left' }, { label: 'C.A. (%)', w: 27, align: 'center' }, { label: 'Exam (%)', w: 27, align: 'center' }, { label: 'Total (%)', w: 27, align: 'center' }, { label: 'Grade', w: 27, align: 'center' }]
    const nRows = Math.max(1, rec.subjects.length)
    const blockH = HEAD + COLHEAD + nRows * ROW + 8
    if (y + blockH > BOTTOM) y = newPage()

    // term header band — name left, the result that matters for THIS track right
    const top = y
    fillColor(doc, C.navy)
    doc.roundedRect(M_X, y, CW, HEAD + 2, 1.8, 1.8, 'F')
    doc.rect(M_X, y + HEAD - 0.2, CW, 0.4, 'F')
    setFace(doc, 'headingBold', 8, C.white)
    put(doc, `${rec.academicYear}  ·  Term ${rec.term}  ·  ${rec.className}`, M_X + 3, y + HEAD / 2 + 1.1)
    const position = rec.classPosition ? `Position ${rec.classPosition} / ${rec.classTotal}` : 'Position —'
    const result = isMsce
      ? (rec.aggregatePoints != null ? `Aggregate ${rec.aggregatePoints} points` : 'Aggregate not available')
      : `Average ${rec.termAverage.toFixed(1)}%`
    setFace(doc, 'bodyBold', 7.8, C.white)
    put(doc, `${result}   ·   ${position}`, M_X + CW - 3, y + HEAD / 2 + 1.1, 'right')
    y += HEAD

    // column header
    fillColor(doc, tint(C.secondary, 0.35))
    doc.rect(M_X, y, CW, COLHEAD, 'F')
    setFace(doc, 'headingBold', 6.6, C.neutral)
    let cx = M_X
    for (const c of cols) {
      if (c.align === 'left') put(doc, c.label, cx + 3, y + COLHEAD / 2 + 1)
      else put(doc, c.label, cx + c.w / 2, y + COLHEAD / 2 + 1, 'center')
      cx += c.w
    }
    y += COLHEAD

    if (rec.subjects.length === 0) {
      setFace(doc, 'body', 7.6, C.muted)
      put(doc, 'No subject results recorded for this term.', M_X + 3, y + ROW / 2 + 1)
      y += ROW
    }
    rec.subjects.forEach((s, i) => {
      fillColor(doc, i % 2 === 1 ? tint(C.secondary, 0.5) : C.white)
      doc.rect(M_X, y, CW, ROW, 'F')
      const ty = y + ROW / 2 + 7.6 * PT * 0.34
      const mid = (k: number) => M_X + cols.slice(0, k).reduce((a, c) => a + c.w, 0) + (cols[k]?.w ?? 0) / 2
      setFace(doc, 'bodyBold', 7.6, C.ink)
      put(doc, ellipsize(doc, s.subject, (cols[0]?.w ?? 60) - 6), M_X + 3, ty)
      setFace(doc, 'body', 7.6, C.neutral)
      put(doc, s.caScore != null ? s.caScore.toFixed(1) : '—', mid(1), ty, 'center')
      put(doc, s.examScore != null ? s.examScore.toFixed(1) : '—', mid(2), ty, 'center')
      setFace(doc, 'bodyBold', 7.6, C.ink)
      put(doc, s.total.toFixed(1), mid(3), ty, 'center')
      setFace(doc, 'headingBold', 8.6, gradeInk(tiers.get(s.grade)))
      put(doc, s.grade, mid(4), y + ROW / 2 + 8.6 * PT * 0.34, 'center')
      if (isMsce) {
        if (s.inAggregate) {
          fillColor(doc, tint(C.navy, 0.88))
          doc.roundedRect(mid(5) - 4, y + 0.7, 8, ROW - 1.4, 1.1, 1.1, 'F')
        }
        setFace(doc, s.inAggregate ? 'headingBold' : 'body', 8, s.inAggregate ? C.navy : C.muted)
        put(doc, s.points != null ? String(s.points) : '—', mid(5), y + ROW / 2 + 8 * PT * 0.34, 'center')
      }
      strokeColor(doc, C.border)
      doc.setLineWidth(0.12)
      doc.line(M_X, y + ROW, M_X + CW, y + ROW)
      y += ROW
    })
    strokeColor(doc, C.rule)
    doc.setLineWidth(0.3)
    doc.roundedRect(M_X, top, CW, y - top, 1.8, 1.8, 'S')

    // attendance
    const days = rec.daysPresent + rec.daysAbsent
    const pct = days > 0 ? Math.round((rec.daysPresent / days) * 100) : null
    setFace(doc, 'body', 7, C.muted)
    put(doc, `Attendance: ${rec.daysPresent} present / ${rec.daysAbsent} absent${pct != null ? ` (${pct}%)` : ''}`, M_X + 1, y + 4.4)
    y += 9
  }

  if (data.records.length === 0) {
    setFace(doc, 'body', 9, C.muted)
    put(doc, 'No term results have been recorded for this student.', PAGE_W / 2, y + 8, 'center')
    y += 16
  }

  // ── certification: head teacher + seal (kept together on one page) ─────────
  const CERT_H = 44
  if (y + CERT_H > BOTTOM) y = newPage()
  y += 4
  strokeColor(doc, C.border)
  doc.setLineWidth(0.25)
  doc.line(M_X, y, M_X + CW, y)
  setFace(doc, 'headingBold', 7.4, C.navy)
  tracked(doc, 'CERTIFIED CORRECT', M_X, y + 6.2, 0.55)
  setFace(doc, 'body', 7, C.muted)
  put(doc, `${data.schoolName}${data.schoolAddress ? `  ·  ${data.schoolAddress}` : ''}`, M_X, y + 10.4)
  const sig: PdfSignatory = data.headTeacher ?? { name: null, title: 'Head teacher', unit: null }
  drawSignatory(doc, { x: M_X, y: y + 12, w: 72, sig, org: data.schoolName, space: 14 })
  drawStamp(doc, {
    cx: M_X + CW - 19, cy: y + 24, r: 15, schoolName: data.schoolName, place: data.schoolPlace ?? '',
    label: 'Official', date: fmtDate(data.generatedAt, 'short', tz), caption: 'Validated', color: C.navy,
  })

  // ── footer on every page: generated date + page x of y ─────────────────────
  drawDocumentFooters(doc, { x: M_X, w: CW, y: 282, note: `Generated on ${issued}. This is a computer-generated document.`, reference: data.registrationNo })

  return Buffer.from(doc.output('arraybuffer'))
}

// ─────────────────────────────────────────────────────────────────────────────
// UPLOAD & URL — canonical storage.ts API, matching reportCardService.ts.
// FILE_PREFIX.TRANSCRIPT's READ_ROLES entry (admin/high_rank/exam_officer/
// __self) already implements authenticated-owner-and-staff-only access.
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadTranscript(
  buffer:    Buffer,
  studentId: string,
): Promise<{ fileId: string; url: string }> {
  const { fileId } = await uploadFile(
    FILE_PREFIX.TRANSCRIPT,
    buffer,
    `transcript-${studentId}-${Date.now()}.pdf`,
    'application/pdf',
  )

  // Persist on student record for quick re-access
  await prisma.student.update({
    where: { id: studentId },
    data:  { transcriptKey: fileId },
  })

  const url = await getSignedViewUrl(fileId)
  logger.info({ event: 'transcript.uploaded', studentId, fileId })
  return { fileId, url }
}

export async function generateAndUploadTranscript(
  studentId: string,
): Promise<{ fileId: string; url: string }> {
  const data   = await getTranscriptData(studentId)
  // The head's scanned signature is added here, where the PDF is built, so getTranscriptData() stays free of it.
  const signed = { ...data, headTeacher: await withSignature(data.headTeacher, 'transcript') }
  const buffer = generateTranscriptPDF(signed)
  return uploadTranscript(buffer, studentId)
}