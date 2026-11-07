/**
 * [FILE]: apps/web/src/server/services/guardian/guardianLinkService.ts
 * [PURPOSE]: Staff decisions about who may see which child: verify, approve, restrict,
 *   suspend, revoke, reinstate, reopen, re-point a pending link to an existing person,
 *   and the read models the review screens use.
 *
 * [SECURITY NOTES]
 *   - Each function checks its own permission (hasPermission) in addition to the route:
 *     the rules cannot be skipped by calling the service from somewhere else.
 *   - Every status change is a CONDITIONAL update on the status it expects
 *     (`where: { id, status }`). Two staff acting at once cannot both succeed; the loser
 *     gets a 409 instead of silently overwriting the winner.
 *   - Anything that removes access (suspend, revoke, reject) also revokes outstanding
 *     invitations in the same transaction, so a code issued earlier cannot outlive the
 *     decision.
 *   - Read models are explicit allowlists. They never include welfare, exit or identity
 *     fields of the child, and never an invitation hash.
 */
import { hasPermission, type Permission } from '@shared/types/permissions'
import type { UserRole } from '@shared/types/roles'
import {
  GUARDIAN_EVIDENCE_LEVELS, defaultCapabilitiesFor, sanitizeCapabilities,
  type GuardianCapability, type GuardianEvidenceValue,
} from '@shared/constants/guardianPortal'
import { evaluateApproval, evaluateReinstatement, nextStatus, permissionFor, type LinkAction } from '@/server/lib/guardian/linkStateMachine'
import type { Actor, AuditRecord, AuditSink, GuardianDb } from './db'
import { GuardianError, conflict, forbidden, notFound, unprocessable } from './errors'
import { snapshotOf } from './guardianIdentityService'

export interface StaffCtx {
  actor: Actor & { superUser?: boolean }
  audit: AuditSink
  now?: () => Date
}

const nowOf = (c: StaffCtx) => (c.now ?? (() => new Date()))()

export function assertCan(ctx: StaffCtx, permission: Permission): void {
  if (!hasPermission(ctx.actor.role as UserRole, permission, ctx.actor.superUser === true)) throw forbidden()
}

async function emit(ctx: StaffCtx, action: string, linkId: string, metadata: Record<string, unknown>): Promise<void> {
  const record: AuditRecord = { action, entityType: 'GuardianLink', entityId: linkId, actorUid: ctx.actor.uid, actorRole: ctx.actor.role, metadata }
  await ctx.audit(record)
}

async function loadLink(db: GuardianDb, id: string) {
  const link = await db.guardianLink.findUnique({ where: { id }, include: { profile: true } })
  if (!link) throw notFound('Guardian link')
  return link
}

const cleanReason = (r: unknown): string => (typeof r === 'string' ? r.trim().slice(0, 300) : '')

// ─── EVIDENCE ─────────────────────────────────────────────────────────────

/** Record how the guardian was verified. Raising evidence needs guardian.propose; lowering it needs guardian.restrict. */
export async function setEvidence(db: GuardianDb, linkId: string, evidence: unknown, ctx: StaffCtx) {
  assertCan(ctx, 'guardian.propose')
  if (!(GUARDIAN_EVIDENCE_LEVELS as readonly string[]).includes(evidence as string)) {
    throw unprocessable('INVALID_EVIDENCE', 'Unknown verification type.')
  }
  const link = await loadLink(db, linkId)
  if (link.status === 'REVOKED' || link.status === 'REJECTED') throw conflict('LINK_ENDED', 'This link has ended. Reopen it first.')
  const rank = (e: string) => GUARDIAN_EVIDENCE_LEVELS.indexOf(e as GuardianEvidenceValue)
  if (rank(evidence as string) < rank(link.evidence)) assertCan(ctx, 'guardian.restrict')
  const res = await db.guardianLink.updateMany({ where: { id: linkId, status: link.status }, data: { evidence } })
  if (res.count !== 1) throw conflict('CHANGED', 'This link was changed by someone else. Reload and try again.')
  await emit(ctx, 'guardian.evidence_recorded', linkId, { context: { studentId: link.studentId, from: link.evidence, to: evidence } })
  return db.guardianLink.findUnique({ where: { id: linkId } })
}

// ─── APPROVE ──────────────────────────────────────────────────────────────

