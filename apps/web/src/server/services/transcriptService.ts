/**
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
import { jsPDF }              from 'jspdf'
import { prisma }             from '@/lib/prisma'
import { logger }             from '@/lib/logger'
import { uploadFile, getSignedViewUrl, FILE_PREFIX } from '@/lib/storage'
import * as settingsService   from '@/server/services/settingsService'
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
  }>
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
  records:         TranscriptTermRecord[]
  generatedAt:     string
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA ASSEMBLY
// ─────────────────────────────────────────────────────────────────────────────

export async function getTranscriptData(studentId: string): Promise<TranscriptData> {
  const [student, termResults, identity] = await Promise.all([
    prisma.student.findUniqueOrThrow({
      where:   { id: studentId },
      include: { class: { select: { form: true } } },
    }),
    prisma.termResult.findMany({
      where:   { studentId },
      include: { class: { select: { name: true } } },
      orderBy: [{ academicYear: 'asc' }, { term: 'asc' }],
    }),
    settingsService.getIdentitySettings(),
  ])

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
        { average: number; grade: string; pass: boolean }
      >
      const subjects = Object.entries(subjectResults).map(([subject, s]) => ({
        subject,
        total: s.average,
        grade: s.grade,
      }))

      return {
        academicYear:  tr.academicYear,
        term:          tr.term,
        className:     tr.class?.name ?? '—',
        subjects,
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
    records,
    generatedAt:    new Date().toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF GENERATION
// ─────────────────────────────────────────────────────────────────────────────

export function generateTranscriptPDF(data: TranscriptData): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210; const ML = 20; const MR = 20; const CW = W - ML - MR
  let y = 20

  const setFont = (size: number, style: 'normal' | 'bold' = 'normal') => {
    doc.setFontSize(size); doc.setFont('helvetica', style)
  }

  // Cover header
  doc.setFillColor(30, 58, 95)
  doc.rect(ML, y, CW, 20, 'F')
  doc.setTextColor(255, 255, 255)
  setFont(14, 'bold')
  doc.text(data.schoolName.toUpperCase(), W / 2, y + 8, { align: 'center' })
  setFont(9)
  doc.text('OFFICIAL ACADEMIC TRANSCRIPT', W / 2, y + 15, { align: 'center' })
  y += 24

  doc.setTextColor(0, 0, 0)
  setFont(9, 'bold')
  doc.text(`Student: ${data.firstName} ${data.lastName}`, ML, y)
  setFont(8)
  doc.text(`Reg No: ${data.registrationNo}   Sex: ${data.sex}`, ML, y + 5)
  if (data.dateOfBirth) {
    doc.text(`Date of Birth: ${new Date(data.dateOfBirth).toLocaleDateString('en-GB')}`, ML, y + 10)
  }
  doc.text(`Generated: ${new Date(data.generatedAt).toLocaleDateString('en-GB')}`, W - MR, y + 10, { align: 'right' })
  y += 18

  // Per-term records
  for (const rec of data.records) {
    if (y > 250) { doc.addPage(); y = 20 }

    // Term section header
    doc.setFillColor(55, 65, 81)
    doc.rect(ML, y, CW, 6, 'F')
    doc.setTextColor(255, 255, 255)
    setFont(7, 'bold')
    doc.text(`${rec.academicYear}  ·  Term ${rec.term}  ·  ${rec.className}`, ML + 2, y + 4.5)
    doc.text(
      `Average: ${rec.termAverage.toFixed(1)}%   Position: ${rec.classPosition}/${rec.classTotal}`,
      W - MR - 2, y + 4.5, { align: 'right' },
    )
    y += 6

    // Subject rows
    doc.setTextColor(0, 0, 0)
    const subColW = [50, 22, 22, 22, 14]
    const subHdrs = ['Subject', 'CA (%)', 'Exam (%)', 'Total', 'Grade']
    doc.setFillColor(240, 244, 248)
    doc.rect(ML, y, CW, 5.5, 'FD')
    setFont(6.5, 'bold')
    let cx = ML
    subHdrs.forEach((h, i) => { doc.text(h, cx + 1, y + 4); cx += (subColW[i] ?? 14) })
    y += 5.5

    rec.subjects.forEach((s, idx) => {
      if (y > 270) { doc.addPage(); y = 20 }
      if (idx % 2 !== 0) { doc.setFillColor(249, 250, 251); doc.rect(ML, y, CW, 5.5, 'FD') }
      else { doc.rect(ML, y, CW, 5.5, 'D') }
      setFont(6.5)
      cx = ML
      const vals = [s.subject, s.caScore != null ? s.caScore.toFixed(1) : '—', s.examScore != null ? s.examScore.toFixed(1) : '—', s.total.toFixed(1), s.grade]
      vals.forEach((v, i) => {
        if (i === 4) { doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 80, 100) }
        doc.text(String(v), cx + 1, y + 4)
        if (i === 4) { doc.setFont('helvetica', 'normal'); doc.setTextColor(0, 0, 0) }
        cx += (subColW[i] ?? 14)
      })
      y += 5.5
    })

    // Attendance line
    setFont(6.5)
    doc.setTextColor(80, 80, 80)
    const attPct = (rec.daysPresent + rec.daysAbsent) > 0
      ? ((rec.daysPresent / (rec.daysPresent + rec.daysAbsent)) * 100).toFixed(0)
      : '—'
    doc.text(`Attendance: ${rec.daysPresent} present / ${rec.daysAbsent} absent (${attPct}%)`, ML, y + 4)
    y += 8
  }

  // Signature block
  if (y > 240) { doc.addPage(); y = 20 }
  y += 6
  doc.setDrawColor(180, 180, 180)
  doc.line(ML, y, ML + CW, y)
  y += 4
  setFont(7, 'bold')
  doc.setTextColor(30, 58, 95)
  doc.text('CERTIFIED CORRECT', ML, y + 4)
  setFont(7)
  doc.setTextColor(100, 100, 100)
  doc.text(`${data.schoolName}   ·   ${data.schoolAddress}`, W / 2, y + 4, { align: 'center' })
  y += 10
  doc.text('Head Teacher: ___________________________   Date: _______________   Stamp:', ML, y)

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
  const buffer = generateTranscriptPDF(data)
  return uploadTranscript(buffer, studentId)
}
