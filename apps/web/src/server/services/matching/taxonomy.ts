/**
 * apps/web/src/server/services/matching/taxonomy.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Maps the catalogue's real, free-text `faculty` strings (38
 *   distinct values across MUST/MUBAS/UNIMA/MZUNI/LUANAR/KUHeS/DCE/MCHS —
 *   see packages/shared/constants/universities.ts) onto a small, fixed
 *   FieldCategory enum, and derives career-interest tags from each
 *   programme's own name via a documented keyword table.
 *
 *   DELIBERATELY DERIVED, NOT STORED: neither fieldCategory nor careerTags
 *   are written onto the ~130 real programme entries in universities.ts.
 *   fieldCategory is a pure lookup from the faculty string that's already
 *   there; careerTags are computed from the programme name at call time.
 *   This avoids hand-annotating 130 entries (slow, inconsistent, and prone
 *   to drifting out of sync when a programme is renamed or added) in favor
 *   of ~40 auditable mapping rules that are easy to unit test directly.
 *
 *   The 8-category set below was chosen by categorizing the REAL faculty
 *   list, not the 4-category (Science/Humanities/Languages/Commercial) set
 *   originally proposed for this feature — that set didn't have anywhere
 *   to put Engineering, Medicine, Agriculture, or Education, all of which
 *   are major, distinct faculties in this catalogue. 'Law' has no dedicated
 *   faculty anywhere in the catalogue (Law Enforcement is a programme
 *   under a Social Sciences faculty), so it exists only as a career tag,
 *   not a field category.
 * [DEPENDS ON]: @shared/constants/universities (UniversityProgram)
 */
import type { UniversityProgram } from '@shared/constants/universities'
import {
  FIELD_CATEGORIES,
  FIELD_CATEGORY_LABEL,
  CAREER_FIELDS,
  type FieldCategory,
  type CareerField,
} from '@shared/constants/matching'

// Re-exported for convenience so existing imports of these from this file
// keep working — the canonical definitions now live in
// @shared/constants/matching so client code (the preference selects) can
// import them without reaching into server/services/.
export { FIELD_CATEGORIES, FIELD_CATEGORY_LABEL, CAREER_FIELDS }
export type { FieldCategory, CareerField }

// Every faculty string actually present in universities.ts, mapped once.
// Keep this exhaustive — getFieldCategory() intentionally has no silent
// fallback, so a newly added faculty string not yet added here is loud
// (returns null, which the eligibility/scoring stage treats as "cannot
// narrow by field for this programme" rather than guessing).
const FACULTY_TO_FIELD_CATEGORY: Record<string, FieldCategory> = {
  'Academy of Medical Sciences':                          'HEALTH_MEDICAL',
  'Bingu School of Culture and Heritage':                 'LANGUAGES_ARTS',
  'Department of Biomedical Sciences':                    'HEALTH_MEDICAL',
  'Department of Communication Studies':                  'LANGUAGES_ARTS',
  'Department of Fisheries':                              'AGRICULTURE_NATURAL_RESOURCES',
  'Department of Forestry':                               'AGRICULTURE_NATURAL_RESOURCES',
  'Department of Hospitality Management':                 'BUSINESS_COMMERCE',
  'Department of Information and Communication Technology': 'SCIENCE_TECHNOLOGY',
  'Department of Land Management':                        'AGRICULTURE_NATURAL_RESOURCES',
  'Department of Mathematics and Statistics':             'SCIENCE_TECHNOLOGY',
  'Department of Nursing and Midwifery':                  'HEALTH_MEDICAL',
  'Department of Physics and Electronics':                'SCIENCE_TECHNOLOGY',
  'Department of Water Resources':                        'AGRICULTURE_NATURAL_RESOURCES',
  'Faculty of Agriculture':                               'AGRICULTURE_NATURAL_RESOURCES',
  'Faculty of Clinical Sciences':                         'HEALTH_MEDICAL',
  'Faculty of Development Studies':                       'HUMANITIES_SOCIAL_SCIENCES',
  'Faculty of Food and Human Sciences':                   'AGRICULTURE_NATURAL_RESOURCES',
  'Faculty of Humanities':                                'HUMANITIES_SOCIAL_SCIENCES',
  'Faculty of Language, Arts and Communication':          'LANGUAGES_ARTS',
  'Faculty of Life Sciences and Natural Resources':       'AGRICULTURE_NATURAL_RESOURCES',
  'Faculty of Natural Resources':                         'AGRICULTURE_NATURAL_RESOURCES',
  'Faculty of Natural and Applied Sciences':              'SCIENCE_TECHNOLOGY',
  'Faculty of Nursing and Midwifery':                     'HEALTH_MEDICAL',
  'Faculty of Science':                                   'SCIENCE_TECHNOLOGY',
  'Faculty of Social Science':                            'HUMANITIES_SOCIAL_SCIENCES',
  'Faculty of Social Sciences':                           'HUMANITIES_SOCIAL_SCIENCES',
  'Faculty of Veterinary Medicine':                       'HEALTH_MEDICAL',
  'Malawi Institute of Technology':                       'ENGINEERING',
  'Ndata School of Climate and Earth Sciences':           'SCIENCE_TECHNOLOGY',
  'School of Built Environment':                          'ENGINEERING',
  'School of Business and Economic Sciences':             'BUSINESS_COMMERCE',
  'School of Education':                                  'EDUCATION',
  'School of Education, Communication and Media Studies': 'EDUCATION',
  'School of Engineering':                                'ENGINEERING',
  'School of Life Sciences and Allied Health Professions': 'HEALTH_MEDICAL',
  'School of Medicine and Oral Health':                   'HEALTH_MEDICAL',
  'School of Nursing':                                    'HEALTH_MEDICAL',
  'School of Science and Technology':                     'SCIENCE_TECHNOLOGY',
}

