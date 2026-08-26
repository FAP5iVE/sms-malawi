/**
 * apps/web/src/instrumentation-client.ts — Sentry browser initialisation.
 *
 * [CHANGE TYPE]: MAJOR REWRITE (R19 — Sentry consolidation).
 *
 * This is the ONE client-side Sentry init file. Next.js auto-loads
 * `instrumentation-client.ts`; the former `sentry.client.config.ts` was NOT
 * auto-loaded and has been deleted. Its GDPR-conscious settings (masked
 * session replay, conservative sampling, production-only gating, the
 * fetch-cancellation beforeSend filter) are merged here so the app no longer
 * ships unmasked replay with full PII at 100% trace sampling in every
 * environment for a system handling student, financial and HR/payroll data.
 *
 * The DSN is read from NEXT_PUBLIC_SENTRY_DSN (never a hardcoded literal),
 * matching sentry.server.config.ts.
 */

import * as Sentry from '@sentry/nextjs'
import { scrubEvent, scrubLog } from '@/lib/sentry-scrub'

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn: SENTRY_DSN,

  // Only send events in production — no reporting from local dev / preview.
  enabled: process.env.NODE_ENV === 'production',

  // Performance tracing — 10% of transactions in production, all in dev.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Session replay — 1% of all sessions, 100% of sessions with an error.
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,

  // Do NOT attach personally identifiable information to events.
  sendDefaultPii: false,

  integrations: [
    Sentry.replayIntegration({
      // Mask all text and inputs for privacy (GDPR compliance).
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Filter out known non-actionable errors.
  beforeSend(event) {
    event = scrubEvent(event)
    // Ignore network errors from client-side fetch cancellations.
    if (event.exception?.values?.[0]?.type === 'TypeError') {
      const msg = event.exception.values[0].value ?? ''
      if (msg.includes('Failed to fetch') || msg.includes('Load failed')) {
        return null
      }
    }
    return event
  },
  beforeSendLog: scrubLog,

  // Tag all events with app version / environment.
  initialScope: {
    tags: {
      app: 'sms-malawi',
      layer: 'client',
      environment: process.env.NODE_ENV,
    },
  },
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart