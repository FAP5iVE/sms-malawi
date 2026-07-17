/**
 * apps/web/src/server/services/placementMatchingService.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [R-PHASE]: R18 — University Placement Module (Phase 11 Blueprint)
 * [PURPOSE]: The pure eligibility-matching engine (Feature C). Given a set of
 *   MSCE subject grades and a catalogue programme's structured
 *   entryRequirements, it decides whether the candidate meets the programme's
 *   minimum entry requirements, and lists the subjects that blocked them.
 *
 *   Everything here is a PURE function of its inputs — no Prisma, no I/O, no
 *   clock. That keeps eligibility deterministic and unit-testable, and keeps
 *   the advisory nature honest: this computes "meets published minimums",
 *   never "will be admitted" (real admission also weighs quotas, cut-off
 *   points, and interviews this system cannot see).
 *
 *   MSCE-ONLY BY CONSTRUCTION. The engine consumes numeric MSCE grades
 *   (1 = best … 9 = fail) exclusively. It is never called for a JCE record —
 *   JCE uses an A–F letter scale, is a Form-2 national exam, and is not a
 *   university-entry qualification. isManebRecordPlacementReady() is the gate
 *   the caller (placementService) MUST pass a record through first; it rejects
 *   any non-MSCE or non-certified record before a single grade is compared.
 *
 *   There is deliberately NO internal-assessment trend bonus. University entry
 *   turns on the MSCE certificate alone; a student's term-by-term internal
 *   marks have no bearing on it, so blending them in would be actively
 *   misleading. `score` exists only to order recommendations for display, and
 *   is never a pass/fail threshold.
 * [DEPENDS ON]: @shared/constants/universities
 */
import 'server-only'

import {
  MSCE_CREDIT_MAX_GRADE,
  type UniversityProgram,
  type SubjectRequirement,
  type SubjectGroupRequirement,
} from '@shared/constants/universities'

/** A ManebRecord is placement-ready only when it is a CERTIFIED (or at least
 *  results-received) MSCE record carrying at least one subject grade. JCE
 *  records, un-resulted records, and empty grade maps are never ready. */
export function isManebRecordPlacementReady(record: {
  examType: string
  status: string
  subjectGrades: Record<string, string> | null | undefined
}): boolean {
  if (record.examType !== 'MSCE') return false
  if (record.status !== 'RESULTS_RECEIVED' && record.status !== 'CERTIFIED') return false
  const grades = record.subjectGrades
  if (!grades) return false
  return Object.keys(grades).length > 0
}

/** Best (lowest-numeric) grade a candidate holds among a subject and its
 *  accepted alternatives, or null if they sat none of them. */
function bestGradeAmong(
  grades: Record<string, number>,
  subject: string,
  alternatives: string[] | undefined,
): number | null {
  const candidates = [subject, ...(alternatives ?? [])]
  let best: number | null = null
  for (const name of candidates) {
    const g = grades[name]
    if (typeof g === 'number' && (best === null || g < best)) best = g
  }
  return best
}

/** True if the candidate satisfies a single mandatory subject requirement. */
function satisfiesSubject(grades: Record<string, number>, req: SubjectRequirement): boolean {
  const best = bestGradeAmong(grades, req.subject, req.alternatives)
  if (best === null) return false
  return best <= (req.maxGrade ?? MSCE_CREDIT_MAX_GRADE)
}

/** Count how many members of a group the candidate holds at the required level. */
function countGroupSatisfied(grades: Record<string, number>, group: SubjectGroupRequirement): number {
  const ceiling = group.maxGrade ?? MSCE_CREDIT_MAX_GRADE
  let count = 0
  for (const subject of group.subjects) {
    const g = grades[subject]
    if (typeof g === 'number' && g <= ceiling) count += 1
  }
  return count
}

/** Total number of credit passes (grade ≤ MSCE_CREDIT_MAX_GRADE) the
 *  candidate holds across all sat subjects. */
function countTotalCredits(grades: Record<string, number>): number {
  return Object.values(grades).filter((g) => g <= MSCE_CREDIT_MAX_GRADE).length
}

export interface EligibilityResult {
  eligible: boolean
  /** Null when the programme publishes no cut-off points; a comparison result
   *  otherwise (advisory only — never gates `eligible`). */
  meetsCutOff: boolean | null
  /** Requirement labels the candidate failed to meet (empty when eligible). */
  missingSubjects: string[]
  /** Sort key for ordering recommendations — higher is a stronger match.
   *  Never a pass/fail threshold. */
  score: number
}

