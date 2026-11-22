/**
 * [FILE]: apps/web/src/server/services/guardian/guardianOnboardingService.ts
 * [PURPOSE]: Bring the school's EXISTING guardian contact cards into the portal pipeline
 *   safely: a dry-run report first, then an apply that only ever creates PENDING
 *   proposals, and a rollback for an apply that turns out to be wrong.
 *
 *     dryRun    writes ONLY its own batch/item rows. No profile, contact or link.
 *     apply     creates PENDING links (source BACKFILL) for the reviewed items, in chunks so
 *               a large school never hits a request time limit; call it again to resume.
 *     rollback  removes what a batch created, but ONLY while it is untouched.
 *
 * [SECURITY NOTES]
 *   - Nothing here grants access. A backfilled link is PENDING with no evidence and no
 *     capabilities, exactly like an admission proposal; staff still verify and approve.
 *   - Idempotent: apply goes through proposeFromDirectoryEntry (one proposal per card, backed
 *     by a unique index), so re-running, resuming, or two staff applying at once cannot
 *     create duplicates.
 *   - Rollback never deletes a decision. A link staff have since verified, approved, re-pointed
 *     or invited is KEPT and reported, not removed.
 *   - Contact details never appear in audit entries or in the batch report: only ids, counts
 *     and flag names.
 */
import { PARENT_VISIBLE_STUDENT_STATUSES } from '@shared/constants/guardianPortal'
import { buildGuardianProposal } from '@/server/lib/guardian/proposal'
import { nameSimilarity, SAME_PERSON_THRESHOLD } from '@/server/lib/guardian/names'
import { suggestMatches, type ExistingProfile } from '@/server/lib/guardian/matching'
import type { GuardianDb } from './db'
import { conflict, notFound } from './errors'
import { proposeFromDirectoryEntry, type DirectoryCard } from './guardianIdentityService'
import { assertCan, type StaffCtx } from './guardianLinkService'

const STUDENT_CHUNK = 400
const DEFAULT_APPLY_CHUNK = 150
const MAX_APPLY_CHUNK = 500
const MAX_CARDS_PER_BATCH = 20_000

const nowOf = (c: StaffCtx) => (c.now ?? (() => new Date()))()
const chunks = <T,>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))

export interface OnboardingScope {
  classId?: string
  studentIds?: string[]
  /** Default false: only currently enrolled students are onboarded. */
  includeNotEnrolled?: boolean
}

type ItemAction = 'CREATE_NEW' | 'SUGGEST_MATCH' | 'SKIP_EXISTING' | 'SKIP_INVALID'

export interface DryRunSummary {
  batchId: string
  cards: number
  byAction: Record<ItemAction, number>
  byFlag: Record<string, number>
  truncated: boolean
}

// ─── DRY RUN ──────────────────────────────────────────────────────────────

