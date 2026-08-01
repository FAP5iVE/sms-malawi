/**
 * apps/web/src/server/services/examService.ts
 *
 * [CHANGE TYPE]: MAJOR REWRITE of four areas within the file (unrelated
 *   exports such as exam CRUD basics, approveResults/releaseResults/
 *   unlockMarks/getStudentResults/getClassAnalytics/MANEB are unaffected).
 * [R-PHASE]: R7 — Academics III: Exam Pipeline Repair & Grading Engine
 *   Unification
 * [PURPOSE]:
 *   (1) Removed the private calcGrade() function and the MSCE_GRADES/
 *   JCE_GRADES constants entirely. computeTermResults() now imports and
 *   awaits gradeService.ts's exported, async, database-backed calcGrade()
 *   — this is the single change that makes the Phase 1B grading-settings
 *   admin UI finally affect real computed results; previously that panel
 *   was decorative, since every real result was computed through this
 *   file's own hardcoded, pre-gradeService table.
 *   (2) enterMarks(): now advances Exam.status through IN_PROGRESS →
 *   MARKS_DRAFT as marks are entered, not only ExamMark.isDraft — an exam
 *   previously stayed frozen at SCHEDULED forever regardless of real
 *   marks-entry progress, since this function never touched Exam.status
 *   at all. Only advances forward (SCHEDULED/IN_PROGRESS/MARKS_PENDING →
 *   MARKS_DRAFT); never regresses an exam already past draft-marks entry.
 *   (3) finalizeMarks(): now validates mark *validity*, not merely row
 *   *existence* — rejects finalization if any ExamMark row has
 *   `mark: null && absent: false`. The previous check only confirmed a
 *   row existed per active student, which an uninitialized client-side
 *   entry could satisfy without ever containing a real mark value.
 *   (4) Removed the PDF report-card generation function and its private
 *   HTML-building helper and browser-launcher, and the standalone student
 *   promotion-engine function, entirely — confirmed duplicate/overlapping
 *   implementations of logic that belongs solely to reportCardService.ts
 *   (Phase 3B) and promotionService.ts (Phase 3C) respectively. Leaving
 *   both implementations live was the direct cause of the
 *   two-independent-PDF-pipelines conflict Phase 3A flagged. Their now-dead
 *   imports (puppeteer-core, @sparticuz/chromium, uploadFile,
 *   STORAGE_BUCKETS) are removed with them — both packages remain genuine
 *   dependencies (receiptService.ts has its own independent puppeteer
 *   usage; reportCardService.ts uses jsPDF instead), only this file's
 *   import lines are dead. This file's MANEB record management exports are
 *   *not* duplicates and are *not* removed — they are this file's correct,
 *   sole implementation.
 *   Consequential (necessary to keep the build passing once the standalone
 *   promotion function above is removed): exams.ts's POST /promote route —
 *   its only caller — is deleted outright rather than repointed, since a
 *   complete, correct, already-wired implementation already exists at the
 *   dedicated /promotion route (server/routes/promotion.ts →
 *   promotionService.ts's own export of the same name) with zero relation
 *   to the broken route; keeping both would reintroduce the exact
 *   duplicate-implementation problem this phase removes.
 *   Consequential (needed for exams/page.tsx's explicit "All classes"
 *   fix): the exam-listing function's classId parameter is now optional,
 *   building the Prisma filter conditionally, so selecting "All classes"
 *   can run one aggregated query instead of the route always requiring a
 *   class.
 *   Consequential (needed for MarksEntrySheet.tsx's explicit
 *   draft-restore fix): added a new exported function to read back
 *   previously-saved ExamMark rows for an exam — none existed before.
 *   Consequential (explicit follow-up instruction — the internal exam
 *   pipeline must never be used for a term MANEB itself grades):
 *   createExam() now rejects creating an END_TERM exam for Form 2 Term 3
 *   or Form 4 Term 3 (the JCE/MSCE national sittings — see
 *   @shared/constants/malawi's MANEB_NATIONAL_FORM_TERM) and rejects
 *   creating a MANEB_JCE/MANEB_MSCE-typed exam at all, at any form/term —
 *   those two enum values exist on Exam.type but MANEB results must only
 *   ever be recorded via ManebRecord, never through ExamMark/
 *   computeTermResults(). computeTermResults() itself now refuses to run
 *   for a MANEB national term for the same reason, even if an Exam row
 *   for one exists from before this guard was added.
 *   Added `import 'server-only'`; removed the leftover
 *   `// ← WAS '../lib/prisma'`-style refactor-artifact comments on every
 *   import line.
 * [DEPENDS ON]: apps/web/src/server/services/gradeService.ts (calcGrade),
 *   @shared/constants/malawi (getManebExamType)
 *
 * [R8 ADDENDUM — Academics IV: Report Cards, Transcripts, Promotion & Risk
 *   Assessment]: listExams() now also returns className/totalStudents/
 *   feeBlockedCount/marksEntered per exam — ResultsReleaseWorkflow.tsx
 *   needs these for its per-exam release-readiness summary and previously
 *   had no source for any of them.
 */
import 'server-only'

import { prisma }           from '@/lib/prisma'
import { logger }           from '@/lib/logger'
import { checkBalanceGate } from '@/server/services/feeService'
import { calcGrade, computeManebAggregate } from '@/server/services/gradeService'
import { getManebExamType } from '@shared/constants/malawi'
import * as classService    from '@/server/services/classService'
import * as auditService    from '@/server/services/auditService'
import * as announcementService from '@/server/services/announcementService'
import type { UserRole }    from '@shared/types/roles'
import type { CreateExamInput, UpdateExamInput, BulkMarkEntryInput, CreateManebRecordInput } from '@shared/schemas/exam'
import type { Decimal } from '@prisma/client/runtime/library'
import { Prisma, type ExamStatus } from '@prisma/client'

