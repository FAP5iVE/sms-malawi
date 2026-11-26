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

/**
 * [Issue 7 — error behaviour] Decides what text a client may see.
 *
 * `err.message` is only ever safe to return when the thrower MEANT it for the
 * user — i.e. a deliberate 4xx carrying an explicit `.status` (404 "Not
 * found", 409 "already approved", RequestCostError, SelfReviewError, …).
 * Everything else is an unexpected failure whose text can contain SQL / table
 * and column names (Prisma), provider response bodies (Cloudflare R2, Algolia,
 * Resend, Firebase) or internal paths, so it is replaced by a fixed message.
 * The real error still goes to Sentry and the (redacted) server log.
 */
const GENERIC_SERVER_MESSAGE = 'An internal server error occurred.'
const GENERIC_REQUEST_MESSAGE = 'The request could not be completed.'

function isInfrastructureError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const name = (err as { name?: unknown }).name
  const code = (err as { code?: unknown }).code
  return (
    (typeof name === 'string' && /^(PrismaClient|FirebaseError|ResendError)/.test(name)) ||
    // AWS SDK (Cloudflare R2) service errors: named after the S3 error code (NoSuchKey, AccessDenied, ...)
    // and always carrying a `$metadata` block.
    (typeof (err as { $metadata?: unknown }).$metadata === 'object') ||
    // firebase-admin / google-gax style codes, e.g. "auth/…", "app/…"
    (typeof code === 'string' && /^(auth|app|messaging|storage)\//.test(code))
  )
}

export function clientMessageFor(
  err: unknown,
  status: number,
  opts: Pick<SendErrorOptions, 'publicMessage' | 'fallbackMessage'> = {},
): string {
  if (opts.publicMessage) return opts.publicMessage
  if (!(err instanceof Error)) return opts.fallbackMessage ?? 'Unexpected error.'
  if (isInfrastructureError(err)) return status >= 500 ? GENERIC_SERVER_MESSAGE : GENERIC_REQUEST_MESSAGE
  // 4xx errors (explicit `.status`, or the route's own `defaultStatus` for
  // validation-style catch-alls) were written to be shown. A 5xx never is,
  // outside local development.
  if (status < 500) return err.message
  return process.env.NODE_ENV === 'development' ? err.message : GENERIC_SERVER_MESSAGE
}

export function sendError(res: Response, err: unknown, opts: SendErrorOptions = {}): Response {
  const status = (err as { status?: number } | null)?.status ?? opts.defaultStatus ?? 500
  const message = clientMessageFor(err, status, opts)

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