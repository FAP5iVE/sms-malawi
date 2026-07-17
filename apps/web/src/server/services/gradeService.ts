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