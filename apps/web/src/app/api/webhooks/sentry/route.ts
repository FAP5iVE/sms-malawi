/**
 * apps/web/src/app/api/webhooks/sentry/route.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Receives Sentry's `issue` resource webhooks. Mirrors
 *   webhooks/resend/route.ts's exact verification shape — HMAC signature
 *   check, fail-closed. On success, upserts into SentryIssueCache via
 *   monitoringService so the admin dashboard reads real-time data without
 *   polling Sentry directly on every page view.
 * [DEPENDS ON]: monitoringService.verifyWebhookSignature/handleIssueWebhook
 */
import { NextResponse } from 'next/server'
import { verifyWebhookSignature, handleIssueWebhook } from '@/server/services/monitoringService'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<NextResponse> {
  const rawBody = Buffer.from(await request.arrayBuffer())
  const signature = request.headers.get('sentry-hook-signature') ?? undefined
  const resource = request.headers.get('sentry-hook-resource')

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 })
  }

  let payload: { action: string; data?: { issue?: unknown } }
  try {
    payload = JSON.parse(rawBody.toString('utf-8'))
  } catch {
    return NextResponse.json({ error: 'Malformed webhook payload.' }, { status: 400 })
  }

  // Only the 'issue' resource is subscribed to — Errors and Uptime Outages
  // both arrive here, since an Uptime Issue is just an Issue.
  if (resource === 'issue' && payload.data?.issue) {
    await handleIssueWebhook(payload.action, payload.data.issue as Parameters<typeof handleIssueWebhook>[1])
  } else {
    logger.info({ event: 'sentry.webhook.ignored', resource, action: payload.action })
  }

  return NextResponse.json({ ok: true })
}