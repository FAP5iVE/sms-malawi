/**
 * Pure digital-library usage maths (no database access, unit-tested).
 *
 * A catalogue row proves a resource exists, not that anyone used it. Usage here
 * is counted only from recorded view events (DigitalResourceView), and every
 * figure says so. Viewer identities are used only to count distinct viewers —
 * they never appear in a result.
 */
import { ratioPct } from '@/server/services/reporting/kpi'

/** A viewer opening the same resource again within this window is one view, not several. */
export const VIEW_DEDUPE_MINUTES = 10
export const DIGITAL_LIST_CAP = 10

export interface DigitalResourceRow {
  id: string
  title: string
  type: string
  subject: string | null
  form: number | null
  approved: boolean
  createdAt: Date
  approvedAt: Date | null
  /** Set when the resource was rejected; an unapproved row without it is still awaiting a decision. */
  rejectedAt?: Date | null
}

export interface DigitalViewRow {
  resourceId: string
  viewerUid: string
  viewedAt: Date
}

export interface UsageRow {
  id: string
  title: string
  type: string
  subject: string | null
  form: number | null
  views: number
  uniqueViewers: number
  lastViewedAt: string | null
  approvedAt: string | null
}

export interface PendingRow {
  id: string
  title: string
  type: string
  subject: string | null
  form: number | null
  submittedAt: string
  ageDays: number
}

export interface GroupRow {
  key: string
  label: string
  resources: number
  approved: number
  pending: number
  rejected: number
  views: number
  /** Distinct resources in the group that were viewed at least once in the window. */
  resourcesViewed: number
}

export interface TrendPoint {
  key: string
  label: string
  views: number
}

export interface DigitalUsage {
  catalogue: { total: number; approved: number; pending: number; rejected: number; oldestPendingDays: number | null }
  usage: {
    views: number
    uniqueViewers: number
    resourcesViewed: number
    /** Approved resources viewed at least once ÷ approved resources; null when none are approved. */
    usageRate: number | null
    /** Approved resources with no recorded view in the window. */
    approvedNotViewed: number
  }
  byType: GroupRow[]
  bySubject: GroupRow[]
  byForm: GroupRow[]
  trend: TrendPoint[]
  trendUnit: 'day' | 'week'
  mostUsed: UsageRow[]
  leastUsed: UsageRow[]
  pending: PendingRow[]
}

const DAY = 86_400_000

const isoDay = (d: Date) => d.toISOString().slice(0, 10)

/** Monday (UTC) of the week containing `d`. */
function weekStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const back = (x.getUTCDay() + 6) % 7
  return new Date(x.getTime() - back * DAY)
}

const label = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** Whether a view should be recorded, given the viewer's most recent view of the same resource. */
export function isRepeatView(lastViewedAt: Date | null | undefined, now: Date): boolean {
  if (!lastViewedAt) return false
  return now.getTime() - lastViewedAt.getTime() < VIEW_DEDUPE_MINUTES * 60_000
}

/** Empty trend buckets from `from` to `to`, by day for up to 31 days and by week beyond that. */
export function trendBuckets(from: Date, to: Date): { unit: 'day' | 'week'; keys: { key: string; label: string }[] } {
  const spanDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY))
  const unit = spanDays <= 31 ? 'day' : 'week'
  const keys: { key: string; label: string }[] = []
  if (unit === 'day') {
    for (let t = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()); t <= to.getTime(); t += DAY) {
      const d = new Date(t)
      keys.push({ key: isoDay(d), label: label(d) })
    }
  } else {
    for (let t = weekStart(from).getTime(); t <= to.getTime(); t += 7 * DAY) {
      const d = new Date(t)
      keys.push({ key: isoDay(d), label: `Week of ${label(d)}` })
    }
  }
  return { unit, keys }
}

function bucketKey(d: Date, unit: 'day' | 'week'): string {
  return unit === 'day' ? isoDay(d) : isoDay(weekStart(d))
}

