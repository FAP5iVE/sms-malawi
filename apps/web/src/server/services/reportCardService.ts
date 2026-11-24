/*
 * apps/web/src/server/services/reportCardService.ts — DESIGN + DATA REWRITE (document redesign)
 *
 * [CHANGE TYPE]: generateReportCardPDF() redesigned on the shared document kit
 *   (pdfBranding.ts); getReportCardData() now derives everything from the system.
 * [PURPOSE]: One A4 page, four layouts (JCE-track term, MSCE-track term, MANEB JCE,
 *   MANEB MSCE). Derived from the system, not typed in:
 *     - grading track + scale rows (Settings > Exam & Grading) and each subject's
 *       remark (= its scale label);
 *     - MSCE points per subject, the best-six aggregate and its counted subjects
 *       (gradeService.getGradePoints / stored aggregateSubjects; the 6 / 6-54
 *       range text comes from the MSCE_AGGREGATE_* constants);
 *     - JCE overall grade (gradeService.computeInternalTermOutcome);
 *     - class teacher + head teacher NAME and TITLE from the staff directory
 *       (previously the placeholder strings 'Class Teacher' / 'Head Teacher');
 *     - "Next Term Begins" from Settings > Academic term dates (previously
 *       now + 60 days); omitted on a graduating card.
 * ── earlier notes ────────────────────────────────────────────────────────────
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
import { prisma }            from '@/lib/prisma'
import { logger }            from '@/lib/logger'
import { uploadFile, getSignedViewUrl, FILE_PREFIX } from '@/lib/storage'
import * as settingsService  from '@/server/services/settingsService'
import * as auditService     from '@/server/services/auditService'
import { getRasterSchoolLogo } from '@/server/services/schoolLogoService'
import {
  createPdfDoc, drawCard, drawLetterhead, drawStamp, ellipsize, fillColor, fmtDate, gradeInk, put, resolveHeadTeacher,
  resolveStaffSignatory, sectionLabel, setFace, stampPlace, strokeColor, tint, tracked,
  PDF_COLORS as C, PT, type PdfBranding,
} from '@/server/services/pdfBranding'
import type { jsPDF } from 'jspdf'
import * as attendanceService from '@/server/services/attendanceService'
import {
  FORM_NUMBERS, MSCE_AGGREGATE_BEST, MSCE_AGGREGATE_SUBJECT_COUNT, MSCE_AGGREGATE_WORST,
  getGradingTrack, getManebExamType, parseAcademicYear,
} from '@shared/constants/malawi'
import {
  computeInternalTermOutcome, computeManebAggregate, getGradeInfo, getGradePoints, listGradingScales,
  type ExamTypeKey,
} from '@/server/services/gradeService'
import type {
  ReportCardData, ReportGradeScaleRow, SubjectGrade, ManebResultData, ManebSubjectRow,
} from '@/components/shared/PrintableReportCard'

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

const CONCURRENT_LIMIT = 5          // max concurrent DB+PDF+upload per batch

// ─────────────────────────────────────────────────────────────────────────────
// DATA ASSEMBLY
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM-DERIVED CARD FACTS — nothing below is typed in: scales, track, term
// dates and the people who sign all come from the settings / staff directory.
// ─────────────────────────────────────────────────────────────────────────────

/** The grading scale for one exam type, trimmed to what a card prints, in the
 *  admin-defined display order (Settings > Exam & Grading). */
async function loadScaleRows(key: ExamTypeKey): Promise<ReportGradeScaleRow[]> {
  const rows = await listGradingScales()
  return rows
    .filter((r) => r.examType === key)
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((r) => ({
      grade: r.grade,
      minPercent: Number(r.minPercent),
      maxPercent: Number(r.maxPercent),
      pass: r.pass,
      label: r.label,
    }))
}

/**
 * First day of the NEXT term from Settings > Academic term dates, re-anchored
 * to the card's academic year (the settings hold one year's dates; terms 2-3
 * and the following Term 1 all fall in the academic year's end year). Undefined
 * for a graduating card (final form, Term 3) or if the setting is malformed —
 * the card then simply omits the line rather than printing a guess.
 */
