// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { makeDb } from './helpers/memoryDb'
import { proposeFromDirectoryEntry, syncStudentDirectory, type DirectoryCard } from '../guardianIdentityService'
import {
  listQueue, listRecentAccess, listStudentsForGuardians, repointLink, type StaffCtx,
} from '../guardianLinkService'
import { backfillNationalIds } from '../guardianNationalIdService'
import { GuardianError } from '../errors'
import type { AuditRecord } from '../db'

const T0 = new Date('2026-11-21T10:00:00Z')
let mem: ReturnType<typeof makeDb>['mem']
let db: ReturnType<typeof makeDb>['db']
let audits: AuditRecord[]

const as = (role: string): StaffCtx => ({ actor: { uid: `${role}-1`, role }, audit: (r) => { audits.push(r) }, now: () => T0 })
const admin = () => as('admin')
const registrar = () => as('lower_rank')

const card = (id: string, studentId: string, fullName: string, phone: string, extra: Partial<DirectoryCard> = {}): DirectoryCard =>
  ({ id, studentId, fullName, relation: 'Mother', phone, altPhone: null, email: null, nrbNumber: null, ...extra })

async function code(p: Promise<unknown>): Promise<string> {
  try { await p } catch (e) { return e instanceof GuardianError ? e.code : `ERR:${String(e)}` }
  return 'OK'
}

beforeEach(() => {
  ;({ mem, db } = makeDb())
  audits = []
  mem.seed('class', [{ id: 'c1', name: 'Form 1A' }])
  mem.seed('student', [
    { id: 's1', firstName: 'Chisomo', lastName: 'Banda', registrationNo: 'R001', status: 'ACTIVE', classId: 'c1', createdAt: new Date('2026-01-01') },
    { id: 's2', firstName: 'Tadala', lastName: 'Banda', registrationNo: 'R002', status: 'ACTIVE', classId: 'c1', createdAt: new Date('2026-02-01') },
    { id: 's3', firstName: 'Mphatso', lastName: 'Phiri', registrationNo: 'R003', status: 'ACTIVE', classId: null, createdAt: new Date('2026-03-01') },
    { id: 's4', firstName: 'Old', lastName: 'Student', registrationNo: 'R004', status: 'GRADUATED', classId: null, createdAt: new Date('2020-01-01') },
  ])
})

const proposeAll = async (cards: DirectoryCard[]) => {
  mem.seed('studentGuardian', cards.map((c) => ({ ...c })))
  const out = []
  for (const c of cards) out.push(await proposeFromDirectoryEntry(db, c, { actor: { uid: 'sys', role: 'admin' } }))
  return out
}
const linkFor = (studentId: string) => mem.all('guardianLink').find((l) => l.studentId === studentId)!

describe('proposing a card with a national ID', () => {
  it('stores the normalised ID on the new profile', async () => {
    await proposeAll([card('g1', 's1', 'Mary Banda', '0999111111', { nrbNumber: 'ab 12-cd34' })])
    expect(mem.all('guardianProfile')[0]!.nationalId).toBe('AB12CD34')
  })

  it('same ID and the same name on another child: flagged as the same person', async () => {
    const [a, b] = await proposeAll([
      card('g1', 's1', 'Mary Banda', '0999111111', { nrbNumber: 'AB12CD34' }),
      card('g2', 's2', 'Mary Banda', '0888222222', { nrbNumber: 'AB12 CD34' }),   // different phone: ID is what links them
    ])
    if (a === undefined || b === undefined) {
      throw new Error('Expected a proposal result for each guardian directory card')
    }
    expect(a.outcome === 'CREATED' && a.suggestion).toBeNull()
    expect(b.outcome === 'CREATED' && b.suggestion?.method).toBe('NATIONAL_ID_NAME')
    expect(linkFor('s2')).toMatchObject({ suggestedProfileId: linkFor('s1').profileId, suggestedMethod: 'NATIONAL_ID_NAME' })
  })

  it('same ID but a different name is flagged, labelled as not certain', async () => {
    await proposeAll([
      card('g1', 's1', 'Mary Banda', '0999111111', { nrbNumber: 'AB12CD34' }),
      card('g3', 's3', 'Grace Mwale', '0777333333', { nrbNumber: 'AB12CD34' }),
    ])
    expect(linkFor('s3').suggestedMethod).toBe('NATIONAL_ID')
  })

  it('placeholder IDs never link anyone', async () => {
    await proposeAll([
      card('g1', 's1', 'Mary Banda', '0999111111', { nrbNumber: 'N/A' }),
      card('g2', 's2', 'Mary Banda', '0888222222', { nrbNumber: 'N/A' }),
    ])
    expect(mem.all('guardianProfile').every((p) => p.nationalId === null)).toBe(true)
    expect(linkFor('s2').suggestedProfileId).toBeNull()
  })

  it('a sync fills a missing ID on an existing profile but never replaces one', async () => {
    await proposeAll([card('g1', 's1', 'Mary Banda', '0999111111')])
    const stored = mem.all('studentGuardian').find((c) => c.id === 'g1')!
    stored.nrbNumber = 'AB12CD34'
    await syncStudentDirectory(db, 's1', { actor: { uid: 'sys', role: 'admin' } })
    expect(mem.all('guardianProfile')[0]!.nationalId).toBe('AB12CD34')
    stored.nrbNumber = 'ZZ99YY88'
    await syncStudentDirectory(db, 's1', { actor: { uid: 'sys', role: 'admin' } })
    expect(mem.all('guardianProfile')[0]!.nationalId).toBe('AB12CD34')
  })
})

