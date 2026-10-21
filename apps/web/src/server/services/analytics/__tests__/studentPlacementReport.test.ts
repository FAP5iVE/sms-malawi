/**
 * A student's own placement report, run against a dataset that also holds OTHER
 * students' placements, so the tests prove what must not appear as well as what must.
 *
 *   me (stu-me)        graduated, certified MSCE
 *   others             a confirmed placement (stu-a), a pending claim (stu-b), a rejected claim (stu-c)
 *
 * Each scenario swaps which row belongs to "me".
 */
import { describe, it, expect, vi } from 'vitest'
import { makeFakePrisma } from '../../../../../test/fakePrisma'

const d = (s: string) => new Date(s)
const base = {
  entrySource: 'STAFF_OFFICIAL', admissionYear: '2026', ncheBatchRef: null, claimProofNote: null, rejectionReason: null,
  placedUniversityId: null, placedProgrammeId: null, placedUniversityName: null, placedProgrammeName: null,
  verifiedAt: null, createdAt: d('2026-03-01T00:00:00Z'),
  // staff-internal columns that must never reach the student
  notes: 'INTERNAL: mother is a staff member', recordedByUid: 'staff-1', verifiedByUid: 'staff-2',
}

const certified = { examType: 'MSCE', status: 'CERTIFIED', subjectGrades: { Maths: '2', English: '3' } }

// The fake client keeps references to these arrays, so each scenario refills them in place.
type Row = Record<string, unknown>
const rows = { students: [] as Row[], placements: [] as Row[], maneb: [] as Row[] }

vi.mock('@/lib/prisma', () => ({
  prisma: makeFakePrisma({
    student: rows.students,
    universityPlacement: rows.placements,
    manebRecord: rows.maneb,
  }),
}))

import { getStudentPlacement } from '../studentPlacementReport'

const others = [
  { ...base, studentId: 'stu-a', status: 'CONFIRMED', placedUniversityName: 'OTHER UNI A', placedProgrammeName: 'OTHER PROG A' },
  { ...base, studentId: 'stu-b', status: 'PENDING_APPROVAL', entrySource: 'STUDENT_CLAIM', placedUniversityName: 'OTHER UNI B' },
  { ...base, studentId: 'stu-c', status: 'REJECTED', entrySource: 'STUDENT_CLAIM', rejectionReason: 'OTHER STUDENT REASON' },
]
const me = (status = 'GRADUATED') => [{ id: 'stu-me', status }, { id: 'stu-a', status: 'GRADUATED' }]

function setup(opts: { status?: string; mine?: Record<string, unknown> | null; maneb?: unknown[] }) {
  rows.students.splice(0, rows.students.length, ...me(opts.status))
  rows.placements.splice(0, rows.placements.length, ...others, ...(opts.mine ? [{ ...base, studentId: 'stu-me', ...opts.mine }] : []))
  rows.maneb.splice(0, rows.maneb.length,
    ...(opts.maneb ?? [certified]).map((m) => ({ studentId: 'stu-me', ...(m as object) })),
    { studentId: 'stu-a', ...certified })
}

const json = (x: unknown) => JSON.stringify(x)
const noOtherData = (out: unknown) => {
  const s = json(out)
  for (const leak of ['OTHER UNI', 'OTHER PROG', 'OTHER STUDENT', 'stu-a', 'stu-b', 'stu-c', 'INTERNAL', 'staff-1', 'staff-2']) {
    expect(s).not.toContain(leak)
  }
}

