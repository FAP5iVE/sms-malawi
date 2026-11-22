/**
 * apps/web/src/lib/idempotency-core.ts
 *
 * [CHANGE TYPE]: NEW FILE (Issue 6)
 *
 * Idempotency for costly mutations (bulk invoice generation, payroll runs,
 * report-card generation). A client that times out and retries must not repeat
 * the side effects — or, worse, run a second copy concurrently with the first.
 *
 * Two modes, both per authenticated user:
 *
 *  1. Client key (`Idempotency-Key: <8–128 chars>`) — the first request runs
 *     and its 2xx response is stored for 24 h. A retry with the same key and
 *     the same body gets that response back verbatim (header
 *     `Idempotent-Replayed: true`) without re-running anything. The same key
 *     with a DIFFERENT body is a client bug and is rejected (422). Only 2xx is
 *     stored: a 4xx/5xx releases the key so the corrected request can retry.
 *
 *  2. No key — an in-flight guard keyed on (user, route, body hash): an
 *     identical request arriving while the first is still running is rejected
 *     (409 + Retry-After) rather than run twice. Nothing is replayed after
 *     completion: re-running an identical request later is legitimate (and the
 *     service layer's own guards — unique constraints, "already invoiced" —
 *     still apply).
 *
 * If the store is unavailable the request is allowed through (fail-open): the
 * protected operations are already guarded by database constraints, and
 * idempotency is an additional safety net, not the only one. The failure is
 * reported through the injected `onStoreError`.
 *
 * Pure core: store, clock and reporting are injected so it is unit-testable.
 */

import { createHash } from 'node:crypto'

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key'
export const KEY_PATTERN = /^[A-Za-z0-9_\-:.]{8,128}$/
export const COMPLETED_TTL_MS = 24 * 60 * 60 * 1000
export const IN_FLIGHT_TTL_MS = 2 * 60 * 1000

export interface StoredResponse {
  status: number
  body: unknown
}

export type BeginResult =
  | { state: 'new' }
  | { state: 'in-progress' }
  | { state: 'done'; fingerprint: string; response: StoredResponse }
  | { state: 'mismatch' }

