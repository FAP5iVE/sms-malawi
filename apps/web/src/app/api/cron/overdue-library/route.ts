/**
 * apps/web/src/app/api/cron/overdue-library/route.ts
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
import { headers } from 'next/headers'
import { overdueLibraryJob } from '@/server/jobs/overdueLibraryJob'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Server misconfigured.' }, { status: 500 })
  }
  const h = await headers()
  if (h.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await overdueLibraryJob()
  return NextResponse.json({ ok: true, ran: 'overdue-library', ts: new Date().toISOString() })
}