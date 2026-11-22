// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { makeDb } from './helpers/memoryDb'
import { claimInvitation, IdentityError, toPublicResult, type ClaimResult, type IdentityProvider } from '../guardianClaimService'
import { generateInvitationCode, hashInvitationSecret } from '@/server/lib/guardian/invitationCode'
import { INVITATION_MAX_FAILED_ATTEMPTS } from '@shared/constants/guardianPortal'
import type { AuditRecord, GuardianDb } from '../db'

const PEPPER = 'z'.repeat(40)
const T0 = new Date('2026-11-05T10:00:00Z')
const PASSWORD = 'correct-horse-9'

let mem: ReturnType<typeof makeDb>['mem']
let db: ReturnType<typeof makeDb>['db']
let audits: AuditRecord[]
let accounts: Map<string, { email: string; claims: Record<string, unknown>; displayName: string; emailVerified: boolean }>
let seq: number
let failCreate: IdentityError | null

const identity: IdentityProvider = {
  async findUserByEmail(email) { for (const [uid, a] of accounts) if (a.email === email) return { uid }; return null },
  async createParentAccount(i) {
    if (failCreate) throw failCreate
    if ([...accounts.values()].some((a) => a.email === i.email)) throw new IdentityError('EMAIL_EXISTS')
    const uid = `uid${++seq}`
    accounts.set(uid, { email: i.email, claims: { role: 'parent' }, displayName: i.displayName, emailVerified: i.emailVerified })
    return { uid }
  },
  async deleteAccount(uid) { accounts.delete(uid) },
}
const deps = (over: Partial<Parameters<typeof claimInvitation>[2]> = {}) => ({ identity, pepper: PEPPER, audit: (r: AuditRecord) => { audits.push(r) }, now: () => T0, ...over })

/** Seeds an ACTIVE link + invitation and returns the plaintext code, as staff would hand it over. */
function issue(channel: 'SLIP' | 'EMAIL' = 'SLIP', over: { expiresAt?: Date; invStatus?: string; linkStatus?: string; reverify?: boolean; profile?: Record<string, unknown> } = {}) {
  const c = generateInvitationCode()
  if (!mem.all('guardianProfile').some((p) => p.id === 'p1')) {
    mem.seed('guardianProfile', [{ id: 'p1', fullName: 'Mrs Mary Banda', normalizedName: 'mary banda', ...over.profile }])
    mem.seed('guardianContact', [{ id: 'c-em', profileId: 'p1', kind: 'EMAIL', value: 'Mary@Mail.com', normalizedValue: 'mary@mail.com' }])
    mem.seed('guardianLink', [{ id: 'l1', profileId: 'p1', studentId: 's1', relationship: 'Mother', status: over.linkStatus ?? 'ACTIVE', capabilities: ['results'], reverifyRequired: over.reverify ?? false }])
  }
  mem.seed('guardianInvitation', [{
    id: `inv-${c.ref}`, ref: c.ref, secretHash: hashInvitationSecret(c.ref, c.secret, PEPPER), linkId: 'l1', channel,
    contactId: channel === 'EMAIL' ? 'c-em' : null, expiresAt: over.expiresAt ?? new Date(T0.getTime() + 3_600_000), issuedByUid: 'staff', status: over.invStatus ?? 'ACTIVE',
  }])
  return c
}
const slip = (c: { display: string }, over: Record<string, unknown> = {}) => ({ code: c.display, email: 'mary.new@mail.com', password: PASSWORD, childDateOfBirth: '2010-05-04', ...over })
/** A well-formed but wrong secret (letters only, all inside the code alphabet). */
const wrong = (ref: string, i: number) => `${ref}-AAAAA-AAAA${'ABCDEFGHJ'[i % 9]}`
const inv = (ref: string) => mem.all('guardianInvitation').find((i) => i.ref === ref)!

beforeEach(() => {
  ;({ mem, db } = makeDb())
  audits = []; accounts = new Map(); seq = 0; failCreate = null
  mem.seed('student', [{ id: 's1', firstName: 'Chisomo', lastName: 'Banda', dateOfBirth: new Date('2010-05-04T00:00:00Z'), status: 'ACTIVE' }])
})

