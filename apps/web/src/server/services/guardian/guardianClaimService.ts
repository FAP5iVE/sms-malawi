/**
 * [FILE]: apps/web/src/server/services/guardian/guardianClaimService.ts
 * [PURPOSE]: Turn a one-time invitation code into a guardian ACCOUNT. This is the only
 *   door through which the `parent` role is ever created, and it is reachable without
 *   being signed in, so it is written as if every caller were an attacker.
 *
 * [SECURITY NOTES]
 *   - Attempts are RESERVED atomically before the secret is checked
 *     (`failedAttempts < MAX` in the same conditional update). Parallel guessing therefore
 *     verifies at most MAX secrets in total; the invitation then locks.
 *   - The invitation is CLAIMED (conditional on still being ACTIVE) BEFORE any account is
 *     created, so one code can never produce two accounts. Failures after that point are
 *     compensated: the account is deleted and the invitation reopened.
 *   - The account is always NEWLY CREATED. An existing account (a teacher's, a student's,
 *     another parent's) is never promoted or re-roled; an address already in use is refused.
 *   - Everything the caller could learn from a failure is the same: wrong code, unknown code,
 *     expired, revoked, locked, link withdrawn, wrong date of birth, wrong e-mail all return
 *     one generic result (see toPublicResult). Only "that e-mail cannot be used" is distinct,
 *     and it is reachable only by someone who already holds a valid code and secret.
 *   - SLIP codes need a second factor the thief of a slip lacks: the child's date of birth.
 *     EMAIL codes must be claimed with the very address the code was e-mailed to.
 *   - The password is never stored, logged or audited here; it goes straight to the identity
 *     provider.
 */
import { INVITATION_MAX_FAILED_ATTEMPTS } from '@shared/constants/guardianPortal'
import { hashInvitationSecret, parseInvitationCode, verifyInvitationSecret } from '@/server/lib/guardian/invitationCode'
import { normalizeEmail } from '@/server/lib/guardian/phone'
import type { AuditRecord, AuditSink, GuardianDb } from './db'

export type IdentityErrorCode = 'EMAIL_EXISTS' | 'WEAK_PASSWORD' | 'INVALID_EMAIL' | 'FAILED'

export class IdentityError extends Error {
  readonly code: IdentityErrorCode
  constructor(code: IdentityErrorCode, message = code) {
    super(message)
    this.name = 'IdentityError'
    this.code = code
  }
}

/** Account operations, injected so the claim logic is testable without Firebase. */
export interface IdentityProvider {
  findUserByEmail(email: string): Promise<{ uid: string } | null>
  /** MUST create a brand-new account with role 'parent' and never touch an existing one. */
  createParentAccount(input: { email: string; password: string; displayName: string; emailVerified: boolean }): Promise<{ uid: string }>
  deleteAccount(uid: string): Promise<void>
}

export interface ClaimInput {
  code: unknown
  email: unknown
  password: unknown
  /** YYYY-MM-DD. Required for SLIP invitations. */
  childDateOfBirth?: unknown
}

export interface ClaimDeps {
  identity: IdentityProvider
  pepper: string
  audit: AuditSink
  now?: () => Date
}

export type ClaimFailureReason =
  | 'BAD_CODE' | 'UNKNOWN_REF' | 'INACTIVE' | 'EXPIRED' | 'ATTEMPTS_EXCEEDED' | 'BAD_SECRET'
  | 'LINK_NOT_ACTIVE' | 'PROFILE_UNAVAILABLE' | 'NEEDS_REVERIFY' | 'SECOND_FACTOR' | 'EMAIL_MISMATCH'
  | 'INVALID_EMAIL' | 'WEAK_PASSWORD' | 'EMAIL_IN_USE' | 'RACE_LOST' | 'IDENTITY_FAILED' | 'DB_FAILED'

export type ClaimResult =
  | { ok: true; uid: string; profileId: string; linkId: string }
  | { ok: false; reason: ClaimFailureReason }

/** What the HTTP layer may reveal. Almost every failure is indistinguishable. */
export type PublicClaimResult =
  | { ok: true }
  | { ok: false; code: 'CLAIM_FAILED' | 'EMAIL_IN_USE' | 'WEAK_PASSWORD' | 'INVALID_EMAIL' }

