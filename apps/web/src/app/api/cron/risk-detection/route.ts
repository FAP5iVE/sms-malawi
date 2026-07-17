/**
 * apps/web/src/app/api/cron/risk-detection/route.ts
 *
 * [CHANGE TYPE]: NEW FILE (path chosen to match what vercel.json already
 *   schedules, rather than changing infra config to match either of the
 *   two other, equally-nonexistent paths referenced in riskJob.ts's own
 *   original documentation)
 * [R-PHASE]: R8 — Academics IV: Report Cards, Transcripts, Promotion &
 *   Risk Assessment
 * [PURPOSE]: Thin Next.js cron-route wrapper following the same shape as
 *   the five R3-hardened cron routes: verifies CRON_SECRET using R3's
 *   fail-closed pattern (an unset CRON_SECRET rejects every request
 *   outright, rather than comparing against the literal string "Bearer
 *   undefined"), then calls runRiskAssessmentJob() for the current
 *   academic year/term. Before this file existed, vercel.json's
 *   "risk-detection" schedule entry pointed at a route that had never
 *   been created — every scheduled invocation would 404.
 * [DEPENDS ON]: apps/web/src/server/services/riskJob.ts
 *   (runRiskAssessmentJob), apps/web/src/server/services/settingsService.ts
 */
import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { runRiskAssessmentJob } from '@/server/services/riskJob'
import * as settingsService from '@/server/services/settingsService'
import { SETTING_KEYS } from '@shared/types/settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
  }
  const h = await headers()
  if (h.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { current_academic_year: academicYear, current_term: academicTerm } =
    await settingsService.getMany([SETTING_KEYS.CURRENT_ACADEMIC_YEAR, SETTING_KEYS.CURRENT_TERM])

  const result = await runRiskAssessmentJob(academicTerm, academicYear)

  return NextResponse.json({
    ok: true,
    ran: 'risk-detection',
    ts: new Date().toISOString(),
    ...result,
  })
}
