import 'server-only'

/**
 * apps/web/src/server/middleware/inputSanitise.ts
 *
 * Global Express error handler — extracted from api-app.ts.
 *
 * Responsibilities:
 *   1. Log the full error server-side (pino + Sentry via automatic instrumentation).
 *   2. Map Prisma-specific errors (constraint violations, not-found, etc.) to
 *      safe, human-readable HTTP responses. Never leak table names, column names,
 *      query fragments, or raw Prisma error codes to the client.
 *   3. Map body-parser JSON parse failures to a clean 400 response.
 *   4. In production: suppress all 5xx error.message values — return a generic
 *      "internal server error" string instead.
 *   5. In development: pass error.message through so developers see the real cause.
 *
 * This extraction serves:
 *   • Testability — globalErrorHandler can be unit tested in isolation.
 *   • Reuse — could be applied to multiple Express apps (e.g., a webhooks sub-app).
 *   • Architecture compliance — middleware lives in server/middleware/ per design.
 *
 * Usage:
 *   import { globalErrorHandler } from '@/server/middleware/inputSanitise'
 *   // Mount LAST in the Express app — after all routes and the 404 handler.
 *   app.use(globalErrorHandler)
 *
 * Phase A9 — extracted from api-app.ts globalErrorHandler inline function.
 *
 * [CHANGE TYPE]: TARGETED EDIT (R3 — Gateway Hardening), two changes:
 *   (1) The top-of-function logger.error() call previously passed the raw
 *       error object wholesale, including Prisma's `.meta` field — which,
 *       for a P2002 unique-constraint violation, contains the literal
 *       offending value (e.g. the actual duplicate registration number or
 *       email), landing unredacted in server-side log storage. Now logs
 *       `err.meta ? Object.keys(err.meta) : undefined` instead — field
 *       names stay visible for debugging, literal values do not. The
 *       client-facing response was already correctly scrubbed and is
 *       unchanged.
 *   (2) PRISMA_ERROR_MAP's fallback path previously mapped every unmapped
 *       PrismaClientKnownRequestError code to a generic 400 "Database
 *       constraint error." — including infrastructure-class codes like
 *       P2024 (connection-pool timeout) and P2028 (transaction API error),
 *       which are not constraint violations at all and should surface as
 *       a retryable 503, not a 400 implying the request itself was bad.
 */

import type { Request, Response, NextFunction } from 'express'
import { Prisma }  from '@prisma/client'
import { logger }  from '@/lib/logger'

// ─────────────────────────────────────────────────────────────────────────────
// PRISMA ERROR CODE → HTTP RESPONSE MAP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps Prisma's P-prefixed error codes to safe HTTP status + message pairs.
 *
 * Full code list: https://www.prisma.io/docs/reference/api-reference/error-reference
 *
 * Only codes that require specific status codes are listed here.
 * All unmapped codes fall through to the generic 400 "Database constraint error."
 */
const PRISMA_ERROR_MAP: Record<string, { status: number; message: string }> = {
  // ── Unique constraint violation (e.g. duplicate registration number)
  P2002: {
    status:  409,
    message: 'A record with this value already exists.',
  },
  // ── Record not found (e.g. updating a deleted student)
  P2025: {
    status:  404,
    message: 'The requested record was not found.',
  },
  // ── Foreign key constraint violation (related record does not exist)
  P2003: {
    status:  400,
    message: 'A related record referenced here does not exist.',
  },
  // ── Relation violation (breaking a required relation)
  P2014: {
    status:  400,
    message: 'This operation would break a data integrity rule.',
  },
  // ── Query interpretation error (malformed query — developer error)
  P2016: {
    status:  400,
    message: 'Query interpretation error. Check the request data.',
  },
  // ── Records not connected
  P2017: {
    status:  400,
    message: 'Records are not connected. Check relationship data.',
  },
  // ── Missing required table (migration not applied)
  P2021: {
    status:  500,
    message: 'A required database table was not found. Contact support.',
  },
  // ── Missing required column (migration not applied)
  P2022: {
    status:  500,
    message: 'A required database column was not found. Contact support.',
  },
  // ── Transaction conflict (optimistic concurrency)
  P2034: {
    status:  409,
    message: 'Transaction conflict — please retry the operation.',
  },
  // ── Value too long for column
  P2000: {
    status:  400,
    message: 'A provided value is too long for the target field.',
  },
  // ── Null constraint violation (required field missing)
  P2011: {
    status:  400,
    message: 'A required field was not provided.',
  },
  // ── Missing required argument in query
  P2012: {
    status:  400,
    message: 'A required value was missing from the request.',
  },
  // ── Value out of range for column type
  P2020: {
    status:  400,
    message: 'A provided value is out of range for the target field.',
  },
}

/**
 * PrismaClientKnownRequestError codes that represent an infrastructure-class
 * failure — the query itself was well-formed, but the database could not
 * service it in time — rather than a constraint violation caused by the
 * request's own data. These fall through PRISMA_ERROR_MAP (they're
 * deliberately not given a fixed message there, since they're transient)
 * and are mapped to a 503 by globalErrorHandler below instead of the
 * generic 400 fallback every other unmapped code receives.
 */
const INFRASTRUCTURE_PRISMA_CODES = new Set<string>([
  'P2024', // Timed out fetching a new connection from the connection pool
  'P2028', // Transaction API error (e.g. transaction timed out or aborted)
])

// ─────────────────────────────────────────────────────────────────────────────
// ERROR HANDLER
// ─────────────────────────────────────────────────────────────────────────────

