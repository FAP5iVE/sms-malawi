/**
 * apps/web/src/lib/redis.ts — shared Upstash Redis client (server-only).
 *
 * [CHANGE TYPE]: NEW FILE (R19 — Upstash wiring).
 *
 * A single lazily-constructed Upstash Redis (REST) client, reused by
 * settingsService's cross-instance settings cache and auditService's durable
 * audit-log queue. Upstash is OPTIONAL: when UPSTASH_REDIS_REST_URL /
 * UPSTASH_REDIS_REST_TOKEN are unset (local dev, or an unconfigured
 * deployment), getRedis() returns null and callers fall back to their existing
 * in-process behaviour, so nothing breaks without Redis configured.
 *
 * The REST client is safe in Vercel's serverless/edge runtimes (no persistent
 * socket), which is why it — not ioredis — is used here.
 */

import 'server-only'

import { Redis } from '@upstash/redis'
import { logger } from '@/lib/logger'

let _redis: Redis | null | undefined

/**
 * Returns the shared Upstash Redis client, or null when Upstash is not
 * configured. The result is memoised (including the null case) so the env
 * check and client construction run at most once per Lambda instance.
 */
export function getRedis(): Redis | null {
  if (_redis !== undefined) return _redis

  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN

  if (!url || !token) {
    _redis = null
    return _redis
  }

  try {
    _redis = new Redis({ url, token })
  } catch (err) {
    logger.error({ err }, '[redis] Failed to construct Upstash client — falling back to in-process behaviour')
    _redis = null
  }
  return _redis
}
