/**
 * [FILE]: apps/web/src/server/services/guardian/guardianIdentityService.ts
 * [PURPOSE]: Turns the school's guardian CONTACT CARDS (StudentGuardian) into portal
 *   PROPOSALS and keeps the portal honest when a card later changes. Nothing here
 *   grants access: every link it creates is PENDING, and it can only ever REDUCE
 *   access (flag, suspend, reject), never widen it.
 *
 *   - proposeFromDirectoryEntry   card -> profile + contacts + PENDING link (idempotent)
 *   - reconcileEntryDrift         card edited -> flag the ACTIVE/SUSPENDED link for re-verification
 *   - suspendLinksForRemovedCard  card deleted -> suspend (fail safe), reject pending
 *   - syncStudentDirectory        all of the above for one student, idempotently
 *
 *   Functions take a GuardianDb (or a transaction handle) and RETURN the audit records
 *   they produced instead of writing them, so a caller can run them inside a database
 *   transaction and emit the audit entries only after it commits.
 *
 * [SECURITY NOTES]
 *   - Matching an existing profile is only recorded as a SUGGESTION on the link.
 *     Families share phones; names are not unique. Staff decide whether to merge.
 *   - A previous staff decision is never undone by an edit: a REJECTED or REVOKED link
 *     is not re-proposed, and an edit never reactivates anything.
 *   - The guardian profile is never rewritten from the card. A changed card flags the
 *     link; it does not change who the person is.
 */
import type { GuardianLinkSourceValue } from '@shared/constants/guardianPortal'
import { buildGuardianProposal, detectDirectoryDrift, type DirectoryEntryInput, type ProposalFlag } from '@/server/lib/guardian/proposal'
import { suggestMatches, type ExistingProfile } from '@/server/lib/guardian/matching'
import { isUniqueViolation, type Actor, type AuditRecord, type GuardianDb } from './db'

export interface DirectoryCard extends DirectoryEntryInput {
  id: string
  studentId: string
}

export interface ServiceCtx {
  actor: Actor
  source?: GuardianLinkSourceValue
  now?: () => Date
}

const MIN_SUGGESTION_SCORE = 0.4
const LIVE_STATUSES = ['ACTIVE', 'SUSPENDED'] as const

const nowOf = (ctx: ServiceCtx) => (ctx.now ?? (() => new Date()))()

/** The card values staff verify against: raw, so drift can be recomputed later. */
export function snapshotOf(card: DirectoryEntryInput): Record<string, string | null> {
  return {
    fullName: card.fullName ?? '',
    relation: card.relation ?? '',
    phone: card.phone ?? '',
    altPhone: card.altPhone ?? null,
    email: card.email ?? null,
  }
}

function snapshotAsEntry(s: unknown): DirectoryEntryInput | null {
  if (typeof s !== 'object' || s === null) return null
  const o = s as Record<string, unknown>
  return {
    fullName: String(o.fullName ?? ''),
    relation: String(o.relation ?? ''),
    phone: String(o.phone ?? ''),
    altPhone: typeof o.altPhone === 'string' ? o.altPhone : null,
    email: typeof o.email === 'string' ? o.email : null,
  }
}

function audit(ctx: ServiceCtx, action: string, entityId: string, metadata: Record<string, unknown>): AuditRecord {
  return { action, entityType: 'GuardianLink', entityId, actorUid: ctx.actor.uid, actorRole: ctx.actor.role, metadata }
}

// ─── PROPOSE ──────────────────────────────────────────────────────────────

export type ProposeOutcome =
  | { outcome: 'CREATED'; linkId: string; profileId: string; flags: ProposalFlag[]; suggestion: { profileId: string; method: string; score: number } | null; audit: AuditRecord[] }
  | { outcome: 'EXISTING'; linkId: string; audit: AuditRecord[] }
  | { outcome: 'SKIPPED'; reason: 'NAME_PLACEHOLDER'; flags: ProposalFlag[]; audit: AuditRecord[] }

