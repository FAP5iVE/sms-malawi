/*
 * apps/web/src/server/services/reportCardService.ts — Phase D3
 *
 * [CHANGE TYPE]: MAJOR REWRITE of the PDF-generation and data-gathering
 *   functions (Appwrite upload/URL helpers are the real, canonical
 *   storage.ts exports — see below — not edited separately since the old
 *   code never actually called real ones).
 * [R-PHASE]: R8 — Academics IV: Report Cards, Transcripts, Promotion & Risk
 *   Assessment
 * [PURPOSE]:
 *   1. HIGHEST-PRIORITY FIX: corrected the invalid nested-ternary syntax in
 *      generateReportCardPDF() — `setFill(idx % 2 === 0 ? 255 : 249 : 255,
 *      255, 255)` does not parse at all.
 *   2. Both attendance queries now call attendanceService.
 *      getAttendanceSummaryForTerm() (R6's real Attendance model) instead
 *      of the assumed-shape `prisma.attendance.aggregate({_sum: {present,
 *      absent}})` — that shape never existed on any Attendance model this
 *      codebase has ever had.
 *   3. The teacher-comment lookup now queries the real TeacherComment
 *      model this same phase adds, instead of a Prisma model
 *      (`prisma.teacherComment`) that never existed at all — every report
 *      card generated before this phase shipped with a permanently-null
 *      comment. Since TeacherComment only has authorUid (no explicit
 *      role/type field, deliberately minimal per its own schema comment),
 *      "class teacher" vs "head teacher" is resolved by checking authorUid
 *      against the student's Class.teacherId — the class's own teacher's
 *      comment is the "class teacher" comment; any other author's comment
 *      is shown as the "head teacher" comment.
 *   4. Hardcoded fallback identity strings ('SMS Malawi Secondary School',
 *      'P.O. Box 1, Blantyre, Malawi', '+265 111 000 000') are replaced
 *      with settingsService.getIdentitySettings(), matching the pattern R5
 *      applied to public.ts. schoolLogoUrl is now part of the assembled
 *      data too.
 *   5. This file's own `storageClient`/`BUCKET_ID` (@/lib/storage) import
 *      referenced exports that never existed there at all — a second,
 *      independent build-breaking error alongside the syntax error above.
 *      Rewired onto the real, already-correct canonical storage API
 *      (uploadFile/getSignedViewUrl/FILE_PREFIX/canReadFile) that
 *      assignment submissions (R6) already uses — which already implements
 *      exactly the "authenticated-owner-and-staff-only" access model this
 *      phase asks for (FILE_PREFIX.REPORT_CARD's READ_ROLES entry:
 *      admin/high_rank/exam_officer/academic/__self) and an expiring
 *      access path (getSignedViewUrl()'s 1-hour TTL proxy), replacing the
 *      previous `[read("any")]` public-read grant outright. The local
 *      URL_EXPIRY_SECS constant is removed as redundant — getSignedViewUrl
 *      already encapsulates the same 1-hour expiry.
 *   6. subjectResults's real shape is an object keyed by subject name
 *      (`Record<string, {average, grade, pass}>`, per examService.
 *      computeTermResults()), not an array — the previous
 *      `(termResult?.subjectResults ?? []) as Array<...>` cast changed
 *      nothing about the actual runtime value, so `.map()` on it would
 *      throw the moment a TermResult with real data was read. Since each
 *      subject's grade is already computed and stored by
 *      computeTermResults() (gradeService.calcGrade(), the sole grading
 *      authority — R7), this file no longer recomputes it at all: doing so
 *      previously read a non-existent `s.total` array index (always
 *      undefined, given the shape bug above) through calcGrade(), which
 *      would have produced a wrong/fallback grade even had the shape been
 *      correct. Reading the stored grade directly is both the fix and the
 *      removal of genuinely duplicate grading logic.
 *   7. Added generateSingleReportCard() — a single-student entry point so
 *      the route calling it (exams.ts, this same phase) doesn't need
 *      examService.ts's removed (R7) implementation, and batch generation
 *      doesn't need to run for an entire class just to regenerate one
 *      student's card.
 * [DEPENDS ON]: apps/web/src/lib/storage.ts (uploadFile, getSignedViewUrl,
 *   FILE_PREFIX), apps/web/src/server/services/attendanceService.ts
 *   (getAttendanceSummaryForTerm), apps/web/src/server/services/
 *   settingsService.ts (getIdentitySettings)
 *
 * Flow:
 *   1. getReportCardData(studentId, term, year)
 *      → Assembles all DB data into a ReportCardData shape.
 *   2. generateReportCardPDF(data)
 *      → Produces a PDF Buffer via jsPDF v4 (Node.js-compatible).
 *   3. uploadReportCard(buffer, ...)
 *      → Stores the PDF in the shared Appwrite bucket, namespaced under
 *        FILE_PREFIX.REPORT_CARD.
 *   4. getReportCardUrl(fileId)
 *      → Returns a 1-hour-expiring, access-controlled proxy URL.
 *   5. batchGenerateReportCards(classId, term, year, actorUid)
 *      → Runs steps 1–3 concurrently for all ACTIVE students in the class.
 *   6. generateSingleReportCard(studentId, term, year, actorUid)
 *      → Runs steps 1–3 for exactly one student.
 *
 * The student-facing report card screen (PrintableReportCard, Phase C8)
 * uses react-to-print for individual viewing/printing. This service
 * handles batch pre-generation and persistent storage used by the
 * ReportCardGenerator management UI (exam officer) and the student's
 * "Download Report Card" button.
 */

