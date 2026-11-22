// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { makeDb } from './helpers/memoryDb'
import type { GuardianDb } from '../db'
import {
  proposeFromDirectoryEntry, reconcileEntryDrift, suspendLinksForRemovedCard, syncStudentDirectory, snapshotOf,
  type DirectoryCard,
} from '../guardianIdentityService'

const ctx = { actor: { uid: 'staff1', role: 'lower_rank' }, now: () => new Date('2026-11-05T10:00:00Z') }

const card = (over: Partial<DirectoryCard> = {}): DirectoryCard => ({
  id: 'sg1', studentId: 's1', fullName: 'Mrs Mary Banda', relation: 'Mother', phone: '0999 123 456',
  altPhone: '0888111222', email: 'Mary@Mail.com', isPrimary: true, isFeePayer: true, ...over,
})

let mem: ReturnType<typeof makeDb>['mem']
let db: ReturnType<typeof makeDb>['db']
beforeEach(() => {
  ;({ mem, db } = makeDb())
  mem.seed('student', [{ id: 's1' }, { id: 's2' }])
  mem.seed('studentGuardian', [{ id: 'sg1', studentId: 's1' }])
})

describe('proposeFromDirectoryEntry', () => {
  it('creates a profile, its contacts and ONE PENDING link that grants nothing', async () => {
    const r = await proposeFromDirectoryEntry(db, card(), ctx)
    expect(r.outcome).toBe('CREATED')
    const profile = mem.all('guardianProfile')[0]!
    expect(profile).toMatchObject({ fullName: 'Mary Banda'.replace('Mary', 'Mrs Mary'), normalizedName: 'mary banda', status: 'ACTIVE', firebaseUid: null })
    expect(mem.all('guardianContact').map((c) => [c.kind, c.normalizedValue, c.verification])).toEqual([
      ['PHONE', '+265999123456', 'UNVERIFIED'], ['PHONE', '+265888111222', 'UNVERIFIED'], ['EMAIL', 'mary@mail.com', 'UNVERIFIED'],
    ])
    const link = mem.all('guardianLink')[0]!
    expect(link).toMatchObject({
      status: 'PENDING', capabilities: [], evidence: 'NONE', studentId: 's1', relationship: 'Mother',
      directoryEntryId: 'sg1', isPrimaryContact: true, isFinancialResponsible: true, source: 'ADMISSION', reverifyRequired: false,
    })
    expect(link.verifiedSnapshot).toEqual(snapshotOf(card()))
    expect(r.audit.map((a) => a.action)).toEqual(['guardian.link_proposed'])
  })

  it('never produces anything but PENDING, whatever the source or flags', async () => {
    for (const [i, source] of (['ADMISSION', 'STAFF', 'BACKFILL'] as const).entries()) {
      mem.seed('studentGuardian', [{ id: `x${i}`, studentId: 's1' }])
      await proposeFromDirectoryEntry(db, card({ id: `x${i}`, fullName: `Person ${i}`, phone: '0999000' + i + '00' }), { ...ctx, source })
    }
    expect(mem.all('guardianLink').every((l) => l.status === 'PENDING' && l.capabilities.length === 0)).toBe(true)
  })

  it('is idempotent per card: a second call creates nothing', async () => {
    await proposeFromDirectoryEntry(db, card(), ctx)
    const again = await proposeFromDirectoryEntry(db, card(), ctx)
    expect(again.outcome).toBe('EXISTING')
    expect(mem.all('guardianLink')).toHaveLength(1)
    expect(mem.all('guardianProfile')).toHaveLength(1)
    expect(again.audit).toEqual([])
  })

  it('skips a placeholder name without writing anything', async () => {
    const r = await proposeFromDirectoryEntry(db, card({ fullName: 'N/A' }), ctx)
    expect(r).toMatchObject({ outcome: 'SKIPPED', reason: 'NAME_PLACEHOLDER' })
    expect(mem.all('guardianProfile')).toHaveLength(0)
    expect(mem.all('guardianLink')).toHaveLength(0)
  })

  it('still proposes a guardian with no usable phone or email (a slip can be handed over in person) and flags it', async () => {
    const r = await proposeFromDirectoryEntry(db, card({ phone: 'unknown', altPhone: null, email: null }), ctx)
    expect(r.outcome).toBe('CREATED')
    if (r.outcome === 'CREATED') expect(r.flags).toContain('PHONE_UNUSABLE')
    expect(mem.all('guardianContact')).toHaveLength(0)
  })

  it('keeps the original wording when the relationship had to be mapped to Other', async () => {
    await proposeFromDirectoryEntry(db, card({ relation: 'Neighbour' }), ctx)
    expect(mem.all('guardianLink')[0]).toMatchObject({ relationship: 'Other', relationshipNote: 'Neighbour' })
  })

  it('a parent with two children gets a SEPARATE profile plus a strong SUGGESTION: never an automatic merge', async () => {
    await proposeFromDirectoryEntry(db, card(), ctx)
    mem.seed('studentGuardian', [{ id: 'sg2', studentId: 's2' }])
    // No email on the second card, so the evidence is phone + name.
    const second = await proposeFromDirectoryEntry(db, card({ id: 'sg2', studentId: 's2', email: null }), ctx)
    expect(second.outcome).toBe('CREATED')
    expect(mem.all('guardianProfile')).toHaveLength(2)
    const link2 = mem.all('guardianLink').find((l) => l.studentId === 's2')!
    expect(link2.suggestedProfileId).toBe(mem.all('guardianProfile')[0]!.id)
    expect(link2.suggestedMethod).toBe('PHONE_NAME')
    expect(link2.profileId).not.toBe(link2.suggestedProfileId)   // not merged, not linked
    expect(link2.status).toBe('PENDING')
  })

  it('the same email as well is reported as the stronger EMAIL_NAME match', async () => {
    await proposeFromDirectoryEntry(db, card(), ctx)
    mem.seed('studentGuardian', [{ id: 'sg2', studentId: 's2' }])
    await proposeFromDirectoryEntry(db, card({ id: 'sg2', studentId: 's2' }), ctx)
    expect(mem.all('guardianLink').find((l) => l.studentId === 's2')!.suggestedMethod).toBe('EMAIL_NAME')
  })

  it('a shared phone with a different name is only a weak suggestion', async () => {
    await proposeFromDirectoryEntry(db, card(), ctx)
    mem.seed('studentGuardian', [{ id: 'sg3', studentId: 's2' }])
    await proposeFromDirectoryEntry(db, card({ id: 'sg3', studentId: 's2', fullName: 'Peter Moyo', email: null, altPhone: null }), ctx)
    const link = mem.all('guardianLink').find((l) => l.studentId === 's2')!
    expect(link.suggestedMethod).toBe('PHONE_SHARED')
  })

  it('a failure part-way through leaves no orphan profile or contacts (transaction rollback)', async () => {
    const failing = new Proxy(db, {
      get(target, prop) {
        if (prop === 'guardianLink') return { ...target.guardianLink, create: async () => { throw new Error('boom') } }
        if (prop === '$transaction') return (fn: (tx: GuardianDb) => Promise<unknown>) => target.$transaction(async (tx) => fn(new Proxy(tx, {
          get: (t2, p2) => (p2 === 'guardianLink' ? { ...t2.guardianLink, create: async () => { throw new Error('boom') } } : Reflect.get(t2, p2)),
        })))
        return Reflect.get(target, prop)
      },
    })
    await expect(proposeFromDirectoryEntry(failing, card(), ctx)).rejects.toThrow('boom')
    expect(mem.all('guardianProfile')).toHaveLength(0)
    expect(mem.all('guardianContact')).toHaveLength(0)
    expect(mem.all('guardianLink')).toHaveLength(0)
  })

  it('does not resurrect a link staff already rejected or revoked', async () => {
    for (const status of ['REJECTED', 'REVOKED']) {
      const { mem: m, db: d } = makeDb()
      m.seed('guardianProfile', [{ id: 'p', fullName: 'Mary Banda', normalizedName: 'mary banda' }])
      m.seed('guardianLink', [{ id: 'l', profileId: 'p', studentId: 's1', relationship: 'Mother', status, directoryEntryId: 'sg1' }])
      const r = await proposeFromDirectoryEntry(d, card(), ctx)
      expect(r.outcome, status).toBe('EXISTING')
      expect(m.all('guardianLink')).toHaveLength(1)
      expect(m.all('guardianLink')[0]!.status).toBe(status)
    }
  })
})