export async function proposeFromDirectoryEntry(db: GuardianDb, card: DirectoryCard, ctx: ServiceCtx): Promise<ProposeOutcome> {
  // Idempotent on the card: one proposal per card, whatever its later fate.
  const existing = await db.guardianLink.findFirst({ where: { directoryEntryId: card.id }, select: { id: true } })
  if (existing) return { outcome: 'EXISTING', linkId: existing.id as string, audit: [] }

  const proposal = buildGuardianProposal(card)
  if (!proposal.usable) return { outcome: 'SKIPPED', reason: 'NAME_PLACEHOLDER', flags: proposal.flags, audit: [] }

  // Suggestions: existing profiles sharing a phone or email with this card.
  const phones = proposal.contacts.filter((c) => c.kind === 'PHONE').map((c) => c.normalizedValue)
  const email = proposal.contacts.find((c) => c.kind === 'EMAIL')?.normalizedValue ?? null
  let suggestion: { profileId: string; method: string; score: number } | null = null
  if (phones.length > 0 || email) {
    const or: Record<string, unknown>[] = []
    if (phones.length) or.push({ kind: 'PHONE', normalizedValue: { in: phones } })
    if (email) or.push({ kind: 'EMAIL', normalizedValue: email })
    const hits = await db.guardianContact.findMany({ where: { OR: or }, select: { profileId: true } })
    const ids = [...new Set(hits.map((h) => h.profileId as string))]
    if (ids.length) {
      const profiles = (await db.guardianProfile.findMany({ where: { id: { in: ids } }, include: { contacts: true } })) as ExistingProfile[]
      const best = suggestMatches({ name: proposal.fullName, phones, email }, profiles)[0]
      if (best && best.score >= MIN_SUGGESTION_SCORE) suggestion = { profileId: best.profileId, method: best.method, score: best.score }
    }
  }

  const now = nowOf(ctx)
  const source = ctx.source ?? 'ADMISSION'
  let created: { profileId: string; linkId: string }
  try {
    created = await db.$transaction(async (tx) => {
    const profile = await tx.guardianProfile.create({
      data: {
        fullName: proposal.fullName,
        normalizedName: proposal.normalizedName,
        createdSource: source,
        createdByUid: ctx.actor.uid,
      },
    })
    for (const c of proposal.contacts) {
      await tx.guardianContact.create({
        data: { profileId: profile.id, kind: c.kind, value: c.value, normalizedValue: c.normalizedValue, isPreferred: c.isPreferred },
      })
    }
    const link = await tx.guardianLink.create({
      data: {
        profileId: profile.id,
        studentId: card.studentId,
        relationship: proposal.relationship,
        relationshipNote: proposal.relationshipNote,
        status: 'PENDING',
        source,
        evidence: 'NONE',
        capabilities: [],                       // PENDING grants nothing; staff choose at approval
        isPrimaryContact: proposal.isPrimaryContact,
        isFinancialResponsible: proposal.isFinancialResponsible,
        directoryEntryId: card.id,
        verifiedSnapshot: snapshotOf(card),
        suggestedProfileId: suggestion?.profileId ?? null,
        suggestedMethod: suggestion?.method ?? null,
        createdByUid: ctx.actor.uid,
        statusChangedAt: now,
        statusChangedByUid: ctx.actor.uid,
      },
    })
    return { profileId: profile.id as string, linkId: link.id as string }
    })
  } catch (err) {
    // Lost a race: another request proposed this same card between our check and our
    // insert. The unique index on directoryEntryId refused ours and the transaction
    // rolled back (no orphan profile or contacts). That is the idempotent outcome.
    if (isUniqueViolation(err)) {
      const winner = await db.guardianLink.findFirst({ where: { directoryEntryId: card.id }, select: { id: true } })
      if (winner) return { outcome: 'EXISTING', linkId: winner.id as string, audit: [] }
    }
    throw err
  }

  return {
    outcome: 'CREATED',
    linkId: created.linkId,
    profileId: created.profileId,
    flags: proposal.flags,
    suggestion,
    audit: [audit(ctx, 'guardian.link_proposed', created.linkId, {
      context: { studentId: card.studentId, source, flags: proposal.flags, suggested: suggestion?.method ?? null },
    })],
  }
}

// ─── DRIFT ────────────────────────────────────────────────────────────────

export interface ReconcileResult { checked: number; flagged: number; audit: AuditRecord[] }

