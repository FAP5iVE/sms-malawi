// @vitest-environment node
/**
 * The alpha_admin super user: every role gate and permission gate must let the
 * `superUser` claim through, and nothing else may (the claim is strict-true).
 */
import { describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express'
import { isSuperUserClaim } from '@shared/constants/superUser'
import {
  ALL_GRANTED_PERMISSIONS,
  getPermissionsForRole,
  hasAllPermissions,
  hasAnyPermission,
  hasPermission,
} from '@shared/types/permissions'
import { USER_ROLES } from '@shared/types/roles'
import { passesApprovalGate } from '@shared/constants/approvals'
import { requireRole } from '@/lib/verifyAuth'
import { requirePermission, requireAllPermissions } from '@/server/middleware/verifyPermission'
import { proxy, SESSION_COOKIE, ROLE_COOKIE, SUPER_COOKIE } from '../proxy'

describe('isSuperUserClaim', () => {
  it('accepts only boolean true', () => {
    expect(isSuperUserClaim(true)).toBe(true)
    for (const v of [false, 'true', 1, 'yes', null, undefined, {}, []]) expect(isSuperUserClaim(v)).toBe(false)
  })
})

describe('permission helpers', () => {
  it('deny a student finance approval normally, allow it for the super user', () => {
    expect(hasPermission('student', 'finance.approvePayroll')).toBe(false)
    expect(hasPermission('student', 'finance.approvePayroll', true)).toBe(true)
  })

  it('hasAny / hasAll honour the flag', () => {
    expect(hasAnyPermission('student', ['finance.approvePayroll'])).toBe(false)
    expect(hasAnyPermission('student', ['finance.approvePayroll'], true)).toBe(true)
    expect(hasAllPermissions('student', ['finance.approvePayroll', 'student.viewOwn'])).toBe(false)
    expect(hasAllPermissions('student', ['finance.approvePayroll', 'student.viewOwn'], true)).toBe(true)
  })

  it('the super user holds the union of every role\'s permissions', () => {
    const all = new Set(getPermissionsForRole('student', true))
    for (const role of USER_ROLES) {
      for (const p of getPermissionsForRole(role)) expect(all.has(p)).toBe(true)
    }
    expect(all.size).toBe(ALL_GRANTED_PERMISSIONS.length)
  })

  it('approval gates pass for the super user only when flagged', () => {
    const gate = { roles: ['finance'] as const }
    expect(passesApprovalGate('student', gate)).toBe(false)
    expect(passesApprovalGate('student', gate, true)).toBe(true)
  })
})

function run(mw: (req: ExpressRequest, res: ExpressResponse, next: NextFunction) => unknown, user: ExpressRequest['user']) {
  const next = vi.fn()
  const json = vi.fn()
  const res = { status: vi.fn(() => ({ json })), json } as unknown as ExpressResponse
  mw({ user } as ExpressRequest, res, next as unknown as NextFunction)
  return { allowed: next.mock.calls.length === 1 }
}

describe('express middleware', () => {
  const plain = { uid: 'u', role: 'student' as const, email: 'a@b.c' }
  const sup = { ...plain, superUser: true }

  it('requireRole', () => {
    expect(run(requireRole(['admin']), plain).allowed).toBe(false)
    expect(run(requireRole(['admin']), sup).allowed).toBe(true)
    expect(run(requireRole(['admin']), { ...plain, superUser: false }).allowed).toBe(false)
  })

  it('requirePermission / requireAllPermissions', () => {
    expect(run(requirePermission('finance.approvePayroll'), plain).allowed).toBe(false)
    expect(run(requirePermission('finance.approvePayroll'), sup).allowed).toBe(true)
    expect(run(requireAllPermissions(['finance.approvePayroll', 'hr.assignRole']), sup).allowed).toBe(true)
  })
})

describe('edge proxy', () => {
  const call = (cookies: Record<string, string>, pathname: string) =>
    proxy(
      new NextRequest(`http://localhost${pathname}`, {
        headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ') },
      }),
    )
  const redirectsToDashboard = (res: Response) =>
    res.status >= 300 && res.status < 400 && new URL(res.headers.get('location') ?? '', 'http://localhost').pathname === '/dashboard'

  it('keeps a student out of /user-management, but lets the super user in', () => {
    const base = { [SESSION_COOKIE]: 'uid1', [ROLE_COOKIE]: 'student' }
    expect(redirectsToDashboard(call(base, '/user-management'))).toBe(true)
    expect(redirectsToDashboard(call({ ...base, [SUPER_COOKIE]: '1' }, '/user-management'))).toBe(false)
  })

  it('ignores a non-"1" super cookie', () => {
    const base = { [SESSION_COOKIE]: 'uid1', [ROLE_COOKIE]: 'student', [SUPER_COOKIE]: 'true' }
    expect(redirectsToDashboard(call(base, '/user-management'))).toBe(true)
  })
})