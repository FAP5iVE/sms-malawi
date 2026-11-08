// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { makeDb } from './helpers/memoryDb'
import { authorizeChild, findGuardianProfile, listChildren, recordAccess } from '../guardianAccess'
import { getChildAttendance, getChildFees, getChildReportCard, getChildResults, type ParentDeps } from '../parentPortalService'
import { toAttendanceDto, toAttendanceSummaryDto, toChildDto, toExamDto, toInvoiceDto, toPaymentDto, toResultsTermDto } from '@/server/lib/guardian/parentDto'
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
    const exam = { id: 'e', title: 'T', subject: 'S', type: 'END_TERM', academicYear: '2026', term: 1, date: null, maxMark: 100, mark: 80, percent: 80, absent: false }
    expect(toResultsTermDto({ ...row, aggregatePoints: 14, gradingTrack: 'MSCE' }, true, { exams: [exam], reportCard: true })).toEqual({
      academicYear: '2026', term: 1, withheld: true, hasSummary: false, average: null, grade: null, gradingTrack: null, aggregatePoints: null, aggregateSubjects: [],
      classPosition: null, classSize: null, passStatus: null, attendanceDays: null, absentDays: null, subjects: [], teacherComment: null, headComment: null, exams: [], reportCard: false,
    })
    expect(JSON.stringify(toResultsTermDto(row, true))).not.toMatch(/Maths|71|Good|Fine/)
  })

  it('results: an open term shows rounded averages, aggregate points, and only subject/average/grade/pass per subject', () => {
    const row = {
      academicYear: '2026', term: 2, average: 71.26, grade: 'B', classPosition: 3, classTotal: 40, passStatus: true, attendanceDays: 50, absentDays: 2,
      aggregatePoints: 9, gradingTrack: 'MSCE', aggregateSubjects: ['Maths', 'English'], reportCardKey: 'file_secret', totalMark: 800,
      subjectResults: { Maths: { average: 80.04, grade: 'A', pass: true, ca: [1, 2], exam: 77, rawNotes: 'x' }, English: { average: 55, grade: 'C', pass: false } },
    }
    const dto = toResultsTermDto(row, false)
    expect(dto.average).toBe(71.3)
    expect(dto.passStatus).toBe(true)
    expect(dto.subjects).toEqual([{ subject: 'English', average: 55, grade: 'C', pass: false }, { subject: 'Maths', average: 80, grade: 'A', pass: true }])
    const text = JSON.stringify(dto)
    expect(dto).toMatchObject({ gradingTrack: 'MSCE', aggregatePoints: 9, aggregateSubjects: ['Maths', 'English'] })
    for (const leak of ['reportCardKey', 'file_secret', 'totalMark', 'rawNotes', '"ca"', '"exam"']) expect(text, leak).not.toContain(leak)
  })

  it('results: aggregate points belong to the MSCE track only, capped at six subjects, and legacy rows are read sensibly', () => {
    const base = { academicYear: '2026', term: 1, subjectResults: {} }
    const subjects = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 1, null]
    expect(toResultsTermDto({ ...base, gradingTrack: 'MSCE', aggregatePoints: 12, aggregateSubjects: subjects }, false)).toMatchObject({ aggregatePoints: 12, aggregateSubjects: ['a', 'b', 'c', 'd', 'e', 'f'] })
    expect(toResultsTermDto({ ...base, gradingTrack: 'JCE', aggregatePoints: 12, aggregateSubjects: subjects }, false)).toMatchObject({ gradingTrack: 'JCE', aggregatePoints: null, aggregateSubjects: [] })
    expect(toResultsTermDto({ ...base, gradingTrack: null, aggregatePoints: 20 }, false)).toMatchObject({ gradingTrack: 'MSCE', aggregatePoints: 20 })
    expect(toResultsTermDto({ ...base, gradingTrack: null, aggregatePoints: null }, false)).toMatchObject({ gradingTrack: null, aggregatePoints: null })
    expect(toResultsTermDto({ ...base, gradingTrack: 'MSCE', aggregatePoints: null }, false)).toMatchObject({ gradingTrack: 'MSCE', aggregatePoints: null })   // fewer than six graded
    expect(toResultsTermDto({ ...base, gradingTrack: 'MSCE', aggregatePoints: 'x' }, false).aggregatePoints).toBeNull()
  })

  it('exam: only named fields, the mark’s teacher comment is never sent, and absent means no mark', () => {
    const dto = toExamDto(
      { id: 'e1', title: 'Test 1', subject: 'Maths', type: 'WEEKLY_TEST', academicYear: '2025/2026', term: 1, date: new Date('2026-01-10'), maxMark: { valueOf: () => '20.00' }, createdByUid: 'staff1', venue: 'Hall' },
      { mark: { valueOf: () => '17.50' }, absent: false, comment: 'private note', enteredByUid: 'staff2', isDraft: false },
    )
    expect(Object.keys(dto).sort()).toEqual(['absent', 'academicYear', 'date', 'id', 'mark', 'maxMark', 'percent', 'subject', 'term', 'title', 'type'])
    expect(dto).toMatchObject({ mark: 17.5, maxMark: 20, percent: 87.5 })
    expect(JSON.stringify(dto)).not.toMatch(/private note|staff1|staff2|Hall/)
    expect(toExamDto({ id: 'e', maxMark: 20 }, { mark: 12, absent: true })).toMatchObject({ mark: null, percent: null, absent: true })
    expect(toExamDto({ id: 'e', maxMark: 0 }, { mark: 5, absent: false }).percent).toBeNull()      // never divides by zero
  })

  it('attendance summary: whole non-negative counts and a rate, whatever the input', () => {
    expect(toAttendanceSummaryDto({ daysPresent: 30, daysLate: 5, daysAbsent: 5, totalDays: 40, attendanceRate: 87.5, byClass: [1], weekly: [1] }))
      .toEqual({ present: 30, late: 5, absent: 5, recorded: 40, attendanceRate: 87.5 })
    expect(toAttendanceSummaryDto({ daysPresent: -3, daysLate: 1.9, daysAbsent: 'x', totalDays: null, attendanceRate: null })).toEqual({ present: 0, late: 1, absent: 0, recorded: 0, attendanceRate: null })
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
  const YEAR = '2025/2026'
  const baseDeps = {
    getReportCardData: async (...a: unknown[]) => ({ card: a }),
    resolvePeriod: async (i: { academicYear?: unknown; term?: unknown }) => ({ academicYear: typeof i.academicYear === 'string' ? i.academicYear : YEAR, term: Number(i.term) || 2 }),
    getTermAttendance: async () => ({ daysPresent: 30, daysLate: 5, daysAbsent: 5, totalDays: 40, attendanceRate: 87.5 }),
  }
  const gate = (open: (t: number, y: string) => boolean | 'throw'): ParentDeps => ({
    ...baseDeps,
    isResultsGateOpen: async (_s, t, y) => { const r = open(t, y); if (r === 'throw') throw new Error('gate down'); return r },
  })
  const allOpen = gate(() => true)
  /** One end-of-term exam for a class/term, in the given release state. */
  const endTerm = (year: string, term: number, status = 'RESULTS_RELEASED', classId = 'c1', id = `end-${classId}-${year}-${term}`) =>
    mem.seed('exam', [{ id, classId, type: 'END_TERM', academicYear: year, term, status, subject: 'Maths', title: 'End of term', maxMark: 100, date: new Date(2026, 2, term) }])
  const result = (id: string, term: number, extra: Record<string, unknown> = {}, studentId = 's1', year = YEAR) =>
    ({ id, studentId, classId: 'c1', academicYear: year, term, average: 70, grade: 'B', subjectResults: {}, ...extra })

  it('results: shows terms whose fees are clear, withholds the rest, and fails closed if the gate errors', async () => {
    mem.seed('termResult', [
      result('r1', 1, { subjectResults: { Maths: { average: 70, grade: 'B', pass: true } } }),
      result('r2', 2, { average: 60, grade: 'C' }),
      result('r3', 3, { average: 50, grade: 'D' }),
      result('rX', 1, { average: 99, grade: 'A' }, 's2'),                                    // someone else's child
    ])
    for (const t of [1, 2, 3]) endTerm(YEAR, t)
    const out = await getChildResults(db, await ctxFor(), gate((t) => (t === 1 ? true : t === 2 ? false : 'throw')))
    expect(out.terms.map((t) => [t.term, t.withheld])).toEqual([[3, true], [2, true], [1, false]])
    expect(out.terms.find((t) => t.term === 1)!.average).toBe(70)
    expect(JSON.stringify(out)).not.toMatch(/"average":(60|50|99)/)
  })

  it('results: the gate is asked about THIS student, term and year (the same rule students get)', async () => {
    mem.seed('termResult', [result('r1', 2)])
    endTerm(YEAR, 2)
    const calls: unknown[][] = []
    await getChildResults(db, await ctxFor(), { ...baseDeps, isResultsGateOpen: async (...a) => { calls.push(a); return true } })
    expect(calls).toEqual([['s1', 2, YEAR]])
  })

  it('results: reads are bounded to 12 terms', async () => {
    const years = Array.from({ length: 30 }, (_, i) => `${2010 + i}/${2011 + i}`)
    mem.seed('termResult', years.map((y, i) => result(`r${i}`, 1, { average: 1 }, 's1', y)))
    for (const y of years) endTerm(y, 1)
    expect((await getChildResults(db, await ctxFor(), allOpen)).terms).toHaveLength(12)
  })

  it('results: only RELEASED terms are listed; a result row whose end-of-term exam was never released, or was unlocked after release, is omitted entirely', async () => {
    mem.seed('termResult', [result('r1', 1), result('r2', 2), result('r3', 3)])
    endTerm(YEAR, 1)                                  // released
    endTerm(YEAR, 2, 'MARKS_PENDING')                 // released once, then unlocked for editing: the row is stale
    // term 3: result row but no exam at all
    const out = await getChildResults(db, await ctxFor(), allOpen)
    expect(out.terms.map((t) => t.term)).toEqual([1])
  })

  it('results: ONE unlocked end-of-term exam hides the whole term until it is released again', async () => {
    mem.seed('termResult', [result('r1', 1)])
    endTerm(YEAR, 1, 'RESULTS_RELEASED', 'c1', 'maths')
    endTerm(YEAR, 1, 'MARKS_FINAL', 'c1', 'english')
    expect((await getChildResults(db, await ctxFor(), allOpen)).terms).toEqual([])
    mem.all('exam').find((e) => e.id === 'english')!.status = 'RESULTS_RELEASED'
    expect((await getChildResults(db, await ctxFor(), allOpen)).terms.map((t) => t.term)).toEqual([1])
  })

  it('results: release is judged for the class the result was computed for, and a row with no class is never shown', async () => {
    mem.seed('termResult', [result('r1', 1), { ...result('r2', 2), classId: undefined }])
    endTerm(YEAR, 1, 'RESULTS_RELEASED', 'c2')        // a DIFFERENT class released term 1
    endTerm(YEAR, 2)
    expect((await getChildResults(db, await ctxFor(), allOpen)).terms).toEqual([])
  })

  it('results: shows aggregate points on the MSCE track and an overall grade on the JCE track', async () => {
    mem.seed('termResult', [
      result('r1', 1, { grade: '', gradingTrack: 'MSCE', aggregatePoints: 14, aggregateSubjects: ['Maths', 'English'] }),
      result('r2', 2, { grade: 'B', gradingTrack: 'JCE', aggregatePoints: null }),
    ])
    endTerm(YEAR, 1); endTerm(YEAR, 2)
    const t = (await getChildResults(db, await ctxFor(), allOpen)).terms
    expect(t.find((x) => x.term === 1)).toMatchObject({ gradingTrack: 'MSCE', aggregatePoints: 14, aggregateSubjects: ['Maths', 'English'] })
    expect(t.find((x) => x.term === 2)).toMatchObject({ gradingTrack: 'JCE', aggregatePoints: null, grade: 'B' })
  })

  describe('exam history', () => {
    const mark = (examId: string, studentId: string, extra: Record<string, unknown> = {}) =>
      ({ id: `m-${examId}-${studentId}`, examId, studentId, mark: 18, absent: false, isDraft: false, ...extra })
    const exam = (id: string, extra: Record<string, unknown> = {}) =>
      ({ id, classId: 'c1', type: 'WEEKLY_TEST', subject: 'Maths', title: `Test ${id}`, maxMark: 20, academicYear: YEAR, term: 1, status: 'RESULTS_RELEASED', date: new Date(2026, 0, 10), ...extra })

    it('lists only released exams with final marks, and only this child\u2019s own marks', async () => {
      mem.seed('exam', [exam('x1'), exam('x2', { status: 'MARKS_PENDING' }), exam('x3'), exam('x4')])
      mem.seed('examMark', [
        mark('x1', 's1'),                               // shown
        mark('x2', 's1'),                               // exam not released
        mark('x3', 's1', { isDraft: true }),            // mark not final
        mark('x4', 's2'),                               // another child's mark
      ])
      const t = (await getChildResults(db, await ctxFor(), allOpen)).terms
      expect(t).toHaveLength(1)
      expect(t[0]!.exams.map((e) => e.id)).toEqual(['x1'])
      expect(t[0]!.exams[0]).toMatchObject({ mark: 18, maxMark: 20, percent: 90, absent: false, type: 'WEEKLY_TEST' })
    })

    it('a term with released exams but no computed result is still listed, without a summary or report card', async () => {
      mem.seed('exam', [exam('x1')]); mem.seed('examMark', [mark('x1', 's1')])
      const [term] = (await getChildResults(db, await ctxFor(), allOpen)).terms
      expect(term).toMatchObject({ term: 1, hasSummary: false, reportCard: false, withheld: false, average: null })
      expect(term!.exams).toHaveLength(1)
    })

    it('history spans years and terms, newest first', async () => {
      mem.seed('exam', [exam('a', { academicYear: '2024/2025', term: 3 }), exam('b'), exam('c', { term: 2 })])
      mem.seed('examMark', ['a', 'b', 'c'].map((id) => mark(id, 's1')))
      expect((await getChildResults(db, await ctxFor(), allOpen)).terms.map((t) => [t.academicYear, t.term])).toEqual([[YEAR, 2], [YEAR, 1], ['2024/2025', 3]])
    })

    it('an absent child shows no mark, not zero', async () => {
      mem.seed('exam', [exam('x1')]); mem.seed('examMark', [mark('x1', 's1', { mark: null, absent: true })])
      expect((await getChildResults(db, await ctxFor(), allOpen)).terms[0]!.exams[0]).toMatchObject({ mark: null, percent: null, absent: true })
    })

    it('a fee-gated term carries no exams at all, only that it is withheld', async () => {
      mem.seed('exam', [exam('x1')]); mem.seed('examMark', [mark('x1', 's1')])
      const [term] = (await getChildResults(db, await ctxFor(), gate(() => false))).terms
      expect(term).toMatchObject({ withheld: true, exams: [], reportCard: false })
      expect(JSON.stringify(term)).not.toMatch(/Test x1|18|90/)
    })

    it('reportCard is offered only for a released, fee-clear term with a computed result', async () => {
      mem.seed('termResult', [result('r1', 1)]); endTerm(YEAR, 1)
      expect((await getChildResults(db, await ctxFor(), allOpen)).terms[0]!.reportCard).toBe(true)
      expect((await getChildResults(db, await ctxFor(), gate(() => false))).terms[0]!.reportCard).toBe(false)
    })
  })

  describe('report card', () => {
    const ask = async (deps: ParentDeps = allOpen, term: 1 | 2 | 3 = 1) => getChildReportCard(db, await ctxFor(), deps, { academicYear: YEAR, term })
    it('is built by the school\u2019s own builder for THIS student, term and year', async () => {
      mem.seed('termResult', [result('r1', 1)]); endTerm(YEAR, 1)
      expect(await ask()).toEqual({ card: ['s1', 1, YEAR] })
    })
    it.each([
      ['no computed result', () => { endTerm(YEAR, 1) }, allOpen],
      ['the term is not released', () => { mem.seed('termResult', [result('r1', 1)]); endTerm(YEAR, 1, 'MARKS_PENDING') }, allOpen],
      ['fees are outstanding', () => { mem.seed('termResult', [result('r1', 1)]); endTerm(YEAR, 1) }, gate(() => false)],
      ['the fee gate cannot answer', () => { mem.seed('termResult', [result('r1', 1)]); endTerm(YEAR, 1) }, gate(() => 'throw')],
      ['it is another child\u2019s result', () => { mem.seed('termResult', [result('r1', 1, {}, 's2')]); endTerm(YEAR, 1) }, allOpen],
    ])('is not available when %s', async (_name, setup, deps) => {
      ;(setup as () => void)()
      expect(await ask(deps as ParentDeps)).toBeNull()
    })
    it('never calls the builder when it is refused', async () => {
      let called = 0
      mem.seed('termResult', [result('r1', 1)]); endTerm(YEAR, 1, 'MARKS_PENDING')
      await ask({ ...allOpen, getReportCardData: async () => { called++; return {} } })
      expect(called).toBe(0)
    })
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

  it('attendance: the student\u2019s own term figures, the day records newest first, and no marker or notes', async () => {
    mem.seed('attendance', Array.from({ length: 50 }, (_, i) => ({ id: `a${i}`, studentId: 's1', date: new Date(2026, 0, i + 1), status: i % 5 === 0 ? 'ABSENT' : 'PRESENT', markedBy: 't', note: 'n' })))
    mem.seed('attendance', [{ id: 'aX', studentId: 's2', date: new Date(2026, 5, 1), status: 'ABSENT' }])
    const out = await getChildAttendance(db, await ctxFor('uidA', 'lA1', 'attendance'), allOpen, { academicYear: '2024/2025', term: 3 })
    expect(out.period).toEqual({ academicYear: '2024/2025', term: 3 })
    expect(out.summary).toEqual({ present: 30, late: 5, absent: 5, recorded: 40, attendanceRate: 87.5 })
    expect(out.records).toHaveLength(50)
    expect(out.records[0]!.date! > out.records[1]!.date!).toBe(true)         // newest first
    expect(JSON.stringify(out)).not.toMatch(/markedBy|"t"|note|aX/)
  })

  it('attendance: with no period asked for, the school\u2019s current one is used; records are bounded', async () => {
    mem.seed('attendance', Array.from({ length: 500 }, (_, i) => ({ id: `a${i}`, studentId: 's1', date: new Date(2024, 0, 1 + i), status: 'PRESENT' })))
    const out = await getChildAttendance(db, await ctxFor('uidA', 'lA1', 'attendance'), allOpen)
    expect(out.period).toEqual({ academicYear: YEAR, term: 2 })
    expect(out.records).toHaveLength(400)
  })
})
