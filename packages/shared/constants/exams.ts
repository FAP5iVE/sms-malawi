/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: packages/shared/constants/exams.ts
 * [R-PHASE]: R16 — Constants Centralization (Phase 10B Plan)
 * [PURPOSE]: Exam-type presentation constants — the labels/lists only.
 *   EXAM_TYPES is the schedulable ExamType value/label list moved from
 *   ExamForm.tsx; EXAM_TYPE_LABELS is the grading-scale-key label map moved
 *   from settings/ExamGradingSettings.tsx.
 *
 *   NOTE: these are two genuinely distinct concepts confirmed from source —
 *   EXAM_TYPES keys the Prisma `ExamType` enum (WEEKLY_TEST … MANEB_MSCE);
 *   EXAM_TYPE_LABELS keys the grading-scale selector (MSCE/JCE/INTERNAL_*).
 *   They are NOT "the same seven strings"; both are centralized here as the
 *   single source for their respective label sets.
 *
 *   EXPLICITLY EXCLUDED (grading-boundary reconciliation, resolved in R7/R8
 *   by making gradeService.ts the sole authority — not re-litigated here):
 *   PrintableReportCard.tsx's GRADE_SCALE, examService.ts's MSCE_GRADES/
 *   JCE_GRADES, gradeService.ts's GradingScale.
 * [DEPENDS ON]: none
 */

// ─── SCHEDULABLE EXAM TYPES (Prisma ExamType) ────────────
export interface ExamTypeOption {
  value: string
  label: string
}

export const EXAM_TYPES: readonly ExamTypeOption[] = [
  { value: 'WEEKLY_TEST', label: 'Weekly Test' },
  { value: 'ASSIGNMENT', label: 'Assignment' },
  { value: 'QUIZ', label: 'Quiz' },
  { value: 'MIDTERM', label: 'Midterm Exam' },
  { value: 'END_TERM', label: 'End of Term Exam' },
  { value: 'MANEB_JCE', label: 'MANEB JCE (Form 2)' },
  { value: 'MANEB_MSCE', label: 'MANEB MSCE (Form 4)' },
] as const

// ─── GRADING-SCALE KEY LABELS ────────────────────────────
export type ExamTypeKey = 'MSCE' | 'JCE' | 'INTERNAL_F1F2' | 'INTERNAL_F3F4'

export const EXAM_TYPE_LABELS: Record<ExamTypeKey, string> = {
  MSCE: 'MANEB MSCE (Form 4)',
  JCE: 'MANEB JCE (Form 2)',
  INTERNAL_F1F2: 'Internal — Forms 1 & 2',
  INTERNAL_F3F4: 'Internal — Forms 3 & 4',
}


// ═════════════════════════════════════════════════════════════════════════
//  CONTINUOUS ASSESSMENT (CA) AGGREGATION
//  Pure, dependency-free logic shared by the settings screen (live
//  validation), the exam form (slot picker) and examService.computeTermResults
//  (the only place a persisted term result is produced).
//
//  THE RULE (when aggregation is ON)
//    term mark (0-100) = CA subtotal + exam points
//      CA subtotal = sum over CA slots i of  (mark_i / max_i) x weight_i
//      exam points = (END_TERM mark / max) x (100 - sum of CA weights)
//    CA weights are whole-number percentages of the FINAL term mark, so the
//    two parts always add up to a mark out of 100.
//  When aggregation is OFF the term mark is the end-of-term exam alone,
//    (mark / max) x 100 - CAs are recorded and reported separately.
//
//  ROUNDING (done once, exactly - no floating-point drift)
//    Each part (CA subtotal, exam points) is computed as an exact rational
//    number and rounded half-up to 2 decimal places; the term mark is the
//    SUM OF THOSE TWO ROUNDED PARTS. Every figure printed on a report card
//    therefore adds up by hand. The grade is looked up from this rounded
//    term mark - never from a hidden unrounded value - so a student can't
//    display 49.99 yet be graded as 50.
//
//  MISSING / ABSENT
//    - A student absent from, or with no mark for, an exam that exists scores 0
//      for that component (and is counted in `absentComponents`).
//    - A CA slot with NO finalised exam at all (null) is not the student's
//      fault: it is reported in `missing`, and its weight moves to the
//      end-of-term exam so the term mark is still out of 100. The server
//      refuses to compute in that situation unless explicitly told to.
// ═════════════════════════════════════════════════════════════════════════

