/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: packages/shared/constants/malawi/demographics.ts
 * [PURPOSE]: Option lists and enum values for the demographic fields added to
 *   students, applications and staff. Same pattern as GUARDIAN_RELATIONSHIPS in
 *   constants/admissions.ts: `as const` arrays so `z.enum()` and the form
 *   <select>s read from ONE list. Enum values mirror the Prisma enums of the
 *   same name; keep them close to the Ministry's census categories so an annual
 *   census export is a mapping exercise.
 *
 *   Free-text fields that deliberately have NO list here: traditionalAuthority
 *   (a per-district lookup can be added later from an official source) and NRB
 *   number format (not enforced until verified with NRB - length and
 *   uniqueness only).
 * [DEPENDS ON]: none
 */

// ── Religion / home language (stored as plain strings, so legacy and "Other"
//    values stay valid; these lists only drive the form <select>s) ──────────
export const RELIGIONS = [
  'Christianity',
  'Islam',
  'African traditional religion',
  'Hinduism',
  "Bahá'í",
  'No religion',
  'Other',
] as const

export const HOME_LANGUAGES = [
  'Chichewa',
  'Chitumbuka',
  'Chiyao',
  'Chilomwe',
  'Chisena',
  'Chitonga',
  'Chingoni',
  'Chisenga',
  'Chilambya',
  'Chinyakyusa',
  'English',
  'Other',
] as const

// ── Student residence / admission ────────────────────────────────────────────
export const RESIDENCE_TYPES = ['DAY_HOME', 'BOARDER', 'LODGING', 'WITH_RELATIVE'] as const
export type ResidenceTypeValue = (typeof RESIDENCE_TYPES)[number]

export const RESIDENCE_TYPE_LABELS: Record<ResidenceTypeValue, string> = {
  DAY_HOME:      'Day scholar (lives at home)',
  BOARDER:       'Boarder',
  LODGING:       'Lodging / rented room',
  WITH_RELATIVE: 'Stays with a relative',
}

export const ADMISSION_TYPES = ['NEW_INTAKE', 'TRANSFER_IN', 'RETURNEE'] as const
export type AdmissionTypeValue = (typeof ADMISSION_TYPES)[number]

export const ADMISSION_TYPE_LABELS: Record<AdmissionTypeValue, string> = {
  NEW_INTAKE:  'New intake',
  TRANSFER_IN: 'Transferred in',
  RETURNEE:    'Returnee (readmitted)',
}

/** Travel time bounds (minutes, one way). Zod uses these; the form mirrors them. */
export const TRAVEL_MINUTES_MAX = 600

/** NRB number: length only. The format is NOT enforced until verified with NRB. */
export const NRB_NUMBER_MIN = 5
export const NRB_NUMBER_MAX = 30

// ── Student welfare (sensitive: student.viewWelfare / student.editWelfare) ───
// Orphan categories follow the usual census split. UNKNOWN is the default for
// every student: "no information" must never read as "two living parents".
export const ORPHAN_STATUSES = ['UNKNOWN', 'NONE', 'FATHER_DECEASED', 'MOTHER_DECEASED', 'BOTH_DECEASED'] as const
export type OrphanStatusValue = (typeof ORPHAN_STATUSES)[number]

export const ORPHAN_STATUS_LABELS: Record<OrphanStatusValue, string> = {
  UNKNOWN:         'Not recorded',
  NONE:            'Not an orphan',
  FATHER_DECEASED: 'Father deceased',
  MOTHER_DECEASED: 'Mother deceased',
  BOTH_DECEASED:   'Both parents deceased',
}

export const SUPPORT_NEED_TYPES = [
  'LOW_VISION', 'BLIND', 'HARD_OF_HEARING', 'DEAF', 'PHYSICAL_IMPAIRMENT',
  'LEARNING_DIFFICULTY', 'ALBINISM', 'OTHER',
] as const
export type SupportNeedTypeValue = (typeof SUPPORT_NEED_TYPES)[number]

export const SUPPORT_NEED_LABELS: Record<SupportNeedTypeValue, string> = {
  LOW_VISION:          'Low vision',
  BLIND:               'Blind',
  HARD_OF_HEARING:     'Hard of hearing',
  DEAF:                'Deaf',
  PHYSICAL_IMPAIRMENT: 'Physical impairment',
  LEARNING_DIFFICULTY: 'Learning difficulty',
  ALBINISM:            'Albinism',
  OTHER:               'Other',
}

// ── Student exit (required when a student is archived) ───────────────────────
export const EXIT_REASONS = ['TRANSFERRED_OUT', 'DROPPED_OUT', 'DISMISSED', 'DECEASED', 'WITHDRAWN', 'OTHER'] as const
export type ExitReasonValue = (typeof EXIT_REASONS)[number]

