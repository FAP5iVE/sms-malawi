/**
 * packages/shared/constants/matching.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: The field-of-study and career-interest enums used by the MSCE
 *   Advisory matching engine's optional preferences. Lives here (not under
 *   apps/web/src/server/) specifically so the client-side preference
 *   selects and the server-side taxonomy derivation
 *   (apps/web/src/server/services/matching/taxonomy.ts) share one
 *   definition — the labels/lists themselves are plain data with no
 *   server dependency, only the derivation logic (mapping a real faculty
 *   string or programme name onto these values) is server-side.
 */

export const FIELD_CATEGORIES = [
  'SCIENCE_TECHNOLOGY',
  'ENGINEERING',
  'HEALTH_MEDICAL',
  'AGRICULTURE_NATURAL_RESOURCES',
  'BUSINESS_COMMERCE',
  'EDUCATION',
  'HUMANITIES_SOCIAL_SCIENCES',
  'LANGUAGES_ARTS',
] as const

export type FieldCategory = (typeof FIELD_CATEGORIES)[number]

export const FIELD_CATEGORY_LABEL: Record<FieldCategory, string> = {
  SCIENCE_TECHNOLOGY:             'Science & Technology',
  ENGINEERING:                    'Engineering',
  HEALTH_MEDICAL:                 'Health & Medical Sciences',
  AGRICULTURE_NATURAL_RESOURCES:  'Agriculture & Natural Resources',
  BUSINESS_COMMERCE:              'Business & Commerce',
  EDUCATION:                      'Education',
  HUMANITIES_SOCIAL_SCIENCES:     'Humanities & Social Sciences',
  LANGUAGES_ARTS:                 'Languages & Arts',
}

// Extensive on purpose, grounded in the real ~180 catalogue programme names
// (every tag here is reachable by at least one real programme — see
// apps/web/src/server/services/matching/__tests__/taxonomy.test.ts).
export const CAREER_FIELDS = [
  'Medicine', 'Nursing', 'Pharmacy', 'Dentistry', 'Public Health',
  'Veterinary Medicine', 'Allied Health',
  'Engineering', 'IT', 'Data Science', 'Architecture & Built Environment',
  'Agriculture', 'Environment & Natural Resources', 'Food Science',
  'Disaster Risk Management', 'Fashion & Design', 'Culture & Heritage',
  'Business & Accountancy', 'Hospitality & Tourism', 'Economics',
  'Education', 'Law', 'Social Work', 'Media & Journalism',
  'Earth Sciences & Geology', 'Mathematics & Statistics',
] as const

export type CareerField = (typeof CAREER_FIELDS)[number]
