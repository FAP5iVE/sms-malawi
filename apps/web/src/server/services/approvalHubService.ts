/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/server/services/approvalHubService.ts
 * [PURPOSE]: The Approvals Hub — one place to see, review and track every
 *   request that needs (or needed) a decision, across all modules.
 *
 *   How it works
 *   ────────────
 *   Each module keeps its own approval state on its own table. A registry of
 *   adapters (./approvals/registry.ts) normalises those rows into one
 *   ApprovalItem shape, so a request submitted anywhere — leave, an expense,
 *   a purchase order, an announcement — is on this page the moment it exists,
 *   with no dual writes that could drift out of sync, and requests that were
 *   already pending before this shipped show up too.
 *
 *   Decisions are handed back to the module's own service function, so its
 *   guards and side effects still run. The hub adds what is common to all of
 *   them: the permission check (same gate as the module's own route),
 *   self-review protection, a required reason on reject/return, a uniform
 *   audit entry, and a notification to the requester.
 *
 *   Visibility
 *   ──────────
 *   A viewer sees (a) everything in the modules they are allowed to review,
 *   and (b) their own submissions in every module — never anyone else's
 *   requests in a module they cannot review.
 *
 * [DEPENDS ON]: ./approvals/*, auditService, notificationFeedService, lib/push
 */

import 'server-only'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { sendToUser } from '@/lib/push'
import * as auditService from '@/server/services/auditService'
import * as notificationFeedService from '@/server/services/notificationFeedService'
import {
  APPROVAL_SOURCES,
  APPROVAL_SOURCE_META,
  APPROVAL_STATUSES,
  APPROVAL_STATUS_CONFIG,
  canReviewApprovalSource,
  passesApprovalGate,
  type ApprovalAction,
  type ApprovalBulkResult,
  type ApprovalCapabilities,
  type ApprovalItem,
  type ApprovalListResult,
  type ApprovalModule,
  type ApprovalScope,
  type ApprovalSource,
  type ApprovalSummary,
} from '@shared/constants/approvals'
import type { ApprovalListQuery } from '@shared/schemas/approvals'
import type { UserRole } from '@shared/types/roles'
import { ADAPTERS } from './approvals/registry'
import { emptyCounts, lookupNames } from './approvals/helpers'
import type { AdapterItem, AdapterQuery, ApprovalActor, DecisionInput, StatusCounts } from './approvals/types'

// ─── PERMISSIONS ──────────────────────────────────────────

const passesGate = passesApprovalGate
const canReviewSource = canReviewApprovalSource

export function reviewableSources(role: UserRole): ApprovalSource[] {
  return APPROVAL_SOURCES.filter((s) => canReviewSource(role, APPROVAL_SOURCE_META[s]))
}

function computeCapabilities(item: AdapterItem, actor: ApprovalActor): { capabilities: ApprovalCapabilities; isMine: boolean } {
  const meta = APPROVAL_SOURCE_META[item.source]
  const pending = item.status === 'PENDING'
  const isMine = !!item.requester.uid && item.requester.uid === actor.uid
  const selfBlocked = meta.blockSelfReview && isMine

  const mayApprove = pending && passesGate(actor.role, meta.approve)
  const mayReject = pending && !!meta.reject && passesGate(actor.role, meta.reject)
  const mayReturn = pending && !!meta.return && passesGate(actor.role, meta.return)

  return {
    isMine,
    capabilities: {
      canApprove: mayApprove && !selfBlocked,
      canReject: mayReject && !selfBlocked,
      canReturn: mayReturn && !selfBlocked,
      canCancel: pending && meta.requesterCanCancel && isMine,
      blockedReason:
        selfBlocked && (mayApprove || mayReject || mayReturn)
          ? 'You submitted this request, so someone else needs to review it.'
          : null,
    },
  }
}

// ─── SCOPE PLANNING ───────────────────────────────────────

interface Plan {
  source: ApprovalSource
  requesterUid: string | null
}

/**
 * Which sources to read, and whether to restrict each to the viewer's own
 * submissions:
 *   review → only sources the viewer can review, everyone's requests
 *   mine   → every source, only the viewer's requests
 *   all    → reviewable sources in full, everything else just the viewer's own
 */
function planFor(
  scope: ApprovalScope,
  actor: ApprovalActor,
  filter: { module?: ApprovalModule | undefined; source?: ApprovalSource | undefined },
): Plan[] {
  const plans: Plan[] = []
  for (const source of APPROVAL_SOURCES) {
    const meta = APPROVAL_SOURCE_META[source]
    if (filter.source && filter.source !== source) continue
    if (filter.module && filter.module !== meta.module) continue
    const reviewable = canReviewSource(actor.role, meta)

    if (scope === 'review') {
      if (reviewable) plans.push({ source, requesterUid: null })
    } else if (scope === 'mine') {
      plans.push({ source, requesterUid: actor.uid })
    } else {
      plans.push({ source, requesterUid: reviewable ? null : actor.uid })
    }
  }
  return plans
}

// ─── SHARED HELPERS ───────────────────────────────────────

function sortKey(item: AdapterItem): number {
  const t = item.status === 'PENDING' ? item.createdAt : (item.decidedAt ?? item.createdAt)
  return Date.parse(t)
}

function matchesSearch(item: AdapterItem, needle: string): boolean {
  const hay = [
    item.title,
    item.summary ?? '',
    item.typeLabel,
    item.requester.name,
    ...item.details.map((d) => d.value),
  ]
    .join(' ')
    .toLowerCase()
  return hay.includes(needle)
}

async function fillNames(items: AdapterItem[]): Promise<void> {
  const uids: string[] = []
  for (const i of items) {
    if (i.requester.uid && !i.requester.name) uids.push(i.requester.uid)
    if (i.decidedBy?.uid && !i.decidedBy.name) uids.push(i.decidedBy.uid)
  }
  const names = uids.length ? await lookupNames(uids) : new Map<string, string>()
  for (const i of items) {
    if (!i.requester.name) i.requester.name = (i.requester.uid && names.get(i.requester.uid)) || 'Unknown user'
    if (i.decidedBy && !i.decidedBy.name) i.decidedBy.name = (i.decidedBy.uid && names.get(i.decidedBy.uid)) || 'Unknown user'
  }
}

interface HubAuditContext {
  notes?: string
  actorUid?: string
}

/**
 * Some modules have nowhere to store a rejection reason (loans, expenses,
 * timetable…) — the hub writes it to the audit trail. Read it back so the
 * requester can see why, and who declined, without a schema change.
 */
async function backfillDecisions(items: AdapterItem[]): Promise<void> {
  const need = items.filter(
    (i) => (i.status === 'REJECTED' || i.status === 'CANCELLED') && (!i.decisionNotes || !i.decidedBy),
  )
  if (need.length === 0) return
  const rows = await prisma.auditLog.findMany({
    where: {
      entityType: 'Approval',
      entityId: { in: need.map((i) => i.key) },
      action: { in: ['approval.rejected', 'approval.returned', 'approval.cancelled'] },
    },
    select: { entityId: true, actorUid: true, createdAt: true, metadata: true },
    orderBy: { createdAt: 'desc' },
  })
  const latest = new Map<string, (typeof rows)[number]>()
  for (const r of rows) if (!latest.has(r.entityId)) latest.set(r.entityId, r)

  const uids = Array.from(latest.values()).map((r) => r.actorUid)
  const names = uids.length ? await lookupNames(uids) : new Map<string, string>()

  for (const item of need) {
    const row = latest.get(item.key)
    if (!row) continue
    const meta = row.metadata as { context?: HubAuditContext } | null
    const notes = meta?.context?.notes
    if (!item.decisionNotes && typeof notes === 'string' && notes) item.decisionNotes = notes
    if (!item.decidedBy) item.decidedBy = { uid: row.actorUid, name: names.get(row.actorUid) ?? '', role: null }
    if (!item.decidedAt) item.decidedAt = row.createdAt.toISOString()
  }
}

async function safely<T>(
  source: ApprovalSource,
  warnings: string[],
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    logger.error({ err, source }, '[approvalHub] adapter failed — continuing without it')
    warnings.push(APPROVAL_SOURCE_META[source].typeLabel)
    return fallback
  }
}

function finalize(items: AdapterItem[], actor: ApprovalActor): ApprovalItem[] {
  return items.map((item) => ({ ...item, ...computeCapabilities(item, actor) }))
}

// ─── LIST ─────────────────────────────────────────────────

const SEARCH_FETCH_CAP = 300
const HARD_FETCH_CAP = 500

export async function listApprovals(params: ApprovalListQuery, actor: ApprovalActor): Promise<ApprovalListResult> {
  const plans = planFor(params.scope, actor, { module: params.module, source: params.source })
  const needle = params.search?.toLowerCase() || null
  const needed = params.page * params.pageSize
  // +1 so "is there another page?" is exact rather than a guess.
  const take = Math.min(needle ? SEARCH_FETCH_CAP : needed + 1, HARD_FETCH_CAP)
  const dateTo = params.to ? new Date(params.to) : null
  if (dateTo) dateTo.setHours(23, 59, 59, 999)

  const query: AdapterQuery = {
    statuses: params.status ? [params.status] : null,
    requesterUid: null,
    dateFrom: params.from ? new Date(params.from) : null,
    dateTo,
    order: params.sort === 'oldest' ? 'asc' : 'desc',
    take,
  }

  const warnings: string[] = []
  const batches = await Promise.all(
    plans.map((plan) =>
      safely(plan.source, warnings, () => ADAPTERS[plan.source].list({ ...query, requesterUid: plan.requesterUid }), [] as AdapterItem[]),
    ),
  )

  let merged = batches.flat()
  if (needle) merged = merged.filter((i) => matchesSearch(i, needle))
  const sign = params.sort === 'oldest' ? 1 : -1
  merged.sort((a, b) => sign * (sortKey(a) - sortKey(b)))

  const start = (params.page - 1) * params.pageSize
  const pageItems = merged.slice(start, start + params.pageSize)
  const hasMore = merged.length > start + params.pageSize

  await fillNames(pageItems)
  await backfillDecisions(pageItems).catch((err) =>
    logger.error({ err }, '[approvalHub] could not backfill decision notes from the audit trail'),
  )

  return {
    items: finalize(pageItems, actor),
    page: params.page,
    pageSize: params.pageSize,
    hasMore,
    warnings,
  }
}

// ─── SUMMARY / BADGE ──────────────────────────────────────

function addCounts(into: StatusCounts, from: StatusCounts): void {
  for (const s of APPROVAL_STATUSES) into[s] += from[s]
}

export async function getSummary(scope: ApprovalScope, actor: ApprovalActor): Promise<ApprovalSummary> {
  const warnings: string[] = []
  const reviewable = new Set(reviewableSources(actor.role))

  const perSource = await Promise.all(
    APPROVAL_SOURCES.map(async (source) => {
      const adapter = ADAPTERS[source]
      const isReviewable = reviewable.has(source)
      const [all, mine] = await Promise.all([
        isReviewable ? safely(source, warnings, () => adapter.counts(null), emptyCounts()) : Promise.resolve(emptyCounts()),
        safely(source, warnings, () => adapter.counts(actor.uid), emptyCounts()),
      ])
      return { source, isReviewable, all, mine }
    }),
  )

  const byStatus = emptyCounts()
  const pendingByModule: Partial<Record<ApprovalModule, number>> = {}
  let awaitingMyReview = 0
  let myPending = 0

  for (const row of perSource) {
    const meta = APPROVAL_SOURCE_META[row.source]
    myPending += row.mine.PENDING
    if (row.isReviewable) {
      awaitingMyReview += Math.max(0, row.all.PENDING - (meta.blockSelfReview ? row.mine.PENDING : 0))
    }

    const chosen =
      scope === 'mine' ? row.mine : scope === 'review' ? (row.isReviewable ? row.all : null) : row.isReviewable ? row.all : row.mine
    if (!chosen) continue
    addCounts(byStatus, chosen)
    if (chosen.PENDING > 0) {
      pendingByModule[meta.module] = (pendingByModule[meta.module] ?? 0) + chosen.PENDING
    }
  }

  return {
    scope,
    byStatus,
    pendingByModule,
    awaitingMyReview,
    myPending,
    canReview: reviewable.size > 0,
    warnings,
  }
}

