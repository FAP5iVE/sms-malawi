/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: packages/shared/constants/admissions.ts
 * [R-PHASE]: R16 — Constants Centralization (Phase 10B Plan)
 * [PURPOSE]: Admissions-domain reference data. GUARDIAN_RELATIONSHIPS is moved
 *   verbatim from apply/page.tsx (kept separate from malawi/ because
 *   guardian-relationship categories are admissions-domain data, not a
 *   Malawi-regional fact).
 * [DEPENDS ON]: none
 */

// ─── GUARDIAN RELATIONSHIPS ──────────────────────────────
export const GUARDIAN_RELATIONSHIPS = [
  'Father',
  'Mother',
  'Guardian',
  'Uncle',
  'Aunt',
  'Grandparent',
  'Elder Sibling',
  'Other Relative',
  'Other',
] as const

export type GuardianRelationship = (typeof GUARDIAN_RELATIONSHIPS)[number]