import 'server-only'
import { jsPDF }             from 'jspdf'
import { prisma }            from '@/lib/prisma'
import { logger }            from '@/lib/logger'
import { uploadFile, getSignedViewUrl, FILE_PREFIX } from '@/lib/storage'
import * as settingsService  from '@/server/services/settingsService'
import * as attendanceService from '@/server/services/attendanceService'
import type { ReportCardData, SubjectGrade } from '@/components/shared/PrintableReportCard'

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const CONCURRENT_LIMIT = 5          // max concurrent DB+PDF+upload per batch

// ─────────────────────────────────────────────────────────────────────────────
// DATA ASSEMBLY
// ─────────────────────────────────────────────────────────────────────────────

export async function getReportCardData(
  studentId:    string,
  term:         1 | 2 | 3,
  academicYear: string,
): Promise<ReportCardData> {
  const [student, termResult, annualResult, identity] = await Promise.all([
    prisma.student.findUniqueOrThrow({
      where:   { id: studentId },
      include: { class: { select: { id: true, name: true, form: true, teacherId: true } } },
    }),
    prisma.termResult.findFirst({
      where: { studentId, term, academicYear },
    }),
    prisma.annualResult.findFirst({
      where: { studentId, academicYear },
    }),
    settingsService.getIdentitySettings(),
  ])

  const classForm = student.class?.form ?? 1

  // Attendance — real Attendance model (R6), via the shared term-summary helper
  const { daysPresent, daysAbsent, totalDays: totalSchoolDays } =
    await attendanceService.getAttendanceSummaryForTerm(studentId, academicYear, term)

  // Teacher comments — real TeacherComment model (this phase). "Class
  // teacher" = comment authored by this class's assigned teacher; any
  // other author's comment is shown as "head teacher".
  const comments = termResult
    ? await prisma.teacherComment.findMany({
        where:   { termResultId: termResult.id },
        orderBy: { createdAt: 'asc' },
      })
    : []
  const classTeacherEntry = comments.find((c) => c.authorUid === student.class?.teacherId)
  const headTeacherEntry  = comments.find((c) => c.authorUid !== student.class?.teacherId)

  // Subject grades — already computed and stored by examService.
  // computeTermResults() (gradeService.calcGrade(), the sole grading
  // authority). subjectResults is an object keyed by subject name, not an
  // array — read directly, never recompute.
  const subjectResults = (termResult?.subjectResults ?? {}) as Record<
    string,
    { average: number; grade: string; pass: boolean }
  >

  const subjects: SubjectGrade[] = Object.entries(subjectResults).map(([subject, s]) => ({
    subject,
    total:   s.average,
    grade:   s.grade,
    remarks: s.pass ? 'Pass' : 'Below pass mark',
  }))

  // PR-1: promotion is an ANNUAL determination — shown only on the Term 3
  // card once a promotion run has been COMMITTED (annualResult exists).
  // Terms 1–2, and Term 3 before commit, carry NO promotion status (null),
  // so a report card never claims "Pass and Proceed" before promotion runs.
  const promotionStatus: 'PASS_AND_PROCEED' | 'REPEAT' | null =
    term === 3 && annualResult
      ? (annualResult.promoted ? 'PASS_AND_PROCEED' : 'REPEAT')
      : null

  const nextForm = student.class ? student.class.form + 1 : null
  const nextClass = nextForm && nextForm <= 4 ? `Form ${nextForm}` : undefined

  return {
    schoolName:    identity.schoolName,
    schoolMotto:   identity.schoolSlogan || undefined,
    schoolAddress: identity.schoolAddress,
    schoolPhone:   identity.schoolPhone,
    schoolEmail:   identity.schoolEmail || undefined,
    schoolLogoUrl: identity.schoolLogoUrl || undefined,
    student: {
      registrationNo: student.registrationNo,
      firstName:      student.firstName,
      lastName:       student.lastName,
      sex:            student.sex as string,
      dateOfBirth:    student.dateOfBirth?.toISOString(),
      className:      student.class?.name ?? '—',
    },
    classForm,
    academicYear,
    term,
    subjects,
    classPosition:   termResult?.classPosition  ?? 0,
    classTotal:      termResult?.classTotal     ?? 0,
    totalMarks:      Number(termResult?.totalMark    ?? 0),
    averagePercent:  Number(termResult?.average      ?? 0),
    daysPresent,
    daysAbsent,
    totalSchoolDays,
    classTeacher:        student.class?.teacherId ? 'Class Teacher' : '—',
    classTeacherComment: classTeacherEntry?.comment ?? '',
    headTeacher:         headTeacherEntry ? 'Head Teacher' : '—',
    headTeacherComment:  headTeacherEntry?.comment ?? '',
    promotionStatus,
    nextClass,
    issueDate:     new Date().toISOString(),
    nextTermDate:  new Date(Date.now() + 60 * 24 * 3600_000).toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF GENERATION (jsPDF v4)
// Generates a programmatic A4 PDF mirroring PrintableReportCard.tsx layout.
// ─────────────────────────────────────────────────────────────────────────────

export function generateReportCardPDF(data: ReportCardData): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const W  = 210   // A4 width mm
  const ML = 20    // margin left
  const MR = 20    // margin right
  const CW = W - ML - MR   // content width

  let y = 20

  // ── Helper functions ───────────────────────────────────────────────────────

  const setFont = (size: number, style: 'normal' | 'bold' = 'normal') => {
    doc.setFontSize(size)
    doc.setFont('helvetica', style)
  }

  const text = (str: string, x: number, yPos: number, opts?: { align?: 'center' | 'left' | 'right' }) => {
    doc.text(str, x, yPos, opts)
  }

  const line = (x1: number, y1: number, x2: number, y2: number) => {
    doc.line(x1, y1, x2, y2)
  }

  const setColor = (r: number, g: number, b: number) => doc.setTextColor(r, g, b)
  const setFill  = (r: number, g: number, b: number) => doc.setFillColor(r, g, b)
  const setDraw  = (r: number, g: number, b: number) => doc.setDrawColor(r, g, b)

  // ── 1. Header ─────────────────────────────────────────────────────────────
  setFill(30, 58, 95)     // brand-navy
  doc.rect(ML, y, CW, 18, 'F')
  setColor(255, 255, 255)
  setFont(14, 'bold')
  text(data.schoolName.toUpperCase(), W / 2, y + 8, { align: 'center' })
  setFont(8)
  text('STUDENT REPORT CARD', W / 2, y + 14, { align: 'center' })
  y += 22

  setColor(0, 0, 0)
  setFont(9, 'bold')
  text(`Academic Year ${data.academicYear}  ·  Term ${data.term}`, W / 2, y, { align: 'center' })
  y += 6

  if (data.schoolAddress) {
    setFont(7)
    setColor(100, 100, 100)
    text(data.schoolAddress, W / 2, y, { align: 'center' })
    y += 5
  }
  y += 2

  // ── 2. Student info box ───────────────────────────────────────────────────
  setDraw(180, 180, 180)
  setColor(0, 0, 0)

  const infoRows: [string, string, string, string][] = [
    ['Reg. Number', data.student.registrationNo, 'Full Name', `${data.student.firstName} ${data.student.lastName}`],
    ['Form / Class', data.student.className, 'Sex', data.student.sex],
    ['Class Teacher', data.classTeacher, 'Date of Birth', data.student.dateOfBirth
      ? new Date(data.student.dateOfBirth).toLocaleDateString('en-GB')
      : '—'],
  ]

  const halfCW = CW / 2
  infoRows.forEach((row, i) => {
    const ry = y + i * 8
    setFill(249, 250, 251)
    doc.rect(ML, ry, halfCW, 8, 'FD')
    doc.rect(ML + halfCW, ry, halfCW, 8, 'D')
    setFont(7, 'bold')
    setColor(80, 80, 80)
    text(row[0]!, ML + 2, ry + 5)
    setFont(8, 'bold')
    setColor(0, 0, 0)
    text(row[1]!, ML + 35, ry + 5)
    setFont(7, 'bold')
    setColor(80, 80, 80)
    text(row[2]!, ML + halfCW + 2, ry + 5)
    setFont(8)
    setColor(0, 0, 0)
    text(row[3]!, ML + halfCW + 35, ry + 5)
  })
  y += infoRows.length * 8 + 4

  // ── 3. Grades table ───────────────────────────────────────────────────────
  const colWidths = [50, 22, 22, 22, 14, CW - 50 - 22 - 22 - 22 - 14]
  const headers   = ['Subject', 'C.A. (%)', 'Exam (%)', 'Total (%)', 'Grade', 'Remarks']

  // Header row
  setFill(30, 58, 95)
  doc.rect(ML, y, CW, 7, 'F')
  setColor(255, 255, 255)
  setFont(7, 'bold')
  let cx = ML
  headers.forEach((h, i) => {
    text(h, cx + 1.5, y + 5)
    cx += colWidths[i]!
  })
  y += 7

  // Data rows
  data.subjects.forEach((s, idx) => {
    const rowH = 7
    // Alternating row background — even rows white, odd rows light grey
    // (fixed nested-ternary syntax error — previously did not parse at all)
    if (idx % 2 === 0) {
      setFill(255, 255, 255)
      doc.rect(ML, y, CW, rowH, 'D')
    } else {
      setFill(249, 250, 251)
      doc.rect(ML, y, CW, rowH, 'FD')
    }
    setColor(0, 0, 0)
    setFont(7)
    cx = ML
    const vals = [
      s.subject,
      s.caScore   != null ? s.caScore.toFixed(1)   : '—',
      s.examScore != null ? s.examScore.toFixed(1) : '—',
      s.total.toFixed(1),
      s.grade,
      s.remarks ?? '—',
    ]
    vals.forEach((v, i) => {
      if (i === 4) { setFont(8, 'bold'); setColor(0, 80, 100) }
      text(String(v), cx + 1.5, y + 5)
      if (i === 4) { setFont(7); setColor(0, 0, 0) }
      cx += colWidths[i]!
    })
    y += rowH
  })

  // Aggregate row
  setFill(240, 244, 248)
  doc.rect(ML, y, CW, 7, 'FD')
  setFont(8, 'bold')
  setColor(30, 58, 95)
  text('AGGREGATE', ML + 1.5, y + 5)
  text(`Average: ${data.averagePercent.toFixed(1)}%`, ML + 96, y + 5)
  text(`Position: ${data.classPosition} / ${data.classTotal}`, ML + 135, y + 5)
  y += 7 + 4

  // ── 4. Attendance ─────────────────────────────────────────────────────────
  setFill(55, 65, 81)
  doc.rect(ML, y, CW, 6, 'F')
  setColor(255, 255, 255)
  setFont(7, 'bold')
  text('ATTENDANCE', ML + 1.5, y + 4.5)
  y += 6

  setColor(0, 0, 0)
  setFont(7)
  doc.rect(ML, y, CW, 7, 'D')
  const attPct = data.totalSchoolDays > 0
    ? ((data.daysPresent / data.totalSchoolDays) * 100).toFixed(0)
    : '0'
  text(`Days Present: ${data.daysPresent}   Days Absent: ${data.daysAbsent}   Total Days: ${data.totalSchoolDays}   Attendance: ${attPct}%`, ML + 2, y + 5)
  y += 7 + 4

  // ── 5. Comments ───────────────────────────────────────────────────────────
  const commentH = 24
  setFill(249, 250, 251)
  doc.rect(ML, y, CW / 2, commentH, 'FD')
  doc.rect(ML + CW / 2, y, CW / 2, commentH, 'D')
  setFont(7, 'bold')
  setColor(80, 80, 80)
  text("Class Teacher's Comment:", ML + 1.5, y + 4.5)
  text("Head Teacher's Comment:", ML + CW / 2 + 1.5, y + 4.5)
  setFont(7)
  setColor(0, 0, 0)
  const ctLines = doc.splitTextToSize(data.classTeacherComment || '—', CW / 2 - 4)
  const htLines = doc.splitTextToSize(data.headTeacherComment  || '—', CW / 2 - 4)
  doc.text(ctLines.slice(0, 3), ML + 1.5, y + 9)
  doc.text(htLines.slice(0, 3), ML + CW / 2 + 1.5, y + 9)
  setFont(6)
  setColor(120, 120, 120)
  text(`Signature: _____________`, ML + 1.5, y + commentH - 2)
  text(`Signature: _____________`, ML + CW / 2 + 1.5, y + commentH - 2)
  y += commentH + 4

  // ── 6. Promotion status (annual — only once committed at Term 3) ───────────
  if (data.promotionStatus) {
    const pass = data.promotionStatus === 'PASS_AND_PROCEED'
    if (pass) {
      setFill(240, 253, 244)
      setDraw(21, 128, 61)
    } else {
      setFill(254, 242, 242)
      setDraw(220, 38, 38)
    }
    doc.setLineWidth(0.6)
    doc.rect(ML, y, CW, 10, 'FD')
    doc.setLineWidth(0.2)
    setFont(10, 'bold')
    setColor(pass ? 21 : 220, pass ? 128 : 38, pass ? 61 : 38)
    const promoText = pass
      ? `PASS AND PROCEED${data.nextClass ? ` TO ${data.nextClass.toUpperCase()}` : ''}`
      : `REPEAT ${data.student.className.toUpperCase()}`
    text(promoText, ML + 3, y + 7)
    y += 10 + 4
  }

  // ── 7. Footer ─────────────────────────────────────────────────────────────
  setDraw(180, 180, 180)
  line(ML, y, ML + CW, y)
  y += 3
  setFont(7)
  setColor(120, 120, 120)
  const issued = new Date(data.issueDate).toLocaleDateString('en-GB')
  const nextT  = new Date(data.nextTermDate).toLocaleDateString('en-GB')
  text(`Date Issued: ${issued}`, ML, y + 4)
  text(`Next Term Begins: ${nextT}`, W / 2, y + 4, { align: 'center' })
  text(`OFFICIAL — ${data.schoolName.toUpperCase()}`, ML + CW, y + 4, { align: 'right' })

  return Buffer.from(doc.output('arraybuffer'))
}

// ─────────────────────────────────────────────────────────────────────────────
// APPWRITE UPLOAD — canonical storage.ts API (uploadFile/getSignedViewUrl),
// which already implements the authenticated-owner-and-staff-only access
// model this phase requires (FILE_PREFIX.REPORT_CARD's READ_ROLES entry)
// and a 1-hour-expiring proxy URL — replacing the previous
// [read("any")]-granting, non-existent storageClient/BUCKET_ID API.
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadReportCard(
  buffer:       Buffer,
  academicYear: string,
  term:         number,
  studentId:    string,
): Promise<string> {
  const { fileId } = await uploadFile(
    FILE_PREFIX.REPORT_CARD,
    buffer,
    `report-card-${studentId}-${academicYear.replace('/', '-')}-t${term}.pdf`,
    'application/pdf',
  )

  // Persist the file ID on the student's TermResult for fast retrieval
  await prisma.termResult.updateMany({
    where: { studentId, academicYear, term },
    data:  { reportCardKey: fileId },
  })

  return fileId
}

export async function getReportCardUrl(fileId: string): Promise<string> {
  return getSignedViewUrl(fileId)
}

// ─────────────────────────────────────────────────────────────────────────────
// BATCH / SINGLE GENERATION
// ─────────────────────────────────────────────────────────────────────────────

export interface BatchGenerationResult {
  studentId:      string
  registrationNo: string
  fullName:       string
  fileId?:        string
  url?:           string
  error?:         string
}

async function runConcurrently<T>(
  items:   T[],
  limit:   number,
  fn:      (item: T) => Promise<BatchGenerationResult>,
): Promise<BatchGenerationResult[]> {
  const results: BatchGenerationResult[] = []
  for (let i = 0; i < items.length; i += limit) {
    const chunk  = items.slice(i, i + limit)
    const settled = await Promise.allSettled(chunk.map(fn))
    for (const r of settled) {
      if (r.status === 'fulfilled') results.push(r.value)
      else results.push({ studentId: '', registrationNo: '', fullName: '', error: String(r.reason) })
    }
  }
  return results
}

async function generateForStudent(
  student: { id: string; registrationNo: string; firstName: string; lastName: string },
  term: 1 | 2 | 3,
  academicYear: string,
): Promise<BatchGenerationResult> {
  const data   = await getReportCardData(student.id, term, academicYear)
  const buffer = generateReportCardPDF(data)
  const fileId = await uploadReportCard(buffer, academicYear, term, student.id)
  const url    = await getReportCardUrl(fileId)
  return {
    studentId:      student.id,
    registrationNo: student.registrationNo,
    fullName:       `${student.firstName} ${student.lastName}`,
    fileId,
    url,
  }
}

export async function batchGenerateReportCards(
  classId:      string,
  term:         1 | 2 | 3,
  academicYear: string,
  actorUid:     string,
): Promise<BatchGenerationResult[]> {
  const students = await prisma.student.findMany({
    where:  { classId, status: 'ACTIVE' },
    select: { id: true, registrationNo: true, firstName: true, lastName: true },
  })

  // [PRODUCTION FIX] This previously always regenerated every student's PDF
  // on every call — opening the "Generate All" screen a second time for a
  // class/term that already had report cards silently redid the work
  // (re-rendering + re-uploading every PDF) instead of just showing what
  // was already there. Existing, already-generated ones are now looked up
  // once and returned as-is; only students genuinely missing a report card
  // for this exact (studentId, academicYear, term) go through real
  // generation. A real regenerate is still one click away via the
  // per-student Retry button (POST /exams/report-card,
  // generateSingleReportCard() below), which is unaffected by this check.
  const existing = await prisma.termResult.findMany({
    where: {
      studentId: { in: students.map((s) => s.id) },
      academicYear,
      term,
      reportCardKey: { not: null },
    },
    select: { studentId: true, reportCardKey: true },
  })
  const existingByStudent = new Map(existing.map((e) => [e.studentId, e.reportCardKey as string]))

  logger.info(
    {
      event: 'report-cards.batch.start',
      classId, term, academicYear,
      count: students.length,
      alreadyGenerated: existingByStudent.size,
      actorUid,
    },
    'Starting batch report card generation',
  )

  const results = await runConcurrently(
    students,
    CONCURRENT_LIMIT,
    async (s) => {
      const existingFileId = existingByStudent.get(s.id)
      if (existingFileId) {
        const url = await getReportCardUrl(existingFileId)
        return {
          studentId:      s.id,
          registrationNo: s.registrationNo,
          fullName:       `${s.firstName} ${s.lastName}`,
          fileId:         existingFileId,
          url,
        }
      }
      try {
        return await generateForStudent(s, term, academicYear)
      } catch (err) {
        logger.error({ event: 'report-cards.batch.student-error', studentId: s.id, err })
        return {
          studentId:      s.id,
          registrationNo: s.registrationNo,
          fullName:       `${s.firstName} ${s.lastName}`,
          error:          err instanceof Error ? err.message : 'Unknown error',
        }
      }
    },
  )

  const succeeded = results.filter((r) => !r.error).length
  const failed    = results.filter((r) => !!r.error).length
  logger.info(
    { event: 'report-cards.batch.done', classId, term, academicYear, succeeded, failed, actorUid },
    'Batch report card generation complete',
  )

  return results
}

/** Single-student generation entry point — used by POST /exams/report-card
 *  (exams.ts, this same phase) so that route no longer needs
 *  examService.ts's removed (R7) generateReportCard() implementation, and
 *  ReportCardGenerator.tsx's per-row "retry" action doesn't need to run
 *  batch generation for the whole class just to regenerate one card. */
export async function generateSingleReportCard(
  studentId:    string,
  term:         1 | 2 | 3,
  academicYear: string,
  actorUid:     string,
): Promise<BatchGenerationResult> {
  const student = await prisma.student.findUniqueOrThrow({
    where:  { id: studentId },
    select: { id: true, registrationNo: true, firstName: true, lastName: true },
  })

  logger.info(
    { event: 'report-cards.single.start', studentId, term, academicYear, actorUid },
    'Generating single report card',
  )

  try {
    const result = await generateForStudent(student, term, academicYear)
    logger.info({ event: 'report-cards.single.done', studentId, term, academicYear, actorUid })
    return result
  } catch (err) {
    logger.error({ event: 'report-cards.single.error', studentId, err })
    return {
      studentId:      student.id,
      registrationNo: student.registrationNo,
      fullName:       `${student.firstName} ${student.lastName}`,
      error:          err instanceof Error ? err.message : 'Unknown error',
    }
  }
}