/**
 * Issue 6 — idempotency for costly mutations (lib/idempotency-core.ts).
 */
import { describe, expect, it } from 'vitest'

import {
  MemoryIdempotencyStore,
  createIdempotencyMiddleware,
  fingerprintOf,
  type IdempotencyStore,
  type IdemRequest,
  type IdemResponse,
} from '../idempotency-core'

// ─── Harness ─────────────────────────────────────────────────────────────────

interface Sent { status: number; headers: Record<string, string>; body: unknown }

/** Mirrors the Next bridge's mock response: json() → end(); no events are ever emitted. */
function makeRes() {
  let resolve!: (s: Sent) => void
  const sent = new Promise<Sent>((r) => { resolve = r })
  const headers: Record<string, string> = {}
  let body: unknown
  const res = {
    statusCode: 200,
    status(c: number) { this.statusCode = c; return this },
    setHeader(k: string, v: string) { headers[k] = v; return this },
    json(b: unknown) { body = b; return this.end() },
    end(..._a: unknown[]) { resolve({ status: this.statusCode, headers: { ...headers }, body }); return this },
  }
  return { res: res as unknown as IdemResponse, sent }
}

const req = (over: Partial<IdemRequest> = {}): IdemRequest => ({
  method: 'POST',
  baseUrl: '/payroll',
  path: '/run',
  headers: {},
  user: { uid: 'user-1' },
  body: { month: 9, year: 2026 },
  ...over,
})

function setup(opts: { store?: IdempotencyStore; applies?: (r: IdemRequest) => boolean } = {}) {
  const errors: Array<{ stage: string }> = []
  const store = opts.store ?? new MemoryIdempotencyStore()
  const mw = createIdempotencyMiddleware(
    { store: () => store, onStoreError: (_e, stage) => errors.push({ stage }) },
    opts.applies ? { applies: opts.applies } : {},
  )
  let handlerRuns = 0

  /** Runs one request through the middleware with a handler that responds `respond()` (default 201 + {runId}). */
  async function call(
    r: IdemRequest,
    respond: (res: IdemResponse) => void = (res) => { res.status(201); res.json({ runId: `run-${handlerRuns}` }) },
  ): Promise<Sent> {
    const { res, sent } = makeRes()
    await mw(r, res, () => {
      handlerRuns++
      respond(res)
    })
    return sent
  }
  return { call, errors, store, runs: () => handlerRuns, mw }
}

const keyed = (key: string, over: Partial<IdemRequest> = {}) =>
  req({ headers: { 'idempotency-key': key }, ...over })

// ─── Client-supplied key ─────────────────────────────────────────────────────

describe('Idempotency-Key', () => {
  it('a retry with the same key replays the original response and does NOT re-run the work', async () => {
    const t = setup()
    const first = await t.call(keyed('key-aaaaaaaa'))
    expect(first.status).toBe(201)
    expect(t.runs()).toBe(1)

    const retry = await t.call(keyed('key-aaaaaaaa'))
    expect(t.runs()).toBe(1) // handler not invoked again
    expect(retry.status).toBe(201)
    expect(retry.body).toEqual(first.body)
    expect(retry.headers['Idempotent-Replayed']).toBe('true')
  })

  it('the same key with a DIFFERENT body is rejected (client bug), not replayed', async () => {
    const t = setup()
    await t.call(keyed('key-bbbbbbbb'))
    const r = await t.call(keyed('key-bbbbbbbb', { body: { month: 10, year: 2026 } }))
    expect(r.status).toBe(422)
    expect(t.runs()).toBe(1)
  })

  it('body key order does not matter', async () => {
    expect(fingerprintOf({ a: 1, b: { c: 2, d: 3 } })).toBe(fingerprintOf({ b: { d: 3, c: 2 }, a: 1 }))
    const t = setup()
    await t.call(keyed('key-cccccccc', { body: { month: 9, year: 2026 } }))
    const r = await t.call(keyed('key-cccccccc', { body: { year: 2026, month: 9 } }))
    expect(r.headers['Idempotent-Replayed']).toBe('true')
  })

  it('a FAILED attempt (4xx/5xx) releases the key so the corrected request can retry', async () => {
    const t = setup()
    const bad = await t.call(keyed('key-dddddddd'), (res) => { res.status(400); res.json({ error: 'bad' }) })
    expect(bad.status).toBe(400)
    const ok = await t.call(keyed('key-dddddddd'))
    expect(ok.status).toBe(201)
    expect(ok.headers['Idempotent-Replayed']).toBeUndefined()
    expect(t.runs()).toBe(2)
  })

  it('a retry arriving while the first is still running gets 409 + Retry-After, not a second run', async () => {
    const t = setup()
    let finish!: () => void
    const first = t.call(keyed('key-eeeeeeee'), (res) => {
      finish = () => { res.status(201); res.json({ ok: true }) }
    })
    await Promise.resolve()
    const dup = await t.call(keyed('key-eeeeeeee'))
    expect(dup.status).toBe(409)
    expect(dup.headers['Retry-After']).toBeDefined()
    expect(t.runs()).toBe(1)
    finish()
    expect((await first).status).toBe(201)
  })

  it('keys are scoped per user', async () => {
    const t = setup()
    await t.call(keyed('key-ffffffff', { user: { uid: 'alice' } }))
    const bob = await t.call(keyed('key-ffffffff', { user: { uid: 'bob' } }))
    expect(bob.headers['Idempotent-Replayed']).toBeUndefined()
    expect(t.runs()).toBe(2)
  })

  it('keys are scoped per route', async () => {
    const t = setup()
    await t.call(keyed('key-gggggggg'))
    await t.call(keyed('key-gggggggg', { baseUrl: '/exams', path: '/report-card' }))
    expect(t.runs()).toBe(2)
  })

  it('rejects a malformed key', async () => {
    const t = setup()
    for (const bad of ['short', 'has spaces in it', 'x'.repeat(200), 'semi;colon;key']) {
      const r = await t.call(req({ headers: { 'idempotency-key': bad } }))
      expect(r.status).toBe(400)
    }
    expect(t.runs()).toBe(0)
  })

  it('a handler that ends without res.json (e.g. 204) frees the key', async () => {
    const t = setup()
    const { res, sent } = makeRes()
    await t.mw(keyed('key-hhhhhhhh'), res, () => { res.status(204); res.end() })
    await sent
    const again = await t.call(keyed('key-hhhhhhhh'))
    expect(again.status).toBe(201)
    expect(t.runs()).toBe(1) // the second ran fresh (first's handler was inline above)
  })
})

