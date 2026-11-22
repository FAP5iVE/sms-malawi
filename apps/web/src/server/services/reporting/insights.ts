/**
 * Deterministic insight generators. Each function turns already-computed
 * numbers into zero or more ReportInsight entries using fixed thresholds —
 * no free text, no model calls — so the same data always yields the same
 * explanation and every sentence can be traced to a number.
 */
import type { ReportInsight, AttentionItem, ReportInsightSeverity } from '@shared/types/reporting'
import { THRESHOLDS } from './thresholds'

const SEVERITY_ORDER: Record<ReportInsightSeverity, number> = {
  critical: 0,
  watch: 1,
  info: 2,
  positive: 3,
}

/** Sort most-severe first, stable otherwise. */
export function sortInsights<T extends { severity: ReportInsightSeverity }>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.item.severity] - SEVERITY_ORDER[b.item.severity] || a.index - b.index,
    )
    .map((x) => x.item)
}

const fmt = (n: number) => n.toLocaleString('en-US')
const mwk = (n: number) => `MWK ${fmt(Math.round(n))}`
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`

/** Keep insights with an actual finding; drop nulls from conditional builders. */
export function compact(items: readonly (ReportInsight | null | undefined | false)[]): ReportInsight[] {
  return sortInsights(items.filter((i): i is ReportInsight => Boolean(i)))
}

export function collectionInsight(
  collectionRate: number | null,
  outstanding: number,
  href?: string,
): ReportInsight | null {
  if (collectionRate === null) return null
  const r = THRESHOLDS.collectionRate
  if (collectionRate < r.critical) {
    return {
      key: 'collection-critical',
      severity: 'critical',
      title: `Fee collection is ${collectionRate}%`,
      detail: `${mwk(outstanding)} remains uncollected, well below the ${r.watch}% target.`,
      href,
    }
  }
  if (collectionRate < r.watch) {
    return {
      key: 'collection-watch',
      severity: 'watch',
      title: `Fee collection is ${collectionRate}%`,
      detail: `${mwk(outstanding)} outstanding; collection is below the ${r.watch}% target.`,
      href,
    }
  }
  return {
    key: 'collection-healthy',
    severity: 'positive',
    title: `Fee collection is ${collectionRate}%`,
    detail: outstanding > 0 ? `${mwk(outstanding)} still to collect.` : 'All billed fees are collected.',
    href,
  }
}

export function agingInsight(
  severeShare: number | null,
  severeAmount: number,
  href?: string,
): ReportInsight | null {
  if (severeShare === null || severeAmount <= 0) return null
  const r = THRESHOLDS.severeArrearsShare
  const severity: ReportInsightSeverity =
    severeShare >= r.critical ? 'critical' : severeShare >= r.watch ? 'watch' : 'info'
  return {
    key: 'aging-severe',
    severity,
    title: `${severeShare}% of receivables are over 60 days overdue`,
    detail: `${mwk(severeAmount)} is in the 61+ day buckets and is the hardest to recover.`,
    href,
  }
}

export function attendanceInsight(
  rate: number | null,
  lowClasses: number,
  href?: string,
): ReportInsight | null {
  if (rate === null) return null
  const r = THRESHOLDS.attendanceRate
  if (rate < r.critical) {
    return {
      key: 'attendance-critical',
      severity: 'critical',
      title: `Attendance is ${rate}%`,
      detail: `Below the ${r.critical}% minimum; ${plural(lowClasses, 'class', 'classes')} under threshold.`,
      href,
    }
  }
  if (rate < r.watch || lowClasses > 0) {
    return {
      key: 'attendance-watch',
      severity: 'watch',
      title: `Attendance is ${rate}%`,
      detail:
        lowClasses > 0
          ? `${plural(lowClasses, 'class', 'classes')} below ${r.critical}% attendance.`
          : `Below the ${r.watch}% target.`,
      href,
    }
  }
  return null
}

export function passRateInsight(
  passRate: number | null,
  weakestLabel: string | null,
  href?: string,
): ReportInsight | null {
  if (passRate === null) return null
  const r = THRESHOLDS.passRate
  if (passRate < r.critical) {
    return {
      key: 'pass-critical',
      severity: 'critical',
      title: `Pass rate is ${passRate}%`,
      detail: weakestLabel ? `${weakestLabel} has the lowest result.` : 'Below the minimum expected pass rate.',
      href,
    }
  }
  if (passRate < r.watch) {
    return {
      key: 'pass-watch',
      severity: 'watch',
      title: `Pass rate is ${passRate}%`,
      detail: weakestLabel ? `${weakestLabel} has the lowest result.` : `Below the ${r.watch}% target.`,
      href,
    }
  }
  return null
}

export function markCompletionInsight(
  completionRate: number | null,
  missing: number,
  href?: string,
): ReportInsight | null {
  if (completionRate === null) return null
  const r = THRESHOLDS.markCompletion
  if (missing <= 0) return null
  const severity: ReportInsightSeverity =
    completionRate < r.critical ? 'critical' : completionRate < r.watch ? 'watch' : 'info'
  return {
    key: 'marks-missing',
    severity,
    title: `${plural(missing, 'mark')} still missing`,
    detail: `Mark entry is ${completionRate}% complete; results cannot be finalised until the rest are entered or marked absent.`,
    href,
  }
}

export function expiryInsight(
  count: number,
  noun: string,
  lookaheadDays: number,
  href?: string,
): ReportInsight | null {
  if (count <= 0) return null
  return {
    key: `expiry-${noun}`,
    severity: 'watch',
    title: `${plural(count, noun)} expiring within ${lookaheadDays} days`,
    detail: 'Review and renew or plan replacements before the end date.',
    href,
  }
}

export function overdueInsight(
  count: number,
  noun: string,
  href?: string,
): ReportInsight | null {
  if (count <= 0) return null
  return {
    key: `overdue-${noun}`,
    severity: count >= 10 ? 'critical' : 'watch',
    title: `${plural(count, noun)} overdue`,
    detail: 'Follow up with the responsible party.',
    href,
  }
}

/** Convert insights into dashboard attention-queue rows (count optional). */
export function toAttention(insights: readonly ReportInsight[]): AttentionItem[] {
  return insights.map((i) => ({
    key: i.key,
    severity: i.severity,
    label: i.title,
    count: null,
    detail: i.detail,
    href: i.href,
  }))
}
