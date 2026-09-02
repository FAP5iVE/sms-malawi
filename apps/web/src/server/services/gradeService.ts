/**
 * apps/web/src/server/services/gradeService.ts — Phase D4
 *
 * [CHANGE TYPE]: TARGETED EDIT (DEFAULT_GRADING_SCALES data correction only
 *   — calcGrade()/loadScales()/the cache mechanism are unaffected)
 * [R-PHASE]: R8 — Academics IV: Report Cards, Transcripts, Promotion & Risk
 *   Assessment
 * [PURPOSE]: Corrects the default grade boundaries/labels/pass status to
 *   the real MANEB definitions:
 *     MSCE (and INTERNAL_F3F4, same 1–9 scale): 1 & 2 = Distinction,
 *     3–6 = Credit, 7 & 8 = Pass, 9 = Fail. The previous seed data used a
 *     "Merit A/B" tier that does not exist in the real grading system, and
 *     incorrectly marked grades 7 and 8 as failing when they are in fact
 *     passing (Fail is 9 only).
 *     JCE (and INTERNAL_F1F2, same letter scale): A = Excellent,
 *     B = Very Good, C = Good, D = Average, F = Fail — five grades, not
 *     six. The previous seed data had a sixth grade (E, "Pass B") that
 *     does not exist in the real system and used "Distinction/Merit/
 *     Credit/Pass A/Pass B" labels that don't match real MANEB JCE
 *     terminology at all.
 *   seedDefaultGradingScales()/resetToDefaults() both now prune any grade
 *   row whose (examType, grade) combination is no longer part of the
 *   corrected default set (namely JCE/INTERNAL_F1F2's retired grade E)
 *   before upserting — without this, an environment that had already
 *   seeded the old six-grade JCE scale would keep a stale, orphaned E row
 *   forever, since the previous update-only (not upsert, and never
 *   delete-capable) reset logic had no way to remove a retired grade.
 * [DEPENDS ON]: none
 *
 * Configurable grading engine that replaces the hardcoded MSCE_GRADES /
 * JCE_GRADES arrays in examService.ts with DB-backed, admin-editable
 * grade boundaries.
 *
 * Cache:
 *   Grading scales are read from `grading_scales` table and held in a
 *   module-level Map for up to CACHE_TTL_MS (1 hour). The cache is
 *   invalidated explicitly by `invalidateGradeCache()` when an admin saves
 *   new grade settings in the settings UI.
 *
 * Exam type keys (stored in `GradingScale.examType`):
 *   'MSCE'           — MANEB Form 4 national exam (grades 1–9)
 *   'JCE'            — MANEB Form 2 national exam (grades A–F, 5 grades)
 *   'INTERNAL_F1F2'  — Internal exams for Form 1 & 2 (A–F scale)
 *   'INTERNAL_F3F4'  — Internal exams for Form 3 & 4 (1–9 scale)
 *
 * Default seed values match the official MANEB grading standards.
 */

import 'server-only'
import { prisma }  from '@/lib/prisma'
import { logger }  from '@/lib/logger'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface GradeRow {
  grade:      string
  minPercent: number
  maxPercent: number
  pass:       boolean
  label:      string | null
}

export interface GradeResult {
  grade: string
  pass:  boolean
  label: string | null
}

