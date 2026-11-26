/**
 * adminAnalytics.ts — security, sessions, audit governance and adoption.
 *
 * Built only from data the platform really records: AuditLog (LOGIN_SUCCESS /
 * LOGIN_FAILED and every audited action), UserSession (open/closed sessions,
 * forced logouts, IPs), StaffProfile / Student accounts, the live health probe
 * and the Sentry cache. There is no backup or queue table in the schema, so
 * nothing here pretends to report backup or job-runtime figures.
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import type { AttentionItem, ReportInsight, ReportSectionData } from '@shared/types/reporting'
import type {
  ApiAdoptionReport, ApiAdoptionRole, ApiGovernanceReport, ApiOperationsReport, ApiSecurityReport, ApiSessionsReport,
} from '@shared/types/reporting-admin'
import { ACTIVE_GRACE_MS, getSessionSummary } from '@/server/services/sessionService'
import { getSystemHealth } from '@/server/services/systemHealthService'
import * as monitoring from '@/server/services/monitoringService'
import { isVercelMonitoringConfigured } from '@/server/services/vercelMonitoringService'
import {
  AUDIT_CATEGORIES, DURATION_BANDS, MULTI_IP_THRESHOLD, REPEATED_FAILURE_THRESHOLD, abnormalVolume, categoriesOf,
  dayKey, dayLabel, detectBursts, domainOf, durationBand, durationStats, lastDays, mondayOf, repeatedFailures,
} from './adminLogic'
import {
  NOT_RECORDED, errorsByHour, summariseBacklog, summariseDeployments, summariseIssues, syncFreshness, topErrorPaths, truncate,
} from './platformLogic'
import { kpi, ratioPct, thresholdKpi } from '@/server/services/reporting/kpi'
import { compact, sortInsights } from '@/server/services/reporting/insights'
import { enrichAttention, rankAttention } from './executiveLogic'

const DAY_MS = 86_400_000
const SESSION_ROW_CAP = 50_000

const sortCount = <T extends { count: number }>(rows: T[]): T[] => rows.sort((a, b) => b.count - a.count)

/** Sum `n(row)` per `key(row)`, biggest first. */
function countBy<T>(rows: readonly T[], key: (r: T) => string, n: (r: T) => number): { label: string; count: number }[] {
  const m = new Map<string, number>()
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + n(r))
  return sortCount(Array.from(m.entries()).map(([label, count]) => ({ label, count })))
}