export const EXIT_REASON_LABELS: Record<ExitReasonValue, string> = {
  TRANSFERRED_OUT: 'Transferred to another school',
  DROPPED_OUT:     'Dropped out',
  DISMISSED:       'Dismissed',
  DECEASED:        'Deceased',
  WITHDRAWN:       'Withdrawn by guardian',
  OTHER:           'Other',
}

// ── Scholarship sponsors ─────────────────────────────────────────────────────
export const SPONSOR_TYPES = ['GOVERNMENT_BURSARY', 'NGO', 'CHURCH', 'EMPLOYER', 'FAMILY', 'SCHOOL', 'OTHER'] as const
export type SponsorTypeValue = (typeof SPONSOR_TYPES)[number]

export const SPONSOR_TYPE_LABELS: Record<SponsorTypeValue, string> = {
  GOVERNMENT_BURSARY: 'Government bursary',
  NGO:                'NGO / charity',
  CHURCH:             'Church / religious body',
  EMPLOYER:           'Parent or guardian employer',
  FAMILY:             'Family / relative',
  SCHOOL:             'School (own funds)',
  OTHER:              'Other',
}

// ── Staff teaching, qualifications, housing, exit ────────────────────────────
export const EMPLOYMENT_CATEGORIES = ['GOVERNMENT_POSTED', 'SCHOOL_EMPLOYED', 'COMMUNITY_PAID', 'VOLUNTEER', 'OTHER'] as const
export type EmploymentCategoryValue = (typeof EMPLOYMENT_CATEGORIES)[number]
export const EMPLOYMENT_CATEGORY_LABELS: Record<EmploymentCategoryValue, string> = {
  GOVERNMENT_POSTED: 'Government-posted',
  SCHOOL_EMPLOYED:   'School-employed',
  COMMUNITY_PAID:    'Community-paid',
  VOLUNTEER:         'Volunteer',
  OTHER:             'Other',
}

export const QUALIFICATION_LEVELS = ['MSCE', 'DIPLOMA', 'DEGREE', 'POSTGRADUATE', 'OTHER'] as const
export type QualificationLevelValue = (typeof QUALIFICATION_LEVELS)[number]
export const QUALIFICATION_LEVEL_LABELS: Record<QualificationLevelValue, string> = {
  MSCE:         'MSCE',
  DIPLOMA:      'Diploma',
  DEGREE:       'Degree',
  POSTGRADUATE: 'Postgraduate',
  OTHER:        'Other',
}

export const TRAINING_ROUTES = [
  'UNIVERSITY_EDUCATION_DEGREE', 'EDUCATION_DIPLOMA', 'TEACHER_CERTIFICATE', 'ODL', 'UNTRAINED', 'OTHER',
] as const
export type TrainingRouteValue = (typeof TRAINING_ROUTES)[number]
export const TRAINING_ROUTE_LABELS: Record<TrainingRouteValue, string> = {
  UNIVERSITY_EDUCATION_DEGREE: 'University education degree',
  EDUCATION_DIPLOMA:           'Education diploma',
  TEACHER_CERTIFICATE:         'Teacher certificate',
  ODL:                         'Open and distance learning (ODL)',
  UNTRAINED:                   'Untrained',
  OTHER:                       'Other',
}

export const HOUSING_STATUSES = ['SCHOOL_HOUSE', 'RENT_ALLOWANCE', 'OWN_ARRANGEMENT'] as const
export type HousingStatusValue = (typeof HOUSING_STATUSES)[number]
export const HOUSING_STATUS_LABELS: Record<HousingStatusValue, string> = {
  SCHOOL_HOUSE:    'School house',
  RENT_ALLOWANCE:  'Rent allowance',
  OWN_ARRANGEMENT: 'Own arrangement',
}

export const STAFF_EXIT_REASONS = ['RESIGNED', 'TRANSFERRED', 'RETIRED', 'CONTRACT_ENDED', 'DISMISSED', 'DECEASED', 'OTHER'] as const
export type StaffExitReasonValue = (typeof STAFF_EXIT_REASONS)[number]
export const STAFF_EXIT_REASON_LABELS: Record<StaffExitReasonValue, string> = {
  RESIGNED:       'Resigned',
  TRANSFERRED:    'Transferred',
  RETIRED:        'Retired',
  CONTRACT_ENDED: 'Contract ended',
  DISMISSED:      'Dismissed',
  DECEASED:       'Deceased',
  OTHER:          'Other',
}

/** Licence-expiry window (days) for the HR "licence expiring" list. */
export const LICENCE_EXPIRY_WARNING_DAYS = 90
