// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { assertRoleChangeAllowed, RoleChangeError } from '../roleChangePolicy'
import { USER_ROLES } from '@shared/types/roles'

const nonParent = USER_ROLES.filter((r) => r !== 'parent')

describe('assertRoleChangeAllowed', () => {
  it('allows every staff/student role change and creation', () => {
    for (const from of [null, undefined, ...nonParent]) {
      for (const to of nonParent) expect(() => assertRoleChangeAllowed(from, to)).not.toThrow()
    }
  })

  it('refuses to assign parent to anyone, new or existing (403)', () => {
    for (const from of [null, undefined, ...nonParent]) {
      try { assertRoleChangeAllowed(from, 'parent'); throw new Error('did not throw') }
      catch (e) { expect(e).toBeInstanceOf(RoleChangeError); expect((e as RoleChangeError).status).toBe(403) }
    }
  })

  it('refuses to convert a parent account into any other role (403)', () => {
    for (const to of nonParent) {
      try { assertRoleChangeAllowed('parent', to); throw new Error('did not throw') }
      catch (e) { expect(e).toBeInstanceOf(RoleChangeError); expect((e as RoleChangeError).status).toBe(403) }
    }
  })

  it('refuses an unknown role (400)', () => {
    for (const to of [undefined, null, '', 'teacher', 'Admin', 5]) {
      try { assertRoleChangeAllowed('admin', to); throw new Error('did not throw') }
      catch (e) { expect((e as RoleChangeError).status).toBe(400) }
    }
  })
})

describe('userManagementService applies the policy', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../server/services/userManagementService.ts'), 'utf8').replace(/\r\n/g, '\n')
  it('updateUserRole checks the policy against the account\u2019s CURRENT role before writing claims', () => {
    const fn = src.slice(src.indexOf('export async function updateUserRole'))
    expect(fn.indexOf('assertRoleChangeAllowed(')).toBeGreaterThan(-1)
    expect(fn.indexOf('assertRoleChangeAllowed(')).toBeLessThan(fn.indexOf('setCustomUserClaims'))
  })
  it('createUser checks the policy before creating the Firebase account', () => {
    const fn = src.slice(src.indexOf('export async function createUser'))
    expect(fn.indexOf('assertRoleChangeAllowed(')).toBeLessThan(fn.indexOf('getAuth().createUser'))
  })
})
