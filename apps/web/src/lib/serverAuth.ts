/**
 * apps/web/src/lib/serverAuth.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: The one place a Next.js Server Action turns "a request arrived"
 *   into "this verified Firebase user is calling". Server Actions are public
 *   HTTP endpoints — anyone can POST to one directly — so each mutation must
 *   authenticate its caller itself (Next.js data-security guidance).
 *
 *   This replaces settings.actions.ts's old getCallerFromCookie(), which read
 *   a bare UID from the `sms_session` cookie and the role from `sms_role`.
 *   Both cookies are written by client JS (AuthProvider.tsx) and are
 *   attacker-controlled; admin.auth().getUser(uid) only proves that a
 *   Firebase account with that UID EXISTS, never that the caller owns it.
 *   A UID is an identifier, not a credential.
 *
 * [DESIGN]:
 *   - Credential = Firebase ID token, verified with verifyIdToken(token, true).
 *     This is the SAME model verifyAuth.ts uses for the Express routes and
 *     API route handlers (including checkRevoked=true, so
 *     sessionService.forceLogout() ends a session promptly). We deliberately
 *     do not introduce a second session mechanism (e.g. session cookies).
 *   - The token is passed explicitly as an action argument, so there is no
 *     ambient credential for a cross-site request to ride on.
 *   - `uid` comes from the verified token. `role` and `superUser` come from
 *     the authoritative Firebase user record loaded by that verified uid —
 *     NOT from the token's claims and never from `sms_role`. Reason:
 *     userManagementService.updateUserRole() calls setCustomUserClaims()
 *     without revoking refresh tokens, so a downgraded user's old ID token
 *     would otherwise keep its old role claim for up to ~1h. Reading the
 *     record makes a role change effective on the very next settings
 *     mutation. These actions are rare admin writes, so the extra
 *     round trip is cheap.
 *   - Fails closed: missing, malformed, oversized, expired, revoked,
 *     disabled, unknown-role and any unexpected verification failure all
 *     throw AuthError. There is no fallback role.
 *   - AuthError messages are fixed, safe strings. Firebase's own error text
 *     is never surfaced; `reason` exists for server-side logging/tests only.
 *
 *   Authentication only. Whether this user may perform a given operation is
 *   a separate check (hasPermission) that each action makes itself.
 * [DEPENDS ON]: lib/verifyAuth.ts (getAdminApp singleton)
 */
import 'server-only'
import * as admin from 'firebase-admin'
import type { UserRecord } from 'firebase-admin/auth'
import { getAdminApp } from '@/lib/verifyAuth'
import { USER_ROLES, type UserRole } from '@shared/types/roles'
import { isSuperUserClaim } from '@shared/constants/superUser'

/** Verified identity of the caller. Only ever built from verified data. */
export interface CurrentUser {
  uid: string
  role: UserRole
  superUser: boolean
}

export type AuthFailureReason =
  | 'missing'
  | 'invalid'
  | 'expired'
  | 'revoked'
  | 'disabled'
  | 'no_role'

const MESSAGE_SIGN_IN = 'You must be signed in to perform this action.'
const MESSAGE_REAUTH = 'Your session is no longer valid. Please sign in again.'

/**
 * Thrown for every "no valid identity" outcome (HTTP 401 semantics).
 * `message` is always safe to show to the caller.
 */
export class AuthError extends Error {
  readonly reason: AuthFailureReason

  constructor(reason: AuthFailureReason) {
    super(reason === 'missing' ? MESSAGE_SIGN_IN : MESSAGE_REAUTH)
    this.name = 'AuthError'
    this.reason = reason
  }
}

// A Firebase ID token is a ~1–2 KB JWT. Refuse anything wildly larger before
// spending a network round trip on it.
const MAX_TOKEN_LENGTH = 8192

function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value)
}

function reasonFromFirebaseError(err: unknown): AuthFailureReason {
  switch ((err as { code?: string } | undefined)?.code) {
    case 'auth/id-token-expired':
      return 'expired'
    case 'auth/id-token-revoked':
      return 'revoked'
    case 'auth/user-disabled':
      return 'disabled'
    default:
      return 'invalid'
  }
}

/**
 * Resolve the verified caller from a Firebase ID token.
 *
 * `idToken` is typed `unknown` on purpose: Server Action arguments arrive from
 * the network and TypeScript's `string` is not a runtime guarantee.
 *
 * @throws AuthError for any reason the caller cannot be positively identified.
 */
export async function requireCurrentUser(idToken: unknown): Promise<CurrentUser> {
  if (typeof idToken !== 'string' || idToken.length === 0 || idToken.length > MAX_TOKEN_LENGTH) {
    throw new AuthError('missing')
  }

  const auth = admin.auth(getAdminApp())

  // checkRevoked = true → also rejects tokens issued before the user's
  // refresh tokens were revoked, and tokens of disabled accounts.
  let uid: string
  try {
    const decoded = await auth.verifyIdToken(idToken, true)
    uid = decoded.uid
  } catch (err) {
    throw new AuthError(reasonFromFirebaseError(err))
  }

  // Authoritative role/superUser: the account record for the VERIFIED uid.
  let record: UserRecord
  try {
    record = await auth.getUser(uid)
  } catch {
    throw new AuthError('invalid')
  }

  if (record.disabled) throw new AuthError('disabled')

  const claims = record.customClaims
  const role = claims?.['role']
  if (!isUserRole(role)) throw new AuthError('no_role')

  return { uid, role, superUser: isSuperUserClaim(claims?.['superUser']) }
}
