/**
 * apps/web/src/server/services/monitoringService.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Server-only Sentry API client + cache sync + webhook ingestion
 *   + feedback submission, powering the /monitoring admin dashboard. This is
 *   the ONLY place SENTRY_API_TOKEN is read — never exposed to the client.
 *   Sentry org '5ivestack-labs' is DE-region (confirmed from the real
 *   SENTRY_AUTH_TOKEN payload in next.config.ts) — every API call targets
 *   de.sentry.io, not the default sentry.io host.
 * [DEPENDS ON]: prisma, crypto (webhook signature verification), env.ts
 *   (SENTRY_API_TOKEN, SENTRY_WEBHOOK_SECRET), @sentry/nextjs
 */
import 'server-only'
import crypto from 'crypto'
import * as Sentry from '@sentry/nextjs'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { env } from '@/lib/env'
import { ensureFresh as sharedEnsureFresh } from './syncState'

const SENTRY_BASE = 'https://de.sentry.io/api/0'   // DE region — confirmed, not the default sentry.io host
const SENTRY_ORG = '5ivestack-labs'                 // matches the literal already hardcoded in next.config.ts

// ── Low-level authenticated fetch wrapper, respects rate-limit headers ──
async function sentryFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${SENTRY_BASE}${path}`, {
    headers: { Authorization: `Bearer ${env.SENTRY_API_TOKEN}` },
  })
  const remaining = res.headers.get('X-Sentry-Rate-Limit-Remaining')
  if (remaining !== null && Number(remaining) < 10) {
    logger.warn({ event: 'sentry.rate_limit_low', remaining, path })
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw Object.assign(new Error(`Sentry API ${res.status}: ${path}`), { status: res.status, body })
  }
  return res.json() as Promise<T>
}

async function sentryPut(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${SENTRY_BASE}${path}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${env.SENTRY_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw Object.assign(new Error(`Sentry API ${res.status}: ${path}`), { status: res.status, body: text })
  }
}

// ── Webhook signature verification — MANDATORY, constant-time ──
export function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  if (!signature) return false
  const expected = crypto.createHmac('sha256', env.SENTRY_WEBHOOK_SECRET).update(rawBody).digest('hex')
  const expectedBuf = Buffer.from(expected)
  const signatureBuf = Buffer.from(signature)
  if (expectedBuf.length !== signatureBuf.length) return false
  return crypto.timingSafeEqual(expectedBuf, signatureBuf)
}

// ── Normalize a raw Sentry issue payload into our cache row shape ──
interface RawSentryIssue {
  id: string; shortId?: string; title: string; culprit?: string; level: string
  status: string; substatus?: string; issueCategory?: string; issueType?: string
  count?: string; userCount?: number; firstSeen?: string; lastSeen?: string
  permalink?: string
}

function normalizeIssue(raw: RawSentryIssue) {
  return {
    sentryIssueId: raw.id,
    shortId: raw.shortId ?? null,
    title: raw.title,
    culprit: raw.culprit ?? null,
    level: raw.level,
    status: raw.status,
    substatus: raw.substatus ?? null,
    issueCategory: raw.issueCategory ?? null,
    isUptimeIssue: raw.issueType === 'uptime_domain_failure' || raw.issueCategory === 'uptime',
    eventCount: raw.count ? Number(raw.count) : 0,
    userCount: raw.userCount ?? 0,
    firstSeenAt: raw.firstSeen ? new Date(raw.firstSeen) : null,
    lastSeenAt: raw.lastSeen ? new Date(raw.lastSeen) : null,
    permalink: raw.permalink ?? null,
    raw: raw as object,
  }
}

// ── Webhook ingestion — called from the Route Handler after signature verification ──
export async function handleIssueWebhook(action: string, issue: RawSentryIssue) {
  const data = normalizeIssue(issue)
  await prisma.sentryIssueCache.upsert({
    where: { sentryIssueId: data.sentryIssueId },
    create: data,
    update: data,
  })
  logger.info({ event: 'sentry.webhook.issue', action, issueId: data.sentryIssueId, status: data.status })
}

// ── Periodic sync (fallback + initial page load) ──
export async function syncIssues() {
  const res = await sentryFetch<RawSentryIssue[]>(
    `/organizations/${SENTRY_ORG}/issues/?statsPeriod=14d&query=&limit=100`,
  )
  await Promise.all(
    res.map((raw) => {
      const data = normalizeIssue(raw)
      return prisma.sentryIssueCache.upsert({ where: { sentryIssueId: data.sentryIssueId }, create: data, update: data })
    }),
  )
  logger.info({ event: 'sentry.sync.issues', count: res.length })
}

interface RawSentryAlert {
  id: string; name: string; enabled?: boolean; lastTriggered?: string
}

export async function syncAlerts() {
  // Current (beta) Monitors/Alerts endpoint — not the deprecated /rules/ or
  // /alert-rules/ surface. Re-verify shape periodically given its
  // documented beta status.
  const res = await sentryFetch<{ data: RawSentryAlert[] }>(`/organizations/${SENTRY_ORG}/workflows/`)
  await Promise.all(
    (res.data ?? []).map((raw) =>
      prisma.sentryAlertCache.upsert({
        where: { sentryAlertId: raw.id },
        create: { sentryAlertId: raw.id, name: raw.name, enabled: raw.enabled ?? true, raw: raw as object },
        update: { name: raw.name, enabled: raw.enabled ?? true, raw: raw as object },
      }),
    ),
  )
  logger.info({ event: 'sentry.sync.alerts', count: res.data?.length ?? 0 })
}

// ── Apdex — best-effort. Apdex is a performance/transactions metric, not
// part of the Sessions API used below, and is served off the Discover /
// events-stats surface instead. Unlike the sessions/releases calls in
// syncRollupStats, this exact endpoint + response shape is NOT confirmed
// against a live 5ivestack-labs payload — if de.sentry.io rejects this
// query or returns a different shape, we log once and return null so the
// caller just skips writing 'apdex:24h' (the KPI tile keeps its existing
// "—" empty state) instead of failing the whole rollup sync. Re-verify
// against Sentry's current API docs if this keeps coming back null.
async function fetchApdex(): Promise<number | null> {
  try {
    const res = await sentryFetch<{ data?: { 'apdex()'?: number }[] }>(
      `/organizations/${SENTRY_ORG}/events-stats/?field=apdex()&statsPeriod=24h&project=-1&dataset=metrics`,
    )
    const value = res.data?.[0]?.['apdex()']
    return typeof value === 'number' ? value : null
  } catch (err) {
    logger.warn({ event: 'sentry.sync.apdex_unavailable', err: err instanceof Error ? err.message : String(err) })
    return null
  }
}

// ── Rollup stats: Crash-Free Sessions/Users, Apdex, Releases count ──
// Each metric is fetched independently via allSettled and fault-isolated:
// if one call fails (most likely Apdex, given the caveat above), the
// others still sync and update their KPI tiles rather than one bad
// endpoint blanking the whole rollup.
export async function syncRollupStats() {
  const [sessionHealthResult, releasesResult, apdexResult] = await Promise.allSettled([
    sentryFetch<{ groups: { by: Record<string, string>; totals: Record<string, number> }[] }>(
      `/organizations/${SENTRY_ORG}/sessions/?field=crash_free_rate(session)&field=crash_free_rate(user)&statsPeriod=7d`,
    ),
    sentryFetch<unknown[]>(`/organizations/${SENTRY_ORG}/releases/?statsPeriod=30d`),
    fetchApdex(),
  ])

  const rows: { metricKey: string; value: number; windowLabel: string }[] = []

  if (sessionHealthResult.status === 'fulfilled') {
    const totals = sessionHealthResult.value.groups[0]?.totals ?? {}
    rows.push(
      { metricKey: 'crash_free_sessions:7d', value: (totals['crash_free_rate(session)'] ?? 1) * 100, windowLabel: '7d' },
      { metricKey: 'crash_free_users:7d', value: (totals['crash_free_rate(user)'] ?? 1) * 100, windowLabel: '7d' },
    )
  } else {
    logger.error({ event: 'sentry.sync.rollup.session_health_failed', err: sessionHealthResult.reason instanceof Error ? sessionHealthResult.reason.message : String(sessionHealthResult.reason) })
  }

  if (releasesResult.status === 'fulfilled') {
    rows.push({ metricKey: 'releases_count:30d', value: releasesResult.value.length, windowLabel: '30d' })
  } else {
    logger.error({ event: 'sentry.sync.rollup.releases_failed', err: releasesResult.reason instanceof Error ? releasesResult.reason.message : String(releasesResult.reason) })
  }

  if (apdexResult.status === 'fulfilled' && apdexResult.value != null) {
    rows.push({ metricKey: 'apdex:24h', value: apdexResult.value, windowLabel: '24h' })
  }
  // A rejected/null apdexResult is expected-possible (see fetchApdex) and
  // already logged in there — no duplicate log here.

  if (rows.length > 0) {
    await Promise.all(
      rows.map((r) => prisma.sentryRollupStat.upsert({ where: { metricKey: r.metricKey }, create: r, update: r })),
    )
  }
  logger.info({ event: 'sentry.sync.rollup', rows: rows.length })

  // If every metric failed, surface that to ensureFresh() as a real error
  // (recorded in MonitoringSyncState.lastError) instead of a silent no-op
  // "successful" sync.
  if (rows.length === 0) {
    throw new Error('sentry.sync.rollup: all rollup metrics failed to fetch')
  }
}

// ── On-demand ("lazy") sync — replaces depending on a cron schedule ──
// Vercel's Hobby-tier cron can only fire once a day (confirmed against
// current Vercel docs, 2026), which isn't enough for a dashboard meant to
// show "live" system health. Instead, the read paths below each claim and
// run their own sync whenever their slice of the cache is older than
// SYNC_STALE_MS, so data self-heals on the next admin page view and never
// depends on any external scheduler or plan tier. The claim/run mechanics
// live in ./syncState.ts (shared with vercelMonitoringService.ts) — this
// is just the Sentry-specific staleness durations and which sync fn goes
// with which type.
const SYNC_STALE_MS = {
  issues: 3 * 60_000,  // webhook is the primary path; this is a safety net + backfill for anything the webhook missed
  alerts: 3 * 60_000,  // there is no webhook for alerts at all — this on-demand sync IS the only path
  rollup: 3 * 60_000,  // crash-free %, releases count, Apdex
} as const

function ensureFresh(type: keyof typeof SYNC_STALE_MS, fn: () => Promise<void>): Promise<void> {
  return sharedEnsureFresh(type, SYNC_STALE_MS[type], fn)
}

// ── Reads — what the routes actually serve to the frontend ──
export async function getSummary() {
  // Refresh whichever slices are stale before reading — see "On-demand
  // sync" above. Each type claims/skips independently, so this is a
  // no-op (fast) on the vast majority of requests that land inside the
  // 3-minute freshness window.
  await Promise.all([
    ensureFresh('issues', syncIssues),
    ensureFresh('alerts', syncAlerts),
    ensureFresh('rollup', syncRollupStats),
  ])

  const [stats, unresolvedCount, uptimeCount, latestAlerts] = await Promise.all([
    prisma.sentryRollupStat.findMany(),
    prisma.sentryIssueCache.count({ where: { status: 'unresolved', isUptimeIssue: false } }),
    prisma.sentryIssueCache.count({ where: { status: 'unresolved', isUptimeIssue: true } }),
    prisma.sentryAlertCache.findMany({ orderBy: { lastTriggeredAt: 'desc' }, take: 5 }),
  ])
  return {
    stats: Object.fromEntries(stats.map((s) => [s.metricKey, s.value])),
    unresolvedIssues: unresolvedCount,
    activeOutages: uptimeCount,
    recentAlerts: latestAlerts,
  }
}

export async function listIssues(opts: { status?: string; level?: string; uptimeOnly?: boolean; limit?: number }) {
  await ensureFresh('issues', syncIssues)
  return prisma.sentryIssueCache.findMany({
    where: {
      ...(opts.status ? { status: opts.status } : {}),
      ...(opts.level ? { level: opts.level } : {}),
      ...(opts.uptimeOnly ? { isUptimeIssue: true } : {}),
    },
    orderBy: { lastSeenAt: 'desc' },
    take: opts.limit ?? 50,
  })
}

export async function listAlerts() {
  await ensureFresh('alerts', syncAlerts)
  return prisma.sentryAlertCache.findMany({ orderBy: { updatedAt: 'desc' } })
}

// PUT /monitoring/alerts/:id/toggle — bulk-enable/disable one alert via the
// Monitors/Alerts API, then refresh our own cache row so the UI reflects it
// immediately without waiting for the next periodic sync.
export async function toggleAlert(sentryAlertId: string, enabled: boolean) {
  await sentryPut(`/organizations/${SENTRY_ORG}/workflows/`, { id: [sentryAlertId], enabled })
  await prisma.sentryAlertCache.update({ where: { sentryAlertId }, data: { enabled } })
  logger.info({ event: 'sentry.alert_toggled', sentryAlertId, enabled })
}

// ── Replays — proxied live, not cached (low query frequency) ──
interface RawSentryReplay {
  id: string; duration: number; count_errors: number
  browser?: { name: string; version: string } | null
  urls?: string[]; finished_at: string
}

export async function listReplays(statsPeriod = '14d') {
  const res = await sentryFetch<{ data: RawSentryReplay[] }>(
    `/organizations/${SENTRY_ORG}/replays/?statsPeriod=${statsPeriod}&per_page=25`,
  )
  return {
    data: (res.data ?? []).map((r) => ({
      id: r.id,
      duration: r.duration,
      errorCount: r.count_errors,
      browser: r.browser ?? null,
      urls: r.urls ?? [],
      finishedAt: r.finished_at,
    })),
  }
}

// ── Releases — proxied live (Number of Releases KPI + per-week cadence chart) ──
interface RawSentryRelease {
  version: string; dateCreated: string
  newGroups?: number; deployCount?: number
}

export async function listReleases(statsPeriod = '30d') {
  const res = await sentryFetch<RawSentryRelease[]>(
    `/organizations/${SENTRY_ORG}/releases/?statsPeriod=${statsPeriod}`,
  )
  return res.map((r) => ({
    version: r.version,
    dateCreated: r.dateCreated,
    newGroups: r.newGroups ?? 0,
    deployCount: r.deployCount ?? 0,
  }))
}

// ── Logs — proxied live (Logs have no webhook path; Explore-equivalent query) ──
export async function listLogs(opts: { level?: string; limit?: number } = {}) {
  const params = new URLSearchParams({ statsPeriod: '24h', per_page: String(opts.limit ?? 50) })
  if (opts.level) params.set('query', `severity:${opts.level}`)
  return sentryFetch<{ data: unknown[] }>(`/organizations/${SENTRY_ORG}/events/?${params.toString()}&dataset=ourlogs`)
}

// ── User Feedback — write path + read-back list ──
export async function submitFeedback(input: { message: string; uid: string; role: string; associatedIssueId?: string }) {
  const eventId = Sentry.captureFeedback(
    { message: input.message },
    { captureContext: { user: { id: input.uid }, tags: { role: input.role, ...(input.associatedIssueId ? { associatedIssueId: input.associatedIssueId } : {}) } } },
  )
  logger.info({ event: 'monitoring.feedback_submitted', uid: input.uid, eventId })
  return { eventId }
}

interface RawSentryFeedbackIssue {
  id: string; title: string; firstSeen: string
  metadata?: { value?: string }
}

export async function listFeedback(limit = 50) {
  const res = await sentryFetch<RawSentryFeedbackIssue[]>(
    `/organizations/${SENTRY_ORG}/issues/?query=issue.category:feedback&statsPeriod=30d&limit=${limit}`,
  )
  return {
    data: res.map((f) => ({
      id: f.id,
      message: f.metadata?.value ?? f.title,
      dateCreated: f.firstSeen,
    })),
  }
}