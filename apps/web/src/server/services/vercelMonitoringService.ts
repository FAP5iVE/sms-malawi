/**
 * apps/web/src/server/services/vercelMonitoringService.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Vercel-native platform monitoring — deployments, runtime
 *   error logs, Web Analytics traffic, and DIY alerts — powering the
 *   "Vercel Platform" tab of /monitoring. Separate from monitoringService
 *   (Sentry). Built entirely around Vercel's free REST APIs: Log Drains,
 *   built-in Alerts (Observability Plus), and Account Webhooks are all
 *   Pro-plan-only (see docs/vercel-native-monitoring-research.md §1.1,
 *   §1.2, §1.5) so nothing here depends on Vercel pushing us anything —
 *   we poll, cache in our own tables, and compute our own alerts.
 *
 *   Every env var this file needs (VERCEL_API_TOKEN, VERCEL_PROJECT_ID)
 *   is optional (env.ts) — `isConfigured()` gates every export so an
 *   unconfigured install degrades to "not set up yet" instead of 500ing
 *   the rest of /monitoring, mirroring the mistake already fixed once for
 *   Sentry (missing env vars breaking unrelated routes).
 * [DEPENDS ON]: prisma, env.ts (VERCEL_API_TOKEN, VERCEL_PROJECT_ID,
 *   VERCEL_TEAM_ID), ./syncState (shared on-demand sync primitive)
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { env } from '@/lib/env'
import { ensureFresh } from './syncState'

const VERCEL_BASE = 'https://api.vercel.com'

function isConfigured(): boolean {
  return Boolean(env.VERCEL_API_TOKEN && env.VERCEL_PROJECT_ID)
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const qp = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) qp.set(key, String(value))
  }
  // Team-scoped tokens need this on every call; personal-account tokens
  // must NOT send it (research §1: "For projects owned by your personal
  // account, omit teamId"). env.VERCEL_TEAM_ID being unset covers that.
  if (env.VERCEL_TEAM_ID) qp.set('teamId', env.VERCEL_TEAM_ID)
  return qp.toString()
}

// ── Low-level authenticated fetch wrapper — mirrors sentryFetch's shape ──
async function vercelFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${VERCEL_BASE}${path}`, {
    headers: { Authorization: `Bearer ${env.VERCEL_API_TOKEN}` },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw Object.assign(new Error(`Vercel API ${res.status}: ${path}`), { status: res.status, body })
  }
  return res.json() as Promise<T>
}

// ── Deployments ──────────────────────────────────────────────────────────
interface RawVercelDeployment {
  uid: string
  state?: string        // BUILDING | ERROR | INITIALIZING | QUEUED | READY | CANCELED | BLOCKED
  readyState?: string   // some API versions use this name instead of `state`
  target?: string | null
  url?: string
  createdAt?: number
  ready?: number
  errorMessage?: string
}

// Deployments list + status polling. No data-loss risk if this runs late
// (research §1.12 — deployment history persists on Vercel's side, unlike
// runtime logs), so this stays on the plain on-demand/lazy pattern.
export async function syncDeployments() {
  if (!isConfigured()) return
  const res = await vercelFetch<{ deployments: RawVercelDeployment[] }>(
    `/v6/deployments?${buildQuery({ projectId: env.VERCEL_PROJECT_ID, limit: 20 })}`,
  )
  const deployments = res.deployments ?? []

  for (const d of deployments) {
    const state = (d.state ?? d.readyState ?? 'UNKNOWN').toUpperCase()
    await prisma.vercelDeploymentCache.upsert({
      where: { deploymentId: d.uid },
      create: {
        deploymentId: d.uid,
        state,
        target: d.target ?? null,
        url: d.url ?? null,
        errorMessage: d.errorMessage ?? null,
        createdAtVercel: d.createdAt ? new Date(d.createdAt) : new Date(),
        readyAtVercel: d.ready ? new Date(d.ready) : null,
      },
      update: {
        state,
        target: d.target ?? null,
        url: d.url ?? null,
        errorMessage: d.errorMessage ?? null,
        readyAtVercel: d.ready ? new Date(d.ready) : null,
      },
    })

    // DIY alert (research §3 Phase 5 — Vercel's own Alerts are Pro-only,
    // so a failed build is something WE notice, not something Vercel
    // hands us). One alert per deploymentId ever, not one per sync cycle
    // while it sits in ERROR state.
    if (state === 'ERROR') {
      const alreadyAlerted = await prisma.vercelAlertEvent.findFirst({
        where: { kind: 'deployment_failed', deploymentId: d.uid },
      })
      if (!alreadyAlerted) {
        await prisma.vercelAlertEvent.create({
          data: {
            kind: 'deployment_failed',
            severity: 'critical',
            message: d.errorMessage ? `Deployment failed: ${d.errorMessage}` : 'Deployment failed to build.',
            deploymentId: d.uid,
          },
        })
      }
    }
  }
  logger.info({ event: 'vercel.sync.deployments', count: deployments.length })
}

// ── Runtime logs (errors) ────────────────────────────────────────────────
interface RawVercelLogRow {
  rowId: string
  level?: string
  message?: string
  source?: string
  timestampInMs?: number
  domain?: string
  requestMethod?: string
  requestPath?: string
  responseStatusCode?: number
  deploymentId?: string
}

// This endpoint ("Returns a stream of logs for a given deployment") is the
// one flagged as unverified in research §1.4: its doc page doesn't expose
// since/until the way the build-events endpoint does, which reads like
// it's meant to be *followed* rather than *paged*. A Vercel Function can't
// hold a connection open indefinitely (Hobby's execution ceiling), so this
// opens a short-lived connection, reads whatever's buffered for up to
// `timeoutMs`, then cancels — a poll, not a tail. Dedup happens by rowId
// in syncRuntimeLogs() below, so re-reading overlapping buffered content
// on every cycle is safe.
async function fetchRuntimeLogsForDeployment(deploymentId: string, timeoutMs = 4000): Promise<RawVercelLogRow[]> {
  const url = `${VERCEL_BASE}/v1/projects/${env.VERCEL_PROJECT_ID}/deployments/${deploymentId}/runtime-logs?${buildQuery({})}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${env.VERCEL_API_TOKEN}` } })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw Object.assign(new Error(`Vercel API ${res.status}: runtime-logs`), { status: res.status, body })
  }
  if (!res.body) return []

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const rows: RawVercelLogRow[] = []
  const deadline = Date.now() + timeoutMs

  try {
    while (Date.now() < deadline) {
      const remaining = deadline - Date.now()
      const result = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value?: undefined }>((resolve) =>
          setTimeout(() => resolve({ done: true, value: undefined }), Math.max(0, remaining)),
        ),
      ])
      if (result.done) break
      buffer += decoder.decode(result.value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? '' // keep the last, possibly-incomplete line for the next chunk
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          rows.push(JSON.parse(trimmed))
        } catch {
          // malformed/partial line — skip rather than fail the whole sync
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {}) // we're a short poller, not a tailer — always release the connection
  }
  return rows
}

const ERROR_SPIKE_THRESHOLD = 5 // new error/fatal rows in one sync cycle before we raise a DIY alert
const RUNTIME_LOG_RETENTION_MS = 7 * 24 * 60 * 60_000 // we're now the long-term store Vercel's free tier isn't (research §1.1/§1.12)

export async function syncRuntimeLogs() {
  if (!isConfigured()) return

  const deploymentsRes = await vercelFetch<{ deployments: RawVercelDeployment[] }>(
    `/v6/deployments?${buildQuery({ projectId: env.VERCEL_PROJECT_ID, target: 'production', state: 'READY', limit: 1 })}`,
  )
  const latest = deploymentsRes.deployments?.[0]
  if (!latest) {
    logger.info({ event: 'vercel.sync.runtime_logs.no_deployment' })
    return
  }

  let rows: RawVercelLogRow[] = []
  try {
    rows = await fetchRuntimeLogsForDeployment(latest.uid)
  } catch (err) {
    // Fail soft — this is the one endpoint research flagged as needing a
    // live smoke-test before full confidence. A bad response here must
    // not take down deployments/analytics sync, which run independently.
    logger.warn({ event: 'vercel.sync.runtime_logs_failed', err: err instanceof Error ? err.message : String(err) })
    return
  }

  const candidateIds = rows.map((r) => r.rowId).filter(Boolean)
  const existing = candidateIds.length
    ? await prisma.vercelRuntimeLogCache.findMany({ where: { rowId: { in: candidateIds } }, select: { rowId: true } })
    : []
  const existingIds = new Set(existing.map((e) => e.rowId))
  const newRows = rows.filter((r) => r.rowId && !existingIds.has(r.rowId))

  if (newRows.length > 0) {
    await prisma.vercelRuntimeLogCache.createMany({
      data: newRows.map((r) => ({
        rowId: r.rowId,
        level: (r.level ?? 'info').toLowerCase(),
        message: r.message ?? '',
        source: r.source ?? null,
        deploymentId: r.deploymentId ?? latest.uid,
        domain: r.domain ?? null,
        requestMethod: r.requestMethod ?? null,
        requestPath: r.requestPath ?? null,
        responseStatusCode: r.responseStatusCode ?? null,
        timestamp: r.timestampInMs ? new Date(r.timestampInMs) : new Date(),
      })),
      skipDuplicates: true,
    })
  }

  const newErrorCount = newRows.filter((r) => ['error', 'fatal'].includes((r.level ?? '').toLowerCase())).length
  logger.info({ event: 'vercel.sync.runtime_logs', fetched: rows.length, new: newRows.length, newErrors: newErrorCount })

  // DIY error-spike alert — a simple threshold, not a real anomaly
  // baseline (research §3 Phase 5 flagged this as needing a design
  // conversation; this is a deliberately modest v1). Suppress re-raising
  // while an unacknowledged one from the last 15 minutes already exists.
  if (newErrorCount >= ERROR_SPIKE_THRESHOLD) {
    const recentUnacked = await prisma.vercelAlertEvent.findFirst({
      where: { kind: 'error_spike', acknowledged: false, occurredAt: { gt: new Date(Date.now() - 15 * 60_000) } },
    })
    if (!recentUnacked) {
      await prisma.vercelAlertEvent.create({
        data: {
          kind: 'error_spike',
          severity: 'critical',
          message: `${newErrorCount} new error/fatal log lines in the last sync cycle.`,
          deploymentId: latest.uid,
        },
      })
    }
  }

  // Retention/pruning (research §3 Phase 7) — bound table growth now that
  // we, not Vercel, are the long-term store.
  await prisma.vercelRuntimeLogCache.deleteMany({ where: { timestamp: { lt: new Date(Date.now() - RUNTIME_LOG_RETENTION_MS) } } })
}

// ── Web Analytics (traffic) ──────────────────────────────────────────────
export async function syncWebAnalytics() {
  if (!isConfigured()) return
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString()
  const until = new Date().toISOString()
  try {
    const res = await vercelFetch<{ data: { visitors?: number; pageviews?: number } }>(
      `/v1/query/web-analytics/visits/count?${buildQuery({ projectId: env.VERCEL_PROJECT_ID, since, until })}`,
    )
    const rows = [
      { metricKey: 'pageviews:24h', value: res.data?.pageviews ?? 0, windowLabel: '24h' },
      { metricKey: 'visitors:24h', value: res.data?.visitors ?? 0, windowLabel: '24h' },
    ]
    await Promise.all(rows.map((r) => prisma.vercelRollupStat.upsert({ where: { metricKey: r.metricKey }, create: r, update: r })))
    logger.info({ event: 'vercel.sync.analytics', rows: rows.length })
  } catch (err) {
    // Web Analytics has to be explicitly enabled on the project first
    // (research §3 Phase 0) — a failure here most likely means that
    // hasn't happened yet, not a real outage. Fail soft either way.
    logger.warn({ event: 'vercel.sync.analytics_unavailable', err: err instanceof Error ? err.message : String(err) })
  }
}

// ── On-demand sync wiring (page-view-triggered) ──────────────────────────
// Same mechanism as monitoringService.ts, via the shared ./syncState —
// see research §3 Phase 3. `vercel_runtime_logs`'s 3-minute floor here is
// a safety net for whenever someone happens to load the page; staying
// meaningfully ahead of Vercel's 1-hour deletion window the rest of the
// time is what the external scheduler (cron/vercel-sync route + the
// GitHub Actions workflow that calls it) is for — see runScheduledSync().
const SYNC_STALE_MS = {
  vercel_deployments: 3 * 60_000,
  vercel_runtime_logs: 3 * 60_000,
  vercel_analytics: 5 * 60_000, // aggregated traffic numbers change slowly; less urgent than error logs
} as const

function ensureFreshVercel(type: keyof typeof SYNC_STALE_MS, fn: () => Promise<void>): Promise<void> {
  return ensureFresh(type, SYNC_STALE_MS[type], fn)
}

// Called by the external scheduler (apps/web/src/app/api/cron/vercel-sync
// + the GitHub Actions workflow that hits it every few minutes) —
// bypasses the staleness check and always runs, since the whole point of
// this path is to run MORE often than page views alone would trigger, to
// stay ahead of Vercel's 1-hour runtime-log deletion window. Still stamps
// MonitoringSyncState afterwards so a page view landing between scheduler
// ticks doesn't immediately re-trigger a redundant sync.
export async function runScheduledSync() {
  if (!isConfigured()) return { configured: false as const }
  const results = await Promise.allSettled([syncDeployments(), syncRuntimeLogs(), syncWebAnalytics()])
  const now = new Date()
  await Promise.all(
    (Object.keys(SYNC_STALE_MS) as (keyof typeof SYNC_STALE_MS)[]).map((type) =>
      prisma.monitoringSyncState.upsert({
        where: { syncType: type },
        create: { syncType: type, lastSyncedAt: now },
        update: { lastSyncedAt: now },
      }),
    ),
  )
  return {
    configured: true as const,
    deployments: results[0].status,
    runtimeLogs: results[1].status,
    analytics: results[2].status,
  }
}

// ── Reads — what the routes actually serve to the frontend ───────────────
export async function getVercelSummary() {
  if (!isConfigured()) return { configured: false as const }

  await Promise.all([
    ensureFreshVercel('vercel_deployments', syncDeployments),
    ensureFreshVercel('vercel_runtime_logs', syncRuntimeLogs),
    ensureFreshVercel('vercel_analytics', syncWebAnalytics),
  ])

  const [stats, latestDeployment, unacknowledgedAlerts, errorCount24h] = await Promise.all([
    prisma.vercelRollupStat.findMany(),
    prisma.vercelDeploymentCache.findFirst({ orderBy: { createdAtVercel: 'desc' } }),
    prisma.vercelAlertEvent.count({ where: { acknowledged: false } }),
    prisma.vercelRuntimeLogCache.count({
      where: { level: { in: ['error', 'fatal'] }, timestamp: { gt: new Date(Date.now() - 24 * 60 * 60_000) } },
    }),
  ])

  return {
    configured: true as const,
    stats: Object.fromEntries(stats.map((s) => [s.metricKey, s.value])),
    latestDeploymentState: latestDeployment?.state ?? null,
    unacknowledgedAlerts,
    errorCount24h,
  }
}

export async function listVercelDeployments(limit = 20) {
  if (!isConfigured()) return []
  await ensureFreshVercel('vercel_deployments', syncDeployments)
  return prisma.vercelDeploymentCache.findMany({ orderBy: { createdAtVercel: 'desc' }, take: limit })
}

export async function listVercelErrors(opts: { level?: string; limit?: number } = {}) {
  if (!isConfigured()) return []
  await ensureFreshVercel('vercel_runtime_logs', syncRuntimeLogs)
  return prisma.vercelRuntimeLogCache.findMany({
    where: opts.level ? { level: opts.level } : { level: { in: ['error', 'fatal', 'warning'] } },
    orderBy: { timestamp: 'desc' },
    take: opts.limit ?? 50,
  })
}

export async function listVercelAlerts() {
  if (!isConfigured()) return []
  return prisma.vercelAlertEvent.findMany({ orderBy: { occurredAt: 'desc' }, take: 50 })
}

export async function acknowledgeAlert(id: string) {
  await prisma.vercelAlertEvent.update({ where: { id }, data: { acknowledged: true } })
  logger.info({ event: 'vercel.alert_acknowledged', id })
}

// Exported for the cron route to do a cheap "is this even configured"
// check before bothering to call runScheduledSync().
export { isConfigured as isVercelMonitoringConfigured }