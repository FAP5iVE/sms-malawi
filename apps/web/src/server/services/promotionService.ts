/**
 * apps/web/src/server/services/promotionService.ts — Phase D1
 *
 * [CHANGE TYPE]: MAJOR REWRITE of the pass-count, threshold-reading, and
 *   subject-evaluation logic (the overall runPromotion()/commitPromotion()
 *   orchestration and looping structure are unaffected).
 * [R-PHASE]: R8 — Academics IV: Report Cards, Transcripts, Promotion & Risk
 *   Assessment
 * [PURPOSE]:
 *   1. CRITICAL FATAL-BUG FIX: countSubjectPasses(annualResult.passStatus)
 *      passed a Boolean field to a function expecting an array —
 *      AnnualResult has no subjectResults field at all, and nothing in the
 *      codebase has ever populated AnnualResult in the first place, so
 *      every student also hit the separate "no annual result" skip branch.
 *      Both problems are fixed together: this file now derives each
 *      student's real per-subject pass/fail from their actual results
 *      (TermResult for internally-assessed forms, ManebRecord for
 *      MANEB-assessed forms — see #2) and upserts AnnualResult itself
 *      during commit, rather than assuming a row that nothing ever wrote.
 *   2. Implements the real MANEB/MSCE/JCE promotion rules, not merely a
 *      generic "average ≥ threshold" gate:
 *        Form 1 → Form 2 and Form 2 → Form 3 (JCE-style rule): pass at
 *        least 6 subjects, including English.
 *        Form 3 → Form 4 (MSCE-style rule): pass 6 subjects including
 *        English with ≥1 Distinction/Credit-tier grade among them
 *        (condition a), OR pass 5 subjects including English with ≥3
 *        Distinction/Credit-tier grades among them (condition b).
 *        Form 4: unconditionally AWAITING_MANEB regardless of internal
 *        performance — Form 4 is the terminal form; the actual MSCE
 *        certificate award is MANEB's own determination once national
 *        results are imported (ManebRecord), entirely outside this
 *        engine's scope.
 *      Since Form 2's and Form 4's Term 3 is the JCE/MSCE national exam
 *      (school-administered assessment does not exist for that slot — see
 *      examService.ts/R7), Form 2's promotion evaluation reads the
 *      student's imported ManebRecord (JCE), not internal TermResult data;
 *      Form 1 and Form 3 (both internally assessed at Term 3) read their
 *      Term 3 TermResult.subjectResults. A student whose determining
 *      result does not exist yet (JCE not yet imported; Term 3 internal
 *      result not yet computed) is SKIPPED_NO_RESULT, not silently
 *      evaluated against incomplete or wrong-source data.
 *      "Distinction/Credit-tier" is resolved via gradeService.
 *      isDistinctionOrCredit() (this same phase) — data-driven off the
 *      real, admin-editable grading scale, not a hardcoded letter/number
 *      list.
 *   3. getPromotionThresholds(): the broken `import { settingsService }
 *      from '@/server/services/settingsService'` (settingsService.ts has
 *      no such named export at all — every one of its exports is a plain
 *      named function; this import resolved to undefined, so
 *      `settingsService.get(...)` would throw before the `.catch()` on the
 *      surrounding promise could ever run) is replaced with the standard
 *      `import * as settingsService` module-namespace import used
 *      everywhere else in the codebase, reading SETTING_KEYS.
 *      PROMOTION_MIN_AVERAGE/PROMOTION_REQUIRED_PASSES (already-registered
 *      typed keys — the "unregistered raw string keys" issue was this
 *      file bypassing the typed accessor via raw string literals requiring
 *      an explicit `<number>` override to compile, not the keys
 *      themselves being unregistered) instead of raw string literals.
 *      These two settings remain informational context on the preview
 *      (surfaced for admin visibility) — the actual pass/fail determinant
 *      is the real subject-count/English/distinction-tier rule above, not
 *      an average-percentage bar (MANEB's real promotion policy has none).
 *   4. commitPromotion() now upserts AnnualResult (previously an
 *      update-only call against rows nothing had ever created, so it
 *      silently affected zero rows every time) — this is also what makes
 *      reportCardService.ts's promotionStatus/nextClass fields real for
 *      the first time.
 * [DEPENDS ON]: apps/web/src/server/services/gradeService.ts
 *   (isDistinctionOrCredit, getGradeInfo), @shared/constants/malawi
 *   (getManebExamType)
 *
 * Student Promotion Engine.
 *
 * End-of-year workflow:
 *   1. Exam Officer calls runPromotion(academicYear, actorUid, preview=true)
 *      → Returns a PromotionPreview with per-student outcomes (no DB writes
 *        beyond the PromotionRun preview snapshot).
 *   2. Exam Officer reviews the preview on the PromotionEngine UI component.
 *   3. Admin / Exam Officer calls commitPromotion(academicYear, actorUid)
 *      → Atomically applies all student status/class changes and upserts
 *        AnnualResult from the preview snapshot.
 *
 * Promotion outcomes per student:
 *   Form 1 → PASS → moved to Form 2 (next class)
 *   Form 2 → PASS → moved to Form 3
 *   Form 3 → PASS → moved to Form 4
 *   Form 4 → status = AWAITING_MANEB_RESULTS, classId unchanged
 *   Any form → FAIL → Student.classId unchanged (repeats same form)
 *
 * A PromotionRun record is created on first call and updated on commit.
 * Only one PromotionRun per academicYear may exist.
 */

