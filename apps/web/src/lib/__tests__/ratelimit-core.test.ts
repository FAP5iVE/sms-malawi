/**
 * Issue 6 acceptance tests for the rate-limit engine (lib/ratelimit-core.ts).
 *
 * No network: the "Redis" is an in-memory fake that implements the same
 * INCR + PEXPIRE + PTTL semantics as INCR_WINDOW_LUA, and several independent
 * `LimiterDeps` objects (each with its OWN memory store) stand in for several
 * serverless instances sharing it.
 */
import { describe, expect, it } from 'vitest'

import {
  MemoryStore,
  STORE_OUTAGE_RETRY_AFTER_SEC,
  clientIp,
  createLimiterMiddleware,
  createMonitor,
  createRedisStore,
  evaluatePolicy,
  normaliseIp,
  type EvalCapable,
  type LimiterDeps,
  type LimiterMonitor,
  type LimiterRequest,
  type LimiterResponse,
  type RatePolicy,
  type RequestContext,
} from '../ratelimit-core'
import { RATE_POLICIES } from '../ratelimit-policies'

// ─── Fakes ───────────────────────────────────────────────────────────────────

class FakeRedis implements EvalCapable {
  private readonly data = new Map<string, { n: number; expiresAt: number }>()
  down = false
  hang = false
  constructor(private readonly clock: { t: number }) {}

  async eval(_script: string, keys: string[], args: string[]): Promise<unknown> {
    if (this.hang) return new Promise(() => {}) // never settles
    if (this.down) throw new Error('ECONNREFUSED')
    const key = keys[0] as string
    const windowMs = Number(args[0])
    let e = this.data.get(key)
    if (!e || e.expiresAt <= this.clock.t) {
      e = { n: 0, expiresAt: this.clock.t + windowMs }
      this.data.set(key, e)
    }
    e.n += 1
    return [e.n, e.expiresAt - this.clock.t]
  }
}

interface Recorded {
  blocked: Array<{ policyId: string; scope: string }>
  storeErrors: Array<{ policyId: string; mode: string; configured: boolean }>
  nearLimit: Array<{ policyId: string; scope: string }>
  slow: Array<{ policyId: string; durationMs: number }>
}

function recordingMonitor(): { monitor: LimiterMonitor; rec: Recorded } {
  const rec: Recorded = { blocked: [], storeErrors: [], nearLimit: [], slow: [] }
  return {
    rec,
    monitor: {
      onBlocked: (e) => rec.blocked.push(e),
      onStoreError: (e) => rec.storeErrors.push(e),
      onNearLimit: (e) => rec.nearLimit.push(e),
      onSlow: (e) => rec.slow.push(e),
    },
  }
}

function makeInstance(
  redis: FakeRedis | null,
  clock: { t: number },
  opts: { production?: boolean; timeoutMs?: number } = {},
) {
  const { monitor, rec } = recordingMonitor()
  const shared = redis ? createRedisStore(redis, opts.timeoutMs ?? 50) : null
  const deps: LimiterDeps = {
    sharedStore: () => shared,
    memoryStore: new MemoryStore(),
    monitor,
    now: () => clock.t,
    isProduction: () => opts.production ?? true,
  }
  return { deps, rec }
}

const ctx = (over: Partial<RequestContext> = {}): RequestContext => ({ ip: '203.0.113.7', ...over })

const userPolicy: RatePolicy = {
  id: 'test-user',
  dimensions: [{ by: 'user', windowMs: 60_000, max: 6 }],
  store: 'shared',
  onStoreFailure: 'local-fallback',
  message: 'slow down',
}

async function fire(policy: RatePolicy, n: number, c: RequestContext, deps: LimiterDeps) {
  let allowed = 0
  for (let i = 0; i < n; i++) if ((await evaluatePolicy(policy, c, deps)).allowed) allowed++
  return allowed
}

// ─── Shared quota across instances ───────────────────────────────────────────

