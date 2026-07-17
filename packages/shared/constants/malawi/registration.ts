/**
 * [CHANGE TYPE]: NEW FILE (extracted from malawi.ts)
 * [FILE]: packages/shared/constants/malawi/registration.ts
 * [R-PHASE]: R16 — Constants Centralization (Phase 10B Plan)
 * [PURPOSE]: Student registration-number generator. Retained verbatim from
 *   malawi.ts; studentService.ts reaches it unchanged through the preserved
 *   @shared/constants/malawi barrel.
 * [DEPENDS ON]: none
 */

// ─── REGISTRATION NUMBER GENERATOR ───────────────────────
export function generateRegistrationNo(year: number, sequence: number): string {
  return `MYSS-${year}-${String(sequence).padStart(4, '0')}`
}