describe('getStudentPlacement — own, published information only', () => {
  it('shows a confirmed placement with its destination and none of the staff-internal fields', async () => {
    setup({ mine: { status: 'CONFIRMED', placedUniversityName: 'University of Malawi', placedProgrammeName: 'BSc Nursing', verifiedAt: d('2026-04-10T00:00:00Z') } })
    const out = await getStudentPlacement('stu-me')
    expect(out.state).toBe('published')
    expect(out.placement).toMatchObject({ university: 'University of Malawi', programme: 'BSc Nursing', admissionYear: '2026', source: 'school_list' })
    expect(out.claim).toBeNull()
    expect(out.canClaim).toBe(false)
    noOtherData(out)
    expect(Object.keys(out).sort()).toEqual(['canClaim', 'claim', 'detail', 'eligibility', 'headline', 'placement', 'state'])
  })

  it('treats a student claim that staff approved as published and says it was verified', async () => {
    setup({ mine: { status: 'CONFIRMED', entrySource: 'STUDENT_CLAIM', placedUniversityName: 'MUBAS' } })
    const out = await getStudentPlacement('stu-me')
    expect(out.state).toBe('published')
    expect(out.placement?.source).toBe('verified_claim')
  })

  it('shows a pending claim as under review — never as a placement', async () => {
    setup({ mine: { status: 'PENDING_APPROVAL', entrySource: 'STUDENT_CLAIM', placedUniversityName: 'MZUNI', ncheBatchRef: 'List 3 p.12', claimProofNote: 'Seen on the gazette' } })
    const out = await getStudentPlacement('stu-me')
    expect(out.state).toBe('pending')
    expect(out.placement).toBeNull()
    expect(out.claim).toMatchObject({ university: 'MZUNI', reference: 'List 3 p.12', evidenceNote: 'Seen on the gazette', rejectionReason: null })
    expect(out.canClaim).toBe(false)
    noOtherData(out)
  })

  it('shows a rejected claim with the reason given to them and lets them claim again', async () => {
    setup({ mine: { status: 'REJECTED', entrySource: 'STUDENT_CLAIM', placedUniversityName: 'LUANAR', rejectionReason: 'Not on the list', verifiedAt: d('2026-05-01T00:00:00Z') } })
    const out = await getStudentPlacement('stu-me')
    expect(out.state).toBe('not_approved')
    expect(out.placement).toBeNull()
    expect(out.claim?.rejectionReason).toBe('Not on the list')
    expect(out.claim?.reviewedOn).toBe('2026-05-01T00:00:00.000Z')
    expect(out.canClaim).toBe(true)
    noOtherData(out)
  })

  it('says "none" — not zero, not someone else’s — when a graduate has no record, even though other students do', async () => {
    setup({ mine: null })
    const out = await getStudentPlacement('stu-me')
    expect(out.state).toBe('none')
    expect(out.placement).toBeNull()
    expect(out.claim).toBeNull()
    expect(out.canClaim).toBe(true)
    noOtherData(out)
  })

  it('says results are awaited when a graduate has no certified MSCE yet, and cannot claim', async () => {
    setup({ mine: null, maneb: [{ examType: 'MSCE', status: 'REGISTERED', subjectGrades: null }] })
    const out = await getStudentPlacement('stu-me')
    expect(out.state).toBe('awaiting_results')
    expect(out.canClaim).toBe(false)
  })

  it('says placement is not open to a student who has not graduated', async () => {
    setup({ status: 'ACTIVE', mine: null, maneb: [] })
    const out = await getStudentPlacement('stu-me')
    expect(out.state).toBe('not_yet_eligible')
    expect(out.eligibility).toEqual({ graduated: false, certifiedMsce: false })
    expect(out.canClaim).toBe(false)
  })

  it('reads only the requested student: asking as the student with a confirmed row never returns another student’s row', async () => {
    setup({ mine: null })
    const asOther = await getStudentPlacement('stu-a')
    // stu-a's own confirmed row is theirs to see…
    expect(asOther.state).toBe('published')
    expect(asOther.placement?.university).toBe('OTHER UNI A')
    // …and "me" still sees none of it.
    const asMe = await getStudentPlacement('stu-me')
    expect(json(asMe)).not.toContain('OTHER UNI A')
  })

  it('uses the most recent record when a student has more than one', async () => {
    setup({ mine: { status: 'REJECTED', rejectionReason: 'old', createdAt: d('2026-01-01T00:00:00Z') } })
    rows.placements.push({ ...base, studentId: 'stu-me', status: 'CONFIRMED', placedUniversityName: 'Newer', createdAt: d('2026-06-01T00:00:00Z') })
    const out = await getStudentPlacement('stu-me')
    expect(out.state).toBe('published')
    expect(out.placement?.university).toBe('Newer')
  })
})