describe('the duplicate flag names every student involved', () => {
  beforeEach(async () => {
    await proposeAll([
      card('g1', 's1', 'Mary Banda', '0999111111', { nrbNumber: 'AB12CD34' }),
      card('g2', 's2', 'Mary Banda', '0888222222', { nrbNumber: 'AB12CD34' }),
      card('g3', 's3', 'Grace Mwale', '0777333333', { nrbNumber: 'AB12CD34' }),
    ])
  })

  it('a flagged card lists the students the person on file is linked to, and other flagged entries', async () => {
    const { items } = await listQueue(db, { status: 'PENDING' }, registrar())
    const s2 = items.find((i) => (i.student as { id: string }).id === 's2')!
    const s3 = items.find((i) => (i.student as { id: string }).id === 's3')!
    expect(s2.suggestion).toMatchObject({ method: 'NATIONAL_ID_NAME', profileName: 'Mary Banda' })
    const listed = (s2.suggestion as { students: Array<{ id: string; via: string }> }).students
    // the person on file (s1) and the other waiting entry flagged as the same person (s3); never itself
    expect(listed.map((s) => [s.id, s.via])).toEqual([['s1', 'LINKED'], ['s3', 'FLAGGED']])
    const s3listed = (s3.suggestion as { students: Array<{ id: string; via: string }> }).students
    expect(s3listed.map((s) => s.id).sort()).toEqual(['s1', 's2'])
    expect(s3listed.find((s) => s.id === 's2')!.via).toBe('FLAGGED')
  })

  it('the person on file shows which waiting entries may be them', async () => {
    const { items } = await listQueue(db, { status: 'PENDING' }, registrar())
    const s1 = items.find((i) => (i.student as { id: string }).id === 's1')!
    const also = (s1.alsoFlaggedOn as { students: Array<{ id: string }> }).students
    expect(also.map((s) => s.id).sort()).toEqual(['s2', 's3'])
    expect(s1.suggestion).toBeNull()
  })

  it('shows only the end of the national ID, never the whole number, anywhere in the response', async () => {
    const res = await listQueue(db, { status: 'PENDING' }, registrar())
    const json = JSON.stringify(res)
    expect(json).toContain('•••••D34')
    expect(json).not.toContain('AB12CD34')
  })

  it('warns when both have a national ID and the IDs differ', async () => {
    const p1 = linkFor('s1').profileId as string
    const p2 = linkFor('s2').profileId as string
    mem.all('guardianProfile').find((p) => p.id === p2)!.nationalId = 'ZZ99YY88'
    mem.all('guardianLink').find((l) => l.studentId === 's2')!.suggestedProfileId = p1
    const { items } = await listQueue(db, { status: 'PENDING' }, registrar())
    const s2 = items.find((i) => (i.student as { id: string }).id === 's2')!
    expect((s2.suggestion as { idConflict: boolean }).idConflict).toBe(true)
  })

  it('moving a link to the person on file carries a missing national ID across, never replaces one', async () => {
    const l2 = linkFor('s2')
    const target = linkFor('s1').profileId as string
    mem.all('guardianProfile').find((p) => p.id === target)!.nationalId = null
    await repointLink(db, l2.id as string, target, registrar())
    expect(mem.all('guardianProfile').find((p) => p.id === target)!.nationalId).toBe('AB12CD34')
  })
})

