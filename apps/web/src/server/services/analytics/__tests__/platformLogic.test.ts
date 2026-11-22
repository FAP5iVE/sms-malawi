import { describe, it, expect } from 'vitest'
import {
  NOT_RECORDED,
  errorsByHour,
  normalisePath,
  summariseBacklog,
  summariseDeployments,
  summariseIssues,
  syncFreshness,
  topErrorPaths,
} from '../platformLogic'

const NOW = new Date('2026-03-10T12:30:00Z')
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000)
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000)

describe('syncFreshness', () => {
  it('reports every known source, marking absent ones "never" rather than healthy', () => {
    const rows = syncFreshness([], NOW)
    expect(rows.map((r) => r.key)).toEqual(['vercel_deployments', 'vercel_runtime_logs', 'vercel_analytics', 'issues', 'alerts', 'rollup'])
    expect(rows.every((r) => r.status === 'never' && r.lastAttemptAt === null && r.ageMinutes === null)).toBe(true)
  })

  it('is ok when recent, stale past its threshold, failing when an error is recorded', () => {
    const rows = syncFreshness(
      [
        { syncType: 'vercel_deployments', lastSyncedAt: minutesAgo(5), lastError: null },
        { syncType: 'vercel_runtime_logs', lastSyncedAt: minutesAgo(90), lastError: null },
        { syncType: 'vercel_analytics', lastSyncedAt: minutesAgo(5), lastError: 'Vercel API 500' },
      ],
      NOW,
    )
    const by = Object.fromEntries(rows.map((r) => [r.key, r]))
    expect(by.vercel_deployments).toMatchObject({ status: 'ok', ageMinutes: 5 })
    expect(by.vercel_runtime_logs).toMatchObject({ status: 'stale', ageMinutes: 90 })
    expect(by.vercel_analytics).toMatchObject({ status: 'failing', lastError: 'Vercel API 500' })
  })

  it('does not call an on-demand source stale just because nobody opened monitoring for a day', () => {
    const rows = syncFreshness([{ syncType: 'issues', lastSyncedAt: minutesAgo(24 * 60), lastError: null }], NOW)
    expect(rows.find((r) => r.key === 'issues')?.status).toBe('ok')
    const old = syncFreshness([{ syncType: 'issues', lastSyncedAt: daysAgo(10), lastError: null }], NOW)
    expect(old.find((r) => r.key === 'issues')?.status).toBe('stale')
  })

  it('truncates very long error text', () => {
    const rows = syncFreshness([{ syncType: 'alerts', lastSyncedAt: minutesAgo(1), lastError: 'x'.repeat(1000) }], NOW)
    expect(rows.find((r) => r.key === 'alerts')?.lastError?.length).toBe(240)
  })

  it('never reports a negative age for a clock-skewed timestamp', () => {
    const rows = syncFreshness([{ syncType: 'rollup', lastSyncedAt: new Date(NOW.getTime() + 5 * 60_000), lastError: null }], NOW)
    expect(rows.find((r) => r.key === 'rollup')?.ageMinutes).toBe(0)
  })
})

describe('summariseDeployments', () => {
  const dep = (id: string, state: string, target: string | null, agoMin: number, ready = true) => ({
    deploymentId: id,
    state,
    target,
    errorMessage: state === 'ERROR' ? 'build failed' : null,
    createdAtVercel: minutesAgo(agoMin),
    readyAtVercel: ready && state === 'READY' ? minutesAgo(agoMin - 2) : null,
  })

  it('failure rate is failed ÷ finished; cancelled and in-flight builds are excluded', () => {
    const s = summariseDeployments([
      dep('a', 'READY', 'production', 10),
      dep('b', 'ERROR', 'production', 20),
      dep('c', 'READY', null, 30),
      dep('d', 'CANCELED', null, 40),
      dep('e', 'BUILDING', null, 5),
    ])
    expect(s.recorded).toBe(5)
    expect(s.failed).toBe(1)
    expect(s.failureRate).toBe(33.3)
  })

  it('has a null failure rate — not 0% — when nothing has finished', () => {
    const s = summariseDeployments([dep('e', 'BUILDING', null, 5)])
    expect(s.failureRate).toBeNull()
    expect(summariseDeployments([]).failureRate).toBeNull()
  })

  it('reports the latest production state and the last successful production deploy', () => {
    const s = summariseDeployments([
      dep('new', 'ERROR', 'production', 5),
      dep('good', 'READY', 'production', 60),
      dep('preview', 'READY', null, 1),
    ])
    expect(s.latestProduction?.state).toBe('ERROR')
    expect(s.lastSuccessfulProductionAt?.getTime()).toBe(minutesAgo(58).getTime())
  })

  it('has no production fields when only previews exist', () => {
    const s = summariseDeployments([dep('p', 'READY', null, 5)])
    expect(s.latestProduction).toBeNull()
    expect(s.lastSuccessfulProductionAt).toBeNull()
  })
})

