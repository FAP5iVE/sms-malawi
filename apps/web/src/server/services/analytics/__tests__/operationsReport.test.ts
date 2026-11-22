/**
 * Platform operations report — runs getOperationsReport against a controlled
 * dataset. Checks the figures, that sections are withheld (null) for callers
 * without the matching permission, that an unconfigured or never-synced source
 * reads "not configured" instead of zero, and that the report never invents
 * backup, uptime or job figures.
 */
import { describe, it, expect, vi } from 'vitest'
import { makeFakePrisma } from '../../../../../test/fakePrisma'

const NOW = Date.now()
const minutesAgo = (m: number) => new Date(NOW - m * 60_000)
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000)

const state = vi.hoisted(() => ({ vercelConfigured: true }))

vi.mock('@/lib/prisma', () => ({
  prisma: makeFakePrisma({
    auditLog: [
      { createdAt: minutesAgo(30) },
      { createdAt: minutesAgo(600) },
      { createdAt: daysAgo(3) },
      { createdAt: daysAgo(20) },
    ],
    pendingAction: [
      { status: 'PENDING', entityType: 'Expense', createdAt: daysAgo(8), expiresAt: daysAgo(1) },
      { status: 'PENDING', entityType: 'Leave', createdAt: daysAgo(2), expiresAt: null },
      { status: 'APPROVED', entityType: 'Expense', createdAt: daysAgo(40), expiresAt: null },
    ],
    monitoringSyncState: [
      { syncType: 'vercel_deployments', lastSyncedAt: minutesAgo(4), lastError: null },
      { syncType: 'vercel_runtime_logs', lastSyncedAt: minutesAgo(120), lastError: 'timeout' },
      { syncType: 'issues', lastSyncedAt: minutesAgo(10), lastError: null },
    ],
    vercelDeploymentCache: [
      { deploymentId: 'd1', state: 'READY', target: 'production', errorMessage: null, createdAtVercel: minutesAgo(60), readyAtVercel: minutesAgo(58) },
      { deploymentId: 'd2', state: 'ERROR', target: 'production', errorMessage: 'build failed', createdAtVercel: minutesAgo(10), readyAtVercel: null },
      { deploymentId: 'd3', state: 'READY', target: null, errorMessage: null, createdAtVercel: minutesAgo(300), readyAtVercel: minutesAgo(298) },
    ],
    vercelRuntimeLogCache: [
      { level: 'error', timestamp: minutesAgo(20), requestPath: '/api/students/123', responseStatusCode: 500 },
      { level: 'fatal', timestamp: minutesAgo(40), requestPath: '/api/students/456', responseStatusCode: 500 },
      { level: 'error', timestamp: daysAgo(3), requestPath: '/api/fees', responseStatusCode: 500 },
      { level: 'warning', timestamp: minutesAgo(5), requestPath: '/api/fees', responseStatusCode: 400 },
    ],
    vercelAlertEvent: [
      { id: 'a1', kind: 'deployment_failed', severity: 'critical', message: 'Deployment failed: build failed', occurredAt: minutesAgo(10), acknowledged: false },
      { id: 'a2', kind: 'error_spike', severity: 'warning', message: 'old', occurredAt: daysAgo(5), acknowledged: true },
    ],
    sentryIssueCache: [
      { sentryIssueId: 's1', title: 'TypeError in fees', level: 'error', status: 'unresolved', isUptimeIssue: false, eventCount: 40, userCount: 3, firstSeenAt: daysAgo(12), lastSeenAt: minutesAgo(30) },
      { sentryIssueId: 's2', title: 'Site down', level: 'error', status: 'unresolved', isUptimeIssue: true, eventCount: 1, userCount: 0, firstSeenAt: daysAgo(1), lastSeenAt: minutesAgo(30) },
      { sentryIssueId: 's3', title: 'Old fixed', level: 'error', status: 'resolved', isUptimeIssue: false, eventCount: 9, userCount: 1, firstSeenAt: daysAgo(50), lastSeenAt: daysAgo(40) },
    ],
  }),
}))

