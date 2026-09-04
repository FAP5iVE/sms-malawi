import 'server-only'

/**
 * apps/web/src/lib/ratelimit.ts
 *
 * Express rate limiting for the SMS Malawi API.
 *
 * Stack context — why in-memory is correct here:
 *   This application runs on Firebase Auth + Neon PostgreSQL. Introducing
 *   a third data store (Redis / Upstash) purely for rate limiting would add
 *   infrastructure complexity, a fourth billing relationship, and extra latency
 *   on every API request — none of which is warranted for a school system.
 *
 * Why the "per-Lambda-instance" concern is acceptable for this project:
 *   1. Every authenticated route is gated by Firebase token verification.
 *      A bad actor without a valid token cannot reach any data endpoint at all.
 *      The Vercel platform + Cloudflare (proxy.ts's Strict-Transport-Security)
 *      handle volumetric DDoS before requests reach Lambda.
 *
 *   2. The user base is bounded and known — students + staff at a single school
 *      (hundreds of users, not millions). Distributed counter skew across a
 *      handful of warm Lambda instances is inconsequential at this scale.
 *
 *   3. The rate limits (300 req / 15 min) are generous enough that legitimate
 *      users never approach them under normal operation. The limiter's value
 *      here is catching runaway client loops and accidental hammering, not
 *      repelling coordinated distributed attacks.
 *
 *   4. Should traffic scale beyond a single school (multi-tenancy), or if
 *      a public-facing endpoint is added without Firebase auth, the
 *      createRateLimiter() signature is already compatible with a drop-in
 *      Upstash / Redis replacement — only this file needs to change.
 *
 * Three tiers matching blueprint §5.4:
 *   standard — General authenticated API routes:    300 req / 15 min
 *   auth     — Future unauthenticated endpoints:     10 req /  1 min
 *   cron     — Cron supplementary guard (per-route):  3 req / 10 min
 */

import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit'
import type { Request, RequestHandler } from 'express'

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT IP EXTRACTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Vercel puts the real client IP first in the `x-forwarded-for` chain on
 * every request that reaches this Lambda. express-rate-limit's own default
 * IP detection doesn't trust that automatically — and as of v8, when it
 * also sees the standardized `Forwarded` header (RFC 9110) present and
 * unused, it throws ERR_ERL_FORWARDED_HEADER instead of silently guessing
 * (rightly so: guessing wrong here could mean either rate-limiting every
 * visitor behind Vercel's edge as one shared bucket, or keying on
 * `undefined` and not limiting anyone at all).
 *
 * This extracts the client IP ourselves instead of relying on the
 * library's automatic detection, which sidesteps that check entirely (it
 * only runs inside the library's own default keyGenerator). ipKeyGenerator
 * is express-rate-limit's own helper for normalizing the result — plain
 * IPv6 addresses are unsafe to use as rate-limit keys unnormalized, since
 * a single client can trivially cycle through addresses within its /64.
 *
 * See https://express-rate-limit.github.io/ERR_ERL_FORWARDED_HEADER/
 */
function clientIpKeyGenerator(req: Request): string {
  const forwardedFor = req.headers['x-forwarded-for']
  const first = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(',')[0]
  const ip = first?.trim() || req.ip || req.socket.remoteAddress || 'unknown'
  return ipKeyGenerator(ip)
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER CONFIG
// ─────────────────────────────────────────────────────────────────────────────

export type RateLimitTier = 'standard' | 'auth' | 'cron'

interface TierConfig {
  windowMs:     number
  max:          number
  errorMessage: string
}

const TIER_CONFIG: Record<RateLimitTier, TierConfig> = {
  standard: {
    windowMs:     15 * 60 * 1000,   // 15 minutes
    max:          300,
    errorMessage: 'Too many requests — please slow down.',
  },
  auth: {
    windowMs:     60 * 1000,         // 1 minute
    max:          10,
    errorMessage: 'Too many attempts — please wait a moment.',
  },
  cron: {
    windowMs:     10 * 60 * 1000,   // 10 minutes
    max:          3,
    errorMessage: 'Cron rate limit exceeded.',
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// FACTORY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a configured express-rate-limit middleware for the named tier.
 *
 * The in-memory MemoryStore is per-Lambda-instance on Vercel serverless.
 * This is intentional and acceptable for this project — see module header.
 *
 * The skipSuccessfulRequests option is intentionally false (default):
 *   We count all requests, not just failures. This prevents a pattern where
 *   a client hammers with valid requests to saturate server resources without
 *   triggering the rate limit.
 *
 * @example
 *   // In api-app.ts — applied globally before routes
 *   app.use(createRateLimiter('standard'))
 *
 *   // On a specific unauthenticated route
 *   router.post('/lookup', createRateLimiter('auth'), handler)
 */
export function createRateLimiter(tier: RateLimitTier = 'standard'): RequestHandler {
  const { windowMs, max, errorMessage } = TIER_CONFIG[tier]

  const options: Partial<Options> = {
    windowMs,
    max,
    // RFC 9110 standard rate-limit headers — consumed by API clients and monitoring
    standardHeaders: 'draft-7',
    // Disable legacy X-RateLimit-* headers to reduce response header noise
    legacyHeaders: false,
    // Suppress the express-rate-limit creation-stack warning in production
    validate: { creationStack: false },
    // See clientIpKeyGenerator's own comment above — fixes ERR_ERL_FORWARDED_HEADER
    keyGenerator: clientIpKeyGenerator,
    // Return JSON-formatted error consistent with all other API error responses
    message: { error: errorMessage },
    // Skip rate limiting in test environment to avoid flaky tests
    skip: () => process.env.NODE_ENV === 'test',
  }

  return rateLimit(options)
}