describe('shared limit across serverless instances', () => {
  it('a burst spread over three instances still obeys ONE shared limit', async () => {
    const clock = { t: 1_000_000 }
    const redis = new FakeRedis(clock)
    const instances = [makeInstance(redis, clock), makeInstance(redis, clock), makeInstance(redis, clock)]

    let allowed = 0
    for (let i = 0; i < 30; i++) {
      const inst = instances[i % 3]!
      if ((await evaluatePolicy(userPolicy, ctx({ userId: 'u1' }), inst.deps)).allowed) allowed++
    }
    expect(allowed).toBe(6) // not 18 (= 6 × 3 instances)
  })

  it('documents the old behaviour: a memory-only policy multiplies by the instance count', async () => {
    const clock = { t: 1_000_000 }
    const memoryPolicy: RatePolicy = { ...userPolicy, id: 'test-mem', store: 'memory' }
    const instances = [makeInstance(null, clock), makeInstance(null, clock), makeInstance(null, clock)]

    let allowed = 0
    for (let i = 0; i < 30; i++) {
      if ((await evaluatePolicy(memoryPolicy, ctx({ userId: 'u1' }), instances[i % 3]!.deps)).allowed) allowed++
    }
    expect(allowed).toBe(18)
  })

  it('the window resets after windowMs', async () => {
    const clock = { t: 1_000_000 }
    const { deps } = makeInstance(new FakeRedis(clock), clock)
    expect(await fire(userPolicy, 10, ctx({ userId: 'u1' }), deps)).toBe(6)
    clock.t += 60_001
    expect(await fire(userPolicy, 10, ctx({ userId: 'u1' }), deps)).toBe(6)
  })
})

// ─── Per-user vs per-IP keying ───────────────────────────────────────────────

describe('keying: users on a shared network are not locked out together', () => {
  it('two users behind the same IP have independent quotas', async () => {
    const clock = { t: 1_000_000 }
    const { deps } = makeInstance(new FakeRedis(clock), clock)
    const policy = RATE_POLICIES['ai-explain']

    const sameNat = { ip: '196.216.1.10' }
    expect(await fire(policy, 8, { ...sameNat, userId: 'teacher-a' }, deps)).toBe(6)
    // teacher-a is exhausted; teacher-b on the SAME ip is untouched
    const b = await evaluatePolicy(policy, { ...sameNat, userId: 'teacher-b' }, deps)
    expect(b.allowed).toBe(true)
  })

  it('one authenticated user cannot dodge their limit by changing IP', async () => {
    const clock = { t: 1_000_000 }
    const { deps } = makeInstance(new FakeRedis(clock), clock)
    const policy = RATE_POLICIES['ai-explain']

    let allowed = 0
    for (let i = 0; i < 20; i++) {
      const r = await evaluatePolicy(policy, { ip: `198.51.100.${i}`, userId: 'u-abuser' }, deps)
      if (r.allowed) allowed++
    }
    expect(allowed).toBe(6)
  })

  it('an authenticated user cannot exhaust unlimited AI or export requests', async () => {
    const clock = { t: 1_000_000 }
    const { deps } = makeInstance(new FakeRedis(clock), clock)
    expect(await fire(RATE_POLICIES['ai-explain'], 500, ctx({ userId: 'u1' }), deps)).toBe(6)
    expect(await fire(RATE_POLICIES['export-generate'], 500, ctx({ userId: 'u2' }), deps)).toBe(60)
    expect(await fire(RATE_POLICIES['bulk-mutation'], 500, ctx({ userId: 'u3' }), deps)).toBe(10)
  })

  it('the IP dimension still backstops many accounts from one address', async () => {
    const clock = { t: 1_000_000 }
    const { deps } = makeInstance(new FakeRedis(clock), clock)
    const policy = RATE_POLICIES['bulk-mutation'] // user 10, ip 60 per 10 min

    let allowed = 0
    for (let i = 0; i < 200; i++) {
      if ((await evaluatePolicy(policy, { ip: '203.0.113.9', userId: `u${i}` }, deps)).allowed) allowed++
    }
    expect(allowed).toBe(60)
  })

  it('a user dimension with no verified user falls back to the IP rather than going unlimited', async () => {
    const clock = { t: 1_000_000 }
    const { deps } = makeInstance(new FakeRedis(clock), clock)
    expect(await fire(userPolicy, 20, ctx(), deps)).toBe(6)
  })
})