/** Compares each live link's verified snapshot with the card as it is now. Idempotent. */
export async function reconcileEntryDrift(db: GuardianDb, card: DirectoryCard, ctx: ServiceCtx): Promise<ReconcileResult> {
  const links = await db.guardianLink.findMany({
    where: { directoryEntryId: card.id, status: { in: [...LIVE_STATUSES] } },
  })
  const records: AuditRecord[] = []
  let flagged = 0
  for (const link of links) {
    const snap = snapshotAsEntry(link.verifiedSnapshot)
    if (!snap) {
      // No baseline (should not happen): record one now rather than guess.
      await db.guardianLink.update({ where: { id: link.id }, data: { verifiedSnapshot: snapshotOf(card) } })
      continue
    }
    const drift = detectDirectoryDrift(snap, card)
    if (!drift.requiresReverify || link.reverifyRequired === true) continue
    await db.guardianLink.update({
      where: { id: link.id },
      data: { reverifyRequired: true, reverifyReason: `Contact card changed: ${drift.changed.join(', ')}` },
    })
    flagged++
    records.push(audit(ctx, 'guardian.link_reverify_flagged', link.id as string, {
      context: { studentId: card.studentId, changed: drift.changed },
    }))
  }
  return { checked: links.length, flagged, audit: records }
}

// ─── REMOVAL ──────────────────────────────────────────────────────────────

export interface RemovalResult { suspended: number; rejected: number; audit: AuditRecord[] }

/**
 * MUST run BEFORE the card is deleted, inside the same transaction: the foreign key
 * nulls `directoryEntryId` the moment the row goes, after which these links could no
 * longer be found. An ACTIVE link is SUSPENDED (fail safe: staff reinstate it if the
 * removal was a mistake); a PENDING proposal is REJECTED. If this throws, the delete
 * must not proceed.
 */
export async function suspendLinksForRemovedCard(db: GuardianDb, cardId: string, ctx: ServiceCtx): Promise<RemovalResult> {
  const now = nowOf(ctx)
  const links = await db.guardianLink.findMany({
    where: { directoryEntryId: cardId, status: { in: ['ACTIVE', 'PENDING'] } },
  })
  const records: AuditRecord[] = []
  let suspended = 0
  let rejected = 0
  for (const link of links) {
    const toStatus = link.status === 'ACTIVE' ? 'SUSPENDED' : 'REJECTED'
    await db.guardianLink.update({
      where: { id: link.id },
      data: {
        status: toStatus,
        statusReason: 'Contact card removed by staff',
        reverifyRequired: toStatus === 'SUSPENDED',
        statusChangedAt: now,
        statusChangedByUid: ctx.actor.uid,
      },
    })
    if (toStatus === 'SUSPENDED') suspended++; else rejected++
    records.push(audit(ctx, toStatus === 'SUSPENDED' ? 'guardian.link_suspended' : 'guardian.link_rejected', link.id as string, {
      context: { studentId: link.studentId, reason: 'contact_card_removed' },
    }))
  }
  return { suspended, rejected, audit: records }
}

// ─── WHOLE-STUDENT SYNC ───────────────────────────────────────────────────

export interface SyncResult {
  proposed: number
  skipped: number
  existing: number
  flagged: number
  audit: AuditRecord[]
}

/**
 * Idempotent: proposes every card of the student that has no link yet and drift-checks
 * the cards that do. Safe to call after any create/update and from a reconcile job.
 */
export async function syncStudentDirectory(db: GuardianDb, studentId: string, ctx: ServiceCtx): Promise<SyncResult> {
  const cards = (await db.studentGuardian.findMany({ where: { studentId }, orderBy: { createdAt: 'asc' } })) as DirectoryCard[]
  const result: SyncResult = { proposed: 0, skipped: 0, existing: 0, flagged: 0, audit: [] }
  for (const card of cards) {
    const proposed = await proposeFromDirectoryEntry(db, card, ctx)
    result.audit.push(...proposed.audit)
    if (proposed.outcome === 'CREATED') { result.proposed++; continue }
    if (proposed.outcome === 'SKIPPED') { result.skipped++; continue }
    result.existing++
    const drift = await reconcileEntryDrift(db, card, ctx)
    result.flagged += drift.flagged
    result.audit.push(...drift.audit)
  }
  return result
}