/** Exam types that count as a continuous assessment. END_TERM is the final
 *  exam; the two MANEB types are never marked internally. */
export const CA_EXAM_TYPES = ['WEEKLY_TEST', 'ASSIGNMENT', 'QUIZ', 'MIDTERM'] as const
export type CaExamType = typeof CA_EXAM_TYPES[number]

export function isCaExamType(type: string): type is CaExamType {
  return (CA_EXAM_TYPES as readonly string[]).includes(type)
}

export const CA_MAX_COUNT = 10

export interface CaConfig {
  enabled: boolean
  count:   number
  weights: number[]
}

/** Sum of whole-number CA weights. */
export function totalCaWeight(weights: readonly number[]): number {
  return weights.reduce((a, b) => a + b, 0)
}

/** Weight (percent of the final mark) left for the end-of-term exam. */
export function examWeightFor(weights: readonly number[]): number {
  return 100 - totalCaWeight(weights)
}

/** Returns a human-readable problem with a CA configuration, or null if it is
 *  valid. Enforced by PATCH /settings/exam and re-checked before any compute. */
export function validateCaConfig(c: { count: number; weights: readonly number[] }): string | null {
  if (!Number.isInteger(c.count) || c.count < 1 || c.count > CA_MAX_COUNT)
    return `Number of continuous assessments must be a whole number from 1 to ${CA_MAX_COUNT}.`
  if (c.weights.length !== c.count)
    return `Enter a weight for each of the ${c.count} continuous assessment(s) - ${c.weights.length} given.`
  for (let i = 0; i < c.weights.length; i++) {
    const w = c.weights[i]!
    if (!Number.isInteger(w) || w < 1 || w > 99)
      return `CA ${i + 1} weight must be a whole number from 1 to 99.`
  }
  const total = totalCaWeight(c.weights)
  if (total >= 100)
    return `Continuous assessments total ${total}% - they must leave a share for the end-of-term exam (total must be under 100%).`
  return null
}

/** One scored component. `mark: null` with absent=false means "exam exists,
 *  nothing recorded" - treated exactly like absent (0). */
export interface MarkComponent {
  mark:   number | null
  max:    number
  absent: boolean
}

export interface SubjectTermMarkInput {
  aggregate: boolean
  /** CA weights, index 0 = CA 1. Ignored when aggregate is false. */
  weights:   readonly number[]
  /** index i = CA slot i+1. null = no finalised exam exists for that slot. */
  ca:        ReadonlyArray<MarkComponent | null>
  /** END_TERM exam component(s). More than one (several papers) share the
   *  exam weight equally. Must contain at least one entry. */
  exam:      readonly MarkComponent[]
}

export interface SubjectTermMark {
  aggregated:       boolean
  /** Final term mark, exactly 2 d.p., 0-100. */
  finalPercent:     number
  /** Weighted CA subtotal, 2 d.p. Always 0 when not aggregated. */
  caPoints:         number
  /** Max possible CA subtotal (sum of the weights of slots that exist). */
  caWeight:         number
  /** Exam points, 2 d.p. */
  examPoints:       number
  /** Max possible exam points (its weight, including any redistributed weight). */
  examWeight:       number
  /** Raw score % (0-100, 2 d.p.) per CA slot, null where the slot has no exam. */
  caSlotPercents:   Array<number | null>
  /** Slots (1-based) with no finalised exam. */
  missing:          number[]
  /** How many existing components the student was absent/unmarked for. */
  absentComponents: number
}

const toCents = (n: number): bigint => BigInt(Math.round(n * 100))

/** Exact half-up division of non-negative bigints, returned as a number of
 *  hundredths (num/den rounded to the nearest integer, .5 rounds up). */
function roundDiv(num: bigint, den: bigint): bigint {
  return (BigInt(2) * num + den) / (BigInt(2) * den)
}

function assertComponent(c: MarkComponent, label: string): void {
  if (!(c.max > 0)) throw new RangeError(`${label}: maximum mark must be greater than 0.`)
  if (c.mark !== null && !c.absent) {
    if (c.mark < 0)     throw new RangeError(`${label}: mark ${c.mark} is negative.`)
    if (c.mark > c.max) throw new RangeError(`${label}: mark ${c.mark} exceeds the maximum ${c.max}.`)
  }
}

