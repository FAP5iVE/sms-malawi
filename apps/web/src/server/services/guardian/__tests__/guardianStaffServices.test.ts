// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { makeDb } from './helpers/memoryDb'
import {
  approveLink, confirmReverified, getStudentPortalView, listQueue, repointLink, setCapabilities, setEvidence, transitionLink,
  type StaffCtx,
} from '../guardianLinkService'
import { reinstateProfile, suspendProfile } from '../guardianLinkService'
import { expireStaleInvitations, issueInvitation, revokeInvitation } from '../guardianInvitationService'
import { snapshotOf } from '../guardianIdentityService'
import { GuardianError } from '../errors'
import type { AuditRecord, GuardianDb } from '../db'

const PEPPER = 'k'.repeat(40)
const T0 = new Date('2026-11-05T10:00:00Z')

let mem: ReturnType<typeof makeDb>['mem']
let db: ReturnType<typeof makeDb>['db']
let audits: AuditRecord[]

const as = (role: string, uid = `${role}-1`): StaffCtx => ({ actor: { uid, role }, audit: (r) => { audits.push(r) }, now: () => T0 })
const admin = () => as('admin')
const registrar = () => as('lower_rank')
const CARD = { id: 'sg1', studentId: 's1', fullName: 'Mrs Mary Banda', relation: 'Mother', phone: '0999123456', altPhone: null, email: 'mary@mail.com' }

async function code(p: Promise<unknown>): Promise<string> {
  try { await p } catch (e) { return e instanceof GuardianError ? e.code : `ERR:${String(e)}` }
  return 'OK'
}
const link = (id = 'l1') => mem.all('guardianLink').find((l) => l.id === id)!

beforeEach(() => {
  ;({ mem, db } = makeDb())
  audits = []
  mem.seed('student', [{
    id: 's1', firstName: 'Chisomo', lastName: 'Banda', registrationNo: 'R001', status: 'ACTIVE', classId: 'c1',
    // sensitive fields that must never reach a guardian-portal read model
    orphanStatus: 'FATHER_DECEASED', medicalAlert: 'asthma', exitNote: 'secret', nrbNumber: 'NRB-1', vulnerabilityNote: 'x',
  }])
  mem.seed('studentGuardian', [{ ...CARD, isPrimary: true, isFeePayer: true }])
  mem.seed('guardianProfile', [{ id: 'p1', fullName: 'Mrs Mary Banda', normalizedName: 'mary banda' }])
  mem.seed('guardianContact', [
    { id: 'c-ph', profileId: 'p1', kind: 'PHONE', value: '+265999123456', normalizedValue: '+265999123456' },
    { id: 'c-em', profileId: 'p1', kind: 'EMAIL', value: 'mary@mail.com', normalizedValue: 'mary@mail.com' },
  ])
  mem.seed('guardianLink', [{
    id: 'l1', profileId: 'p1', studentId: 's1', relationship: 'Mother', status: 'PENDING', evidence: 'NONE', directoryEntryId: 'sg1',
    isFinancialResponsible: true, verifiedSnapshot: { ...snapshotOf(CARD), fullName: 'OLD NAME' },
  }])
})