describe('reconcileEntryDrift', () => {
  const activeLink = (over: Record<string, unknown> = {}) => {
    mem.seed('guardianProfile', [{ id: 'p', fullName: 'Mrs Mary Banda', normalizedName: 'mary banda' }])
    mem.seed('guardianLink', [{ id: 'l', profileId: 'p', studentId: 's1', relationship: 'Mother', status: 'ACTIVE', capabilities: ['results'], directoryEntryId: 'sg1', verifiedSnapshot: snapshotOf(card()), ...over }])
  }

  it('flags an ACTIVE link when the person on the card changes, and says what changed', async () => {
    activeLink()
    const r = await reconcileEntryDrift(db, card({ fullName: 'Grace Phiri', phone: '0777000111', altPhone: null }), ctx)
    expect(r).toMatchObject({ checked: 1, flagged: 1 })
    expect(mem.all('guardianLink')[0]).toMatchObject({ reverifyRequired: true, reverifyReason: 'Contact card changed: name, phone', status: 'ACTIVE' })
    expect(r.audit[0]).toMatchObject({ action: 'guardian.link_reverify_flagged', entityId: 'l' })
  })

  it('flagging never changes access: status and capabilities stay, and the PERSON is not rewritten', async () => {
    activeLink()
    await reconcileEntryDrift(db, card({ fullName: 'Grace Phiri' }), ctx)
    expect(mem.all('guardianLink')[0]).toMatchObject({ status: 'ACTIVE', capabilities: ['results'] })
    expect(mem.all('guardianProfile')[0]).toMatchObject({ fullName: 'Mrs Mary Banda', normalizedName: 'mary banda' })
  })

  it('formatting-only edits raise nothing, and a second run does not duplicate the flag or audit', async () => {
    activeLink()
    const fmt = await reconcileEntryDrift(db, card({ fullName: 'MARY  BANDA', phone: '+265 999 123 456' }), ctx)
    expect(fmt.flagged).toBe(0)
    await reconcileEntryDrift(db, card({ fullName: 'Grace Phiri' }), ctx)
    const again = await reconcileEntryDrift(db, card({ fullName: 'Grace Phiri' }), ctx)
    expect(again.flagged).toBe(0)
    expect(again.audit).toEqual([])
  })

  it('ignores PENDING, REVOKED and REJECTED links (review re-reads the card; ended is ended)', async () => {
    for (const status of ['PENDING', 'REVOKED', 'REJECTED']) {
      const { mem: m, db: d } = makeDb()
      m.seed('guardianLink', [{ id: 'l', profileId: 'p', studentId: 's1', relationship: 'Mother', status, directoryEntryId: 'sg1', verifiedSnapshot: snapshotOf(card()) }])
      const r = await reconcileEntryDrift(d, card({ fullName: 'Grace Phiri' }), ctx)
      expect(r.checked, status).toBe(0)
      expect(m.all('guardianLink')[0]!.reverifyRequired).toBe(false)
    }
  })

  it('records a baseline instead of guessing when a link has no snapshot', async () => {
    activeLink({ verifiedSnapshot: null })
    const r = await reconcileEntryDrift(db, card({ fullName: 'Grace Phiri' }), ctx)
    expect(r.flagged).toBe(0)
    expect(mem.all('guardianLink')[0]!.verifiedSnapshot).toEqual(snapshotOf(card({ fullName: 'Grace Phiri' })))
  })
})

