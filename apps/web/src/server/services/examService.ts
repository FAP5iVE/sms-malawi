/**
 * apps/web/src/server/services/examService.ts
 *
 * MANEB Grading (MSCE — Form 4):
 *   Grade 1: 80–100% | Grade 2: 70–79% | Grade 3: 60–69%
 *   Grade 4: 50–59%  | Grade 5: 40–49% | Grade 6: 35–39%
 *   Grade 7: 30–34%  | Grade 8: 25–29% | Grade 9: 0–24%
 *   Pass = Grade 1–6 (35%+)
 *
 * JCE Grading (Form 2):
 *   Grade A: 80–100% | B: 70–79% | C: 60–69%
 *   D: 50–59% | E: 35–49% | F: 0–34% (fail)
 *   Pass = A–E (35%+)
 *
 * Internal Exams:
 *   Form 1 & 2 → JCE scale (A–F, pass = E or above, 35%+)
 *   Form 3 & 4 → MSCE scale (1–9, pass = Grade 6 or above, 35%+)
 * Source: maneb.mw — verify before production.
 */
import { prisma }            from '@/lib/prisma'          // ← WAS '../lib/prisma'
import { logger }            from '@/lib/logger'          // ← WAS '../lib/logger'
import { checkBalanceGate } from '@/server/services/feeService'   // ← WAS './feeService'
import { uploadFile, STORAGE_BUCKETS } from '@/lib/storage'  // ← WAS '../lib/storage'
import puppeteer            from 'puppeteer-core'          // ← WAS 'puppeteer' (see chromium note)
import chromium             from '@sparticuz/chromium'
import type { CreateExamInput, BulkMarkEntryInput, CreateManebRecordInput } from '@shared/schemas/exam'
import type { Decimal } from '@prisma/client/runtime/library'

// ─── GRADING CONSTANTS (official MANEB standards) ────────
const MSCE_GRADES = [
  { min: 80, grade: '1', pass: true  },
  { min: 70, grade: '2', pass: true  },
  { min: 60, grade: '3', pass: true  },
  { min: 50, grade: '4', pass: true  },
  { min: 40, grade: '5', pass: true  },
  { min: 35, grade: '6', pass: true  },
  { min: 30, grade: '7', pass: false },
  { min: 25, grade: '8', pass: false },
  { min:  0, grade: '9', pass: false },
]

const JCE_GRADES = [
  { min: 80, grade: 'A', pass: true  },
  { min: 70, grade: 'B', pass: true  },
  { min: 60, grade: 'C', pass: true  },
  { min: 50, grade: 'D', pass: true  },
  { min: 35, grade: 'E', pass: true  },
  { min:  0, grade: 'F', pass: false },
]

// Internal exams: Form 1 & 2 use JCE grading (A–F); Form 3 & 4 use MSCE grading (1–9)
function calcGrade(percentage: number, examType: string, classForm?: number): { grade: string; pass: boolean } {
  let table
  if (examType === 'MANEB_MSCE') {
    table = MSCE_GRADES
  } else if (examType === 'MANEB_JCE') {
    table = JCE_GRADES
  } else {
    // Internal exams: delegate to JCE scale for Forms 1–2, MSCE scale for Forms 3–4
    table = (classForm !== undefined && classForm >= 3) ? MSCE_GRADES : JCE_GRADES
  }
  return table.find((g) => percentage >= g.min) ?? { grade: 'F', pass: false }
}

function toNumber(v: Decimal | number | null | undefined): number {
  if (v === null || v === undefined) return 0
  return typeof v === 'number' ? v : Number(v)
}

// ─── CREATE EXAM ─────────────────────────────────────────
export async function createExam(data: CreateExamInput, actorUid: string) {
  const exam = await prisma.exam.create({
    data: { ...data, date: new Date(data.date), createdByUid: actorUid },
    include: { class: { select: { name: true, form: true } } },
  })
  logger.info({ event: 'exam.create', examId: exam.id, actorUid })
  return exam
}

export async function listExams(classId: string, academicYear: string, term: number) {
  return prisma.exam.findMany({
    where: { classId, academicYear, term },
    include: { _count: { select: { marks: true } } },
    orderBy: { date: 'asc' },
  })
}

// ─── ENTER MARKS (bulk upsert) ────────────────────────────
export async function enterMarks(data: BulkMarkEntryInput, actorUid: string) {
  const { entries, isDraft } = data
  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: entries[0]!.examId } })
  const max = toNumber(exam.maxMark)
  for (const e of entries) {
    if (e.mark !== undefined && e.mark > max)
      throw new Error(`Mark ${e.mark} exceeds maximum ${max} for exam ${exam.title}`)
  }
  const upserted = await prisma.$transaction(
    entries.map((e) =>
      prisma.examMark.upsert({
        where: { examId_studentId: { examId: e.examId, studentId: e.studentId } },
        create: { ...e, mark: e.mark ?? null, comment: e.comment ?? null, enteredByUid: actorUid, isDraft },
        update: { mark: e.mark ?? null, absent: e.absent ?? false, comment: e.comment ?? null, isDraft, enteredByUid: actorUid },
      })
    )
  )
  logger.info({ event: 'marks.enter', examId: entries[0]!.examId, count: entries.length, isDraft, actorUid })
  return upserted
}

