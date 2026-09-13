/**
 * apps/web/src/server/services/matching/types.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Shared types across the matching pipeline's stages.
 */
import type { ProgramRecommendation, PrerequisiteAuditRow } from '@/server/services/placementMatchingService'
import type { FieldCategory, CareerField } from './taxonomy'

export interface MatchPreferences {
  fieldCategory?: FieldCategory
  careerTag?: CareerField
}

/** Which preferences actually applied to produce a given result set — the
 *  degrade path (Stage D) drops careerTag first, then fieldCategory, so the
 *  caller/UI always knows exactly which tier it's looking at. */
export interface AppliedTier {
  tier: 'full' | 'relaxed_no_career' | 'relaxed_no_preferences'
  droppedCareerTag: boolean
  droppedFieldCategory: boolean
}

/** Why a specific programme was suggested — the transparency requirement.
 *  eligibilityAudit is always present (every result is eligible); the two
 *  preference flags are only meaningful in the tier they were still applied
 *  in — see AppliedTier. */
export interface MatchExplanation {
  eligibilityAudit: PrerequisiteAuditRow[]
  fieldCategory: FieldCategory | null
  careerTags: CareerField[]
  matchedPreferredField: boolean
  matchedPreferredCareer: boolean
  /** Component scores that summed to the final score — for debugging/audit,
   *  not shown verbatim to students but available to the UI if useful. */
  scoreBreakdown: {
    base: number           // eligibility+relevance score from the existing engine
    fieldBonus: number
    careerBonus: number
    total: number
  }
}

export interface MatchedProgramme {
  recommendation: ProgramRecommendation
  explanation: MatchExplanation
}

export interface MatchResult {
  results: MatchedProgramme[]
  appliedTier: AppliedTier
}
