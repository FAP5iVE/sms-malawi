// @vitest-environment node
/**
 * Error behaviour (Issue 7, item 8): the client must never receive internal
 * error text — SQL/table names from Prisma, provider response bodies, stack
 * fragments — while deliberate user-facing 4xx messages still get through.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))

import { sendError, clientMessageFor } from '../sendError'
import { SelfReviewError, assertNotSelfReview } from '../selfReview'

function fakeRes() {
  const out: { status: number; body: unknown } = { status: 0, body: undefined }
  const res = {
    status(c: number) { out.status = c; return res },
    json(b: unknown) { out.body = b; return res },
  }
  return { res: res as never, out }
}

afterEach(() => vi.unstubAllEnvs())

describe('sendError — no internal detail to the client', () => {
  it('an unexpected 500 returns a fixed message, not err.message', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { res, out } = fakeRes()
    sendError(res, new Error('Invalid `prisma.student.findMany()` invocation: column "secret_col" does not exist'))
    expect(out.status).toBe(500)
    expect(JSON.stringify(out.body)).not.toMatch(/prisma|secret_col|column/i)
    expect(out.body).toEqual({ error: 'An internal server error occurred.' })
  })

  it('also hides the text under NODE_ENV=test (only local development may show it)', () => {
    vi.stubEnv('NODE_ENV', 'test')
    expect(clientMessageFor(new Error('db password=hunter2'), 500)).toBe('An internal server error occurred.')
    vi.stubEnv('NODE_ENV', 'development')
    expect(clientMessageFor(new Error('db password=hunter2'), 500)).toContain('hunter2')
  })

  it('a Prisma error is never echoed even when a route defaults it to 400', () => {
    const err = Object.assign(new Error('Unique constraint failed on the fields: (`email`)'), { name: 'PrismaClientKnownRequestError', code: 'P2002' })
    const { res, out } = fakeRes()
    sendError(res, err, { defaultStatus: 400 })
    expect(out.status).toBe(400)
    expect(JSON.stringify(out.body)).not.toMatch(/Unique constraint|email/)
  })

  it('a Firebase / provider error code is never echoed', () => {
    const err = Object.assign(new Error('There is no user record corresponding to the provided identifier.'), { code: 'auth/user-not-found' })
    expect(clientMessageFor(err, 500)).toBe('An internal server error occurred.')
    expect(clientMessageFor(err, 404)).toBe('The request could not be completed.')
  })

  it('deliberate user-facing 4xx messages are preserved', () => {
    const err = Object.assign(new Error('This expense is already approved.'), { status: 409 })
    const { res, out } = fakeRes()
    sendError(res, err)
    expect(out).toEqual({ status: 409, body: { error: 'This expense is already approved.' } })
  })

  it('an explicit publicMessage always wins; extraFields are kept', () => {
    const { res, out } = fakeRes()
    sendError(res, new Error('boom'), { publicMessage: 'Failed to load notifications.', extraFields: { a: 1 } })
    expect(out.body).toEqual({ error: 'Failed to load notifications.', a: 1 })
  })

  it('a non-Error throw uses the fallback', () => {
    expect(clientMessageFor('weird', 500, { fallbackMessage: 'Invalid finance settings data.' })).toBe('Invalid finance settings data.')
  })
})

describe('assertNotSelfReview', () => {
  it('blocks the requester (403) and names the item', () => {
    expect(() => assertNotSelfReview('u1', 'u1', 'leave request')).toThrowError(SelfReviewError)
    try { assertNotSelfReview('u1', 'u1', 'leave request') } catch (e) {
      expect((e as SelfReviewError).status).toBe(403)
      expect((e as Error).message).toContain('leave request')
    }
  })
  it('allows a different reviewer, and does not strand legacy rows with no requester', () => {
    expect(() => assertNotSelfReview('u1', 'u2', 'x')).not.toThrow()
    expect(() => assertNotSelfReview(null, 'u2', 'x')).not.toThrow()
    expect(() => assertNotSelfReview(undefined, 'u2', 'x')).not.toThrow()
  })
})
