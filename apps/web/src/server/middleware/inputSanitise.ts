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

// ─────────────────────────────────────────────────────────────────────────────
// ERROR HANDLER
// ─────────────────────────────────────────────────────────────────────────────

type AppError = Error & {
  /** HTTP status code — set by route handlers that call next(err) with a status */
  status?: number
  /** express body-parser sets this to 'entity.parse.failed' for malformed JSON */
  type?: string
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
  logger.error({ err, status: err.status }, '[api] Unhandled Express error')

  // ── Prevent double-send if response already started ───────────────────────
  if (res.headersSent) return

  // ── Prisma known request errors (constraint violations, not-found, etc.) ───
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const mapped = PRISMA_ERROR_MAP[err.code]
    res
      .status(mapped?.status ?? 400)
      .json({ error: mapped?.message ?? 'Database constraint error.' })
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