function group(
  resources: readonly DigitalResourceRow[],
  views: ReadonlyMap<string, { views: number }>,
  keyOf: (r: DigitalResourceRow) => { key: string; label: string },
): GroupRow[] {
  const m = new Map<string, GroupRow>()
  for (const r of resources) {
    const { key, label: l } = keyOf(r)
    const g = m.get(key) ?? { key, label: l, resources: 0, approved: 0, pending: 0, rejected: 0, views: 0, resourcesViewed: 0 }
    g.resources += 1
    if (r.approved) g.approved += 1
    else if (r.rejectedAt) g.rejected += 1
    else g.pending += 1
    const v = views.get(r.id)?.views ?? 0
    g.views += v
    if (v > 0) g.resourcesViewed += 1
    m.set(key, g)
  }
  return [...m.values()].sort((a, b) => b.views - a.views || b.resources - a.resources || a.label.localeCompare(b.label))
}

const TYPE_LABEL: Record<string, string> = {
  EBOOK: 'eBook',
  PAST_PAPER: 'Past paper',
  REFERENCE: 'Reference',
  STUDY_GUIDE: 'Study guide',
}

export function summariseDigitalUsage(
  resources: readonly DigitalResourceRow[],
  allViews: readonly DigitalViewRow[],
  window: { from: Date; to: Date },
  now: Date = window.to,
): DigitalUsage {
  const ids = new Set(resources.map((r) => r.id))
  const inWindow = allViews.filter(
    (v) => ids.has(v.resourceId) && v.viewedAt.getTime() >= window.from.getTime() && v.viewedAt.getTime() <= window.to.getTime(),
  )

  const per = new Map<string, { views: number; viewers: Set<string>; last: Date }>()
  for (const v of inWindow) {
    const p = per.get(v.resourceId) ?? { views: 0, viewers: new Set<string>(), last: v.viewedAt }
    p.views += 1
    p.viewers.add(v.viewerUid)
    if (v.viewedAt.getTime() > p.last.getTime()) p.last = v.viewedAt
    per.set(v.resourceId, p)
  }

  const usageRow = (r: DigitalResourceRow): UsageRow => {
    const p = per.get(r.id)
    return {
      id: r.id,
      title: r.title,
      type: r.type,
      subject: r.subject,
      form: r.form,
      views: p?.views ?? 0,
      uniqueViewers: p?.viewers.size ?? 0,
      lastViewedAt: p ? p.last.toISOString() : null,
      approvedAt: r.approvedAt ? r.approvedAt.toISOString() : null,
    }
  }

  const approved = resources.filter((r) => r.approved)
  const pendingRows = resources.filter((r) => !r.approved && !r.rejectedAt)
  const rejectedRows = resources.filter((r) => !r.approved && !!r.rejectedAt)
  const viewedApproved = approved.filter((r) => (per.get(r.id)?.views ?? 0) > 0)

  const pending: PendingRow[] = pendingRows
    .map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      subject: r.subject,
      form: r.form,
      submittedAt: r.createdAt.toISOString(),
      ageDays: Math.max(0, Math.floor((now.getTime() - r.createdAt.getTime()) / DAY)),
    }))
    .sort((a, b) => b.ageDays - a.ageDays || a.title.localeCompare(b.title))

  const { unit, keys } = trendBuckets(window.from, window.to)
  const trend = new Map(keys.map((k) => [k.key, { ...k, views: 0 }]))
  for (const v of inWindow) {
    const t = trend.get(bucketKey(v.viewedAt, unit))
    if (t) t.views += 1
  }

  // Least used: approved resources only (an unapproved one cannot be used yet), fewest views first, oldest first on ties.
  const leastUsed = approved
    .map(usageRow)
    .sort((a, b) => a.views - b.views || (a.approvedAt ?? '').localeCompare(b.approvedAt ?? '') || a.title.localeCompare(b.title))
    .slice(0, DIGITAL_LIST_CAP)

  return {
    catalogue: {
      total: resources.length,
      approved: approved.length,
      pending: pendingRows.length,
      rejected: rejectedRows.length,
      oldestPendingDays: pending[0]?.ageDays ?? null,
    },
    usage: {
      views: inWindow.length,
      uniqueViewers: new Set(inWindow.map((v) => v.viewerUid)).size,
      resourcesViewed: per.size,
      usageRate: ratioPct(viewedApproved.length, approved.length),
      approvedNotViewed: approved.length - viewedApproved.length,
    },
    byType: group(resources, per, (r) => ({ key: r.type, label: TYPE_LABEL[r.type] ?? r.type })),
    bySubject: group(resources, per, (r) => ({ key: r.subject ?? '', label: r.subject ?? 'No subject' })).slice(0, 15),
    byForm: group(resources, per, (r) => ({ key: r.form === null ? '' : String(r.form), label: r.form === null ? 'All forms' : `Form ${r.form}` }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    trend: [...trend.values()],
    trendUnit: unit,
    mostUsed: [...per.keys()]
      .map((id) => resources.find((r) => r.id === id))
      .filter((r): r is DigitalResourceRow => r !== undefined)
      .map(usageRow)
      .sort((a, b) => b.views - a.views || b.uniqueViewers - a.uniqueViewers || a.title.localeCompare(b.title))
      .slice(0, DIGITAL_LIST_CAP),
    leastUsed,
    pending: pending.slice(0, 50),
  }
}

export interface StockBook {
  id: string
  title: string
  author: string
  category: string
  totalCopies: number
  availableCopies: number
}

export interface OpenLoan {
  bookId: string
  dueDate: Date
}

export interface StockCategoryRow {
  category: string
  titles: number
  copies: number
  available: number
  onLoan: number
  /** Copies neither on the shelf nor on loan — damaged or otherwise withdrawn. */
  offShelf: number
  availabilityRate: number | null
}

export interface UnavailableTitleRow {
  bookId: string
  title: string
  author: string
  category: string
  copies: number
  onLoan: number
  overdue: number
}

/** Physical stock: copies, what is on loan, and what cannot be borrowed right now. */
export function summariseStock(books: readonly StockBook[], open: readonly OpenLoan[], now: Date) {
  const loansByBook = new Map<string, { onLoan: number; overdue: number }>()
  for (const l of open) {
    const x = loansByBook.get(l.bookId) ?? { onLoan: 0, overdue: 0 }
    x.onLoan += 1
    if (l.dueDate.getTime() < now.getTime()) x.overdue += 1
    loansByBook.set(l.bookId, x)
  }

  let copies = 0
  let available = 0
  let onLoan = 0
  const byCategory = new Map<string, StockCategoryRow>()
  const unavailable: UnavailableTitleRow[] = []
  for (const b of books) {
    const loan = loansByBook.get(b.id) ?? { onLoan: 0, overdue: 0 }
    copies += b.totalCopies
    available += b.availableCopies
    onLoan += loan.onLoan
    const c = byCategory.get(b.category) ?? { category: b.category, titles: 0, copies: 0, available: 0, onLoan: 0, offShelf: 0, availabilityRate: null }
    c.titles += 1
    c.copies += b.totalCopies
    c.available += b.availableCopies
    c.onLoan += loan.onLoan
    byCategory.set(b.category, c)
    if (b.totalCopies > 0 && b.availableCopies <= 0) {
      unavailable.push({ bookId: b.id, title: b.title, author: b.author, category: b.category, copies: b.totalCopies, onLoan: loan.onLoan, overdue: loan.overdue })
    }
  }
  const rows = [...byCategory.values()].map((c) => ({
    ...c,
    offShelf: Math.max(0, c.copies - c.available - c.onLoan),
    availabilityRate: ratioPct(c.available, c.copies),
  }))
  rows.sort((a, b) => (a.availabilityRate ?? 101) - (b.availabilityRate ?? 101) || a.category.localeCompare(b.category))
  unavailable.sort((a, b) => b.overdue - a.overdue || b.onLoan - a.onLoan || a.title.localeCompare(b.title))

  return {
    titles: books.length,
    copies,
    available,
    onLoan,
    offShelf: Math.max(0, copies - available - onLoan),
    availabilityRate: ratioPct(available, copies),
    byCategory: rows,
    unavailable,
  }
}