vi.mock('@/server/services/systemHealthService', () => ({
  getSystemHealth: async () => ({
    overall: 'warning',
    services: [
      { name: 'Neon PostgreSQL', status: 'ok', latencyMs: 12, details: '40 MB used' },
      { name: 'Push (FCM)', status: 'degraded', details: 'not configured' },
    ],
    actionsLast24h: 2,
    activeUsersLastHr: 1,
    checkedAt: new Date().toISOString(),
  }),
}))
vi.mock('@/server/services/monitoringService', () => ({ getSummary: async () => ({}) }))
vi.mock('@/server/services/sessionService', () => ({ ACTIVE_GRACE_MS: 180_000, getSessionSummary: async () => ({}) }))
vi.mock('@/server/services/vercelMonitoringService', () => ({ isVercelMonitoringConfigured: () => state.vercelConfigured }))

const { getOperationsReport } = await import ( '../adminAnalytics')

const FULL = { health: true, monitoring: true, database: true }

describe('operations report — controlled dataset', () => {
  it('reports figures that match the data', async () => {
    const r = await getOperationsReport(FULL)
    expect(r.overall).toBe('warning')
    expect(r.services).toHaveLength(2)
    expect(r.audit).toEqual({ last24h: 2, last7d: 3 })
    expect(r.backlog).toMatchObject({ pending: 2, pastExpiry: 1, oldestPendingDays: 8 })
    expect(r.deployments).toMatchObject({ configured: true, recorded: 3, failed: 1, failureRate: 33.3 })
    expect(r.deployments?.latestProduction?.state).toBe('ERROR')
    expect(r.errors).toMatchObject({ configured: true, last24h: 2, last7d: 3, unacknowledgedAlerts: 1 })
    expect(r.errors?.byHour.reduce((s, h) => s + h.count, 0)).toBe(3 - 1) // the 3-day-old error is outside the 24 h chart
    expect(r.errors?.topPaths[0]).toEqual({ path: '/api/students/:id', count: 2 })
    expect(r.issues).toMatchObject({ configured: true, unresolved: 1, activeOutages: 1, newLast7d: 0, oldestUnresolvedDays: 12 })
    expect(r.issues?.top.map((i) => i.id)).toEqual(['s1'])
  })

  it('shows sync freshness per source, including never-run and failing ones', async () => {
    const r = await getOperationsReport(FULL)
    const by = Object.fromEntries((r.sync ?? []).map((s) => [s.key, s.status]))
    expect(by).toMatchObject({
      vercel_deployments: 'ok',
      vercel_runtime_logs: 'failing',
      vercel_analytics: 'never',
      issues: 'ok',
      alerts: 'never',
    })
  })

  it('withholds every restricted section (null) from a caller with no health or monitoring access', async () => {
    const r = await getOperationsReport({ health: false, monitoring: false, database: false })
    expect(r.services).toBeNull()
    expect(r.sync).toBeNull()
    expect(r.deployments).toBeNull()
    expect(r.errors).toBeNull()
    expect(r.issues).toBeNull()
    expect(r.overall).toBeNull()
  })

  it('hides storage sizes from callers without database-metric access but keeps status', async () => {
    const r = await getOperationsReport({ health: true, monitoring: false, database: false })
    const neon = r.services?.find((s) => s.name === 'Neon PostgreSQL')
    expect(neon).toMatchObject({ status: 'ok', latencyMs: 12, details: null })
    expect(r.services?.find((s) => s.name === 'Push (FCM)')?.details).toBe('not configured')
    expect(r.deployments).toBeNull()
  })

  it('reads "not configured", not zero, when deployment monitoring is off', async () => {
    state.vercelConfigured = false
    try {
      const r = await getOperationsReport(FULL)
      expect(r.deployments).toMatchObject({ configured: false, recorded: 0, failureRate: null, recent: [] })
      expect(r.errors).toMatchObject({ configured: false, unacknowledgedAlerts: 0 })
    } finally {
      state.vercelConfigured = true
    }
  })

  it('never fabricates uptime, backup or job figures and says why they are missing', async () => {
    const r = await getOperationsReport(FULL)
    expect(JSON.stringify(r)).not.toMatch(/uptimePercent|backupLast|jobRuns/)
    expect(r.notRecorded.map((n) => n.key)).toEqual(['backups', 'jobs', 'queues', 'email', 'uptime'])
  })
})