describe('claimInvitation: success', () => {
  it('SLIP: creates exactly one NEW parent account, binds it to the profile, consumes the code', async () => {
    const c = issue('SLIP')
    const r = await claimInvitation(db, slip(c), deps())
    expect(r).toMatchObject({ ok: true, profileId: 'p1', linkId: 'l1' })
    expect(accounts.size).toBe(1)
    const [uid, acct] = [...accounts.entries()][0]!
    expect(acct.claims).toEqual({ role: 'parent' })               // no superUser, no other claims
    expect(acct).toMatchObject({ email: 'mary.new@mail.com', displayName: 'Mrs Mary Banda', emailVerified: false })
    expect(mem.all('guardianProfile')[0]).toMatchObject({ firebaseUid: uid, claimedAt: T0 })
    expect(inv(c.ref)).toMatchObject({ status: 'CLAIMED', claimedByUid: uid, claimedAt: T0 })
    expect(audits.at(-1)).toMatchObject({ action: 'guardian.claim_succeeded', actorUid: uid, actorRole: 'parent' })
  })

  it('EMAIL: must use the address the code was sent to, which then becomes verified', async () => {
    const c = issue('EMAIL')
    const r = await claimInvitation(db, { code: c.display, email: ' Mary@Mail.com ', password: PASSWORD }, deps())
    expect(r.ok).toBe(true)
    expect([...accounts.values()][0]).toMatchObject({ email: 'mary@mail.com', emailVerified: true })
    expect(mem.all('guardianContact')[0]).toMatchObject({ verification: 'CODE_VERIFIED', verifiedAt: T0 })
  })

  it('accepts the code in any case and with any grouping', async () => {
    const c = issue('SLIP')
    expect((await claimInvitation(db, slip(c, { code: c.display.toLowerCase().replace(/-/g, ' ') }), deps())).ok).toBe(true)
  })
})

describe('claimInvitation: refusals look identical to the caller', () => {
  const failing: [string, () => Promise<ClaimResult>][] = [
    ['garbage code', async () => claimInvitation(db, slip({ display: 'nope' }), deps())],
    ['unknown ref', async () => claimInvitation(db, slip(generateInvitationCode()), deps())],
    ['wrong secret', async () => { const c = issue(); return claimInvitation(db, slip({ display: wrong(c.ref, 0) }), deps()) }],
    ['expired', async () => { const c = issue('SLIP', { expiresAt: new Date(T0.getTime() - 1) }); return claimInvitation(db, slip(c), deps()) }],
    ['revoked', async () => { const c = issue('SLIP', { invStatus: 'REVOKED' }); return claimInvitation(db, slip(c), deps()) }],
    ['already claimed', async () => { const c = issue('SLIP', { invStatus: 'CLAIMED' }); return claimInvitation(db, slip(c), deps()) }],
    ['locked', async () => { const c = issue('SLIP', { invStatus: 'LOCKED' }); return claimInvitation(db, slip(c), deps()) }],
    ['link suspended after issue', async () => { const c = issue('SLIP', { linkStatus: 'SUSPENDED' }); return claimInvitation(db, slip(c), deps()) }],
    ['link needs re-verification', async () => { const c = issue('SLIP', { reverify: true }); return claimInvitation(db, slip(c), deps()) }],
    ['profile suspended', async () => { const c = issue('SLIP', { profile: { status: 'SUSPENDED' } }); return claimInvitation(db, slip(c), deps()) }],
    ['profile already has an account', async () => { const c = issue('SLIP', { profile: { firebaseUid: 'existing' } }); return claimInvitation(db, slip(c), deps()) }],
    ['wrong date of birth', async () => { const c = issue(); return claimInvitation(db, slip(c, { childDateOfBirth: '2010-05-05' }), deps()) }],
    ['missing date of birth', async () => { const c = issue(); return claimInvitation(db, slip(c, { childDateOfBirth: undefined }), deps()) }],
    ['malformed date of birth', async () => { const c = issue(); return claimInvitation(db, slip(c, { childDateOfBirth: 'May 4th' }), deps()) }],
    ['EMAIL code claimed with a different address', async () => { const c = issue('EMAIL'); return claimInvitation(db, { code: c.display, email: 'thief@mail.com', password: PASSWORD }, deps()) }],
  ]
  for (const [name, run] of failing) {
    it(`${name}: no account, and the public answer is the single generic one`, async () => {
      const r = await run()
      expect(r.ok).toBe(false)
      expect(toPublicResult(r)).toEqual({ ok: false, code: 'CLAIM_FAILED' })
      expect(accounts.size).toBe(0)
      // no profile was bound to a new account (one case starts out already claimed)
      expect(mem.all('guardianProfile').every((p) => !p.firebaseUid || p.firebaseUid === 'existing')).toBe(true)
    })
  }

  it('only a bad e-mail, a weak password, or an address already in use are distinguishable, and none of them reveals anything about the code', () => {
    expect(toPublicResult({ ok: false, reason: 'EMAIL_IN_USE' })).toEqual({ ok: false, code: 'EMAIL_IN_USE' })
    expect(toPublicResult({ ok: false, reason: 'WEAK_PASSWORD' })).toEqual({ ok: false, code: 'WEAK_PASSWORD' })
    expect(toPublicResult({ ok: false, reason: 'INVALID_EMAIL' })).toEqual({ ok: false, code: 'INVALID_EMAIL' })
    for (const reason of ['BAD_CODE', 'UNKNOWN_REF', 'INACTIVE', 'EXPIRED', 'ATTEMPTS_EXCEEDED', 'BAD_SECRET', 'LINK_NOT_ACTIVE', 'PROFILE_UNAVAILABLE', 'NEEDS_REVERIFY', 'SECOND_FACTOR', 'EMAIL_MISMATCH', 'RACE_LOST', 'IDENTITY_FAILED', 'DB_FAILED'] as const) {
      expect(toPublicResult({ ok: false, reason }), reason).toEqual({ ok: false, code: 'CLAIM_FAILED' })
    }
  })

  it('an unknown code touches no data at all', async () => {
    mem.ops.length = 0
    await claimInvitation(db, slip(generateInvitationCode()), deps())
    expect(mem.ops.filter((o) => /create|update|delete/i.test(o))).toEqual([])
  })

  it('typing errors in the e-mail or password never spend an attempt', async () => {
    const c = issue()
    for (const over of [{ email: 'not-an-email' }, { password: 'short' }, { password: 'mary.new@mail.com' }, { password: 'aaaaaaaaaaaa' }, { password: 12345678901 }]) {
      const r = await claimInvitation(db, slip(c, over), deps())
      expect(r.ok).toBe(false)
    }
    expect(inv(c.ref).failedAttempts).toBe(0)
  })
})