async function resolveNextTermStart(term: 1 | 2 | 3, academicYear: string, classForm: number): Promise<string | undefined> {
  if (term === 3 && classForm >= Math.max(...FORM_NUMBERS)) return undefined
  try {
    const td = await settingsService.getTermDates()
    const starts = [td.term1.start, td.term2.start, td.term3.start]
    const next = starts[term === 3 ? 0 : term]          // term is 1-based: after T1 -> T2 (index 1)
    const monthDay = /^\d{4}-(\d{2}-\d{2})/.exec(next ?? '')?.[1]
    if (!monthDay) return undefined
    return `${parseAcademicYear(academicYear).endYear}-${monthDay}`
  } catch {
    return undefined
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GR-2: MANEB RESULT ASSEMBLY — Form 2 Term 3 (JCE) / Form 4 Term 3 (MSCE)
// have no internal exam; the report card for those terms is built from the
// student's ManebRecord instead of TermResult. Recomputes the outcome via
// gradeService.computeManebAggregate() (the same function that produced the
// record's stored overallGrade/aggregatePoints) so the card can show detail
// that ManebRecord itself doesn't persist — which subjects counted, which
// certificate option.
// ─────────────────────────────────────────────────────────────────────────────

async function buildManebResult(
  studentId:    string,
  examType:     'JCE' | 'MSCE',
  academicYear: string,
): Promise<ManebResultData | null> {
  const record = await prisma.manebRecord.findFirst({ where: { studentId, examType, academicYear } })
  if (!record) return null

  const subjectGrades = (record.subjectGrades ?? {}) as Record<string, string>
  const outcome = await computeManebAggregate(examType, subjectGrades)

  const subjects: ManebSubjectRow[] = await Promise.all(
    Object.entries(subjectGrades).map(async ([subject, grade]) => {
      const info = await getGradeInfo(examType, grade)
      return {
        subject,
        grade,
        label: info?.label ?? null,
        pass:  info?.pass ?? false,
        inAggregate: outcome.examType === 'MSCE' ? outcome.aggregateSubjects.includes(subject) : undefined,
      }
    }),
  )

  return {
    examType,
    candidateNo: record.candidateNo,
    centerNo:    record.centerNo,
    centerName:  record.centerName,
    status:      record.status,
    subjects,
    classification:     outcome.classification,
    pass:               outcome.pass,
    points:             outcome.points,
    certificateOption:  outcome.examType === 'MSCE' ? outcome.certificateOption : null,
    englishInAggregate: outcome.examType === 'MSCE' ? outcome.englishInAggregate : null,
  }
}

export async function getReportCardData(
  studentId:    string,
  term:         1 | 2 | 3,
  academicYear: string,
): Promise<ReportCardData> {
  const [student, identity, logo, headTeacherDirectory] = await Promise.all([
    prisma.student.findUniqueOrThrow({
      where:   { id: studentId },
      include: { class: { select: { id: true, name: true, form: true, teacherId: true } } },
    }),
    settingsService.getIdentitySettings(),
    // Always resolves (admin upload, else the built-in school mark) — the card
    // never prints an initials placeholder any more. Raster-only so the SAME
    // value works for the on-screen print view and the jsPDF download.
    getRasterSchoolLogo(),
    // The head teacher is whoever the staff directory says holds that post.
    resolveHeadTeacher(),
  ])

  const classForm = student.class?.form ?? 1

  // Attendance — real Attendance model (R6), via the shared term-summary
  // helper. Fetched regardless of exam type — attendance during a MANEB
  // sitting term is still meaningful context on the card.
  const [{ daysPresent, daysAbsent, totalDays: totalSchoolDays }, classTeacherSig, nextTermDate] =
    await Promise.all([
      attendanceService.getAttendanceSummaryForTerm(studentId, academicYear, term),
      // The class teacher's real name + job title (Class.teacherId -> staff directory).
      resolveStaffSignatory(student.class?.teacherId),
      resolveNextTermStart(term, academicYear, classForm),
    ])

  const baseFields = {
    schoolName:    identity.schoolName,
    schoolMotto:   identity.schoolSlogan || undefined,
    schoolAddress: identity.schoolAddress,
    schoolPhone:   identity.schoolPhone,
    schoolEmail:   identity.schoolEmail || undefined,
    schoolLogoUrl: logo.dataUri,
    schoolPlace:   stampPlace(identity.schoolAddress),
    timezone:      identity.timezone,
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
    daysPresent,
    daysAbsent,
    totalSchoolDays,
    issueDate:     new Date().toISOString(),
    ...(nextTermDate ? { nextTermDate } : {}),
    classTeacher:      classTeacherSig?.name ?? '—',
    ...(classTeacherSig ? { classTeacherTitle: classTeacherSig.title } : {}),
  }

  // GR-2: Form 2 Term 3 (JCE) / Form 4 Term 3 (MSCE) — no TermResult ever
  // exists for these (examService.computeTermResults() deliberately refuses
  // to run for them; see gradeService.ts). Source the card from ManebRecord
  // instead — a fundamentally different result shape, not the CA/Exam/Total
  // grades table.
  const manebExamType = getManebExamType(classForm, term)
  if (manebExamType) {
    const [manebResult, gradingScale] = await Promise.all([
      buildManebResult(studentId, manebExamType, academicYear),
      loadScaleRows(manebExamType),
    ])
    return {
      ...baseFields,
      subjects:        [],
      classPosition:   0,
      classTotal:      0,
      totalMarks:      0,
      averagePercent:  0,
      gradingScale,
      classTeacherComment: '',
      headTeacher:         headTeacherDirectory?.name ?? '—',
      ...(headTeacherDirectory ? { headTeacherTitle: headTeacherDirectory.title } : {}),
      headTeacherComment:  '',
      promotionStatus: null,   // MSCE (Form 4) has no further promotion; JCE (Form 2→3) promotion is a separate school decision, not shown here
      nextClass:       undefined,
      manebResult:     manebResult ?? undefined,
    }
  }

  const [termResult, annualResult] = await Promise.all([
    prisma.termResult.findFirst({
      where: { studentId, term, academicYear },
    }),
    prisma.annualResult.findFirst({
      where: { studentId, academicYear },
    }),
  ])

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

  // The head teacher who signs is the directory's Head Teacher; only if the
  // directory has none do we fall back to whoever wrote the head's comment.
  const headSig = headTeacherDirectory ?? (await resolveStaffSignatory(headTeacherEntry?.authorUid))

  // [MSCE CORRECTION] The card must know which grading system produced this
  // term so its aggregate row can show POINTS (Forms 3-4) rather than a
  // percentage under an "AGGREGATE" heading. gradingTrack is written at
  // compute time; the system's getGradingTrack(form) is the fallback for rows
  // computed before it existed (and the one place that rule lives).
  const gradingTrack: 'JCE' | 'MSCE' =
    (termResult?.gradingTrack as 'JCE' | 'MSCE' | null) ?? getGradingTrack(classForm)

  // The scale this track is graded on (JCE track -> INTERNAL_F1F2, MSCE track
  // -> INTERNAL_F3F4), straight from Settings > Exam & Grading.
  const gradingScale = await loadScaleRows(gradingTrack === 'MSCE' ? 'INTERNAL_F3F4' : 'INTERNAL_F1F2')
  const scaleRow = new Map(gradingScale.map((r) => [r.grade, r]))
  const aggregateSubjects = (termResult?.aggregateSubjects as string[] | null) ?? []

  // Subject grades — already computed and stored by examService.
  // computeTermResults() (gradeService.calcGrade(), the sole grading
  // authority). subjectResults is an object keyed by subject name, not an
  // array — read directly, never recompute.
  const subjectResults = (termResult?.subjectResults ?? {}) as Record<
    string,
    {
      average: number; grade: string; pass: boolean
      // Present only when continuous assessments were aggregated into the
      // mark (examService.computeTermResults); ca.points + exam.points === average.
      ca?:   { points: number }
      exam?: { points: number }
    }
  >

  const subjects: SubjectGrade[] = await Promise.all(
    Object.entries(subjectResults).map(async ([subject, s]) => {
      // MSCE track: each subject also carries its point value, and whether it
      // is one of the best six counted in the aggregate (both from gradeService).
      const points = gradingTrack === 'MSCE' ? await getGradePoints('INTERNAL_F3F4', s.grade) : undefined
      return {
        subject,
        total:   s.average,
        grade:   s.grade,
        // The remark IS the grading-scale label for the grade (Distinction,
        // Credit, ... — admin-editable), not a generic pass/fail string.
        remarks: scaleRow.get(s.grade)?.label ?? (s.pass ? 'Pass' : 'Fail'),
        // Fills the report card's C.A. / Exam columns (contribution to the final
        // mark). Left undefined - rendered as a dash - when CA was not aggregated.
        ...(s.ca   ? { caScore:   s.ca.points }   : {}),
        ...(s.exam ? { examScore: s.exam.points } : {}),
        ...(points !== undefined ? { points, inAggregate: aggregateSubjects.includes(subject) } : {}),
      }
    }),
  )

  // JCE track only: the overall LETTER grade of the term average, from the
  // system's own outcome function (an MSCE term has no overall grade).
  let overallGrade: string | undefined
  if (gradingTrack === 'JCE' && subjects.length > 0) {
    const outcome = await computeInternalTermOutcome(
      classForm,
      Object.fromEntries(subjects.map((x) => [x.subject, x.grade])),
      Number(termResult?.average ?? 0),
    )
    overallGrade = outcome.overallGrade || undefined
  }

  // PR-1: promotion is an ANNUAL determination — shown only on the Term 3
  // card once a promotion run has been COMMITTED (annualResult exists).
  // Terms 1–2, and Term 3 before commit, carry NO promotion status (null),
  // so a report card never claims "Pass and Proceed" before promotion runs.
  const promotionStatus: 'PASS_AND_PROCEED' | 'REPEAT' | null =
    term === 3 && annualResult
      ? (annualResult.promoted ? 'PASS_AND_PROCEED' : 'REPEAT')
      : null

  const nextForm = student.class ? student.class.form + 1 : null
  const nextClass = nextForm && nextForm <= Math.max(...FORM_NUMBERS) ? `Form ${nextForm}` : undefined

  // classPosition/classTotal are written by computeTermResults() alongside
  // `position`. Falling back to `position` covers rows computed before that
  // write path existed — without it the card printed "Position: 0th / 0"
  // even when a real rank had been calculated.
  const classPosition = termResult?.classPosition || termResult?.position || 0
  const classTotal    = termResult?.classTotal || 0

  return {
    ...baseFields,
    subjects,
    gradingTrack,
    gradingScale,
    ...(overallGrade ? { overallGrade } : {}),
    aggregatePoints:   termResult?.aggregatePoints ?? null,
    aggregateSubjects,
    classPosition,
    classTotal,
    totalMarks:      Number(termResult?.totalMark    ?? 0),
    averagePercent:  Number(termResult?.average      ?? 0),
    classTeacherComment: classTeacherEntry?.comment ?? '',
    headTeacher:         headSig?.name ?? '—',
    ...(headSig ? { headTeacherTitle: headSig.title } : {}),
    headTeacherComment:  headTeacherEntry?.comment ?? '',
    promotionStatus,
    nextClass,
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// PDF GENERATION (jsPDF v4) — A4, ONE page, shared design kit (pdfBranding)
//
// Layout (top → bottom): letterhead · title · student card · results (internal
// term table OR MANEB result) · attendance · grading scale · [promotion] ·
// comments/signatures + authentication stamp · footer.
//
// Everything that varies is read from `data`, which getReportCardData() builds
// from the system: the grading track (JCE letter grades vs MSCE 1–9 points +
// best-six aggregate), the scale rows, remarks (= scale labels), the people who
// sign, the next-term date. Nothing here knows what "A" or "Distinction" means.
//
// One-page guarantee: the subject-row height is solved from the space left
// after every fixed block, so 8 subjects get airy rows and 20 get tight ones —
// the card never spills onto a second page.
// ─────────────────────────────────────────────────────────────────────────────

const PAGE_W = 210
const PAGE_H = 297
const M_X = 12
const M_TOP = 10
const M_BOTTOM = 8
const CW = PAGE_W - M_X * 2

/** Baseline y that vertically centres text of `size` pt in a band starting at `top` of height `h`. */
function midY(top: number, h: number, size: number): number {
  return top + h / 2 + size * PT * 0.34
}

function fmtCardDate(iso: string, tz: string | undefined, month: 'long' | 'short' = 'long'): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? fmtDate(iso, month, 'UTC') : fmtDate(iso, month, tz)
}

/** Label / value pair on one line inside the student card. */
function pair(doc: jsPDF, label: string, value: string, x: number, yMid: number, labelW: number, valueW: number): void {
  setFace(doc, 'body', 7.2, C.muted)
  put(doc, label, x, yMid)
  setFace(doc, 'bodyBold', 8.4, C.ink)
  put(doc, ellipsize(doc, value || '—', valueW), x + labelW, yMid)
}

/** Navy table header band with a rounded top (the rows paint over its lower edge). */
function tableHeader(doc: jsPDF, x: number, y: number, w: number, h: number): void {
  fillColor(doc, C.navy)
  doc.roundedRect(x, y, w, h + 2, 1.8, 1.8, 'F')
  doc.rect(x, y + h - 0.2, w, 0.4, 'F')
}

interface Col { label: string; w: number; align: 'left' | 'center' }

function drawHeaderLabels(doc: jsPDF, cols: Col[], x: number, y: number, h: number): void {
  setFace(doc, 'headingBold', 7, C.white)
  let cx = x
  for (const c of cols) {
    const ty = midY(y, h, 7)
    if (c.align === 'left') put(doc, c.label, cx + 3, ty)
    else put(doc, c.label, cx + c.w / 2, ty, 'center')
    cx += c.w
  }
}

/** Student details card (2 columns × `rows`). @returns y below the card. */
function drawStudentCard(doc: jsPDF, y: number, left: Array<[string, string]>, right: Array<[string, string]>): number {
  const rowH = 5.5
  const h = left.length * rowH + 2.4
  // no outer box: only the dividers between the facts
  strokeColor(doc, C.border)
  doc.setLineWidth(0.15)
  doc.line(M_X + CW / 2, y + 1.6, M_X + CW / 2, y + h - 1.6)
  left.forEach(([l, v], i) => {
    const ym = midY(y + 1.2 + i * rowH, rowH, 8.4)
    pair(doc, l, v, M_X + 2, ym, 25, CW / 2 - 31)
    const r = right[i]
    if (r) pair(doc, r[0], r[1], M_X + CW / 2 + 4, ym, 25, CW / 2 - 33)
    if (i < left.length - 1) {
      doc.line(M_X, y + 1.2 + (i + 1) * rowH, M_X + CW, y + 1.2 + (i + 1) * rowH)
    }
  })
  return y + h
}

/** Grading-scale key: one column per tier, straight from the system scale. */
function drawGradingScale(doc: jsPDF, y: number, rows: ReportGradeScaleRow[], scaleName: string): number {
  const headH = 5.4
  const bodyH = 12.6
  drawCard(doc, M_X, y, CW, headH + bodyH)
  fillColor(doc, tint(C.secondary, 0.35))
  doc.roundedRect(M_X + 0.15, y + 0.15, CW - 0.3, headH, 2, 2, 'F')
  doc.rect(M_X + 0.15, y + headH - 2.2, CW - 0.3, 2.35, 'F')
  strokeColor(doc, C.border)
  doc.setLineWidth(0.2)
  doc.line(M_X, y + headH, M_X + CW, y + headH)
  setFace(doc, 'headingBold', 6.8, C.neutral)
  tracked(doc, 'GRADING SCALE', M_X + 4, midY(y, headH, 6.8), 0.45)
  setFace(doc, 'bodyBold', 6.8, C.muted)
  put(doc, scaleName, M_X + CW - 4, midY(y, headH, 6.8), 'right')

  const n = Math.max(1, rows.length)
  const cw = CW / n
  rows.forEach((r, i) => {
    const cx = M_X + i * cw + cw / 2
    if (i > 0) doc.line(M_X + i * cw, y + headH + 1.6, M_X + i * cw, y + headH + bodyH - 1.6)
    setFace(doc, 'headingBold', n > 6 ? 10.5 : 12, gradeInk(r))
    put(doc, r.grade, cx, y + headH + 5.3, 'center')
    setFace(doc, 'body', 6.6, C.muted)
    put(doc, `${r.minPercent}–${r.maxPercent}%`, cx, y + headH + 8.3, 'center')
    setFace(doc, 'bodyBold', 6.8, C.ink)
    put(doc, ellipsize(doc, r.label ?? (r.pass ? 'Pass' : 'Fail'), cw - 2), cx, y + headH + 11.2, 'center')
  })
  return y + headH + bodyH
}

/** Greedy word-wrap where each line has its own width (lines beside the stamp are narrower).
 *  Overflow beyond `widths.length` lines is folded into an ellipsised last line. */
function wrapLines(doc: jsPDF, text: string, widths: number[]): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const word of words) {
    const lim = widths[Math.min(lines.length, widths.length - 1)] ?? 0
    const t = cur ? `${cur} ${word}` : word
    if (!cur || doc.getTextWidth(t) <= lim) cur = t
    else { lines.push(cur); cur = word }
  }
  if (cur) lines.push(cur)
  if (lines.length > widths.length) {
    const keep = widths.length - 1
    const rest = lines.slice(keep).join(' ')
    return [...lines.slice(0, keep), ellipsize(doc, rest, widths[keep] ?? 40)]
  }
  return lines
}

/** One teacher card: optional quoted comment, then name / title and a signature line.
 *  `stampSide` reserves the lower-right for the authentication stamp: the signature
 *  line moves left of it and the comment's last lines narrow to stay clear of it. */
function drawSignCard(
  doc: jsPDF,
  o: { x: number; y: number; w: number; h: number; title: string; comment: string | null; name: string; role: string | undefined; stampSide: boolean },
): void {
  // no outer box: the title, comment, name and signature sit on the page, divided by one hairline
  sectionLabel(doc, o.title, o.x, o.y + 5.2)
  const innerW = o.w - 2
  if (o.comment !== null) {
    setFace(doc, 'body', 7.8, o.comment ? C.neutral : C.muted)
    const raw = o.comment ? `“${o.comment}”` : '—'
    const narrow = o.stampSide ? innerW - 26 : innerW
    wrapLines(doc, raw, [innerW, innerW, narrow, narrow]).forEach((ln, i) => put(doc, ln, o.x, o.y + 10.2 + i * 3.55))
  }
  const baseY = o.y + o.h
  const sigRight = o.x + o.w - (o.stampSide ? 34 : 1)
  strokeColor(doc, C.border)
  doc.setLineWidth(0.15)
  doc.line(o.x, baseY - 12.6, o.x + o.w, baseY - 12.6)
  setFace(doc, 'headingBold', 5.4, C.muted)
  tracked(doc, 'NAME', o.x, baseY - 9.6, 0.35)
  tracked(doc, 'SIGNATURE', sigRight, baseY - 9.6, 0.35, 'right')
  setFace(doc, 'bodyBold', 8.6, C.ink)
  put(doc, ellipsize(doc, o.name, o.w * 0.42), o.x, baseY - 5.8)
  if (o.role) {
    setFace(doc, 'body', 6.6, C.muted)
    put(doc, ellipsize(doc, o.role, o.w * 0.42), o.x, baseY - 2.4)
  }
  strokeColor(doc, C.muted)
  doc.setLineWidth(0.2)
  doc.line(sigRight - 30, baseY - 3.4, sigRight, baseY - 3.4)
}

export function generateReportCardPDF(data: ReportCardData): Buffer {
  const doc = createPdfDoc()
  const branding: PdfBranding = {
    schoolName:   data.schoolName,
    motto:        data.schoolMotto ?? '',
    contactLines: [data.schoolAddress, data.schoolPhone ? `Tel: ${data.schoolPhone}` : '', data.schoolEmail ?? ''].filter(Boolean),
    logoDataUri:  data.schoolLogoUrl ?? '',
    place:        data.schoolPlace ?? '',
    timezone:     data.timezone ?? '',
  }
  const tz = data.timezone
  const maneb = data.manebResult
  const track: 'JCE' | 'MSCE' = maneb ? maneb.examType : (data.gradingTrack ?? getGradingTrack(data.classForm))
  const isMsce = track === 'MSCE'
  const scale = data.gradingScale ?? []
  const scaleOf = new Map(scale.map((r) => [r.grade, r]))
  const fullName = `${data.student.firstName} ${data.student.lastName}`.trim()

  // ── 1. Letterhead + title ──────────────────────────────────────────────────
  let y = drawLetterhead(doc, branding, { x: M_X, y: M_TOP, w: CW, compact: true })
  y += 4.5
  setFace(doc, 'headingBold', 12, C.ink)
  tracked(doc, (maneb ? `MANEB ${maneb.examType} EXAMINATION RESULT` : 'STUDENT REPORT CARD'), PAGE_W / 2, y + 3.6, 0.7, 'center')
  setFace(doc, 'body', 8.2, C.muted)
  put(doc, `Academic Year ${data.academicYear} · Term ${data.term}`, PAGE_W / 2, y + 8.2, 'center')
  y += 12.2

  // ── 2. Student card ────────────────────────────────────────────────────────
  const standing = maneb || !data.classPosition ? '—' : `Position: ${data.classPosition} of ${data.classTotal}`
  const dob = data.student.dateOfBirth ? fmtCardDate(data.student.dateOfBirth, tz) : '—'
  const sex = data.student.sex ? data.student.sex.charAt(0).toUpperCase() + data.student.sex.slice(1).toLowerCase() : '—'
  y = drawStudentCard(
    doc, y,
    [
      ['Reg. no.', data.student.registrationNo],
      ['Class', data.student.className],
      ['Class teacher', data.classTeacher],
      ['Date of birth', dob],
    ],
    [
      ['Full name', fullName],
      ['Sex', sex],
      maneb ? ['Candidate no.', maneb.candidateNo || '—'] : ['Standing', standing],
      maneb ? ['Centre', maneb.centerNo ? `${maneb.centerNo} · ${maneb.centerName || '—'}` : '—'] : ['Subjects', String(data.subjects.length)],
    ],
  )
  y += 3.2

  // ── heights of everything AFTER the results block (so rows can be solved) ──
  const SUMMARY_H = 7.2
  const noteH = !maneb && isMsce ? 5 : 0
  const ATT_H = 10
  const SCALE_H = scale.length ? 18 : 0
  const PROMO_H = data.promotionStatus ? 8.5 : 0
  const SIGN_H = maneb ? 24 : 36
  const FOOT_H = 7
  const GAP_SLOTS = 2 + (SCALE_H ? 1 : 0) + (PROMO_H ? 1 : 0)     // gaps after results / attendance / scale / promo
  const GAPS = GAP_SLOTS + 1                                      // + the one above the footer
  const afterResults = ATT_H + SCALE_H + PROMO_H + SIGN_H + FOOT_H + GAPS * 3.2
  const bottomLimit = PAGE_H - M_BOTTOM

  const HEAD_H = 6.6
  let rowH = 7
  let extra = 0   // leftover space when rows hit their cap, handed (bounded) to the gaps
  let bonus = 0   // per-gap share of that leftover (never more than 4.5 mm)

  if (maneb) {
    // ── 3a. MANEB result ─────────────────────────────────────────────────────
    const cols: Col[] = isMsce
      ? [{ label: 'Subject', w: 66, align: 'left' }, { label: 'Grade', w: 22, align: 'center' }, { label: 'Classification', w: 58, align: 'left' }, { label: 'In Aggregate', w: CW - 146, align: 'center' }]
      : [{ label: 'Subject', w: 80, align: 'left' }, { label: 'Grade', w: 26, align: 'center' }, { label: 'Classification', w: CW - 106, align: 'left' }]
    const outcomeH = isMsce ? 19 : 12
    const n = Math.max(1, maneb.subjects.length)
    const avail = bottomLimit - y - HEAD_H - outcomeH - 3.2 - afterResults
    rowH = Math.max(4.4, Math.min(8.4, avail / n))
    extra = Math.max(0, avail - n * rowH)
    bonus = Math.min(4.5, extra / (GAP_SLOTS + 1))
    const fs = rowH >= 6.2 ? 8 : rowH >= 5.4 ? 7.6 : 7.1

    const top = y
    tableHeader(doc, M_X, y, CW, HEAD_H)
    drawHeaderLabels(doc, cols, M_X, y, HEAD_H)
    y += HEAD_H
    maneb.subjects.forEach((s, i) => {
      if (i % 2 === 1) { fillColor(doc, tint(C.secondary, 0.5)); doc.rect(M_X, y, CW, rowH, 'F') }
      else { fillColor(doc, C.white); doc.rect(M_X, y, CW, rowH, 'F') }
      let cx = M_X
      setFace(doc, 'bodyBold', fs, C.ink)
      put(doc, ellipsize(doc, s.subject, (cols[0]?.w ?? 60) - 6), cx + 3, midY(y, rowH, fs))
      cx += cols[0]?.w ?? 0
      setFace(doc, 'headingBold', fs + 1.2, gradeInk(scaleOf.get(s.grade)))
      put(doc, s.grade, cx + (cols[1]?.w ?? 0) / 2, midY(y, rowH, fs + 1.2), 'center')
      cx += cols[1]?.w ?? 0
      setFace(doc, 'body', fs, C.neutral)
      put(doc, s.label ?? '—', cx + 3, midY(y, rowH, fs))
      cx += cols[2]?.w ?? 0
      if (isMsce && cols[3]) {
        if (s.inAggregate) {
          fillColor(doc, tint(C.navy, 0.88))
          doc.roundedRect(cx + cols[3].w / 2 - 6, y + 0.8, 12, rowH - 1.6, 1.2, 1.2, 'F')
          setFace(doc, 'bodyBold', fs - 0.4, C.navy)
          put(doc, 'Counted', cx + cols[3].w / 2, midY(y, rowH, fs - 0.4), 'center')
        } else {
          setFace(doc, 'body', fs, C.muted)
          put(doc, '—', cx + cols[3].w / 2, midY(y, rowH, fs), 'center')
        }
      }
      strokeColor(doc, C.border)
      doc.setLineWidth(0.12)
      doc.line(M_X, y + rowH, M_X + CW, y + rowH)
      y += rowH
    })
    // the table's own border, drawn last so row fills never cover it
    strokeColor(doc, C.rule)
    doc.setLineWidth(0.3)
    doc.roundedRect(M_X, top, CW, y - top, 1.8, 1.8, 'S')
    y += 3.2 + bonus

    // outcome
    const outInk = maneb.pass ? C.success : C.danger
    drawCard(doc, M_X, y, CW, outcomeH, { fill: tint(C.navy, 0.93), stroke: C.navy, lineWidth: 0.35 })
    if (isMsce) {
      setFace(doc, 'headingBold', 7.4, C.navy)
      tracked(doc, `AGGREGATE (BEST ${MSCE_AGGREGATE_SUBJECT_COUNT} SUBJECTS)`, M_X + 4, y + 6, 0.35)
      setFace(doc, 'headingBold', 11, C.navy)
      put(doc, maneb.points != null ? `${maneb.points} points` : `Not available: fewer than ${MSCE_AGGREGATE_SUBJECT_COUNT} subjects`, M_X + CW - 4, y + 6.4, 'right')
      setFace(doc, 'headingBold', 7.4, C.navy)
      tracked(doc, 'CERTIFICATE STATUS', M_X + 4, y + 12.4, 0.35)
      setFace(doc, 'headingBold', 9.5, outInk)
      put(doc, maneb.classification, M_X + CW - 4, y + 12.6, 'right')
      setFace(doc, 'body', 6.4, C.muted)
      put(doc, 'Certificate eligibility is assessed separately from the aggregate above.', M_X + 4, y + 17)
    } else {
      setFace(doc, 'headingBold', 7.4, C.navy)
      tracked(doc, 'OVERALL RESULT', M_X + 4, y + 7.4, 0.35)
      setFace(doc, 'headingBold', 11, outInk)
      put(doc, maneb.classification, M_X + CW - 4, y + 7.6, 'right')
    }
    y += outcomeH + 3.2 + bonus
  } else {
    // ── 3b. Internal term: CA / Exam / Total / Grade (/ Points) / Remarks ───
    const cols: Col[] = isMsce
      ? [{ label: 'Subject', w: 50, align: 'left' }, { label: 'C.A. (%)', w: 20, align: 'center' }, { label: 'Exam (%)', w: 20, align: 'center' }, { label: 'Total (%)', w: 22, align: 'center' }, { label: 'Grade', w: 16, align: 'center' }, { label: 'Points', w: 16, align: 'center' }, { label: 'Remarks', w: CW - 144, align: 'left' }]
      : [{ label: 'Subject', w: 54, align: 'left' }, { label: 'C.A. (%)', w: 22, align: 'center' }, { label: 'Exam (%)', w: 22, align: 'center' }, { label: 'Total (%)', w: 24, align: 'center' }, { label: 'Grade', w: 18, align: 'center' }, { label: 'Remarks', w: CW - 140, align: 'left' }]
    const n = Math.max(1, data.subjects.length)
    const avail = bottomLimit - y - HEAD_H - SUMMARY_H - noteH - afterResults
    rowH = Math.max(4.2, Math.min(8.4, avail / n))
    extra = Math.max(0, avail - n * rowH)
    bonus = Math.min(4.5, extra / GAP_SLOTS)
    const fs = rowH >= 6.2 ? 8 : rowH >= 5.4 ? 7.6 : 7.1
    const top = y

    tableHeader(doc, M_X, y, CW, HEAD_H)
    drawHeaderLabels(doc, cols, M_X, y, HEAD_H)
    y += HEAD_H

    data.subjects.forEach((s, i) => {
      fillColor(doc, i % 2 === 1 ? tint(C.secondary, 0.5) : C.white)
      doc.rect(M_X, y, CW, rowH, 'F')
      const cell = (k: number) => cols.slice(0, k).reduce((a, c) => a + c.w, 0)
      const mid = (k: number) => M_X + cell(k) + (cols[k]?.w ?? 0) / 2
      const ty = midY(y, rowH, fs)
      setFace(doc, 'bodyBold', fs, C.ink)
      put(doc, ellipsize(doc, s.subject, (cols[0]?.w ?? 50) - 6), M_X + 3, ty)
      setFace(doc, 'body', fs, C.neutral)
      put(doc, s.caScore != null ? s.caScore.toFixed(1) : '—', mid(1), ty, 'center')
      put(doc, s.examScore != null ? s.examScore.toFixed(1) : '—', mid(2), ty, 'center')
      setFace(doc, 'bodyBold', fs, C.ink)
      put(doc, s.total.toFixed(1), mid(3), ty, 'center')
      setFace(doc, 'headingBold', fs + 1.4, gradeInk(scaleOf.get(s.grade)))
      put(doc, s.grade, mid(4), midY(y, rowH, fs + 1.4), 'center')
      if (isMsce) {
        if (s.inAggregate) {
          fillColor(doc, tint(C.navy, 0.88))
          doc.roundedRect(mid(5) - 4, y + 0.8, 8, rowH - 1.6, 1.2, 1.2, 'F')
        }
        setFace(doc, s.inAggregate ? 'headingBold' : 'body', fs + 0.4, s.inAggregate ? C.navy : C.muted)
        put(doc, s.points != null ? String(s.points) : '—', mid(5), midY(y, rowH, fs + 0.4), 'center')
      }
      setFace(doc, 'body', fs, C.neutral)
      const rk = cols.length - 1
      put(doc, ellipsize(doc, s.remarks ?? '—', (cols[rk]?.w ?? 40) - 5), M_X + cell(rk) + 3, ty)
      strokeColor(doc, C.border)
      doc.setLineWidth(0.12)
      doc.line(M_X, y + rowH, M_X + CW, y + rowH)
      y += rowH
    })

    // summary row — what differs by track is read from the track, not typed per form
    fillColor(doc, tint(C.navy, 0.9))
    doc.rect(M_X, y, CW, SUMMARY_H, 'F')
    strokeColor(doc, C.navy)
    doc.setLineWidth(0.35)
    doc.line(M_X, y, M_X + CW, y)
    const sy = midY(y, SUMMARY_H, 8.4)
    const cell = (k: number) => cols.slice(0, k).reduce((a, c) => a + c.w, 0)
    setFace(doc, 'headingBold', 8, C.navy)
    tracked(doc, isMsce ? 'AGGREGATE' : 'OVERALL', M_X + 3, sy, 0.4)
    setFace(doc, 'body', 7.4, C.muted)
    put(doc, `${data.subjects.length} Subjects`, M_X + cell(1) - 22, sy)
    if (isMsce) {
      setFace(doc, 'headingBold', 9.2, C.navy)
      put(doc, data.aggregatePoints != null ? `${data.aggregatePoints} points` : 'Not available', M_X + cell(3) + (cols[3]?.w ?? 0) / 2, sy, 'center')
    } else {
      setFace(doc, 'headingBold', 9.2, C.ink)
      put(doc, `${data.averagePercent.toFixed(1)}%`, M_X + cell(3) + (cols[3]?.w ?? 0) / 2, sy, 'center')
      if (data.overallGrade) {
        setFace(doc, 'headingBold', 10, gradeInk(scaleOf.get(data.overallGrade)))
        put(doc, data.overallGrade, M_X + cell(4) + (cols[4]?.w ?? 0) / 2, sy, 'center')
      }
    }
    setFace(doc, 'bodyBold', 8.2, C.ink)
    put(doc, data.classPosition ? `Position: ${data.classPosition} / ${data.classTotal}` : 'Position: —', M_X + CW - 3, sy, 'right')
    y += SUMMARY_H

    // the table's own border, drawn last so row fills never cover it
    strokeColor(doc, C.rule)
    doc.setLineWidth(0.3)
    doc.roundedRect(M_X, top, CW, y - top, 1.8, 1.8, 'S')

    if (isMsce) {
      setFace(doc, 'body', 6.4, C.muted)
      const note = data.aggregatePoints != null
        ? `Aggregate = sum of the points of the ${MSCE_AGGREGATE_SUBJECT_COUNT} best subjects (range ${MSCE_AGGREGATE_BEST}–${MSCE_AGGREGATE_WORST}; lower is better); highlighted points are the subjects counted. MSCE awards no overall grade.`
        : `Aggregate not available: ${MSCE_AGGREGATE_SUBJECT_COUNT} graded subjects are required to form an MSCE aggregate.`
      put(doc, ellipsize(doc, note, CW), M_X + 1, y + 3.6)
      y += noteH
    }
    y += 3.2 + bonus
  }

  // ── 4. Attendance ──────────────────────────────────────────────────────────
  sectionLabel(doc, 'Attendance', M_X + 2, midY(y, ATT_H, 6.8), C.neutral)
  const attPct = data.totalSchoolDays > 0 ? Math.round((data.daysPresent / data.totalSchoolDays) * 100) : 0
  const stats: Array<[string, string]> = [
    ['Days present', String(data.daysPresent)],
    ['Days absent', String(data.daysAbsent)],
    ['Total days', String(data.totalSchoolDays)],
    ['Attendance rate', `${attPct}%`],
  ]
  const sx0 = M_X + 36
  const sw = (CW - 40) / stats.length
  stats.forEach(([l, v], i) => {
    const x = sx0 + i * sw
    setFace(doc, 'body', 7.6, C.muted)
    put(doc, `${l}:`, x, midY(y, ATT_H, 8))
    setFace(doc, 'bodyBold', 8.8, C.ink)
    put(doc, v, x + doc.getTextWidth(`${l}:`) + 0, midY(y, ATT_H, 8))
  })
  y += ATT_H + 3.2 + bonus

  // ── 5. Grading scale (the system's rows for this track) ───────────────────
  if (scale.length) {
    y = drawGradingScale(doc, y, scale, `${track} scale`)
    y += 3.2 + bonus
  }

  // ── 6. Promotion (annual — only once committed at Term 3) ─────────────────
  if (data.promotionStatus) {
    const pass = data.promotionStatus === 'PASS_AND_PROCEED'
    const ink = pass ? C.success : C.danger
    drawCard(doc, M_X, y, CW, PROMO_H, { fill: tint(ink, 0.92), stroke: ink, lineWidth: 0.4 })
    setFace(doc, 'headingBold', 9.5, ink)
    tracked(
      doc,
      pass
        ? `PASS AND PROCEED${data.nextClass ? ` TO ${data.nextClass.toUpperCase()}` : ''}`
        : `REPEAT ${data.student.className.toUpperCase()}`,
      PAGE_W / 2, midY(y, PROMO_H, 9.5), 0.5, 'center',
    )
    y += PROMO_H + 3.2 + bonus
  }

  // ── 7. Comments + signatures + authentication stamp ───────────────────────
  const cardW = (CW - 4) / 2
  const stampR = 10.5
  drawSignCard(doc, {
    x: M_X, y, w: cardW, h: SIGN_H, title: maneb ? 'Class teacher' : "Class teacher's comment",
    comment: maneb ? null : data.classTeacherComment, name: data.classTeacher, role: data.classTeacherTitle, stampSide: false,
  })
  drawSignCard(doc, {
    x: M_X + cardW + 4, y, w: cardW, h: SIGN_H, title: maneb ? 'Head teacher' : "Head teacher's comment",
    comment: maneb ? null : data.headTeacherComment, name: data.headTeacher, role: data.headTeacherTitle, stampSide: true,
  })
  drawStamp(doc, {
    cx: M_X + CW - stampR - 1, cy: y + SIGN_H - stampR - 1.2, r: stampR,
    schoolName: data.schoolName, place: data.schoolPlace ?? '',
    label: 'Official', date: fmtCardDate(data.issueDate, tz, 'short'), caption: 'Validated', color: C.navy,
  })

  // ── 8. Footer (pinned to the bottom margin) ───────────────────────────────
  const fy = PAGE_H - M_BOTTOM - FOOT_H + 1
  strokeColor(doc, C.border)
  doc.setLineWidth(0.25)
  doc.line(M_X, fy, M_X + CW, fy)
  /** Measured width of "Label: value" (muted label, bold ink value). */
  const labelledW = (lead: string, val: string): number => {
    setFace(doc, 'body', 7.2, C.muted)
    const lw = doc.getTextWidth(lead)
    setFace(doc, 'bodyBold', 7.2, C.ink)
    return lw + doc.getTextWidth(val)
  }
  const labelled = (lead: string, val: string, x0: number): void => {
    setFace(doc, 'body', 7.2, C.muted)
    put(doc, lead, x0, fy + 4.6)
    const lw = doc.getTextWidth(lead)
    setFace(doc, 'bodyBold', 7.2, C.ink)
    put(doc, val, x0 + lw, fy + 4.6)
  }
  const issuedLead = 'Date issued: '
  const issuedVal = fmtCardDate(data.issueDate, tz)
  const issuedW = labelledW(issuedLead, issuedVal)
  labelled(issuedLead, issuedVal, M_X)

  // right-hand mark: shorten if it would crowd the centre text
  // Right-hand end of the footer: the document reference and the page count (R11.7).
  setFace(doc, 'bodyBold', 7.2, C.ink)
  // The card is one page by design; the count is read from the document so the words can never disagree with it.
  const pageWords = `Page ${doc.getNumberOfPages()} of ${doc.getNumberOfPages()}`
  let official = `Ref: ${data.student.registrationNo} · Term ${data.term} ${data.academicYear}  ·  ${pageWords}`
  const nextLead = 'Next term begins: '
  const nextVal = data.nextTermDate ? fmtCardDate(data.nextTermDate, tz) : ''
  const nextW = nextVal ? labelledW(nextLead, nextVal) : 0
  setFace(doc, 'bodyBold', 7.2, C.ink)
  const roomForRight = CW - issuedW - nextW - 16
  if (doc.getTextWidth(official) > roomForRight) official = pageWords
  const officialShown = ellipsize(doc, official, Math.max(30, roomForRight))
  put(doc, officialShown, M_X + CW, fy + 4.6, 'right')
  if (nextVal) {
    const rightStart = M_X + CW - doc.getTextWidth(officialShown)
    const x0 = Math.min(PAGE_W / 2 - nextW / 2, rightStart - 6 - nextW)
    labelled(nextLead, nextVal, Math.max(M_X + issuedW + 6, x0))
  }

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

// ─────────────────────────────────────────────────────────────────────────────
// REPORT CARD COMMENTS (class teacher + head teacher)
// The card already READS these (see getReportCardData: the class teacher's comment is the one
// written by the class's assigned teacher, the head teacher's is the other one). This is the write
// side, so the comments can actually be entered before the cards are generated.
// ─────────────────────────────────────────────────────────────────────────────

export type ReportCommentKind = 'CLASS_TEACHER' | 'HEAD_TEACHER'

export interface ReportCommentRow {
  studentId:           string
  registrationNo:      string
  fullName:            string
  /** False when the term's results have not been computed yet, so no comment can be attached. */
  hasResults:          boolean
  classTeacherComment: string
  headTeacherComment:  string
}

export interface ReportCommentSheet {
  canClassTeacher: boolean
  canHeadTeacher:  boolean
  rows:            ReportCommentRow[]
}

const HEAD_COMMENT_ROLES = ['admin', 'high_rank']

/** Who may write which comment for a class. The class teacher is the class's assigned teacher. */
function commentRights(actor: { uid: string; role: string }, classTeacherId: string | null) {
  const isClassTeacher = !!classTeacherId && actor.uid === classTeacherId
  return {
    canClassTeacher: isClassTeacher,
    // The head's comment is any comment NOT written by the class teacher (that is how the card
    // reads it), so a class teacher cannot also write it.
    canHeadTeacher:  HEAD_COMMENT_ROLES.includes(actor.role) && !isClassTeacher,
  }
}

export async function getCommentSheet(
  classId: string,
  term: 1 | 2 | 3,
  academicYear: string,
  actor: { uid: string; role: string },
): Promise<ReportCommentSheet> {
  const cls = await prisma.class.findUnique({ where: { id: classId }, select: { teacherId: true } })
  if (!cls) throw Object.assign(new Error('Class not found.'), { status: 404 })

  const students = await prisma.student.findMany({
    where:   { classId, status: 'ACTIVE' },
    select:  { id: true, registrationNo: true, firstName: true, lastName: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })
  const termResults = await prisma.termResult.findMany({
    where:  { studentId: { in: students.map((s) => s.id) }, term, academicYear },
    select: { id: true, studentId: true },
  })
  const resultByStudent = new Map(termResults.map((r) => [r.studentId, r.id]))
  const comments = termResults.length
    ? await prisma.teacherComment.findMany({
        where:   { termResultId: { in: termResults.map((r) => r.id) } },
        orderBy: { createdAt: 'asc' },
      })
    : []

  const rows: ReportCommentRow[] = students.map((s) => {
    const termResultId = resultByStudent.get(s.id)
    const mine = comments.filter((c) => c.termResultId === termResultId)
    return {
      studentId:           s.id,
      registrationNo:      s.registrationNo,
      fullName:            `${s.firstName} ${s.lastName}`,
      hasResults:          !!termResultId,
      classTeacherComment: mine.find((c) => c.authorUid === cls.teacherId)?.comment ?? '',
      headTeacherComment:  mine.find((c) => c.authorUid !== cls.teacherId)?.comment ?? '',
    }
  })

  return { ...commentRights(actor, cls.teacherId), rows }
}

/** Save (or clear, when blank) one comment on one student's term result. */
export async function saveComment(
  input: { studentId: string; term: 1 | 2 | 3; academicYear: string; kind: ReportCommentKind; comment: string },
  actor: { uid: string; role: string },
): Promise<void> {
  const student = await prisma.student.findUnique({
    where:  { id: input.studentId },
    select: { class: { select: { teacherId: true } } },
  })
  if (!student) throw Object.assign(new Error('Student not found.'), { status: 404 })
  const classTeacherId = student.class?.teacherId ?? null

  const rights = commentRights(actor, classTeacherId)
  if (input.kind === 'CLASS_TEACHER' && !rights.canClassTeacher) {
    throw Object.assign(new Error("Only this class's teacher can write the class teacher's comment."), { status: 403 })
  }
  if (input.kind === 'HEAD_TEACHER' && !rights.canHeadTeacher) {
    throw Object.assign(new Error("Only the head teacher (high rank or admin) can write the head teacher's comment."), { status: 403 })
  }

  const termResult = await prisma.termResult.findFirst({
    where:  { studentId: input.studentId, term: input.term, academicYear: input.academicYear },
    select: { id: true },
  })
  if (!termResult) {
    throw Object.assign(new Error("This term's results have not been computed for this student yet."), { status: 409 })
  }

  const text = input.comment.trim()
  const existing = await prisma.teacherComment.findFirst({
    where: {
      termResultId: termResult.id,
      authorUid:    input.kind === 'CLASS_TEACHER' ? actor.uid : { not: classTeacherId ?? '' },
    },
    orderBy: { createdAt: 'asc' },
  })

  if (!text) {
    if (existing) await prisma.teacherComment.delete({ where: { id: existing.id } })
  } else if (existing) {
    await prisma.teacherComment.update({ where: { id: existing.id }, data: { comment: text, authorUid: actor.uid } })
  } else {
    await prisma.teacherComment.create({ data: { termResultId: termResult.id, authorUid: actor.uid, comment: text } })
  }

  await auditService.log({
    action: 'exams.reportComment.save', entityType: 'TeacherComment', entityId: termResult.id,
    actorUid: actor.uid, actorRole: actor.role,
    metadata: { studentId: input.studentId, term: input.term, academicYear: input.academicYear, kind: input.kind, cleared: !text },
  })
}