function toNumber(v: Decimal | number | null | undefined): number {
  if (v === null || v === undefined) return 0
  return typeof v === 'number' ? v : Number(v)
}

// ─── EXAM ACTOR + SUBJECT-OWNERSHIP GUARD (AC-2..AC-6) ───
// Every mutating/oversight entry point now takes the acting user's uid AND
// role. admin / high_rank / exam_officer oversee every class and subject and
// are not subject-scoped; a teacher (academic) may act on an exam only for
// the (classId, subject) pairs assigned to them in ClassSubjectAssignment.
export type ExamActor = { uid: string; role: UserRole }

const OVERSIGHT_ROLES: readonly UserRole[] = ['admin', 'high_rank', 'exam_officer']

async function assertOwnsSubject(
  actor: ExamActor, classId: string, subject: string, academicYear: string,
): Promise<void> {
  if (OVERSIGHT_ROLES.includes(actor.role)) return
  const owns = await classService.isTeacherAssignedToSubject(actor.uid, classId, subject, academicYear)
  if (!owns) {
    throw Object.assign(
      new Error(`You are not assigned to teach ${subject} in this class, so you cannot manage its exams or marks.`),
      { status: 403 },
    )
  }
}

// ─── CREATE EXAM ─────────────────────────────────────────
// Form 2 Term 3 (JCE) and Form 4 Term 3 (MSCE) are MANEB national
// examinations — the school does not set, mark, or grade them, so no
// internal Exam of type END_TERM may be created for those slots; results
// for them arrive via ManebRecord (createManebRecord()) instead. The two
// MANEB_* exam types are reserved for that same import path and may never
// be created through this internal pipeline at all, regardless of
// form/term — creating one here would let MANEB marks flow through
// ExamMark/computeTermResults(), the exact parallel-grading-path this
// phase closes.
export async function createExam(data: CreateExamInput, actor: ExamActor) {
  if (data.type === 'MANEB_JCE' || data.type === 'MANEB_MSCE') {
    throw new Error(
      `${data.type === 'MANEB_JCE' ? 'JCE' : 'MSCE'} results come from MANEB, not internal marks entry. Record them via the MANEB panel (createManebRecord) once MANEB releases results.`
    )
  }

  const targetClass = await prisma.class.findUniqueOrThrow({ where: { id: data.classId }, select: { form: true } })
  const manebType = getManebExamType(targetClass.form, data.term)
  if (manebType && data.type === 'END_TERM') {
    throw new Error(
      `Form ${targetClass.form} Term ${data.term} is the national ${manebType} examination, administered by MANEB — the school does not set an internal end-of-term exam for this slot. Record results via the MANEB panel once MANEB releases them.`
    )
  }

  // AC-4: a teacher may schedule an exam only for a (class, subject) they are
  // assigned to; oversight roles bypass. (MANEB guards above run first.)
  await assertOwnsSubject(actor, data.classId, data.subject, data.academicYear)

  const exam = await prisma.exam.create({
    data: { ...data, date: new Date(data.date), createdByUid: actor.uid },
    include: { class: { select: { name: true, form: true } } },
  })
  await auditService.log({
    action: 'exam.created', entityType: 'Exam', entityId: exam.id,
    actorUid: actor.uid, actorRole: actor.role,
    metadata: { after: { classId: exam.classId, subject: exam.subject, type: exam.type, term: exam.term } },
  })
  logger.info({ event: 'exam.create', examId: exam.id, actorUid: actor.uid })
  return exam
}

// classId is optional — omitted entirely, the query aggregates across
// every class for the given academicYear/term (the exams list page's
// "All classes…" filter, previously disabled outright rather than
// supported by this function).
// classId is optional — omitted entirely, the query aggregates across
// every class for the given academicYear/term (the exams list page's
// "All classes…" filter, previously disabled outright rather than
// supported by this function). Also returns className/totalStudents/
// feeBlockedCount/marksEntered — ResultsReleaseWorkflow.tsx (R8) needs
// these to render its per-exam release-readiness summary; the underlying
// joins were straightforward additions to a query that already had to
// touch Class and ExamMark.
export async function listExams(classId: string | undefined, academicYear: string, term: number, actor: ExamActor) {
  const where: Prisma.ExamWhereInput = { academicYear, term, ...(classId ? { classId } : {}) }

  // AC-3: a student sees only their OWN class's RESULTS_RELEASED exams.
  if (actor.role === 'student') {
    const me = await prisma.student.findFirst({ where: { firebaseUid: actor.uid }, select: { classId: true } })
    if (!me?.classId) return []
    where.classId = me.classId
    where.status = 'RESULTS_RELEASED'
  }

  const exams = await prisma.exam.findMany({
    where,
    include: {
      class: { select: { name: true } },
      _count: { select: { marks: true } },
    },
    orderBy: { date: 'asc' },
  })

  // AC-3/AC-6: a teacher sees exams for their assigned (class, subject) pairs,
  // plus any RESULTS_RELEASED exam school-wide (post-release they may view all
  // classes' results). Oversight roles see everything.
  let visible = exams
  if (actor.role === 'academic') {
    const assigned = await classService.getTeacherSubjectAssignments(actor.uid, academicYear)
    visible = exams.filter((e) => assigned.has(`${e.classId}|${e.subject}`) || e.status === 'RESULTS_RELEASED')
  }

  return Promise.all(
    visible.map(async (exam) => {
      const [totalStudents, feeBlockedCount] = await Promise.all([
        prisma.student.count({ where: { classId: exam.classId, status: 'ACTIVE' } }),
        prisma.invoice.count({
          where: {
            academicYear,
            term,
            balance: { gt: 0 },
            student: { classId: exam.classId, status: 'ACTIVE' },
          },
        }),
      ])
      return {
        ...exam,
        className:     exam.class.name,
        totalStudents,
        feeBlockedCount,
        marksEntered:  exam._count.marks,
      }
    }),
  )
}

