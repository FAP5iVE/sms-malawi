/**
 * apps/web/src/app/api/webhooks/resend/route.ts
 *
 * [CHANGE TYPE]: NEW FILE (R19).
 *
 * Receives Resend delivery-status webhooks (Svix-signed) and verifies them via
 * lib/email.ts's verifyResendWebhook() — an HMAC-SHA256 Svix signature check
 * with replay protection that was fully implemented but had no route to receive
 * what it was built to verify.
 *
 * Verification is fail-closed: a missing/invalid signature or missing Svix
 * headers returns 401 and the event is discarded. On success we record the
 * delivery outcome to the operational log (minimal scope — no new persistence
 * model is introduced here).
 */

import { NextResponse } from 'next/server'
import { verifyResendWebhook } from '@/lib/email'
import type { ResendWebhookEmailEvent } from '@/lib/email'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<NextResponse> {
  const body = await request.text()

  const svixId        = request.headers.get('svix-id') ?? ''
  const svixTimestamp = request.headers.get('svix-timestamp') ?? ''
  const svixSignature = request.headers.get('svix-signature') ?? ''

  const valid = await verifyResendWebhook(body, svixId, svixTimestamp, svixSignature)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 })
  }

  let event: ResendWebhookEmailEvent
  try {
    event = JSON.parse(body) as ResendWebhookEmailEvent
  } catch {
    return NextResponse.json({ error: 'Malformed webhook payload.' }, { status: 400 })
  }

  logger.info(
    {
      event: 'resend.webhook',
      type: event.type,
      emailId: event.data?.email_id,
      to: event.data?.to,
      bounceType: event.data?.bounce_type,
    },
    `Resend webhook received: ${event.type}`,
  )

  return NextResponse.json({ ok: true })
}