// ─── FINALIZE MARKS ──────────────────────────────────────
export async function finalizeMarks(examId: string, actorUid: string) {
  const exam = await prisma.exam.findUniqueOrThrow({
    where: { id: examId },
    include: { class: { include: { students: { where: { status: 'ACTIVE' } } } } },
  })
  const markedIds = (await prisma.examMark.findMany({ where: { examId }, select: { studentId: true } })).map((m) => m.studentId)
  const missing = exam.class.students.filter((s) => !markedIds.includes(s.id))
  if (missing.length > 0)
    throw new Error(`Missing marks for ${missing.length} student(s). Enter all marks first.`)
  await prisma.examMark.updateMany({ where: { examId }, data: { isDraft: false, finalizedAt: new Date() } })
  await prisma.exam.update({ where: { id: examId }, data: { status: 'MARKS_FINAL' } })
  logger.info({ event: 'marks.finalized', examId, actorUid })
  return { finalized: true, examId }
}

export async function approveResults(examId: string, actorUid: string) {
  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId } })
  if (exam.status !== 'MARKS_FINAL') throw new Error('Marks must be finalized before approval.')
  await prisma.exam.update({ where: { id: examId }, data: { status: 'RESULTS_APPROVED' } })
  logger.info({ event: 'results.approved', examId, actorUid })
}

export async function releaseResults(examId: string, actorUid: string) {
  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId } })
  if (exam.status !== 'RESULTS_APPROVED') throw new Error('Results must be approved before release.')
  await prisma.exam.update({ where: { id: examId }, data: { status: 'RESULTS_RELEASED' } })
  logger.info({ event: 'results.released', examId, actorUid })
}

export async function unlockMarks(examId: string, actorUid: string) {
  await prisma.exam.update({ where: { id: examId }, data: { status: 'MARKS_PENDING' } })
  await prisma.examMark.updateMany({ where: { examId }, data: { isDraft: true } })
  logger.info({ event: 'marks.unlocked', examId, actorUid })
}

// ─── GET STUDENT RESULTS — FEE GATE ENFORCED ─────────────
export async function getStudentResults(studentId: string, academicYear: string, term: number) {
  // CRITICAL: Never bypass this check. 403 means fees unpaid.
  const gateOpen = await checkBalanceGate(studentId, term, academicYear)
  if (!gateOpen) {
    const err = new Error('Outstanding fee balance. Pay fees to view results.') as Error & { status: number }
    err.status = 403
    throw err
  }
  return prisma.termResult.findFirst({ where: { studentId, academicYear, term } })
}

// ─── COMPUTE TERM RESULTS ────────────────────────────────
export async function computeTermResults(classId: string, academicYear: string, term: number, actorUid: string) {
  const [students, classRecord] = await Promise.all([
    prisma.student.findMany({ where: { classId, status: 'ACTIVE' } }),
    prisma.class.findUniqueOrThrow({ where: { id: classId }, select: { form: true } }),
  ])
  const classForm: number = classRecord.form // e.g. 1, 2, 3, or 4
  const exams = await prisma.exam.findMany({
    where: { classId, academicYear, term, status: 'RESULTS_RELEASED' },
    include: { marks: true },
  })
  const results: { studentId: string; average: number }[] = []

  for (const student of students) {
    const subjectMap: Record<string, { marks: number[] }> = {}
    for (const exam of exams) {
      const mark = exam.marks.find((m) => m.studentId === student.id)
      if (!subjectMap[exam.subject]) subjectMap[exam.subject] = { marks: [] }
      if (mark && !mark.absent && mark.mark !== null)
        subjectMap[exam.subject]!.marks.push((toNumber(mark.mark) / toNumber(exam.maxMark)) * 100)
    }
    const subjectResults: Record<string, { average: number; grade: string; pass: boolean }> = {}
    let totalAvg = 0, subjectCount = 0
    for (const [subject, data] of Object.entries(subjectMap)) {
      const avg = data.marks.length > 0 ? data.marks.reduce((a, b) => a + b, 0) / data.marks.length : 0
      const { grade, pass } = calcGrade(avg, 'INTERNAL', classForm)
      subjectResults[subject] = { average: Math.round(avg * 100) / 100, grade, pass }
      totalAvg += avg; subjectCount++
    }
    const overallAvg = subjectCount > 0 ? totalAvg / subjectCount : 0
    const { grade, pass } = calcGrade(overallAvg, 'INTERNAL', classForm)
    await prisma.termResult.upsert({
      where: { studentId_academicYear_term: { studentId: student.id, academicYear, term } },
      create: { studentId: student.id, classId, academicYear, term, totalMark: subjectCount * overallAvg, average: Math.round(overallAvg * 100) / 100, grade, passStatus: pass, subjectResults },
      update: { average: Math.round(overallAvg * 100) / 100, grade, passStatus: pass, subjectResults },
    })
    results.push({ studentId: student.id, average: overallAvg })
  }

  results.sort((a, b) => b.average - a.average)
  await prisma.$transaction(
    results.map((r, i) => prisma.termResult.update({
      where: { studentId_academicYear_term: { studentId: r.studentId, academicYear, term } },
      data: { position: i + 1 },
    }))
  )
  logger.info({ event: 'term_results.computed', classId, academicYear, term, count: results.length, actorUid })
  return { computed: results.length }
}

