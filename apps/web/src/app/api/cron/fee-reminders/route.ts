import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { dailyFeeReminderJob } from '@/server/jobs/feeReminderJob'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const h = await headers()
  if (h.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  await dailyFeeReminderJob()
  return NextResponse.json({ ok: true, ran: 'fee-reminders', ts: new Date().toISOString() })
}