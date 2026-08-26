// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'
import { scrubEvent, scrubLog } from '@/lib/sentry-scrub'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Binds Crash-Free Sessions/Users, Apdex, and Releases-count data to real
  // Vercel deployments.
  release: process.env.VERCEL_GIT_COMMIT_SHA,

  // Capture all server-side traces in development, 20% in production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    // Enable logs to be sent to Sentry
  enableLogs: true,

  enabled: process.env.NODE_ENV === 'production',

  // MUST be false — this system holds minors' academic/health/guardian data
  // under the Data Protection Act 2024. Was TRUE, inconsistent with
  // instrumentation-client.ts's own sendDefaultPii:false. Fixed to match.
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: false,

  integrations: [
    // Bridges the existing logger.ts (Pino) calls into Sentry Logs — zero
    // rewrite of any logger.info/warn/error call site anywhere in the app.
    Sentry.pinoIntegration(),
  ],

  // Enrich finance and exam errors with extra context
  beforeSend(event, hint) {
    event = scrubEvent(event)   // PII redaction runs FIRST, then the tagging below
    const err = hint?.originalException
    if (err instanceof Error) {
      // Tag critical financial transaction errors for immediate alerting
      if (err.message.includes('JOURNAL') || err.message.includes('PAYROLL') || err.message.includes('INVOICE')) {
        event.level = 'fatal'
        event.tags  = { ...event.tags, critical_module: 'finance' }
      }
      // Tag exam result release errors
      if (err.message.includes('RESULT') || err.message.includes('PROMOTION')) {
        event.tags = { ...event.tags, critical_module: 'exams' }
      }
    }
    return event
  },
  beforeSendLog: scrubLog,

  initialScope: {
    tags: {
      app:         'sms-malawi',
      layer:       'server',
      environment: process.env.NODE_ENV,
    },
  },
})