// ─── PROMOTION ENGINE ────────────────────────────────────
export async function runPromotion(
  academicYear: string,
  actorUid: string,
  rules = { minimumAverage: 50, requiredSubjectPasses: 5, passMark: 50 }
) {
  const termResults = await prisma.termResult.findMany({ where: { academicYear, term: 3 } })
  const promoted: string[] = [], repeating: string[] = []
  for (const result of termResults) {
    const subjects = result.subjectResults as Record<string, { pass: boolean }>
    const passes = Object.values(subjects).filter((s) => s.pass).length
    const ok = toNumber(result.average) >= rules.minimumAverage && passes >= rules.requiredSubjectPasses
    if (ok) promoted.push(result.studentId); else repeating.push(result.studentId)
    await prisma.annualResult.upsert({
      where: { studentId_academicYear: { studentId: result.studentId, academicYear } },
      create: { studentId: result.studentId, classId: result.classId, academicYear, annualAverage: result.average, finalGrade: result.grade, passStatus: ok, promoted: ok },
      update: { passStatus: ok, promoted: ok },
    })
  }
  logger.info({ event: 'promotion.run', academicYear, promoted: promoted.length, repeating: repeating.length, actorUid })
  return { promoted: promoted.length, repeating: repeating.length }
}

// ─── REPORT CARD PDF ─────────────────────────────────────
async function launchBrowser() {
  if (process.env.NODE_ENV !== 'production') {
    return puppeteer.launch({
      executablePath: process.platform === 'win32'
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        : process.platform === 'darwin'
          ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
          : '/usr/bin/google-chrome',
      headless: true,
      args: ['--no-sandbox'],
    })
  }
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
  })
}

export async function generateReportCard(studentId: string, academicYear: string, term: number): Promise<string> {
  const [student, result] = await prisma.$transaction([
    prisma.student.findUniqueOrThrow({ where: { id: studentId }, include: { class: true } }),
    prisma.termResult.findFirstOrThrow({ where: { studentId, academicYear, term } }),
  ])
  const browser = await launchBrowser()
  const page = await browser.newPage()
  await page.setContent(buildReportCardHtml(student, result, academicYear, term), { waitUntil: 'load' })
  const pdf = Buffer.from(await page.pdf({ format: 'A4', printBackground: true }))
  await browser.close()
  const filename = `report-card-${studentId}-${academicYear.replace('/','-')}-term${term}.pdf`
  const fileId = await uploadFile(STORAGE_BUCKETS.REPORT_CARDS, pdf, filename, 'application/pdf')
  await prisma.termResult.updateMany({ where: { studentId, academicYear, term }, data: { reportCardKey: fileId, releasedAt: new Date() } })
  logger.info({ event: 'report_card.generated', studentId, academicYear, term, fileId })
  return fileId
}

