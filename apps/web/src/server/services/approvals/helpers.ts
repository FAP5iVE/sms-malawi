/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/server/services/approvals/helpers.ts
 * [PURPOSE]: Small pure helpers shared by every approval adapter — status
 *   expansion, date filters, name lookup and the item factory that fills the
 *   boilerplate fields (key, module, typeLabel, href) from the shared
 *   APPROVAL_SOURCE_META so an adapter only supplies what is specific to it.
 */

import 'server-only'
import { prisma } from '@/lib/prisma'
import {
  APPROVAL_SOURCE_META,
  APPROVAL_STATUSES,
  type ApprovalDetail,
  type ApprovalModule,
  type ApprovalPerson,
  type ApprovalSource,
  type ApprovalStatus,
} from '@shared/constants/approvals'
import type { AdapterItem, AdapterQuery, StatusCounts } from './types'

// ─── STATUS ───────────────────────────────────────────────

export function emptyCounts(): StatusCounts {
  return { PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0, EXPIRED: 0 }
}

/**
 * Turns the unified statuses a caller asked for into the module's own
 * status values, using the adapter's mapping table. An empty result means
 * the source can never match — the adapter should return [] without a query.
 */
export function expandStatuses<S extends string>(
  requested: readonly ApprovalStatus[] | null,
  table: Record<ApprovalStatus, readonly S[]>,
): S[] {
  const wanted = requested ?? APPROVAL_STATUSES
  const out: S[] = []
  for (const status of wanted) out.push(...table[status])
  return out
}

/** Folds `groupBy(status)` rows into unified-status counts. */
export function tally<S extends string>(
  rows: ReadonlyArray<{ status: S; _count: { _all: number } }>,
  table: Record<ApprovalStatus, readonly S[]>,
): StatusCounts {
  const counts = emptyCounts()
  for (const row of rows) {
    for (const status of APPROVAL_STATUSES) {
      if ((table[status] as readonly string[]).includes(row.status)) {
        counts[status] += row._count._all
        break
      }
    }
  }
  return counts
}

export function dateFilter(q: AdapterQuery): { gte?: Date; lte?: Date } | undefined {
  if (!q.dateFrom && !q.dateTo) return undefined
  return {
    ...(q.dateFrom ? { gte: q.dateFrom } : {}),
    ...(q.dateTo ? { lte: q.dateTo } : {}),
  }
}

// ─── FORMATTING ───────────────────────────────────────────

export function money(value: unknown): string {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return `MWK ${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

export function shortDate(d: Date | null | undefined): string | null {
  if (!d) return null
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function humanize(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ')
}

export function fullName(first: string | null | undefined, last: string | null | undefined): string {
  return [first, last].filter(Boolean).join(' ').trim()
}

export function person(uid: string | null, name = '', role: string | null = null): ApprovalPerson {
  return { uid, name, role }
}

/** Builds the label/value list, dropping empty entries. */
export function detailList(rows: ReadonlyArray<readonly [string, string | number | null | undefined]>): ApprovalDetail[] {
  const out: ApprovalDetail[] = []
  for (const [label, value] of rows) {
    if (value === null || value === undefined) continue
    const text = String(value).trim()
    if (text) out.push({ label, value: text })
  }
  return out
}

// ─── NAME LOOKUP ──────────────────────────────────────────

/**
 * uid → display name. Staff first (by far the common requester), then
 * students (by Firebase uid) for the few flows students can start.
 */
export async function lookupNames(uids: ReadonlyArray<string | null | undefined>): Promise<Map<string, string>> {
  const unique = Array.from(new Set(uids.filter((u): u is string => !!u)))
  const names = new Map<string, string>()
  if (unique.length === 0) return names

  const staff = await prisma.staffProfile.findMany({
    where: { uid: { in: unique } },
    select: { uid: true, firstName: true, lastName: true },
  })
  for (const s of staff) names.set(s.uid, fullName(s.firstName, s.lastName))

  const missing = unique.filter((u) => !names.has(u))
  if (missing.length > 0) {
    const students = await prisma.student.findMany({
      where: { firebaseUid: { in: missing } },
      select: { firebaseUid: true, firstName: true, lastName: true },
    })
    for (const s of students) {
      if (s.firebaseUid) names.set(s.firebaseUid, fullName(s.firstName, s.lastName))
    }
  }
  return names
}

// ─── ITEM FACTORY ─────────────────────────────────────────

export interface ItemFields {
  sourceId: string
  /** Overrides the source's default module (pending actions span several). */
  module?: ApprovalModule
  title: string
  summary?: string | null
  status: ApprovalStatus
  sourceStatus: string
  requester: ApprovalPerson
  amount?: number | null
  details?: ApprovalDetail[]
  payload?: Record<string, unknown> | null
  createdAt: Date
  decidedAt?: Date | null
  decidedBy?: ApprovalPerson | null
  decisionNotes?: string | null
  expiresAt?: Date | null
  href?: string
}

export function makeItem(source: ApprovalSource, f: ItemFields): AdapterItem {
  const meta = APPROVAL_SOURCE_META[source]
  return {
    key: `${source}:${f.sourceId}`,
    source,
    sourceId: f.sourceId,
    module: f.module ?? meta.module,
    typeLabel: meta.typeLabel,
    title: f.title,
    summary: f.summary ?? null,
    status: f.status,
    sourceStatus: f.sourceStatus,
    requester: f.requester,
    amount: f.amount ?? null,
    details: f.details ?? [],
    payload: f.payload ?? null,
    createdAt: f.createdAt.toISOString(),
    decidedAt: f.decidedAt ? f.decidedAt.toISOString() : null,
    decidedBy: f.decidedBy ?? null,
    decisionNotes: f.decisionNotes ?? null,
    expiresAt: f.expiresAt ? f.expiresAt.toISOString() : null,
    href: f.href ?? meta.href,
  }
}

export function httpError(message: string, status: number): Error & { status: number } {
  return Object.assign(new Error(message), { status })
}