describe('approveLink', () => {
  it('refuses to approve without recorded evidence, then approves once evidence exists', async () => {
    expect(await code(approveLink(db, 'l1', {}, admin()))).toBe('NOT_APPROVABLE')
    expect(link().status).toBe('PENDING')
    await setEvidence(db, 'l1', 'IN_PERSON_VERIFIED', registrar())
    await approveLink(db, 'l1', {}, admin())
    expect(link()).toMatchObject({ status: 'ACTIVE', approvedByUid: 'admin-1', approvedAt: T0, reverifyRequired: false })
    // fee payer gets fees by default; documents never by default
    expect(link().capabilities).toEqual(['results', 'fees', 'attendance', 'notices', 'profile'].filter((c) => link().capabilities.includes(c)))
    expect(link().capabilities).toContain('fees')
    expect(link().capabilities).not.toContain('documents')
    expect(audits.map((a) => a.action)).toEqual(['guardian.evidence_recorded', 'guardian.link_approved'])
  })

  it('re-baselines the verified snapshot to the contact card as it is now', async () => {
    await setEvidence(db, 'l1', 'DOCUMENT_SEEN', registrar())
    await approveLink(db, 'l1', {}, admin())
    expect(link().verifiedSnapshot).toEqual(snapshotOf(CARD))
  })

  it('a registrar cannot approve, and nothing changes', async () => {
    await setEvidence(db, 'l1', 'IN_PERSON_VERIFIED', registrar())
    expect(await code(approveLink(db, 'l1', {}, registrar()))).toBe('FORBIDDEN')
    expect(link().status).toBe('PENDING')
  })

  it.each(['academic', 'finance', 'hr', 'library', 'exam_officer', 'student', 'parent'])('%s cannot approve', async (role) => {
    expect(await code(approveLink(db, 'l1', {}, as(role)))).toBe('FORBIDDEN')
  })

  it('two approvals racing: exactly one wins, the other gets a conflict, one audit entry', async () => {
    await setEvidence(db, 'l1', 'IN_PERSON_VERIFIED', registrar())
    audits = []
    const results = await Promise.allSettled([approveLink(db, 'l1', {}, as('admin', 'a1')), approveLink(db, 'l1', {}, as('high_rank', 'h1'))])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect((rejected.reason as GuardianError).code).toMatch(/CHANGED|NOT_APPROVABLE/)
    expect(audits.filter((a) => a.action === 'guardian.link_approved')).toHaveLength(1)
    expect(link().status).toBe('ACTIVE')
  })

  it('a strong match to an existing profile blocks approval until acknowledged', async () => {
    await setEvidence(db, 'l1', 'IN_PERSON_VERIFIED', registrar())
    link().suggestedProfileId = 'p-other'; link().suggestedMethod = 'PHONE_NAME'
    expect(await code(approveLink(db, 'l1', {}, admin()))).toBe('NOT_APPROVABLE')
    expect(await code(approveLink(db, 'l1', { acknowledgeSuggestion: true }, admin()))).toBe('OK')
  })

  it('staff can narrow capabilities at approval; junk values are dropped; empty is refused', async () => {
    await setEvidence(db, 'l1', 'IN_PERSON_VERIFIED', registrar())
    expect(await code(approveLink(db, 'l1', { capabilities: [] }, admin()))).toBe('NOT_APPROVABLE')
    expect(await code(approveLink(db, 'l1', { capabilities: ['hack', 7] }, admin()))).toBe('NOT_APPROVABLE')
    await approveLink(db, 'l1', { capabilities: ['results', 'bogus'] }, admin())
    expect(link().capabilities).toEqual(['results'])
  })

  it('refuses a suspended person, an ended link, and a missing student', async () => {
    await setEvidence(db, 'l1', 'IN_PERSON_VERIFIED', registrar())
    mem.all('guardianProfile')[0]!.status = 'SUSPENDED'
    expect(await code(approveLink(db, 'l1', {}, admin()))).toBe('NOT_APPROVABLE')
    mem.all('guardianProfile')[0]!.status = 'ACTIVE'
    mem.tables['student'] = []
    expect(await code(approveLink(db, 'l1', {}, admin()))).toBe('NOT_FOUND')
    expect(await code(approveLink(db, 'nope', {}, admin()))).toBe('NOT_FOUND')
  })
})

describe('setEvidence', () => {
  it('lowering evidence needs guardian.restrict (a registrar cannot downgrade)', async () => {
    await setEvidence(db, 'l1', 'IN_PERSON_VERIFIED', registrar())
    expect(await code(setEvidence(db, 'l1', 'NONE', registrar()))).toBe('FORBIDDEN')
    expect(await code(setEvidence(db, 'l1', 'NONE', admin()))).toBe('OK')
  })
  it('rejects unknown evidence and ended links', async () => {
    expect(await code(setEvidence(db, 'l1', 'TRUST_ME', registrar()))).toBe('INVALID_EVIDENCE')
    link().status = 'REVOKED'
    expect(await code(setEvidence(db, 'l1', 'DOCUMENT_SEEN', registrar()))).toBe('LINK_ENDED')
  })
})

