import 'server-only'

/**
 * apps/web/src/server/middleware/idempotency.ts
 *
 * [CHANGE TYPE]: NEW FILE (Issue 6)
 *
 * Express wiring for lib/idempotency-core.ts: Upstash Redis when configured
 * (shared across serverless instances), otherwise a per-instance memory store
 * (local dev, or best-effort when Redis is absent). Place AFTER verifyAuth.
 *
 *   router.post('/run', verifyAuth, requirePermission('…'), rateLimit('bulk-mutation'),
 *               idempotent(), handler)
 *
 * Clients should send `Idempotency-Key: <uuid>` generated once per user action
 * and reused on retries of that action. Without it, concurrent identical
 * requests are still rejected (409) — see idempotency-core.ts.
 */

import * as Sentry from '@sentry/nextjs'
import type { Request, RequestHandler } from 'express'

import { getRedis } from '@/lib/redis'
import { logger } from '@/lib/logger'
import {
  MemoryIdempotencyStore,
  createIdempotencyMiddleware,
  createRedisIdempotencyStore,
  type IdempotencyStore,
  type IdemRequest,
  type RedisLike,
} from '@/lib/idempotency-core'

const memory = new MemoryIdempotencyStore()
let redisStore: IdempotencyStore | null | undefined

function getStore(): IdempotencyStore {
  if (redisStore === undefined) {
    const redis = getRedis()
    redisStore = redis ? createRedisIdempotencyStore(redis as unknown as RedisLike) : null
  }
  return redisStore ?? memory
}

let lastReport = 0

function onStoreError(error: unknown, stage: 'begin' | 'complete' | 'release'): void {
  logger.error({ err: error instanceof Error ? error.message : String(error), stage }, '[idempotency] store error, request allowed without idempotency protection')
  // One page per minute per instance, not one per request.
  if (Date.now() - lastReport > 60_000) {
    lastReport = Date.now()
    try {
      Sentry.captureMessage('Idempotency store error', { level: 'error', tags: { module: 'idempotency', stage } })
    } catch {
      // never break request handling
    }
  }
}

export interface IdempotentOptions {
  /** Return false for requests that are not costly (e.g. `dryRun: true`). */
  applies?: (req: Request) => boolean
}

export function idempotent(options: IdempotentOptions = {}): RequestHandler {
  const mw = createIdempotencyMiddleware(
    { store: getStore, onStoreError },
    {
      skip: () => process.env.NODE_ENV === 'test',
      ...(options.applies ? { applies: (req: IdemRequest) => options.applies!(req as unknown as Request) } : {}),
    },
  )
  return ((req, res, next) => {
    void mw(req as unknown as IdemRequest, res as never, next)
  }) as RequestHandler
}
