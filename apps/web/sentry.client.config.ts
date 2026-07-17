import * as Sentry from '@sentry/nextjs'

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN

Sentry.init({
  dsn: SENTRY_DSN,

  // Performance tracing — capture 10% of transactions in production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Session replay — 1% of all sessions, 100% of sessions with errors
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      // Mask all text and inputs for privacy (GDPR compliance)
      maskAllText:   true,
      blockAllMedia: true,
    }),
  ],

  // Only send events in production
  enabled: process.env.NODE_ENV === 'production',

  // Filter out known non-actionable errors
  beforeSend(event) {
    // Ignore network errors from client-side fetch cancellations
    if (event.exception?.values?.[0]?.type === 'TypeError') {
      const msg = event.exception.values[0].value ?? ''
      if (msg.includes('Failed to fetch') || msg.includes('Load failed')) {
        return null
      }
    }
    return event
  },

  // Tag all events with app version
  initialScope: {
    tags: {
      app:         'sms-malawi',
      environment: process.env.NODE_ENV,
    },
  },
})