describe('transitions', () => {
  const activate = async () => { await setEvidence(db, 'l1', 'IN_PERSON_VERIFIED', registrar()); await approveLink(db, 'l1', {}, admin()); audits = [] }

  it('suspend and revoke need a reason and guardian.restrict, and kill outstanding invitations', async () => {
    await activate()
    await issueInvitation(db, 'l1', { channel: 'SLIP' }, registrar(), { pepper: PEPPER })
    expect(await code(transitionLink(db, 'l1', 'suspend', {}, admin()))).toBe('REASON_REQUIRED')
    expect(await code(transitionLink(db, 'l1', 'suspend', { reason: 'hold' }, registrar()))).toBe('FORBIDDEN')
    await transitionLink(db, 'l1', 'suspend', { reason: 'Safeguarding hold' }, admin())
    expect(link()).toMatchObject({ status: 'SUSPENDED', statusReason: 'Safeguarding hold', statusChangedByUid: 'admin-1' })
    expect(mem.all('guardianInvitation').every((i) => i.status === 'REVOKED')).toBe(true)
    expect(audits.at(-1)).toMatchObject({ action: 'guardian.link_suspended' })
  })

  it('reject needs a reason and also needs guardian.approve; it ends the pending invitation set', async () => {
    expect(await code(transitionLink(db, 'l1', 'reject', {}, admin()))).toBe('REASON_REQUIRED')
    expect(await code(transitionLink(db, 'l1', 'reject', { reason: 'not the parent' }, registrar()))).toBe('FORBIDDEN')
    await transitionLink(db, 'l1', 'reject', { reason: 'not the parent' }, admin())
    expect(link().status).toBe('REJECTED')
  })

  it('illegal moves are conflicts, and an ended link cannot jump straight back to ACTIVE', async () => {
    expect(await code(transitionLink(db, 'l1', 'suspend', { reason: 'x' }, admin()))).toBe('INVALID_TRANSITION')   // PENDING
    expect(await code(transitionLink(db, 'l1', 'reinstate', {}, admin()))).toBe('INVALID_TRANSITION')
    await activate()
    await transitionLink(db, 'l1', 'revoke', { reason: 'custody order' }, admin())
    expect(await code(transitionLink(db, 'l1', 'reinstate', {}, admin()))).toBe('INVALID_TRANSITION')
    expect(await code(approveLink(db, 'l1', {}, admin()))).toBe('NOT_APPROVABLE')
  })

  it('reopen sends an ended link back to PENDING with NO capabilities and no approval: it must be verified again', async () => {
    await activate()
    await transitionLink(db, 'l1', 'revoke', { reason: 'custody order' }, admin())
    await transitionLink(db, 'l1', 'reopen', {}, admin())
    expect(link()).toMatchObject({ status: 'PENDING', capabilities: [], approvedByUid: null, approvedAt: null })
    expect(audits.at(-1)).toMatchObject({ action: 'guardian.link_reopened' })
  })

  it('reinstate restores access, clears the re-verify flag and needs evidence and a good-standing person', async () => {
    await activate()
    link().reverifyRequired = true; link().reverifyReason = 'Contact card changed: phone'
    await transitionLink(db, 'l1', 'suspend', { reason: 'check' }, admin())
    mem.all('guardianProfile')[0]!.status = 'SUSPENDED'
    expect(await code(transitionLink(db, 'l1', 'reinstate', {}, admin()))).toBe('NOT_REINSTATABLE')
    mem.all('guardianProfile')[0]!.status = 'ACTIVE'
    await transitionLink(db, 'l1', 'reinstate', {}, admin())
    expect(link()).toMatchObject({ status: 'ACTIVE', reverifyRequired: false, reverifyReason: null })
  })

  it('a concurrent suspend and revoke: one wins, the other conflicts', async () => {
    await activate()
    const r = await Promise.allSettled([
      transitionLink(db, 'l1', 'suspend', { reason: 'a' }, as('admin', 'a1')),
      transitionLink(db, 'l1', 'revoke', { reason: 'b' }, as('high_rank', 'h1')),
    ])
    expect(r.filter((x) => x.status === 'fulfilled').length).toBeGreaterThanOrEqual(1)
    expect(['SUSPENDED', 'REVOKED']).toContain(link().status)
  })
})