describe('suspendLinksForRemovedCard', () => {
  it('suspends an ACTIVE link (fail safe) and rejects a PENDING one; leaves ended links alone', async () => {
    // One link per card (a database invariant), each card in a different state.
    mem.seed('guardianLink', [
      { id: 'a', profileId: 'p1', studentId: 's1', relationship: 'Mother', status: 'ACTIVE', directoryEntryId: 'cardA' },
      { id: 'b', profileId: 'p2', studentId: 's1', relationship: 'Father', status: 'PENDING', directoryEntryId: 'cardB' },
      { id: 'c', profileId: 'p3', studentId: 's1', relationship: 'Uncle', status: 'REVOKED', directoryEntryId: 'cardC' },
      { id: 'd', profileId: 'p4', studentId: 's1', relationship: 'Aunt', status: 'SUSPENDED', directoryEntryId: 'cardD' },
      { id: 'e', profileId: 'p5', studentId: 's1', relationship: 'Aunt', status: 'ACTIVE', directoryEntryId: 'OTHER' },
    ])
    const by = (id: string) => mem.all('guardianLink').find((l) => l.id === id)!
    const ra = await suspendLinksForRemovedCard(db, 'cardA', ctx)
    const rb = await suspendLinksForRemovedCard(db, 'cardB', ctx)
    const rc = await suspendLinksForRemovedCard(db, 'cardC', ctx)
    const rd = await suspendLinksForRemovedCard(db, 'cardD', ctx)
    expect(by('a')).toMatchObject({ status: 'SUSPENDED', reverifyRequired: true, statusReason: 'Contact card removed by staff' })
    expect(by('b')).toMatchObject({ status: 'REJECTED' })
    expect(by('c').status).toBe('REVOKED')          // ended is ended
    expect(by('d').status).toBe('SUSPENDED')
    expect(by('e').status).toBe('ACTIVE')           // a different card is untouched
    expect([ra, rb, rc, rd].map((r) => [r.suspended, r.rejected])).toEqual([[1, 0], [0, 1], [0, 0], [0, 0]])
    expect(ra.audit.map((x) => x.action)).toEqual(['guardian.link_suspended'])
    expect(rb.audit.map((x) => x.action)).toEqual(['guardian.link_rejected'])
  })

  it('runs inside a caller transaction and rolls back with it (delete must not proceed on failure)', async () => {
    mem.seed('guardianLink', [{ id: 'a', profileId: 'p1', studentId: 's1', relationship: 'Mother', status: 'ACTIVE', directoryEntryId: 'sg1' }])
    await expect(db.$transaction(async (tx) => {
      await suspendLinksForRemovedCard(tx, 'sg1', ctx)
      throw new Error('delete failed')
    })).rejects.toThrow('delete failed')
    expect(mem.all('guardianLink')[0]!.status).toBe('ACTIVE')
  })
})

