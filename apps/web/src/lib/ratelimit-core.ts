/**
 * apps/web/src/lib/ratelimit-core.ts
 *
 * [CHANGE TYPE]: NEW FILE (Issue 6 — rate limiting is not a global abuse boundary)
 *
 * The rate-limit ENGINE. Deliberately free of side-effect imports (no
 * `server-only`, no Sentry, no Redis client, no logger): the store, clock and
 * monitor are all injected, so every behaviour below — shared quotas across
 * instances, per-user vs per-IP keying, store-outage handling, 429 shape — is
 * unit-testable without a network. lib/ratelimit.ts wires the real
 * dependencies (Upstash, pino, Sentry) and the policy registry.
 *
 * Model
 *   A POLICY is a named list of LIMIT DIMENSIONS, each counted separately:
 *     • user       — the verified Firebase uid (authenticated routes)
 *     • ip         — the client network address (public routes, and a generous
 *                    backstop on authenticated routes)
 *     • identifier — a request-derived key such as the e-mail address being
 *                    subscribed (stops one victim being mail-bombed from many IPs)
 *     • global     — one bucket for the whole deployment: a PROVIDER BUDGET
 *                    (Gemini / Resend quota) that no combination of per-user
 *                    limits can otherwise protect
 *   Dimensions are checked in the order written — put the most specific first,
 *   so a caller already blocked on their own quota never consumes the shared
 *   global budget.
 *
 *   Counting is a fixed window. A caller can therefore burst up to ~2× a limit
 *   across a window boundary; that is an accepted trade-off for a single atomic
 *   Redis round-trip per dimension, and every limit here is sized with it in
 *   mind.
 *
 * Failure behaviour (decided per policy, never implicit)
 *   When the shared store cannot be reached — or is not configured in
 *   production — the policy's `onStoreFailure` applies:
 *     • 'fail-closed'    → 503 + Retry-After. For operations whose abuse cost is
 *                          real money / provider quota and whose UI has a
 *                          graceful non-AI path (the AI explanation).
 *     • 'local-fallback' → keep serving, counted in this instance's memory at a
 *                          reduced ceiling (`fallbackFactor`, default 0.5). For
 *                          business-critical flows (admissions, month-end
 *                          invoicing) that must not go down with a cache.
 *   Either way an operational alert is raised through the injected monitor.
 */

import { createHash } from 'node:crypto'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type LimitScope = 'user' | 'ip' | 'identifier' | 'global'
export type FailureMode = 'fail-closed' | 'local-fallback'

export interface LimitDimension {
  by: LimitScope
  windowMs: number
  max: number
  /** Raise a "near limit" alert once usage reaches this fraction of `max` (0–1). */
  alertAtRatio?: number
  /** Overrides the policy message when THIS dimension is the one exceeded. */
  message?: string
}

export interface RatePolicy {
  /** Stable id: used in keys, logs and alerts. Never contains user data. */
  id: string
  dimensions: readonly LimitDimension[]
  /** 'shared' = counted in Redis across every instance; 'memory' = per instance. */
  store: 'shared' | 'memory'
  onStoreFailure: FailureMode
  /** Generic, non-revealing text for the 429 body. */
  message: string
  /** local-fallback ceiling = ceil(max × factor), minimum 1. Default 0.5. */
  fallbackFactor?: number
  /** Report requests slower than this (ms) as "expensive query duration". */
  slowMs?: number
}

export interface HitResult {
  /** Requests counted in the current window INCLUDING this one. */
  count: number
  /** Epoch ms at which the window resets. */
  resetAt: number
}

export interface RateLimitStore {
  hit(key: string, windowMs: number, now: number): Promise<HitResult>
}

export interface RequestContext {
  ip: string
  userId?: string | undefined
  identifier?: string | undefined
}

export type Decision =
  | { allowed: true }
  | {
      allowed: false
      /** 429 for an exceeded limit, 503 when a fail-closed policy lost its store. */
      status: 429 | 503
      reason: 'limit' | 'store-unavailable'
      retryAfterSec: number
      message: string
      scope?: LimitScope
    }

