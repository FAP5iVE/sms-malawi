import 'server-only'

/**
 * apps/web/src/lib/api-app.ts
 *
 * Express application factory for the SMS Malawi API.
 *
 * Middleware pipeline (in order):
 *   1. Helmet          — security headers (defence-in-depth alongside proxy.ts)
 *   2. express.json    — body parsing with tight 50kb global limit
 *   3. CORS            — explicit origin allowlist (no VERCEL_URL wildcards)
 *   4. createRateLimiter('standard') — express-rate-limit, in-memory store
 *   5. injectAuditLogger — injects req.auditLog() into every request so route
 *                          handlers can write audit trail entries with one call
 *   6. Routes          — all domain routers
 *   7. 404 handler     — catch-all for undefined routes
 *   8. globalErrorHandler — Prisma error mapping + production message sanitisation
 *
 * Phase A/B fixes applied in this revision:
 *   A5 — Replaced the inline standardLimiter definition with createRateLimiter()
 *        from lib/ratelimit.ts. Keeps express-rate-limit (correct for this stack —
 *        Firebase Auth + Neon, no Redis provider). The factory encapsulates
 *        three-tier config and is documented with the rationale for in-memory store.
 *   A9 — globalErrorHandler extracted to server/middleware/inputSanitise.ts.
 *        Prisma error map expanded with 6 additional error codes (P2034, P2000,
 *        P2011, P2012, P2020, PrismaClientRustPanicError).
 *   B3 — injectAuditLogger mounted globally after CORS/rate-limit, before routes.
 *        Every route handler now has req.auditLog() available immediately.
 *        Route handlers call req.auditLog({ action, entityType, entityId }) after
 *        a successful mutation. High-severity operations use req.auditLog.critical().
 */

import express, { type Request, type Response, type NextFunction } from 'express'
import helmet from 'helmet'

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
import { settingsRouter }      from '@/server/routes/settings'
import { auditRouter }         from '@/server/routes/audit'
import { pendingActionsRouter }from '@/server/routes/pendingActions'
import { notificationsRouter } from '@/server/routes/notifications'

import { createRateLimiter }   from '@/lib/ratelimit'
import { logger }              from '@/lib/logger'
import { injectAuditLogger }   from '@/server/middleware/auditLog'
import { globalErrorHandler }  from '@/server/middleware/inputSanitise'

// ─── CORS ────────────────────────────────────────────────────────────────────
// Only allow the explicit production domain and localhost.
// VERCEL_URL is intentionally excluded — it changes per deployment and would
// permit CORS requests from arbitrary preview branch deployments.
// All allowed origins are set explicitly; no wildcard '*' is ever used
// because credentialed requests (Authorization header) require specific origins.

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

    res.setHeader('Access-Control-Allow-Methods',  'GET,POST,PATCH,DELETE,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers',  'Content-Type,Authorization')
    res.setHeader('Access-Control-Max-Age',        '86400') // 24 h preflight cache

    if (req.method === 'OPTIONS') {
      res.sendStatus(204)
      return
    }

    next()
  }
}

// ─── APP FACTORY ─────────────────────────────────────────────────────────────

export function createApiApp() {
  const app = express()

  // ── 1. Security headers ───────────────────────────────────────────────────
  // CSP and COEP are handled at the Next.js edge layer (proxy.ts) — disabling
  // here prevents conflicts with page-level meta CSP and Next.js image optimisation.
  app.use(
    helmet({
      contentSecurityPolicy:    false,
      crossOriginEmbedderPolicy: false,
    })
  )

  // ── 2. Body parsing ───────────────────────────────────────────────────────
  // 50 kb global limit. Upload routes (digital library, expense receipts,
  // assignment submissions) override locally with express.raw({ limit: '25mb' })
  // on their specific router — see individual route files.
  app.use(express.json({ limit: '50kb' }))

  // ── 3. CORS ───────────────────────────────────────────────────────────────
  app.use(buildCorsMiddleware())

  // ── 4. Rate limiting ──────────────────────────────────────────────────────
  // createRateLimiter('standard') wraps express-rate-limit with a clean
  // three-tier config. In-memory store is correct for this stack — Firebase
  // Auth gates every authenticated route, and the bounded school user base
  // makes per-Lambda-instance counters acceptable. See lib/ratelimit.ts.
  app.use(createRateLimiter('standard'))

  // ── 5. Audit logger injection ─────────────────────────────────────────────
  // Injects req.auditLog() into every request passing through this app.
  // Route handlers call req.auditLog({ action, entityType, entityId, metadata })
  // after a successful mutation to write a permanent audit trail entry.
  //
  // req.user may not be set at this point (verifyAuth runs per-router, not globally
  // so that public health routes don't require auth). injectAuditLogger handles
  // this gracefully — it defaults actorUid to 'anonymous' for unauthenticated requests.
  //
  // For automatic audit logging without explicit handler code, see:
  //   auditPost(), auditPatch(), auditDelete() in server/middleware/auditLog.ts
  app.use(injectAuditLogger)

  // ── 6. Domain routers ─────────────────────────────────────────────────────
  app.use('/students',        studentsRouter)
  app.use('/classes',         classesRouter)
  app.use('/applications',    applicationsRouter)
  app.use('/assignments',     assignmentsRouter)
  app.use('/timetable',       timetableRouter)
  app.use('/finances',        financesRouter)
  app.use('/payroll',         payrollRouter)
  app.use('/exams',           examsRouter)
  app.use('/announcements',   announcementsRouter)
  app.use('/reports',         reportsRouter)
  app.use('/users',           usersRouter)
  app.use('/health',          healthRouter)
  app.use('/settings',        settingsRouter)
  app.use('/audit',           auditRouter)
  app.use('/pending-actions', pendingActionsRouter)
  app.use('/notifications',   notificationsRouter)
  app.use('/hr',              hrRouter)
  app.use('/library',         libraryRouter)

  // ── 7. 404 fallback ───────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Route not found.' })
  })

  // ── 8. Global error handler ───────────────────────────────────────────────
  // Must be last and must declare exactly 4 parameters for Express to treat
  // it as an error handler rather than a regular middleware.
  // Extracted to server/middleware/inputSanitise.ts (Phase A9).
  app.use(globalErrorHandler)

  return app
}