// ─── UPDATE / DELETE EXAM ────────────────────────────────
// Editing an exam once its results are finalized/approved/released is
// blocked (marks/results already derive from it). Editing is subject-
// ownership-scoped, and any change to classId/subject/term/type re-runs the
// MANEB guard so an exam cannot be mutated into a national MANEB slot (or a
// MANEB_* type) that createExam() would have rejected. Deleting is likewise
// blocked once marks exist or results are locked.
const EXAM_EDIT_LOCKED_STATUSES: ExamStatus[] = ['MARKS_FINAL', 'RESULTS_APPROVED', 'RESULTS_RELEASED']

export async function updateExam(id: string, data: UpdateExamInput, actor: ExamActor) {
  const existing = await prisma.exam.findUniqueOrThrow({
    where:  { id },
    select: { classId: true, subject: true, academicYear: true, term: true, status: true, type: true },
  })

  if (EXAM_EDIT_LOCKED_STATUSES.includes(existing.status)) {
    throw Object.assign(
      new Error('This exam\u2019s results are finalized and it can no longer be edited.'),
      { status: 409 },
    )
  }

  // Ownership on the current (class, subject).
  await assertOwnsSubject(actor, existing.classId, existing.subject, existing.academicYear)

  const nextClassId = data.classId ?? existing.classId
  const nextSubject = data.subject ?? existing.subject
  const nextYear    = data.academicYear ?? existing.academicYear
  const nextTerm    = data.term ?? existing.term
  const nextType    = data.type ?? existing.type

  // Moving to a different (class, subject) requires ownership of the target too.
  if (nextClassId !== existing.classId || nextSubject !== existing.subject) {
    await assertOwnsSubject(actor, nextClassId, nextSubject, nextYear)
  }

  // MANEB re-guard.
  if (nextType === 'MANEB_JCE' || nextType === 'MANEB_MSCE') {
    throw new Error(`${nextType === 'MANEB_JCE' ? 'JCE' : 'MSCE'} results come from MANEB, not internal marks entry — record them via the MANEB panel.`)
  }
  const targetClass = await prisma.class.findUniqueOrThrow({ where: { id: nextClassId }, select: { form: true } })
  const manebType = getManebExamType(targetClass.form, nextTerm)
  if (manebType && nextType === 'END_TERM') {
    throw new Error(`Form ${targetClass.form} Term ${nextTerm} is the national ${manebType} examination, administered by MANEB — the school does not set an internal end-of-term exam for this slot.`)
  }

  const exam = await prisma.exam.update({
    where: { id },
    data: {
      ...(data.type          !== undefined ? { type: data.type }                   : {}),
      ...(data.subject       !== undefined ? { subject: data.subject }             : {}),
      ...(data.classId       !== undefined ? { classId: data.classId }             : {}),
      ...(data.title         !== undefined ? { title: data.title }                 : {}),
      ...(data.date          !== undefined ? { date: new Date(data.date) }         : {}),
      ...(data.timeStart     !== undefined ? { timeStart: data.timeStart }         : {}),
      ...(data.timeEnd       !== undefined ? { timeEnd: data.timeEnd }             : {}),
      ...(data.venue         !== undefined ? { venue: data.venue }                 : {}),
      ...(data.maxMark       !== undefined ? { maxMark: data.maxMark }             : {}),
      ...(data.weightPercent !== undefined ? { weightPercent: data.weightPercent } : {}),
      ...(data.academicYear  !== undefined ? { academicYear: data.academicYear }   : {}),
      ...(data.term          !== undefined ? { term: data.term }                   : {}),
    },
  })
  await auditService.log({
    action: 'exam.updated', entityType: 'Exam', entityId: id,
    actorUid: actor.uid, actorRole: actor.role,
    metadata: { before: { classId: existing.classId, subject: existing.subject, term: existing.term, type: existing.type }, after: { classId: exam.classId, subject: exam.subject, term: exam.term, type: exam.type } },
  })
  logger.info({ event: 'exam.edited', examId: id, actorUid: actor.uid })
  return exam
}

export async function deleteExam(id: string, actor: ExamActor) {
  const existing = await prisma.exam.findUniqueOrThrow({
    where:  { id },
    select: { classId: true, subject: true, academicYear: true, status: true, _count: { select: { marks: true } } },
  })

  if (EXAM_EDIT_LOCKED_STATUSES.includes(existing.status) || existing._count.marks > 0) {
    throw Object.assign(
      new Error('This exam has marks or released results and cannot be deleted.'),
      { status: 409 },
    )
  }

  await assertOwnsSubject(actor, existing.classId, existing.subject, existing.academicYear)
  await prisma.exam.delete({ where: { id } })
  await auditService.log({
    action: 'exam.deleted', entityType: 'Exam', entityId: id,
    actorUid: actor.uid, actorRole: actor.role,
    metadata: { before: { classId: existing.classId, subject: existing.subject } },
  })
  logger.info({ event: 'exam.deleted', examId: id, actorUid: actor.uid })
  return { success: true }
}

