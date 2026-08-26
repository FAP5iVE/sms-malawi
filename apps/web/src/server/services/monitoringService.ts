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

// ── Rollup stats: Crash-Free Sessions/Users, Apdex, Releases count ──
export async function syncRollupStats() {
  const [sessionHealth, releases] = await Promise.all([
    sentryFetch<{ groups: { by: Record<string, string>; totals: Record<string, number> }[] }>(
      `/organizations/${SENTRY_ORG}/sessions/?field=crash_free_rate(session)&field=crash_free_rate(user)&statsPeriod=7d`,
    ),
    sentryFetch<unknown[]>(`/organizations/${SENTRY_ORG}/releases/?statsPeriod=30d`),
  ])

  const totals = sessionHealth.groups[0]?.totals ?? {}
  const rows: { metricKey: string; value: number; windowLabel: string }[] = [
    { metricKey: 'crash_free_sessions:7d', value: (totals['crash_free_rate(session)'] ?? 1) * 100, windowLabel: '7d' },
    { metricKey: 'crash_free_users:7d', value: (totals['crash_free_rate(user)'] ?? 1) * 100, windowLabel: '7d' },
    { metricKey: 'releases_count:30d', value: releases.length, windowLabel: '30d' },
  ]
  await Promise.all(
    rows.map((r) => prisma.sentryRollupStat.upsert({ where: { metricKey: r.metricKey }, create: r, update: r })),
  )
  logger.info({ event: 'sentry.sync.rollup', rows: rows.length })
}

// ── Reads — what the routes actually serve to the frontend ──
export async function getSummary() {
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