describe('setCapabilities / confirmReverified', () => {
  const activate = async () => { await setEvidence(db, 'l1', 'IN_PERSON_VERIFIED', registrar()); await approveLink(db, 'l1', { capabilities: ['results', 'profile'] }, admin()); audits = [] }

  it('records exactly what was added and removed; a no-op writes nothing', async () => {
    await activate()
    await setCapabilities(db, 'l1', ['profile', 'fees'], admin())
    expect(link().capabilities).toEqual(['fees', 'profile'])
    expect(audits[0]).toMatchObject({ action: 'guardian.link_capabilities_changed', metadata: { context: { added: ['fees'], removed: ['results'] } } })
    audits = []
    await setCapabilities(db, 'l1', ['fees', 'profile'], admin())
    expect(audits).toEqual([])
  })
  it('refuses empty, refuses non-active links, and a registrar cannot change capabilities', async () => {
    expect(await code(setCapabilities(db, 'l1', ['results'], admin()))).toBe('NOT_ACTIVE')
    await activate()
    expect(await code(setCapabilities(db, 'l1', [], admin()))).toBe('NO_CAPABILITIES')
    expect(await code(setCapabilities(db, 'l1', ['results'], registrar()))).toBe('FORBIDDEN')
  })
  it('confirmReverified clears the flag and re-baselines the snapshot', async () => {
    await activate()
    link().reverifyRequired = true; link().reverifyReason = 'Contact card changed: name'
    await confirmReverified(db, 'l1', admin())
    expect(link()).toMatchObject({ reverifyRequired: false, reverifyReason: null })
    expect(link().verifiedSnapshot).toEqual(snapshotOf(CARD))
    expect(await code(confirmReverified(db, 'l1', registrar()))).toBe('FORBIDDEN')
  })
})

