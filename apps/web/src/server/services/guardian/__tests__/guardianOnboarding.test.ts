// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { makeDb } from './helpers/memoryDb'
import { apply, dryRun, getBatch, rollback } from '../guardianOnboardingService'
import { GuardianError } from '../errors'
import type { StaffCtx } from '../guardianLinkService'
import type { AuditRecord, GuardianDb } from '../db'

const T0 = new Date('2026-11-05T10:00:00Z')
let mem: ReturnType<typeof makeDb>['mem']
let db: ReturnType<typeof makeDb>['db']
let audits: AuditRecord[]
const as = (role: string, uid = `${role}-1`): StaffCtx => ({ actor: { uid, role }, audit: (r) => { audits.push(r) }, now: () => T0 })
const admin = () => as('admin')

async function code(p: Promise<unknown>): Promise<string> {
  try { await p } catch (e) { return e instanceof GuardianError ? e.code : `ERR:${(e as Error).message}` }
  return 'OK'
}
const card = (id: string, studentId: string, fullName: string, phone: string, over: Record<string, unknown> = {}, minute = 0) => ({
  id, studentId, fullName, relation: 'Mother', phone, altPhone: null, email: null, isPrimary: false, isFeePayer: false,
  createdAt: new Date(2026, 0, 1, 0, minute), ...over,
})
const links = () => mem.all('guardianLink')
const itemFor = (cardId: string) => mem.all('guardianOnboardingItem').find((i) => i.directoryEntryId === cardId)!

beforeEach(() => {
  ;({ mem, db } = makeDb())
  audits = []
  mem.seed('student', [
    { id: 's1', status: 'ACTIVE', classId: 'c1' }, { id: 's2', status: 'ACTIVE', classId: 'c1' },
    { id: 's3', status: 'GRADUATED', classId: 'c1' }, { id: 's4', status: 'AWAITING_MANEB_RESULTS', classId: 'c2' },
  ])
  mem.seed('studentGuardian', [
    card('sg1', 's1', 'Mrs Mary Banda', '0999 123 456', {}, 1),
    card('sg2', 's2', 'Mary Banda', '+265999123456', {}, 2),             // sibling: same person
    card('sg3', 's1', 'N/A', '0888000111', {}, 3),                       // placeholder name
    card('sg4', 's3', 'Old Parent', '0888000222', {}, 4),                // graduated: out of default scope
    card('sg5', 's2', 'John Moyo', 'unknown', { relation: 'Neighbour' }, 5),
    card('sg6', 's1', 'Grace Phiri', '0777000333', {}, 6),               // already proposed
    card('sg7', 's2', 'Peter Phiri', '0888111222', {}, 7),               // matches an existing profile
    card('sg8', 's4', 'Ann Mwale', '0991000444', {}, 8),
  ])
  mem.seed('guardianProfile', [
    { id: 'p-grace', fullName: 'Grace Phiri', normalizedName: 'grace phiri' },
    { id: 'p-peter', fullName: 'Peter Phiri', normalizedName: 'peter phiri' },
  ])
  mem.seed('guardianContact', [{ id: 'c-peter', profileId: 'p-peter', kind: 'PHONE', value: '+265888111222', normalizedValue: '+265888111222' }])
  mem.seed('guardianLink', [{ id: 'l-grace', profileId: 'p-grace', studentId: 's1', relationship: 'Mother', directoryEntryId: 'sg6' }])
})