export interface LimiterMonitor {
  onBlocked(ev: { policyId: string; scope: LimitScope; keyHash: string }): void
  onStoreError(ev: {
    policyId: string
    mode: FailureMode
    configured: boolean
    error?: unknown
  }): void
  onNearLimit(ev: { policyId: string; scope: LimitScope; count: number; max: number }): void
  onSlow(ev: { policyId: string; durationMs: number; slowMs: number }): void
}

export interface LimiterDeps {
  /** The shared store, or null when none is configured. */
  sharedStore: () => RateLimitStore | null
  /** Per-instance store (also the local-fallback counter). */
  memoryStore: RateLimitStore
  monitor: LimiterMonitor
  now?: () => number
  /** True in production. Outside it, an unconfigured shared store silently uses memory. */
  isProduction: () => boolean
}

/** How long a fail-closed caller is told to wait while the store is down. */
export const STORE_OUTAGE_RETRY_AFTER_SEC = 30

// ─────────────────────────────────────────────────────────────────────────────
// KEY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/** Non-reversible short digest — raw IPs / e-mails never appear in Redis keys or logs. */
export function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24)
}

function subjectFor(dim: LimitDimension, ctx: RequestContext): string | undefined {
  switch (dim.by) {
    case 'user':
      // A user dimension on a route that somehow has no verified user must not
      // silently become "unlimited": fall back to the network address.
      return ctx.userId ?? `ip:${ctx.ip}`
    case 'ip':
      return ctx.ip
    case 'identifier':
      return ctx.identifier
    case 'global':
      return 'all'
  }
}

export function buildKey(policyId: string, dim: LimitDimension, subject: string, prefix = 'rl'): string {
  return `${prefix}:v1:${policyId}:${dim.by}:${dim.windowMs}:${digest(subject)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// STORES
// ─────────────────────────────────────────────────────────────────────────────

const MEMORY_MAX_KEYS = 10_000

/** Per-instance fixed-window counters, bounded so a flood of keys cannot grow memory without limit. */
export class MemoryStore implements RateLimitStore {
  private readonly buckets = new Map<string, HitResult>()

  async hit(key: string, windowMs: number, now: number): Promise<HitResult> {
    const existing = this.buckets.get(key)
    if (existing && existing.resetAt > now) {
      existing.count += 1
      return { count: existing.count, resetAt: existing.resetAt }
    }
    if (this.buckets.size >= MEMORY_MAX_KEYS) {
      for (const [k, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(k)
      // Pathological flood of distinct keys: start over rather than grow.
      if (this.buckets.size >= MEMORY_MAX_KEYS) this.buckets.clear()
    }
    const fresh = { count: 1, resetAt: now + windowMs }
    this.buckets.set(key, fresh)
    return { count: 1, resetAt: fresh.resetAt }
  }

  /** Test seam. */
  clear(): void {
    this.buckets.clear()
  }
}

/** The one Redis method the shared store needs (satisfied by @upstash/redis). */
export interface EvalCapable {
  eval(script: string, keys: string[], args: string[]): Promise<unknown>
}

/**
 * Atomic INCR + expiry + TTL in a single round-trip. PTTL is returned so the
 * 429 can carry an accurate Retry-After; a key that somehow lost its expiry is
 * repaired rather than left to count forever.
 */
export const INCR_WINDOW_LUA = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {c, ttl}
`

export const DEFAULT_STORE_TIMEOUT_MS = 1_500

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`rate-limit store timed out after ${ms}ms`)), ms)
    p.then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}