// ─── ENTER MARKS (bulk upsert) ────────────────────────────

// Only these statuses may advance to MARKS_DRAFT as a result of marks
// being entered — an exam already past draft-marks entry (MARKS_FINAL and
// beyond) is never regressed by a later enterMarks() call.
const ADVANCEABLE_TO_MARKS_DRAFT: ExamStatus[] = ['SCHEDULED', 'IN_PROGRESS', 'MARKS_PENDING']

// Once marks are finalized (MARKS_FINAL and beyond) they are locked — a
// teacher can view but not re-enter them (AC-5). Correcting a finalized mark
// is a review-stage action for exam_officer/high_rank (a later phase), not a
// silent re-entry through this path.
const MARKS_LOCKED_STATUSES: ExamStatus[] = ['MARKS_FINAL', 'RESULTS_APPROVED', 'RESULTS_RELEASED']

export async function enterMarks(data: BulkMarkEntryInput, actor: ExamActor) {
  const { entries, isDraft } = data
  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: entries[0]!.examId } })

  // AC-2: only the assigned subject teacher (or an oversight role) may enter.
  await assertOwnsSubject(actor, exam.classId, exam.subject, exam.academicYear)

  // AC-5: no edits after marks are finalized.
  if (MARKS_LOCKED_STATUSES.includes(exam.status)) {
    throw Object.assign(
      new Error('Marks for this exam are finalized and can no longer be edited.'),
      { status: 409 },
    )
  }

  const max = toNumber(exam.maxMark)
  for (const e of entries) {
    if (e.mark !== undefined && e.mark > max)
      throw new Error(`Mark ${e.mark} exceeds maximum ${max} for exam ${exam.title}`)
  }
  const upserted = await prisma.$transaction(
    entries.map((e) =>
      prisma.examMark.upsert({
        where: { examId_studentId: { examId: e.examId, studentId: e.studentId } },
        create: { ...e, mark: e.mark ?? null, comment: e.comment ?? null, enteredByUid: actor.uid, isDraft },
        update: { mark: e.mark ?? null, absent: e.absent ?? false, comment: e.comment ?? null, isDraft, enteredByUid: actor.uid },
      })
    )
  )

  if (isDraft && ADVANCEABLE_TO_MARKS_DRAFT.includes(exam.status)) {
    await prisma.exam.update({ where: { id: exam.id }, data: { status: 'MARKS_DRAFT' } })
  }

  logger.info({ event: 'marks.enter', examId: entries[0]!.examId, count: entries.length, isDraft, actorUid: actor.uid })
  return upserted
}

// ─── READ MARKS (draft-restore for MarksEntrySheet.tsx) ──
// AC-3: reading an exam's marks is subject-ownership-scoped — a teacher may
// read back only marks for exams they are assigned to; oversight roles bypass.
export async function getMarksForExam(examId: string, actor: ExamActor) {
  const exam = await prisma.exam.findUniqueOrThrow({
    where: { id: examId }, select: { classId: true, subject: true, academicYear: true },
  })
  await assertOwnsSubject(actor, exam.classId, exam.subject, exam.academicYear)
  return prisma.examMark.findMany({
    where: { examId },
    orderBy: { studentId: 'asc' },
  })
}

// ─── FINALIZE MARKS ──────────────────────────────────────
export async function finalizeMarks(examId: string, actor: ExamActor) {
  const exam = await prisma.exam.findUniqueOrThrow({
    where: { id: examId },
    include: { class: { include: { students: { where: { status: 'ACTIVE' } } } } },
  })

  // AC-5: only the assigned subject teacher (or an oversight role) may finalize.
  await assertOwnsSubject(actor, exam.classId, exam.subject, exam.academicYear)

  const marks = await prisma.examMark.findMany({
    where:  { examId },
    select: { studentId: true, mark: true, absent: true },
  })
  const markedIds = marks.map((m) => m.studentId)
  const missing = exam.class.students.filter((s) => !markedIds.includes(s.id))
  if (missing.length > 0)
    throw new Error(`Missing marks for ${missing.length} student(s). Enter all marks first.`)

  // Row *existence* alone is not enough — a row can exist with mark: null
  // and absent: false (an uninitialized client-side entry that was upserted
  // with defaults but never actually given a real value). Reject those too.
  const invalid = marks.filter((m) => m.mark === null && !m.absent)
  if (invalid.length > 0)
    throw new Error(`${invalid.length} student(s) have no mark entered and are not marked absent. Enter a mark or mark them absent before finalizing.`)

  await prisma.examMark.updateMany({ where: { examId }, data: { isDraft: false, finalizedAt: new Date() } })
  await prisma.exam.update({ where: { id: examId }, data: { status: 'MARKS_FINAL' } })
  await auditService.log({
    action: 'exam.marks_finalized', entityType: 'Exam', entityId: examId,
    actorUid: actor.uid, actorRole: actor.role,
    metadata: { context: { classId: exam.classId, subject: exam.subject } },
  })
  logger.info({ event: 'marks.finalized', examId, actorUid: actor.uid })
  return { finalized: true, examId }
}

export async function approveResults(examId: string, actor: ExamActor) {
  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId } })
  if (exam.status !== 'MARKS_FINAL') throw new Error('Marks must be finalized before approval.')
  await prisma.exam.update({ where: { id: examId }, data: { status: 'RESULTS_APPROVED' } })
  await auditService.log({
    action: 'exam.results_approved', entityType: 'Exam', entityId: examId,
    actorUid: actor.uid, actorRole: actor.role,
    metadata: { context: { classId: exam.classId, subject: exam.subject } },
  })
  logger.info({ event: 'results.approved', examId, actorUid: actor.uid })
}

