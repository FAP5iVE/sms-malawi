/**
 * apps/web/src/app/api/cron/fee-reminders/route.ts
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R3 — Gateway Hardening
 * [PURPOSE]: The previous check compared the Authorization header directly
 *   against `Bearer ${process.env.CRON_SECRET}` with no guard for
 *   CRON_SECRET being unset — in that case the comparison target becomes
 *   the literal string "Bearer undefined", which a request literally
 *   sending that header value would pass. Now fails closed: an unset
 *   CRON_SECRET rejects every request outright (500), before the bearer
 *   token is even compared.
 * [DEPENDS ON]: none
 */
import { NextResponse } from 'next/server'
import { guardCron } from '@/lib/cronAuth'
import { dailyFeeReminderJob } from '@/server/jobs/feeReminderJob'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const denied = await guardCron()
  if (denied) return denied
  await dailyFeeReminderJob()
  return NextResponse.json({ ok: true, ran: 'fee-reminders', ts: new Date().toISOString() })
}