export async function getSecurityReport(days = 30): Promise<ApiSecurityReport> {
  const now = new Date()
  const keys = lastDays(days, now)
  const since = new Date(`${keys[0]}T00:00:00Z`)
  const d24 = new Date(now.getTime() - DAY_MS)
  const d7 = new Date(now.getTime() - 7 * DAY_MS)

  const [logins, recentFailures, forced, recentSessions] = await Promise.all([
    prisma.auditLog.findMany({
      where: { createdAt: { gte: since }, action: { in: ['LOGIN_SUCCESS', 'LOGIN_FAILED'] } },
      select: { action: true, createdAt: true },
    }),
    prisma.auditLog.findMany({
      where: { createdAt: { gte: d24 }, action: 'LOGIN_FAILED' },
      select: { entityId: true, createdAt: true },
    }),
    prisma.userSession.findMany({
      where: { endReason: 'forced', loggedOutAt: { gte: since } },
      select: { role: true, loggedOutAt: true },
      orderBy: { loggedOutAt: 'desc' },
    }),
    prisma.userSession.findMany({
      where: { loginAt: { gte: d7 }, ipAddress: { not: null } },
      select: { uid: true, role: true, ipAddress: true },
    }),
  ])

  const byDay = new Map(keys.map((k) => [k, { successful: 0, failed: 0 }]))
  for (const l of logins) {
    const d = byDay.get(dayKey(l.createdAt))
    if (!d) continue
    if (l.action === 'LOGIN_SUCCESS') d.successful += 1
    else d.failed += 1
  }
  const trend = keys.map((date) => {
    const d = byDay.get(date) ?? { successful: 0, failed: 0 }
    return { date, label: dayLabel(date), ...d, failureRate: ratioPct(d.failed, d.successful + d.failed) }
  })
  const successful = trend.reduce((s, d) => s + d.successful, 0)
  const failed = trend.reduce((s, d) => s + d.failed, 0)

  const perUid = new Map<string, { role: string; ips: Set<string>; sessions: number }>()
  for (const s of recentSessions) {
    const cur = perUid.get(s.uid) ?? { role: s.role, ips: new Set<string>(), sessions: 0 }
    if (s.ipAddress) cur.ips.add(s.ipAddress)
    cur.sessions += 1
    perUid.set(s.uid, cur)
  }

  return {
    days,
    successful,
    failed,
    failureRate: ratioPct(failed, successful + failed),
    trend,
    bursts: detectBursts(trend).map((b) => ({ date: b.date, label: dayLabel(b.date), failed: b.failed })),
    repeatedFailures: repeatedFailures(recentFailures.map((f) => ({ identifier: f.entityId, at: f.createdAt })))
      .map((r) => ({ identifier: r.identifier, failures: r.failures, lastAt: r.lastAt.toISOString() }))
      .slice(0, 20),
    repeatedFailureThreshold: REPEATED_FAILURE_THRESHOLD,
    forcedLogouts: {
      count: forced.length,
      recent: forced.slice(0, 10).map((f) => ({ at: (f.loggedOutAt ?? now).toISOString(), role: f.role })),
    },
    multiIpAccounts: Array.from(perUid.entries())
      .filter(([, v]) => v.ips.size >= MULTI_IP_THRESHOLD)
      .map(([uid, v]) => ({ uid, role: v.role, ipCount: v.ips.size, sessions: v.sessions }))
      .sort((a, b) => b.ipCount - a.ipCount)
      .slice(0, 20),
    multiIpThreshold: MULTI_IP_THRESHOLD,
  }
}

export async function getSessionsReport(days = 30): Promise<ApiSessionsReport> {
  const now = new Date()
  const keys = lastDays(days, now)
  const since = new Date(`${keys[0]}T00:00:00Z`)

  const [sessions, open] = await Promise.all([
    prisma.userSession.findMany({
      where: { loginAt: { gte: since } },
      select: { uid: true, loginAt: true, lastSeenAt: true, loggedOutAt: true, endReason: true },
      orderBy: { loginAt: 'desc' },
      take: SESSION_ROW_CAP,
    }),
    prisma.userSession.findMany({
      where: { loggedOutAt: null, lastSeenAt: { gte: new Date(now.getTime() - ACTIVE_GRACE_MS) } },
      select: { uid: true, role: true },
    }),
  ])

  const perDay = new Map(keys.map((k) => [k, { sessions: 0, users: new Set<string>() }]))
  const minutes: number[] = []
  const reasons = new Map<string, number>()
  for (const s of sessions) {
    const d = perDay.get(dayKey(s.loginAt))
    if (d) {
      d.sessions += 1
      d.users.add(s.uid)
    }
    // Only closed sessions have a trustworthy duration; an open one is still running.
    if (s.loggedOutAt) {
      minutes.push(Math.max(0, (s.loggedOutAt.getTime() - s.loginAt.getTime()) / 60_000))
      const label = s.endReason === 'forced' ? 'Forced sign-out' : s.endReason === 'new_login' ? 'Replaced by new sign-in' : 'Signed out'
      reasons.set(label, (reasons.get(label) ?? 0) + 1)
    }
  }

  const roleCounts = new Map<string, Set<string>>()
  for (const o of open) roleCounts.set(o.role, (roleCounts.get(o.role) ?? new Set<string>()).add(o.uid))

  const bands = new Map<string, number>(DURATION_BANDS.map((b) => [b, 0]))
  minutes.forEach((m) => bands.set(durationBand(m), (bands.get(durationBand(m)) ?? 0) + 1))
  const stats = durationStats(minutes)

  return {
    days,
    activeNow: new Set(open.map((o) => o.uid)).size,
    activeByRole: sortCount(Array.from(roleCounts.entries()).map(([role, set]) => ({ role, count: set.size }))),
    perDay: keys.map((date) => {
      const d = perDay.get(date)
      return { date, label: dayLabel(date), sessions: d?.sessions ?? 0, users: d?.users.size ?? 0 }
    }),
    avgDurationMinutes: stats.avg,
    medianDurationMinutes: stats.median,
    durationBands: Array.from(bands.entries()).map(([label, count]) => ({ label, count })),
    endReasons: sortCount(Array.from(reasons.entries()).map(([label, count]) => ({ label, count }))),
    totalSessions: sessions.length,
  }
}