export async function releaseResults(examId: string, actor: ExamActor) {
  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId } })
  if (exam.status !== 'RESULTS_APPROVED') throw new Error('Results must be approved before release.')
  await prisma.exam.update({ where: { id: examId }, data: { status: 'RESULTS_RELEASED' } })
  await auditService.log({
    action: 'exam.results_released', entityType: 'Exam', entityId: examId,
    actorUid: actor.uid, actorRole: actor.role,
    metadata: { context: { classId: exam.classId, subject: exam.subject, term: exam.term } },
  })
  logger.info({ event: 'results.released', examId, actorUid: actor.uid })
}

// Rewinds a finalized/approved/released exam back to MARKS_PENDING and flips
// its marks to draft — a substantive results edit. AC-1: NOT an admin action;
// gated on exam.unlockMarks (exam_officer / high_rank) at the route. Always
// audited as a high-severity result mutation.
export async function unlockMarks(examId: string, actor: ExamActor) {
  const before = await prisma.exam.findUniqueOrThrow({
    where: { id: examId }, select: { status: true, classId: true, subject: true },
  })
  await prisma.exam.update({ where: { id: examId }, data: { status: 'MARKS_PENDING' } })
  await prisma.examMark.updateMany({ where: { examId }, data: { isDraft: true } })
  await auditService.log({
    action: 'exam.marks_unlocked', entityType: 'Exam', entityId: examId,
    actorUid: actor.uid, actorRole: actor.role,
    metadata: { before: { status: before.status }, context: { classId: before.classId, subject: before.subject } },
  })
  logger.info({ event: 'marks.unlocked', examId, fromStatus: before.status, actorUid: actor.uid })
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
  const termResult = await prisma.termResult.findFirst({ where: { studentId, academicYear, term } })
  if (!termResult) return null

  // SR-2: class benchmark (no other students' names) — the class average and
  // size for this student's own class + term, so the results view can show
  // "your average vs class average" and "position of N".
  const siblings = await prisma.termResult.findMany({
    where:  { classId: termResult.classId, academicYear, term },
    select: { average: true },
  })
  const classSize = siblings.length
  const classAverage = classSize > 0
    ? Math.round((siblings.reduce((sum, r) => sum + toNumber(r.average), 0) / classSize) * 100) / 100
    : null
  return { ...termResult, classAverage, classSize }
}

// ─── COMPUTE TERM RESULTS ────────────────────────────────
// Refuses to run for a MANEB national term (Form 2 Term 3 / Form 4 Term 3)
// — those results come from MANEB itself (ManebRecord), never from
// aggregating internally-marked Exam/ExamMark rows, even if some were
// mistakenly created before createExam()'s own guard was added.
export async function computeTermResults(classId: string, academicYear: string, term: number, actorUid: string) {
  const classRecord = await prisma.class.findUniqueOrThrow({ where: { id: classId }, select: { form: true } })
  const classForm: number = classRecord.form // e.g. 1, 2, 3, or 4

  const manebType = getManebExamType(classForm, term)
  if (manebType) {
    throw new Error(
      `Form ${classForm} Term ${term} is the national ${manebType} examination — results come from MANEB, not internal computation. Record them via the MANEB panel once MANEB releases them.`
    )
  }

  const students = await prisma.student.findMany({ where: { classId, status: 'ACTIVE' } })
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
      // gradeService.calcGrade() is the single grade-boundary authority
      // anywhere in the codebase now — persisted exactly as returned, no
      // local override.
      const { grade, pass } = await calcGrade(avg, 'INTERNAL', classForm)
      subjectResults[subject] = { average: Math.round(avg * 100) / 100, grade, pass }
      totalAvg += avg; subjectCount++
    }
    const overallAvg = subjectCount > 0 ? totalAvg / subjectCount : 0
    const { grade, pass } = await calcGrade(overallAvg, 'INTERNAL', classForm)
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

// ─── MANEB ────────────────────────────────────────────────
export async function createManebRecord(data: CreateManebRecordInput, actor: ExamActor) {
  // Integrity: the studentId must resolve to a real Student — a typo'd id
  // would otherwise create an orphan MANEB record.
  const student = await prisma.student.findUnique({ where: { id: data.studentId }, select: { id: true } })
  if (!student) {
    throw Object.assign(new Error(`No student found for id ${data.studentId}.`), { status: 400 })
  }

  // GR-1: overallGrade / aggregatePoints are computed server-side from the
  // subject grades (sum of best-6 points incl. English) — the client-supplied
  // overallGrade is ignored so it can never diverge from the real aggregate.
  const { overallGrade: _ignoredClientOverall, ...rest } = data
  void _ignoredClientOverall
  const aggregate = await computeManebAggregate(data.examType, data.subjectGrades)

  const record = await prisma.manebRecord.create({
    data: {
      ...rest,
      overallGrade:    aggregate.classification,
      aggregatePoints: aggregate.points,
    },
  })
  await auditService.log({
    action: 'maneb.record_created', entityType: 'ManebRecord', entityId: record.id,
    actorUid: actor.uid, actorRole: actor.role,
    metadata: { after: { studentId: record.studentId, examType: record.examType, candidateNo: record.candidateNo } },
  })
  logger.info({ event: 'maneb.record.create', recordId: record.id, actorUid: actor.uid })
  return record
}

