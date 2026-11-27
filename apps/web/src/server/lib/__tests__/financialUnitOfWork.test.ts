/**
 * financialUnitOfWork.test.ts
 * [CHANGE TYPE]: NEW FILE. Finance Hardening Plan P1-06 (T-02).
 *
 * Prisma is mocked: these prove the order of the steps and every answer the idempotency check can give. That a
 * rollback really removes the key, and that two connections cannot both claim it, is proven on a real database in
 * `__integration__/financialRegister.itest.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    idempotencyRecord: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  }
  return {
    tx,
    prisma: { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown, _options?: unknown) => fn(tx)) },
    isFinanceV2: vi.fn(async () => false),
  }
})

vi.mock('@/lib/prisma', () => ({ prisma: h.prisma }))
vi.mock('@/server/services/settingsService', () => ({ isFinanceV2: h.isFinanceV2 }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import {
  runFinancialTransaction, financialIdempotency, replayAwareStatus, FinancialError, type IdempotencyContext,
} from '../financialUnitOfWork'
import { sendError } from '../sendError'

const context = (over: Partial<IdempotencyContext> = {}): IdempotencyContext => ({
  scope: 'payment.record', key: 'key-12345678', requestHash: 'hash-a', ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  h.isFinanceV2.mockResolvedValue(false)
  h.tx.$queryRaw.mockResolvedValue([{ locked: true }])
  h.tx.idempotencyRecord.findUnique.mockResolvedValue(null)
})

describe('runFinancialTransaction', () => {
  it('without a key it only runs the work in one transaction', async () => {
    await expect(runFinancialTransaction({ actorUid: 'u1' }, async () => 'done')).resolves.toBe('done')
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(h.tx.$queryRaw).not.toHaveBeenCalled()
    expect(h.tx.idempotencyRecord.create).not.toHaveBeenCalled()
  })

  it('claims the key, runs the work, then stores the response, in that order', async () => {
    const order: string[] = []
    h.tx.idempotencyRecord.create.mockImplementation(async () => { order.push('claim') })
    h.tx.idempotencyRecord.update.mockImplementation(async () => { order.push('complete') })
    const idempotency = context()
    await runFinancialTransaction({ actorUid: 'u1', idempotency }, async () => { order.push('work'); return { ok: 1 } })
    expect(order).toEqual(['claim', 'work', 'complete'])
    expect(idempotency.replayed).toBe(false)
    expect(h.tx.idempotencyRecord.create.mock.calls[0]![0].data).toMatchObject({
      scope: 'payment.record', key: 'key-12345678', actorUid: 'u1', requestHash: 'hash-a', status: 'IN_PROGRESS',
    })
    expect(h.tx.idempotencyRecord.update.mock.calls[0]![0].data).toMatchObject({ status: 'COMPLETED', responseBody: { ok: 1 } })
  })

  it('stores the response the route would send (serialize, then JSON)', async () => {
    const idempotency = context({ serialize: (r) => ({ shaped: r }) })
    await runFinancialTransaction({ actorUid: 'u1', idempotency }, async () => ({ at: new Date('2026-11-27T00:00:00Z') }))
    expect(h.tx.idempotencyRecord.update.mock.calls[0]![0].data.responseBody)
      .toEqual({ shaped: { at: '2026-11-27T00:00:00.000Z' } })
  })

  const stored = (over: Record<string, unknown> = {}) => ({
    actorUid: 'u1', requestHash: 'hash-a', status: 'COMPLETED', responseBody: { id: 'first' }, ...over,
  })

  it('T-02: a completed key returns the first response and does not run the work', async () => {
    h.tx.idempotencyRecord.findUnique.mockResolvedValue(stored())
    const work = vi.fn()
    const idempotency = context()
    await expect(runFinancialTransaction({ actorUid: 'u1', idempotency }, work)).resolves.toEqual({ id: 'first' })
    expect(idempotency.replayed).toBe(true)
    expect(work).not.toHaveBeenCalled()
    expect(h.tx.idempotencyRecord.create).not.toHaveBeenCalled()
  })

  it.each([
    ['a different request', { requestHash: 'hash-b' }],
    ['a different person', { actorUid: 'u2' }],
  ])('T-02: the same key with %s is refused with 422', async (_name, over) => {
    h.tx.idempotencyRecord.findUnique.mockResolvedValue(stored(over))
    const work = vi.fn()
    await expect(runFinancialTransaction({ actorUid: 'u1', idempotency: context() }, work))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', status: 422 })
    expect(work).not.toHaveBeenCalled()
  })

  it('a key another request holds right now is 409 IN_PROGRESS, without waiting', async () => {
    h.tx.$queryRaw.mockResolvedValue([{ locked: false }])
    const work = vi.fn()
    await expect(runFinancialTransaction({ actorUid: 'u1', idempotency: context() }, work))
      .rejects.toMatchObject({ code: 'IN_PROGRESS', status: 409 })
    expect(work).not.toHaveBeenCalled()
    expect(h.tx.idempotencyRecord.findUnique).not.toHaveBeenCalled()
  })

  it('a stored record that never completed is 409, not a second run', async () => {
    h.tx.idempotencyRecord.findUnique.mockResolvedValue(stored({ status: 'IN_PROGRESS' }))
    await expect(runFinancialTransaction({ actorUid: 'u1', idempotency: context() }, vi.fn()))
      .rejects.toMatchObject({ code: 'IN_PROGRESS' })
  })

  it('a failure passes through unchanged and stores no response', async () => {
    const boom = new Error('rule broken')
    await expect(
      runFinancialTransaction({ actorUid: 'u1', idempotency: context() }, async () => { throw boom }),
    ).rejects.toBe(boom)
    expect(h.tx.idempotencyRecord.update).not.toHaveBeenCalled()
  })

  it.each(['P1001', 'P1017', 'P2024', 'P2028', 'P2034'])(
    'a connection or transaction failure (%s) is 503 RETRYABLE and is not retried here',
    async (code) => {
      h.prisma.$transaction.mockRejectedValueOnce(Object.assign(new Error('db'), { code }))
      await expect(runFinancialTransaction({ actorUid: 'u1', idempotency: context() }, vi.fn()))
        .rejects.toMatchObject({ code: 'RETRYABLE', status: 503 })
      expect(h.prisma.$transaction).toHaveBeenCalledTimes(1)
    },
  )

  it('any other database error is not turned into "retry"', async () => {
    const dup = Object.assign(new Error('unique'), { code: 'P2002' })
    h.prisma.$transaction.mockRejectedValueOnce(dup)
    await expect(runFinancialTransaction({ actorUid: 'u1' }, vi.fn())).rejects.toBe(dup)
  })

  it('waits and times out longer than Prisma defaults', async () => {
    await runFinancialTransaction({ actorUid: 'u1' }, async () => 1)
    expect(h.prisma.$transaction.mock.calls[0]![1]).toEqual({ maxWait: 10_000, timeout: 20_000 })
  })
})

describe('financialIdempotency', () => {
  const req = (key?: string, body: unknown = { amount: 1 }, params: unknown = {}) => ({
    headers: key === undefined ? {} : { 'idempotency-key': key }, body, params,
  })

  it('no key: allowed while finance.v2.ledgerEngine is off', async () => {
    await expect(financialIdempotency(req(), 's')).resolves.toBeUndefined()
    expect(h.isFinanceV2).toHaveBeenCalledWith('ledgerEngine')
  })

  it('no key: 400 IDEMPOTENCY_KEY_REQUIRED once the flag is on', async () => {
    h.isFinanceV2.mockResolvedValue(true)
    await expect(financialIdempotency(req(), 's')).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED', status: 400 })
  })

  it('a malformed key is refused whatever the flag says', async () => {
    await expect(financialIdempotency(req('short'), 's')).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 })
  })

  it('the fingerprint covers the body and the route parameters, not key order', async () => {
    const hash = async (body: unknown, params: unknown = {}) =>
      (await financialIdempotency(req('key-12345678', body, params), 's'))!.requestHash
    expect(await hash({ a: 1, b: 2 })).toBe(await hash({ b: 2, a: 1 }))
    expect(await hash({ a: 1 })).not.toBe(await hash({ a: 2 }))
    expect(await hash({}, { id: 'x' })).not.toBe(await hash({}, { id: 'y' }))
  })
})

describe('what the client receives', () => {
  const response = () => {
    const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() }
    res.status.mockReturnValue(res)
    return res
  }

  it('a replay answers 200 and says so; a first answer keeps its status', () => {
    const res = response()
    expect(replayAwareStatus(res, context({ replayed: false }), 201)).toBe(201)
    expect(res.setHeader).not.toHaveBeenCalled()
    expect(replayAwareStatus(res, context({ replayed: true }), 201)).toBe(200)
    expect(res.setHeader).toHaveBeenCalledWith('Idempotent-Replay', 'true')
  })

  it('a finance error carries its code, and a 503 keeps its advice', () => {
    const res = response()
    sendError(res as never, new FinancialError('RETRYABLE', 503, 'Submit again.'))
    expect(res.status).toHaveBeenCalledWith(503)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Submit again.', code: 'RETRYABLE' }))
  })

  it('other errors’ codes (for example the database’s) are not sent', () => {
    const res = response()
    sendError(res as never, Object.assign(new Error('x'), { code: 'P2002' }))
    expect(res.json.mock.calls[0]![0]).not.toHaveProperty('code')
  })
})
