// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { makeDb } from './helpers/memoryDb'
import { authorizeChild, findGuardianProfile, listChildren, recordAccess } from '../guardianAccess'
import { getChildAttendance, getChildFees, getChildResults, type ParentDeps } from '../parentPortalService'
import { toAttendanceDto, toChildDto, toInvoiceDto, toPaymentDto, toResultsTermDto } from '@/server/lib/guardian/parentDto'
import { GUARDIAN_CAPABILITIES, type GuardianCapability } from '@shared/constants/guardianPortal'

let mem: ReturnType<typeof makeDb>['mem']
let db: ReturnType<typeof makeDb>['db']

const ALL = [...GUARDIAN_CAPABILITIES]
const deny = async (uid: unknown, linkId: unknown, capability: GuardianCapability = 'results') => {
  const d = await authorizeChild(db, { uid, linkId, capability })
  return d.allowed ? 'ALLOWED' : d.reason
}

beforeEach(() => {
  ;({ mem, db } = makeDb())
  mem.seed('class', [{ id: 'c1', name: 'Form 2A' }])
  mem.seed('student', [
    { id: 's1', firstName: 'Chisomo', lastName: 'Banda', registrationNo: 'R001', status: 'ACTIVE', classId: 'c1', dateOfBirth: new Date('2010-05-04'),
      orphanStatus: 'FATHER_DECEASED', medicalAlert: 'asthma', exitNote: 'x', nrbNumber: 'NRB-1', vulnerabilityNote: 'v', firebaseUid: 'stud-uid', email: 's@x.com' },
    { id: 's2', firstName: 'Tadala', lastName: 'Moyo', registrationNo: 'R002', status: 'ACTIVE', classId: 'c1' },
    { id: 's3', firstName: 'Old', lastName: 'Boy', registrationNo: 'R003', status: 'GRADUATED', classId: 'c1' },
  ])
  // Two guardians; A looks after s1 (and graduated s3), B looks after s2.
  mem.seed('guardianProfile', [
    { id: 'pA', fullName: 'Mary Banda', normalizedName: 'mary banda', firebaseUid: 'uidA' },
    { id: 'pB', fullName: 'Peter Moyo', normalizedName: 'peter moyo', firebaseUid: 'uidB' },
    { id: 'pUnclaimed', fullName: 'No Account', normalizedName: 'no account' },        // firebaseUid null
  ])
  mem.seed('guardianLink', [
    { id: 'lA1', profileId: 'pA', studentId: 's1', relationship: 'Mother', status: 'ACTIVE', capabilities: ALL },
    { id: 'lA3', profileId: 'pA', studentId: 's3', relationship: 'Mother', status: 'ACTIVE', capabilities: ALL },
    { id: 'lB2', profileId: 'pB', studentId: 's2', relationship: 'Father', status: 'ACTIVE', capabilities: ['results'] },
    { id: 'lU1', profileId: 'pUnclaimed', studentId: 's1', relationship: 'Aunt', status: 'ACTIVE', capabilities: ALL },
  ])
})

