import 'server-only'

/*
 * apps/web/src/lib/api-app.ts
 *
 * Express application factory for the SMS Malawi API.
 *
 * Middleware pipeline (in order):
 *   1. trust proxy      — Vercel's edge is a single trusted hop; required for
 *                          express-rate-limit's keyGenerator to see the real client IP
 *   2. Helmet            — security headers (defence-in-depth alongside proxy.ts)
 *   3. express.json      — body parsing with tight 50kb global limit
 *   4. CORS              — explicit origin allowlist (no VERCEL_URL wildcards)
 *   5. createRateLimiter('standard') — express-rate-limit, in-memory store
 *   6. Routes            — all domain routers
 *   7. 404 handler       — catch-all for undefined routes
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
 *
 * [CHANGE TYPE]: TARGETED EDIT (R3 — Gateway Hardening), three independent changes:
 *   (1) Mount promotionRouter. promotion.ts's own header comment has always
 *       documented this exact mount line, but it was never actually added —
 *       every request to /promotion/* fell through to the generic 404
 *       handler regardless of promotion.ts's own internal correctness.
 *       Mounted with verifyAuth ahead of requireRole (promotion.ts's GET
 *       /:year route has no auth middleware of its own at all — it relies
 *       entirely on this mount-level gate; the two POST routes layer their
 *       own narrower requireRole(['admin','exam_officer']) on top of this
 *       mount-level requireRole(['admin','exam_officer','high_rank'])).
 *   (2) CORS: 'http://localhost:3000'/'http://127.0.0.1:3000' are now only
 *       added to the allowlist outside production — buildCorsMiddleware()'s
 *       own comment already documents avoiding VERCEL_URL wildcards for the
 *       same reason; leaving the two dev-origin entries unconditional in a
 *       production build was the one narrower gap actually present.
 *   (3) Added a comment cross-referencing route.ts's exported-handler list
 *       as the other hand-maintained copy of the Access-Control-Allow-Methods
 *       set — full extraction to a shared constant is deferred to R16
 *       (Constants Centralization), the correct home for this class of fix.
 *
 * [CHANGE TYPE]: TARGETED EDIT (R4 — Auth/Security Domain), a third and
 *   fourth edit to this file, applied on top of R3's promotion-mount and
 *   CORS changes:
 *   (1) app.set('trust proxy', 1) added immediately after the Express app
 *       is instantiated, before any middleware — without it, req.ip (and
 *       therefore express-rate-limit's keyGenerator) reads Vercel's own
 *       edge hop, not the real client, so every request looked like it came
 *       from the same address and the rate limiter could never distinguish
 *       two different clients. Paired with the x-forwarded-for fix in
 *       app/api/[[...slug]]/route.ts (this app runs behind that route's
 *       mockReq, not a real TCP socket — Express's own trust-proxy IP
 *       resolution reads req.socket.remoteAddress first and only consults
 *       x-forwarded-for when the immediate connection is a trusted proxy,
 *       which this setting is what declares).
 *   (2) The global audit-logger-injection middleware mount is removed, and
 *       server/middleware/auditLog.ts is deleted outright (see that file's
 *       own removal for the exhaustive-grep justification: its three
 *       exported helper functions and the req property they set have zero
 *       callers anywhere in the 23-router system — every real audit-logging
 *       call site already calls auditService.log()/.logAsync() directly).
 *
 * [CHANGE TYPE]: TARGETED EDIT (R6 — Academics II), a further edit on top
 *   of R3's and R4's changes: removed the standalone timetable route's
 *   import and its `/timetable` mount (server/routes/timetable.ts is
 *   deleted in this phase — confirmed dead: the only frontend consumer of
 *   timetable data, timetable/page.tsx, has always called classes.ts's
 *   nested /:id/timetable route, never this standalone one, and this
 *   route's own POST additionally skipped the room-double-booking check
 *   the nested route correctly performs). Added the new attendance
 *   router's import and its `/attendance` mount — verifyAuth is applied
 *   inside attendance.ts itself (its own router-wide verifyAuth call),
 *   matching how every other domain router except /promotion is mounted bare.
 */

import express, { type Request, type Response, type NextFunction } from 'express'
import * as Sentry from '@sentry/nextjs'
import helmet from 'helmet'

import { verifyAuth, requireRole } from '@/lib/verifyAuth'
import { studentsRouter }      from '@/server/routes/students'
import { classesRouter }       from '@/server/routes/classes'
import { applicationsRouter }  from '@/server/routes/applications'
import { assignmentsRouter }   from '@/server/routes/assignments'
import { attendanceRouter }    from '@/server/routes/attendance'
import { financesRouter }      from '@/server/routes/finances'
import { payrollRouter }       from '@/server/routes/payroll'
import { examsRouter }         from '@/server/routes/exams'
import { announcementsRouter } from '@/server/routes/announcements'
import { reportsRouter }       from '@/server/routes/reports'
import { usersRouter }         from '@/server/routes/users'
import { healthRouter }        from '@/server/routes/health'
import { hrRouter }            from '@/server/routes/hr'
import { libraryRouter }       from '@/server/routes/library'
import { galleryRouter }       from '@/server/routes/gallery'
import { authRouter }          from '@/server/routes/auth'
import { settingsRouter }      from '@/server/routes/settings'
import { auditRouter }         from '@/server/routes/audit'
import { pendingActionsRouter }from '@/server/routes/pendingActions'
import { notificationsRouter } from '@/server/routes/notifications'
import { promotionRouter }     from '@/server/routes/promotion'
import { createRateLimiter }   from '@/lib/ratelimit'
import { logger }              from '@/lib/logger'
import { globalErrorHandler }  from '@/server/middleware/inputSanitise'
import { analyticsRouter }     from '@/server/routes/analytics'
import { searchRouter }        from '@/server/routes/search'
import { calendarRouter }      from '@/server/routes/calendar'
import { algoliaAdminRouter }  from '@/server/routes/algoliaAdmin'
import { publicRouter }        from '@/server/routes/public'
import { holidaysRouter }      from '@/server/routes/holidays'
import { placementsRouter }    from '@/server/routes/placements'



