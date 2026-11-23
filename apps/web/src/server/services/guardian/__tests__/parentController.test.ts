// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { makeDb } from './helpers/memoryDb'
import { FORBIDDEN, MODULE_CAPABILITY, NOT_FOUND, getChildModule, getChildren, getMe, type ChildModule } from '../parentController'
import { claimHttpResult } from '@/server/lib/guardian/claimResponse'
import { toPublicResult } from '../guardianClaimService'
import { GUARDIAN_CAPABILITIES } from '@shared/constants/guardianPortal'

let mem: ReturnType<typeof makeDb>['mem']
let db: ReturnType<typeof makeDb>['db']
const deps = {
  isResultsGateOpen: async (_s: string, term: number) => term !== 2,
  getReportCardData: async (_s: string, term: number, year: string) => ({ card: true, term, year }),
  resolvePeriod: async (i: { academicYear?: unknown; term?: unknown }) => ({ academicYear: typeof i.academicYear === 'string' ? i.academicYear : '2025/2026', term: Number(i.term) || 1 }),
  getTermAttendance: async () => ({ daysPresent: 8, daysLate: 1, daysAbsent: 1, totalDays: 10, attendanceRate: 90 }),
}
const call = (uid: unknown, linkId: unknown, module: ChildModule | string, query?: { academicYear?: unknown; term?: unknown }) =>
  getChildModule(db, deps, { uid, linkId, module: module as ChildModule, ...(query ? { query } : {}) })
const links = () => mem.all('guardianLink')

beforeEach(() => {
  ;({ mem, db } = makeDb())
  mem.seed('class', [{ id: 'c1', name: 'Form 2A' }])
  mem.seed('student', [
    { id: 's1', firstName: 'Chisomo', lastName: 'Banda', registrationNo: 'R001', status: 'ACTIVE', classId: 'c1', orphanStatus: 'X', medicalAlert: 'asthma' },
    { id: 's2', firstName: 'Tadala', lastName: 'Moyo', registrationNo: 'R002', status: 'ACTIVE', classId: 'c1' },
  ])
  mem.seed('guardianProfile', [
    { id: 'pA', fullName: 'Mary Banda', normalizedName: 'mary banda', firebaseUid: 'uidA' },
    { id: 'pB', fullName: 'Peter Moyo', normalizedName: 'peter moyo', firebaseUid: 'uidB' },
  ])
  mem.seed('guardianLink', [
    { id: 'lA', profileId: 'pA', studentId: 's1', relationship: 'Mother', status: 'ACTIVE', capabilities: [...GUARDIAN_CAPABILITIES] },
    { id: 'lB', profileId: 'pB', studentId: 's2', relationship: 'Father', status: 'ACTIVE', capabilities: ['results'] },
  ])
  mem.seed('termResult', [
    { id: 'r1', studentId: 's1', classId: 'c1', academicYear: '2025/2026', term: 1, average: 70, grade: 'B', subjectResults: { Maths: { average: 70, grade: 'B', pass: true } } },
    { id: 'r2', studentId: 's1', classId: 'c1', academicYear: '2025/2026', term: 2, average: 60, grade: 'C', subjectResults: {} },
  ])
  // Both terms' end-of-term exams are released; the fee gate (above) is what holds term 2 back.
  mem.seed('exam', [1, 2].map((term) => ({ id: `e${term}`, classId: 'c1', type: 'END_TERM', academicYear: '2025/2026', term, status: 'RESULTS_RELEASED', subject: 'Maths', title: 'End of term', maxMark: 100, date: new Date('2026-03-01') })))
  mem.seed('invoice', [{ id: 'i1', studentId: 's1', invoiceNumber: 'INV-1', academicYear: '2025/2026', term: 1, totalAmount: 100, paidAmount: 0, balance: 100, status: 'UNPAID' }])
  mem.seed('attendance', [{ id: 'a1', studentId: 's1', date: new Date('2026-03-01'), status: 'PRESENT' }])
})

describe('module -> capability table', () => {
  it('each module needs exactly its own capability', () => {
    expect(MODULE_CAPABILITY).toEqual({ profile: 'profile', results: 'results', reportCard: 'results', fees: 'fees', attendance: 'attendance' })
    expect(Object.isFrozen(MODULE_CAPABILITY)).toBe(true)
  })
})