describe('authorizeChild: who may see which child', () => {
  it('a guardian can open their own child for a capability they hold', async () => {
    const d = await authorizeChild(db, { uid: 'uidA', linkId: 'lA1', capability: 'results' })
    expect(d.allowed).toBe(true)
    if (d.allowed) expect(d.ctx.student.id).toBe('s1')
  })

  it('IDOR: naming another family\u2019s link is simply "not found", for every capability', async () => {
    for (const cap of ALL) {
      expect(await deny('uidA', 'lB2', cap), cap).toBe('NO_LINK')       // B's link, A's token
      expect(await deny('uidB', 'lA1', cap), cap).toBe('NO_LINK')
    }
    expect(await deny('uidA', 'ghost')).toBe('NO_LINK')
    expect(await deny('uidA', 's1')).toBe('NO_LINK')                      // a STUDENT id is not a link id
    expect(await deny('uidA', 'lU1')).toBe('NO_LINK')                     // an unclaimed profile's link is not A's
  })

  it('an undefined, empty or non-string uid never resolves to a profile, even though unclaimed profiles have firebaseUid = null', async () => {
    for (const uid of [undefined, null, '', 0, {}, ['uidA']]) {
      expect(await findGuardianProfile(db, uid), String(uid)).toBeNull()
      expect(await deny(uid, 'lU1')).toBe('NO_PROFILE')
      expect(await listChildren(db, uid)).toBeNull()
    }
    expect(await deny('not-a-guardian', 'lA1')).toBe('NO_PROFILE')
  })

  it('refuses a suspended or merged person on the very next request', async () => {
    for (const status of ['SUSPENDED', 'MERGED']) {
      mem.all('guardianProfile').find((p) => p.id === 'pA')!.status = status
      expect(await deny('uidA', 'lA1')).toBe('PROFILE_INACTIVE')
      expect(await listChildren(db, 'uidA')).toBeNull()
    }
  })

  it('only an ACTIVE link grants access: pending, suspended, revoked and rejected do not', async () => {
    for (const status of ['PENDING', 'SUSPENDED', 'REVOKED', 'REJECTED']) {
      mem.all('guardianLink').find((l) => l.id === 'lA1')!.status = status
      expect(await deny('uidA', 'lA1'), status).toBe('LINK_INACTIVE')
    }
  })

  it('there is no caching: access ends the moment staff suspend the link', async () => {
    expect(await deny('uidA', 'lA1')).toBe('ALLOWED')
    mem.all('guardianLink').find((l) => l.id === 'lA1')!.status = 'SUSPENDED'
    expect(await deny('uidA', 'lA1')).toBe('LINK_INACTIVE')
    mem.all('guardianLink').find((l) => l.id === 'lA1')!.status = 'ACTIVE'
    expect(await deny('uidA', 'lA1')).toBe('ALLOWED')
  })

  it('a capability the link does not hold is refused, one by one', async () => {
    for (const held of ALL) {
      mem.all('guardianLink').find((l) => l.id === 'lA1')!.capabilities = [held]
      for (const asked of ALL) expect(await deny('uidA', 'lA1', asked), `${held}/${asked}`).toBe(asked === held ? 'ALLOWED' : 'CAPABILITY_MISSING')
    }
    mem.all('guardianLink').find((l) => l.id === 'lA1')!.capabilities = []
    for (const asked of ALL) expect(await deny('uidA', 'lA1', asked)).toBe('CAPABILITY_MISSING')
    mem.all('guardianLink').find((l) => l.id === 'lA1')!.capabilities = ['admin', 'ALL', 7]   // junk is not a capability
    for (const asked of ALL) expect(await deny('uidA', 'lA1', asked)).toBe('CAPABILITY_MISSING')
  })

  it('a link awaiting re-verification keeps results/attendance/profile/notices but loses fees and documents', async () => {
    mem.all('guardianLink').find((l) => l.id === 'lA1')!.reverifyRequired = true
    for (const cap of ['results', 'attendance', 'profile', 'notices'] as const) expect(await deny('uidA', 'lA1', cap), cap).toBe('ALLOWED')
    for (const cap of ['fees', 'documents'] as const) expect(await deny('uidA', 'lA1', cap), cap).toBe('REVERIFY_PENDING')
  })

  it('a child who has left gets no data; one awaiting MANEB results still does', async () => {
    expect(await deny('uidA', 'lA3')).toBe('NOT_ENROLLED')                  // GRADUATED
    mem.all('student').find((s) => s.id === 's1')!.status = 'ARCHIVED'
    expect(await deny('uidA', 'lA1')).toBe('NOT_ENROLLED')
    mem.all('student').find((s) => s.id === 's1')!.status = 'AWAITING_MANEB_RESULTS'
    expect(await deny('uidA', 'lA1')).toBe('ALLOWED')
  })

  it('a link whose student vanished is refused, and denials carry the ids needed for the access log', async () => {
    mem.tables['student'] = mem.tables['student']!.filter((s) => s.id !== 's1')
    const d = await authorizeChild(db, { uid: 'uidA', linkId: 'lA1', capability: 'results' })
    expect(d).toMatchObject({ allowed: false, reason: 'STUDENT_MISSING', profileId: 'pA', linkId: 'lA1' })
  })
})

