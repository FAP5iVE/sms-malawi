/**
 * apps/web/src/server/services/matching/index.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Orchestrates the four stages into one entry point. Reuses the
 *   EXISTING, already-correct eligibility+base-relevance engine
 *   (placementMatchingService.generateRecommendations — Stage A and the
 *   non-preference part of Stage B) rather than reimplementing it, and
 *   layers preference filtering, diversification, and explanation on top.
 *
 *   Stage D degrade path: tries the full AND-filtered tier first (every set
 *   preference is a hard requirement); if that yields fewer than
 *   MIN_RESULTS_BEFORE_RELAX, drops the career preference and retries
 *   (field, if set, stays hard-required); if STILL short, drops field too
 *   and returns everything eligible. Every response says exactly which
 *   tier it is — a relaxed tier is never silently blended with a full-match
 *   one.
 *
 *   This file is intentionally the only place that knows about tiering —
 *   scoring.ts and diversify.ts are pure functions that just do what
 *   they're told for one pass.
 * [DEPENDS ON]: placementMatchingService (generateRecommendations),
 *   ./scoring, ./diversify, ./types
 */
import { generateRecommendations, type ProgramRecommendation } from '@/server/services/placementMatchingService'
import { getAllPrograms } from '@shared/constants/universities'
import { scoreCandidate } from './scoring'
import { diversify, MAX_PROGRAMMES_PER_UNIVERSITY } from './diversify'
import type { MatchPreferences, MatchedProgramme, MatchResult, AppliedTier } from './types'

export { MAX_PROGRAMMES_PER_UNIVERSITY }
export const MIN_RESULTS_BEFORE_RELAX = 5
export const RESULT_PAGE_SIZE = 10

function runPass(
  eligible: ProgramRecommendation[],
  preferences: MatchPreferences,
  filterFlags: { requireField: boolean; requireCareer: boolean },
): MatchedProgramme[] {
  const scored = eligible
    .map((rec) => scoreCandidate(rec, preferences, filterFlags))
    .filter((c) => c.passesFilters)
    .sort((a, b) => b.recommendation.score - a.recommendation.score)

  const diversified = diversify(
    scored.map((c) => ({ ...c, universityId: c.recommendation.universityId, score: c.recommendation.score })),
    { cap: MAX_PROGRAMMES_PER_UNIVERSITY, limit: RESULT_PAGE_SIZE },
  )

  return diversified.map((c) => ({ recommendation: c.recommendation, explanation: c.explanation }))
}

/**
 * The main entry point. `grades` are the candidate's subject grades (same
 * shape the existing Advisory calculator already collects); `preferences`
 * are the two new optional selects. Always returns a page of at most
 * RESULT_PAGE_SIZE results, capped per university, tagged with which tier
 * actually produced them.
 */
export function matchProgrammes(
  grades: Record<string, number>,
  preferences: MatchPreferences = {},
): MatchResult {
  const allPrograms = getAllPrograms().map(({ university, program }) => ({
    universityId: university.id,
    universityName: university.name,
    program,
  }))

  // Stage A + base Stage B — unchanged, already-correct engine.
  const ranked = generateRecommendations(grades, allPrograms)
  const eligible = ranked.filter((r) => r.eligible)

  const hasField = preferences.fieldCategory != null
  const hasCareer = preferences.careerTag != null

  // Tier 1: full AND — every set preference is a hard requirement.
  let results = runPass(eligible, preferences, { requireField: hasField, requireCareer: hasCareer })
  let appliedTier: AppliedTier = { tier: 'full', droppedCareerTag: false, droppedFieldCategory: false }

  // Tier 2: drop career first (per the brief's explicit ordering), keep
  // field hard if it was set. Only attempted if career was actually set —
  // dropping a preference that was never set changes nothing.
  if (results.length < MIN_RESULTS_BEFORE_RELAX && hasCareer) {
    results = runPass(eligible, preferences, { requireField: hasField, requireCareer: false })
    appliedTier = { tier: 'relaxed_no_career', droppedCareerTag: true, droppedFieldCategory: false }
  }

  // Tier 3: drop field too — down to eligibility alone (still never
  // dropping the hard grades/points requirement itself).
  if (results.length < MIN_RESULTS_BEFORE_RELAX && hasField) {
    results = runPass(eligible, preferences, { requireField: false, requireCareer: false })
    appliedTier = { tier: 'relaxed_no_preferences', droppedCareerTag: hasCareer, droppedFieldCategory: true }
  }

  return { results, appliedTier }
}
