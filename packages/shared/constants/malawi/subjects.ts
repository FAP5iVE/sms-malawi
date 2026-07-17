/**
 * [CHANGE TYPE]: NEW FILE (extracted from malawi.ts)
 * [FILE]: packages/shared/constants/malawi/subjects.ts
 * [R-PHASE]: R16 — Constants Centralization (Phase 10B Plan)
 * [PURPOSE]: The Malawi secondary-curriculum subject list. Retained verbatim
 *   from malawi.ts; ExamForm.tsx reaches it unchanged through the preserved
 *   @shared/constants/malawi barrel.
 * [DEPENDS ON]: none
 */

// ─── MALAWI SUBJECTS ─────────────────────────────────────
export const MALAWI_SUBJECTS = [
  'English',
  'Chichewa',
  'Mathematics',
  'Biology',
  'Chemistry',
  'Physics',
  'History',
  'Geography',
  'Life Skills',
  'Agriculture',
  'Computer Studies',
  'Physical Education',
  'Bible Knowledge',
  'Home Economics',
  'Art',
  'Music',
  'Social Studies',
  'Business Studies',
  'French',
  'German',
  'Spanish',
  'Technical Drawing',
  'Woodwork',
  'Metal Work',
  'Creative Arts',
  'Performing Arts',
  'Religious and Moral Education',
] as const

export type MalawiSubject = (typeof MALAWI_SUBJECTS)[number]