export interface ApproveInput { capabilities?: unknown; acknowledgeSuggestion?: boolean }

export async function approveLink(db: GuardianDb, linkId: string, input: ApproveInput, ctx: StaffCtx) {
  assertCan(ctx, permissionFor('approve'))
  const link = await loadLink(db, linkId)
  const student = await db.student.findUnique({ where: { id: link.studentId } })
  if (!student) throw notFound('Student')

  const capabilities: GuardianCapability[] = input.capabilities === undefined
    ? defaultCapabilitiesFor({ isFinancialResponsible: link.isFinancialResponsible === true })
    : sanitizeCapabilities(input.capabilities)

  const problems = evaluateApproval({
    link, profile: link.profile, capabilities,
    ...(input.acknowledgeSuggestion !== undefined ? { acknowledgeSuggestion: input.acknowledgeSuggestion } : {}),
  })
  if (problems.length > 0) throw unprocessable('NOT_APPROVABLE', problems[0]!.message, problems)

  const now = nowOf(ctx)
  const card = link.directoryEntryId ? await db.studentGuardian.findUnique({ where: { id: link.directoryEntryId } }) : null
  const res = await db.guardianLink.updateMany({
    where: { id: linkId, status: 'PENDING' },
    data: {
      status: 'ACTIVE', capabilities, statusReason: null,
      approvedByUid: ctx.actor.uid, approvedAt: now, statusChangedByUid: ctx.actor.uid, statusChangedAt: now,
      reverifyRequired: false, reverifyReason: null,
      ...(card ? { verifiedSnapshot: snapshotOf(card) } : {}),
    },
  })
  if (res.count !== 1) throw conflict('CHANGED', 'This link was changed by someone else. Reload and try again.')
  await emit(ctx, 'guardian.link_approved', linkId, { context: { studentId: link.studentId, capabilities, evidence: link.evidence } })
  return db.guardianLink.findUnique({ where: { id: linkId } })
}

// ─── OTHER TRANSITIONS ────────────────────────────────────────────────────

const ACTION_AUDIT: Record<Exclude<LinkAction, 'approve'>, string> = {
  reject: 'guardian.link_rejected',
  suspend: 'guardian.link_suspended',
  reinstate: 'guardian.link_reinstated',
  revoke: 'guardian.link_revoked',
  reopen: 'guardian.link_reopened',
}

export async function transitionLink(
  db: GuardianDb, linkId: string, action: Exclude<LinkAction, 'approve'>, input: { reason?: unknown }, ctx: StaffCtx,
) {
  assertCan(ctx, permissionFor(action))
  const link = await loadLink(db, linkId)
  const to = nextStatus(action, link.status)
  if (!to) throw conflict('INVALID_TRANSITION', `A link that is ${String(link.status).toLowerCase()} cannot be ${action}ed.`)

  const reason = cleanReason(input.reason)
  if ((action === 'reject' || action === 'suspend' || action === 'revoke') && reason === '') {
    throw unprocessable('REASON_REQUIRED', 'Give a reason. It is kept in the audit trail.')
  }
  if (action === 'reinstate') {
    const problems = evaluateReinstatement({ link, profile: link.profile })
    if (problems.length > 0) throw unprocessable('NOT_REINSTATABLE', problems[0]!.message, problems)
  }

  const now = nowOf(ctx)
  const removesAccess = action === 'suspend' || action === 'revoke' || action === 'reject'
  const card = action === 'reinstate' && link.directoryEntryId
    ? await db.studentGuardian.findUnique({ where: { id: link.directoryEntryId } }) : null

  await db.$transaction(async (tx) => {
    const res = await tx.guardianLink.updateMany({
      where: { id: linkId, status: link.status },
      data: {
        status: to,
        statusReason: reason || null,
        statusChangedByUid: ctx.actor.uid,
        statusChangedAt: now,
        ...(action === 'reinstate' ? { reverifyRequired: false, reverifyReason: null, ...(card ? { verifiedSnapshot: snapshotOf(card) } : {}) } : {}),
        ...(action === 'reopen' ? { approvedByUid: null, approvedAt: null, capabilities: [] } : {}),
      },
    })
    if (res.count !== 1) throw conflict('CHANGED', 'This link was changed by someone else. Reload and try again.')
    if (removesAccess) {
      // A code issued earlier must not outlive the decision to withdraw access.
      await tx.guardianInvitation.updateMany({
        where: { linkId, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: now, revokedByUid: ctx.actor.uid },
      })
    }
  })
  await emit(ctx, ACTION_AUDIT[action], linkId, { context: { studentId: link.studentId, from: link.status, to, reason: reason || null } })
  return db.guardianLink.findUnique({ where: { id: linkId } })
}

