import 'server-only'

/**
 * apps/web/src/lib/ratelimit.ts
 *
 * Rate limiting for the SMS Malawi API.
 *
 * [CHANGE TYPE]: REWRITE (Issue 6 — in-memory rate limiting is not a global
 * abuse boundary)
 *
 * What changed, and why
 *   The previous module used express-rate-limit's in-memory store for
 *   everything and argued that per-Lambda-instance counters were acceptable.
 *   That holds for a coarse backstop, but not for operations whose abuse costs
 *   something real: with N warm instances every counter is N times as
 *   generous, and the AI explanation's shared Gemini quota, public e-mail
 *   senders, search, report/export work and bulk jobs all sat behind it.
 *
 *   Now:
 *   • ratelimit-policies.ts is the endpoint inventory — one policy per kind of
 *     operation, keyed by user / IP / identifier / deployment-wide budget.
 *   • Sensitive policies count in Upstash Redis (already provisioned for the
 *     settings cache and audit queue — no new vendor) so a quota is shared by
 *     every instance. Only the coarse global-ip backstop stays in memory.
 *   • Each policy states what happens when Redis is down or unconfigured
 *     (fail-closed 503, or a reduced local limit) and raises an alert. See
 *     ratelimit-core.ts.
 *   • 429s carry Retry-After and nothing else about the limiter.
 *   • Authenticated routes key on the verified uid, not the IP, so a school
 *     behind one NAT is not throttled as a single caller.
 *
 * Usage
 *   // authenticated route — place AFTER verifyAuth so req.user exists
 *   router.post('/x', verifyAuth, requirePermission('…'), rateLimit('ai-explain'), handler)
 *   // public route with a per-address dimension
 *   router.post('/y', rateLimit('public-newsletter', { identifier: emailFromBody }), handler)
 */

import * as Sentry from '@sentry/nextjs'
import type { Request, RequestHandler } from 'express'

import { getRedis } from '@/lib/redis'
import { logger } from '@/lib/logger'
import {
  MemoryStore,
  createLimiterMiddleware,
  createMonitor,
  createRedisStore,
  type EvalCapable,
  type LimiterDeps,
  type LimiterRequest,
  type RateLimitStore,
} from '@/lib/ratelimit-core'
import { RATE_POLICIES, type RatePolicyId } from '@/lib/ratelimit-policies'

export { RATE_POLICIES, type RatePolicyId }

// ─────────────────────────────────────────────────────────────────────────────
// WIRING (real store + monitor)
// ─────────────────────────────────────────────────────────────────────────────

let sharedStoreSingleton: RateLimitStore | null | undefined

/** Redis-backed store, or null when Upstash is not configured. Memoised per instance. */
function getSharedStore(): RateLimitStore | null {
  if (sharedStoreSingleton !== undefined) return sharedStoreSingleton
  const redis = getRedis()
  sharedStoreSingleton = redis ? createRedisStore(redis as unknown as EvalCapable) : null
  return sharedStoreSingleton
}

const monitor = createMonitor({
  warn: (msg, fields) => logger.warn(fields, msg),
  error: (msg, fields) => logger.error(fields, msg),
  alert: (level, msg, fields, error) => {
    try {
      if (error instanceof Error) {
        Sentry.captureException(error, { level, tags: { module: 'ratelimit', policy: String(fields.policyId) }, extra: fields })
      } else {
        Sentry.captureMessage(msg, { level, tags: { module: 'ratelimit', policy: String(fields.policyId) }, extra: fields })
      }
    } catch {
      // Alerting must never break request handling.
    }
  },
})

const memoryStore = new MemoryStore()

const deps: LimiterDeps = {
  sharedStore: getSharedStore,
  memoryStore,
  monitor,
  isProduction: () => process.env.NODE_ENV === 'production',
}

/** Skip in the test environment, as before, so unrelated route tests are not rate limited. */
const skipInTests = () => process.env.NODE_ENV === 'test'

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export interface RateLimitOptions {
  /** Request-derived key for the policy's `identifier` dimension (e.g. a normalised e-mail). */
  identifier?: (req: Request) => string | undefined
}

/** Express middleware enforcing the named policy. */
export function rateLimit(policyId: RatePolicyId, options: RateLimitOptions = {}): RequestHandler {
  const mw = createLimiterMiddleware(RATE_POLICIES[policyId], deps, {
    skip: skipInTests,
    ...(options.identifier
      ? { identifier: (req: LimiterRequest) => options.identifier!(req as unknown as Request) }
      : {}),
  })
  return ((req, res, next) => {
    void mw(req as unknown as LimiterRequest, res as never, next)
  }) as RequestHandler
}

/**
 * Normalised e-mail from `req.body.email`, for the `identifier` dimension of
 * public e-mail-sending endpoints. Returns undefined for anything that does
 * not look like a string address (the schema validation after it rejects it).
 */
export function emailIdentifier(req: Request): string | undefined {
  const raw = (req.body as { email?: unknown } | undefined)?.email
  if (typeof raw !== 'string') return undefined
  const v = raw.trim().toLowerCase()
  return v.length > 0 && v.length <= 254 ? v : undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY TIER API (kept so existing imports keep compiling)
// ─────────────────────────────────────────────────────────────────────────────

/** @deprecated Use rateLimit(policyId) with a named policy from ratelimit-policies.ts. */
export type RateLimitTier = 'standard' | 'auth' | 'cron' | 'ai'

const LEGACY_TIER: Record<RateLimitTier, RatePolicyId> = {
  standard: 'global-ip',
  auth: 'login-telemetry',
  cron: 'cron',
  ai: 'ai-explain',
}

/** @deprecated Use rateLimit(policyId). */
export function createRateLimiter(tier: RateLimitTier = 'standard'): RequestHandler {
  return rateLimit(LEGACY_TIER[tier])
}

/** Test seam: clears this instance's in-memory counters. */
export function _resetRateLimitMemoryForTests(): void {
  memoryStore.clear()
}