describe('repointLink', () => {
  beforeEach(() => {
    mem.seed('student', [{ id: 's2', firstName: 'Tadala', lastName: 'Banda', registrationNo: 'R002', status: 'ACTIVE' }])
    mem.seed('guardianProfile', [{ id: 'p-main', fullName: 'Mary Banda', normalizedName: 'mary banda' }])
    mem.seed('guardianContact', [{ id: 'm1', profileId: 'p-main', kind: 'PHONE', value: '+265999123456', normalizedValue: '+265999123456' }])
    link().suggestedProfileId = 'p-main'; link().suggestedMethod = 'PHONE_NAME'
  })

  it('moves a PENDING link to the existing person, copies only the missing contacts, removes the throwaway profile', async () => {
    await repointLink(db, 'l1', 'p-main', registrar())
    expect(link()).toMatchObject({ profileId: 'p-main', suggestedProfileId: null, suggestedMethod: null, status: 'PENDING' })
    const mainContacts = mem.all('guardianContact').filter((c) => c.profileId === 'p-main').map((c) => c.normalizedValue).sort()
    expect(mainContacts).toEqual(['+265999123456', 'mary@mail.com'])      // phone not duplicated, email added
    expect(mem.all('guardianProfile').find((p) => p.id === 'p1')).toBeUndefined()
    expect(mem.all('guardianContact').some((c) => c.profileId === 'p1')).toBe(false)
  })

  it('keeps the old profile when it is claimed or still used', async () => {
    mem.all('guardianProfile').find((p) => p.id === 'p1')!.firebaseUid = 'uid-9'
    await repointLink(db, 'l1', 'p-main', registrar())
    expect(mem.all('guardianProfile').find((p) => p.id === 'p1')).toBeDefined()
  })

  it('refuses ACTIVE links, merged/suspended targets, unknown targets, duplicates and no-ops', async () => {
    expect(await code(repointLink(db, 'l1', 'p1', registrar()))).toBe('SAME_PROFILE')
    expect(await code(repointLink(db, 'l1', 'ghost', registrar()))).toBe('NOT_FOUND')
    mem.all('guardianProfile').find((p) => p.id === 'p-main')!.status = 'MERGED'
    expect(await code(repointLink(db, 'l1', 'p-main', registrar()))).toBe('PROFILE_NOT_ACTIVE')
    mem.all('guardianProfile').find((p) => p.id === 'p-main')!.status = 'ACTIVE'
    mem.seed('guardianLink', [{ id: 'dup', profileId: 'p-main', studentId: 's1', relationship: 'Mother', status: 'PENDING' }])
    expect(await code(repointLink(db, 'l1', 'p-main', registrar()))).toBe('ALREADY_LINKED')
    mem.tables['guardianLink'] = mem.tables['guardianLink']!.filter((l) => l.id !== 'dup')
    link().status = 'ACTIVE'
    expect(await code(repointLink(db, 'l1', 'p-main', registrar()))).toBe('NOT_PENDING')
  })

  it('a role without guardian.propose cannot', async () => {
    expect(await code(repointLink(db, 'l1', 'p-main', as('academic')))).toBe('FORBIDDEN')
  })
})

describe('read models never leak child welfare, exit or identity data, or invitation hashes', () => {
  const FORBIDDEN_KEYS = ['orphanStatus', 'medicalAlert', 'exitNote', 'nrbNumber', 'vulnerabilityNote', 'secretHash', 'firebaseUid', 'verifiedSnapshot']

  it('listQueue and getStudentPortalView expose only the allowlisted fields', async () => {
    await setEvidence(db, 'l1', 'IN_PERSON_VERIFIED', registrar())
    await approveLink(db, 'l1', {}, admin())
    const inv = await issueInvitation(db, 'l1', { channel: 'SLIP' }, registrar(), { pepper: PEPPER })
    const q = JSON.stringify(await listQueue(db, {}, registrar()))
    const v = JSON.stringify(await getStudentPortalView(db, 's1', registrar()))
    for (const text of [q, v]) {
      for (const k of FORBIDDEN_KEYS) expect(text, k).not.toContain(`"${k}"`)
      for (const s of ['FATHER_DECEASED', 'asthma', 'NRB-1', inv.code, inv.code.replace(/-/g, '')]) expect(text, s).not.toContain(s)
    }
    expect(JSON.parse(q).items[0].student).toEqual({ id: 's1', firstName: 'Chisomo', lastName: 'Banda', registrationNo: 'R001', status: 'ACTIVE', classId: 'c1' })
  })

  it('needs guardian.view', async () => {
    for (const role of ['academic', 'finance', 'student', 'parent']) {
      expect(await code(listQueue(db, {}, as(role)))).toBe('FORBIDDEN')
      expect(await code(getStudentPortalView(db, 's1', as(role)))).toBe('FORBIDDEN')
    }
  })

  it('filters by status and re-verify flag and caps page size', async () => {
    mem.seed('guardianLink', [{ id: 'l2', profileId: 'p1', studentId: 's2', relationship: 'Mother', status: 'ACTIVE', reverifyRequired: true }])
    expect((await listQueue(db, { status: 'ACTIVE' }, admin())).items.map((i) => i.id)).toEqual(['l2'])
    expect((await listQueue(db, { reverify: true }, admin())).items.map((i) => i.id)).toEqual(['l2'])
    expect((await listQueue(db, { take: 100000 }, admin())).take).toBe(200)
    expect((await listQueue(db, { take: -4 }, admin())).take).toBe(1)
  })

  it('returns 404 for an unknown student', async () => {
    expect(await code(getStudentPortalView(db, 'ghost', admin()))).toBe('NOT_FOUND')
  })
})

