// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture all server-side traces in development, 20% in production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    // Enable logs to be sent to Sentry
  enableLogs: true,

  enabled: process.env.NODE_ENV === 'production',

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,

  // Enrich finance and exam errors with extra context
  beforeSend(event, hint) {
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

  initialScope: {
    tags: {
      app:         'sms-malawi',
      layer:       'server',
      environment: process.env.NODE_ENV,
    },
  },
})