export async function getGovernanceReport(days = 30): Promise<ApiGovernanceReport> {
  const now = new Date()
  const keys = lastDays(days, now)
  const since = new Date(`${keys[0]}T00:00:00Z`)

  const [groups, stamps] = await Promise.all([
    prisma.auditLog.groupBy({
      by: ['action', 'actorRole'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    prisma.auditLog.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
  ])

  const perDay = new Map(keys.map((k) => [k, 0]))
  stamps.forEach((s) => perDay.set(dayKey(s.createdAt), (perDay.get(dayKey(s.createdAt)) ?? 0) + 1))

  const isLogin = (action: string) => action.startsWith('LOGIN_')
  const nonLogin = groups.filter((g) => !isLogin(g.action))

  const categories = AUDIT_CATEGORIES.map((c) => {
    const inCat = nonLogin.filter((g) => categoriesOf(g.action).includes(c.key))
    const byAction = new Map<string, number>()
    inCat.forEach((g) => byAction.set(g.action, (byAction.get(g.action) ?? 0) + g._count._all))
    return {
      ...c,
      count: inCat.reduce((s, g) => s + g._count._all, 0),
      top: sortCount(Array.from(byAction.entries()).map(([action, count]) => ({ action, count }))).slice(0, 5),
    }
  })

  return {
    days,
    total: groups.reduce((s, g) => s + g._count._all, 0),
    perDay: keys.map((date) => ({ date, label: dayLabel(date), count: perDay.get(date) ?? 0 })),
    byRole: countBy(groups, (g) => g.actorRole, (g) => g._count._all).slice(0, 12),
    byDomain: countBy(nonLogin, (g) => domainOf(g.action), (g) => g._count._all).slice(0, 12),
    byAction: countBy(nonLogin, (g) => g.action, (g) => g._count._all).slice(0, 15),
    categories,
  }
}

export async function getAdoptionReport(): Promise<ApiAdoptionReport> {
  const now = new Date()
  const d7 = new Date(now.getTime() - 7 * DAY_MS)
  const d30 = new Date(now.getTime() - 30 * DAY_MS)
  const weeksBack = new Date(now.getTime() - 8 * 7 * DAY_MS)

  const [staff, students, sessions, entityGroups] = await Promise.all([
    prisma.staffProfile.groupBy({
      by: ['role'], where: { status: { in: ['ACTIVE', 'ON_LEAVE'] } }, _count: { _all: true },
    }),
    prisma.student.count({ where: { status: 'ACTIVE', firebaseUid: { not: null } } }),
    prisma.userSession.findMany({
      where: { loginAt: { gte: weeksBack } },
      select: { uid: true, role: true, loginAt: true },
    }),
    prisma.auditLog.groupBy({
      by: ['entityType'], where: { createdAt: { gte: d30 }, action: { notIn: ['LOGIN_SUCCESS', 'LOGIN_FAILED'] } }, _count: { _all: true },
    }),
  ])

  const accountsOf = new Map<string, number>(staff.map((s) => [s.role, s._count._all]))
  accountsOf.set('student', (accountsOf.get('student') ?? 0) + students)

  const active7 = new Map<string, Set<string>>()
  const active30 = new Map<string, Set<string>>()
  const weeks = new Map<string, Set<string>>()
  for (const s of sessions) {
    if (s.loginAt >= d30) active30.set(s.role, (active30.get(s.role) ?? new Set<string>()).add(s.uid))
    if (s.loginAt >= d7) active7.set(s.role, (active7.get(s.role) ?? new Set<string>()).add(s.uid))
    const w = mondayOf(s.loginAt)
    weeks.set(w, (weeks.get(w) ?? new Set<string>()).add(s.uid))
  }

  const roles = new Set<string>([...accountsOf.keys(), ...active30.keys()])
  const byRole: ApiAdoptionRole[] = Array.from(roles).map((role) => {
    const accounts = accountsOf.get(role) ?? 0
    const a7 = active7.get(role)?.size ?? 0
    const a30 = active30.get(role)?.size ?? 0
    return {
      role, accounts, active7: a7, active30: a30,
      inactive: Math.max(0, accounts - a30),
      activeRate: ratioPct(Math.min(a30, accounts), accounts),
    }
  }).sort((a, b) => b.accounts - a.accounts)

  const accounts = byRole.reduce((s, r) => s + r.accounts, 0)
  const a7 = byRole.reduce((s, r) => s + r.active7, 0)
  const a30 = byRole.reduce((s, r) => s + r.active30, 0)

  const firstWeek = mondayOf(weeksBack)
  const weekKeys: string[] = []
  for (let t = Date.parse(`${firstWeek}T00:00:00Z`); t <= now.getTime(); t += 7 * DAY_MS) weekKeys.push(dayKey(new Date(t)))

  return {
    accounts,
    active7: a7,
    active30: a30,
    activeRate30: ratioPct(Math.min(a30, accounts), accounts),
    byRole,
    weekly: weekKeys.map((weekStart) => ({ weekStart, label: dayLabel(weekStart), users: weeks.get(weekStart)?.size ?? 0 })),
    featureUsage: countBy(entityGroups, (g) => g.entityType, (g) => g._count._all).slice(0, 12),
  }
}

export interface AdminOverviewOptions {
  includeHealth: boolean
  includeMonitoring: boolean
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch {
    return null
  }
}

export async function getAdminOverview(opts: AdminOverviewOptions): Promise<ReportSectionData> {
  const now = new Date()
  const d1 = new Date(now.getTime() - DAY_MS)
  const [security, summary, adoption, audit24, health, mon] = await Promise.all([
    getSecurityReport(7),
    getSessionSummary(),
    getAdoptionReport(),
    prisma.auditLog.count({ where: { createdAt: { gte: d1 }, action: { notIn: ['LOGIN_SUCCESS', 'LOGIN_FAILED'] } } }),
    opts.includeHealth ? safe(getSystemHealth) : Promise.resolve(null),
    opts.includeMonitoring ? safe(monitoring.getSummary) : Promise.resolve(null),
  ])

  const today = security.trend[security.trend.length - 1]
  const failedToday = today?.failed ?? 0
  const loginsToday = today?.successful ?? 0
  const degraded = health ? health.services.filter((s) => s.status !== 'ok').length : null

  const kpis = [
    kpi({ key: 'activeNow', label: 'Active now', value: summary.activeNow, unit: 'count', description: 'Distinct accounts with an open session seen in the last 3 minutes.', subLabel: `${summary.last1h} in the last hour`, href: '/reports?tab=sessions' }),
    kpi({ key: 'loginsToday', label: 'Sign-ins today', value: loginsToday, unit: 'count', description: 'Successful sign-ins recorded today (UTC).', href: '/reports?tab=security' }),
    thresholdKpi('loginFailureRate', { key: 'failureRate', label: 'Failed sign-in rate', value: today ? today.failureRate : null, unit: 'percent', description: 'Failed ÷ all sign-in attempts today (UTC).', subLabel: `${failedToday} failed today`, href: '/reports?tab=security' }),
    kpi({ key: 'forced', label: 'Forced sign-outs (7 days)', value: security.forcedLogouts.count, unit: 'count', description: 'Sessions ended by an administrator in the last 7 days.', href: '/reports?tab=security' }),
    kpi({ key: 'audit24', label: 'Audited actions (24h)', value: audit24, unit: 'count', description: 'Audited changes in the last 24 hours, excluding sign-ins.', href: '/reports?tab=governance' }),
    kpi({ key: 'adoption', label: 'Accounts active (30 days)', value: adoption.activeRate30, unit: 'percent', description: 'Accounts that signed in during the last 30 days ÷ staff and student accounts.', subLabel: `${adoption.active30} of ${adoption.accounts}`, href: '/reports?tab=adoption' }),
    ...(degraded !== null
      ? [kpi({ key: 'services', label: 'Services needing attention', value: degraded, unit: 'count', description: 'Platform services not reporting OK in the live health check.', status: degraded > 0 ? 'critical' : 'healthy', href: '/user-management?tab=health' })]
      : []),
    ...(mon
      ? [kpi({ key: 'issues', label: 'Unresolved errors', value: mon.unresolvedIssues, unit: 'count', description: 'Unresolved issues in error monitoring (uptime incidents counted separately).', subLabel: mon.activeOutages > 0 ? `${mon.activeOutages} active outage${mon.activeOutages === 1 ? '' : 's'}` : undefined, status: mon.activeOutages > 0 ? 'critical' : mon.unresolvedIssues > 0 ? 'watch' : 'healthy' })]
      : []),
  ]

  const insights: ReportInsight[] = compact([
    security.repeatedFailures.length > 0
      ? { key: 'repeated-failures', severity: 'critical', title: `${security.repeatedFailures.length} identifier${security.repeatedFailures.length === 1 ? '' : 's'} with repeated failed sign-ins`, detail: `${REPEATED_FAILURE_THRESHOLD}+ failures in the last 24 hours — possible password guessing.`, href: '/reports?tab=security' }
      : null,
    security.bursts.length > 0
      ? { key: 'failure-burst', severity: 'watch', title: 'Unusual spike in failed sign-ins', detail: `${security.bursts.map((b) => `${b.label} (${b.failed})`).join(', ')} stood out against normal days.`, href: '/reports?tab=security' }
      : null,
    degraded
      ? { key: 'services-degraded', severity: 'critical', title: `${degraded} service${degraded === 1 ? '' : 's'} not healthy`, detail: 'See the live health check for which.', href: '/user-management?tab=health' }
      : null,
  ])

  return {
    key: 'admin-overview',
    title: 'Platform overview',
    scope: { description: 'Whole platform: sign-ins, sessions, audit trail, accounts and services.' },
    kpis,
    insights: sortInsights(insights),
    generatedAt: now.toISOString(),
  }
}

export async function getAdminAttention(opts: AdminOverviewOptions): Promise<AttentionItem[]> {
  const now = new Date()
  const [security, mon, health, todayAudit, priorAudit, adoption] = await Promise.all([
    getSecurityReport(7),
    opts.includeMonitoring ? safe(monitoring.getSummary) : Promise.resolve(null),
    opts.includeHealth ? safe(getSystemHealth) : Promise.resolve(null),
    prisma.auditLog.count({ where: { createdAt: { gte: new Date(`${dayKey(now)}T00:00:00Z`) }, action: { notIn: ['LOGIN_SUCCESS', 'LOGIN_FAILED'] } } }),
    prisma.auditLog.findMany({
      where: { createdAt: { gte: new Date(now.getTime() - 15 * DAY_MS), lt: new Date(`${dayKey(now)}T00:00:00Z`) }, action: { notIn: ['LOGIN_SUCCESS', 'LOGIN_FAILED'] } },
      select: { createdAt: true },
    }),
    getAdoptionReport(),
  ])

  const priorByDay = new Map<string, number>()
  priorAudit.forEach((a) => priorByDay.set(dayKey(a.createdAt), (priorByDay.get(dayKey(a.createdAt)) ?? 0) + 1))
  const abnormal = abnormalVolume(todayAudit, Array.from(priorByDay.values()))
  const degraded = health ? health.services.filter((s) => s.status !== 'ok') : []

  const items: AttentionItem[] = [
    { key: 'outages', severity: 'critical', label: 'Active outages', count: mon?.activeOutages ?? 0, href: '/user-management?tab=monitoring' },
    { key: 'services-degraded', severity: 'critical', label: 'Services not healthy', count: degraded.length, detail: degraded.map((s) => s.name).join(', ') || undefined, href: '/user-management?tab=health' },
    { key: 'repeated-failures', severity: 'critical', label: 'Accounts with repeated failed sign-ins (24h)', count: security.repeatedFailures.length, href: '/reports?tab=security' },
    { key: 'unresolved-issues', severity: 'watch', label: 'Unresolved errors', count: mon?.unresolvedIssues ?? 0, href: '/user-management?tab=monitoring' },
    { key: 'multi-ip', severity: 'watch', label: 'Accounts signed in from several IPs (7 days)', count: security.multiIpAccounts.length, href: '/reports?tab=security' },
    { key: 'audit-volume', severity: 'watch', label: 'Audit volume today is unusually high', count: abnormal ? todayAudit : 0, href: '/reports?tab=governance' },
    { key: 'inactive-accounts', severity: 'info', label: 'Accounts with no sign-in in 30 days', count: Math.max(0, adoption.accounts - adoption.active30), href: '/reports?tab=adoption' },
  ]
  return enrichAttention(rankAttention(items))
}


// ─── Platform operations ─────────────────────────────────────────────────────

export interface OperationsAccess {
  /** report.viewSystemHealth — live service probes. */
  health: boolean
  /** monitoring.view — error-monitoring and deployment caches. */
  monitoring: boolean
  /** report.viewDatabaseMetrics — storage sizes in probe details. */
  database: boolean
}

/** Probe details that expose storage sizes or raw provider errors. */
const SIZE_BEARING_SERVICES = new Set(['Neon PostgreSQL', 'Cloudflare R2 Storage'])

/**
 * Platform health from persisted operational data and live probes only.
 * Reads the monitoring caches directly and never triggers a sync, so opening a
 * report cannot change what it reports. Sections the caller may not see are
 * null, and what the system does not record is listed in `notRecorded`.
 */
export async function getOperationsReport(access: OperationsAccess): Promise<ApiOperationsReport> {
  const now = new Date()
  const d1 = new Date(now.getTime() - DAY_MS)
  const d7 = new Date(now.getTime() - 7 * DAY_MS)
  const vercelConfigured = isVercelMonitoringConfigured()

  const [health, syncRows, pending, audit24, audit7] = await Promise.all([
    access.health ? safe(getSystemHealth) : Promise.resolve(null),
    access.monitoring ? prisma.monitoringSyncState.findMany() : Promise.resolve(null),
    prisma.pendingAction.findMany({ where: { status: 'PENDING' }, select: { entityType: true, createdAt: true, expiresAt: true } }),
    prisma.auditLog.count({ where: { createdAt: { gte: d1 } } }),
    prisma.auditLog.count({ where: { createdAt: { gte: d7 } } }),
  ])

  const sync = syncRows ? syncFreshness(syncRows, now) : null
  const sentrySynced = sync ? sync.find((r) => r.key === 'issues')?.status !== 'never' : false

  const useVercel = access.monitoring && vercelConfigured
  const useSentry = access.monitoring && sentrySynced
  const errorWhere = (since: Date) => ({ level: { in: ['error', 'fatal'] }, timestamp: { gte: since } })
  const [deployRows, errorRows, errors24h, errors7d, alertRows, unacked, oldestLog, issueRows, topIssues] = await Promise.all([
    useVercel ? prisma.vercelDeploymentCache.findMany({ orderBy: { createdAtVercel: 'desc' }, take: 50 }) : Promise.resolve([]),
    // Rows feed the hourly chart and top routes; the headline counts below are exact counts.
    useVercel
      ? prisma.vercelRuntimeLogCache.findMany({
          where: errorWhere(d7),
          select: { level: true, timestamp: true, requestPath: true, responseStatusCode: true },
          orderBy: { timestamp: 'desc' },
          take: 5000,
        })
      : Promise.resolve([]),
    useVercel ? prisma.vercelRuntimeLogCache.count({ where: errorWhere(d1) }) : Promise.resolve(0),
    useVercel ? prisma.vercelRuntimeLogCache.count({ where: errorWhere(d7) }) : Promise.resolve(0),
    useVercel ? prisma.vercelAlertEvent.findMany({ where: { acknowledged: false }, orderBy: { occurredAt: 'desc' }, take: 10 }) : Promise.resolve([]),
    useVercel ? prisma.vercelAlertEvent.count({ where: { acknowledged: false } }) : Promise.resolve(0),
    useVercel ? prisma.vercelRuntimeLogCache.findFirst({ orderBy: { timestamp: 'asc' }, select: { timestamp: true } }) : Promise.resolve(null),
    useSentry
      ? prisma.sentryIssueCache.findMany({ where: { status: 'unresolved' }, select: { status: true, isUptimeIssue: true, level: true, firstSeenAt: true } })
      : Promise.resolve([]),
    useSentry
      ? prisma.sentryIssueCache.findMany({
          where: { status: 'unresolved', isUptimeIssue: false },
          orderBy: [{ eventCount: 'desc' }],
          take: 5,
          select: { sentryIssueId: true, title: true, level: true, eventCount: true, userCount: true, lastSeenAt: true },
        })
      : Promise.resolve([]),
  ])

  const dep = summariseDeployments(deployRows)
  const iso = (d: Date | null) => (d ? d.toISOString() : null)
  const backlog = summariseBacklog(pending, now)
  const issues = summariseIssues(issueRows, now)
  const overall = health ? (health.overall as 'healthy' | 'warning' | 'degraded') : null

  return {
    generatedAt: now.toISOString(),
    access,
    overall,
    services: health
      ? health.services.map((svc) => ({
          name: svc.name,
          status: svc.status,
          latencyMs: svc.latencyMs ?? null,
          details: svc.details && (access.database || !SIZE_BEARING_SERVICES.has(svc.name)) ? truncate(svc.details, 200) : null,
        }))
      : null,
    sync,
    deployments: access.monitoring
      ? {
          configured: vercelConfigured,
          recorded: dep.recorded,
          failed: dep.failed,
          failureRate: dep.failureRate,
          latestProduction: dep.latestProduction ? { state: dep.latestProduction.state, at: dep.latestProduction.at.toISOString() } : null,
          lastSuccessfulProductionAt: iso(dep.lastSuccessfulProductionAt),
          recent: deployRows.slice(0, 8).map((d) => ({
            id: d.deploymentId,
            state: d.state,
            target: d.target,
            at: d.createdAtVercel.toISOString(),
            error: d.errorMessage ? truncate(d.errorMessage, 200) : null,
          })),
        }
      : null,
    errors: access.monitoring
      ? {
          configured: vercelConfigured,
          last24h: errors24h,
          last7d: errors7d,
          byHour: errorsByHour(errorRows, now),
          topPaths: topErrorPaths(errorRows),
          unacknowledgedAlerts: unacked,
          alerts: alertRows.map((a) => ({ id: a.id, kind: a.kind, severity: a.severity, message: truncate(a.message, 200), at: a.occurredAt.toISOString() })),
          oldestRecordedAt: iso(oldestLog?.timestamp ?? null),
        }
      : null,
    issues: access.monitoring
      ? {
          configured: sentrySynced,
          unresolved: issues.unresolved,
          activeOutages: issues.activeOutages,
          newLast7d: issues.newLast7d,
          oldestUnresolvedDays: issues.oldestUnresolvedDays,
          byLevel: issues.byLevel,
          top: topIssues.map((i) => ({
            id: i.sentryIssueId,
            title: truncate(i.title, 160),
            level: i.level,
            events: i.eventCount,
            users: i.userCount,
            lastSeenAt: iso(i.lastSeenAt),
          })),
        }
      : null,
    backlog,
    audit: { last24h: audit24, last7d: audit7 },
    notRecorded: NOT_RECORDED.map((n) => ({ ...n })),
  }
}