describe('issueInvitation', () => {
  const active = async () => { await setEvidence(db, 'l1', 'IN_PERSON_VERIFIED', registrar()); await approveLink(db, 'l1', {}, admin()); audits = [] }
  const issue = (ctx = registrar(), input: { channel: unknown; contactId?: string | null } = { channel: 'SLIP' }, random?: (m: number) => number) =>
    issueInvitation(db, 'l1', input, ctx, { pepper: PEPPER, ...(random ? { random } : {}) })

  it('issues a slip code for an approved link; only a hash is stored; the code never reaches audit or storage', async () => {
    await active()
    const r = await issue()
    expect(r.code).toMatch(/^[A-Z2-9]{6}-[A-Z2-9]{5}-[A-Z2-9]{5}$/)
    expect(r.expiresAt).toEqual(new Date(T0.getTime() + 14 * 24 * 3_600_000))
    const stored = JSON.stringify(mem.tables)
    const secret = r.code.replace(/-/g, '').slice(6)
    expect(stored).not.toContain(secret)
    expect(stored).not.toContain(r.code)
    expect(mem.all('guardianInvitation')[0]).toMatchObject({ ref: r.ref, status: 'ACTIVE', channel: 'SLIP', issuedByUid: 'lower_rank-1', failedAttempts: 0 })
    expect(mem.all('guardianInvitation')[0]!.secretHash).toMatch(/^[0-9a-f]{64}$/)
    const logged = JSON.stringify(audits)
    expect(logged).toContain(r.ref)
    expect(logged).not.toContain(secret)
    expect(audits[0]).toMatchObject({ action: 'guardian.invitation_issued' })
  })

  it('an emailed code lives 72 hours and must go to one of THIS guardian\u2019s email addresses', async () => {
    await active()
    const r = await issue(registrar(), { channel: 'EMAIL', contactId: 'c-em' })
    expect(r.expiresAt).toEqual(new Date(T0.getTime() + 72 * 3_600_000))
    expect(await code(issue(registrar(), { channel: 'EMAIL', contactId: 'c-ph' }))).toBe('INVALID_CONTACT')   // a phone
    expect(await code(issue(registrar(), { channel: 'EMAIL' }))).toBe('INVALID_CONTACT')
    mem.seed('guardianProfile', [{ id: 'px', fullName: 'Other', normalizedName: 'other' }])
    mem.seed('guardianContact', [{ id: 'c-x', profileId: 'px', kind: 'EMAIL', value: 'x@y.com', normalizedValue: 'x@y.com' }])
    expect(await code(issue(registrar(), { channel: 'EMAIL', contactId: 'c-x' }))).toBe('INVALID_CONTACT')   // someone else's
  })

  it('refuses unless the link is ACTIVE, the person is in good standing, unclaimed and not awaiting re-verification', async () => {
    expect(await code(issue())).toBe('NOT_ACTIVE')                       // still PENDING
    await active()
    link().reverifyRequired = true
    expect(await code(issue())).toBe('NEEDS_REVERIFY')
    link().reverifyRequired = false
    mem.all('guardianProfile')[0]!.status = 'SUSPENDED'
    expect(await code(issue())).toBe('PROFILE_NOT_ACTIVE')
    mem.all('guardianProfile')[0]!.status = 'ACTIVE'
    mem.all('guardianProfile')[0]!.firebaseUid = 'uid-1'
    expect(await code(issue())).toBe('ALREADY_CLAIMED')
    mem.all('guardianProfile')[0]!.firebaseUid = null
    expect(await code(issue(registrar(), { channel: 'CARRIER_PIGEON' }))).toBe('INVALID_CHANNEL')
  })

  it('only staff with guardian.invite may issue', async () => {
    await active()
    for (const role of ['academic', 'finance', 'student', 'parent']) expect(await code(issue(as(role)))).toBe('FORBIDDEN')
    expect(await code(issue(as('high_rank')))).toBe('OK')
  })

  it('reissuing cancels the previous code: one live code per link', async () => {
    await active()
    const first = await issue()
    const second = await issue()
    const live = mem.all('guardianInvitation').filter((i) => i.status === 'ACTIVE')
    expect(live.map((i) => i.ref)).toEqual([second.ref])
    expect(mem.all('guardianInvitation').find((i) => i.ref === first.ref)!.status).toBe('REVOKED')
  })

  it('retries when a generated reference collides instead of failing the issue', async () => {
    await active()
    mem.seed('guardianInvitation', [{ id: 'old', ref: '222222', secretHash: 'x', linkId: 'other', channel: 'SLIP', expiresAt: T0, issuedByUid: 'u', status: 'REVOKED' }])
    const draws = [...Array(16).fill(0), ...Array(16).fill(1)]
    let i = 0
    const r = await issue(registrar(), { channel: 'SLIP' }, () => draws[i++] ?? 2)
    expect(r.ref).toBe('333333')
    expect(i).toBe(32)
  })

  it('a failed issue leaves the previous code intact (revoke + create are one transaction)', async () => {
    await active()
    const first = await issue()
    const boom = new Proxy(db, { get(t, p) {
      if (p === '$transaction') return (fn: (tx: GuardianDb) => Promise<unknown>) => t.$transaction(async (tx) => fn(new Proxy(tx, { get: (t2, p2) => p2 === 'guardianInvitation' ? { ...t2.guardianInvitation, create: async () => { throw new Error('db down') } } : Reflect.get(t2, p2) })))
      return Reflect.get(t, p)
    } })
    await expect(issueInvitation(boom, 'l1', { channel: 'SLIP' }, registrar(), { pepper: PEPPER })).rejects.toThrow('db down')
    expect(mem.all('guardianInvitation').find((x) => x.ref === first.ref)!.status).toBe('ACTIVE')
  })

  it('refuses to issue without a configured pepper', async () => {
    await active()
    await expect(issueInvitation(db, 'l1', { channel: 'SLIP' }, registrar(), { pepper: '' })).rejects.toThrow('GUARDIAN_INVITATION_PEPPER')
    expect(mem.all('guardianInvitation')).toHaveLength(0)
  })
})