// ─── CAPABILITIES ─────────────────────────────────────────────────────────

export async function setCapabilities(db: GuardianDb, linkId: string, input: unknown, ctx: StaffCtx) {
  assertCan(ctx, 'guardian.restrict')
  const next = sanitizeCapabilities(input)
  if (next.length === 0) throw unprocessable('NO_CAPABILITIES', 'Choose at least one thing, or suspend the link instead.')
  const link = await loadLink(db, linkId)
  if (link.status !== 'ACTIVE') throw conflict('NOT_ACTIVE', 'Only an active link has capabilities to change.')
  const before = sanitizeCapabilities(link.capabilities)
  const added = next.filter((c) => !before.includes(c))
  const removed = before.filter((c) => !next.includes(c))
  if (added.length === 0 && removed.length === 0) return link
  // Widening is approving more access, so it also needs guardian.approve.
  if (added.length > 0) assertCan(ctx, 'guardian.approve')
  const res = await db.guardianLink.updateMany({
    where: { id: linkId, status: 'ACTIVE' },
    data: { capabilities: next, statusChangedByUid: ctx.actor.uid, statusChangedAt: nowOf(ctx) },
  })
  if (res.count !== 1) throw conflict('CHANGED', 'This link was changed by someone else. Reload and try again.')
  await emit(ctx, 'guardian.link_capabilities_changed', linkId, { context: { studentId: link.studentId, added, removed } })
  return db.guardianLink.findUnique({ where: { id: linkId } })
}

// ─── RE-VERIFICATION ──────────────────────────────────────────────────────

/** Staff looked at a flagged link again and it is still right: clear the flag and re-baseline the snapshot. */
export async function confirmReverified(db: GuardianDb, linkId: string, ctx: StaffCtx) {
  assertCan(ctx, 'guardian.approve')
  const link = await loadLink(db, linkId)
  if (link.status !== 'ACTIVE' && link.status !== 'SUSPENDED') throw conflict('NOT_LIVE', 'Only an active or suspended link needs re-verifying.')
  if (link.reverifyRequired !== true) return link
  const card = link.directoryEntryId ? await db.studentGuardian.findUnique({ where: { id: link.directoryEntryId } }) : null
  await db.guardianLink.update({
    where: { id: linkId },
    data: { reverifyRequired: false, reverifyReason: null, ...(card ? { verifiedSnapshot: snapshotOf(card) } : {}) },
  })
  await emit(ctx, 'guardian.link_reverified', linkId, { context: { studentId: link.studentId } })
  return db.guardianLink.findUnique({ where: { id: linkId } })
}

// ─── RE-POINT A PENDING LINK ──────────────────────────────────────────────

/**
 * Staff decided a PENDING link belongs to a person already on file (one parent, several
 * children). Moves the link to that profile and copies across any contact the existing
 * profile lacks. PENDING only: nothing is granted yet, so this cannot widen access.
 */
