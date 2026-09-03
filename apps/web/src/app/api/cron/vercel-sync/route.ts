/**
 * apps/web/src/app/api/cron/vercel-sync/route.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Runs the Vercel-native monitoring sync (deployments, runtime
 *   logs, Web Analytics) on demand. NOT registered in vercel.json's crons
 *   block — Vercel Hobby cron is capped at once/day (research doc §1.10),
 *   nowhere near frequent enough to stay ahead of the 1-hour deletion
 *   window on Vercel's own free runtime-log retention (§1.12). Instead,
 *   this route is called every few minutes by the GitHub Actions workflow
 *   at .github/workflows/vercel-monitoring-sync.yml — an external, free
 *   scheduler that isn't subject to Vercel's own cron-frequency limit.
 *
 *   Auth reuses CRON_SECRET (the same bearer secret the existing
 *   /api/cron/daily-tasks route already uses) rather than introducing a
 *   second secret — same trust boundary, one less credential to manage.
 * [DEPENDS ON]: vercelMonitoringService.runScheduledSync, CRON_SECRET
 */
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import * as vercelMonitoringService from '@/server/services/vercelMonitoringService'
import * as Sentry from '@sentry/nextjs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30 // the runtime-logs fetch itself budgets up to ~4s; this leaves real headroom

export async function GET() {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
  }
  const h = await headers()
  if (h.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await vercelMonitoringService.runScheduledSync()
    if (!result.configured) {
      // Not an error — VERCEL_API_TOKEN/VERCEL_PROJECT_ID just aren't set
      // yet (research §3 Phase 1). 200, not 4xx/5xx, so the external
      // scheduler doesn't treat "not configured yet" as a failing run.
      return NextResponse.json({ ok: true, configured: false, ts: new Date().toISOString() })
    }
    return NextResponse.json({ ok: true, ran: 'vercel-sync', ts: new Date().toISOString(), result })
  } catch (err) {
    Sentry.captureException(err, { tags: { cron: 'vercel-sync' } })
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}