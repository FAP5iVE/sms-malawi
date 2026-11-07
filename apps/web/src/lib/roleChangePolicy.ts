/**
 * [FILE]: apps/web/src/lib/roleChangePolicy.ts
 * [PURPOSE]: Rules for assigning a role through user management.
 *
 *   The `parent` role is created ONLY by the guardian invitation-claim flow, which
 *   ties the account to a verified GuardianProfile. User management must never
 *   mint one (an admin could otherwise hand a parent token to anyone with no link
 *   to a child), and must never convert an existing parent account into a staff
 *   role (that would give a member of the public a staff token). Both directions
 *   are refused. To remove a guardian, disable the account.
 *
 * Pure (no I/O) so it is unit-tested directly.
 */
import { isValidRole } from '@shared/types/roles'

export class RoleChangeError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'RoleChangeError'
    this.status = status
  }
}

/**
 * Throws RoleChangeError when `newRole` may not be assigned to an account that
 * currently holds `currentRole` (null/undefined for a brand-new account).
 */
export function assertRoleChangeAllowed(currentRole: unknown, newRole: unknown): void {
  if (!isValidRole(newRole)) {
    throw new RoleChangeError('Unknown role.', 400)
  }
  if (newRole === 'parent') {
    throw new RoleChangeError(
      'The parent role is assigned only through the guardian invitation flow.',
      403,
    )
  }
  if (currentRole === 'parent') {
    throw new RoleChangeError(
      "A parent account's role cannot be changed. Disable the account instead.",
      403,
    )
  }
}