export async function listManebRecords(academicYear: string, examType?: 'JCE' | 'MSCE') {
  const records = await prisma.manebRecord.findMany({
    where: { academicYear, ...(examType ? { examType } : {}) },
    orderBy: { candidateNo: 'asc' },
  })
  // MN-2: ManebRecord.studentId is a plain FK (no declared relation) — resolve
  // names with one batch lookup so the UI shows the student's name, not the raw id.
  const studentIds = Array.from(new Set(records.map((r) => r.studentId)))
  const students = studentIds.length
    ? await prisma.student.findMany({
        where:  { id: { in: studentIds } },
        select: { id: true, firstName: true, lastName: true, registrationNo: true },
      })
    : []
  const byId = new Map(students.map((s) => [s.id, s]))
  return records.map((r) => {
    const st = byId.get(r.studentId)
    return {
      ...r,
      studentName:    st ? `${st.firstName} ${st.lastName}` : null,
      registrationNo: st?.registrationNo ?? null,
    }
  })
}

/**
 * [R18] Bulk MANEB record import. A thin, sequential loop over the existing
 * createManebRecord() — the single, audit-confirmed sole write path for MANEB
 * results — so every created row goes through exactly the same validation and
 * logging as a single create. Rows are validated and inserted independently:
 * a failed row (e.g. a duplicate candidateNo, which is @unique) is collected
 * into `errors` and does not abort the remaining rows. Returns the created
 * records and a per-row error list for the caller to surface. This does NOT
 * introduce a second MANEB write path — it is a batching wrapper only.
 */
export async function bulkCreateManebRecords(rows: CreateManebRecordInput[], actor: ExamActor) {
  const created: Awaited<ReturnType<typeof createManebRecord>>[] = []
  const errors: Array<{ index: number; candidateNo: string; error: string }> = []

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    if (!row) continue
    try {
      created.push(await createManebRecord(row, actor))
    } catch (err) {
      errors.push({
        index: i,
        candidateNo: row.candidateNo,
        error: err instanceof Error ? err.message : 'Unknown error creating MANEB record',
      })
    }
  }

  logger.info({ event: 'maneb.record.bulk_create', created: created.length, failed: errors.length, actorUid: actor.uid })
  return { created, errors }
}

// ─── GR-1: RECOMPUTE MANEB AGGREGATES (existing records) ─
// Recomputes overallGrade + aggregatePoints from stored subjectGrades for
// every MANEB record in a year — used once after the GR-1 rollout so records
// created before server-side computation get correct aggregates. New records
// are already computed on create/import.
export async function recomputeManebAggregates(academicYear: string, actor: ExamActor): Promise<{ updated: number }> {
  const records = await prisma.manebRecord.findMany({
    where:  { academicYear },
    select: { id: true, examType: true, subjectGrades: true },
  })
  let updated = 0
  for (const r of records) {
    const grades = (r.subjectGrades as Record<string, string> | null) ?? {}
    const aggregate = await computeManebAggregate(r.examType as 'JCE' | 'MSCE', grades)
    await prisma.manebRecord.update({
      where: { id: r.id },
      data:  { overallGrade: aggregate.classification, aggregatePoints: aggregate.points },
    })
    updated += 1
  }
  await auditService.log({
    action: 'maneb.aggregates_recomputed', entityType: 'ManebRecord', entityId: academicYear,
    actorUid: actor.uid, actorRole: actor.role,
    metadata: { context: { academicYear, updated } },
  })
  logger.info({ event: 'maneb.recompute', academicYear, updated, actorUid: actor.uid })
  return { updated }
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

// ─────────────────────────────────────────────────────────
//  P4 — RELEASE WORKFLOW (RW-1, RW-2, RW-4, RW-5)
// ─────────────────────────────────────────────────────────

// RW-2: which students in a class are fee-blocked for a term (the identities
// behind ResultsReleaseWorkflow's "N student(s) blocked by unpaid fees" count).
// Matches the same invoice-balance rule listExams uses for the count.
export async function listFeeBlockedStudents(classId: string, academicYear: string, term: number) {
  const invoices = await prisma.invoice.findMany({
    where: {
      academicYear, term,
      balance: { gt: 0 },
      student: { classId, status: 'ACTIVE' },
    },
    select: {
      balance: true,
      student: { select: { id: true, firstName: true, lastName: true, registrationNo: true } },
    },
  })

  const byStudent = new Map<string, { studentId: string; name: string; registrationNo: string; balance: number }>()
  for (const inv of invoices) {
    const st = inv.student
    const prev = byStudent.get(st.id) ?? { studentId: st.id, name: `${st.firstName} ${st.lastName}`, registrationNo: st.registrationNo, balance: 0 }
    prev.balance += toNumber(inv.balance)
    byStudent.set(st.id, prev)
  }
  return Array.from(byStudent.values()).sort((a, b) => b.balance - a.balance)
}

// RW-1: exam_officer / high_rank correct individual marks DURING REVIEW, after
// the teacher has finalized and before release. Permitted only while the exam is
// in the review window (MARKS_FINAL or RESULTS_APPROVED); marks stay final
// (isDraft: false). Gated at the route on exam.correctMarksInReview (oversight
// roles only — no subject-ownership requirement, and NOT admin). Fully audited.
const REVIEW_EDITABLE_STATUSES: ExamStatus[] = ['MARKS_FINAL', 'RESULTS_APPROVED']

export async function correctMarksInReview(
  examId: string,
  entries: BulkMarkEntryInput['entries'],
  actor: ExamActor,
) {
  const exam = await prisma.exam.findUniqueOrThrow({ where: { id: examId } })
  if (!REVIEW_EDITABLE_STATUSES.includes(exam.status)) {
    throw Object.assign(
      new Error('Marks can only be corrected while an exam is under review (finalized or approved, before release).'),
      { status: 409 },
    )
  }
  const max = toNumber(exam.maxMark)
  for (const e of entries) {
    if (e.mark !== undefined && e.mark > max) throw new Error(`Mark ${e.mark} exceeds maximum ${max} for exam ${exam.title}`)
  }

  const updated = await prisma.$transaction(
    entries.map((e) =>
      prisma.examMark.update({
        where: { examId_studentId: { examId, studentId: e.studentId } },
        data:  { mark: e.mark ?? null, absent: e.absent ?? false, comment: e.comment ?? null, isDraft: false, enteredByUid: actor.uid },
      })
    ),
  )
  await auditService.log({
    action: 'exam.marks_corrected_in_review', entityType: 'Exam', entityId: examId,
    actorUid: actor.uid, actorRole: actor.role,
    metadata: { context: { classId: exam.classId, subject: exam.subject, count: entries.length } },
  })
  logger.info({ event: 'marks.corrected_in_review', examId, count: entries.length, actorUid: actor.uid })
  return updated
}

// RW-5 helper: per-class top-N performers for a term, from computed TermResults.
// Names included (staff-facing announcement); no marks are exposed by callers
// that build the public top-10 announcement — they use names + position only.
export interface ClassTopPerformers {
  classId: string
  className: string
  form: number
  students: { studentId: string; name: string; average: number; position: number }[]
}

export async function getTopPerformersByClass(
  academicYear: string, term: number, limit = 10,
): Promise<ClassTopPerformers[]> {
  const results = await prisma.termResult.findMany({
    where:   { academicYear, term },
    orderBy: { average: 'desc' },
    select:  { studentId: true, classId: true, average: true, classPosition: true, position: true },
  })
  if (results.length === 0) return []

  const classIds = Array.from(new Set(results.map((r) => r.classId)))
  const studentIds = results.map((r) => r.studentId)
  const [classes, students] = await Promise.all([
    prisma.class.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true, form: true } }),
    prisma.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, firstName: true, lastName: true } }),
  ])
  const classById = new Map(classes.map((c) => [c.id, c]))
  const nameById = new Map(students.map((s) => [s.id, `${s.firstName} ${s.lastName}`]))

  const byClass = new Map<string, ClassTopPerformers>()
  for (const r of results) {
    const cls = classById.get(r.classId)
    if (!cls) continue
    let bucket = byClass.get(r.classId)
    if (!bucket) { bucket = { classId: r.classId, className: cls.name, form: cls.form, students: [] }; byClass.set(r.classId, bucket) }
    if (bucket.students.length < limit) {
      bucket.students.push({
        studentId: r.studentId,
        name:      nameById.get(r.studentId) ?? '—',
        average:   toNumber(r.average),
        position:  r.classPosition || r.position || bucket.students.length + 1,
      })
    }
  }
  return Array.from(byClass.values()).sort((a, b) => a.form - b.form || a.className.localeCompare(b.className))
}