describe('claimInvitation: guessing is bounded', () => {
  it(`locks after ${INVITATION_MAX_FAILED_ATTEMPTS} wrong secrets, and then even the right secret is refused`, async () => {
    const c = issue()
    for (let i = 0; i < INVITATION_MAX_FAILED_ATTEMPTS; i++) await claimInvitation(db, slip({ display: wrong(c.ref, i) }), deps())
    expect(inv(c.ref)).toMatchObject({ status: 'LOCKED', failedAttempts: INVITATION_MAX_FAILED_ATTEMPTS })
    expect(audits.filter((a) => a.action === 'guardian.invitation_locked')).toHaveLength(1)
    const right = await claimInvitation(db, slip(c), deps())
    expect(right.ok).toBe(false)
    expect(accounts.size).toBe(0)
  })

  it('30 PARALLEL guesses verify at most the allowed number: the attempt is reserved before the secret is checked', async () => {
    const c = issue()
    const results = await Promise.all(Array.from({ length: 30 }, (_, i) => claimInvitation(db, slip({ display: wrong(c.ref, i) }), deps())))
    expect(results.every((r) => !r.ok)).toBe(true)
    expect(inv(c.ref).failedAttempts).toBe(INVITATION_MAX_FAILED_ATTEMPTS)     // never 30
    expect(inv(c.ref).status).toBe('LOCKED')
    expect(audits.filter((a) => a.action === 'guardian.invitation_locked')).toHaveLength(1)
  })

  it('a parallel flood cannot stop the legitimate holder who claims first, but cannot beat them either', async () => {
    const c = issue()
    const good = claimInvitation(db, slip(c), deps())
    const bad = Array.from({ length: 10 }, (_, i) => claimInvitation(db, slip({ display: wrong(c.ref, i) }), deps()))
    const [g] = await Promise.all([good, ...bad])
    expect(g.ok).toBe(true)
    expect(accounts.size).toBe(1)
  })

  it('failures are audited against the real invitation by ref, never with the secret, email, password or date of birth', async () => {
    const c = issue()
    await claimInvitation(db, slip(c, { childDateOfBirth: '1999-01-01' }), deps())
    const text = JSON.stringify(audits)
    expect(text).toContain(c.ref)
    for (const leak of [c.secret, c.display, 'mary.new@mail.com', PASSWORD, '1999-01-01', '2010-05-04']) expect(text, leak).not.toContain(leak)
  })
})