/** Exact value (in hundredths of a mark) of sum(weight_k x mark_k / max_k)
 *  over the given terms, as a rational [numerator, denominator]. `wNum/wDen`
 *  is the term's weight so a weight can itself be a fraction (exam weight
 *  shared across several papers). */
function rationalSum(
  terms: Array<{ wNum: bigint; wDen: bigint; mark: bigint; max: bigint }>,
): [bigint, bigint] {
  let num = BigInt(0)
  let den = BigInt(1)
  for (const t of terms) {
    // num/den + (100 x wNum x mark) / (wDen x max)
    const tNum = BigInt(100) * t.wNum * t.mark
    const tDen = t.wDen * t.max
    num = num * tDen + tNum * den
    den = den * tDen
  }
  return [num, den]
}

export function computeSubjectTermMark(input: SubjectTermMarkInput): SubjectTermMark {
  if (input.exam.length === 0)
    throw new RangeError('A subject needs at least one end-of-term exam component to be graded.')
  input.exam.forEach((e, i) => assertComponent(e, `End-of-term exam ${i + 1}`))

  const scoreOf = (c: MarkComponent): bigint => (c.absent || c.mark === null) ? BigInt(0) : toCents(c.mark)
  const pct2    = (c: MarkComponent): number => {
    if (c.absent || c.mark === null) return 0
    return Number(roundDiv(BigInt(10000) * toCents(c.mark), toCents(c.max))) / 100
  }

  let absentComponents = input.exam.filter((e) => e.absent || e.mark === null).length

  // ── Aggregation OFF: the end-of-term exam alone, out of 100.
  if (!input.aggregate) {
    const k = BigInt(input.exam.length)
    const [num, den] = rationalSum(input.exam.map((e) => ({
      wNum: BigInt(100), wDen: k, mark: scoreOf(e), max: toCents(e.max),
    })))
    const examPoints = Number(roundDiv(num, den)) / 100
    return {
      aggregated: false, finalPercent: examPoints, caPoints: 0, caWeight: 0,
      examPoints, examWeight: 100, caSlotPercents: input.ca.map(() => null),
      missing: [], absentComponents,
    }
  }

  // ── Aggregation ON.
  if (input.ca.length !== input.weights.length)
    throw new RangeError(`Expected ${input.weights.length} CA slot(s) but received ${input.ca.length}.`)
  const cfgProblem = validateCaConfig({ count: input.weights.length, weights: input.weights })
  if (cfgProblem) throw new RangeError(cfgProblem)

  const missing: number[] = []
  const caTerms: Array<{ wNum: bigint; wDen: bigint; mark: bigint; max: bigint }> = []
  let presentCaWeight = 0
  input.ca.forEach((c, i) => {
    if (c === null) { missing.push(i + 1); return }
    assertComponent(c, `CA ${i + 1}`)
    if (c.absent || c.mark === null) absentComponents++
    presentCaWeight += input.weights[i]!
    caTerms.push({ wNum: BigInt(input.weights[i]!), wDen: BigInt(1), mark: scoreOf(c), max: toCents(c.max) })
  })

  // Weight of any slot with no exam at all moves to the end-of-term exam.
  const examWeight = 100 - presentCaWeight
  const k = BigInt(input.exam.length)

  const [cNum, cDen] = rationalSum(caTerms)
  const caPoints = caTerms.length === 0 ? 0 : Number(roundDiv(cNum, cDen)) / 100

  const [eNum, eDen] = rationalSum(input.exam.map((e) => ({
    wNum: BigInt(examWeight), wDen: k, mark: scoreOf(e), max: toCents(e.max),
  })))
  const examPoints = Number(roundDiv(eNum, eDen)) / 100

  // Sum of the two ROUNDED parts, re-rounded through cents to kill float noise.
  const finalPercent = Number(BigInt(Math.round(caPoints * 100)) + BigInt(Math.round(examPoints * 100))) / 100

  return {
    aggregated: true, finalPercent, caPoints, caWeight: presentCaWeight,
    examPoints, examWeight,
    caSlotPercents: input.ca.map((c) => (c === null ? null : pct2(c))),
    missing, absentComponents,
  }
}
