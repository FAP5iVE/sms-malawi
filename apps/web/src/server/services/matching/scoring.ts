/**
 * apps/web/src/server/services/matching/scoring.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Stage B (preference-aware extension) — takes the existing
 *   engine's base eligibility+relevance score (placementMatchingService's
 *   computeEligibility, already correct and unchanged) and applies field/
 *   career preferences on top.
 *
 *   DESIGN DECISION (the crux of "AND, not OR" at the scoring level, per
 *   the original brief): a preference is a HARD FILTER within whichever
 *   tier it's still active in — see index.ts's tiering — never a bonus
 *   that lets a weak-fit programme outrank a strong one just because it
 *   happens to also match a preference. There is deliberately no
 *   "additive bonus that never excludes" mode: once a preference is set,
 *   every result in that tier genuinely satisfies it.
 *
 *   The one place a preference still influences scoring softly is AFTER
 *   it's been dropped by the degrade path (index.ts tries the full
 *   AND-filtered tier first, then relaxes career, then field, if results
 *   run short — see requirement 3.7). In a relaxed tier, a dropped
 *   preference no longer excludes anything, but still nudges genuinely
 *   matching programmes toward the top of that relaxed list — so a
 *   student's stated interest isn't wasted just because it couldn't be
 *   fully honored, without pretending the relaxed tier is still a full
 *   match for everyone in it. This function takes explicit `requireField`/
 *   `requireCareer` flags so index.ts controls this per tier — it never
 *   decides tiering itself.
 */
import type { ProgramRecommendation } from '@/server/services/placementMatchingService'
import { getFieldCategory, deriveCareerTags, type FieldCategory } from './taxonomy'
import type { MatchPreferences, MatchExplanation } from './types'

// Soft nudge only — applied in a relaxed tier to a dropped preference that
// still happens to match. Deliberately small relative to the base engine's
// score range (see placementMatchingService: eligible programmes score
// 1000+, so a nudge in the tens can reorder among already-eligible,
// already-tied-ish programmes without ever letting preference override a
// materially stronger academic fit).
export const SOFT_PREFERENCE_NUDGE = 20

export interface ScoredCandidate {
  recommendation: ProgramRecommendation
  explanation: MatchExplanation
  /** Null means: this programme was excluded by a hard-filtered preference
   *  in this pass. Callers filter these out before diversification. */
  passesFilters: boolean
}

export function scoreCandidate(
  recommendation: ProgramRecommendation,
  preferences: MatchPreferences,
  filterFlags: { requireField: boolean; requireCareer: boolean },
): ScoredCandidate {
  const fieldCategory = deriveFieldFromRecommendation(recommendation)
  const careerTags = deriveCareerTags({ id: recommendation.programmeId, name: recommendation.programmeName, isActive: true } as never)

  const matchedPreferredField = preferences.fieldCategory != null && fieldCategory === preferences.fieldCategory
  const matchedPreferredCareer = preferences.careerTag != null && careerTags.includes(preferences.careerTag)

  const failsHardField = filterFlags.requireField && preferences.fieldCategory != null && !matchedPreferredField
  const failsHardCareer = filterFlags.requireCareer && preferences.careerTag != null && !matchedPreferredCareer

  let fieldBonus = 0
  let careerBonus = 0
  // Soft nudges only apply when NOT hard-filtering that preference this
  // pass (a hard-filtered preference is already guaranteed true for every
  // survivor, so a bonus there would just be a constant — meaningless).
  if (!filterFlags.requireField && matchedPreferredField) fieldBonus = SOFT_PREFERENCE_NUDGE
  if (!filterFlags.requireCareer && matchedPreferredCareer) careerBonus = SOFT_PREFERENCE_NUDGE

  const base = recommendation.score
  const total = base + fieldBonus + careerBonus

  return {
    recommendation: { ...recommendation, score: total },
    explanation: {
      eligibilityAudit: recommendation.prerequisiteAudit,
      fieldCategory,
      careerTags,
      matchedPreferredField,
      matchedPreferredCareer,
      scoreBreakdown: { base, fieldBonus, careerBonus, total },
    },
    passesFilters: !failsHardField && !failsHardCareer,
  }
}

// recommendation carries faculty indirectly (it's flattened off the
// programme already, not the programme object itself) — getFieldCategory
// needs the original programme shape, so this small helper re-derives it
// from the recommendation's own faculty field (ProgramRecommendation
// already carries `faculty` — see placementMatchingService.ts).
function deriveFieldFromRecommendation(recommendation: ProgramRecommendation): FieldCategory | null {
  if (!recommendation.faculty) return null
  return getFieldCategory({ faculty: recommendation.faculty } as never)
}
