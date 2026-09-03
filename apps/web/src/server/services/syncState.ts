/**
 * apps/web/src/server/services/syncState.ts
 *
 * [CHANGE TYPE]: NEW FILE (extracted from monitoringService.ts)
 * [PURPOSE]: Shared "on-demand sync" primitive — claim + run a sync only
 *   when its slice of the cache is stale, backed by MonitoringSyncState.
 *   This logic was originally private to monitoringService.ts (Sentry
 *   issues/alerts/rollup); it's pulled out here so
 *   vercelMonitoringService.ts can reuse the exact same staleness-claim
 *   logic for deployments/runtime-logs/analytics instead of a second
 *   copy-paste. Same table, more `syncType` rows — see
 *   docs/vercel-native-monitoring-research.md §3 Phase 3.
 * [DEPENDS ON]: prisma (MonitoringSyncState model), logger
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'

/**
 * Atomically claims the right to run `type`'s sync right now. Returns
 * true at most once per `staleMs` window — a concurrent request that
 * loses the race gets false back and just reads whatever's cached, which
 * the winning request is in the middle of refreshing.
 */
export async function claimSync(type: string, staleMs: number): Promise<boolean> {
  const staleBefore = new Date(Date.now() - staleMs)
  const claimed = await prisma.monitoringSyncState.updateMany({
    where: { syncType: type, lastSyncedAt: { lt: staleBefore } },
    data: { lastSyncedAt: new Date() },
  })
  if (claimed.count > 0) return true

  // No row at all yet — first sync ever for this type on this install.
  try {
    await prisma.monitoringSyncState.create({ data: { syncType: type, lastSyncedAt: new Date() } })
    return true
  } catch {
    return false // lost the race to a concurrent request that created it first
  }
}

/**
 * Runs `fn` only if `claimSync(type, staleMs)` grants the claim. Failures
 * are logged and recorded on the sync-state row but never thrown — a
 * failed background refresh must not break the page that triggered it;
 * the next request past the stale window retries naturally.
 */
export async function ensureFresh(type: string, staleMs: number, fn: () => Promise<void>): Promise<void> {
  if (!(await claimSync(type, staleMs))) return
  try {
    await fn()
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error({ event: 'monitoring.sync.on_demand_failed', type, err: message })
    await prisma.monitoringSyncState.update({ where: { syncType: type }, data: { lastError: message } }).catch(() => {})
  }
}