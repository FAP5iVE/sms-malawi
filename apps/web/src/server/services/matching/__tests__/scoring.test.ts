/**
 * scoring.test.ts
 * [CHANGE TYPE]: NEW FILE
 */
import { describe, it, expect } from 'vitest'
import { scoreCandidate, SOFT_PREFERENCE_NUDGE } from '../scoring'
import type { ProgramRecommendation } from '@/server/services/placementMatchingService'

function makeRec(overrides: Partial<ProgramRecommendation> = {}): ProgramRecommendation {
  return {
    universityId: 'must', universityName: 'Malawi University of Science and Technology',
    programmeId: 'must-computer-science', programmeName: 'Bachelor of Science in Computer Science',
    faculty: 'School of Science and Technology',
    durationYears: 4, cutOffPoints: 14, minimumRequirements: [],
    eligible: true, meetsCutOff: true, missingSubjects: [], prerequisiteAudit: [],
    aggregate: 12, score: 1040,
    ...overrides,
  }
}

describe('scoreCandidate', () => {
  it('with no preferences set, passes filters and adds no bonus', () => {
    const result = scoreCandidate(makeRec(), {}, { requireField: false, requireCareer: false })
    expect(result.passesFilters).toBe(true)
    expect(result.explanation.scoreBreakdown.fieldBonus).toBe(0)
    expect(result.explanation.scoreBreakdown.careerBonus).toBe(0)
    expect(result.recommendation.score).toBe(1040)
  })

  it('hard-filters out a programme that does not match a required field preference', () => {
    const result = scoreCandidate(
      makeRec({ faculty: 'Faculty of Agriculture' }), // -> AGRICULTURE_NATURAL_RESOURCES
      { fieldCategory: 'SCIENCE_TECHNOLOGY' },
      { requireField: true, requireCareer: false },
    )
    expect(result.passesFilters).toBe(false)
  })

  it('passes a programme whose field genuinely matches a required field preference', () => {
    const result = scoreCandidate(
      makeRec({ faculty: 'School of Science and Technology' }),
      { fieldCategory: 'SCIENCE_TECHNOLOGY' },
      { requireField: true, requireCareer: false },
    )
    expect(result.passesFilters).toBe(true)
    // Hard-filtered preference never gets a redundant bonus — every
    // survivor already matches, so a bonus here would be a meaningless
    // constant, not a real ranking signal.
    expect(result.explanation.scoreBreakdown.fieldBonus).toBe(0)
  })

  it('hard-filters on career tag the same way as field', () => {
    const result = scoreCandidate(
      makeRec({ programmeName: 'Bachelor of Science in Crop Sciences' }), // -> Agriculture tag
      { careerTag: 'Medicine' },
      { requireField: false, requireCareer: true },
    )
    expect(result.passesFilters).toBe(false)
  })

  it('AND semantics: a programme matching career but not field is excluded when both are required', () => {
    const result = scoreCandidate(
      makeRec({ faculty: 'Faculty of Agriculture', programmeName: 'Bachelor of Science in Agricultural Engineering' }),
      { fieldCategory: 'HEALTH_MEDICAL', careerTag: 'Engineering' }, // matches career, not field
      { requireField: true, requireCareer: true },
    )
    expect(result.explanation.matchedPreferredCareer).toBe(true)
    expect(result.explanation.matchedPreferredField).toBe(false)
    expect(result.passesFilters).toBe(false) // AND, not OR — one mismatch is enough to exclude
  })

  it('in a relaxed pass (requireCareer=false), a dropped-but-still-matching career gets a soft nudge, not exclusion', () => {
    const result = scoreCandidate(
      makeRec({ programmeName: 'Bachelor of Medicine, Bachelor of Surgery (MBBS)', score: 1020 }),
      { careerTag: 'Medicine' },
      { requireField: false, requireCareer: false }, // career preference has been relaxed this pass
    )
    expect(result.passesFilters).toBe(true) // never excluded once relaxed
    expect(result.explanation.matchedPreferredCareer).toBe(true) // still recorded as a genuine match
    expect(result.explanation.scoreBreakdown.careerBonus).toBe(SOFT_PREFERENCE_NUDGE)
    expect(result.recommendation.score).toBe(1020 + SOFT_PREFERENCE_NUDGE)
  })

  it('the soft nudge never lets a preference-matching programme outrank a materially stronger academic fit', () => {
    // A weak-but-preference-matching programme should not leapfrog a much
    // stronger non-matching one just from the nudge — the nudge is tuned
    // small relative to real score gaps between eligible programmes.
    const weakButMatching = scoreCandidate(
      makeRec({ programmeName: 'Bachelor of Medicine, Bachelor of Surgery (MBBS)', score: 900 }),
      { careerTag: 'Medicine' },
      { requireField: false, requireCareer: false },
    )
    const strongNonMatching = scoreCandidate(
      makeRec({ programmeName: 'Bachelor of Science in Computer Science', score: 1040 }),
      { careerTag: 'Medicine' },
      { requireField: false, requireCareer: false },
    )
    expect(strongNonMatching.recommendation.score).toBeGreaterThan(weakButMatching.recommendation.score)
  })
})
