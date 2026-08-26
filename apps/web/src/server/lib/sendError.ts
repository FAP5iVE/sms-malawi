/**
 * apps/web/src/server/lib/sendError.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: The ONE shared error-response helper for every Express route
 *   in this app. Promotes placements.ts's local sendError() (previously the
 *   only version, undeclared anywhere else) to a shared, Sentry-aware
 *   implementation — identical behaviour, same status>=500 threshold, but
 *   the 500+ path now actually reaches Sentry instead of only a local
 *   console.error (or, in the other 12 route files, nothing at all).
 *   Sentry.setupExpressErrorHandler(app) (already wired in api-app.ts) only
 *   captures errors that reach Express's own error chain via next(err) or
 *   an uncaught throw — every one of these catch-and-respond sites bypasses
 *   that entirely, which is the real gap this file closes.
 * [DEPENDS ON]: @sentry/nextjs (captureException — already initialized
 *   globally by sentry.server.config.ts; no separate client needed here)
 */
import type { Response } from 'express'
import * as Sentry from '@sentry/nextjs'
import { logger } from '@/lib/logger'

interface SendErrorOptions {
  /** Extra searchable tags — e.g. { module: 'exams', academicYear, term } */
  tags?: Record<string, string | number>
  /**
   * Fallback HTTP status when `err` carries no `.status` property.
   * Defaults to 500. Several existing route files default to 400 instead
   * (e.g. calendar.ts, settings.ts) — pass 400 there to preserve their
   * exact existing behaviour rather than silently promoting every
   * unstatused error to a 500.
   */
  defaultStatus?: number
  /**
   * Overrides the response body's `error` message with a fixed, friendly
   * string instead of the raw `err.message` — several existing routes
   * (notifications.ts, applications.ts) deliberately never expose the raw
   * error text to the client. Sentry still receives the real `err` object
   * either way; only the HTTP response text is affected.
   */
  publicMessage?: string
  /**
   * Fallback message used ONLY when `err` is not an `Error` instance —
   * distinct from `publicMessage`, which always overrides. Several
   * settings.ts routes show the real `err.message` when available but fall
   * back to a domain-specific string (e.g. 'Invalid finance settings
   * data.') for the rare non-Error-throw case. Defaults to 'Unexpected
   * error.' if omitted.
   */
  fallbackMessage?: string
  /** Extra fields merged into the JSON response body — e.g. settings.ts's
      { validationErrors } alongside { error }. */
  extraFields?: Record<string, unknown>
}

export function sendError(res: Response, err: unknown, opts: SendErrorOptions = {}): Response {
  const status = (err as { status?: number } | null)?.status ?? opts.defaultStatus ?? 500
  const message = opts.publicMessage ?? (err instanceof Error ? err.message : (opts.fallbackMessage ?? 'Unexpected error.'))

  if (status >= 500) {
    // 5xx = a genuine, unexpected failure — worth an on-call's attention.
    // Tagged with http_status + whatever module-specific context the
    // caller passes, so Sentry's Issues list is filterable by module from
    // day one (e.g. "Errors by Module" saved views).
    Sentry.captureException(err, { tags: { http_status: status, ...opts.tags } })
    logger.error({ event: 'route.error', status, message, ...opts.tags })
  }
  // 4xx (validation, not-found, forbidden, etc.) are normal, expected
  // outcomes, not incidents — deliberately NOT sent to Sentry. Sending
  // every client validation error to Sentry would flood Issues with noise
  // instead of signal.
  return res.status(status).json({ error: message, ...opts.extraFields })
}