describe('listChildren', () => {
  it('lists only the caller\u2019s ACTIVE links; a child who has left is shown as not enrolled with no class', async () => {
    const r = (await listChildren(db, 'uidA'))!
    expect(r.profileId).toBe('pA')
    expect(r.children.map((c) => [c.id, c.enrolled, c.className])).toEqual([['lA1', true, 'Form 2A'], ['lA3', false, null]])
    expect((await listChildren(db, 'uidB'))!.children.map((c) => c.id)).toEqual(['lB2'])
  })
  it('does not list pending, suspended, revoked or rejected links', async () => {
    for (const status of ['PENDING', 'SUSPENDED', 'REVOKED', 'REJECTED']) mem.all('guardianLink').find((l) => l.id === 'lA1')!.status = status
    expect((await listChildren(db, 'uidA'))!.children.map((c) => c.id)).toEqual(['lA3'])
  })
  it('never exposes welfare, identity, exit or login fields of the child', async () => {
    const text = JSON.stringify(await listChildren(db, 'uidA'))
    for (const leak of ['orphanStatus', 'FATHER_DECEASED', 'medicalAlert', 'asthma', 'exitNote', 'nrbNumber', 'NRB-1', 'vulnerabilityNote', 'dateOfBirth', '2010', 'firebaseUid', 'stud-uid', 's@x.com', 'studentId']) {
      expect(text, leak).not.toContain(leak)
    }
    expect(Object.keys((await listChildren(db, 'uidA'))!.children[0]!).sort()).toEqual(['admissionNumber', 'capabilities', 'className', 'enrolled', 'firstName', 'id', 'lastName', 'relationship'])
  })
  it('a guardian with no children gets an empty list, not an error', async () => {
    mem.seed('guardianProfile', [{ id: 'pC', fullName: 'Lonely', normalizedName: 'lonely', firebaseUid: 'uidC' }])
    expect(await listChildren(db, 'uidC')).toEqual({ profileId: 'pC', children: [] })
  })
})

describe('recordAccess', () => {
  it('writes ids, module, outcome and reason only', async () => {
    await recordAccess(db, { profileId: 'pA', linkId: 'lA1', studentId: 's1', module: 'results', outcome: 'DENIED', reason: 'CAPABILITY_MISSING' })
    expect(mem.all('guardianAccessLog')[0]).toMatchObject({ profileId: 'pA', linkId: 'lA1', studentId: 's1', module: 'results', outcome: 'DENIED', reason: 'CAPABILITY_MISSING' })
  })
  it('never throws, so a logging fault cannot break or change a guardian\u2019s response', async () => {
    const broken = new Proxy(db, { get: (t, p) => (p === 'guardianAccessLog' ? { create: async () => { throw new Error('db down') } } : Reflect.get(t, p)) })
    await expect(recordAccess(broken, { profileId: 'pA', module: 'results', outcome: 'ALLOWED' })).resolves.toBeUndefined()
  })
})