export type ExamTypeKey =
  | 'MSCE'
  | 'JCE'
  | 'INTERNAL_F1F2'
  | 'INTERNAL_F3F4'

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT SEED DATA
// Applied on first boot if the grading_scales table is empty.
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_GRADING_SCALES: Array<{
  examType:     ExamTypeKey
  grade:        string
  minPercent:   number
  maxPercent:   number
  pass:         boolean
  label:        string
  displayOrder: number
}> = [
  // MSCE — Form 4 MANEB national exam. 1&2 Distinction, 3–6 Credit,
  // 7&8 Pass, 9 Fail.
  { examType: 'MSCE', grade: '1', minPercent: 80, maxPercent: 100, pass: true,  label: 'Distinction', displayOrder: 1 },
  { examType: 'MSCE', grade: '2', minPercent: 70, maxPercent: 79,  pass: true,  label: 'Distinction', displayOrder: 2 },
  { examType: 'MSCE', grade: '3', minPercent: 60, maxPercent: 69,  pass: true,  label: 'Credit',      displayOrder: 3 },
  { examType: 'MSCE', grade: '4', minPercent: 50, maxPercent: 59,  pass: true,  label: 'Credit',      displayOrder: 4 },
  { examType: 'MSCE', grade: '5', minPercent: 40, maxPercent: 49,  pass: true,  label: 'Credit',      displayOrder: 5 },
  { examType: 'MSCE', grade: '6', minPercent: 35, maxPercent: 39,  pass: true,  label: 'Credit',      displayOrder: 6 },
  { examType: 'MSCE', grade: '7', minPercent: 30, maxPercent: 34,  pass: true,  label: 'Pass',        displayOrder: 7 },
  { examType: 'MSCE', grade: '8', minPercent: 25, maxPercent: 29,  pass: true,  label: 'Pass',        displayOrder: 8 },
  { examType: 'MSCE', grade: '9', minPercent: 0,  maxPercent: 24,  pass: false, label: 'Fail',        displayOrder: 9 },

  // JCE — Form 2 MANEB national exam. A Excellent, B Very Good, C Good,
  // D Average, F Fail — five grades.
  { examType: 'JCE', grade: 'A', minPercent: 80, maxPercent: 100, pass: true,  label: 'Excellent', displayOrder: 1 },
  { examType: 'JCE', grade: 'B', minPercent: 65, maxPercent: 79,  pass: true,  label: 'Very Good', displayOrder: 2 },
  { examType: 'JCE', grade: 'C', minPercent: 50, maxPercent: 64,  pass: true,  label: 'Good',      displayOrder: 3 },
  { examType: 'JCE', grade: 'D', minPercent: 35, maxPercent: 49,  pass: true,  label: 'Average',   displayOrder: 4 },
  { examType: 'JCE', grade: 'F', minPercent: 0,  maxPercent: 34,  pass: false, label: 'Fail',      displayOrder: 5 },

  // Internal — Form 1 & 2 (mirrors JCE's A–F scale exactly)
  { examType: 'INTERNAL_F1F2', grade: 'A', minPercent: 80, maxPercent: 100, pass: true,  label: 'Excellent', displayOrder: 1 },
  { examType: 'INTERNAL_F1F2', grade: 'B', minPercent: 65, maxPercent: 79,  pass: true,  label: 'Very Good', displayOrder: 2 },
  { examType: 'INTERNAL_F1F2', grade: 'C', minPercent: 50, maxPercent: 64,  pass: true,  label: 'Good',      displayOrder: 3 },
  { examType: 'INTERNAL_F1F2', grade: 'D', minPercent: 35, maxPercent: 49,  pass: true,  label: 'Average',   displayOrder: 4 },
  { examType: 'INTERNAL_F1F2', grade: 'F', minPercent: 0,  maxPercent: 34,  pass: false, label: 'Fail',      displayOrder: 5 },

  // Internal — Form 3 & 4 (mirrors MSCE's 1–9 scale exactly)
  { examType: 'INTERNAL_F3F4', grade: '1', minPercent: 80, maxPercent: 100, pass: true,  label: 'Distinction', displayOrder: 1 },
  { examType: 'INTERNAL_F3F4', grade: '2', minPercent: 70, maxPercent: 79,  pass: true,  label: 'Distinction', displayOrder: 2 },
  { examType: 'INTERNAL_F3F4', grade: '3', minPercent: 60, maxPercent: 69,  pass: true,  label: 'Credit',      displayOrder: 3 },
  { examType: 'INTERNAL_F3F4', grade: '4', minPercent: 50, maxPercent: 59,  pass: true,  label: 'Credit',      displayOrder: 4 },
  { examType: 'INTERNAL_F3F4', grade: '5', minPercent: 40, maxPercent: 49,  pass: true,  label: 'Credit',      displayOrder: 5 },
  { examType: 'INTERNAL_F3F4', grade: '6', minPercent: 35, maxPercent: 39,  pass: true,  label: 'Credit',      displayOrder: 6 },
  { examType: 'INTERNAL_F3F4', grade: '7', minPercent: 30, maxPercent: 34,  pass: true,  label: 'Pass',        displayOrder: 7 },
  { examType: 'INTERNAL_F3F4', grade: '8', minPercent: 25, maxPercent: 29,  pass: true,  label: 'Pass',        displayOrder: 8 },
  { examType: 'INTERNAL_F3F4', grade: '9', minPercent: 0,  maxPercent: 24,  pass: false, label: 'Fail',        displayOrder: 9 },
]