describe('syncStudentDirectory', () => {
  it('proposes the new card, drift-checks the existing one, and reports both', async () => {
    mem.seed('studentGuardian', [
      { id: 'sg1', studentId: 's1', fullName: 'Mrs Mary Banda', relation: 'Mother', phone: '0999123456', isPrimary: true, createdAt: new Date('2026-01-01') },
      { id: 'sgB', studentId: 's1', fullName: 'John Banda', relation: 'Father', phone: '0888111222', isPrimary: false, createdAt: new Date('2026-02-01') },
    ])
    // sg1 was seeded by beforeEach without fields; replace with the full card
    mem.tables['studentGuardian'] = mem.tables['studentGuardian']!.filter((r) => !(r.id === 'sg1' && !r.fullName))
    const first = await syncStudentDirectory(db, 's1', ctx)
    expect(first).toMatchObject({ proposed: 2, existing: 0, skipped: 0 })
    // edit one card, add a card with a placeholder name
    mem.all('studentGuardian').find((r) => r.id === 'sgB')!.fullName = 'Peter Moyo'
    mem.seed('studentGuardian', [{ id: 'sgC', studentId: 's1', fullName: 'N/A', relation: 'Other', phone: '', createdAt: new Date('2026-03-01') }])
    // promote sgB's link to ACTIVE so drift applies
    mem.all('guardianLink').find((l) => l.directoryEntryId === 'sgB')!.status = 'ACTIVE'
    const second = await syncStudentDirectory(db, 's1', ctx)
    expect(second).toMatchObject({ proposed: 0, existing: 2, skipped: 1, flagged: 1 })
  })

  it('for a student with no cards, does nothing', async () => {
    const r = await syncStudentDirectory(db, 's2', ctx)
    expect(r).toMatchObject({ proposed: 0, skipped: 0, existing: 0, flagged: 0, audit: [] })
  })
})

describe('proposeFromDirectoryEntry: concurrent proposals for the same card', () => {
  it('a lost race resolves to EXISTING, leaves no orphan profile or contacts, and keeps exactly one link', async () => {
    // Winner already proposed this card.
    await proposeFromDirectoryEntry(db, card(), ctx)
    expect(mem.all('guardianLink')).toHaveLength(1)

    // The loser's pre-check read is stale: it sees no link and proceeds to insert.
    let stale = true
    const racing = new Proxy(db, {
      get(t, p) {
        if (p === 'guardianLink') {
          return { ...t.guardianLink, findFirst: async (a?: { where?: { directoryEntryId?: unknown } }) => (stale && a?.where?.directoryEntryId ? ((stale = false), null) : t.guardianLink.findFirst(a)) }
        }
        return Reflect.get(t, p)
      },
    })
    const r = await proposeFromDirectoryEntry(racing, card(), ctx)
    expect(r.outcome).toBe('EXISTING')
    expect(mem.all('guardianLink')).toHaveLength(1)
    expect(mem.all('guardianProfile')).toHaveLength(1)     // the loser's throwaway profile was rolled back
    expect(mem.all('guardianContact')).toHaveLength(3)
  })

  it('a unique violation that is NOT about this card is not swallowed', async () => {
    const broken = new Proxy(db, { get(t, p) {
      if (p === '$transaction') return async () => { throw Object.assign(new Error('dup'), { code: 'P2002' }) }
      return Reflect.get(t, p)
    } })
    await expect(proposeFromDirectoryEntry(broken, card({ id: 'fresh' }), ctx)).rejects.toThrow('dup')
  })

  it('the database invariant itself: two links cannot share one contact card', async () => {
    mem.seed('guardianLink', [{ id: 'a', profileId: 'p1', studentId: 's1', relationship: 'Mother', directoryEntryId: 'sg1' }])
    await expect(db.guardianLink.create({ data: { profileId: 'p2', studentId: 's1', relationship: 'Mother', directoryEntryId: 'sg1' } }))
      .rejects.toMatchObject({ code: 'P2002' })
    // ...but links with no card (NULL) are unconstrained
    await db.guardianLink.create({ data: { profileId: 'p3', studentId: 's1', relationship: 'Other', directoryEntryId: null } })
    await db.guardianLink.create({ data: { profileId: 'p4', studentId: 's1', relationship: 'Other', directoryEntryId: null } })
  })
})