describe('parent DTOs: explicit allowlists', () => {
  it('toChildDto copies only named fields', () => {
    const dto = toChildDto({ id: 'l', relationship: 'Mother', capabilities: ['results', 'x'], secretNote: 'no' }, { firstName: 'A', lastName: 'B', registrationNo: 'R', status: 'ACTIVE', orphanStatus: 'X', dateOfBirth: new Date() }, 'Form 1')
    expect(dto).toEqual({ id: 'l', firstName: 'A', lastName: 'B', admissionNumber: 'R', className: 'Form 1', enrolled: true, relationship: 'Mother', capabilities: ['results'] })
  })

  it('results: a withheld term carries NO marks, only the fact that it is withheld', () => {
    const row = { academicYear: '2026', term: 1, average: 71.26, grade: 'B', classPosition: 3, classTotal: 40, subjectResults: { Maths: { average: 80, grade: 'A', pass: true } }, teacherComment: 'Good', headComment: 'Fine' }
    expect(toResultsTermDto(row, true)).toEqual({ academicYear: '2026', term: 1, withheld: true, average: null, grade: null, classPosition: null, classSize: null, passStatus: null, attendanceDays: null, absentDays: null, subjects: [], teacherComment: null, headComment: null })
    expect(JSON.stringify(toResultsTermDto(row, true))).not.toMatch(/Maths|71|Good|Fine/)
  })

  it('results: an open term shows rounded averages and only subject/average/grade/pass per subject', () => {
    const row = {
      academicYear: '2026', term: 2, average: 71.26, grade: 'B', classPosition: 3, classTotal: 40, passStatus: true, attendanceDays: 50, absentDays: 2,
      aggregatePoints: 9, reportCardKey: 'file_secret', totalMark: 800,
      subjectResults: { Maths: { average: 80.04, grade: 'A', pass: true, ca: [1, 2], exam: 77, rawNotes: 'x' }, English: { average: 55, grade: 'C', pass: false } },
    }
    const dto = toResultsTermDto(row, false)
    expect(dto.average).toBe(71.3)
    expect(dto.passStatus).toBe(true)
    expect(dto.subjects).toEqual([{ subject: 'English', average: 55, grade: 'C', pass: false }, { subject: 'Maths', average: 80, grade: 'A', pass: true }])
    const text = JSON.stringify(dto)
    for (const leak of ['aggregatePoints', 'reportCardKey', 'file_secret', 'totalMark', 'rawNotes', '"ca"', '"exam"']) expect(text, leak).not.toContain(leak)
  })

  it('results: passStatus is the real boolean (the column is a boolean, not a string), else null', () => {
    const base = { academicYear: '2026', term: 1, subjectResults: {} }
    expect(toResultsTermDto({ ...base, passStatus: true }, false).passStatus).toBe(true)
    expect(toResultsTermDto({ ...base, passStatus: false }, false).passStatus).toBe(false)
    for (const bad of ['PASS', 'true', 1, null, undefined]) expect(toResultsTermDto({ ...base, passStatus: bad }, false).passStatus, String(bad)).toBeNull()
  })

  it('results: a class position or size of 0 means "not computed" and is reported as unknown', () => {
    const row = { academicYear: '2026', term: 1, subjectResults: {} }
    expect(toResultsTermDto({ ...row, classPosition: 0, classTotal: 0 }, false)).toMatchObject({ classPosition: null, classSize: null })
    expect(toResultsTermDto({ ...row, classPosition: 4, classTotal: 38 }, false)).toMatchObject({ classPosition: 4, classSize: 38 })
  })

  it('results: malformed subject data cannot crash or leak', () => {
    for (const subjectResults of [null, undefined, [], 'x', 5, { Maths: null }, { Maths: 'bad' }]) {
      expect(() => toResultsTermDto({ academicYear: '2026', term: 1, subjectResults }, false), String(subjectResults)).not.toThrow()
    }
  })

  it('fees: invoices and payments expose no reference, recorder, notes, receipt key or scholarship', () => {
    const inv = toInvoiceDto({ invoiceNumber: 'INV-1', academicYear: '2026', term: 1, totalAmount: { valueOf: () => '150000.50' }, paidAmount: 100, balance: 50, status: 'PARTIAL', dueDate: new Date('2026-02-01'), scholarshipId: 'sch1', discount: 5000, latePenalty: 10, subtotal: 9, createdAt: new Date() })
    expect(Object.keys(inv).sort()).toEqual(['academicYear', 'balance', 'dueDate', 'invoiceNumber', 'paidAmount', 'status', 'term', 'totalAmount'])
    expect(inv.totalAmount).toBe(150000.5)
    const pay = toPaymentDto({ amount: 100, method: 'CASH', paidAt: new Date('2026-01-05'), reference: 'MPESA-123', recordedByUid: 'staff9', notes: 'cash from uncle', receiptKey: 'rcpt_1', invoiceId: 'i' })
    expect(Object.keys(pay).sort()).toEqual(['amount', 'method', 'paidAt'])
    expect(JSON.stringify(pay)).not.toMatch(/MPESA|staff9|uncle|rcpt_1/)
  })

  it('attendance: only date and status (no marker, no class, no notes)', () => {
    expect(toAttendanceDto({ date: new Date('2026-03-01'), status: 'ABSENT', markedBy: 'teacher1', classId: 'c1', note: 'sick' })).toEqual({ date: '2026-03-01T00:00:00.000Z', status: 'ABSENT' })
  })

  it('the DTO module never spreads a row and never names a sensitive field in code', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../../lib/guardian/parentDto.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(src).not.toMatch(/\.\.\.\s*(row|r|s|v|student|link|invoice|payment)\b/)
    for (const name of ['orphanStatus', 'isVulnerable', 'vulnerabilityNote', 'medicalAlert', 'supportNeeds', 'exitReason', 'exitDate', 'exitNote', 'nrbNumber',
      'dateOfBirth', 'firebaseUid', 'recordedByUid', 'receiptKey', 'reference', 'scholarshipId', 'markedBy', 'reportCardKey', 'guardianName', 'guardianPhone']) {
      expect(src, name).not.toContain(name)
    }
  })
})