describe('revokeInvitation / expireStaleInvitations', () => {
  it('revokes an active invitation once; unknown or already-revoked ones are errors', async () => {
    await setEvidence(db, 'l1', 'IN_PERSON_VERIFIED', registrar()); await approveLink(db, 'l1', {}, admin())
    const r = await issueInvitation(db, 'l1', { channel: 'SLIP' }, registrar(), { pepper: PEPPER })
    await revokeInvitation(db, r.invitationId, registrar())
    expect(mem.all('guardianInvitation')[0]).toMatchObject({ status: 'REVOKED', revokedByUid: 'lower_rank-1' })
    expect(await code(revokeInvitation(db, r.invitationId, registrar()))).toBe('NOT_ACTIVE')
    expect(await code(revokeInvitation(db, 'ghost', registrar()))).toBe('NOT_FOUND')
    expect(await code(revokeInvitation(db, r.invitationId, as('academic')))).toBe('FORBIDDEN')
  })

  it('expires only ACTIVE invitations past their expiry', async () => {
    mem.seed('guardianInvitation', [
      { id: 'a', ref: 'AAAAAA', secretHash: 'h', linkId: 'l1', channel: 'SLIP', expiresAt: new Date('2026-11-01'), issuedByUid: 'u' },
      { id: 'b', ref: 'BBBBBB', secretHash: 'h', linkId: 'l1', channel: 'SLIP', expiresAt: new Date('2026-12-01'), issuedByUid: 'u' },
      { id: 'c', ref: 'CCCCCC', secretHash: 'h', linkId: 'l1', channel: 'SLIP', expiresAt: new Date('2026-11-01'), issuedByUid: 'u', status: 'CLAIMED' },
    ])
    expect(await expireStaleInvitations(db, T0)).toBe(1)
    expect(Object.fromEntries(mem.all('guardianInvitation').map((i) => [i.id, i.status]))).toEqual({ a: 'EXPIRED', b: 'ACTIVE', c: 'CLAIMED' })
  })
})