describe('Review queue search', () => {
  beforeEach(async () => {
    await proposeAll([
      card('g1', 's1', 'Mary Banda', '0999111111', { email: 'mary@mail.com', nrbNumber: 'AB12CD34' }),
      card('g3', 's3', 'Peter Phiri', '0888333333', { nrbNumber: 'KR77PQ55' }),
    ])
  })
  const find = async (search: string, status?: string) =>
    (await listQueue(db, { search, ...(status ? { status } : {}) }, registrar())).items.map((i) => (i.student as { id: string }).id)

  it.each([
    ['guardian name, any word order', 'banda mary', ['s1']],
    ['phone as typed locally', '0999111111', ['s1']],
    ['phone without the leading zero', '999111', ['s1']],
    ['e-mail', 'mary@mail', ['s1']],
    ['national ID, any spacing', 'ab12 cd', ['s1']],
    ['student name', 'mphatso', ['s3']],
    ['registration number', 'R003', ['s3']],
  ])('finds by %s', async (_label, term, expected) => {
    expect(await find(term)).toEqual(expected)
  })

  it('returns nothing, not everything, when nothing matches', async () => {
    expect(await find('zzzzqq')).toEqual([])
  })

  it('works inside the chosen status filter', async () => {
    expect(await find('mary', 'ACTIVE')).toEqual([])
    expect(await find('mary', 'PENDING')).toEqual(['s1'])
  })
})

describe('Student tab list', () => {
  const ids = (r: { items: Array<{ id: unknown }> }) => r.items.map((i) => i.id)

  it('browses current students, newest first, without graduated ones', async () => {
    expect(ids(await listStudentsForGuardians(db, {}, registrar()))).toEqual(['s3', 's2', 's1'])
  })

  it('can be ordered A to Z by surname', async () => {
    expect(ids(await listStudentsForGuardians(db, { sort: 'name' }, registrar()))).toEqual(['s1', 's2', 's3'])
  })

  it('searching covers the whole school, former students included', async () => {
    expect(ids(await listStudentsForGuardians(db, { search: 'old' }, registrar()))).toEqual(['s4'])
    expect(ids(await listStudentsForGuardians(db, { search: 'R00' }, registrar())).sort()).toEqual(['s1', 's2', 's3', 's4'])
  })

  it('pages, and says whether another page exists', async () => {
    const p1 = await listStudentsForGuardians(db, { take: 2 }, registrar())
    expect([ids(p1), p1.hasMore]).toEqual([['s3', 's2'], true])
    const p2 = await listStudentsForGuardians(db, { take: 2, skip: 2 }, registrar())
    expect([ids(p2), p2.hasMore]).toEqual([['s1'], false])
  })

  it('says where each student stands and their class', async () => {
    await proposeAll([card('g1', 's1', 'Mary Banda', '0999111111')])
    mem.seed('studentGuardian', [card('g9', 's2', 'Other Parent', '0555000000')])
    const r = await listStudentsForGuardians(db, { sort: 'name' }, registrar())
    expect(r.items[0]).toMatchObject({ id: 's1', className: 'Form 1A', cards: 1, links: { pending: 1, active: 0, other: 0 } })
    expect(r.items[1]).toMatchObject({ id: 's2', cards: 1, links: { pending: 0 } })
    expect(r.items[2]).toMatchObject({ id: 's3', className: null, cards: 0 })
  })
})

describe('Access log: most recently opened', () => {
  beforeEach(() => {
    mem.seed('guardianProfile', [{ id: 'p1', fullName: 'Mary Banda', normalizedName: 'mary banda' }, { id: 'p2', fullName: 'Peter Phiri', normalizedName: 'peter phiri' }])
    const at = (m: number) => new Date(T0.getTime() - m * 60_000)
    mem.seed('guardianAccessLog', [
      { id: 'a1', profileId: 'p1', studentId: 's1', module: 'results', outcome: 'ALLOWED', createdAt: at(50) },
      { id: 'a2', profileId: 'p2', studentId: 's3', module: 'fees', outcome: 'ALLOWED', createdAt: at(30) },
      { id: 'a3', profileId: 'p1', studentId: 's1', module: 'fees', outcome: 'DENIED', reason: 'NO_CAPABILITY', createdAt: at(5) },
      { id: 'a4', profileId: 'p1', studentId: null, module: 'children', outcome: 'ALLOWED', createdAt: at(1) },   // not about one child
    ])
  })

  it('lists one row per student, newest activity first, with the guardian and section', async () => {
    const { items } = await listRecentAccess(db, {}, admin())
    expect(items.map((i) => (i.student as { id: string }).id)).toEqual(['s1', 's3'])
    expect(items[0]).toMatchObject({ guardianName: 'Mary Banda', module: 'fees', outcome: 'DENIED', events: 2, refused: 1 })
    expect(items[1]).toMatchObject({ guardianName: 'Peter Phiri', module: 'fees', outcome: 'ALLOWED', events: 1, refused: 0 })
  })

  it('respects take', async () => {
    expect((await listRecentAccess(db, { take: 1 }, admin())).items).toHaveLength(1)
  })

  it('needs the access-log permission', async () => {
    expect(await code(listRecentAccess(db, {}, registrar()))).toBe('FORBIDDEN')
  })
})