describe('claimInvitation: a code makes at most one account', () => {
  it('two correct claims at once (different e-mails): exactly one wins, one account exists', async () => {
    const c = issue()
    const [a, b] = await Promise.all([
      claimInvitation(db, slip(c, { email: 'a@mail.com' }), deps()),
      claimInvitation(db, slip(c, { email: 'b@mail.com' }), deps()),
    ])
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1)
    expect(accounts.size).toBe(1)
    expect(mem.all('guardianProfile').filter((p) => p.firebaseUid)).toHaveLength(1)
  })

  it('the same code cannot be used again after success', async () => {
    const c = issue()
    expect((await claimInvitation(db, slip(c), deps())).ok).toBe(true)
    expect((await claimInvitation(db, slip(c, { email: 'again@mail.com' }), deps())).ok).toBe(false)
    expect(accounts.size).toBe(1)
  })
})

describe('claimInvitation: never touches an existing account', () => {
  it('an address already in use (e.g. a teacher\u2019s) is refused, nothing is re-roled, and the attempt is refunded', async () => {
    accounts.set('teacher-uid', { email: 'mary.new@mail.com', claims: { role: 'academic' }, displayName: 'T', emailVerified: true })
    const c = issue()
    const r = await claimInvitation(db, slip(c), deps())
    expect(r).toEqual({ ok: false, reason: 'EMAIL_IN_USE' })
    expect(accounts.get('teacher-uid')!.claims).toEqual({ role: 'academic' })
    expect(accounts.size).toBe(1)
    expect(inv(c.ref)).toMatchObject({ status: 'ACTIVE', failedAttempts: 0 })       // still claimable with another address
    expect((await claimInvitation(db, slip(c, { email: 'other@mail.com' }), deps())).ok).toBe(true)
  })

  it('an address that appears between the check and the create is still refused and reopens the code', async () => {
    const c = issue()
    const racing: IdentityProvider = { ...identity, findUserByEmail: async () => null, createParentAccount: async () => { throw new IdentityError('EMAIL_EXISTS') } }
    const r = await claimInvitation(db, slip(c), deps({ identity: racing }))
    expect(r).toEqual({ ok: false, reason: 'EMAIL_IN_USE' })
    expect(inv(c.ref)).toMatchObject({ status: 'ACTIVE', claimedAt: null })
  })
})

describe('claimInvitation: failures are compensated', () => {
  it('an identity-provider outage reopens the code and refunds the attempt (the guardian can retry)', async () => {
    const c = issue()
    failCreate = new IdentityError('FAILED')
    const r = await claimInvitation(db, slip(c), deps())
    expect(r).toEqual({ ok: false, reason: 'IDENTITY_FAILED' })
    expect(inv(c.ref)).toMatchObject({ status: 'ACTIVE', claimedAt: null, failedAttempts: 0 })
    failCreate = null
    expect((await claimInvitation(db, slip(c), deps())).ok).toBe(true)
  })

  it('if binding the account to the profile fails, the account is deleted and the code reopened', async () => {
    const c = issue()
    const broken = new Proxy(db, { get(t, p) {
      if (p === '$transaction') return (fn: (tx: GuardianDb) => Promise<unknown>) => t.$transaction(async (tx) => fn(new Proxy(tx, { get: (t2, p2) =>
        p2 === 'guardianProfile' ? { ...t2.guardianProfile, updateMany: async () => ({ count: 0 }) } : Reflect.get(t2, p2) })))
      return Reflect.get(t, p)
    } })
    const r = await claimInvitation(broken, slip(c), deps())
    expect(r).toEqual({ ok: false, reason: 'DB_FAILED' })
    expect(accounts.size).toBe(0)                                     // no orphan account
    expect(inv(c.ref)).toMatchObject({ status: 'ACTIVE', claimedAt: null })
    expect(mem.all('guardianProfile')[0]!.firebaseUid).toBeNull()
  })

  it('an audit-sink failure never turns a refusal into a crash', async () => {
    const c = issue()
    const r = await claimInvitation(db, slip(c, { childDateOfBirth: '1990-01-01' }), deps({ audit: () => { throw new Error('audit down') } }))
    expect(r.ok).toBe(false)
  })

  it('refuses to run without a configured pepper', async () => {
    const c = issue()
    await expect(claimInvitation(db, slip(c), deps({ pepper: '' }))).rejects.toThrow('GUARDIAN_INVITATION_PEPPER')
    expect(accounts.size).toBe(0)
  })
})