// ─── Provider budget (global dimension) ──────────────────────────────────────

describe('AI provider budget', () => {
  it('many different users together cannot exceed the deployment-wide provider quota', async () => {
    const clock = { t: 1_000_000 }
    const { deps } = makeInstance(new FakeRedis(clock), clock)
    const policy = RATE_POLICIES['ai-explain']

    let allowed = 0
    for (let u = 0; u < 10; u++) allowed += await fire(policy, 6, { ip: `10.0.0.${u}`, userId: `user-${u}` }, deps)
    expect(allowed).toBe(12) // global: 12 / minute, even though 10 users × 6 would be 60
  })

  it('a user already over their own limit does not spend the global budget', async () => {
    const clock = { t: 1_000_000 }
    const { deps } = makeInstance(new FakeRedis(clock), clock)
    const policy = RATE_POLICIES['ai-explain']

    await fire(policy, 100, ctx({ userId: 'hog' }), deps) // 6 allowed, 94 rejected on the USER dimension
    // 6 of 12 spent — NOT 100. Another user still has the remaining 6.
    expect(await fire(policy, 6, ctx({ userId: 'other', ip: '10.9.9.9' }), deps)).toBe(6)
  })

  it('tells callers the provider is busy (not that THEY were too fast) and raises a near-limit alert', async () => {
    const clock = { t: 1_000_000 }
    const { deps, rec } = makeInstance(new FakeRedis(clock), clock)
    const policy = RATE_POLICIES['ai-explain']
    for (let u = 0; u < 2; u++) await fire(policy, 6, { ip: `10.0.0.${u}`, userId: `user-${u}` }, deps)

    const d = await evaluatePolicy(policy, { ip: '10.0.0.99', userId: 'late-user' }, deps)
    expect(d.allowed).toBe(false)
    if (!d.allowed) {
      expect(d.status).toBe(429)
      expect(d.scope).toBe('global')
      expect(d.message).toContain('busy')
    }
    expect(rec.nearLimit.some((e) => e.scope === 'global')).toBe(true) // alerted at ≥ 80 %
  })
})

// ─── Store outage ────────────────────────────────────────────────────────────