describe('every refusal is the same frozen NOT_FOUND', () => {
  const scenarios: [string, () => Promise<unknown>][] = [
    ['another family\u2019s child', () => call('uidA', 'lB', 'results')],
    ['a link id that does not exist', () => call('uidA', 'nope', 'results')],
    ['a student id passed as a link id', () => call('uidA', 's1', 'results')],
    ['a missing link id', () => call('uidA', undefined, 'results')],
    ['an unknown module name', () => call('uidA', 'lA', 'welfare')],
    ['a signed-in token with no guardian profile', () => call('stranger', 'lA', 'results')],
    ['a missing uid', () => call(undefined, 'lA', 'results')],
    ['a suspended link', async () => { links().find((l) => l.id === 'lA')!.status = 'SUSPENDED'; return call('uidA', 'lA', 'results') }],
    ['a pending link', async () => { links().find((l) => l.id === 'lA')!.status = 'PENDING'; return call('uidA', 'lA', 'results') }],
    ['a capability that was not granted', () => call('uidB', 'lB', 'fees')],
    ['fees while re-verification is pending', async () => { links().find((l) => l.id === 'lA')!.reverifyRequired = true; return call('uidA', 'lA', 'fees') }],
    ['a child who has left', async () => { mem.all('student').find((s) => s.id === 's1')!.status = 'GRADUATED'; return call('uidA', 'lA', 'results') }],
    ['a suspended guardian', async () => { mem.all('guardianProfile').find((p) => p.id === 'pA')!.status = 'SUSPENDED'; return call('uidA', 'lA', 'results') }],
  ]
  for (const [name, run] of scenarios) {
    it(`${name}`, async () => {
      const r = await run()
      expect(r).toBe(NOT_FOUND)                                        // the very same object
      expect(JSON.stringify(r)).toBe('{"status":404,"body":{"error":"Not found"}}')
    })
  }
  it('the answer is frozen, so no handler can alter it for one caller', () => {
    expect(Object.isFrozen(NOT_FOUND)).toBe(true)
    expect(Object.isFrozen(NOT_FOUND.body)).toBe(true)
    expect(Object.isFrozen(FORBIDDEN)).toBe(true)
  })
})

describe('allowed reads', () => {
  it('profile: the child, with the class name and nothing from welfare', async () => {
    const r = await call('uidA', 'lA', 'profile')
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ child: { id: 'lA', firstName: 'Chisomo', lastName: 'Banda', admissionNumber: 'R001', className: 'Form 2A', enrolled: true, relationship: 'Mother', capabilities: [...GUARDIAN_CAPABILITIES] } })
    expect(JSON.stringify(r)).not.toMatch(/orphan|asthma|medical/)
  })
  it('results: honours the fee gate per term (term 2 is withheld)', async () => {
    const r = await call('uidA', 'lA', 'results')
    const terms = (r.body as { terms: { term: number; withheld: boolean; average: number | null }[] }).terms
    expect(terms.map((t) => [t.term, t.withheld, t.average])).toEqual([[2, true, null], [1, false, 70]])
  })
  it('fees and attendance return their DTOs (attendance: the student\u2019s own term figures plus the day records)', async () => {
    expect(((await call('uidA', 'lA', 'fees')).body as { totalOutstanding: number }).totalOutstanding).toBe(100)
    const att = (await call('uidA', 'lA', 'attendance', { academicYear: '2026/2027', term: 2 })).body as { period: unknown; summary: unknown; records: unknown[] }
    expect(att.period).toEqual({ academicYear: '2026/2027', term: 2 })
    expect(att.summary).toEqual({ present: 8, late: 1, absent: 1, recorded: 10, attendanceRate: 90 })
    expect(att.records).toHaveLength(1)
  })
  it('report card: served for a released, fee-clear term; the builder is asked about THIS student only', async () => {
    const r = await call('uidA', 'lA', 'reportCard', { academicYear: '2025/2026', term: 1 })
    expect(r).toEqual({ status: 200, body: { card: true, term: 1, year: '2025/2026' } })
  })
  it('report card: a fee-gated term is the same generic not-found (no hint that a card exists)', async () => {
    expect(await call('uidA', 'lA', 'reportCard', { academicYear: '2025/2026', term: 2 })).toBe(NOT_FOUND)
  })
  it('report card: a term with no computed result is not found', async () => {
    expect(await call('uidA', 'lA', 'reportCard', { academicYear: '2025/2026', term: 3 })).toBe(NOT_FOUND)
  })
  it('report card: needs the results capability, and a malformed period is only reported AFTER authorization', async () => {
    links().find((l) => l.id === 'lA')!.capabilities = ['fees']
    expect(await call('uidA', 'lA', 'reportCard', { academicYear: '2025/2026', term: 1 })).toBe(NOT_FOUND)
    links().find((l) => l.id === 'lA')!.capabilities = [...GUARDIAN_CAPABILITIES]
    expect(await call('stranger', 'lA', 'reportCard', { academicYear: 'junk', term: 9 })).toBe(NOT_FOUND)   // not 400: reveals nothing
    for (const q of [undefined, {}, { academicYear: '2025/2026', term: 4 }, { academicYear: '26', term: 1 }, { academicYear: '2025/2026', term: 'x' }]) {
      expect((await call('uidA', 'lA', 'reportCard', q as never)).status, JSON.stringify(q)).toBe(400)
    }
  })
  it('each guardian sees only their own child, through the same endpoint', async () => {
    expect(JSON.stringify((await call('uidB', 'lB', 'results')).body)).not.toContain('Chisomo')
    expect((await call('uidB', 'lB', 'results')).status).toBe(200)
  })
})