/** Lightweight count for the sidebar badge — reviewable sources only. */
export async function getBadgeCount(actor: ApprovalActor): Promise<number> {
  const sources = reviewableSources(actor.role)
  if (sources.length === 0) return 0
  const warnings: string[] = []
  const rows = await Promise.all(
    sources.map(async (source) => {
      const meta = APPROVAL_SOURCE_META[source]
      const adapter = ADAPTERS[source]
      const [all, mine] = await Promise.all([
        safely(source, warnings, () => adapter.counts(null), emptyCounts()),
        meta.blockSelfReview ? safely(source, warnings, () => adapter.counts(actor.uid), emptyCounts()) : Promise.resolve(emptyCounts()),
      ])
      return Math.max(0, all.PENDING - mine.PENDING)
    }),
  )
  return rows.reduce((a, b) => a + b, 0)
}

// ─── DETAIL ───────────────────────────────────────────────

export async function getApproval(source: ApprovalSource, id: string, actor: ApprovalActor): Promise<ApprovalItem> {
  const item = await ADAPTERS[source].get(id)
  if (!item) throw Object.assign(new Error('Request not found.'), { status: 404 })

  // Same visibility rule as the list: reviewers see everything in their
  // modules, everyone else only their own submissions.
  const meta = APPROVAL_SOURCE_META[source]
  const isMine = !!item.requester.uid && item.requester.uid === actor.uid
  if (!canReviewSource(actor.role, meta) && !isMine) {
    throw Object.assign(new Error('You do not have access to this request.'), { status: 403 })
  }

  await fillNames([item])
  await backfillDecisions([item]).catch(() => undefined)
  return finalize([item], actor)[0]!
}

// ─── DECISIONS ────────────────────────────────────────────

const PAST_TENSE: Record<ApprovalAction, string> = {
  approve: 'approved',
  reject: 'rejected',
  return: 'returned',
  cancel: 'cancelled',
}

function httpError(message: string, status: number): Error & { status: number } {
  return Object.assign(new Error(message), { status })
}

async function notifyRequester(item: AdapterItem, action: ApprovalAction, actor: ApprovalActor, notes?: string) {
  const uid = item.requester.uid
  if (!uid || uid === actor.uid || action === 'cancel') return

  const verb =
    action === 'approve'
      ? 'approved'
      : action === 'return'
        ? 'sent back for changes'
        : item.source === 'purchase_order'
          ? 'cancelled'
          : 'declined'
  const title = `${item.typeLabel} ${verb}`
  const body = `“${item.title}” was ${verb}.${notes ? ` Note: ${notes}` : ''}`.slice(0, 240)

  await Promise.allSettled([
    sendToUser(uid, { title, body, clickAction: '/approvals', tag: `approval_${item.key}` }),
    notificationFeedService.pushToFeed(uid, {
      title,
      body,
      type: action === 'approve' ? 'SUCCESS' : 'WARNING',
      category: 'approvals',
      actionUrl: '/approvals',
    }),
  ])
}

