/**
 * apps/web/src/app/api/cron/scheduled-announcements/route.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PHASE]: N5 — Push efficiency + scheduling (AUDIT §7 N5, Finding WF-2)
 * [PURPOSE]: announcementService.createAnnouncement() sets status SCHEDULED
 *   for a future scheduledFor, but nothing ever promoted those to PUBLISHED
 *   when their time arrived — a scheduled announcement would sit SCHEDULED
 *   forever. This cron promotes every due SCHEDULED announcement to PUBLISHED
 *   (firing the notification fan-out for each), mirroring the existing cron
 *   routes' CRON_SECRET fail-closed auth.
 *
 *   Schedule this in vercel.json alongside the other crons (e.g. every 15
 *   minutes, or hourly — the resolution just bounds how late a scheduled
 *   publish can fire).
 * [DEPENDS ON]: apps/web/src/server/services/announcementService.ts
 *   (promoteDueScheduled)
 */
import { NextResponse } from 'next/server'
import { guardCron } from '@/lib/cronAuth'
import { promoteDueScheduled } from '@/server/services/announcementService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const denied = await guardCron()
  if (denied) return denied
  const result = await promoteDueScheduled()
  return NextResponse.json({
    ok: true,
    ran: 'scheduled-announcements',
    promoted: result.promoted,
    ts: new Date().toISOString(),
  })
}