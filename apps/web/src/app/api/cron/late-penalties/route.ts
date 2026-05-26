import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { dailyLatePenaltiesJob } from '@/server/jobs/latePenaltiesJob'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const h = await headers()
  if (h.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await dailyLatePenaltiesJob()
  return NextResponse.json({ ok: true, ran: 'late-penalties', ...result, ts: new Date().toISOString() })
}