/** Null when the programme has no `faculty` set, or the faculty string
 *  isn't yet in the lookup above (logged as a gap, never guessed at). */
export function getFieldCategory(program: UniversityProgram): FieldCategory | null {
  if (!program.faculty) return null
  return FACULTY_TO_FIELD_CATEGORY[program.faculty] ?? null
}

// ─────────────────────────────────────────────────────────
//  CAREER TAGS — derived from the programme's own name
// ─────────────────────────────────────────────────────────
// The tag values themselves (CAREER_FIELDS/CareerField) come from
// @shared/constants/matching, re-exported above; every tag is grounded in
// the real ~180 programme names — checked by a unit test that runs every
// real catalogue programme through the deriver.

// Order matters only in that every matching rule fires (a programme can
// carry several tags) — this is a documented, testable rule table, not
// opaque per-programme judgement calls.
//
// [FIX] Several of the original patterns wrapped a word STEM in `\b...\b`
// (e.g. `\bagri\b`, `\benvironment\b`, `\barchitect\b`), which requires
// that exact stem to be a COMPLETE word — so it silently failed to match
// real inflected programme titles like "Agriculture" (agri+culture, no
// boundary after "agri"), "Environmental" (environment+al), "Architectural"
// (architect+ural), "Horticultural" (horticulture+al, plural/adjective
// mismatch), and "Surveying" (survey+ing). Caught by running every one of
// the real ~180 catalogue programmes through this deriver — see
// __tests__/taxonomy.test.ts, which asserts fewer than a fixed, reviewed
// number of programmes end up with zero tags at all. Fixed by dropping the
// trailing `\b` on these specific stems so they match as prefixes; the
// leading `\b` alone still stops a stem matching mid-word incorrectly.
const CAREER_TAG_RULES: Array<{ tag: CareerField; pattern: RegExp }> = [
  { tag: 'Medicine',                          pattern: /\b(medicine|mbbs|clinical medicine|ophthalmology|biomedical sciences?|microbiolog\w*|immunolog\w*)\b/i },
  { tag: 'Nursing',                           pattern: /\bnursing\b/i },
  { tag: 'Pharmacy',                          pattern: /\bpharmac\w*/i },
  { tag: 'Dentistry',                         pattern: /\b(dental|oral health)\b/i },
  { tag: 'Public Health',                     pattern: /\bpublic health\b/i },
  { tag: 'Veterinary Medicine',               pattern: /\bveterinary\b/i },
  { tag: 'Allied Health',                     pattern: /\b(biomedical laboratory|medical laboratory|medical imaging|occupation\w*\s*therapy|nutrition and dietetics|optometry|physiotherapy|sports science)\b/i },
  { tag: 'Engineering',                       pattern: /\b(engineering|electronics|sustainable energy|energy systems)\b/i },
  { tag: 'IT',                                pattern: /\b(computer science|information technology|information systems|computer systems|business information technology|ict|software)\b/i },
  { tag: 'Data Science',                      pattern: /\b(data science|statistics|biostatistics)\b/i },
  { tag: 'Architecture & Built Environment',  pattern: /\b(architect\w*|quantity survey\w*|land survey\w*|land economy|physical planning|town and regional planning|regional planning|construction)\b/i },
  { tag: 'Agriculture',                       pattern: /\b(agri\w*|crop science\w*|animal science|horticultur\w*|agribusiness|biotechnology)\b/i },
  { tag: 'Environment & Natural Resources',   pattern: /\b(environment\w*|forestry|fisheries|water resources|water quality|natural resources|wildlife|land management)\b/i },
  { tag: 'Food Science',                      pattern: /\b(food science|food technology|food and nutrition|nutrition and food)\b/i },
  { tag: 'Disaster Risk Management',          pattern: /\bdisaster risk\b/i },
  { tag: 'Fashion & Design',                  pattern: /\b(textile|fashion design)\b/i },
  { tag: 'Culture & Heritage',                pattern: /\b(theology|musicology|indigenous knowledge|cultural economy|language,?\s*communication and culture)\b/i },
  { tag: 'Business & Accountancy',            pattern: /\b(accountancy|accounting|business|commerce|banking|finance|management information systems|entrepreneurship)\b/i },
  { tag: 'Hospitality & Tourism',             pattern: /\b(hospitality|tourism)\b/i },
  { tag: 'Economics',                         pattern: /\beconomic\w*/i },
  { tag: 'Education',                         pattern: /\b(education|b\.?ed\b|teacher|early childhood)\b/i },
  { tag: 'Law',                               pattern: /\b(law|legal)\b/i },
  { tag: 'Social Work',                       pattern: /\b(social work|sociology|psychology|gender|public administration|development studies|political science|family and consumer sciences|community services|human sciences)\b/i },
  { tag: 'Media & Journalism',                pattern: /\b(journalism|media|communication studies|communication and cultural)\b/i },
  { tag: 'Earth Sciences & Geology',          pattern: /\b(geology|geoscience|earth science|meteorology|geo-?information|geography)\b/i },
  { tag: 'Mathematics & Statistics',          pattern: /\b(mathematics|mathematical sciences)\b/i },
]

/** One programme can carry several career tags (e.g. "Computer Systems
 *  Security" -> IT; "Agricultural Engineering" -> Engineering AND
 *  Agriculture). Matches on the programme name only — faculty is too
 *  coarse for this (a "Faculty of Science" houses very different careers). */
export function deriveCareerTags(program: UniversityProgram): CareerField[] {
  const tags = new Set<CareerField>()
  for (const rule of CAREER_TAG_RULES) {
    if (rule.pattern.test(program.name)) tags.add(rule.tag)
  }
  return [...tags]
}