function buildReportCardHtml(
  student: { firstName: string; lastName: string; registrationNo: string; class?: { name: string } | null },
  result: { average: unknown; grade: string; position?: number | null; passStatus: boolean; subjectResults: unknown; teacherComment?: string | null; headComment?: string | null },
  academicYear: string,
  term: number
): string {
  const avg = toNumber(result.average as number)
  const subjects = result.subjectResults as Record<string, { average: number; grade: string; pass: boolean }>
  const subjectRows = Object.entries(subjects).map(([subj, data]) => `
    <tr><td>${subj}</td><td>${data.average.toFixed(1)}%</td><td>${data.grade}</td>
    <td style="color:${data.pass ? 'green' : 'red'}">${data.pass ? 'Pass' : 'Fail'}</td></tr>`).join('')
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <style>
    body{font-family:Arial,sans-serif;padding:30px;color:#1E293B;}
    .header{text-align:center;border-bottom:3px solid #0F2744;padding-bottom:16px;margin-bottom:20px;}
    .school-name{font-size:22px;font-weight:bold;color:#0F2744;}
    .report-title{font-size:16px;color:#0E8A6A;margin-top:4px;}
    .student-info{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;padding:14px;background:#F8FAFC;border-radius:8px;}
    .info-label{font-size:11px;text-transform:uppercase;color:#94A3B8;}
    .info-value{font-weight:600;color:#1E293B;}
    table{width:100%;border-collapse:collapse;margin-bottom:20px;}
    th{background:#0F2744;color:white;padding:8px 12px;text-align:left;font-size:12px;}
    td{padding:8px 12px;border-bottom:1px solid #E2E8F0;font-size:13px;}
    .summary{background:#0E8A6A;color:white;padding:14px;border-radius:8px;display:flex;justify-content:space-around;}
    .sum-item{text-align:center;}
    .sum-val{font-size:22px;font-weight:bold;}
    .sum-lbl{font-size:11px;opacity:.8;}
    .status{font-size:15px;font-weight:bold;text-align:center;margin-top:16px;padding:10px;border-radius:6px;background:${result.passStatus ? '#DCFCE7' : '#FEE9E6'};color:${result.passStatus ? '#15803D' : '#B91C1C'};}
    .comment-box{border:1px solid #E2E8F0;border-radius:6px;padding:10px;min-height:50px;margin-bottom:10px;}
  </style></head><body>
  <div class="header">
    <div class="school-name">SMS Malawi — School Management System</div>
    <div class="report-title">Term ${term} Report Card — ${academicYear}</div>
  </div>
  <div class="student-info">
    <div><div class="info-label">Student Name</div><div class="info-value">${student.firstName} ${student.lastName}</div></div>
    <div><div class="info-label">Registration No</div><div class="info-value">${student.registrationNo}</div></div>
    <div><div class="info-label">Class</div><div class="info-value">${student.class?.name ?? '—'}</div></div>
    <div><div class="info-label">Position</div><div class="info-value">${result.position ?? '—'}</div></div>
  </div>
  <table><thead><tr><th>Subject</th><th>Average</th><th>Grade</th><th>Result</th></tr></thead>
  <tbody>${subjectRows}</tbody></table>
  <div class="summary">
    <div class="sum-item"><div class="sum-val">${avg.toFixed(1)}%</div><div class="sum-lbl">Overall Average</div></div>
    <div class="sum-item"><div class="sum-val">${result.grade}</div><div class="sum-lbl">Grade</div></div>
    <div class="sum-item"><div class="sum-val">${result.position ?? '—'}</div><div class="sum-lbl">Position</div></div>
  </div>
  <div class="status">${result.passStatus ? '✓ Pass and Proceed' : '✗ Repeat Class'}</div>
  <div style="margin-top:20px">
    <h4 style="margin-bottom:8px;color:#0F2744">Comments</h4>
    <div style="font-size:11px;color:#94A3B8;margin-bottom:4px">Class Teacher</div>
    <div class="comment-box">${result.teacherComment ?? ''}</div>
    <div style="font-size:11px;color:#94A3B8;margin-bottom:4px">Head Teacher</div>
    <div class="comment-box">${result.headComment ?? ''}</div>
  </div>
  </body></html>`
}

// ─── MANEB ────────────────────────────────────────────────
export async function createManebRecord(data: CreateManebRecordInput, actorUid: string) {
  const record = await prisma.manebRecord.create({ 
            data: {
      ...data,
      overallGrade: data.overallGrade ?? null, 
    },
   })
  logger.info({ event: 'maneb.record.create', recordId: record.id, actorUid })
  return record
}

export async function listManebRecords(academicYear: string, examType?: 'JCE' | 'MSCE') {
  return prisma.manebRecord.findMany({
    where: { academicYear, ...(examType ? { examType } : {}) },
    orderBy: { candidateNo: 'asc' },
  })
}

// ─── ANALYTICS ───────────────────────────────────────────
export async function getClassAnalytics(classId: string, academicYear: string, term: number) {
  const results = await prisma.termResult.findMany({ where: { classId, academicYear, term } })
  if (results.length === 0) return null
  const passed = results.filter((r) => r.passStatus).length
  const averages = results.map((r) => toNumber(r.average))
  const classAvg = averages.reduce((a, b) => a + b, 0) / averages.length
  const top10 = [...results].sort((a, b) => toNumber(b.average) - toNumber(a.average)).slice(0, 10)
  return {
    totalStudents: results.length,
    passRate: Math.round((passed / results.length) * 100),
    classAverage: Math.round(classAvg * 100) / 100,
    top10: top10.map((r) => ({ studentId: r.studentId, average: toNumber(r.average), grade: r.grade, position: r.position })),
  }
}