type AppError = Error & {
  /** HTTP status code — set by route handlers that call next(err) with a status */
  status?: number
  /** express body-parser sets this to 'entity.parse.failed' for malformed JSON */
  type?: string
  /** Present on Prisma errors (e.g. PrismaClientKnownRequestError.code) */
  code?: string
  /** Present on Prisma errors — may contain literal offending values; never logged wholesale, see below */
  meta?: Record<string, unknown>
}

/**
 * Global Express error handler.
 *
 * Must be registered LAST in the Express middleware chain.
 * Must declare exactly 4 parameters — Express identifies error handlers by arity.
 *
 * @example
 *   app.use(globalErrorHandler) // ← must come after all other app.use() calls
 */
export function globalErrorHandler(
  err:   AppError,
  _req:  Request,
  res:   Response,
  _next: NextFunction
): void {
  // ── Always log the full error server-side ──────────────────────────────────
  // Sentry's automatic Express instrumentation (configured in instrumentation.ts)
  // will also capture this via the error-handling hook.
  // NOTE: err.meta is deliberately reduced to its key names only — for a
  // P2002 unique-constraint violation, err.meta contains the literal
  // offending value (e.g. the actual duplicate registration number or
  // email); field names remain useful for debugging without that value
  // landing unredacted in server-side log storage.
  logger.error({
    err: {
      message:  err.message,
      code:     err.code,
      status:   err.status,
      metaKeys: err.meta ? Object.keys(err.meta) : undefined,
    },
  }, '[api] Unhandled Express error')

  // ── Prevent double-send if response already started ───────────────────────
  if (res.headersSent) return

  // ── Prisma known request errors (constraint violations, not-found, etc.) ───
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = PRISMA_ERROR_MAP[err.code]
    if (mapped) {
      res.status(mapped.status).json({ error: mapped.message })
      return
    }
    // Infrastructure-class failures (e.g. connection-pool timeout) are not
    // constraint violations — a 400 would wrongly imply the request's own
    // data was invalid. Surface these as a retryable 503 instead.
    if (INFRASTRUCTURE_PRISMA_CODES.has(err.code)) {
      res.status(503).json({ error: 'Database temporarily unavailable. Please try again in a moment.' })
      return
    }
    res.status(400).json({ error: 'Database constraint error.' })
    return
  }

  // ── Prisma validation errors (bad query shape — typically a developer error) ─
  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({ error: 'Invalid data provided to the database.' })
    return
  }

  // ── Prisma initialisation errors (connection failure, bad config) ──────────
  if (err instanceof Prisma.PrismaClientInitializationError) {
    res.status(503).json({
      error: 'Database connection unavailable. Please try again in a moment.',
    })
    return
  }

  // ── Prisma raw query errors ────────────────────────────────────────────────
  if (err instanceof Prisma.PrismaClientRustPanicError) {
    res.status(500).json({ error: 'An internal database error occurred.' })
    return
  }

  // ── Express body-parser: malformed JSON request body ──────────────────────
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Request body is not valid JSON.' })
    return
  }

  // ── Express body-parser: request too large ────────────────────────────────
  if (err.type === 'entity.too.large') {
    res.status(413).json({ error: 'Request body is too large.' })
    return
  }

  // ── multer / busboy: file-upload parsing errors ────────────────────────────
  // [PRODUCTION FIX] Every upload.single(...) route in this codebase runs
  // multer BEFORE the route handler's own try/catch — so any error multer
  // or its busboy parser throws (wrong field name, oversized file, a
  // malformed multipart body) skips the handler entirely and lands here.
  // With no case for it, it fell through to the generic 500 branch below,
  // which in production suppresses err.message — so every upload failure
  // of this kind, for every upload route in the app, showed the client
  // nothing but "An internal server error occurred.", with the real reason
  // visible only in server-side logs. multer's own messages don't leak
  // anything sensitive (they describe the request's own shape — a missing
  // field, a size limit, a bad boundary), so they're safe to pass straight
  // through, the same way entity.parse.failed's message already is above.
  if (err.name === 'MulterError') {
    const code = (err as AppError & { code?: string }).code
    const status = code === 'LIMIT_FILE_SIZE' ? 413 : 400
    res.status(status).json({ error: err.message || 'File upload failed.' })
    return
  }
  // busboy itself (not multer) throws a plain Error — not a MulterError —
  // when it can't even start parsing, e.g. a missing/garbled multipart
  // boundary or an unsupported Content-Type. Recognisable by message
  // prefix; also safe to surface verbatim for the same reason as above.
  if (typeof err.message === 'string' && /^(Multipart: |Unsupported content type)/.test(err.message)) {
    res.status(400).json({ error: err.message })
    return
  }

  // ── All other errors ───────────────────────────────────────────────────────
  // Determine HTTP status:
  //   • Use err.status if set by the route handler (e.g., next(Object.assign(new Error(...), { status: 403 })))
  //   • Default to 500
  const statusCode = err.status ?? 500

  // Client-facing message:
  //   • 5xx in production: always generic — never expose internal details
  //   • 4xx in production: pass err.message if set (these are user-facing validation errors)
  //   • Any status in development: pass full err.message for debugging
  const clientMessage =
    process.env.NODE_ENV === 'production'
      ? statusCode >= 500
        ? 'An internal server error occurred.'
        : (err.message ?? 'Request failed.')
      : (err.message ?? 'Internal error')

  res.status(statusCode).json({ error: clientMessage })
}