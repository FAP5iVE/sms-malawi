// @vitest-environment node
/**
 * Cron authentication (Issue 7): constant-time bearer check that fails closed.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ authorization: null as string | null }))
vi.mock('next/headers', () => ({ headers: async () => ({ get: (k: string) => (k.toLowerCase() === 'authorization' ? h.authorization : null) }) }))

import { isValidCronAuthorization, guardCron } from '../cronAuth'

beforeEach(() => { h.authorization = null })
afterEach(() => vi.unstubAllEnvs())

describe('isValidCronAuthorization', () => {
  it('accepts exactly "Bearer <secret>"', () => {
    vi.stubEnv('CRON_SECRET', 's3cret-value')
    expect(isValidCronAuthorization('Bearer s3cret-value')).toBe(true)
  })
  it.each([
    ['missing header', null],
    ['empty', ''],
    ['wrong secret', 'Bearer nope'],
    ['no scheme', 's3cret-value'],
    ['lowercase scheme', 'bearer s3cret-value'],
    ['trailing space', 'Bearer s3cret-value '],
    ['prefix only', 'Bearer s3cret'],
    ['longer', 'Bearer s3cret-value-and-more'],
  ])('rejects %s', (_n, header) => {
    vi.stubEnv('CRON_SECRET', 's3cret-value')
    expect(isValidCronAuthorization(header as string | null)).toBe(false)
  })
  it('fails closed when CRON_SECRET is unset — even for "Bearer undefined"', () => {
    vi.stubEnv('CRON_SECRET', '')
    expect(isValidCronAuthorization('Bearer undefined')).toBe(false)
    expect(isValidCronAuthorization('Bearer ')).toBe(false)
  })
})

describe('guardCron', () => {
  it('500 when misconfigured, 401 when unauthorised, null when allowed', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await guardCron())?.status).toBe(500)
    vi.stubEnv('CRON_SECRET', 'abc')
    h.authorization = 'Bearer wrong'
    expect((await guardCron())?.status).toBe(401)
    h.authorization = 'Bearer abc'
    expect(await guardCron()).toBeNull()
  })
})