// RW-4 + RW-5: release ALL end-of-term exams for a term "in unison" — only once
// every end-of-term exam is approved (all classes reviewed) — then post ONE
// combined top-10 announcement (names only, no marks) across all classes.
export async function releaseTermEndResults(academicYear: string, term: number, actor: ExamActor) {
  const endTermExams = await prisma.exam.findMany({
    where:  { academicYear, term, type: 'END_TERM' },
    select: { id: true, status: true, classId: true },
  })
  if (endTermExams.length === 0) {
    throw Object.assign(new Error(`No end-of-term exams exist for Term ${term}.`), { status: 409 })
  }

  // RW-4: nothing may be released until every end-of-term exam is at least
  // approved (reviewed). This enforces the "all classes in unison" rule.
  const notReady = endTermExams.filter((e) => e.status !== 'RESULTS_APPROVED' && e.status !== 'RESULTS_RELEASED')
  if (notReady.length > 0) {
    throw Object.assign(
      new Error(`${notReady.length} end-of-term exam(s) are not yet approved. All classes must submit and have results reviewed before releasing in unison.`),
      { status: 409 },
    )
  }

  const toRelease = endTermExams.filter((e) => e.status === 'RESULTS_APPROVED')
  if (toRelease.length > 0) {
    await prisma.$transaction(
      toRelease.map((e) => prisma.exam.update({ where: { id: e.id }, data: { status: 'RESULTS_RELEASED' } })),
    )
  }
  await auditService.log({
    action: 'exam.term_results_released', entityType: 'Exam', entityId: `${academicYear}:T${term}`,
    actorUid: actor.uid, actorRole: actor.role,
    metadata: { context: { academicYear, term, released: toRelease.length } },
  })

  // RW-5: compose one combined top-10 announcement (names only, no marks).
  let announced = false
  let announcementId: string | null = null
  const topByClass = await getTopPerformersByClass(academicYear, term, 10)
  const withStudents = topByClass.filter((c) => c.students.length > 0)
  if (withStudents.length > 0) {
    const bodyLines: string[] = [`Congratulations to our Term ${term} top performers (${academicYear}):`, '']
    for (const cls of withStudents) {
      bodyLines.push(`${cls.className} (Form ${cls.form})`)
      cls.students.forEach((st, i) => bodyLines.push(`${i + 1}. ${st.name}`))
      bodyLines.push('')
    }
    const created = await announcementService.createAnnouncement({
      title:         `Term ${term} Top Performers — ${academicYear}`,
      body:          bodyLines.join('\n').trim(),
      targetAll:     true,
      createdByUid:  actor.uid,
      createdByRole: actor.role,
      publicWebsite: false,
    }, true)
    announced = true
    announcementId = (created as { id?: string } | null)?.id ?? null
  }

  logger.info({ event: 'exam.term_released', academicYear, term, released: toRelease.length, announced, actorUid: actor.uid })
  return { released: toRelease.length, announced, announcementId }
}