describe('shared store outage follows the documented safe behaviour', () => {
  it('fail-closed (AI): 503 + Retry-After, and an operational alert', async () => {
    const clock = { t: 1_000_000 }
    const redis = new FakeRedis(clock)
    redis.down = true
    const { deps, rec } = makeInstance(redis, clock)

    const d = await evaluatePolicy(RATE_POLICIES['ai-explain'], ctx({ userId: 'u1' }), deps)
    expect(d.allowed).toBe(false)
    if (!d.allowed) {
      expect(d.status).toBe(503)
      expect(d.reason).toBe('store-unavailable')
      expect(d.retryAfterSec).toBe(STORE_OUTAGE_RETRY_AFTER_SEC)
    }
    expect(rec.storeErrors).toHaveLength(1)
    expect(rec.storeErrors[0]).toMatchObject({ policyId: 'ai-explain', mode: 'fail-closed', configured: true })
  })

  it('local-fallback (public application): keeps serving, at HALF the normal ceiling, and alerts', async () => {
    const clock = { t: 1_000_000 }
    const redis = new FakeRedis(clock)
    redis.down = true
    const { deps, rec } = makeInstance(redis, clock)
    const policy = RATE_POLICIES['public-application'] // ip 15 / 10 min

    const allowed = await fire(policy, 30, ctx(), deps)
    expect(allowed).toBe(8) // ceil(15 × 0.5): not blocked outright, not unlimited
    expect(rec.storeErrors.length).toBeGreaterThan(0)
    expect(rec.storeErrors[0]).toMatchObject({ mode: 'local-fallback', configured: true })
  })

  it('recovers to the shared counters when the store returns', async () => {
    const clock = { t: 1_000_000 }
    const redis = new FakeRedis(clock)
    const { deps } = makeInstance(redis, clock)
    redis.down = true
    await fire(userPolicy, 3, ctx({ userId: 'u1' }), deps)
    redis.down = false
    expect(await fire(userPolicy, 10, ctx({ userId: 'u2' }), deps)).toBe(6)
  })

  it('a store that hangs is treated as an outage within the timeout', async () => {
    const clock = { t: 1_000_000 }
    const redis = new FakeRedis(clock)
    redis.hang = true
    const { deps, rec } = makeInstance(redis, clock, { timeoutMs: 20 })

    const d = await evaluatePolicy(RATE_POLICIES['ai-explain'], ctx({ userId: 'u1' }), deps)
    expect(d.allowed).toBe(false)
    expect(rec.storeErrors).toHaveLength(1)
  })

  it('a malformed store reply is an outage, not a silent allow', async () => {
    const clock = { t: 1_000_000 }
    const bad: EvalCapable = { eval: async () => 'OK' }
    const { monitor, rec } = recordingMonitor()
    const deps: LimiterDeps = {
      sharedStore: () => createRedisStore(bad),
      memoryStore: new MemoryStore(),
      monitor,
      now: () => clock.t,
      isProduction: () => true,
    }
    const d = await evaluatePolicy(RATE_POLICIES['ai-explain'], ctx({ userId: 'u1' }), deps)
    expect(d.allowed).toBe(false)
    expect(rec.storeErrors).toHaveLength(1)
  })

  it('NOT configured in production counts as an outage (quota would not be shared)', async () => {
    const clock = { t: 1_000_000 }
    const { deps, rec } = makeInstance(null, clock, { production: true })

    const ai = await evaluatePolicy(RATE_POLICIES['ai-explain'], ctx({ userId: 'u1' }), deps)
    expect(ai.allowed).toBe(false) // fail-closed
    expect(rec.storeErrors[0]).toMatchObject({ configured: false, mode: 'fail-closed' })

    expect(await fire(RATE_POLICIES['public-application'], 30, ctx(), deps)).toBe(8) // local-fallback
  })

  it('NOT configured outside production silently uses memory (local dev keeps working)', async () => {
    const clock = { t: 1_000_000 }
    const { deps, rec } = makeInstance(null, clock, { production: false })
    expect(await fire(RATE_POLICIES['ai-explain'], 20, ctx({ userId: 'u1' }), deps)).toBe(6)
    expect(rec.storeErrors).toHaveLength(0)
  })
})

// ─── Identifier dimension ────────────────────────────────────────────────────

describe('identifier dimension (per e-mail address)', () => {
  it('one address cannot be mail-bombed from many IPs', async () => {
    const clock = { t: 1_000_000 }
    const { deps } = makeInstance(new FakeRedis(clock), clock)
    const policy = RATE_POLICIES['public-newsletter'] // identifier 3 / hour

    let allowed = 0
    for (let i = 0; i < 10; i++) {
      const r = await evaluatePolicy(policy, { ip: `198.51.100.${i}`, identifier: 'victim@example.com' }, deps)
      if (r.allowed) allowed++
    }
    expect(allowed).toBe(3)
  })

  it('is skipped when the request has no identifier (schema validation rejects it next)', async () => {
    const clock = { t: 1_000_000 }
    const { deps } = makeInstance(new FakeRedis(clock), clock)
    const r = await evaluatePolicy(RATE_POLICIES['public-newsletter'], ctx(), deps)
    expect(r.allowed).toBe(true)
  })

  it('different addresses do not share a quota', async () => {
    const clock = { t: 1_000_000 }
    const { deps } = makeInstance(new FakeRedis(clock), clock)
    const policy = RATE_POLICIES['public-newsletter']
    expect(await fire(policy, 5, { ip: '198.51.100.1', identifier: 'a@example.com' }, deps)).toBe(3)
    expect(await fire(policy, 5, { ip: '198.51.100.2', identifier: 'b@example.com' }, deps)).toBe(3)
  })
})

// ─── Client IP ───────────────────────────────────────────────────────────────