// ─── CORS ────────────────────────────────────────────────────────────────────
// Only allow the explicit production domain and localhost.
// VERCEL_URL is intentionally excluded — it changes per deployment and would
// permit CORS requests from arbitrary preview branch deployments.
// All allowed origins are set explicitly; no wildcard '*' is ever used
// because credentialed requests (Authorization header) require specific origins.

function buildCorsMiddleware() {
  const allowedOrigins = new Set<string>(
    [
      ...(process.env.NODE_ENV !== 'production'
        ? ['http://localhost:3000', 'http://127.0.0.1:3000']
        : []),
      process.env.NEXT_PUBLIC_APP_URL,
    ].filter(Boolean) as string[]
  )

  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin ?? ''

    if (allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
    }

    // NOTE: this method set is hand-maintained in two places — here, and in
    // the exported-handler list in app/api/[[...slug]]/route.ts. Keep them
    // in sync until both are extracted to a shared constant in R16
    // (Constants Centralization) — the correct home for this class of fix.
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

  // ── 1. Trust proxy ────────────────────────────────────────────────────────
  // Vercel's edge is a single trusted hop. Without this, req.ip resolves to
  // the edge's own address for every request, and express-rate-limit's
  // default keyGenerator (which reads req.ip) can never distinguish two
  // different clients. Must be set before any middleware that reads req.ip —
  // in particular createRateLimiter('standard') below.
  app.set('trust proxy', 1)

  // ── 2. Security headers ───────────────────────────────────────────────────
  // CSP and COEP are handled at the Next.js edge layer (proxy.ts) — disabling
  // here prevents conflicts with page-level meta CSP and Next.js image optimisation.
  app.use(
    helmet({
      contentSecurityPolicy:    false,
      crossOriginEmbedderPolicy: false,
    })
  )

  // ── 3. Body parsing ───────────────────────────────────────────────────────
  // 50 kb global limit. Upload routes (digital library, expense receipts,
  // assignment submissions) override locally with express.raw({ limit: '25mb' })
  // on their specific router — see individual route files.
  app.use(express.json({ limit: '50kb' }))

  // ── 4. CORS ───────────────────────────────────────────────────────────────
  app.use(buildCorsMiddleware())

  // ── 5. Rate limiting ──────────────────────────────────────────────────────
  // createRateLimiter('standard') wraps express-rate-limit with a clean
  // three-tier config. In-memory store is correct for this stack — Firebase
  // Auth gates every authenticated route, and the bounded school user base
  // makes per-Lambda-instance counters acceptable. See lib/ratelimit.ts.
  app.use(createRateLimiter('standard'))

  // ── 6. Domain routers ─────────────────────────────────────────────────────
  app.use('/students',        studentsRouter)
  app.use('/classes',         classesRouter)
  app.use('/applications',    applicationsRouter)
  app.use('/assignments',     assignmentsRouter)
  app.use('/attendance',      attendanceRouter)
  app.use('/finances',        financesRouter)
  app.use('/payroll',         payrollRouter)
  app.use('/exams',           examsRouter)
  app.use('/announcements',   announcementsRouter)
  app.use('/reports',         reportsRouter)
  app.use('/users',           usersRouter)
  app.use('/health',          healthRouter)
  // R15: settings.ts's own header documents this exact mount shape
  // (`app.use('/settings', verifyAuth, settingsRouter)`) and every route
  // inside it reads req.user via requireRole()/req.user!.uid — but the
  // verifyAuth middleware was never actually applied here, so every
  // settings request 403'd (requireRole with no req.user) or crashed
  // (/settings/notifications' req.user!.uid). Required for R15's
  // SETTING_KEYS-driven header term badge and dashboard year/term reads.
  app.use('/settings',        verifyAuth, settingsRouter)
  app.use('/audit',           auditRouter)
  app.use('/pending-actions', pendingActionsRouter)
  app.use('/notifications',   notificationsRouter)
  app.use('/promotion',       verifyAuth, requireRole(['admin', 'exam_officer', 'high_rank']), promotionRouter)
  app.use('/hr',              hrRouter)
  app.use('/library',         libraryRouter)
  app.use('/gallery',         galleryRouter)
  app.use('/auth',            authRouter)
  app.use('/analytics',       analyticsRouter)
  app.use('/search',          searchRouter)
  app.use('/calendar',        calendarRouter)
  app.use('/algolia-admin',   algoliaAdminRouter)
  app.use('/public',          publicRouter)
  app.use('/holidays',        holidaysRouter)
  app.use('/placements',      placementsRouter)

  // ── 7. 404 fallback ───────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Route not found.' })
  })

  // ── Sentry Express error capture ──────────────────────────────────────────
  // Registered AFTER all domain routers and BEFORE globalErrorHandler, per
  // Sentry's documented Express integration. globalErrorHandler responds to
  // every thrown error before the Next.js Route Handler boundary, so without
  // this the 23 domain routers' errors were invisible to Sentry.
  Sentry.setupExpressErrorHandler(app)

  // ── 8. Global error handler ───────────────────────────────────────────────
  // Must be last and must declare exactly 4 parameters for Express to treat
  // it as an error handler rather than a regular middleware.
  // Extracted to server/middleware/inputSanitise.ts (Phase A9).
  app.use(globalErrorHandler)

  return app
}