/**
 * Compute whether a candidate's MSCE grades meet a programme's published
 * minimum entry requirements.
 *
 * A programme is `eligible` only when ALL of:
 *   • every mandatory subject is satisfied (best of {subject, ...alternatives}
 *     ≤ that requirement's maxGrade, defaulting to MSCE_CREDIT_MAX_GRADE),
 *   • every group meets its chooseAtLeast threshold, and
 *   • total credit count ≥ minTotalCredits.
 *
 * `meetsCutOff` is null when the programme has no published cutOffPoints;
 * otherwise it compares the candidate's aggregate of best-six credits to the
 * ceiling. It is advisory and never affects `eligible`.
 */
export function computeEligibility(
  grades: Record<string, number>,
  program: UniversityProgram,
): EligibilityResult {
  const reqs = program.entryRequirements
  // A catalogue programme with no structured requirements cannot be matched;
  // treat as not-eligible with an explanatory marker rather than silently
  // passing everyone.
  if (!reqs) {
    return { eligible: false, meetsCutOff: null, missingSubjects: ['No structured entry requirements available'], score: 0 }
  }

  const missing: string[] = []

  for (const req of reqs.mandatorySubjects) {
    if (!satisfiesSubject(grades, req)) {
      const label = req.alternatives?.length
        ? `${req.subject} (or ${req.alternatives.join(' / ')})`
        : req.subject
      missing.push(label)
    }
  }

  for (const group of reqs.groupSubjects ?? []) {
    const have = countGroupSatisfied(grades, group)
    if (have < group.chooseAtLeast) {
      missing.push(`at least ${group.chooseAtLeast} of: ${group.subjects.join(', ')}`)
    }
  }

  const totalCredits = countTotalCredits(grades)
  if (totalCredits < reqs.minTotalCredits) {
    missing.push(`${reqs.minTotalCredits} credit passes (has ${totalCredits})`)
  }

  const eligible = missing.length === 0

  // Aggregate of the best six credit grades (lower is better), used both for
  // the advisory cut-off comparison and — inverted — as the display score.
  const bestSix = Object.values(grades)
    .slice()
    .sort((a, b) => a - b)
    .slice(0, 6)
  const aggregate = bestSix.reduce((sum, g) => sum + g, 0)

  let meetsCutOff: boolean | null = null
  if (typeof program.cutOffPoints === 'number' && bestSix.length === 6) {
    meetsCutOff = aggregate <= program.cutOffPoints
  }

  // Score: eligible programmes always outrank ineligible ones; within each
  // band, a stronger (lower) aggregate scores higher. Max aggregate for six
  // grades on the 1–9 scale is 54, so (54 - aggregate) is a clean 0..48 key.
  const strength = 54 - aggregate
  const score = eligible ? 1000 + strength : strength

  return { eligible, meetsCutOff, missingSubjects: missing, score }
}

export interface ProgramRecommendation {
  universityId: string
  universityName: string
  programmeId: string
  programmeName: string
  eligible: boolean
  meetsCutOff: boolean | null
  missingSubjects: string[]
  score: number
}

/**
 * Rank every ACTIVE catalogue programme for a candidate's MSCE grades,
 * eligible programmes first, then by descending score. `programs` is the
 * flattened catalogue (from getAllPrograms()), passed in by the caller so
 * this module stays free of catalogue-iteration side effects.
 */
export function generateRecommendations(
  grades: Record<string, number>,
  programs: Array<{
    universityId: string
    universityName: string
    program: UniversityProgram
  }>,
): ProgramRecommendation[] {
  return programs
    .filter(({ program }) => program.isActive !== false)
    .map(({ universityId, universityName, program }) => {
      const result = computeEligibility(grades, program)
      return {
        universityId,
        universityName,
        programmeId: program.id,
        programmeName: program.name,
        eligible: result.eligible,
        meetsCutOff: result.meetsCutOff,
        missingSubjects: result.missingSubjects,
        score: result.score,
      }
    })
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1
      return b.score - a.score
    })
}

/**
 * Parse a ManebRecord.subjectGrades map (string grades as stored) into the
 * numeric MSCE grade map the engine consumes. Non-numeric or out-of-range
 * grade strings are dropped — an MSCE grade is always a 1–9 digit.
 */
export function parseMsceGrades(raw: Record<string, string> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  if (!raw) return out
  for (const [subject, gradeStr] of Object.entries(raw)) {
    const n = Number.parseInt(String(gradeStr).trim(), 10)
    if (Number.isInteger(n) && n >= 1 && n <= 9) out[subject] = n
  }
  return out
}