describe('runtime errors', () => {
  const log = (level: string, agoMin: number, path: string | null = '/api/x', code: number | null = 500) => ({
    level,
    timestamp: minutesAgo(agoMin),
    requestPath: path,
    responseStatusCode: code,
  })

  it('collapses ids so one route is one row, and ignores query strings', () => {
    expect(normalisePath('/api/students/12345?x=1')).toBe('/api/students/:id')
    expect(normalisePath('/api/students/cmabc123def456ghi789jkl')).toBe('/api/students/:id')
    expect(normalisePath(null)).toBe('(no request path)')
    expect(normalisePath('/')).toBe('/')
  })

  it('counts only error and fatal logs per route, most frequent first', () => {
    const top = topErrorPaths([
      log('error', 1, '/api/a/1'),
      log('fatal', 2, '/api/a/2'),
      log('error', 3, '/api/b'),
      log('warning', 4, '/api/b'),
      log('info', 5, '/api/b'),
    ])
    expect(top).toEqual([{ path: '/api/a/:id', count: 2 }, { path: '/api/b', count: 1 }])
  })

  it('buckets errors into 24 hourly slots ending at the current hour and ignores older rows', () => {
    const rows = [log('error', 10), log('error', 20), log('error', 90), log('error', 60 * 30), log('warning', 5)]
    const b = errorsByHour(rows, NOW)
    expect(b).toHaveLength(24)
    expect(b[23]).toMatchObject({ label: '12:00', count: 2 })
    expect(b[22]).toMatchObject({ label: '11:00', count: 1 })
    expect(b.reduce((s, x) => s + x.count, 0)).toBe(3)
  })
})

describe('summariseBacklog', () => {
  it('reports null oldest age — not 0 — when nothing is pending', () => {
    const s = summariseBacklog([], NOW)
    expect(s).toMatchObject({ pending: 0, pastExpiry: 0, oldestPendingDays: null, byType: [] })
  })

  it('counts pending, past-expiry and the oldest age, grouped by entity type', () => {
    const s = summariseBacklog(
      [
        { entityType: 'Expense', createdAt: daysAgo(9), expiresAt: daysAgo(2) },
        { entityType: 'Expense', createdAt: daysAgo(1), expiresAt: new Date(NOW.getTime() + 86_400_000) },
        { entityType: 'Leave', createdAt: daysAgo(3), expiresAt: null },
      ],
      NOW,
    )
    expect(s.pending).toBe(3)
    expect(s.pastExpiry).toBe(1)
    expect(s.oldestPendingDays).toBe(9)
    expect(s.byType).toEqual([{ label: 'Expense', count: 2 }, { label: 'Leave', count: 1 }])
  })
})

describe('summariseIssues', () => {
  it('separates uptime outages from errors and ignores resolved issues', () => {
    const s = summariseIssues(
      [
        { status: 'unresolved', isUptimeIssue: false, level: 'error', firstSeenAt: daysAgo(30) },
        { status: 'unresolved', isUptimeIssue: false, level: 'warning', firstSeenAt: daysAgo(2) },
        { status: 'unresolved', isUptimeIssue: true, level: 'error', firstSeenAt: daysAgo(1) },
        { status: 'resolved', isUptimeIssue: false, level: 'error', firstSeenAt: daysAgo(40) },
      ],
      NOW,
    )
    expect(s).toMatchObject({ unresolved: 2, activeOutages: 1, newLast7d: 1, oldestUnresolvedDays: 30 })
    expect(s.byLevel).toEqual([{ label: 'error', count: 1 }, { label: 'warning', count: 1 }])
  })

  it('has a null oldest age when there are no unresolved errors', () => {
    expect(summariseIssues([], NOW).oldestUnresolvedDays).toBeNull()
  })
})

describe('NOT_RECORDED', () => {
  it('lists the facts the platform cannot report, with no fabricated uptime or backup figures', () => {
    expect(NOT_RECORDED.map((n) => n.key)).toEqual(['backups', 'jobs', 'queues', 'email', 'uptime'])
    expect(NOT_RECORDED.every((n) => n.reason.length > 20)).toBe(true)
  })
})
