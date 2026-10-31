// @vitest-environment node
/**
 * requireCurrentUser() — the only thing standing between a public Server
 * Action endpoint and a settings mutation. Every "no valid identity" path
 * must throw AuthError; identity must come from the verified token's uid and
 * the authoritative user record, never from anything client-supplied.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  getUser: vi.fn(),
}))

vi.mock('firebase-admin', () => ({
  auth: () => ({ verifyIdToken: mocks.verifyIdToken, getUser: mocks.getUser }),
}))
vi.mock('@/lib/verifyAuth', () => ({ getAdminApp: () => ({}) }))

import { requireCurrentUser, AuthError, type AuthFailureReason } from '@/lib/serverAuth'

const TOKEN = 'header.payload.signature'

function record(over: Partial<{ uid: string; disabled: boolean; customClaims: unknown }> = {}) {
  return { uid: 'u1', disabled: false, customClaims: { role: 'finance' }, ...over }
}

async function reasonOf(promise: Promise<unknown>): Promise<AuthFailureReason> {
  try {
    await promise
  } catch (err) {
    expect(err).toBeInstanceOf(AuthError)
    return (err as AuthError).reason
  }
  throw new Error('expected requireCurrentUser to reject')
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.verifyIdToken.mockResolvedValue({ uid: 'u1' })
  mocks.getUser.mockResolvedValue(record())
})

describe('requireCurrentUser — credential presence', () => {
  it.each([undefined, null, '', 0, 123, {}, true, 'x'.repeat(8193)])(
    'rejects %j as missing without calling Firebase',
    async (bad) => {
      expect(await reasonOf(requireCurrentUser(bad))).toBe('missing')
      expect(mocks.verifyIdToken).not.toHaveBeenCalled()
      expect(mocks.getUser).not.toHaveBeenCalled()
    }
  )
})

describe('requireCurrentUser — token verification', () => {
  it('verifies with checkRevoked = true', async () => {
    await requireCurrentUser(TOKEN)
    expect(mocks.verifyIdToken).toHaveBeenCalledWith(TOKEN, true)
  })

  it.each([
    ['auth/id-token-expired', 'expired'],
    ['auth/id-token-revoked', 'revoked'],
    ['auth/user-disabled', 'disabled'],
    ['auth/argument-error', 'invalid'],
    ['auth/invalid-id-token', 'invalid'],
    [undefined, 'invalid'],
  ])('maps Firebase error %s to %s and never loads a user', async (code, reason) => {
    mocks.verifyIdToken.mockRejectedValue(Object.assign(new Error('internal firebase detail'), { code }))
    expect(await reasonOf(requireCurrentUser(TOKEN))).toBe(reason)
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it('fails closed on an unexpected (non-Firebase) verification failure', async () => {
    mocks.verifyIdToken.mockRejectedValue(new TypeError('boom'))
    expect(await reasonOf(requireCurrentUser(TOKEN))).toBe('invalid')
  })

  it('never surfaces Firebase exception text in the AuthError message', async () => {
    mocks.verifyIdToken.mockRejectedValue(new Error('SECRET internal firebase detail'))
    const err = (await requireCurrentUser(TOKEN).then(() => null, (e: unknown) => e)) as AuthError
    expect(err).toBeInstanceOf(AuthError)
    expect(err.message).not.toMatch(/SECRET|firebase/i)
  })
})

describe('requireCurrentUser — identity comes from verified data only', () => {
  it('uses the verified token uid to load the record', async () => {
    mocks.verifyIdToken.mockResolvedValue({ uid: 'verified-uid' })
    mocks.getUser.mockResolvedValue(record({ uid: 'verified-uid' }))
    const user = await requireCurrentUser(TOKEN)
    expect(mocks.getUser).toHaveBeenCalledWith('verified-uid')
    expect(user.uid).toBe('verified-uid')
  })

  it('takes role from the authoritative record, not the (stale) token claim', async () => {
    // Token was minted while the user was an admin; they were downgraded since.
    mocks.verifyIdToken.mockResolvedValue({ uid: 'u1', role: 'admin', superUser: true })
    mocks.getUser.mockResolvedValue(record({ customClaims: { role: 'student' } }))
    expect(await requireCurrentUser(TOKEN)).toEqual({ uid: 'u1', role: 'student', superUser: false })
  })

  it('rejects a disabled account even if its token verified', async () => {
    mocks.getUser.mockResolvedValue(record({ disabled: true }))
    expect(await reasonOf(requireCurrentUser(TOKEN))).toBe('disabled')
  })

  it.each([undefined, null, '', 'root', 'ADMIN', 7, {}])('rejects unknown role %j', async (role) => {
    mocks.getUser.mockResolvedValue(record({ customClaims: { role } }))
    expect(await reasonOf(requireCurrentUser(TOKEN))).toBe('no_role')
  })

  it('rejects an account with no custom claims at all', async () => {
    mocks.getUser.mockResolvedValue(record({ customClaims: undefined }))
    expect(await reasonOf(requireCurrentUser(TOKEN))).toBe('no_role')
  })

  it('fails closed when the user record cannot be loaded', async () => {
    mocks.getUser.mockRejectedValue(new Error('network down'))
    expect(await reasonOf(requireCurrentUser(TOKEN))).toBe('invalid')
  })

  it('honours superUser only for boolean true', async () => {
    for (const bad of ['true', 1, 'yes', {}, null]) {
      mocks.getUser.mockResolvedValue(record({ customClaims: { role: 'admin', superUser: bad } }))
      expect((await requireCurrentUser(TOKEN)).superUser).toBe(false)
    }
    mocks.getUser.mockResolvedValue(record({ customClaims: { role: 'admin', superUser: true } }))
    expect((await requireCurrentUser(TOKEN)).superUser).toBe(true)
  })
})