describe('dryRun', () => {
  it('classifies every in-scope card and writes NOTHING but its own batch and item rows', async () => {
    const before = JSON.stringify([mem.all('guardianProfile'), mem.all('guardianContact'), mem.all('guardianLink')])
    const r = await dryRun(db, {}, admin())
    expect(r.cards).toBe(7)                                   // sg4 (graduated) excluded
    expect(r.byAction).toEqual({ CREATE_NEW: 3, SUGGEST_MATCH: 2, SKIP_EXISTING: 1, SKIP_INVALID: 1 })
    expect(JSON.stringify([mem.all('guardianProfile'), mem.all('guardianContact'), mem.all('guardianLink')])).toBe(before)
    expect(mem.all('guardianOnboardingBatch')).toHaveLength(1)
    expect(mem.all('guardianOnboardingBatch')[0]).toMatchObject({ status: 'DRY_RUN', createdByUid: 'admin-1' })
    expect(mem.all('guardianOnboardingItem')).toHaveLength(7)
  })

  it('explains each decision with flags: placeholder, unusable phone, mapped relationship, sibling and existing-profile matches', async () => {
    await dryRun(db, {}, admin())
    expect(itemFor('sg3')).toMatchObject({ action: 'SKIP_INVALID', reason: 'NAME_PLACEHOLDER' })
    expect(itemFor('sg6')).toMatchObject({ action: 'SKIP_EXISTING', reason: 'ALREADY_PROPOSED' })
    expect(itemFor('sg5').flags).toEqual(expect.arrayContaining(['PHONE_UNUSABLE', 'RELATION_MAPPED']))
    expect(itemFor('sg2')).toMatchObject({ action: 'SUGGEST_MATCH' })
    expect(itemFor('sg2').flags).toContain('MATCHES_EARLIER_IN_BATCH')
    expect(itemFor('sg7')).toMatchObject({ action: 'SUGGEST_MATCH' })
    expect(itemFor('sg7').flags).toContain('MATCHES_EXISTING_PROFILE')
    expect(itemFor('sg1')).toMatchObject({ action: 'CREATE_NEW' })
  })

  it('scope: by class, by student ids, and including students who have left', async () => {
    expect((await dryRun(db, { classId: 'c2' }, admin())).cards).toBe(1)
    expect((await dryRun(db, { studentIds: ['s1'] }, admin())).cards).toBe(3)
    expect((await dryRun(db, { includeNotEnrolled: true }, admin())).cards).toBe(8)
  })

  it('an empty scope produces an empty, harmless batch', async () => {
    const r = await dryRun(db, { studentIds: ['nobody'] }, admin())
    expect(r).toMatchObject({ cards: 0, byAction: { CREATE_NEW: 0, SUGGEST_MATCH: 0, SKIP_EXISTING: 0, SKIP_INVALID: 0 } })
  })

  it('only admin and high_rank may run it; the audit entry carries counts, never contact details', async () => {
    for (const role of ['lower_rank', 'academic', 'finance', 'hr', 'student', 'parent']) expect(await code(dryRun(db, {}, as(role)))).toBe('FORBIDDEN')
    expect(await code(dryRun(db, {}, as('high_rank')))).toBe('OK')
    const text = JSON.stringify(audits)
    for (const pii of ['Banda', '0999', '+265', 'Moyo', 'Phiri']) expect(text, pii).not.toContain(pii)
  })
})