describe('client IP extraction', () => {
  const req = (headers: Record<string, string>, ip?: string): LimiterRequest => ({ headers, ip })

  it('prefers the Vercel-set header over the client-appendable x-forwarded-for', () => {
    expect(clientIp(req({ 'x-vercel-forwarded-for': '41.70.1.1', 'x-forwarded-for': '6.6.6.6, 41.70.1.1' }))).toBe('41.70.1.1')
  })

  it('falls back to the left-most x-forwarded-for, then req.ip', () => {
    expect(clientIp(req({ 'x-forwarded-for': '41.70.1.2, 10.0.0.1' }))).toBe('41.70.1.2')
    expect(clientIp(req({}, '41.70.1.3'))).toBe('41.70.1.3')
    expect(clientIp(req({}))).toBe('unknown')
  })

  it('collapses IPv6 to its /64 so one client cannot rotate through its range', () => {
    const a = normaliseIp('2001:db8:abcd:12:aaaa:bbbb:cccc:dddd')
    const b = normaliseIp('2001:db8:abcd:12::1')
    const other = normaliseIp('2001:db8:abcd:13::1')
    expect(a).toBe(b)
    expect(a).not.toBe(other)
  })

  it('treats IPv4-mapped IPv6 as the IPv4 address', () => {
    expect(normaliseIp('::ffff:41.70.1.4')).toBe('41.70.1.4')
  })
})

// ─── Express middleware: 429 shape ───────────────────────────────────────────

function fakeRes() {
  const res = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    ended: false,
    status(c: number) { this.statusCode = c; return this },
    setHeader(k: string, v: string) { this.headers[k] = v; return this },
    json(b: unknown) { this.body = b; return this.end() },
    end(..._a: unknown[]) { this.ended = true; return this },
  }
  return res
}

describe('429 response', () => {
  it('returns 429 with Retry-After and a body that reveals nothing about counters or infrastructure', async () => {
    const clock = { t: 1_000_000 }
    const { deps } = makeInstance(new FakeRedis(clock), clock)
    const mw = createLimiterMiddleware(userPolicy, deps)
    const mk = (): LimiterRequest => ({ headers: {}, ip: '41.70.1.1', user: { uid: 'u1' } })

    let nexts = 0
    for (let i = 0; i < 6; i++) await mw(mk(), fakeRes() as unknown as LimiterResponse, () => { nexts++ })
    expect(nexts).toBe(6)

    clock.t += 10_000 // 10 s into the 60 s window
    const res = fakeRes()
    await mw(mk(), res as unknown as LimiterResponse, () => { nexts++ })

    expect(nexts).toBe(6) // handler NOT reached
    expect(res.statusCode).toBe(429)
    expect(res.headers['Retry-After']).toBe('50')
    expect(Object.keys(res.headers)).toEqual(['Retry-After']) // no RateLimit-Limit / -Remaining / policy headers
    expect(res.body).toEqual({ error: 'slow down' }) // no counts, windows, keys or store details
  })

  it('a fail-closed outage responds 503 with Retry-After', async () => {
    const clock = { t: 1_000_000 }
    const redis = new FakeRedis(clock)
    redis.down = true
    const { deps } = makeInstance(redis, clock)
    const mw = createLimiterMiddleware(RATE_POLICIES['ai-explain'], deps)
    const res = fakeRes()
    let nexted = false
    await mw({ headers: {}, user: { uid: 'u1' } }, res as unknown as LimiterResponse, () => { nexted = true })
    expect(nexted).toBe(false)
    expect(res.statusCode).toBe(503)
    expect(res.headers['Retry-After']).toBe(String(STORE_OUTAGE_RETRY_AFTER_SEC))
    expect(JSON.stringify(res.body)).not.toMatch(/redis|upstash|ECONN/i)
  })

  it('skip() bypasses the limiter entirely', async () => {
    const clock = { t: 1_000_000 }
    const { deps } = makeInstance(new FakeRedis(clock), clock)
    const mw = createLimiterMiddleware(userPolicy, deps, { skip: () => true })
    let nexts = 0
    for (let i = 0; i < 50; i++) await mw({ headers: {}, user: { uid: 'u1' } }, fakeRes() as unknown as LimiterResponse, () => { nexts++ })
    expect(nexts).toBe(50)
  })

  it('reports an expensive request that exceeds slowMs (wraps res.end — the bridge emits no events)', async () => {
    const clock = { t: 1_000_000 }
    const { deps, rec } = makeInstance(new FakeRedis(clock), clock)
    const policy: RatePolicy = { ...userPolicy, id: 'test-slow', slowMs: 1000 }
    const mw = createLimiterMiddleware(policy, deps)

    const res = fakeRes()
    await mw({ headers: {}, user: { uid: 'u1' } }, res as unknown as LimiterResponse, () => {})
    clock.t += 2500
    ;(res as unknown as LimiterResponse).end()
    expect(rec.slow).toEqual([{ policyId: 'test-slow', durationMs: 2500, slowMs: 1000 }])

    const fast = fakeRes()
    await mw({ headers: {}, user: { uid: 'u2' } }, fast as unknown as LimiterResponse, () => {})
    clock.t += 100
    ;(fast as unknown as LimiterResponse).end()
    expect(rec.slow).toHaveLength(1)
  })

  it('identifier option feeds the identifier dimension', async () => {
    const clock = { t: 1_000_000 }
    const { deps } = makeInstance(new FakeRedis(clock), clock)
    const mw = createLimiterMiddleware(RATE_POLICIES['public-newsletter'], deps, {
      identifier: (req) => (req.body as { email?: string }).email,
    })
    let nexts = 0
    for (let i = 0; i < 6; i++) {
      await mw({ headers: { 'x-forwarded-for': `198.51.100.${i}` }, body: { email: 'v@example.com' } }, fakeRes() as unknown as LimiterResponse, () => { nexts++ })
    }
    expect(nexts).toBe(3)
  })
})

