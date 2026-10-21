/**
 * Pure platform-operations helpers (no database access, unit-tested).
 *
 * Everything here works on rows the platform actually persists. Where a figure
 * cannot be computed (no finished deployments, nothing synced yet) the result
 * is null — never 0 — so "no data" is never shown as "all good".
 */
import { ratioPct } from '@/server/services/reporting/kpi'

export const MINUTE_MS = 60_000
export const DAY_MS = 24 * 60 * MINUTE_MS

// ── Sync freshness ──────────────────────────────────────────────────────────

export type SyncStatus = 'ok' | 'stale' | 'failing' | 'never'

export interface SyncSource {
  key: string
  label: string
  mode: 'scheduled' | 'on-demand'
  /** Older than this (minutes) counts as stale. */
  staleAfterMinutes: number
}

/**
 * Sources that feed the monitoring caches. Scheduled sources are refreshed
 * every few minutes by the cron route; on-demand sources only refresh when an
 * administrator opens monitoring, so they are allowed to be much older before
 * being called stale (otherwise a quiet weekend would read as an outage).
 */
export const SYNC_SOURCES: readonly SyncSource[] = [
  { key: 'vercel_deployments', label: 'Deployments', mode: 'scheduled', staleAfterMinutes: 30 },
  { key: 'vercel_runtime_logs', label: 'Runtime error logs', mode: 'scheduled', staleAfterMinutes: 30 },
  { key: 'vercel_analytics', label: 'Web traffic', mode: 'scheduled', staleAfterMinutes: 60 },
  { key: 'issues', label: 'Error monitoring — issues', mode: 'on-demand', staleAfterMinutes: 7 * 24 * 60 },
  { key: 'alerts', label: 'Error monitoring — alerts', mode: 'on-demand', staleAfterMinutes: 7 * 24 * 60 },
  { key: 'rollup', label: 'Error monitoring — crash-free rates', mode: 'on-demand', staleAfterMinutes: 7 * 24 * 60 },
]

export interface SyncRow {
  syncType: string
  lastSyncedAt: Date
  lastError: string | null
}

export interface SyncReportRow {
  key: string
  label: string
  mode: SyncSource['mode']
  status: SyncStatus
  lastAttemptAt: string | null
  ageMinutes: number | null
  lastError: string | null
}

/** One row per known source, in a fixed order; missing rows read "never". */
export function syncFreshness(rows: readonly SyncRow[], now: Date, sources: readonly SyncSource[] = SYNC_SOURCES): SyncReportRow[] {
  const byType = new Map(rows.map((r) => [r.syncType, r]))
  return sources.map((s) => {
    const row = byType.get(s.key)
    if (!row) {
      return { key: s.key, label: s.label, mode: s.mode, status: 'never', lastAttemptAt: null, ageMinutes: null, lastError: null }
    }
    const age = Math.max(0, Math.round((now.getTime() - row.lastSyncedAt.getTime()) / MINUTE_MS))
    const status: SyncStatus = row.lastError ? 'failing' : age > s.staleAfterMinutes ? 'stale' : 'ok'
    return {
      key: s.key,
      label: s.label,
      mode: s.mode,
      status,
      lastAttemptAt: row.lastSyncedAt.toISOString(),
      ageMinutes: age,
      lastError: row.lastError ? truncate(row.lastError, 240) : null,
    }
  })
}