export async function repointLink(db: GuardianDb, linkId: string, targetProfileId: string, ctx: StaffCtx) {
  assertCan(ctx, 'guardian.propose')
  const link = await loadLink(db, linkId)
  if (link.status !== 'PENDING') throw conflict('NOT_PENDING', 'Only a pending link can be moved to another guardian profile.')
  if (link.profileId === targetProfileId) throw unprocessable('SAME_PROFILE', 'The link is already on that profile.')
  const target = await db.guardianProfile.findUnique({ where: { id: targetProfileId } })
  if (!target) throw notFound('Guardian profile')
  if (target.status !== 'ACTIVE') throw unprocessable('PROFILE_NOT_ACTIVE', 'That guardian profile is suspended or merged.')
  const clash = await db.guardianLink.findFirst({ where: { profileId: targetProfileId, studentId: link.studentId } })
  if (clash) throw conflict('ALREADY_LINKED', 'That guardian already has a link to this student.')

  const oldProfileId = link.profileId as string
  await db.$transaction(async (tx) => {
    const res = await tx.guardianLink.updateMany({
      where: { id: linkId, status: 'PENDING', profileId: oldProfileId },
      data: { profileId: targetProfileId, suggestedProfileId: null, suggestedMethod: null },
    })
    if (res.count !== 1) throw conflict('CHANGED', 'This link was changed by someone else. Reload and try again.')
    const mine = await tx.guardianContact.findMany({ where: { profileId: oldProfileId } })
    const theirs = await tx.guardianContact.findMany({ where: { profileId: targetProfileId } })
    for (const c of mine) {
      if (theirs.some((t) => t.kind === c.kind && t.normalizedValue === c.normalizedValue)) continue
      await tx.guardianContact.create({
        data: { profileId: targetProfileId, kind: c.kind, value: c.value, normalizedValue: c.normalizedValue, isPreferred: false },
      })
    }
    // Remove the throwaway profile only when nothing else uses it and nobody claimed it.
    const remaining = await tx.guardianLink.count({ where: { profileId: oldProfileId } })
    const old = await tx.guardianProfile.findUnique({ where: { id: oldProfileId } })
    if (remaining === 0 && old && !old.firebaseUid) {
      await tx.guardianContact.deleteMany({ where: { profileId: oldProfileId } })
      await tx.guardianProfile.delete({ where: { id: oldProfileId } })
    }
  })
  await emit(ctx, 'guardian.link_repointed', linkId, { context: { studentId: link.studentId, fromProfileId: oldProfileId, toProfileId: targetProfileId } })
  return db.guardianLink.findUnique({ where: { id: linkId } })
}

// ─── SUSPEND / REINSTATE A WHOLE PERSON ───────────────────────────────────

/**
 * Freezes a guardian across EVERY child (a safeguarding hold on the person, not on one
 * link). The per-request pipeline checks profile status on each call, so this takes effect on
 * their very next request; `revokeSessions` additionally invalidates their refresh tokens.
 * Outstanding invitations for the person's links are revoked too.
 */
export async function suspendProfile(
  db: GuardianDb, profileId: string, input: { reason?: unknown }, ctx: StaffCtx,
  deps: { revokeSessions?: (uid: string) => Promise<void> } = {},
) {
  assertCan(ctx, 'guardian.restrict')
  const reason = cleanReason(input.reason)
  if (reason === '') throw unprocessable('REASON_REQUIRED', 'Give a reason. It is kept in the audit trail.')
  const profile = await db.guardianProfile.findUnique({ where: { id: profileId } })
  if (!profile) throw notFound('Guardian profile')
  if (profile.status !== 'ACTIVE') throw conflict('INVALID_TRANSITION', `A guardian that is ${String(profile.status).toLowerCase()} cannot be suspended.`)
  const now = nowOf(ctx)
  await db.$transaction(async (tx) => {
    const res = await tx.guardianProfile.updateMany({ where: { id: profileId, status: 'ACTIVE' }, data: { status: 'SUSPENDED' } })
    if (res.count !== 1) throw conflict('CHANGED', 'This guardian was changed by someone else. Reload and try again.')
    const links = await tx.guardianLink.findMany({ where: { profileId }, select: { id: true } })
    if (links.length) {
      await tx.guardianInvitation.updateMany({
        where: { linkId: { in: links.map((l) => l.id) }, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: now, revokedByUid: ctx.actor.uid },
      })
    }
  })
  if (profile.firebaseUid && deps.revokeSessions) {
    // Hygiene only: access already ends on the next request. Never let it fail the suspension.
    try { await deps.revokeSessions(profile.firebaseUid as string) } catch { /* the pipeline still denies them */ }
  }
  await ctx.audit({ action: 'guardian.profile_suspended', entityType: 'GuardianProfile', entityId: profileId, actorUid: ctx.actor.uid, actorRole: ctx.actor.role, metadata: { context: { reason } } })
  return db.guardianProfile.findUnique({ where: { id: profileId } })
}