// ─── Monitoring / alert throttling ───────────────────────────────────────────

describe('monitoring', () => {
  function sink() {
    const calls = { warn: 0, error: 0, alerts: [] as Array<{ level: string; msg: string }> }
    return {
      calls,
      sink: {
        warn: () => { calls.warn++ },
        error: () => { calls.error++ },
        alert: (level: 'warning' | 'error', msg: string) => { calls.alerts.push({ level, msg }) },
      },
    }
  }

  it('a store outage pages once per cooldown, not once per request', () => {
    const clock = { t: 0 }
    const s = sink()
    const m = createMonitor(s.sink, { now: () => clock.t })
    for (let i = 0; i < 500; i++) m.onStoreError({ policyId: 'ai-explain', mode: 'fail-closed', configured: true, error: new Error('x') })
    expect(s.calls.error).toBe(500) // every one is logged…
    expect(s.calls.alerts).toHaveLength(1) // …but only one alert
    clock.t += 61_000
    m.onStoreError({ policyId: 'ai-explain', mode: 'fail-closed', configured: true })
    expect(s.calls.alerts).toHaveLength(2) // re-alerts if the outage persists
  })

  it('alerts on repeated 429s (a spike), once', () => {
    const clock = { t: 0 }
    const s = sink()
    const m = createMonitor(s.sink, { now: () => clock.t, spikeThreshold: 20 })
    for (let i = 0; i < 19; i++) m.onBlocked({ policyId: 'search', scope: 'user', keyHash: 'abcd1234' })
    expect(s.calls.alerts).toHaveLength(0)
    for (let i = 0; i < 50; i++) m.onBlocked({ policyId: 'search', scope: 'user', keyHash: 'abcd1234' })
    expect(s.calls.alerts).toHaveLength(1)
    expect(s.calls.alerts[0]!.msg).toContain('search')
  })

  it('a not-configured store is reported distinctly from an outage', () => {
    const s = sink()
    const m = createMonitor(s.sink)
    m.onStoreError({ policyId: 'ai-explain', mode: 'fail-closed', configured: false })
    expect(s.calls.alerts[0]!.msg).toContain('not configured')
  })
})