export async function decide(
  source: ApprovalSource,
  id: string,
  action: ApprovalAction,
  actor: ApprovalActor,
  input: DecisionInput = {},
): Promise<{ key: string }> {
  const adapter = ADAPTERS[source]
  const meta = APPROVAL_SOURCE_META[source]

  const item = await adapter.get(id)
  if (!item) throw httpError('Request not found.', 404)
  if (item.status !== 'PENDING') {
    throw httpError(`This request is already ${APPROVAL_STATUS_CONFIG[item.status].label.toLowerCase()}.`, 409)
  }

  const { capabilities } = computeCapabilities(item, actor)
  const allowed =
    action === 'approve' ? capabilities.canApprove
    : action === 'reject' ? capabilities.canReject
    : action === 'return' ? capabilities.canReturn
    : capabilities.canCancel

  if (!allowed) {
    if (action === 'reject' && !meta.reject) throw httpError('This type of request cannot be rejected.', 400)
    if (action === 'return' && !meta.return) throw httpError('This type of request cannot be returned.', 400)
    if (action === 'cancel' && !meta.requesterCanCancel) throw httpError('This type of request cannot be withdrawn.', 400)
    throw httpError(
      capabilities.blockedReason ??
        (action === 'cancel'
          ? 'Only the person who submitted a request can withdraw it.'
          : 'You do not have permission to take this action on this request.'),
      403,
    )
  }

  const notes = input.notes?.trim() || undefined
  if ((action === 'reject' || action === 'return') && meta.reasonRequired && !notes) {
    throw httpError('A reason is required so the requester knows what to change.', 400)
  }

  const decision: DecisionInput = { ...(notes ? { notes } : {}), ...(input.paidImmediately !== undefined ? { paidImmediately: input.paidImmediately } : {}) }

  if (action === 'approve') {
    await adapter.approve(id, actor, decision)
  } else if (action === 'reject') {
    if (!adapter.reject) throw httpError('This type of request cannot be rejected.', 400)
    await adapter.reject(id, actor, { ...decision, notes: notes ?? '' })
  } else if (action === 'return') {
    if (!adapter.return) throw httpError('This type of request cannot be returned.', 400)
    await adapter.return(id, actor, { ...decision, notes: notes ?? '' })
  } else {
    if (!adapter.cancel) throw httpError('This type of request cannot be withdrawn.', 400)
    await adapter.cancel(id, actor)
  }

  // The decision has already happened — a failure to record or announce it
  // must never turn into an error the reviewer would retry.
  try {
    await auditService.log({
      action: `approval.${PAST_TENSE[action]}`,
      entityType: 'Approval',
      entityId: item.key,
      actorUid: actor.uid,
      actorRole: actor.role,
      metadata: {
        context: {
          source,
          sourceId: id,
          title: item.title,
          requesterUid: item.requester.uid,
          ...(notes ? { notes } : {}),
        },
      },
    })
  } catch (err) {
    logger.error({ err, key: item.key, action }, '[approvalHub] decision succeeded but audit write failed')
  }

  if (!adapter.notifiesRequester) {
    void notifyRequester(item, action, actor, notes).catch((err) =>
      logger.error({ err, key: item.key }, '[approvalHub] requester notification failed'),
    )
  }

  logger.info({ event: 'approval.decided', key: item.key, action, actorUid: actor.uid })
  return { key: item.key }
}

export async function decideMany(
  items: ReadonlyArray<{ source: ApprovalSource; sourceId: string }>,
  action: Exclude<ApprovalAction, 'cancel'>,
  actor: ApprovalActor,
  input: DecisionInput = {},
): Promise<ApprovalBulkResult> {
  const results: ApprovalBulkResult['results'] = []
  // Sequential on purpose: several decisions touch shared rows (budget spend,
  // leave balances) and a per-item error must not abort the rest.
  for (const it of items) {
    const key = `${it.source}:${it.sourceId}`
    try {
      await decide(it.source, it.sourceId, action, actor, input)
      results.push({ key, ok: true })
    } catch (err) {
      results.push({ key, ok: false, error: err instanceof Error ? err.message : 'Could not complete this request.' })
    }
  }
  const succeeded = results.filter((r) => r.ok).length
  return { results, succeeded, failed: results.length - succeeded }
}
