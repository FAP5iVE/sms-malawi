/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/lib/placementCatalogueHelpers.ts
 * [PURPOSE]: Small, pure, client-safe helpers over the shared university
 *   catalogue (@shared/constants/universities) used by both the Staff
 *   Placement Entry and Student Claim Portal pickers: grouping a
 *   university's active programmes by faculty (for the University → Faculty
 *   → Programme cascading select, matching the reference module's design),
 *   and formatting a programme's structured entryRequirements into the
 *   human-readable "English (\u22644), Mathematics (\u22643), Physical
 *   Science (\u22644)" string the reference module shows — built from real
 *   catalogue data, never invented copy.
 * [DEPENDS ON]: @shared/constants/universities
 */
import { MSCE_CREDIT_MAX_GRADE, type University, type UniversityProgram } from '@shared/constants/universities'

export interface FacultyGroup {
  faculty: string
  programs: UniversityProgram[]
}

/** Active programmes at a university, grouped by faculty and alphabetised.
 *  Programmes with no `faculty` set are grouped under 'General'. */
export function groupProgramsByFaculty(university: University | undefined): FacultyGroup[] {
  if (!university) return []
  const map = new Map<string, UniversityProgram[]>()
  for (const p of university.programs) {
    if (p.isActive === false) continue
    const key = p.faculty ?? 'General'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(p)
  }
  return [...map.entries()]
    .map(([faculty, programs]) => ({ faculty, programs }))
    .sort((a, b) => a.faculty.localeCompare(b.faculty))
}

/** The published requirement text as a compact "Subject (\u2264grade)" list,
 *  built from the programme's structured entryRequirements. Falls back to
 *  the transcribed minimumRequirements text when no structured shape exists. */
export function formatPrerequisites(program: UniversityProgram | undefined): string {
  if (!program) return '\u2014'
  const reqs = program.entryRequirements
  if (!reqs || reqs.mandatorySubjects.length === 0) {
    return program.minimumRequirements?.[0] ?? 'Prerequisites not published in the catalogue.'
  }
  const parts = reqs.mandatorySubjects.map((s) => {
    const alt = s.alternatives?.length ? ` (or ${s.alternatives.join('/')})` : ''
    return `${s.subject}${alt} (\u2264${s.maxGrade ?? MSCE_CREDIT_MAX_GRADE})`
  })
  if (reqs.groupSubjects?.length) {
    for (const g of reqs.groupSubjects) {
      parts.push(`\u2265${g.chooseAtLeast} of ${g.subjects.join('/')}`)
    }
  }
  return parts.join(', ')
}