describe('backfillNationalIds', () => {
  /** Three profiles made before IDs mattered: the same parent on three children, plus one with conflicting cards. */
  beforeEach(() => {
    mem.seed('studentGuardian', [
      card('g1', 's1', 'Mary Banda', '0999111111', { nrbNumber: 'AB12CD34' }),
      card('g2', 's2', 'Mary Banda', '0888222222', { nrbNumber: 'ab 12 cd 34' }),
      card('g3', 's3', 'Grace Mwale', '0777333333', { nrbNumber: 'AB12CD34' }),
      card('g4', 's4', 'Two Cards', '0666444444', { nrbNumber: 'KR77PQ55' }),
      card('g5', 's4', 'Two Cards', '0666444444', { nrbNumber: 'ZZ99YY88' }),
    ])
    const old = (id: string, name: string, at: string) => ({ id, fullName: name, normalizedName: name.toLowerCase(), createdAt: new Date(at) })
    mem.seed('guardianProfile', [old('p1', 'Mary Banda', '2026-01-01'), old('p2', 'Mary Banda', '2026-02-01'), old('p3', 'Grace Mwale', '2026-03-01'), old('p4', 'Two Cards', '2026-04-01')])
    const l = (id: string, profileId: string, studentId: string, directoryEntryId: string) => ({ id, profileId, studentId, relationship: 'Mother', directoryEntryId })
    mem.seed('guardianLink', [l('l1', 'p1', 's1', 'g1'), l('l2', 'p2', 's2', 'g2'), l('l3', 'p3', 's3', 'g3'), l('l4', 'p4', 's4', 'g4'), l('l5', 'p4', 's4', 'g5')])
  })
  const pid = (id: string) => mem.all('guardianProfile').find((p) => p.id === id)!

  it('a preview reports what would happen and writes nothing', async () => {
    const r = await backfillNationalIds(db, { apply: false }, admin())
    expect(r).toMatchObject({ applied: false, idsFilled: 3, conflicts: 1, sharedIds: 1, entriesFlagged: 2 })
    expect(mem.all('guardianProfile').every((p) => p.nationalId === null)).toBe(true)
    expect(mem.all('guardianLink').every((l) => l.suggestedProfileId === null)).toBe(true)
    expect(audits).toEqual([])
  })

  it('apply fills IDs, leaves conflicting cards blank, and flags the later entries against the oldest', async () => {
    const r = await backfillNationalIds(db, { apply: true }, admin())
    expect(r).toMatchObject({ applied: true, idsFilled: 3, conflicts: 1, entriesFlagged: 2 })
    expect(['p1', 'p2', 'p3'].map((id) => pid(id).nationalId)).toEqual(['AB12CD34', 'AB12CD34', 'AB12CD34'])
    expect(pid('p4').nationalId).toBeNull()                                    // cards disagree: staff decide
    const l = (id: string) => mem.all('guardianLink').find((x) => x.id === id)!
    expect(l('l1').suggestedProfileId).toBeNull()                              // the person on file is not flagged
    expect(l('l2')).toMatchObject({ suggestedProfileId: 'p1', suggestedMethod: 'NATIONAL_ID_NAME' })
    expect(l('l3')).toMatchObject({ suggestedProfileId: 'p1', suggestedMethod: 'NATIONAL_ID' })
    expect(audits.map((a) => a.action)).toEqual(['guardian.national_ids_backfilled'])
  })

  it('is safe to run again: nothing new happens', async () => {
    await backfillNationalIds(db, { apply: true }, admin())
    audits = []
    const again = await backfillNationalIds(db, { apply: true }, admin())
    // the conflicting cards are still unresolved, so they are still reported; nothing else changes
    expect(again).toMatchObject({ idsFilled: 0, conflicts: 1, entriesFlagged: 0 })
    expect(audits).toHaveLength(1)
  })

  it('never touches a link staff already decided, and never replaces an ID', async () => {
    pid('p2').nationalId = 'OLD11ID22'
    mem.all('guardianLink').find((l) => l.id === 'l3')!.status = 'ACTIVE'
    const r = await backfillNationalIds(db, { apply: true }, admin())
    expect(pid('p2').nationalId).toBe('OLD11ID22')
    expect(mem.all('guardianLink').find((l) => l.id === 'l3')!.suggestedProfileId).toBeNull()
    expect(r.entriesFlagged).toBe(0)
  })

  it('does not flag when the person on file is already linked to that child', async () => {
    mem.seed('guardianLink', [{ id: 'lx', profileId: 'p1', studentId: 's2', relationship: 'Mother' }])
    const r = await backfillNationalIds(db, { apply: true }, admin())
    expect(mem.all('guardianLink').find((l) => l.id === 'l2')!.suggestedProfileId).toBeNull()   // a move would be refused
    expect(r.entriesFlagged).toBe(1)
  })

  it('needs the backfill permission', async () => {
    expect(await code(backfillNationalIds(db, { apply: false }, registrar()))).toBe('FORBIDDEN')
  })
})
