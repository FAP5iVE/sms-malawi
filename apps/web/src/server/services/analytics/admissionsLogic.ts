/** Pure admissions-pipeline maths (no database access, unit-tested). */
import { daysBetween, mean, median, ratioPct } from '@/server/services/reporting/kpi'

export const PENDING_AGE_BUCKETS = ['0–3 days', '4–7 days', '8–14 days', '15–30 days', 'Over 30 days'] as const

export function pendingAgeBucket(ageDays: number): (typeof PENDING_AGE_BUCKETS)[number] {
  if (ageDays <= 3) return '0–3 days'
  if (ageDays <= 7) return '4–7 days'
  if (ageDays <= 14) return '8–14 days'
  if (ageDays <= 30) return '15–30 days'
  return 'Over 30 days'
}

/** Audit actions emitted by applicationService.updateApplicationStatus. */
export const DECISION_ACTIONS = ['application.approved', 'application.denied', 'application.reviewed'] as const

export interface DecisionEvent {
  applicationId: string
  action: string
  at: Date
}

/** Earliest decision event per application. */
export function firstDecisions(events: readonly DecisionEvent[]): Map<string, Date> {
  const m = new Map<string, Date>()
  for (const e of events) {
    if (!(DECISION_ACTIONS as readonly string[]).includes(e.action)) continue
    const cur = m.get(e.applicationId)
    if (!cur || e.at < cur) m.set(e.applicationId, e.at)
  }
  return m
}

/** Earliest approval event per application. */
export function firstApprovals(events: readonly DecisionEvent[]): Map<string, Date> {
  const m = new Map<string, Date>()
  for (const e of events) {
    if (e.action !== 'application.approved') continue
    const cur = m.get(e.applicationId)
    if (!cur || e.at < cur) m.set(e.applicationId, e.at)
  }
  return m
}

export interface PipelineApp {
  id: string
  status: string
  createdAt: Date
  /** For ADMITTED applications this is the conversion time (studentService overwrites it). */
  reviewedAt: Date | null
}

export interface PipelineRates {
  approvalRate: number | null
  denialRate: number | null
  admissionRate: number | null
  conversionRate: number | null
}

export function pipelineRates(counts: Record<string, number>): PipelineRates {
  const n = (s: string) => counts[s] ?? 0
  const accepted = n('APPROVED') + n('AWAITING_ADMISSION') + n('ADMITTED')
  const denied = n('DENIED')
  const decided = accepted + denied
  const total = decided + n('PENDING')
  return {
    approvalRate: ratioPct(accepted, decided),
    denialRate: ratioPct(denied, decided),
    admissionRate: ratioPct(n('ADMITTED'), accepted),
    conversionRate: ratioPct(n('ADMITTED'), total),
  }
}

export function reviewTimes(
  apps: readonly PipelineApp[],
  decisions: ReadonlyMap<string, Date>,
): { avg: number | null; median: number | null } {
  const days = apps
    .map((a) => {
      const d = decisions.get(a.id)
      return d ? daysBetween(a.createdAt, d) : null
    })
    .filter((d): d is number => d !== null && d >= 0)
  return { avg: mean(days), median: median(days) }
}

export function approvalToAdmissionDays(
  apps: readonly PipelineApp[],
  approvals: ReadonlyMap<string, Date>,
): number | null {
  const days = apps
    .filter((a) => a.status === 'ADMITTED' && a.reviewedAt)
    .map((a) => {
      const approved = approvals.get(a.id)
      return approved && a.reviewedAt ? daysBetween(approved, a.reviewedAt) : null
    })
    .filter((d): d is number => d !== null && d >= 0)
  return mean(days)
}

/** Count by label, biggest first; everything beyond `top` is folded into "Other". */
export function topWithOther(
  values: readonly (string | null | undefined)[],
  top = 8,
): { label: string; count: number }[] {
  const m = new Map<string, number>()
  for (const v of values) {
    const k = v?.trim()
    if (!k) continue
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  const sorted = Array.from(m.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  if (sorted.length <= top) return sorted
  const head = sorted.slice(0, top)
  const other = sorted.slice(top).reduce((s, r) => s + r.count, 0)
  return [...head, { label: 'Other', count: other }]
}