// ─────────────────────────────────────────────────────────
//  P7 — ANALYTICS (AN-1 top/bottom + AN-3 summary)
// ─────────────────────────────────────────────────────────

export interface RankedStudent {
  studentId:      string
  name:           string
  registrationNo: string
  classId:        string
  className:      string
  value:          number
  position:       number
}

export interface ExamAnalyticsResult {
  metric:            'overall' | 'subject'
  subject:           string | null
  total:             number
  classAverage:      number | null
  passRate:          number | null
  atRiskCount:       number
  gradeDistribution: { grade: string; count: number }[]
  top:               RankedStudent[]
  bottom:            RankedStudent[]
}

// AN-1 (top/bottom-10, filters, tie-safe) + AN-3 (pass rate, grade distribution,
// at-risk). Oversight roles see any class; a teacher is scoped to classes they
// teach (class-teacher-of-that-class). Ranking is deterministic: value desc then
// name — so ties never reorder between calls.
export async function getExamAnalytics(
  academicYear: string,
  term: number,
  opts: { classId?: string; subject?: string; limit?: number },
  actor: ExamActor,
): Promise<ExamAnalyticsResult> {
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50)

  // Scope: non-oversight (teacher) may only view a class they teach.
  if (!OVERSIGHT_ROLES.includes(actor.role)) {
    if (!opts.classId) {
      throw Object.assign(new Error('Select a class you teach to view its analytics.'), { status: 403 })
    }
    const assignments = await classService.getTeacherSubjectAssignments(actor.uid, academicYear)
    const teachesClass = Array.from(assignments).some((key) => key.startsWith(`${opts.classId}|`))
    if (!teachesClass) {
      throw Object.assign(new Error('You can only view analytics for classes you teach.'), { status: 403 })
    }
  }

  const results = await prisma.termResult.findMany({
    where:  { academicYear, term, ...(opts.classId ? { classId: opts.classId } : {}) },
    select: { studentId: true, classId: true, average: true, grade: true, passStatus: true, subjectResults: true },
  })

  // Value per student: subject average when a subject filter is set, else overall.
  const rows = results
    .map((r) => {
      let value: number | null
      if (opts.subject) {
        const sr = r.subjectResults as Record<string, { average: number; grade: string; pass: boolean }> | null
        const cell = sr ? sr[opts.subject] : undefined
        value = cell ? Number(cell.average) : null
      } else {
        value = toNumber(r.average)
      }
      return { studentId: r.studentId, classId: r.classId, grade: r.grade, passStatus: r.passStatus, value }
    })
    .filter((r): r is { studentId: string; classId: string; grade: string; passStatus: boolean; value: number } => r.value !== null)

  const total = rows.length
  if (total === 0) {
    return { metric: opts.subject ? 'subject' : 'overall', subject: opts.subject ?? null, total: 0, classAverage: null, passRate: null, atRiskCount: 0, gradeDistribution: [], top: [], bottom: [] }
  }

  // AN-3 summary.
  const classAverage = Math.round((rows.reduce((sum, r) => sum + r.value, 0) / total) * 100) / 100
  const passRate     = Math.round((rows.filter((r) => r.passStatus).length / total) * 100)
  const atRiskCount  = rows.filter((r) => !r.passStatus).length
  const gradeMap = new Map<string, number>()
  for (const r of rows) gradeMap.set(r.grade, (gradeMap.get(r.grade) ?? 0) + 1)
  const gradeDistribution = Array.from(gradeMap.entries())
    .map(([grade, count]) => ({ grade, count }))
    .sort((a, b) => a.grade.localeCompare(b.grade))

  // Resolve names + class names (staff-facing lists).
  const studentIds = rows.map((r) => r.studentId)
  const classIds   = Array.from(new Set(rows.map((r) => r.classId)))
  const [students, classes] = await Promise.all([
    prisma.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, firstName: true, lastName: true, registrationNo: true } }),
    prisma.class.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } }),
  ])
  const nameById = new Map(students.map((s) => [s.id, `${s.firstName} ${s.lastName}`]))
  const regById  = new Map(students.map((s) => [s.id, s.registrationNo]))
  const clsById  = new Map(classes.map((c) => [c.id, c.name]))

  const enriched = rows.map((r) => ({
    studentId:      r.studentId,
    name:           nameById.get(r.studentId) ?? '—',
    registrationNo: regById.get(r.studentId) ?? '',
    classId:        r.classId,
    className:      clsById.get(r.classId) ?? '—',
    value:          Math.round(r.value * 100) / 100,
  }))

  const byBest  = [...enriched].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
  const byWorst = [...enriched].sort((a, b) => a.value - b.value || a.name.localeCompare(b.name))
  const top     = byBest.slice(0, limit).map((r, i) => ({ ...r, position: i + 1 }))
  const bottom  = byWorst.slice(0, limit).map((r, i) => ({ ...r, position: i + 1 }))

  return { metric: opts.subject ? 'subject' : 'overall', subject: opts.subject ?? null, total, classAverage, passRate, atRiskCount, gradeDistribution, top, bottom }
}