describe('parentPortalService', () => {
  const ctxFor = async (uid = 'uidA', linkId = 'lA1', cap: GuardianCapability = 'results') => {
    const d = await authorizeChild(db, { uid, linkId, capability: cap })
    if (!d.allowed) throw new Error(`denied: ${d.reason}`)
    return d.ctx
  }
  const gate = (open: (t: number, y: string) => boolean | 'throw'): ParentDeps => ({
    isResultsGateOpen: async (_s, t, y) => { const r = open(t, y); if (r === 'throw') throw new Error('gate down'); return r },
  })

  it('results: shows terms whose fees are clear, withholds the rest, and fails closed if the gate errors', async () => {
    mem.seed('termResult', [
      { id: 'r1', studentId: 's1', academicYear: '2026', term: 1, average: 70, grade: 'B', subjectResults: { Maths: { average: 70, grade: 'B', pass: true } } },
      { id: 'r2', studentId: 's1', academicYear: '2026', term: 2, average: 60, grade: 'C', subjectResults: {} },
      { id: 'r3', studentId: 's1', academicYear: '2026', term: 3, average: 50, grade: 'D', subjectResults: {} },
      { id: 'rX', studentId: 's2', academicYear: '2026', term: 1, average: 99, grade: 'A', subjectResults: {} },      // someone else's child
    ])
    const out = await getChildResults(db, await ctxFor(), gate((t) => (t === 1 ? true : t === 2 ? false : 'throw')))
    expect(out.terms.map((t) => [t.term, t.withheld])).toEqual([[3, true], [2, true], [1, false]])
    expect(out.terms.find((t) => t.term === 1)!.average).toBe(70)
    expect(JSON.stringify(out)).not.toMatch(/"average":(60|50|99)/)
  })

  it('results: the gate is asked about THIS student, term and year (the same rule students get)', async () => {
    mem.seed('termResult', [{ id: 'r1', studentId: 's1', academicYear: '2026', term: 2, average: 70, subjectResults: {} }])
    const calls: unknown[][] = []
    await getChildResults(db, await ctxFor(), { isResultsGateOpen: async (...a) => { calls.push(a); return true } })
    expect(calls).toEqual([['s1', 2, '2026']])
  })

  it('results: reads are bounded to 12 terms', async () => {
    mem.seed('termResult', Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, studentId: 's1', academicYear: `20${10 + i}`, term: 1, average: 1, subjectResults: {} })))
    expect((await getChildResults(db, await ctxFor(), gate(() => true))).terms).toHaveLength(12)
  })

  it('fees: totals only positive balances, exposes no payment internals, and ignores other students', async () => {
    mem.seed('invoice', [
      { id: 'i1', studentId: 's1', invoiceNumber: 'INV-1', academicYear: '2026', term: 1, totalAmount: 100, paidAmount: 40, balance: 60, status: 'PARTIAL', dueDate: new Date('2026-02-01') },
      { id: 'i2', studentId: 's1', invoiceNumber: 'INV-2', academicYear: '2026', term: 2, totalAmount: 100, paidAmount: 120, balance: -20, status: 'PAID' },
      { id: 'iX', studentId: 's2', invoiceNumber: 'INV-X', academicYear: '2026', term: 1, totalAmount: 999, paidAmount: 0, balance: 999, status: 'UNPAID' },
    ])
    mem.seed('payment', [
      { id: 'p1', invoiceId: 'i1', amount: 40, method: 'CASH', paidAt: new Date('2026-01-10'), reference: 'SECRET-REF', recordedByUid: 'staff', notes: 'private', receiptKey: 'rk' },
      { id: 'pX', invoiceId: 'iX', amount: 1, method: 'CASH', paidAt: new Date('2026-01-10') },
    ])
    const out = await getChildFees(db, await ctxFor('uidA', 'lA1', 'fees'))
    expect(out.currency).toBe('MWK')
    expect(out.totalOutstanding).toBe(60)
    expect(out.invoices.map((i) => i.invoiceNumber).sort()).toEqual(['INV-1', 'INV-2'])
    expect(out.payments).toHaveLength(1)
    expect(JSON.stringify(out)).not.toMatch(/SECRET-REF|staff|private|rk|INV-X|999/)
  })

  it('fees with nothing invoiced is an empty, valid answer', async () => {
    expect(await getChildFees(db, await ctxFor('uidA', 'lA1', 'fees'))).toEqual({ currency: 'MWK', totalOutstanding: 0, invoices: [], payments: [] })
  })

  it('attendance: a summary over the recent window and the latest 30 days, with no marker or notes', async () => {
    mem.seed('attendance', Array.from({ length: 50 }, (_, i) => ({ id: `a${i}`, studentId: 's1', date: new Date(2026, 0, i + 1), status: i % 5 === 0 ? 'ABSENT' : 'PRESENT', markedBy: 't', note: 'n' })))
    mem.seed('attendance', [{ id: 'aX', studentId: 's2', date: new Date(2026, 5, 1), status: 'ABSENT' }])
    const out = await getChildAttendance(db, await ctxFor('uidA', 'lA1', 'attendance'))
    expect(out.summary).toEqual({ windowSize: 50, byStatus: { ABSENT: 10, PRESENT: 40 } })
    expect(out.recent).toHaveLength(30)
    expect(out.recent[0]!.date! > out.recent[1]!.date!).toBe(true)         // newest first
    expect(JSON.stringify(out)).not.toMatch(/markedBy|"t"|note/)
  })
})