export async function reinstateProfile(db: GuardianDb, profileId: string, ctx: StaffCtx) {
  assertCan(ctx, 'guardian.approve')
  const profile = await db.guardianProfile.findUnique({ where: { id: profileId } })
  if (!profile) throw notFound('Guardian profile')
  const res = await db.guardianProfile.updateMany({ where: { id: profileId, status: 'SUSPENDED' }, data: { status: 'ACTIVE' } })
  if (res.count !== 1) throw conflict('INVALID_TRANSITION', 'Only a suspended guardian can be reinstated.')
  await ctx.audit({ action: 'guardian.profile_reinstated', entityType: 'GuardianProfile', entityId: profileId, actorUid: ctx.actor.uid, actorRole: ctx.actor.role, metadata: {} })
  return db.guardianProfile.findUnique({ where: { id: profileId } })
}

// ─── READ MODELS (explicit allowlists) ────────────────────────────────────

export interface QueueFilter {
  status?: string
  reverify?: boolean
  studentId?: string
  take?: number
  skip?: number
}

const STUDENT_FIELDS = ['id', 'firstName', 'lastName', 'registrationNo', 'status', 'classId'] as const

function pick<T extends object>(src: T | null | undefined, keys: readonly string[]): Record<string, unknown> | null {
  if (!src) return null
  const out: Record<string, unknown> = {}
  for (const k of keys) out[k] = (src as Record<string, unknown>)[k] ?? null
  return out
}

function toStaffLinkDto(l: Record<string, any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const p = l.profile as Record<string, any> | null // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    id: l.id, status: l.status, relationship: l.relationship, relationshipNote: l.relationshipNote ?? null,
    evidence: l.evidence, source: l.source, capabilities: sanitizeCapabilities(l.capabilities),
    isPrimaryContact: l.isPrimaryContact === true, isFinancialResponsible: l.isFinancialResponsible === true,
    reverifyRequired: l.reverifyRequired === true, reverifyReason: l.reverifyReason ?? null,
    suggestion: l.suggestedProfileId ? { profileId: l.suggestedProfileId, method: l.suggestedMethod ?? null } : null,
    statusReason: l.statusReason ?? null, approvedAt: l.approvedAt ?? null, createdAt: l.createdAt,
    directoryEntryId: l.directoryEntryId ?? null,
    student: pick(l.student, STUDENT_FIELDS),
    profile: p ? {
      id: p.id, fullName: p.fullName, status: p.status, hasAccount: Boolean(p.firebaseUid),
      contacts: (p.contacts ?? []).map((c: Record<string, any>) => ({ id: c.id, kind: c.kind, value: c.value, verification: c.verification, isPreferred: c.isPreferred === true })), // eslint-disable-line @typescript-eslint/no-explicit-any
    } : null,
    invitations: (l.invitations ?? []).map((i: Record<string, any>) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      id: i.id, ref: i.ref, channel: i.channel, status: i.status, expiresAt: i.expiresAt, issuedAt: i.issuedAt, failedAttempts: i.failedAttempts,
    })),
  }
}

export async function listQueue(db: GuardianDb, f: QueueFilter, ctx: StaffCtx) {
  assertCan(ctx, 'guardian.view')
  const where: Record<string, unknown> = {}
  if (f.status) where.status = f.status
  if (f.reverify === true) where.reverifyRequired = true
  if (f.studentId) where.studentId = f.studentId
  const take = Math.min(Math.max(f.take ?? 50, 1), 200)
  const rows = await db.guardianLink.findMany({
    where, orderBy: { createdAt: 'desc' }, take, skip: Math.max(f.skip ?? 0, 0),
    include: { profile: { include: { contacts: true } }, student: true, invitations: true },
  })
  return { items: rows.map(toStaffLinkDto), take }
}

export async function getStudentPortalView(db: GuardianDb, studentId: string, ctx: StaffCtx) {
  assertCan(ctx, 'guardian.view')
  const student = await db.student.findUnique({ where: { id: studentId } })
  if (!student) throw notFound('Student')
  const [cards, links] = await Promise.all([
    db.studentGuardian.findMany({ where: { studentId }, orderBy: { createdAt: 'asc' } }),
    db.guardianLink.findMany({
      where: { studentId }, orderBy: { createdAt: 'asc' },
      include: { profile: { include: { contacts: true } }, student: true, invitations: true },
    }),
  ])
  return {
    student: pick(student, STUDENT_FIELDS),
    cards: cards.map((c) => pick(c, ['id', 'fullName', 'relation', 'phone', 'altPhone', 'email', 'isPrimary', 'isFeePayer', 'isEmergencyContact'])),
    links: links.map(toStaffLinkDto),
  }
}

export { GuardianError }