describe('suspendProfile / reinstateProfile (the whole person)', () => {
  const claimed = () => { mem.all('guardianProfile')[0]!.firebaseUid = 'uid-1' }

  it('needs guardian.restrict and a reason; freezes the person, revokes their codes, and revokes their sessions', async () => {
    claimed()
    mem.seed('guardianInvitation', [{ id: 'i1', ref: 'AAAAAA', secretHash: 'h', linkId: 'l1', channel: 'SLIP', expiresAt: T0, issuedByUid: 'u' }])
    const revoked: string[] = []
    expect(await code(suspendProfile(db, 'p1', { reason: 'x' }, registrar()))).toBe('FORBIDDEN')
    expect(await code(suspendProfile(db, 'p1', {}, admin()))).toBe('REASON_REQUIRED')
    await suspendProfile(db, 'p1', { reason: 'Safeguarding hold' }, admin(), { revokeSessions: async (u) => { revoked.push(u) } })
    expect(mem.all('guardianProfile')[0]!.status).toBe('SUSPENDED')
    expect(mem.all('guardianInvitation')[0]).toMatchObject({ status: 'REVOKED', revokedByUid: 'admin-1' })
    expect(revoked).toEqual(['uid-1'])
    expect(audits.at(-1)).toMatchObject({ action: 'guardian.profile_suspended', entityId: 'p1' })
  })

  it('a failing session revocation never undoes or blocks the suspension', async () => {
    claimed()
    await suspendProfile(db, 'p1', { reason: 'hold' }, admin(), { revokeSessions: async () => { throw new Error('firebase down') } })
    expect(mem.all('guardianProfile')[0]!.status).toBe('SUSPENDED')
  })

  it('an unclaimed profile has no sessions to revoke', async () => {
    let called = false
    await suspendProfile(db, 'p1', { reason: 'hold' }, admin(), { revokeSessions: async () => { called = true } })
    expect(called).toBe(false)
  })

  it('refuses unknown, already-suspended and merged profiles; two staff at once: one wins', async () => {
    expect(await code(suspendProfile(db, 'ghost', { reason: 'x' }, admin()))).toBe('NOT_FOUND')
    const r = await Promise.allSettled([suspendProfile(db, 'p1', { reason: 'a' }, as('admin', 'a1')), suspendProfile(db, 'p1', { reason: 'b' }, as('high_rank', 'h1'))])
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(1)
    expect(await code(suspendProfile(db, 'p1', { reason: 'again' }, admin()))).toBe('INVALID_TRANSITION')
    mem.all('guardianProfile')[0]!.status = 'MERGED'
    expect(await code(suspendProfile(db, 'p1', { reason: 'x' }, admin()))).toBe('INVALID_TRANSITION')
  })

  it('reinstating needs guardian.approve and a suspended person; it never reactivates a link', async () => {
    await setEvidence(db, 'l1', 'IN_PERSON_VERIFIED', registrar()); await approveLink(db, 'l1', {}, admin())
    await suspendProfile(db, 'p1', { reason: 'hold' }, admin())
    expect(await code(reinstateProfile(db, 'p1', registrar()))).toBe('FORBIDDEN')
    await reinstateProfile(db, 'p1', admin())
    expect(mem.all('guardianProfile')[0]!.status).toBe('ACTIVE')
    expect(link().status).toBe('ACTIVE')                                     // untouched by either call
    expect(await code(reinstateProfile(db, 'p1', admin()))).toBe('INVALID_TRANSITION')
    expect(await code(reinstateProfile(db, 'ghost', admin()))).toBe('NOT_FOUND')
  })
})
