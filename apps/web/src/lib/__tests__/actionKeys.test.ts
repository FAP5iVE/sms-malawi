/**
 * actionKeys.test.ts
 * [CHANGE TYPE]: NEW FILE. Finance Hardening Plan P1-06: the client keeps one idempotency key per money action.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { actionKeyFor, releaseActionKey, isKeyReuseError, ApiError } from '@/lib/api-client'

describe('action keys', () => {
  beforeEach(() => {
    releaseActionKey('payment:a')
    releaseActionKey('payment:b')
  })

  it('the same action keeps its key until released; other actions have their own', () => {
    const a = actionKeyFor('payment:a')
    expect(actionKeyFor('payment:a')).toBe(a)
    expect(actionKeyFor('payment:b')).not.toBe(a)
    releaseActionKey('payment:a')
    expect(actionKeyFor('payment:a')).not.toBe(a)
  })

  it('the key is one the server accepts', () => {
    expect(actionKeyFor('payment:a')).toMatch(/^[A-Za-z0-9_\-:.]{8,128}$/)
  })

  it('a stored key survives a reload', () => {
    sessionStorage.setItem('idempotency:payment:b', 'stored-key-123')
    expect(actionKeyFor('payment:b')).toBe('stored-key-123')
  })

  it('only the server’s key-reuse answer counts as key reuse', () => {
    expect(isKeyReuseError(new ApiError('x', 422, { code: 'IDEMPOTENCY_KEY_REUSED' }))).toBe(true)
    expect(isKeyReuseError(new ApiError('x', 409, { code: 'IN_PROGRESS' }))).toBe(false)
    expect(isKeyReuseError(new Error('x'))).toBe(false)
  })
})