// ─────────────────────────────────────────────────────────────────────────────
// IN-PROCESS CACHE
// Each serverless function instance maintains its own cache. Given the
// Neon HTTP adapter and short Lambda warm windows, this is an in-process
// Map that expires after CACHE_TTL_MS. Use invalidateGradeCache() after
// admin updates to force the next caller to refresh from the DB.
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60 * 60 * 1000   // 1 hour

let _cache: Map<ExamTypeKey, GradeRow[]> | null = null
let _cacheExpiry = 0

export function invalidateGradeCache(): void {
  _cache = null
  _cacheExpiry = 0
}

async function loadScales(): Promise<Map<ExamTypeKey, GradeRow[]>> {
  if (_cache && Date.now() < _cacheExpiry) return _cache

  const rows = await prisma.gradingScale.findMany({
    where:   { isActive: true },
    orderBy: { displayOrder: 'asc' },
  })

  if (rows.length === 0) {
    // First-run seed: populate the table with MANEB defaults
    await seedDefaultGradingScales()
    return loadScales()
  }

  const map = new Map<ExamTypeKey, GradeRow[]>()
  for (const r of rows) {
    const key = r.examType as ExamTypeKey
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push({
      grade:      r.grade,
      minPercent: r.minPercent,
      maxPercent: r.maxPercent,
      pass:       r.pass,
      label:      r.label,
    })
  }

  _cache = map
  _cacheExpiry = Date.now() + CACHE_TTL_MS
  return map
}

// ─────────────────────────────────────────────────────────────────────────────
// PRUNE STALE GRADES
// Removes any (examType, grade) row no longer present in
// DEFAULT_GRADING_SCALES — e.g. JCE/INTERNAL_F1F2's retired grade E.
// Without this, an environment that had already seeded the old six-grade
// scale would keep a stale, orphaned row forever, since neither seed nor
// reset previously had a delete path.
// ─────────────────────────────────────────────────────────────────────────────