export function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`
}

// ── Deployments ─────────────────────────────────────────────────────────────

export interface DeploymentRow {
  deploymentId: string
  state: string
  target: string | null
  errorMessage: string | null
  createdAtVercel: Date
  readyAtVercel: Date | null
}

/** States that mean the build has finished one way or the other. */
const SUCCESS_STATES = new Set(['READY'])
const FAILURE_STATES = new Set(['ERROR'])

export interface DeploymentSummary {
  recorded: number
  failed: number
  failureRate: number | null
  latestProduction: { state: string; at: Date } | null
  lastSuccessfulProductionAt: Date | null
}

/**
 * Failure rate = failed ÷ (ready + failed). Cancelled, queued and in-flight
 * deployments are neither a success nor a failure and are left out of the rate.
 */
export function summariseDeployments(rows: readonly DeploymentRow[]): DeploymentSummary {
  const sorted = [...rows].sort((a, b) => b.createdAtVercel.getTime() - a.createdAtVercel.getTime())
  const failed = sorted.filter((r) => FAILURE_STATES.has(r.state)).length
  const ready = sorted.filter((r) => SUCCESS_STATES.has(r.state)).length
  const production = sorted.filter((r) => r.target === 'production')
  const latest = production[0]
  const lastGood = production.find((r) => SUCCESS_STATES.has(r.state))
  return {
    recorded: sorted.length,
    failed,
    failureRate: ratioPct(failed, failed + ready),
    latestProduction: latest ? { state: latest.state, at: latest.createdAtVercel } : null,
    lastSuccessfulProductionAt: lastGood ? (lastGood.readyAtVercel ?? lastGood.createdAtVercel) : null,
  }
}

// ── Runtime errors ──────────────────────────────────────────────────────────

export interface ErrorLogRow {
  level: string
  timestamp: Date
  requestPath: string | null
  responseStatusCode: number | null
}

export const ERROR_LEVELS: readonly string[] = ['error', 'fatal']

/** Collapse ids in a path so /students/123 and /students/456 are one route. */
export function normalisePath(path: string | null): string {
  if (!path) return '(no request path)'
  const clean = path.split('?')[0] ?? path
  return clean
    .split('/')
    .map((seg) => (/^[0-9a-f]{8,}$/i.test(seg) || /^\d+$/.test(seg) || /^c[a-z0-9]{20,}$/i.test(seg) ? ':id' : seg))
    .join('/') || '/'
}

export function errorsByHour(rows: readonly ErrorLogRow[], now: Date, hours = 24): { hour: string; label: string; count: number }[] {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours())
  const buckets: { hour: string; label: string; count: number }[] = []
  for (let i = hours - 1; i >= 0; i -= 1) {
    const start = new Date(end - i * 60 * MINUTE_MS)
    buckets.push({ hour: start.toISOString(), label: `${String(start.getUTCHours()).padStart(2, '0')}:00`, count: 0 })
  }
  const first = new Date(buckets[0]?.hour ?? now).getTime()
  for (const r of rows) {
    if (!ERROR_LEVELS.includes(r.level)) continue
    const t = r.timestamp.getTime()
    if (t < first || t >= end + 60 * MINUTE_MS) continue
    const idx = Math.floor((t - first) / (60 * MINUTE_MS))
    const b = buckets[idx]
    if (b) b.count += 1
  }
  return buckets
}

export function topErrorPaths(rows: readonly ErrorLogRow[], limit = 8): { path: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    if (!ERROR_LEVELS.includes(r.level)) continue
    const p = normalisePath(r.requestPath)
    counts.set(p, (counts.get(p) ?? 0) + 1)
  }
  return Array.from(counts, ([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path))
    .slice(0, limit)
}

// ── Pending-approval backlog ────────────────────────────────────────────────

export interface PendingRow {
  entityType: string
  createdAt: Date
  expiresAt: Date | null
}

export interface BacklogSummary {
  pending: number
  pastExpiry: number
  oldestPendingDays: number | null
  byType: { label: string; count: number }[]
}

export function summariseBacklog(rows: readonly PendingRow[], now: Date): BacklogSummary {
  const byType = new Map<string, number>()
  let pastExpiry = 0
  let oldest: number | null = null
  for (const r of rows) {
    byType.set(r.entityType, (byType.get(r.entityType) ?? 0) + 1)
    if (r.expiresAt && r.expiresAt.getTime() < now.getTime()) pastExpiry += 1
    const age = Math.max(0, Math.floor((now.getTime() - r.createdAt.getTime()) / DAY_MS))
    if (oldest === null || age > oldest) oldest = age
  }
  return {
    pending: rows.length,
    pastExpiry,
    oldestPendingDays: oldest,
    byType: Array.from(byType, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  }
}

// ── Error-monitoring issues ─────────────────────────────────────────────────

export interface IssueRow {
  status: string
  isUptimeIssue: boolean
  level: string
  firstSeenAt: Date | null
}

export interface IssueSummary {
  unresolved: number
  activeOutages: number
  newLast7d: number
  oldestUnresolvedDays: number | null
  byLevel: { label: string; count: number }[]
}

export function summariseIssues(rows: readonly IssueRow[], now: Date): IssueSummary {
  const open = rows.filter((r) => r.status === 'unresolved')
  const errors = open.filter((r) => !r.isUptimeIssue)
  const byLevel = new Map<string, number>()
  errors.forEach((r) => byLevel.set(r.level, (byLevel.get(r.level) ?? 0) + 1))
  const weekAgo = now.getTime() - 7 * DAY_MS
  const ages = errors.flatMap((r) => (r.firstSeenAt ? [Math.max(0, Math.floor((now.getTime() - r.firstSeenAt.getTime()) / DAY_MS))] : []))
  return {
    unresolved: errors.length,
    activeOutages: open.filter((r) => r.isUptimeIssue).length,
    newLast7d: errors.filter((r) => r.firstSeenAt && r.firstSeenAt.getTime() >= weekAgo).length,
    oldestUnresolvedDays: ages.length ? Math.max(...ages) : null,
    byLevel: Array.from(byLevel, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
  }
}

// ── What the system does not record ─────────────────────────────────────────

/**
 * Operational facts administrators often expect to see but that the platform
 * does not persist. They are shown as explicit gaps so nobody reads a missing
 * chart as a healthy system.
 */
export const NOT_RECORDED: readonly { key: string; label: string; reason: string }[] = [
  { key: 'backups', label: 'Backup history', reason: 'This system stores no record of backup runs, so run times and outcomes cannot be reported. Check the database provider’s own console.' },
  { key: 'jobs', label: 'Scheduled job run history', reason: 'Daily and periodic jobs report their result to the caller only; no run history, duration or retry count is stored.' },
  { key: 'queues', label: 'Queue depth and processing delay', reason: 'The platform does not store a job queue, so depth, retries and processing delay cannot be measured.' },
  { key: 'email', label: 'Email delivery outcomes', reason: 'Delivery webhooks are logged but not stored, so sent, bounced and failed counts are unavailable. Only whether email is configured is shown.' },
  { key: 'uptime', label: 'Uptime percentage', reason: 'Availability is probed on request, not continuously, so no uptime percentage can be calculated honestly.' },
]