describe('apply', () => {
  it('creates only PENDING, evidence-less, capability-less BACKFILL links, and records what it made', async () => {
    const { batchId } = await dryRun(db, {}, admin())
    const r = await apply(db, batchId, {}, admin())
    expect(r).toMatchObject({ processed: 5, created: 5, skipped: 0, remaining: 0, status: 'APPLIED' })
    const made = links().filter((l) => l.id !== 'l-grace')
    expect(made).toHaveLength(5)
    for (const l of made) expect(l).toMatchObject({ status: 'PENDING', evidence: 'NONE', capabilities: [], source: 'BACKFILL', approvedByUid: null })
    expect(links().find((l) => l.id === 'l-grace')!.source).toBe('ADMISSION')        // untouched
    const it1 = itemFor('sg1')
    expect(it1.createdLinkId).toBeTruthy()
    expect(it1.createdProfileId).toBeTruthy()
    expect(it1.createdContactIds.length).toBeGreaterThan(0)
    expect(mem.all('guardianOnboardingBatch')[0]).toMatchObject({ status: 'APPLIED', appliedAt: T0 })
  })

  it('a sibling card gets a SUGGESTION toward the earlier profile, never a merge', async () => {
    const { batchId } = await dryRun(db, {}, admin())
    await apply(db, batchId, {}, admin())
    const l1 = links().find((l) => l.directoryEntryId === 'sg1')!
    const l2 = links().find((l) => l.directoryEntryId === 'sg2')!
    expect(l2.suggestedProfileId).toBe(l1.profileId)
    expect(l2.profileId).not.toBe(l1.profileId)
    const l7 = links().find((l) => l.directoryEntryId === 'sg7')!
    expect(l7.suggestedProfileId).toBe('p-peter')
  })

  it('is resumable and chunked: small chunks leave the batch APPLYING until the last item', async () => {
    const { batchId } = await dryRun(db, {}, admin())
    const a = await apply(db, batchId, { maxItems: 2 }, admin())
    expect(a).toMatchObject({ processed: 2, remaining: 3, status: 'APPLYING' })
    expect(mem.all('guardianOnboardingBatch')[0]!.status).toBe('APPLYING')
    const b = await apply(db, batchId, { maxItems: 2 }, admin())
    expect(b).toMatchObject({ processed: 2, remaining: 1, status: 'APPLYING' })
    const c = await apply(db, batchId, { maxItems: 2 }, admin())
    expect(c).toMatchObject({ processed: 1, remaining: 0, status: 'APPLIED' })
    expect(links().filter((l) => l.source === 'BACKFILL')).toHaveLength(5)
    expect(await code(apply(db, batchId, {}, admin()))).toBe('ALREADY_APPLIED')
  })

  it('clamps absurd chunk sizes', async () => {
    const { batchId } = await dryRun(db, {}, admin())
    expect((await apply(db, batchId, { maxItems: -50 }, admin())).processed).toBe(1)
    expect((await apply(db, batchId, { maxItems: 1e9 }, admin())).processed).toBe(4)
  })

  it('two staff applying the same batch at once cannot create duplicates', async () => {
    const { batchId } = await dryRun(db, {}, admin())
    await Promise.allSettled([apply(db, batchId, {}, as('admin', 'a1')), apply(db, batchId, {}, as('high_rank', 'h1'))])
    const made = links().filter((l) => l.source === 'BACKFILL')
    expect(made).toHaveLength(5)
    expect(new Set(made.map((l) => l.directoryEntryId)).size).toBe(5)       // one proposal per card
    expect(mem.all('guardianProfile').filter((p) => p.id !== 'p-grace' && p.id !== 'p-peter')).toHaveLength(5)  // no orphan profiles
  })

  it('does not duplicate a card that someone proposed between the dry run and the apply', async () => {
    const { batchId } = await dryRun(db, {}, admin())
    mem.seed('guardianProfile', [{ id: 'p-late', fullName: 'Mary Banda', normalizedName: 'mary banda' }])
    mem.seed('guardianLink', [{ id: 'l-late', profileId: 'p-late', studentId: 's1', relationship: 'Mother', directoryEntryId: 'sg1' }])
    const r = await apply(db, batchId, {}, admin())
    expect(r).toMatchObject({ created: 4, skipped: 1 })
    expect(links().filter((l) => l.directoryEntryId === 'sg1')).toHaveLength(1)
    expect(itemFor('sg1')).toMatchObject({ action: 'SKIP_EXISTING' })
  })

  it('skips a card that was deleted after the dry run', async () => {
    const { batchId } = await dryRun(db, {}, admin())
    mem.tables['studentGuardian'] = mem.tables['studentGuardian']!.filter((c) => c.id !== 'sg8')
    const r = await apply(db, batchId, {}, admin())
    expect(r).toMatchObject({ created: 4, skipped: 1 })
    expect(itemFor('sg8')).toMatchObject({ action: 'SKIP_INVALID', reason: 'CARD_REMOVED' })
  })

  it('refuses unknown, rolled-back and unauthorised', async () => {
    expect(await code(apply(db, 'ghost', {}, admin()))).toBe('NOT_FOUND')
    const { batchId } = await dryRun(db, {}, admin())
    expect(await code(apply(db, batchId, {}, as('lower_rank')))).toBe('FORBIDDEN')
    await apply(db, batchId, { maxItems: 1 }, admin())
    await rollback(db, batchId, admin())
    expect(await code(apply(db, batchId, {}, admin()))).toBe('ROLLED_BACK')
  })
})