// ─── No key: in-flight guard ─────────────────────────────────────────────────

describe('no Idempotency-Key (in-flight guard)', () => {
  it('an identical concurrent request is rejected instead of run twice', async () => {
    const t = setup()
    let finish!: () => void
    const first = t.call(req(), (res) => { finish = () => { res.status(201); res.json({ ok: 1 }) } })
    await Promise.resolve()
    const dup = await t.call(req())
    expect(dup.status).toBe(409)
    expect(t.runs()).toBe(1)
    finish()
    await first
  })

  it('after completion an identical request is allowed again (legitimate re-run), and is not replayed', async () => {
    const t = setup()
    await t.call(req())
    const second = await t.call(req())
    expect(second.headers['Idempotent-Replayed']).toBeUndefined()
    expect(t.runs()).toBe(2)
  })

  it('a different body is a different request', async () => {
    const t = setup()
    let finish!: () => void
    const first = t.call(req(), (res) => { finish = () => { res.status(201); res.json({}) } })
    await Promise.resolve()
    const other = await t.call(req({ body: { month: 10, year: 2026 } }))
    expect(other.status).toBe(201)
    finish()
    await first
  })
})

// ─── Scope / failure behaviour ───────────────────────────────────────────────

describe('scope and failure behaviour', () => {
  it('bypasses requests the route marks as not costly (e.g. dryRun)', async () => {
    const t = setup({ applies: (r) => (r.body as { dryRun?: boolean }).dryRun !== true })
    await t.call(keyed('key-iiiiiiii', { body: { dryRun: true } }))
    await t.call(keyed('key-iiiiiiii', { body: { dryRun: true } }))
    expect(t.runs()).toBe(2) // never keyed, never replayed
  })

  it('passes through when there is no authenticated user (must run after verifyAuth)', async () => {
    const t = setup()
    await t.call(keyed('key-jjjjjjjj', { user: undefined }))
    await t.call(keyed('key-jjjjjjjj', { user: undefined }))
    expect(t.runs()).toBe(2)
  })

  it('fails OPEN if the store is down: the work still runs, and the outage is reported', async () => {
    const broken: IdempotencyStore = {
      begin: async () => { throw new Error('down') },
      complete: async () => { throw new Error('down') },
      release: async () => { throw new Error('down') },
    }
    const t = setup({ store: broken })
    const r = await t.call(keyed('key-kkkkkkkk'))
    expect(r.status).toBe(201)
    expect(t.runs()).toBe(1)
    expect(t.errors).toEqual([{ stage: 'begin' }])
  })

  it('a store failure while recording the result still delivers the response', async () => {
    const mem = new MemoryIdempotencyStore()
    const flaky: IdempotencyStore = {
      begin: (k, f, ttl) => mem.begin(k, f, ttl),
      complete: async () => { throw new Error('write failed') },
      release: (k) => mem.release(k),
    }
    const t = setup({ store: flaky })
    const r = await t.call(keyed('key-llllllll'))
    expect(r.status).toBe(201)
    expect(t.errors.map((e) => e.stage)).toContain('complete')
  })

  it('a claim expires on its own if the instance dies mid-request (no permanent 409)', async () => {
    let now = 1_000
    const store = new MemoryIdempotencyStore(() => now)
    const t = setup({ store })
    // claim, never respond
    void t.call(keyed('key-mmmmmmmm'), () => {})
    await Promise.resolve()
    now += 3 * 60_000 // past the 2-minute in-flight TTL
    const retry = await t.call(keyed('key-mmmmmmmm'))
    expect(retry.status).toBe(201)
  })
})