import 'server-only'
import { prisma }              from '@/lib/prisma'
import { logger }              from '@/lib/logger'
import * as settingsService    from '@/server/services/settingsService'
import { SETTING_KEYS }        from '@shared/types/settings'
import { isDistinctionOrCredit, getGradeInfo, type ExamTypeKey } from '@/server/services/gradeService'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type PromotionOutcome =
  | 'PROMOTED'
  | 'REPEATED'
  | 'AWAITING_MANEB'
  | 'ALREADY_AWAITING'
  | 'SKIPPED_NO_RESULT'

export interface StudentPromotionResult {
  studentId:       string
  registrationNo:  string
  fullName:        string
  currentClassId:  string
  currentClass:    string
  currentForm:     number
  annualAverage:   number
  passStatus:      boolean
  subjectPasses:   number
  outcome:         PromotionOutcome
  nextClassId?:    string
  nextClassName?:  string
  reason:          string
}

export interface PromotionPreview {
  academicYear:   string
  totalStudents:  number
  promoted:       number
  repeated:       number
  awaitingManeb:  number
  skipped:        number
  students:       StudentPromotionResult[]
  minAverage:     number
  minPasses:      number
}

interface SubjectOutcome {
  subject:              string
  pass:                 boolean
  distinctionOrCredit:  boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Maps form number to the next form number (Form 4 has no next form) */
const NEXT_FORM: Record<number, number | null> = { 1: 2, 2: 3, 3: 4, 4: null }

/** Informational only — the real pass/fail determinant is the subject-
 *  count/English/distinction-tier rule below, not an average percentage. */
async function getPromotionThresholds(): Promise<{ minAverage: number; minPasses: number }> {
  const [minAverage, minPasses] = await Promise.all([
    settingsService.get(SETTING_KEYS.PROMOTION_MIN_AVERAGE),
    settingsService.get(SETTING_KEYS.PROMOTION_REQUIRED_PASSES),
  ])
  return { minAverage, minPasses }
}

function countSubjectPasses(subjects: SubjectOutcome[]): number {
  return subjects.filter((s) => s.pass).length
}

/** Form 1 & Form 3 — internally assessed at Term 3. Reads the student's
 *  Term 3 TermResult.subjectResults (already graded by examService.
 *  computeTermResults() via gradeService.calcGrade() — the sole grading
 *  authority). Returns null if no Term 3 result exists yet. */
async function getInternalSubjectOutcomes(
  studentId:    string,
  academicYear: string,
  classForm:    number,
): Promise<SubjectOutcome[] | null> {
  const term3 = await prisma.termResult.findFirst({
    where:  { studentId, academicYear, term: 3 },
    select: { subjectResults: true },
  })
  if (!term3) return null

  const examTypeKey: ExamTypeKey = classForm >= 3 ? 'INTERNAL_F3F4' : 'INTERNAL_F1F2'
  const results = term3.subjectResults as Record<string, { average: number; grade: string; pass: boolean }>
  if (!results || Object.keys(results).length === 0) return null

  return Promise.all(
    Object.entries(results).map(async ([subject, data]) => ({
      subject,
      pass: data.pass,
      distinctionOrCredit: await isDistinctionOrCredit(examTypeKey, data.grade),
    })),
  )
}

/** Form 2 — assessed by the JCE national exam at Term 3 (no internal exam
 *  exists for that slot — see examService.ts/R7). Reads the student's
 *  imported ManebRecord. MANEB reports an already-assigned grade per
 *  subject, never a raw percentage — gradeService.getGradeInfo() resolves
 *  pass/fail and distinction/credit tier directly from the grade letter.
 *  Returns null if JCE results have not been imported yet. */
async function getManebSubjectOutcomes(
  studentId:    string,
  academicYear: string,
): Promise<SubjectOutcome[] | null> {
  const record = await prisma.manebRecord.findFirst({
    where: { studentId, academicYear, examType: 'JCE' },
  })
  if (!record) return null

  const grades = record.subjectGrades as Record<string, string>
  if (!grades || Object.keys(grades).length === 0) return null

  return Promise.all(
    Object.entries(grades).map(async ([subject, grade]) => {
      const info = await getGradeInfo('JCE', grade)
      return {
        subject,
        pass: info?.pass ?? false,
        distinctionOrCredit: info ? await isDistinctionOrCredit('JCE', grade) : false,
      }
    }),
  )
}

/** Form 1 → 2 and Form 2 → 3: pass at least 6 subjects, including English. */
function evaluateJCEStyleRule(subjects: SubjectOutcome[]): { passes: boolean; reason: string } {
  const passed = subjects.filter((s) => s.pass)
  const englishPassed = passed.some((s) => s.subject.toLowerCase() === 'english')
  const passes = passed.length >= 6 && englishPassed

  if (passes) return { passes: true, reason: `Passed ${passed.length} subjects including English` }
  if (!englishPassed) return { passes: false, reason: 'English was not passed — English is a compulsory pass for promotion' }
  return { passes: false, reason: `Passed only ${passed.length} subject(s) — at least 6 are required` }
}

/** Form 3 → 4: (a) pass 6 subjects including English with ≥1 Distinction/
 *  Credit grade, OR (b) pass 5 subjects including English with ≥3
 *  Distinction/Credit grades. */
function evaluateMSCEStyleRule(subjects: SubjectOutcome[]): { passes: boolean; reason: string } {
  const passed = subjects.filter((s) => s.pass)
  const englishPassed = passed.some((s) => s.subject.toLowerCase() === 'english')
  const distinctionOrCreditCount = passed.filter((s) => s.distinctionOrCredit).length

  if (!englishPassed) {
    return { passes: false, reason: 'English was not passed — English is a compulsory pass for promotion' }
  }
  if (passed.length >= 6 && distinctionOrCreditCount >= 1) {
    return {
      passes: true,
      reason: `Passed ${passed.length} subjects including English, with ${distinctionOrCreditCount} Distinction/Credit grade(s) (condition a)`,
    }
  }
  if (passed.length >= 5 && distinctionOrCreditCount >= 3) {
    return {
      passes: true,
      reason: `Passed ${passed.length} subjects including English, with ${distinctionOrCreditCount} Distinction/Credit grades (condition b)`,
    }
  }
  return {
    passes: false,
    reason: `Passed ${passed.length} subject(s) with ${distinctionOrCreditCount} Distinction/Credit grade(s) — needs 6 passes (1+ Distinction/Credit) or 5 passes (3+ Distinctions/Credits)`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RUN PROMOTION (preview or commit)
// ─────────────────────────────────────────────────────────────────────────────

export async function runPromotion(
  academicYear: string,
  actorUid:     string,
  preview       = true,
): Promise<PromotionPreview> {
  const { minAverage, minPasses } = await getPromotionThresholds()

  const students = await prisma.student.findMany({
    where:   { status: 'ACTIVE' },
    include: { class: { select: { id: true, name: true, form: true } } },
  })

  const allClasses = await prisma.class.findMany({
    where:  { status: 'ACTIVE' },
    select: { id: true, name: true, form: true },
  })
  const classByForm = new Map<number, { id: string; name: string }>()
  for (const c of allClasses) {
    if (!classByForm.has(c.form)) classByForm.set(c.form, { id: c.id, name: c.name })
  }

  const results: StudentPromotionResult[] = []
  let promoted = 0, repeated = 0, awaitingManeb = 0, skipped = 0

  for (const student of students) {
    const klass = student.class
    const fullName = `${student.firstName} ${student.lastName}`

    if (!klass) {
      results.push({
        studentId: student.id, registrationNo: student.registrationNo, fullName,
        currentClassId: '', currentClass: '—', currentForm: 0,
        annualAverage: 0, passStatus: false, subjectPasses: 0,
        outcome: 'SKIPPED_NO_RESULT', reason: 'No class assigned',
      })
      skipped++
      continue
    }

    const classForm = klass.form

    // Form 4 — terminal form. Always AWAITING_MANEB regardless of internal
    // performance; the real MSCE certificate determination is MANEB's own,
    // via ManebRecord import, entirely outside this engine.
    if (classForm === 4) {
      results.push({
        studentId: student.id, registrationNo: student.registrationNo, fullName,
        currentClassId: klass.id, currentClass: klass.name, currentForm: classForm,
        annualAverage: 0, passStatus: false, subjectPasses: 0,
        outcome: 'AWAITING_MANEB', reason: 'Completed Form 4 — awaiting MANEB MSCE results',
      })
      awaitingManeb++
      continue
    }

    const subjects = classForm === 2
      ? await getManebSubjectOutcomes(student.id, academicYear)
      : await getInternalSubjectOutcomes(student.id, academicYear, classForm)

    if (!subjects) {
      const reason = classForm === 2
        ? 'JCE results not yet imported from MANEB'
        : 'No Term 3 result found for this academic year'
      results.push({
        studentId: student.id, registrationNo: student.registrationNo, fullName,
        currentClassId: klass.id, currentClass: klass.name, currentForm: classForm,
        annualAverage: 0, passStatus: false, subjectPasses: 0,
        outcome: 'SKIPPED_NO_RESULT', reason,
      })
      skipped++
      continue
    }

    const ruleResult = classForm === 3 ? evaluateMSCEStyleRule(subjects) : evaluateJCEStyleRule(subjects)
    const subjectPasses = countSubjectPasses(subjects)
    // Indicative percentage (subjects passed ÷ subjects taken) — informational
    // display only; the actual determinant is ruleResult above.
    const average = subjects.length > 0 ? (subjectPasses / subjects.length) * 100 : 0

    const nextForm = NEXT_FORM[classForm]
    let outcome: PromotionOutcome
    let nextClassId: string | undefined
    let nextClassName: string | undefined
    let reason: string

    if (ruleResult.passes) {
      const nextCls = nextForm ? classByForm.get(nextForm) : undefined
      if (!nextCls) {
        outcome = 'REPEATED'
        reason  = `No Form ${nextForm} class found — student held back`
        repeated++
      } else {
        outcome       = 'PROMOTED'
        nextClassId   = nextCls.id
        nextClassName = nextCls.name
        reason        = ruleResult.reason
        promoted++
      }
    } else {
      outcome = 'REPEATED'
      reason  = ruleResult.reason
      repeated++
    }

    results.push({
      studentId: student.id, registrationNo: student.registrationNo, fullName,
      currentClassId: klass.id, currentClass: klass.name, currentForm: classForm,
      annualAverage: average, passStatus: ruleResult.passes, subjectPasses,
      outcome, nextClassId, nextClassName, reason,
    })
  }

  const preview_: PromotionPreview = {
    academicYear,
    totalStudents:  students.length,
    promoted,
    repeated,
    awaitingManeb,
    skipped,
    students:       results,
    minAverage,
    minPasses,
  }

  // Persist or update the PromotionRun record (even for previews, to show in UI)
  await prisma.promotionRun.upsert({
    where:  { academicYear },
    create: {
      academicYear,
      status:        'PREVIEW',
      totalStudents: students.length,
      promoted,
      repeated,
      graduated:     awaitingManeb,
      log:           results as unknown as object[],
      triggeredBy:   actorUid,
    },
    update: {
      status:        'PREVIEW',
      totalStudents: students.length,
      promoted,
      repeated,
      graduated:     awaitingManeb,
      log:           results as unknown as object[],
      triggeredBy:   actorUid,
    },
  })

  logger.info(
    { event: 'promotion.preview', academicYear, promoted, repeated, awaitingManeb, skipped, actorUid, preview },
    'Promotion preview generated',
  )

  return preview_
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMIT PROMOTION
// Applies all student status/class changes and upserts AnnualResult from
// the preview snapshot, atomically. Must be called after runPromotion
// (preview must exist).
// ─────────────────────────────────────────────────────────────────────────────

export async function commitPromotion(
  academicYear: string,
  actorUid:     string,
): Promise<{ committed: number }> {
  const run = await prisma.promotionRun.findUnique({ where: { academicYear } })
  if (!run) throw new Error(`No promotion preview found for ${academicYear}. Run preview first.`)
  if (run.status === 'COMMITTED') throw new Error(`Promotion for ${academicYear} is already committed.`)

  const log = run.log as unknown as StudentPromotionResult[]

  const mutations = log.flatMap((entry) => {
    if (entry.outcome === 'SKIPPED_NO_RESULT' || !entry.currentClassId) return []

    const promotedFlag = entry.outcome === 'PROMOTED' || entry.outcome === 'AWAITING_MANEB'
    const finalGrade =
      entry.outcome === 'PROMOTED'       ? 'PASS' :
      entry.outcome === 'AWAITING_MANEB' ? 'AWAITING MANEB' :
      'REPEAT'

    const annualResultUpsert = prisma.annualResult.upsert({
      where: { studentId_academicYear: { studentId: entry.studentId, academicYear } },
      create: {
        studentId:      entry.studentId,
        classId:        entry.currentClassId,
        academicYear,
        annualAverage:  entry.annualAverage,
        finalGrade,
        passStatus:     entry.passStatus,
        promoted:       promotedFlag,
        nextClassId:    entry.nextClassId ?? null,
      },
      update: {
        annualAverage:  entry.annualAverage,
        finalGrade,
        passStatus:     entry.passStatus,
        promoted:       promotedFlag,
        nextClassId:    entry.nextClassId ?? null,
      },
    })

    if (entry.outcome === 'AWAITING_MANEB') {
      return [
        annualResultUpsert,
        prisma.student.update({ where: { id: entry.studentId }, data: { status: 'AWAITING_MANEB_RESULTS' } }),
      ]
    }
    if (entry.outcome === 'PROMOTED' && entry.nextClassId) {
      return [
        annualResultUpsert,
        prisma.student.update({ where: { id: entry.studentId }, data: { classId: entry.nextClassId } }),
      ]
    }
    // REPEATED — annual result recorded; classId intentionally unchanged.
    return [annualResultUpsert]
  })

  await prisma.$transaction([
    ...mutations,
    prisma.promotionRun.update({
      where: { academicYear },
      data:  { status: 'COMMITTED', committedAt: new Date() },
    }),
  ])

  const committed = log.filter(
    (e) => e.outcome === 'PROMOTED' || e.outcome === 'AWAITING_MANEB',
  ).length

  logger.info(
    { event: 'promotion.committed', academicYear, committed, actorUid },
    'Promotion committed',
  )

  return { committed }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET RUN STATUS
// ─────────────────────────────────────────────────────────────────────────────

export async function getPromotionRun(academicYear: string) {
  return prisma.promotionRun.findUnique({ where: { academicYear } })
}