export function toPublicResult(r: ClaimResult): PublicClaimResult {
  if (r.ok) return { ok: true }
  if (r.reason === 'EMAIL_IN_USE') return { ok: false, code: 'EMAIL_IN_USE' }
  if (r.reason === 'WEAK_PASSWORD') return { ok: false, code: 'WEAK_PASSWORD' }
  if (r.reason === 'INVALID_EMAIL') return { ok: false, code: 'INVALID_EMAIL' }
  return { ok: false, code: 'CLAIM_FAILED' }
}

export const MIN_PASSWORD_LENGTH = 10

export function passwordProblem(password: unknown, email: string | null): boolean {
  if (typeof password !== 'string') return true
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 128) return true
  if (email && password.toLowerCase() === email) return true
  if (/^(.)\1+$/.test(password)) return true            // "aaaaaaaaaa"
  return false
}

const isoDay = (d: unknown): string | null => {
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d
  return null
}

export async function claimInvitation(db: GuardianDb, input: ClaimInput, deps: ClaimDeps): Promise<ClaimResult> {
  const now = (deps.now ?? (() => new Date()))()
  const email = normalizeEmail(input.email)
  if (!email) return { ok: false, reason: 'INVALID_EMAIL' }
  // Rejected before the invitation is touched: no attempt is spent on a typing error.
  if (passwordProblem(input.password, email)) return { ok: false, reason: 'WEAK_PASSWORD' }
  const password = input.password as string

  const parsed = parseInvitationCode(input.code)
  if (!parsed) return { ok: false, reason: 'BAD_CODE' }

  const inv = await db.guardianInvitation.findUnique({
    where: { ref: parsed.ref },
    include: { link: { include: { profile: true, student: true } }, contact: true },
  })
  if (!inv) {
    // Spend comparable time so "unknown code" is not distinguishable by timing.
    hashInvitationSecret(parsed.ref, parsed.secret, deps.pepper)
    return { ok: false, reason: 'UNKNOWN_REF' }
  }

  const audit = async (action: string, metadata: Record<string, unknown>, actorUid = 'anonymous', actorRole = 'anonymous') => {
    const rec: AuditRecord = { action, entityType: 'GuardianLink', entityId: inv.linkId as string, actorUid, actorRole, metadata: { context: { ref: inv.ref, ...metadata } } }
    try { await deps.audit(rec) } catch { /* auditing must never turn a refusal into a crash */ }
  }

  if (inv.status === 'ACTIVE' && new Date(inv.expiresAt) <= now) {
    await db.guardianInvitation.updateMany({ where: { id: inv.id, status: 'ACTIVE' }, data: { status: 'EXPIRED' } })
    await audit('guardian.claim_failed', { reason: 'EXPIRED' })
    return { ok: false, reason: 'EXPIRED' }
  }
  if (inv.status !== 'ACTIVE') {
    await audit('guardian.claim_failed', { reason: 'INACTIVE', status: inv.status })
    return { ok: false, reason: 'INACTIVE' }
  }

  // Reserve an attempt BEFORE checking anything secret. Conditional on being under the
  // limit, so concurrent guesses cannot exceed it between a check and an increment.
  const reserved = await db.guardianInvitation.updateMany({
    where: { id: inv.id, status: 'ACTIVE', failedAttempts: { lt: INVITATION_MAX_FAILED_ATTEMPTS } },
    data: { failedAttempts: { increment: 1 } },
  })
  if (reserved.count !== 1) {
    await lockIfExhausted()
    return { ok: false, reason: 'ATTEMPTS_EXCEEDED' }
  }

  async function lockIfExhausted() {
    const fresh = await db.guardianInvitation.findUnique({ where: { id: inv!.id } })
    if (fresh && fresh.status === 'ACTIVE' && fresh.failedAttempts >= INVITATION_MAX_FAILED_ATTEMPTS) {
      const locked = await db.guardianInvitation.updateMany({ where: { id: inv!.id, status: 'ACTIVE' }, data: { status: 'LOCKED', lockedAt: now } })
      if (locked.count === 1) await audit('guardian.invitation_locked', { attempts: fresh.failedAttempts })
    }
  }
  const fail = async (reason: ClaimFailureReason): Promise<ClaimResult> => {
    await audit('guardian.claim_failed', { reason })
    await lockIfExhausted()
    return { ok: false, reason }
  }
  const refund = async () => {
    await db.guardianInvitation.updateMany({ where: { id: inv.id, status: 'ACTIVE' }, data: { failedAttempts: { increment: -1 } } })
  }

  if (!verifyInvitationSecret(parsed.ref, parsed.secret, inv.secretHash, deps.pepper)) return fail('BAD_SECRET')

  const link = inv.link
  if (!link || link.status !== 'ACTIVE') return fail('LINK_NOT_ACTIVE')
  if (link.reverifyRequired === true) return fail('NEEDS_REVERIFY')
  const profile = link.profile
  if (!profile || profile.status !== 'ACTIVE' || profile.firebaseUid) return fail('PROFILE_UNAVAILABLE')

  if (inv.channel === 'SLIP') {
    const given = isoDay(input.childDateOfBirth)
    const actual = isoDay(link.student?.dateOfBirth)
    if (!given || !actual || given !== actual) return fail('SECOND_FACTOR')
  } else {
    // EMAIL: possession of the code proves control of the inbox it was sent to, so the
    // account must be created on exactly that address.
    const sentTo = typeof inv.contact?.normalizedValue === 'string' ? inv.contact.normalizedValue : null
    if (!sentTo || sentTo !== email) return fail('EMAIL_MISMATCH')
  }

  if (await deps.identity.findUserByEmail(email)) {
    await refund()                                  // not a guess: do not burn an attempt
    return { ok: false, reason: 'EMAIL_IN_USE' }
  }

  // Single use: claim BEFORE creating anything. Exactly one caller can win this update.
  const claimed = await db.guardianInvitation.updateMany({
    where: { id: inv.id, status: 'ACTIVE' },
    data: { status: 'CLAIMED', claimedAt: now },
  })
  if (claimed.count !== 1) return { ok: false, reason: 'RACE_LOST' }

  const reopen = async () => {
    await db.guardianInvitation.updateMany({ where: { id: inv.id, status: 'CLAIMED', claimedByUid: null }, data: { status: 'ACTIVE', claimedAt: null } })
    await refund()
  }

  let uid: string
  try {
    const acct = await deps.identity.createParentAccount({
      email, password, displayName: profile.fullName as string, emailVerified: inv.channel === 'EMAIL',
    })
    uid = acct.uid
  } catch (err) {
    await reopen()
    if (err instanceof IdentityError && err.code === 'EMAIL_EXISTS') return { ok: false, reason: 'EMAIL_IN_USE' }
    if (err instanceof IdentityError && err.code === 'WEAK_PASSWORD') return { ok: false, reason: 'WEAK_PASSWORD' }
    if (err instanceof IdentityError && err.code === 'INVALID_EMAIL') return { ok: false, reason: 'INVALID_EMAIL' }
    await audit('guardian.claim_failed', { reason: 'IDENTITY_FAILED' })
    return { ok: false, reason: 'IDENTITY_FAILED' }
  }

  try {
    await db.$transaction(async (tx) => {
      const bound = await tx.guardianProfile.updateMany({
        where: { id: profile.id, firebaseUid: null, status: 'ACTIVE' },
        data: { firebaseUid: uid, claimedAt: now },
      })
      if (bound.count !== 1) throw new Error('profile no longer claimable')
      await tx.guardianInvitation.updateMany({ where: { id: inv.id, status: 'CLAIMED' }, data: { claimedByUid: uid } })
      if (inv.channel === 'EMAIL' && inv.contactId) {
        await tx.guardianContact.updateMany({ where: { id: inv.contactId }, data: { verification: 'CODE_VERIFIED', verifiedAt: now } })
      }
    })
  } catch {
    // Compensate: no account without a bound profile, no consumed code without an account.
    try { await deps.identity.deleteAccount(uid) } catch { /* surfaced by the audit entry below */ }
    await reopen()
    await audit('guardian.claim_failed', { reason: 'DB_FAILED' })
    return { ok: false, reason: 'DB_FAILED' }
  }

  await audit('guardian.claim_succeeded', { channel: inv.channel, studentId: link.studentId }, uid, 'parent')
  return { ok: true, uid, profileId: profile.id as string, linkId: link.id as string }
}