export async function dryRun(db: GuardianDb, scope: OnboardingScope, ctx: StaffCtx): Promise<DryRunSummary> {
  assertCan(ctx, 'guardian.backfill')

  const studentWhere: Record<string, unknown> = {}
  if (!scope.includeNotEnrolled) studentWhere.status = { in: [...PARENT_VISIBLE_STUDENT_STATUSES] }
  if (scope.classId) studentWhere.classId = scope.classId
  if (scope.studentIds) studentWhere.id = { in: scope.studentIds }
  const students = await db.student.findMany({ where: studentWhere, select: { id: true } })
  const studentIds = students.map((s) => s.id as string)

  let cards: DirectoryCard[] = []
  for (const part of chunks(studentIds, STUDENT_CHUNK)) {
    cards.push(...((await db.studentGuardian.findMany({ where: { studentId: { in: part } }, orderBy: { createdAt: 'asc' } })) as DirectoryCard[]))
  }
  const truncated = cards.length > MAX_CARDS_PER_BATCH
  if (truncated) cards = cards.slice(0, MAX_CARDS_PER_BATCH)

  const linked = new Set<string>()
  for (const part of chunks(cards.map((c) => c.id), 1000)) {
    const rows = await db.guardianLink.findMany({ where: { directoryEntryId: { in: part } }, select: { directoryEntryId: true } })
    for (const r of rows) linked.add(r.directoryEntryId as string)
  }

  // Existing profiles sharing a phone/email with any card, loaded once.
  const proposals = cards.map((c) => buildGuardianProposal(c))
  const phones = [...new Set(proposals.flatMap((p) => p.contacts.filter((c) => c.kind === 'PHONE').map((c) => c.normalizedValue)))]
  const emails = [...new Set(proposals.flatMap((p) => p.contacts.filter((c) => c.kind === 'EMAIL').map((c) => c.normalizedValue)))]
  const profileIds = new Set<string>()
  for (const part of chunks(phones, 500)) {
    for (const h of await db.guardianContact.findMany({ where: { kind: 'PHONE', normalizedValue: { in: part } }, select: { profileId: true } })) profileIds.add(h.profileId as string)
  }
  for (const part of chunks(emails, 500)) {
    for (const h of await db.guardianContact.findMany({ where: { kind: 'EMAIL', normalizedValue: { in: part } }, select: { profileId: true } })) profileIds.add(h.profileId as string)
  }
  // A national ID is the strongest signal, so profiles holding one of these IDs are candidates too.
  const nationalIds = [...new Set(proposals.map((p) => p.nationalId).filter((v): v is string => !!v))]
  for (const part of chunks(nationalIds, 500)) {
    for (const h of await db.guardianProfile.findMany({ where: { nationalId: { in: part } }, select: { id: true } })) profileIds.add(h.id as string)
  }
  const existing: ExistingProfile[] = []
  for (const part of chunks([...profileIds], 500)) {
    existing.push(...((await db.guardianProfile.findMany({ where: { id: { in: part } }, include: { contacts: true } })) as ExistingProfile[]))
  }

  const byAction: Record<ItemAction, number> = { CREATE_NEW: 0, SUGGEST_MATCH: 0, SKIP_EXISTING: 0, SKIP_INVALID: 0 }
  const byFlag: Record<string, number> = {}
  const earlier = new Map<string, string[]>()   // phone -> names of earlier cards in THIS batch
  const earlierIds = new Set<string>()          // national IDs of earlier cards in THIS batch
  const items: Record<string, unknown>[] = []

  cards.forEach((card, i) => {
    const p = proposals[i]!
    const flags: string[] = [...p.flags]
    let action: ItemAction
    let reason: string | null = null
    if (linked.has(card.id)) { action = 'SKIP_EXISTING'; reason = 'ALREADY_PROPOSED' }
    else if (!p.usable) { action = 'SKIP_INVALID'; reason = 'NAME_PLACEHOLDER' }
    else {
      const phoneValues = p.contacts.filter((c) => c.kind === 'PHONE').map((c) => c.normalizedValue)
      const email = p.contacts.find((c) => c.kind === 'EMAIL')?.normalizedValue ?? null
      const matchesDb = suggestMatches({ name: p.fullName, phones: phoneValues, email, nationalId: p.nationalId }, existing).length > 0
      const matchesEarlier = phoneValues.some((ph) => (earlier.get(ph) ?? []).some((n) => nameSimilarity(n, p.fullName) >= SAME_PERSON_THRESHOLD)) ||
        (!!p.nationalId && earlierIds.has(p.nationalId))
      if (matchesDb) flags.push('MATCHES_EXISTING_PROFILE')
      if (matchesEarlier) flags.push('MATCHES_EARLIER_IN_BATCH')
      action = matchesDb || matchesEarlier ? 'SUGGEST_MATCH' : 'CREATE_NEW'
      for (const ph of phoneValues) earlier.set(ph, [...(earlier.get(ph) ?? []), p.fullName])
      if (p.nationalId) earlierIds.add(p.nationalId)
    }
    byAction[action]++
    for (const f of flags) byFlag[f] = (byFlag[f] ?? 0) + 1
    items.push({ directoryEntryId: card.id, studentId: card.studentId, action, reason, flags })
  })

  const batch = await db.guardianOnboardingBatch.create({
    data: {
      status: 'DRY_RUN', createdByUid: ctx.actor.uid,
      scope: { classId: scope.classId ?? null, studentCount: studentIds.length, includeNotEnrolled: scope.includeNotEnrolled === true },
      summary: { cards: cards.length, byAction, byFlag, truncated },
    },
  })
  for (const part of chunks(items, 500)) {
    await db.guardianOnboardingItem.createMany!({ data: part.map((it) => ({ ...it, batchId: batch.id })) })
  }

  await ctx.audit({
    action: 'guardian.onboarding_dry_run', entityType: 'GuardianOnboardingBatch', entityId: batch.id as string,
    actorUid: ctx.actor.uid, actorRole: ctx.actor.role, metadata: { context: { cards: cards.length, byAction, truncated } },
  })
  return { batchId: batch.id as string, cards: cards.length, byAction, byFlag, truncated }
}

// ─── APPLY ────────────────────────────────────────────────────────────────

export interface ApplyResult { batchId: string; processed: number; created: number; skipped: number; remaining: number; status: 'APPLYING' | 'APPLIED' }

