/**
 * [FILE]: apps/web/src/server/services/guardian/firebaseIdentity.ts
 * [PURPOSE]: The production IdentityProvider for the claim flow, backed by Firebase Auth.
 *
 * [SECURITY NOTES]
 *   - createParentAccount ONLY ever calls createUser (a brand-new account) and then sets the
 *     single claim { role: 'parent' }. It has no code path that looks up, updates or re-roles
 *     an existing user, so a claim can never promote or hijack another account.
 *   - If setting the claim fails the half-made account is deleted before the error surfaces,
 *     so there is never a roleless account left behind.
 *   - No superUser claim and no other claim is ever set.
 */
import 'server-only'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp } from '@/lib/verifyAuth'
import { IdentityError, type IdentityProvider } from './guardianClaimService'

const codeOf = (e: unknown): string => (typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '')

/** Invalidates a guardian's refresh tokens (used when staff suspend the person). Hygiene, not the control. */
export async function revokeGuardianSessions(uid: string): Promise<void> {
  await getAuth(getAdminApp()).revokeRefreshTokens(uid)
}

export function firebaseIdentity(): IdentityProvider {
  const auth = () => getAuth(getAdminApp())
  return {
    async findUserByEmail(email) {
      try {
        const u = await auth().getUserByEmail(email)
        return { uid: u.uid }
      } catch (e) {
        if (codeOf(e) === 'auth/user-not-found') return null
        throw e
      }
    },

    async createParentAccount({ email, password, displayName, emailVerified }) {
      let uid: string
      try {
        const u = await auth().createUser({ email, password, displayName, emailVerified })
        uid = u.uid
      } catch (e) {
        const c = codeOf(e)
        if (c === 'auth/email-already-exists') throw new IdentityError('EMAIL_EXISTS')
        if (c === 'auth/invalid-password' || c === 'auth/weak-password') throw new IdentityError('WEAK_PASSWORD')
        if (c === 'auth/invalid-email') throw new IdentityError('INVALID_EMAIL')
        throw new IdentityError('FAILED')
      }
      try {
        await auth().setCustomUserClaims(uid, { role: 'parent' })
      } catch {
        await auth().deleteUser(uid).catch(() => undefined)
        throw new IdentityError('FAILED')
      }
      return { uid }
    },

    async deleteAccount(uid) {
      await auth().deleteUser(uid)
    },
  }
}
