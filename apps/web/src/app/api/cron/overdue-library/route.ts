import { NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { overdueLibraryJob } from '@/server/jobs/overdueLibraryJob'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const h = await headers()
  if (h.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await overdueLibraryJob()
  return NextResponse.json({ ok: true, ran: 'overdue-library', ts: new Date().toISOString() })
}