export async function apply(db: GuardianDb, batchId: string, input: { maxItems?: number }, ctx: StaffCtx): Promise<ApplyResult> {
  assertCan(ctx, 'guardian.backfill')
  const batch = await db.guardianOnboardingBatch.findUnique({ where: { id: batchId } })
  if (!batch) throw notFound('Onboarding batch')
  if (batch.status === 'ROLLED_BACK') throw conflict('ROLLED_BACK', 'This batch was rolled back. Run a new dry run.')
  if (batch.status === 'APPLIED') throw conflict('ALREADY_APPLIED', 'This batch has already been applied.')

  if (batch.status === 'DRY_RUN') {
    // Claim the batch. A second request that loses this claim simply resumes below: the
    // proposals are idempotent per card, so the two cannot create duplicates.
    await db.guardianOnboardingBatch.updateMany({
      where: { id: batchId, status: 'DRY_RUN' },
      data: { status: 'APPLYING', appliedByUid: ctx.actor.uid },
    })
  }

  const max = Math.min(Math.max(Math.trunc(input.maxItems ?? DEFAULT_APPLY_CHUNK), 1), MAX_APPLY_CHUNK)
  const pending = await db.guardianOnboardingItem.findMany({
    where: { batchId, action: { in: ['CREATE_NEW', 'SUGGEST_MATCH'] }, createdLinkId: null },
    orderBy: { id: 'asc' },
    take: max,
  })

  let created = 0
  let skipped = 0
  for (const item of pending) {
    const card = (await db.studentGuardian.findUnique({ where: { id: item.directoryEntryId } })) as DirectoryCard | null
    if (!card) { await db.guardianOnboardingItem.update({ where: { id: item.id }, data: { action: 'SKIP_INVALID', reason: 'CARD_REMOVED' } }); skipped++; continue }
    const r = await proposeFromDirectoryEntry(db, card, { actor: ctx.actor, source: 'BACKFILL', now: nowOf.bind(null, ctx) })
    if (r.outcome === 'CREATED') {
      const contacts = await db.guardianContact.findMany({ where: { profileId: r.profileId }, select: { id: true } })
      await db.guardianOnboardingItem.update({
        where: { id: item.id },
        data: { createdProfileId: r.profileId, createdLinkId: r.linkId, createdContactIds: contacts.map((c) => c.id as string) },
      })
      created++
    } else {
      await db.guardianOnboardingItem.update({
        where: { id: item.id },
        data: { action: 'SKIP_EXISTING', reason: r.outcome === 'EXISTING' ? 'ALREADY_PROPOSED' : 'NAME_PLACEHOLDER' },
      })
      skipped++
    }
  }

  const remaining = await db.guardianOnboardingItem.count({
    where: { batchId, action: { in: ['CREATE_NEW', 'SUGGEST_MATCH'] }, createdLinkId: null },
  })
  const status: 'APPLYING' | 'APPLIED' = remaining === 0 ? 'APPLIED' : 'APPLYING'
  if (status === 'APPLIED') {
    await db.guardianOnboardingBatch.updateMany({ where: { id: batchId, status: 'APPLYING' }, data: { status: 'APPLIED', appliedAt: nowOf(ctx), appliedByUid: ctx.actor.uid } })
  }
  await ctx.audit({
    action: 'guardian.onboarding_applied', entityType: 'GuardianOnboardingBatch', entityId: batchId,
    actorUid: ctx.actor.uid, actorRole: ctx.actor.role, metadata: { context: { processed: pending.length, created, skipped, remaining, status } },
  })
  return { batchId, processed: pending.length, created, skipped, remaining, status }
}

// ─── ROLLBACK ─────────────────────────────────────────────────────────────

export interface RollbackResult { batchId: string; removed: number; kept: number }

/** Untouched = nobody has made a decision about it since the batch created it. */
function isUntouched(link: Record<string, unknown>, expectedProfileId: string, invitationCount: number): boolean {
  return link.status === 'PENDING' && link.evidence === 'NONE' && !link.approvedByUid &&
    link.profileId === expectedProfileId && invitationCount === 0
}