/** Redis-backed store. Any malformed reply or timeout throws, so callers see it as an outage. */
export function createRedisStore(client: EvalCapable, timeoutMs = DEFAULT_STORE_TIMEOUT_MS): RateLimitStore {
  return {
    async hit(key, windowMs, now) {
      const raw = await withTimeout(client.eval(INCR_WINDOW_LUA, [key], [String(windowMs)]), timeoutMs)
      if (!Array.isArray(raw) || raw.length < 2) throw new Error('unexpected rate-limit store reply')
      const count = Number(raw[0])
      const ttl = Number(raw[1])
      if (!Number.isFinite(count) || !Number.isFinite(ttl)) throw new Error('unexpected rate-limit store reply')
      return { count, resetAt: now + Math.max(ttl, 0) }
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EVALUATION
// ─────────────────────────────────────────────────────────────────────────────

function retryAfterSec(resetAt: number, now: number): number {
  return Math.max(1, Math.ceil((resetAt - now) / 1000))
}

/**
 * Counts one request against every dimension of `policy` and returns the
 * verdict. Never throws: store failures are converted to the policy's
 * documented failure behaviour.
 */
export async function evaluatePolicy(
  policy: RatePolicy,
  ctx: RequestContext,
  deps: LimiterDeps,
): Promise<Decision> {
  const now = (deps.now ?? Date.now)()

  let store: RateLimitStore = deps.memoryStore
  let usingFallback = false
  let prefix = 'rl'

  if (policy.store === 'shared') {
    const shared = deps.sharedStore()
    if (shared) {
      store = shared
    } else if (deps.isProduction()) {
      // Not configured in production is an outage as far as the safety
      // guarantee goes: the quota is no longer shared.
      deps.monitor.onStoreError({ policyId: policy.id, mode: policy.onStoreFailure, configured: false })
      if (policy.onStoreFailure === 'fail-closed') return storeUnavailable()
      usingFallback = true
      prefix = 'fb'
    }
    // Non-production + unconfigured: plain memory, silently (local dev).
  }

  for (const dim of policy.dimensions) {
    const subject = subjectFor(dim, ctx)
    if (subject === undefined) continue // e.g. no identifier on this request

    const max = usingFallback ? fallbackMax(policy, dim) : dim.max
    const key = buildKey(policy.id, dim, subject, prefix)

    let hit: HitResult
    try {
      hit = await store.hit(key, dim.windowMs, now)
    } catch (error) {
      if (usingFallback || store === deps.memoryStore) {
        // Memory cannot fail in practice; if it somehow does, do not block users.
        deps.monitor.onStoreError({ policyId: policy.id, mode: 'local-fallback', configured: true, error })
        continue
      }
      deps.monitor.onStoreError({ policyId: policy.id, mode: policy.onStoreFailure, configured: true, error })
      if (policy.onStoreFailure === 'fail-closed') return storeUnavailable()

      // local-fallback: re-run THIS and the remaining dimensions in memory.
      store = deps.memoryStore
      usingFallback = true
      prefix = 'fb'
      const fbKey = buildKey(policy.id, dim, subject, prefix)
      hit = await store.hit(fbKey, dim.windowMs, now)
      const fbMax = fallbackMax(policy, dim)
      if (hit.count > fbMax) return blocked(policy, dim, subject, hit, now, deps)
      continue
    }

    if (hit.count > max) return blocked(policy, dim, subject, hit, now, deps)

    if (dim.alertAtRatio !== undefined && hit.count >= Math.ceil(max * dim.alertAtRatio)) {
      deps.monitor.onNearLimit({ policyId: policy.id, scope: dim.by, count: hit.count, max })
    }
  }

  return { allowed: true }
}

function fallbackMax(policy: RatePolicy, dim: LimitDimension): number {
  return Math.max(1, Math.ceil(dim.max * (policy.fallbackFactor ?? 0.5)))
}

function storeUnavailable(): Decision {
  return {
    allowed: false,
    status: 503,
    reason: 'store-unavailable',
    retryAfterSec: STORE_OUTAGE_RETRY_AFTER_SEC,
    message: 'This service is temporarily unavailable, please try again shortly.',
  }
}

function blocked(
  policy: RatePolicy,
  dim: LimitDimension,
  subject: string,
  hit: HitResult,
  now: number,
  deps: LimiterDeps,
): Decision {
  deps.monitor.onBlocked({ policyId: policy.id, scope: dim.by, keyHash: digest(subject).slice(0, 8) })
  return {
    allowed: false,
    status: 429,
    reason: 'limit',
    retryAfterSec: retryAfterSec(hit.resetAt, now),
    message: dim.message ?? policy.message,
    scope: dim.by,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPRESS MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────────

// Structural request/response types: keeps this module free of an `express`
// runtime dependency and lets tests drive it with plain objects.
export interface LimiterRequest {
  headers: Record<string, string | string[] | undefined>
  ip?: string | undefined
  socket?: { remoteAddress?: string | undefined } | undefined
  user?: { uid: string } | undefined
  body?: unknown
}

export interface LimiterResponse {
  status(code: number): unknown
  setHeader(name: string, value: string): unknown
  json(body: unknown): unknown
  end(...args: unknown[]): unknown
}

export type NextFn = (err?: unknown) => void

export interface LimiterOptions {
  /** Derives the `identifier` dimension's subject from the request, or undefined to skip it. */
  identifier?: (req: LimiterRequest) => string | undefined
  /** Return true to bypass entirely (e.g. NODE_ENV === 'test'). */
  skip?: () => boolean
}

/**
 * The client network address.
 *
 * Vercel overwrites `x-vercel-forwarded-for` / `x-real-ip` at its edge, so
 * those are preferred; the left-most `x-forwarded-for` entry is the fallback.
 * IPv6 addresses are collapsed to their /64 — a single client otherwise owns
 * 2^64 addresses and could rotate through them to dodge a per-IP limit.
 */
export function clientIp(req: LimiterRequest): string {
  const pick = (h: string | string[] | undefined): string | undefined => {
    const v = Array.isArray(h) ? h[0] : h
    const first = v?.split(',')[0]?.trim()
    return first || undefined
  }
  const ip =
    pick(req.headers['x-vercel-forwarded-for']) ??
    pick(req.headers['x-real-ip']) ??
    pick(req.headers['x-forwarded-for']) ??
    req.ip ??
    req.socket?.remoteAddress ??
    'unknown'
  return normaliseIp(ip)
}

export function normaliseIp(ip: string): string {
  const stripped = ip.replace(/^::ffff:/i, '') // IPv4-mapped IPv6
  if (!stripped.includes(':')) return stripped
  // Expand "::" so the first four groups (the /64) can be taken reliably.
  const [head = '', tail = ''] = stripped.split('::')
  const headGroups = head ? head.split(':') : []
  const tailGroups = tail ? tail.split(':') : []
  const missing = Math.max(0, 8 - headGroups.length - tailGroups.length)
  const groups = stripped.includes('::')
    ? [...headGroups, ...Array<string>(missing).fill('0'), ...tailGroups]
    : headGroups
  return `${groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, '')).join(':')}::/64`
}

export function createLimiterMiddleware(policy: RatePolicy, deps: LimiterDeps, opts: LimiterOptions = {}) {
  return async (req: LimiterRequest, res: LimiterResponse, next: NextFn): Promise<void> => {
    if (opts.skip?.()) return next()

    const ctx: RequestContext = {
      ip: clientIp(req),
      userId: req.user?.uid,
      identifier: opts.identifier?.(req),
    }

    let decision: Decision
    try {
      decision = await evaluatePolicy(policy, ctx, deps)
    } catch (error) {
      // evaluatePolicy is built not to throw; if something unforeseen does,
      // the safe direction depends on the policy's documented failure mode.
      deps.monitor.onStoreError({ policyId: policy.id, mode: policy.onStoreFailure, configured: true, error })
      decision = policy.onStoreFailure === 'fail-closed'
        ? { allowed: false, status: 503, reason: 'store-unavailable', retryAfterSec: STORE_OUTAGE_RETRY_AFTER_SEC, message: 'This service is temporarily unavailable, please try again shortly.' }
        : { allowed: true }
    }

    if (!decision.allowed) {
      // Only Retry-After is exposed: no counters, limits, policy ids or
      // infrastructure hints in headers or body.
      res.setHeader('Retry-After', String(decision.retryAfterSec))
      res.status(decision.status)
      res.json({ error: decision.message })
      return
    }

    if (policy.slowMs !== undefined) {
      const started = (deps.now ?? Date.now)()
      let reported = false
      // Wrap res.end rather than listening for 'finish'/'close': the Next.js
      // bridge (app/api/[[...slug]]/route.ts) uses a mock response that never
      // emits those events — the same reason activityLog.ts wraps res.end.
      const originalEnd = res.end.bind(res)
      res.end = (...args: unknown[]) => {
        if (!reported) {
          reported = true
          const durationMs = (deps.now ?? Date.now)() - started
          if (durationMs > (policy.slowMs as number)) {
            deps.monitor.onSlow({ policyId: policy.id, durationMs, slowMs: policy.slowMs as number })
          }
        }
        return originalEnd(...args)
      }
    }

    next()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MONITOR (alert throttling)
// ─────────────────────────────────────────────────────────────────────────────

export interface MonitorSink {
  warn(msg: string, fields: Record<string, unknown>): void
  error(msg: string, fields: Record<string, unknown>): void
  /** Page / notify someone — Sentry in production. */
  alert(level: 'warning' | 'error', msg: string, fields: Record<string, unknown>, error?: unknown): void
}

export interface MonitorOptions {
  now?: () => number
  /** 429s on one policy inside `spikeWindowMs` that count as a spike. */
  spikeThreshold?: number
  spikeWindowMs?: number
  /** Minimum gap between alerts of the same kind for the same policy. */
  alertCooldownMs?: number
}

/**
 * Logs every event, but pages at most once per cooldown per (kind, policy), so
 * an outage or an attack produces one alert, not one per request.
 */
export function createMonitor(sink: MonitorSink, options: MonitorOptions = {}): LimiterMonitor {
  const now = options.now ?? Date.now
  const spikeThreshold = options.spikeThreshold ?? 20
  const spikeWindowMs = options.spikeWindowMs ?? 60_000
  const cooldown = options.alertCooldownMs ?? 5 * 60_000

  const lastAlert = new Map<string, number>()
  const blockedSeen = new Map<string, { count: number; windowEnd: number }>()

  const cooledDown = (kind: string, policyId: string, ms = cooldown): boolean => {
    const k = `${kind}:${policyId}`
    const t = now()
    const prev = lastAlert.get(k)
    if (prev !== undefined && t - prev < ms) return false
    lastAlert.set(k, t)
    return true
  }

  return {
    onBlocked({ policyId, scope, keyHash }) {
      sink.warn('[ratelimit] request blocked', { policyId, scope, keyHash })
      const t = now()
      const cur = blockedSeen.get(policyId)
      const win = !cur || cur.windowEnd <= t ? { count: 0, windowEnd: t + spikeWindowMs } : cur
      win.count += 1
      blockedSeen.set(policyId, win)
      if (win.count >= spikeThreshold && cooledDown('spike', policyId)) {
        sink.alert('warning', `Rate-limit spike on "${policyId}"`, { policyId, blockedInWindow: win.count })
      }
    },

    onStoreError({ policyId, mode, configured, error }) {
      const fields = { policyId, mode, configured }
      sink.error(
        configured
          ? '[ratelimit] shared store unavailable'
          : '[ratelimit] shared store NOT CONFIGURED in production, quota is not shared across instances',
        { ...fields, err: error instanceof Error ? error.message : undefined },
      )
      // Short cooldown: an outage should be loud, but not one page per request.
      if (cooledDown('store', policyId, 60_000)) {
        sink.alert(
          'error',
          configured ? `Rate-limit store error on "${policyId}"` : `Rate-limit store not configured for "${policyId}"`,
          { ...fields, behaviour: mode === 'fail-closed' ? 'requests rejected (503)' : 'serving from reduced local limits' },
          error,
        )
      }
    },

    onNearLimit({ policyId, scope, count, max }) {
      sink.warn('[ratelimit] usage near limit', { policyId, scope, count, max })
      if (cooledDown('near', policyId, 10 * 60_000)) {
        sink.alert('warning', `Rate-limit budget nearly exhausted on "${policyId}"`, { policyId, scope, count, max })
      }
    },

    onSlow({ policyId, durationMs, slowMs }) {
      sink.warn('[ratelimit] slow expensive request', { policyId, durationMs, slowMs })
      if (cooledDown('slow', policyId, 10 * 60_000)) {
        sink.alert('warning', `Slow expensive operation on "${policyId}"`, { policyId, durationMs, slowMs })
      }
    },
  }
}
