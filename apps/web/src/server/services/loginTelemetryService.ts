import 'server-only'

/**
 * apps/web/src/server/services/loginTelemetryService.ts
 *
 * [CHANGE TYPE]: NEW FILE (Issue 5 — failed-login telemetry hardening)
 * [PURPOSE]: Backs POST /auth/log-login-failed, which is deliberately
 *   UNAUTHENTICATED (a failed sign-in has no token to verify). Everything the
 *   caller sends is therefore untrusted input. This service is the single
 *   place that turns that input into an audit event, and it guarantees:
 *
 *   • The client controls NOTHING but the email string it typed. Action,
 *     actor, role, severity and timestamp are assigned here / by the database.
 *   • The submitted email is never recorded as an actor. actorUid and
 *     actorRole are the fixed value 'unauthenticated', and the event carries
 *     `provenance: 'unauthenticated_client_report'` so dashboards can tell it
 *     apart from verified-actor events.
 *   • The raw email is not copied into the audit table. We keep a masked form
 *     (for admin recognisability) and a short keyed fingerprint (to correlate
 *     repeats). Set TELEMETRY_HASH_KEY to make the fingerprint an HMAC;
 *     without it a plain SHA-256 is used.
 *   • Writes are bounded: at most PER_IDENTIFIER_MAX events per identifier per
 *     PER_IDENTIFIER_WINDOW_MS, and at most GLOBAL_MAX_PER_MINUTE events per
 *     server instance per minute. Excess attempts are dropped silently — the
 *     caller always sees the same response, so throttling never reveals
 *     anything. Counters use Upstash Redis when configured (shared across
 *     instances) and fall back to in-process memory otherwise.
 *   • Recording never locks, flags or otherwise affects the account whose
 *     email was submitted — it only appends a bounded audit row.
 *
 *   The action string stays 'LOGIN_FAILED' because analyticsService /
 *   adminAnalytics count that exact value for the login-trend graph.
 */

import { createHash, createHmac } from 'node:crypto'
import { z } from 'zod'
import { getRedis } from '@/lib/redis'
import { logger } from '@/lib/logger'
import * as auditService from '@/server/services/auditService'

// ─── Request schema ──────────────────────────────────────

/** RFC 5321 caps an address at 254 chars. `.strict()` rejects unknown fields
 *  (actorUid, role, severity, ip, timestamp, …) outright. */
export const FailedLoginBodySchema = z
  .object({ email: z.string().trim().min(1).max(254) })
  .strict()

export type FailedLoginBody = z.infer<typeof FailedLoginBodySchema>

// ─── Limits ──────────────────────────────────────────────

export const PER_IDENTIFIER_MAX = 3
export const PER_IDENTIFIER_WINDOW_MS = 15 * 60 * 1000
export const GLOBAL_MAX_PER_MINUTE = 120
const MEMORY_MAP_MAX_ENTRIES = 5000

// ─── Identifier helpers ──────────────────────────────────

export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** "jane.doe@school.mw" → "j***@school.mw". Returns null for anything that
 *  doesn't look like an address, so junk input is never echoed into the log. */
export function maskEmail(normalised: string): string | null {
  if (!LOOKS_LIKE_EMAIL.test(normalised)) return null
  const at = normalised.lastIndexOf('@')
  return `${normalised.slice(0, 1)}***${normalised.slice(at)}`
}

/** Short, non-reversible correlation id for rate-limit keys and repeat
 *  detection. Keyed (HMAC) when TELEMETRY_HASH_KEY is set. */
export function fingerprint(normalised: string): string {
  const key = process.env.TELEMETRY_HASH_KEY
  const digest = key
    ? createHmac('sha256', key).update(normalised).digest('hex')
    : createHash('sha256').update(normalised).digest('hex')
  return digest.slice(0, 16)
}

// ─── Throttling ──────────────────────────────────────────

interface Bucket { count: number; resetAt: number }
const identifierBuckets = new Map<string, Bucket>()
let globalBucket: Bucket = { count: 0, resetAt: 0 }

function bump(map: Map<string, Bucket>, key: string, windowMs: number, now: number): number {
  const existing = map.get(key)
  if (!existing || existing.resetAt <= now) {
    if (map.size >= MEMORY_MAP_MAX_ENTRIES) {
      for (const [k, b] of map) if (b.resetAt <= now) map.delete(k)
      if (map.size >= MEMORY_MAP_MAX_ENTRIES) map.clear() // pathological flood: start over, memory stays bounded
    }
    map.set(key, { count: 1, resetAt: now + windowMs })
    return 1
  }
  existing.count += 1
  return existing.count
}

function withinGlobalCap(now: number): boolean {
  if (globalBucket.resetAt <= now) globalBucket = { count: 0, resetAt: now + 60_000 }
  globalBucket.count += 1
  return globalBucket.count <= GLOBAL_MAX_PER_MINUTE
}

async function withinIdentifierCap(fp: string, now: number): Promise<boolean> {
  const redis = getRedis()
  if (redis) {
    try {
      const key = `login_failed:id:${fp}`
      const n = await redis.incr(key)
      if (n === 1) await redis.expire(key, Math.ceil(PER_IDENTIFIER_WINDOW_MS / 1000))
      return n <= PER_IDENTIFIER_MAX
    } catch (err) {
      logger.warn({ err }, '[loginTelemetry] Redis counter failed — using in-process counter')
    }
  }
  return bump(identifierBuckets, fp, PER_IDENTIFIER_WINDOW_MS, now) <= PER_IDENTIFIER_MAX
}

/** Test seam: clears the in-process counters. */
export function _resetThrottleForTests(): void {
  identifierBuckets.clear()
  globalBucket = { count: 0, resetAt: 0 }
}

// ─── Public API ──────────────────────────────────────────

/**
 * Record one failed-login report. Never throws and never reports whether the
 * event was stored or dropped — the route answers identically either way.
 */
export async function recordFailedLogin(rawEmail: string, now: number = Date.now()): Promise<void> {
  try {
    const normalised = normaliseEmail(rawEmail)
    const fp = fingerprint(normalised)

    if (!withinGlobalCap(now)) return
    if (!(await withinIdentifierCap(fp, now))) return

    await auditService.log({
      action:     'LOGIN_FAILED',
      entityType: 'Auth',
      entityId:   `unauth:${fp}`,
      actorUid:   'unauthenticated',
      actorRole:  'unauthenticated',
      metadata: {
        context: {
          provenance:            'unauthenticated_client_report',
          identifierFingerprint: fp,
          emailMasked:           maskEmail(normalised),
        },
      },
    })
  } catch (err) {
    logger.error({ err }, '[loginTelemetry] recordFailedLogin failed')
  }
}
