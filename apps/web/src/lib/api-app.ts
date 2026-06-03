import 'server-only'

import express, { type Request, type Response, type NextFunction } from 'express'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { Prisma } from '@prisma/client'

import { studentsRouter }      from '@/server/routes/students'
import { classesRouter }       from '@/server/routes/classes'
import { applicationsRouter }  from '@/server/routes/applications'
import { assignmentsRouter }   from '@/server/routes/assignments'
import { timetableRouter }     from '@/server/routes/timetable'
import { financesRouter }      from '@/server/routes/finances'
import { payrollRouter }       from '@/server/routes/payroll'
import { examsRouter }         from '@/server/routes/exams'
import { announcementsRouter } from '@/server/routes/announcements'
import { reportsRouter }       from '@/server/routes/reports'
import { usersRouter }         from '@/server/routes/users'
import { healthRouter }        from '@/server/routes/health'
import { hrRouter }            from '@/server/routes/hr'
import { libraryRouter }       from '@/server/routes/library'
import { logger }              from '@/lib/logger'
import { settingsRouter }      from '@/server/routes/settings'
import { auditRouter }         from '@/server/routes/audit'
import { pendingActionsRouter }from '@/server/routes/pendingActions'
import { notificationsRouter } from '@/server/routes/notifications'

// ─── RATE LIMIT CONFIGURATION ────────────────────────────
// ⚠  The default MemoryStore is per-Lambda-instance and therefore NOT
// shared across Vercel's concurrent function invocations.  This is
// acceptable for now but should be replaced with Upstash Redis via
// @upstash/ratelimit in Phase B for true per-IP enforcement.

const standardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { creationStack: false },
  message: { error: 'Too many requests — please slow down.' },
})

// ─── CORS CONFIGURATION ───────────────────────────────────
// Only allow the explicit production domain and localhost.
// VERCEL_URL is intentionally excluded: it changes per deployment and
// could allow cross-deployment access from preview branches.
function buildCorsMiddleware() {
  const allowedOrigins = new Set<string>(
    [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      process.env.NEXT_PUBLIC_APP_URL,
    ].filter(Boolean) as string[]
  )

  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin ?? ''

    if (allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
    }

    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET,POST,PATCH,DELETE,OPTIONS'
    )
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type,Authorization'
    )
    res.setHeader('Access-Control-Max-Age', '86400') // 24 h preflight cache

    if (req.method === 'OPTIONS') {
      res.sendStatus(204)
      return
    }

    next()
  }
}

// ─── ERROR HANDLER ───────────────────────────────────────
// Intercepts all errors from route handlers and:
//   • Logs the full error internally (Sentry + logger)
//   • Returns a sanitised, human-readable message to the client
//   • Never leaks Prisma internals, table names, or query fragments
type AppError = Error & { status?: number }

function globalErrorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Always log the full error server-side (Sentry captures these via
  // the Sentry Next.js SDK's automatic Express instrumentation)
  logger.error({ err, status: err.status }, 'API error')

  // ── Prisma known errors (constraint violations, not-found, etc.)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const PRISMA_CLIENT_MESSAGES: Record<string, { status: number; message: string }> = {
      P2002: { status: 409, message: 'A record with this value already exists.' },
      P2025: { status: 404, message: 'The requested record was not found.' },
      P2003: { status: 400, message: 'A related record referenced here does not exist.' },
      P2014: { status: 400, message: 'This operation would break a data integrity rule.' },
      P2016: { status: 400, message: 'Query interpretation error. Check the request data.' },
      P2017: { status: 400, message: 'Records are not connected. Check relationship data.' },
      P2021: { status: 500, message: 'A required database table was not found.' },
      P2022: { status: 500, message: 'A required database column was not found.' },
    }
    const known = PRISMA_CLIENT_MESSAGES[err.code]
    res
      .status(known?.status ?? 400)
      .json({ error: known?.message ?? 'Database constraint error.' })
    return
  }

  // ── Prisma validation errors (bad query construction)
  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({ error: 'Invalid data provided to the database.' })
    return
  }

  // ── Prisma initialisation errors
  if (err instanceof Prisma.PrismaClientInitializationError) {
    res.status(503).json({ error: 'Database connection unavailable. Please try again shortly.' })
    return
  }

  // ── Express body-parser errors (malformed JSON)
  if ('type' in err && (err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Request body is not valid JSON.' })
    return
  }

  // ── All other errors
  const statusCode = err.status ?? 500
  const message =
    process.env.NODE_ENV === 'production'
      ? statusCode >= 500
        ? 'An internal server error occurred.'
        : (err.message ?? 'Request failed.')
      : (err.message ?? 'Internal error')

  res.status(statusCode).json({ error: message })
}

// ─── APP FACTORY ─────────────────────────────────────────

export function createApiApp() {
  const app = express()

  // ── Security headers (defence-in-depth alongside proxy.ts)
  app.use(
    helmet({
      // CSP is managed at the Next.js layer — disable here to avoid
      // conflicts with page-level meta CSP tags
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  )

  // ── Body parsing — tight global limit; upload routes override locally
  app.use(express.json({ limit: '50kb' }))

  // ── Rate limiting
  app.use(standardLimiter)

  // ── CORS
  app.use(buildCorsMiddleware())

  // ── Routes
  app.use('/students',      studentsRouter)
  app.use('/classes',       classesRouter)
  app.use('/applications',  applicationsRouter)
  app.use('/assignments',   assignmentsRouter)   // ← was missing (INT-026)
  app.use('/timetable',     timetableRouter)
  app.use('/finances',      financesRouter)
  app.use('/payroll',       payrollRouter)
  app.use('/exams',         examsRouter)
  app.use('/announcements', announcementsRouter)
  app.use('/reports',       reportsRouter)
  app.use('/users',         usersRouter)
  app.use('/health',        healthRouter)
  app.use('/settings',      settingsRouter)
  app.use('/audit',         auditRouter)
  app.use('/pending-actions', pendingActionsRouter)
  app.use('/notifications',   notificationsRouter)
  app.use('/hr',            hrRouter)
  app.use('/library',       libraryRouter)

  // ── 404 fallback
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Route not found.' })
  })

  // ── Global error handler (must be last and have 4 params)
  app.use(globalErrorHandler)

  return app
}