export interface IdempotencyStore {
  /** Atomically claim `key`, or report what already holds it. */
  begin(key: string, fingerprint: string, ttlMs: number): Promise<BeginResult>
  /** Record the successful response (replaces the in-flight claim). */
  complete(key: string, fingerprint: string, response: StoredResponse, ttlMs: number): Promise<void>
  /** Drop the claim so the request can be retried. */
  release(key: string): Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// HASHING
// ─────────────────────────────────────────────────────────────────────────────

/** JSON with object keys sorted, so semantically equal bodies hash equal. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`
}

export function fingerprintOf(body: unknown): string {
  return createHash('sha256').update(canonicalJson(body ?? null)).digest('hex').slice(0, 32)
}

function scopeKey(kind: 'key' | 'auto', userId: string, route: string, tail: string): string {
  return `idem:v1:${kind}:${createHash('sha256').update(`${userId}|${route}|${tail}`).digest('hex').slice(0, 40)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// MEMORY STORE (dev / single instance / best-effort when Redis is absent)
// ─────────────────────────────────────────────────────────────────────────────

interface MemEntry {
  fingerprint: string
  expiresAt: number
  response?: StoredResponse
}

export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = new Map<string, MemEntry>()
  constructor(private readonly now: () => number = Date.now) {}

  async begin(key: string, fingerprint: string, ttlMs: number): Promise<BeginResult> {
    const t = this.now()
    const e = this.entries.get(key)
    if (e && e.expiresAt > t) {
      if (e.fingerprint !== fingerprint) return { state: 'mismatch' }
      return e.response
        ? { state: 'done', fingerprint: e.fingerprint, response: e.response }
        : { state: 'in-progress' }
    }
    if (this.entries.size > 5000) for (const [k, v] of this.entries) if (v.expiresAt <= t) this.entries.delete(k)
    this.entries.set(key, { fingerprint, expiresAt: t + ttlMs })
    return { state: 'new' }
  }

  async complete(key: string, fingerprint: string, response: StoredResponse, ttlMs: number): Promise<void> {
    this.entries.set(key, { fingerprint, response, expiresAt: this.now() + ttlMs })
  }

  async release(key: string): Promise<void> {
    this.entries.delete(key)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REDIS STORE
// ─────────────────────────────────────────────────────────────────────────────

/** The subset of @upstash/redis used here. */
export interface RedisLike {
  set(key: string, value: string, opts: { nx?: boolean; px?: number }): Promise<unknown>
  get(key: string): Promise<unknown>
  del(key: string): Promise<unknown>
}

interface Stored {
  fp: string
  response?: StoredResponse
}

function parseStored(raw: unknown): Stored | null {
  try {
    const v = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw
    if (v && typeof v === 'object' && typeof (v as Stored).fp === 'string') return v as Stored
  } catch {
    // fall through
  }
  return null
}

export function createRedisIdempotencyStore(redis: RedisLike): IdempotencyStore {
  return {
    async begin(key, fingerprint, ttlMs) {
      const claimed = await redis.set(key, JSON.stringify({ fp: fingerprint } satisfies Stored), { nx: true, px: ttlMs })
      if (claimed) return { state: 'new' }
      const existing = parseStored(await redis.get(key))
      if (!existing) {
        // Expired between SET NX and GET — claim again.
        const retry = await redis.set(key, JSON.stringify({ fp: fingerprint } satisfies Stored), { nx: true, px: ttlMs })
        return retry ? { state: 'new' } : { state: 'in-progress' }
      }
      if (existing.fp !== fingerprint) return { state: 'mismatch' }
      return existing.response
        ? { state: 'done', fingerprint: existing.fp, response: existing.response }
        : { state: 'in-progress' }
    },
    async complete(key, fingerprint, response, ttlMs) {
      await redis.set(key, JSON.stringify({ fp: fingerprint, response } satisfies Stored), { px: ttlMs })
    },
    async release(key) {
      await redis.del(key)
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────

export interface IdemRequest {
  method: string
  baseUrl?: string
  path?: string
  headers: Record<string, string | string[] | undefined>
  user?: { uid: string } | undefined
  body?: unknown
}

export interface IdemResponse {
  statusCode: number
  status(code: number): unknown
  setHeader(name: string, value: string): unknown
  json(body: unknown): unknown
  end(...args: unknown[]): unknown
}

export interface IdempotencyDeps {
  store: () => IdempotencyStore
  onStoreError: (error: unknown, stage: 'begin' | 'complete' | 'release') => void
}

export interface IdempotencyOptions {
  /** Return false for requests that are not costly (e.g. a dry run) — they bypass entirely. */
  applies?: (req: IdemRequest) => boolean
  skip?: () => boolean
}

export function createIdempotencyMiddleware(deps: IdempotencyDeps, opts: IdempotencyOptions = {}) {
  return async (req: IdemRequest, res: IdemResponse, next: (err?: unknown) => void): Promise<void> => {
    if (opts.skip?.()) return next()
    if (opts.applies && !opts.applies(req)) return next()

    const uid = req.user?.uid
    if (!uid) return next() // must run after verifyAuth; never key on an anonymous caller

    const rawHeader = req.headers[IDEMPOTENCY_KEY_HEADER]
    const headerKey = (Array.isArray(rawHeader) ? rawHeader[0] : rawHeader)?.trim()
    if (headerKey !== undefined && headerKey !== '' && !KEY_PATTERN.test(headerKey)) {
      res.status(400)
      res.json({ error: 'Idempotency-Key must be 8–128 characters: letters, digits, "_", "-", ":" or ".".' })
      return
    }

    const route = `${req.method} ${req.baseUrl ?? ''}${req.path ?? ''}`
    const fingerprint = fingerprintOf(req.body)
    const clientKeyed = Boolean(headerKey)
    const key = clientKeyed ? scopeKey('key', uid, route, headerKey as string) : scopeKey('auto', uid, route, fingerprint)

    const store = deps.store()
    let begun: BeginResult
    try {
      // The claim itself is always short-lived: if this instance dies mid-request the
      // key frees itself after IN_FLIGHT_TTL_MS. Only complete() extends it to 24 h.
      begun = await store.begin(key, fingerprint, IN_FLIGHT_TTL_MS)
    } catch (error) {
      deps.onStoreError(error, 'begin')
      return next() // fail-open — see module header
    }

    if (begun.state === 'mismatch') {
      res.status(422)
      res.json({ error: 'This Idempotency-Key was already used with a different request.' })
      return
    }
    if (begun.state === 'in-progress') {
      res.setHeader('Retry-After', '5')
      res.status(409)
      res.json({ error: 'An identical request is already being processed. Please wait for it to finish.' })
      return
    }
    if (begun.state === 'done') {
      res.setHeader('Idempotent-Replayed', 'true')
      res.status(begun.response.status)
      res.json(begun.response.body)
      return
    }

    // state === 'new': this request owns the key. Persist the outcome BEFORE the
    // response is released to the client — a serverless instance may be frozen
    // the moment the response ends, which would otherwise lose the write.
    // res.end is wrapped (not 'finish'/'close' listeners) because the Next.js
    // bridge's mock response never emits those events — see activityLog.ts.
    let settled = false
    const originalJson = res.json.bind(res)
    const originalEnd = res.end.bind(res)

    res.json = (body: unknown) => {
      if (settled) return originalJson(body)
      settled = true
      const status = res.statusCode
      const finalise: Promise<void> =
        clientKeyed && status >= 200 && status < 300
          ? store.complete(key, fingerprint, { status, body }, COMPLETED_TTL_MS).catch((e) => deps.onStoreError(e, 'complete'))
          : store.release(key).catch((e) => deps.onStoreError(e, 'release'))
      void finalise.finally(() => originalJson(body))
      return res
    }

    // Handler ended without res.json (sendStatus, bare end, stream): nothing to
    // replay, so just free the key.
    res.end = (...args: unknown[]) => {
      if (settled) return originalEnd(...args)
      settled = true
      void store.release(key).catch((e) => deps.onStoreError(e, 'release')).finally(() => originalEnd(...args))
      return res
    }

    next()
  }
}
