// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { ROLE_PERMISSIONS, hasPermission, type Permission } from '@shared/types/permissions'
import { USER_ROLES } from '@shared/types/roles'

const GUARDIAN_PERMS = [
  'guardian.view', 'guardian.propose', 'guardian.invite', 'guardian.approve',
  'guardian.restrict', 'guardian.merge', 'guardian.backfill', 'guardian.viewAccessLog',
] as const satisfies readonly Permission[]

const held = (role: (typeof USER_ROLES)[number]) => GUARDIAN_PERMS.filter((p) => hasPermission(role, p))

describe('guardian portal staff permissions', () => {
  it('admin and high_rank hold every guardian permission', () => {
    expect(held('admin')).toEqual([...GUARDIAN_PERMS])
    expect(held('high_rank')).toEqual([...GUARDIAN_PERMS])
  })

  it('lower_rank (registrar) may view, propose and issue invitations, but never decide who gets access', () => {
    expect(held('lower_rank')).toEqual(['guardian.view', 'guardian.propose', 'guardian.invite'])
  })

  it('no other role holds any guardian permission, including the parent role itself', () => {
    for (const r of USER_ROLES.filter((x) => !['admin', 'high_rank', 'lower_rank'].includes(x))) {
      expect(held(r), r).toEqual([])
    }
  })

  it('the parent role still has an empty permission set', () => {
    expect(ROLE_PERMISSIONS.parent.size).toBe(0)
  })

  it('every guardian.* permission declared in the union is covered by this test', () => {
    const src = ROLE_PERMISSIONS.admin
    const declared = [...src].filter((p) => p.startsWith('guardian.'))
    expect(declared.sort()).toEqual([...GUARDIAN_PERMS].sort())
  })
})