async function pruneStaleGrades(): Promise<void> {
  const validCombos = new Set(DEFAULT_GRADING_SCALES.map((s) => `${s.examType}:${s.grade}`))
  const examTypes = Array.from(new Set(DEFAULT_GRADING_SCALES.map((s) => s.examType)))

  const existing = await prisma.gradingScale.findMany({
    where:  { examType: { in: examTypes } },
    select: { id: true, examType: true, grade: true },
  })
  const staleIds = existing
    .filter((r) => !validCombos.has(`${r.examType}:${r.grade}`))
    .map((r) => r.id)

  if (staleIds.length > 0) {
    await prisma.gradingScale.deleteMany({ where: { id: { in: staleIds } } })
    logger.info(
      { event: 'grading.pruned_stale', count: staleIds.length },
      'Removed grade rows no longer present in the default scale',
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SEED
// ─────────────────────────────────────────────────────────────────────────────

export async function seedDefaultGradingScales(): Promise<void> {
  await pruneStaleGrades()
  await prisma.$transaction(
    DEFAULT_GRADING_SCALES.map((scale) =>
      prisma.gradingScale.upsert({
        where:  { examType_grade: { examType: scale.examType, grade: scale.grade } },
        create: scale,
        update: {},   // Never overwrite existing customised scales on seed
      }),
    ),
  )
  logger.info({ event: 'grading.seeded' }, 'Default grading scales seeded')
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE: calcGrade
// Drop-in async replacement for the hardcoded calcGrade in examService.ts.
//
// examType mapping:
//   'MANEB_MSCE'  → 'MSCE'
//   'MANEB_JCE'   → 'JCE'
//   anything else → 'INTERNAL_F1F2' (forms 1–2) | 'INTERNAL_F3F4' (forms 3–4)
// ─────────────────────────────────────────────────────────────────────────────

export async function calcGrade(
  percentage: number,
  examType:   string,
  classForm?: number,
): Promise<GradeResult> {
  const scales = await loadScales()

  let key: ExamTypeKey
  if (examType === 'MANEB_MSCE') {
    key = 'MSCE'
  } else if (examType === 'MANEB_JCE') {
    key = 'JCE'
  } else {
    key = classForm !== undefined && classForm >= 3
      ? 'INTERNAL_F3F4'
      : 'INTERNAL_F1F2'
  }

  const table = scales.get(key) ?? []
  const match = table.find((g) => percentage >= g.minPercent)
  return match ?? { grade: 'F', pass: false, label: 'Fail' }
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function listGradingScales() {
  return prisma.gradingScale.findMany({ orderBy: [{ examType: 'asc' }, { displayOrder: 'asc' }] })
}

export interface UpdateGradeScaleInput {
  minPercent: number
  maxPercent: number
  pass:       boolean
  label?:     string
}

export async function updateGradeScale(
  id:          string,
  input:       UpdateGradeScaleInput,
  actorUid:    string,
): Promise<void> {
  await prisma.gradingScale.update({
    where: { id },
    data:  { ...input, updatedByUid: actorUid },
  })
  invalidateGradeCache()
  logger.info({ event: 'grading.updated', id, actorUid })
}

export async function resetToDefaults(actorUid: string): Promise<void> {
  await pruneStaleGrades()
  await prisma.$transaction(
    DEFAULT_GRADING_SCALES.map((scale) =>
      prisma.gradingScale.upsert({
        where: { examType_grade: { examType: scale.examType, grade: scale.grade } },
        create: { ...scale, updatedByUid: actorUid },
        update: {
          minPercent:   scale.minPercent,
          maxPercent:   scale.maxPercent,
          pass:         scale.pass,
          label:        scale.label,
          displayOrder: scale.displayOrder,
          updatedByUid: actorUid,
        },
      }),
    ),
  )
  invalidateGradeCache()
  logger.info({ event: 'grading.reset', actorUid })
}

// ─────────────────────────────────────────────────────────────────────────────
// GRADE LOOKUP BY LETTER/NUMBER (no percentage available)
// Used for MANEB-sourced grades (ManebRecord.subjectGrades) — MANEB reports
// an already-assigned grade per subject, never a raw percentage, so these
// let promotionService.ts resolve pass/fail and distinction/credit tier
// directly from the grade itself. Backed by the same DB scale calcGrade()
// uses — one grading authority, whether the caller has a percentage or a
// pre-assigned grade.
// ─────────────────────────────────────────────────────────────────────────────

export async function getGradeInfo(examType: ExamTypeKey, grade: string): Promise<GradeResult | null> {
  const scales = await loadScales()
  const row = (scales.get(examType) ?? []).find((g) => g.grade === grade)
  return row ? { grade: row.grade, pass: row.pass, label: row.label } : null
}

/** True if the grade is better than a bare "Pass" — i.e. a Distinction or
 *  Credit-tier grade (MSCE/INTERNAL_F3F4: grades 1–6; JCE/INTERNAL_F1F2 has
 *  no such tier since its scale has no "Pass"-labelled grade at all). Used
 *  by promotionService.ts's MSCE-style promotion rule, which requires a
 *  minimum count of distinction/credit grades, not just passing grades. */
export async function isDistinctionOrCredit(examType: ExamTypeKey, grade: string): Promise<boolean> {
  const info = await getGradeInfo(examType, grade)
  if (!info || !info.pass) return false
  return (info.label ?? '').trim().toLowerCase() !== 'pass'
}

// ─────────────────────────────────────────────────────────────────────────────
// PASS MARK UTILITY
// Returns the minimum percentage required to pass, sourced from settings
// or falling back to the lowest passing grade in the MSCE/JCE scale.
// ─────────────────────────────────────────────────────────────────────────────

export async function getPassMarkThreshold(
  examType: 'MSCE' | 'JCE' | 'INTERNAL_F1F2' | 'INTERNAL_F3F4',
): Promise<number> {
  const scales = await loadScales()
  const table  = scales.get(examType) ?? []
  const lowestPass = table.filter((g) => g.pass).at(-1)
  return lowestPass?.minPercent ?? 35
}

// ─────────────────────────────────────────────────────────────────────────────
// GR-2 [MANEB CORRECTION]: MANEB OUTCOME — JCE and MSCE never share a
// calculation path (each exam produces a fundamentally different result
// shape), per MANEB's official rules:
//
//   JCE  — letter grades only. MANEB computes NO numeric aggregate, total,
//          average, or points for JCE — there is no JCE equivalent of the
//          MSCE 6–54 point aggregate. A JCE result is a letter grade per
//          subject plus an overall PASS/FAIL (≥6 subjects passed, English
//          among them). `points` is always null for JCE.
//
//   MSCE — two DISTINCT, independent computations that must not be
//          conflated:
//            1. Aggregate points: the sum of the point values of the
//               candidate's best six PERFORMED subjects (lowest points =
//               best), full stop. English is included in that sum only if
//               it naturally lands among those six lowest — it is never
//               force-included. If a candidate performed fewer than six
//               subjects, no six-subject aggregate exists (points = null).
//            2. Certificate eligibility: a subject-count/pass-fail gate,
//               independent of point ranking. Awarded when EITHER
//                 Option A — 6 subjects passed (incl. English), ≥1 of them
//                            Distinction/Credit (grade 1–6), or
//                 Option B — 5 subjects passed (incl. English), ≥3 of them
//                            Distinction/Credit (grade 1–6)
//               is satisfied. This uses ALL of the candidate's passed
//               subjects, not just the six in the aggregate sum — a
//               candidate can qualify under Option B on exactly 5 subjects
//               even though that's one short of a valid 6-subject
//               aggregate.
//
// A grade's point value is its 1-based rank on the scale (MSCE 1–9 → 1..9;
// JCE A–F → 1..5), sourced from the same DB-backed grading scale calcGrade()
// uses. Lower is better.
// ─────────────────────────────────────────────────────────────────────────────

export interface JceOutcome {
  examType:        'JCE'
  /** JCE has no numeric aggregate — always null. Field kept so callers can
   *  read `.points`/`.classification` across both outcome shapes uniformly. */
  points:          null
  /** 'PASS' | 'FAIL' | 'Incomplete' (no subject grades recorded at all). */
  classification:  string
  /** Overall PASS/FAIL — ≥6 subjects passed, English among them. */
  pass:            boolean
  passedSubjects:  number
  totalSubjects:   number
  englishPassed:   boolean
}

export interface MsceOutcome {
  examType:            'MSCE'
  /** Sum of the best-six PERFORMED subjects' points (range 6–54); null if
   *  fewer than six subjects were performed — no six-subject sum exists. */
  points:              number | null
  /** 'MSCE Awarded — Option A' | 'MSCE Awarded — Option B' |
   *  'MSCE Not Awarded' | 'Incomplete' (no subject grades recorded at all). */
  classification:      string
  /** Certificate awarded — Option A or Option B satisfied (§4.3). */
  pass:                boolean
  certificateOption:   'A' | 'B' | null
  /** Names of the (up to 6) subjects whose points make up the aggregate
   *  sum — empty when points is null. */
  aggregateSubjects:   string[]
  /** Whether English happened to be one of the best-six subjects — NOT
   *  whether English was passed (that's a separate, eligibility-only fact). */
  englishInAggregate:  boolean
  totalSubjects:       number
}

export type ManebOutcome = JceOutcome | MsceOutcome

function isEnglishSubject(subject: string): boolean {
  return /english/i.test(subject)
}

async function computeJceOutcome(subjectGrades: Record<string, string>): Promise<JceOutcome> {
  const scales = await loadScales()
  const table  = scales.get('JCE') ?? []
  const passOf = (grade: string): boolean => table.find((g) => g.grade === grade)?.pass ?? false
  const isKnownGrade = (grade: string): boolean => table.some((g) => g.grade === grade)

  const entries       = Object.entries(subjectGrades).filter(([, grade]) => isKnownGrade(grade))
  const totalSubjects = entries.length
  const passedEntries = entries.filter(([, grade]) => passOf(grade))
  const passedSubjects = passedEntries.length
  const englishPassed  = passedEntries.some(([subject]) => isEnglishSubject(subject))

  const pass = passedSubjects >= 6 && englishPassed
  const classification = totalSubjects === 0 ? 'Incomplete' : (pass ? 'PASS' : 'FAIL')

  return { examType: 'JCE', points: null, classification, pass, passedSubjects, totalSubjects, englishPassed }
}

async function computeMsceOutcome(subjectGrades: Record<string, string>): Promise<MsceOutcome> {
  const scales = await loadScales()
  const table  = scales.get('MSCE') ?? []   // ordered by displayOrder asc — index+1 is the grade's point value

  const pointOf = (grade: string): number | null => {
    const idx = table.findIndex((g) => g.grade === grade)
    return idx === -1 ? null : idx + 1
  }
  const isCreditTier = (grade: string): boolean => {
    const row = table.find((g) => g.grade === grade)
    if (!row || !row.pass) return false
    return (row.label ?? '').trim().toLowerCase() !== 'pass'   // Distinction (1–2) or Credit (3–6); excludes bare "Pass" (7–8)
  }
  const passOf = (grade: string): boolean => table.find((g) => g.grade === grade)?.pass ?? false

  const performed = Object.entries(subjectGrades)
    .map(([subject, grade]) => ({ subject, grade, points: pointOf(grade) }))
    .filter((x): x is { subject: string; grade: string; points: number } => x.points !== null)
  const totalSubjects = performed.length

  // ── 1. Aggregate: sum of the best six PERFORMED subjects, no English
  //      carve-out. English lands in the sum only if it's genuinely there.
  let points: number | null = null
  let aggregateSubjects: string[] = []
  let englishInAggregate = false
  if (totalSubjects >= 6) {
    const ranked = [...performed].sort((a, b) => a.points - b.points).slice(0, 6)
    points             = ranked.reduce((sum, x) => sum + x.points, 0)
    aggregateSubjects  = ranked.map((x) => x.subject)
    englishInAggregate = ranked.some((x) => isEnglishSubject(x.subject))
  }

  // ── 2. Certificate eligibility: Option A / Option B over ALL passed
  //      subjects — a wholly separate subject set from the aggregate above.
  const passed         = performed.filter((x) => passOf(x.grade))
  const englishPassed  = passed.some((x) => isEnglishSubject(x.subject))
  const creditOrBetter = passed.filter((x) => isCreditTier(x.grade)).length

  let certificateOption: 'A' | 'B' | null = null
  if (englishPassed) {
    if (passed.length >= 6 && creditOrBetter >= 1) certificateOption = 'A'
    else if (passed.length >= 5 && creditOrBetter >= 3) certificateOption = 'B'
  }
  const pass = certificateOption !== null

  const classification =
    totalSubjects === 0 ? 'Incomplete' : (pass ? `MSCE Awarded — Option ${certificateOption}` : 'MSCE Not Awarded')

  return {
    examType: 'MSCE', points, classification, pass, certificateOption,
    aggregateSubjects, englishInAggregate, totalSubjects,
  }
}

export async function computeManebAggregate(
  examType:      'JCE' | 'MSCE',
  subjectGrades: Record<string, string>,
): Promise<ManebOutcome> {
  return examType === 'JCE' ? computeJceOutcome(subjectGrades) : computeMsceOutcome(subjectGrades)
}

/** The set of passing grade strings for an exam type (subject-level pass
 *  detection for MANEB analytics — one scale load, membership test after). */
export async function getPassingGrades(examType: ExamTypeKey): Promise<Set<string>> {
  const scales = await loadScales()
  return new Set((scales.get(examType) ?? []).filter((g) => g.pass).map((g) => g.grade))
}

/** True if the grade is specifically Distinction-tier (MSCE/INTERNAL_F3F4
 *  grades 1–2, label "Distinction") — stricter than isDistinctionOrCredit,
 *  which also counts Credit (3–6). Used for "at least one distinction"
 *  style analytics, kept separate from certificate-eligibility logic above. */
export async function isDistinctionGrade(examType: ExamTypeKey, grade: string): Promise<boolean> {
  const info = await getGradeInfo(examType, grade)
  if (!info || !info.pass) return false
  return (info.label ?? '').trim().toLowerCase() === 'distinction'
}

/** Whether an overall MANEB classification label counts as a pass. Handles
 *  both JCE ('PASS' / 'FAIL') and MSCE ('MSCE Awarded — Option A/B' /
 *  'MSCE Not Awarded') vocabularies, plus the shared 'Incomplete'. */
export function isPassingClassification(label: string | null | undefined): boolean {
  if (!label) return false
  const l = label.trim().toLowerCase()
  if (l === 'incomplete') return false
  if (l === 'fail') return false
  if (l.includes('not awarded')) return false
  return true
}