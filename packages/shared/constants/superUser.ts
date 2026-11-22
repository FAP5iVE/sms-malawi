/**
 * packages/shared/constants/superUser.ts
 *
 * Single source of truth for the "alpha_admin" super user.
 *
 * HOW THE SUPER USER WORKS
 * ────────────────────────
 * alpha_admin is NOT a tenth role. The app has nine roles wired into hundreds
 * of role gates (Express middleware, per-role dashboards, Firestore rules,
 * Prisma's StaffRole enum…), and a tenth role would be rejected or mis-rendered
 * by every gate that does not know about it. Instead the account is an
 * ordinary `admin` (so every existing admin code path just works) that
 * additionally carries a Firebase custom claim, `superUser: true`.
 *
 * Every authorization gate that decides access by role or by permission
 * honours that claim and lets the holder through:
 *   - server:   verifyAuth → requireRole / requirePermission* / attachPermissions
 *               and the direct hasPermission()/hasAnyPermission() calls
 *   - client:   usePermissions, RoleGuard, navigation, the edge proxy
 *   - Firestore security rules (token.superUser)
 *
 * SECURITY: custom claims can only be written with the Firebase Admin SDK, so
 * a user cannot grant this to themselves. The only code that sets the claim is
 * `pnpm seed:superadmin` (apps/web/scripts/seed/superAdmin.ts). Treat that
 * account's password like a root credential.
 */

/** Login name of the super user. Also the local part of its default email. */
export const SUPER_USER_USERNAME = 'alpha_admin'

/** Name of the Firebase custom claim that marks the super user. */
export const SUPER_USER_CLAIM = 'superUser'

/**
 * True only when a claim value is exactly boolean `true`. Strict on purpose:
 * `"true"`, `1`, or any other truthy value must NOT grant super-user access.
 */
export function isSuperUserClaim(value: unknown): boolean {
  return value === true
}