describe('rollback', () => {
  it('removes untouched proposals together with their throwaway profiles and contacts, and nothing else', async () => {
    const { batchId } = await dryRun(db, {}, admin())
    await apply(db, batchId, {}, admin())
    const r = await rollback(db, batchId, admin())
    expect(r).toEqual({ batchId, removed: 5, kept: 0 })
    expect(links().map((l) => l.id)).toEqual(['l-grace'])
    expect(mem.all('guardianProfile').map((p) => p.id).sort()).toEqual(['p-grace', 'p-peter'])
    expect(mem.all('guardianContact').map((c) => c.id)).toEqual(['c-peter'])
    expect(mem.all('guardianOnboardingBatch')[0]).toMatchObject({ status: 'ROLLED_BACK', rolledBackAt: T0 })
  })

  it('KEEPS anything staff have acted on: verified, approved, re-pointed, invited, or claimed', async () => {
    const { batchId } = await dryRun(db, {}, admin())
    await apply(db, batchId, {}, admin())
    const l = (c: string) => links().find((x) => x.directoryEntryId === c)!
    l('sg1').evidence = 'IN_PERSON_VERIFIED'                                    // verified
    l('sg2').status = 'ACTIVE'; l('sg2').approvedByUid = 'admin-1'              // approved
    l('sg5').profileId = 'p-peter'                                              // re-pointed to another person
    mem.seed('guardianInvitation', [{ id: 'i1', ref: 'AAAAAA', secretHash: 'h', linkId: l('sg7').id, channel: 'SLIP', expiresAt: T0, issuedByUid: 'u' }])
    const r = await rollback(db, batchId, admin())
    expect(r).toEqual({ batchId, removed: 1, kept: 4 })                         // only sg8 was untouched
    for (const c of ['sg1', 'sg2', 'sg5', 'sg7']) expect(links().some((x) => x.directoryEntryId === c), c).toBe(true)
    expect(links().some((x) => x.directoryEntryId === 'sg8')).toBe(false)
    expect(itemFor('sg1').reason).toBe('KEPT_ALREADY_ACTED_ON')
    expect(itemFor('sg8').reason).toBe('ROLLED_BACK')
  })

  it('never deletes a profile that has been claimed, or that still has another link', async () => {
    const { batchId } = await dryRun(db, {}, admin())
    await apply(db, batchId, {}, admin())
    const l1 = links().find((x) => x.directoryEntryId === 'sg1')!
    mem.all('guardianProfile').find((p) => p.id === l1.profileId)!.firebaseUid = 'uid-77'
    const l8 = links().find((x) => x.directoryEntryId === 'sg8')!
    mem.seed('guardianLink', [{ id: 'extra', profileId: l8.profileId, studentId: 's2', relationship: 'Other', status: 'ACTIVE' }])
    await rollback(db, batchId, admin())
    expect(mem.all('guardianProfile').some((p) => p.id === l1.profileId)).toBe(true)
    expect(mem.all('guardianProfile').some((p) => p.id === l8.profileId)).toBe(true)
    expect(links().some((x) => x.id === 'extra')).toBe(true)
  })

  it('refuses a dry run, a second rollback, an unknown batch and an unauthorised caller', async () => {
    const { batchId } = await dryRun(db, {}, admin())
    expect(await code(rollback(db, batchId, admin()))).toBe('NOTHING_TO_ROLL_BACK')
    await apply(db, batchId, {}, admin())
    expect(await code(rollback(db, batchId, as('lower_rank')))).toBe('FORBIDDEN')
    await rollback(db, batchId, admin())
    expect(await code(rollback(db, batchId, admin()))).toBe('ALREADY_ROLLED_BACK')
    expect(await code(rollback(db, 'ghost', admin()))).toBe('NOT_FOUND')
  })

  it('recovers from a failure part-way through apply: no orphans, and rollback cleans up what was made', async () => {
    const { batchId } = await dryRun(db, {}, admin())
    let n = 0
    const flaky = new Proxy(db, { get(t, p) {
      if (p === '$transaction') return (fn: (tx: GuardianDb) => Promise<unknown>) => t.$transaction(async (tx) => fn(new Proxy(tx, { get: (t2, p2) =>
        p2 === 'guardianLink' ? { ...t2.guardianLink, create: async (a: unknown) => { if (++n === 3) throw new Error('db blip'); return t2.guardianLink.create(a) } } : Reflect.get(t2, p2) })))
      return Reflect.get(t, p)
    } })
    await expect(apply(flaky, batchId, {}, admin())).rejects.toThrow('db blip')
    expect(mem.all('guardianOnboardingBatch')[0]!.status).toBe('APPLYING')
    const orphans = mem.all('guardianProfile').filter((pr) => !['p-grace', 'p-peter'].includes(pr.id) && !links().some((x) => x.profileId === pr.id))
    expect(orphans).toEqual([])                                             // failed item rolled back whole
    const resumed = await apply(db, batchId, {}, admin())                   // resume finishes the job
    expect(resumed.status).toBe('APPLIED')
    expect(links().filter((x) => x.source === 'BACKFILL')).toHaveLength(5)
  })
})

describe('getBatch (report)', () => {
  it('shows ids, actions and flag names only: no names, numbers or emails', async () => {
    const { batchId } = await dryRun(db, {}, admin())
    await apply(db, batchId, {}, admin())
    const text = JSON.stringify(await getBatch(db, batchId, {}, admin()))
    for (const pii of ['Banda', 'Moyo', 'Phiri', '0999', '+265', '@']) expect(text, pii).not.toContain(pii)
    const rep = await getBatch(db, batchId, { action: 'SKIP_INVALID' }, admin())
    expect(rep.items.map((i) => i.directoryEntryId)).toEqual(['sg3'])
    expect((await getBatch(db, batchId, { take: 1e6 }, admin())).take).toBe(500)
  })
  it('is staff-only and 404s on an unknown batch', async () => {
    expect(await code(getBatch(db, 'ghost', {}, admin()))).toBe('NOT_FOUND')
    expect(await code(getBatch(db, 'x', {}, as('lower_rank')))).toBe('FORBIDDEN')
  })
})