describe('access log', () => {
  it('records denials against the real profile with the specific reason, but never reveals it', async () => {
    await call('uidB', 'lB', 'fees')
    expect(mem.all('guardianAccessLog')).toHaveLength(1)
    expect(mem.all('guardianAccessLog')[0]).toMatchObject({ profileId: 'pB', linkId: 'lB', module: 'fees', outcome: 'DENIED', reason: 'CAPABILITY_MISSING' })
  })
  it('logs allowed reads of results and fees, but not routine profile or attendance views', async () => {
    await call('uidA', 'lA', 'profile'); await call('uidA', 'lA', 'attendance')
    expect(mem.all('guardianAccessLog')).toHaveLength(0)
    await call('uidA', 'lA', 'results'); await call('uidA', 'lA', 'fees'); await call('uidA', 'lA', 'reportCard', { academicYear: '2025/2026', term: 1 })
    expect(mem.all('guardianAccessLog').map((l) => [l.module, l.outcome])).toEqual([['results', 'ALLOWED'], ['fees', 'ALLOWED'], ['reportCard', 'ALLOWED']])
    expect(mem.all('guardianAccessLog')[0]).toMatchObject({ studentId: 's1', profileId: 'pA' })
  })
  it('a token with no profile cannot be logged against anyone, and still gets the same refusal', async () => {
    expect(await call('stranger', 'lA', 'results')).toBe(NOT_FOUND)
    expect(mem.all('guardianAccessLog')).toHaveLength(0)
  })
})

describe('getMe / getChildren', () => {
  it('answer with the guardian\u2019s own data only', async () => {
    expect(await getMe(db, 'uidA')).toEqual({ status: 200, body: { displayName: 'Mary Banda' } })
    expect(((await getChildren(db, 'uidA')).body as { children: { id: string }[] }).children.map((c) => c.id)).toEqual(['lA'])
  })
  it('a token with no guardian profile, a suspended guardian and a missing uid all get the same FORBIDDEN', async () => {
    mem.all('guardianProfile').find((p) => p.id === 'pB')!.status = 'SUSPENDED'
    for (const uid of ['stranger', 'uidB', undefined, '']) {
      expect(await getMe(db, uid)).toBe(FORBIDDEN)
      expect(await getChildren(db, uid)).toBe(FORBIDDEN)
    }
  })
})

describe('claim responses', () => {
  const generic = ['BAD_CODE', 'UNKNOWN_REF', 'INACTIVE', 'EXPIRED', 'ATTEMPTS_EXCEEDED', 'BAD_SECRET', 'LINK_NOT_ACTIVE', 'PROFILE_UNAVAILABLE',
    'NEEDS_REVERIFY', 'SECOND_FACTOR', 'EMAIL_MISMATCH', 'RACE_LOST', 'IDENTITY_FAILED', 'DB_FAILED'] as const
  it('every reason that must be indistinguishable returns the very same response object', () => {
    const first = claimHttpResult(toPublicResult({ ok: false, reason: generic[0] }))
    for (const reason of generic) expect(claimHttpResult(toPublicResult({ ok: false, reason })), reason).toBe(first)
    expect(first.status).toBe(400)
    expect(JSON.stringify(first.body)).not.toMatch(/expired|locked|revoked|unknown|date of birth|secret|attempt/i)
    expect(Object.isFrozen(first)).toBe(true)
  })
  it('the few distinguishable answers are specific and reveal nothing about the code', () => {
    expect(claimHttpResult({ ok: true })).toEqual({ status: 200, body: { ok: true } })
    expect(claimHttpResult({ ok: false, code: 'EMAIL_IN_USE' }).status).toBe(409)
    expect(claimHttpResult({ ok: false, code: 'WEAK_PASSWORD' }).status).toBe(422)
    expect(claimHttpResult({ ok: false, code: 'INVALID_EMAIL' }).status).toBe(422)
  })
})
