import 'server-only'
import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import { isRepeatView } from '@/server/services/analytics/digitalUsageLogic'

/**
 * Record that a viewer opened an approved digital resource. This is the only
 * usage event the library keeps, and the digital-library report is built on it.
 *
 * It never blocks or delays opening the resource: a failure is logged and
 * ignored. A viewer re-opening the same resource within a few minutes counts
 * once, so a page refresh or a re-fetched link does not inflate usage.
 */
export async function recordDigitalResourceView(resourceId: string, viewerUid: string, now: Date = new Date()): Promise<boolean> {
  try {
    const last = await prisma.digitalResourceView.findFirst({
      where: { resourceId, viewerUid },
      orderBy: { viewedAt: 'desc' },
      select: { viewedAt: true },
    })
    if (isRepeatView(last?.viewedAt, now)) return false
    await prisma.digitalResourceView.create({ data: { resourceId, viewerUid, viewedAt: now } })
    return true
  } catch (err) {
    logger.warn({ event: 'digital_resource.view_not_recorded', resourceId, err: err instanceof Error ? err.message : String(err) })
    return false
  }
}