export async function rollback(db: GuardianDb, batchId: string, ctx: StaffCtx): Promise<RollbackResult> {
  assertCan(ctx, 'guardian.backfill')
  const batch = await db.guardianOnboardingBatch.findUnique({ where: { id: batchId } })
  if (!batch) throw notFound('Onboarding batch')
  if (batch.status === 'ROLLED_BACK') throw conflict('ALREADY_ROLLED_BACK', 'This batch was already rolled back.')
  if (batch.status === 'DRY_RUN') throw conflict('NOTHING_TO_ROLL_BACK', 'A dry run created nothing, so there is nothing to roll back.')

  // Close the door first so a concurrent apply cannot keep creating while we remove.
  const claim = await db.guardianOnboardingBatch.updateMany({
    where: { id: batchId, status: { in: ['APPLYING', 'APPLIED'] } },
    data: { status: 'ROLLED_BACK', rolledBackAt: nowOf(ctx), rolledBackByUid: ctx.actor.uid },
  })
  if (claim.count !== 1) throw conflict('CHANGED', 'This batch was changed by someone else. Reload and try again.')

  const items = await db.guardianOnboardingItem.findMany({ where: { batchId, createdLinkId: { not: null } } })
  let removed = 0
  let kept = 0
  for (const item of items) {
    const link = await db.guardianLink.findUnique({ where: { id: item.createdLinkId } })
    if (!link) { continue }                      // already gone
    const invitations = await db.guardianInvitation.count({ where: { linkId: link.id } })
    if (!isUntouched(link, item.createdProfileId as string, invitations)) {
      kept++
      await db.guardianOnboardingItem.update({ where: { id: item.id }, data: { reason: 'KEPT_ALREADY_ACTED_ON' } })
      continue
    }
    await db.$transaction(async (tx) => {
      const gone = await tx.guardianLink.deleteMany({ where: { id: link.id, status: 'PENDING', evidence: 'NONE' } })
      if (gone.count !== 1) return                // someone acted between our read and delete: leave it
      const profileId = item.createdProfileId as string
      const left = await tx.guardianLink.count({ where: { profileId } })
      const profile = await tx.guardianProfile.findUnique({ where: { id: profileId } })
      if (left === 0 && profile && !profile.firebaseUid) {
        await tx.guardianContact.deleteMany({ where: { profileId } })
        await tx.guardianProfile.delete({ where: { id: profileId } })
      }
    })
    const stillThere = await db.guardianLink.findUnique({ where: { id: link.id } })
    if (stillThere) { kept++; continue }
    removed++
    await db.guardianOnboardingItem.update({ where: { id: item.id }, data: { reason: 'ROLLED_BACK' } })
  }

  await ctx.audit({
    action: 'guardian.onboarding_rolled_back', entityType: 'GuardianOnboardingBatch', entityId: batchId,
    actorUid: ctx.actor.uid, actorRole: ctx.actor.role, metadata: { context: { removed, kept } },
  })
  return { batchId, removed, kept }
}

// ─── REPORT ───────────────────────────────────────────────────────────────

export async function getBatch(db: GuardianDb, batchId: string, input: { take?: number; skip?: number; action?: string }, ctx: StaffCtx) {
  assertCan(ctx, 'guardian.backfill')
  const batch = await db.guardianOnboardingBatch.findUnique({ where: { id: batchId } })
  if (!batch) throw notFound('Onboarding batch')
  const take = Math.min(Math.max(input.take ?? 100, 1), 500)
  const items = await db.guardianOnboardingItem.findMany({
    where: { batchId, ...(input.action ? { action: input.action } : {}) }, orderBy: { id: 'asc' }, take, skip: Math.max(input.skip ?? 0, 0),
  })
  // Names so staff can recognise a row without opening each student: two bounded lookups for the
  // page of items (never one per row), selecting only the name fields. Phones and e-mails are
  // deliberately not part of this report.
  const studentIds = [...new Set(items.map((i) => i.studentId as string))]
  const entryIds = [...new Set(items.map((i) => i.directoryEntryId as string))]
  const [students, cards] = await Promise.all([
    studentIds.length ? db.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, firstName: true, lastName: true, registrationNo: true } }) : Promise.resolve([]),
    entryIds.length ? db.studentGuardian.findMany({ where: { id: { in: entryIds } }, select: { id: true, fullName: true, relation: true } }) : Promise.resolve([]),
  ])
  const studentById = new Map(students.map((s) => [s.id as string, s]))
  const cardById = new Map(cards.map((c) => [c.id as string, c]))
  const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
  return {
    batch: {
      id: batch.id, status: batch.status, scope: batch.scope, summary: batch.summary, createdAt: batch.createdAt,
      appliedAt: batch.appliedAt ?? null, rolledBackAt: batch.rolledBackAt ?? null,
    },
    // Ids, actions, flag NAMES and the student's and guardian's names for recognition. No phone
    // numbers or e-mail addresses.
    items: items.map((i) => {
      const s = studentById.get(i.studentId as string)
      const c = cardById.get(i.directoryEntryId as string)
      return {
        id: i.id, directoryEntryId: i.directoryEntryId, studentId: i.studentId, action: i.action, reason: i.reason ?? null,
        flags: Array.isArray(i.flags) ? i.flags : [], createdLinkId: i.createdLinkId ?? null,
        studentName: s ? [text(s.firstName), text(s.lastName)].filter(Boolean).join(' ') || null : null,
        registrationNo: s ? text(s.registrationNo) : null,
        guardianName: c ? text(c.fullName) : null,
        relation: c ? text(c.relation) : null,
      }
    }),
    take,
  }
}
