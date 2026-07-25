/**
 * apps/web/src/components/providers/AuthProvider.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE (logout-related surface only — the
 *   onIdTokenChanged subscription's sign-in branch is unchanged)
 * [R-PHASE]: R2 — Auth Session & Login Flow Correctness
 * [PURPOSE]: Fixes the confirmed FCM-unregister-after-signout ordering
 *   defect. Previously, unregisterFcmTokenFromServer(token) was called
 *   inside the onIdTokenChanged SIGNED-OUT branch — i.e. after Firebase had
 *   already cleared auth.currentUser — so apiFetch's internal
 *   getAuth().currentUser lookup resolved to null and the authenticated
 *   DELETE /notifications/unregister-token call failed before it reached
 *   the server, leaving a stale FCM token registered indefinitely. This
 *   file now exports `logout()`, callable from any sign-out call site,
 *   which captures a still-valid token from the CURRENT user, unregisters
 *   the FCM token explicitly with that token (via apiFetch's new
 *   tokenOverride param), and only then calls Firebase signOut(auth). The
 *   fcmTokenRef useRef is promoted to a module-level `currentFcmToken`
 *   variable so logout() can read it from outside the component. The
 *   onIdTokenChanged signed-out branch remains the single place cookies and
 *   the Zustand store are cleared — logout() does not touch either.
 * [DEPENDS ON]: R1 (api-client.ts consolidation) for the tokenOverride
 *   parameter this file's logout() calls apiFetch with.
 *
 * [CHANGE TYPE]: TARGETED EDIT (R4 — Auth/Security Domain), two further
 *   changes on top of R2's logout-ordering change above:
 *   (1) The `!role` branch previously warned to the console and returned,
 *       relying entirely on Firebase's own ~55-minute automatic token
 *       refresh to eventually re-check the claim — with `initialized`
 *       never set to true in the meantime, every RoleGuard/PermissionGuard
 *       in the app showed an indefinite loading skeleton for up to nearly
 *       an hour after a fresh account's custom claims hadn't yet propagated.
 *       Now performs a bounded retry: up to 2 attempts, 3 seconds apart,
 *       each forcing a token refresh via user.getIdToken(true) (which
 *       re-triggers this same onIdTokenChanged handler with fresh claims,
 *       rather than passively waiting for the natural refresh cycle). If
 *       the role claim still hasn't appeared after both retries, calls
 *       setUser(user, null, subtitle) — the only store action that sets
 *       initialized: true — so RoleGuard's existing "Access denied" panel
 *       and PermissionGuard's fallback prop (both already-built, real
 *       terminal UI states) take over instead of an indefinite skeleton.
 *       No new store field or UI component was added: authStore.ts's
 *       `initialized`/`role: null` combination is exactly the signal
 *       RoleGuard/PermissionGuard already branch on for a denied/error
 *       state, confirmed by reading both components directly rather than
 *       assumed.
 *   (2) FCM tokens expire after roughly two months. The registration effect
 *       previously only ever registered once per browser session (gated
 *       solely on `!currentFcmToken`), so a long-lived session (a staff
 *       workstation left signed in, kept alive indefinitely by the ~55-
 *       minute automatic token refresh) would silently stop receiving push
 *       notifications once its token expired, with nothing to trigger a
 *       re-registration. currentFcmToken is now paired with a module-level
 *       currentFcmTokenRegisteredAt timestamp; the registration effect
 *       re-runs registerFcmToken() if more than ~50 days have elapsed since
 *       the last successful registration, in addition to the existing
 *       "never registered this session" case.
 */
'use client'

import { useEffect }         from 'react'
import { useRouter }         from 'next/navigation'
import { onIdTokenChanged, getAuth, signOut } from 'firebase/auth'
import { auth, getFcmToken, removeFcmToken } from '@/lib/firebase'
import { apiFetch }          from '@/lib/api-client'
import { useAuthStore }      from '@/store/authStore'
import { SESSION_COOKIE, ROLE_COOKIE } from '@/proxy'
import type { UserRole } from '@shared/types/roles'

// ─── COOKIE UTILITIES ─────────────────────────────────────
// These must stay in sync with proxy.ts SESSION_COOKIE / ROLE_COOKIE.
// HttpOnly is intentionally false — the proxy reads these cookies at
// the edge, but they are set here from client JS. The cookies contain
// only the Firebase UID (not a secret) and the user role (not sensitive
// for routing — actual authorisation happens server-side).

const COOKIE_MAX_AGE = 60 * 60         // 1 hour — matches Firebase ID token lifetime
const COOKIE_ATTRS = `; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Strict${
  process.env.NODE_ENV === 'production' ? '; Secure' : ''
}`

function setCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=${encodeURIComponent(value)}${COOKIE_ATTRS}`
}

function clearCookie(name: string): void {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Strict${
    process.env.NODE_ENV === 'production' ? '; Secure' : ''
  }`
}

function clearAuthCookies(): void {
  clearCookie(SESSION_COOKIE)
  clearCookie(ROLE_COOKIE)
}

// ─── MODULE-LEVEL FCM TOKEN STATE ─────────────────────────
// Promoted out of the AuthProvider component (was a component-local useRef)
// so the exported logout() function below can read/clear it from any file,
// not just from inside the AuthProvider component's own render tree.
// Set after a successful registerFcmToken() call; cleared in the
// onIdTokenChanged signed-out branch and by logout() itself.
let currentFcmToken: string | null = null

// Timestamp (ms) of the last successful FCM registration. Paired with
// currentFcmToken so the registration effect can detect a stale token —
// FCM tokens expire after roughly two months — and re-register even within
// a single long-lived browser session, not just once per session.
let currentFcmTokenRegisteredAt: number | null = null

/** Re-register the FCM token if more than this long has elapsed since the last registration. */
const FCM_TOKEN_MAX_AGE_MS = 50 * 24 * 60 * 60 * 1000 // ~50 days

// ─── ROLE-CLAIM BOUNDED RETRY ─────────────────────────────
// How many times to force a token refresh and re-check for a role claim
// before giving up and surfacing an explicit error state. See the `!role`
// branch in the onIdTokenChanged handler below.
const ROLE_CLAIM_MAX_RETRIES  = 2
const ROLE_CLAIM_RETRY_DELAY_MS = 3000 // 3 seconds between attempts

// ─── FCM TOKEN REGISTRATION ───────────────────────────────

/**
 * Register the current device's FCM token with the server.
 *
 * This runs as a fire-and-forget side effect after successful login.
 * It does NOT block the auth flow — FCM is optional infrastructure.
 * If anything fails (user denied permissions, browser unsupported,
 * network error, server error), the error is silently swallowed.
 *
 * The token is stored in the returned ref so it can be deregistered
 * on logout via removeFcmToken().
 */
async function registerFcmToken(): Promise<string | null> {
  try {
    const token = await getFcmToken()
    if (!token) return null

    await apiFetch<{ ok: boolean }>('/notifications/register-token', {
      method: 'POST',
      body: JSON.stringify({
        token,
        deviceInfo: typeof navigator !== 'undefined'
          ? navigator.userAgent.substring(0, 200)
          : 'Unknown',
      }),
    })

    return token
  } catch {
    // FCM failures must never surface to the user or disrupt login.
    // Common silent failures:
    //   - Browser denied notifications (Notification.permission === 'denied')
    //   - Safari < 16.4 / any iOS WebView
    //   - VAPID key not configured (dev environments)
    //   - Network error on the register-token API call
    return null
  }
}

/**
 * Tell the server to remove a previously registered FCM token.
 * Called as best-effort on logout — if the server call fails, the
 * client-side deregistration (removeFcmToken) is still attempted.
 *
 * @param authToken - Optional explicit Firebase ID token to authenticate
 *   this call with (via apiFetch's tokenOverride param). logout() supplies
 *   this because by the time it calls here, it has already resolved a
 *   still-valid token from the CURRENT user, ahead of calling signOut().
 *   When omitted (the onIdTokenChanged signed-out branch's own best-effort
 *   call, kept as a defensive fallback for any legacy/direct signOut(auth)
 *   caller), apiFetch falls back to its normal getAuth().currentUser
 *   lookup, which is already null in that branch and will no-op the
 *   Authorization header — this call is expected to fail harmlessly there.
 */
async function unregisterFcmTokenFromServer(
  token: string,
  authToken?: string
): Promise<void> {
  try {
    await apiFetch<{ ok: boolean }>(
      '/notifications/unregister-token',
      {
        method: 'DELETE',
        body: JSON.stringify({ token }),
      },
      authToken
    )
  } catch {
    // Non-critical — the token will be garbage-collected by push.ts's
    // removeInvalidTokens() when the next push send attempt encounters it.
  }
}

// ─── LOGOUT ────────────────────────────────────────────────

/**
 * Shared sign-out entry point. Every sign-out call site (InactivityManager,
 * PageHeader's sign-out menu item, and any future one) must call this
 * instead of calling Firebase signOut(auth) directly or hand-writing its
 * own cookie-clearing logic.
 *
 * Sequencing fix (R2): captures a still-valid ID token from the CURRENT,
 * not-yet-signed-out user and uses it to explicitly unregister the FCM
 * token BEFORE calling signOut(auth) — the previous implementation did this
 * in the opposite order (inside onIdTokenChanged's signed-out branch, after
 * auth.currentUser was already null), which silently broke the
 * authenticated unregister call every time.
 *
 * This function does NOT touch cookies or the Zustand store directly — the
 * onIdTokenChanged signed-out branch (unchanged) remains the single place
 * that happens, triggered by the signOut(auth) call below.
 */
// Best-effort steps in logout() must never block sign-out indefinitely.
// If the network is slow or a request hangs, we abandon the cleanup after
// this many ms and proceed to signOut(auth) regardless. The FCM token is
// still garbage-collected server-side by push.ts's removeInvalidTokens().
const LOGOUT_CLEANUP_TIMEOUT_MS = 2000

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms)),
  ])
}

export async function logout(): Promise<void> {
  if (!auth) return // auth is null during SSR; never reached in browser

  try {
    const user = getAuth().currentUser
    if (user && currentFcmToken) {
      // Capture a still-valid token and unregister the FCM token BEFORE
      // sign-out — but bounded by a timeout so a slow token fetch or a hung
      // unregister request can never delay the sign-out below.
      const tokenToUnregister = currentFcmToken
      await withTimeout(
        (async () => {
          let authToken: string | undefined
          try {
            authToken = await user.getIdToken()
          } catch {
            authToken = undefined
          }
          await unregisterFcmTokenFromServer(tokenToUnregister, authToken)
        })(),
        LOGOUT_CLEANUP_TIMEOUT_MS,
      )
      currentFcmToken = null
      currentFcmTokenRegisteredAt = null
    }
  } catch {
    // Any failure in best-effort cleanup is swallowed — sign-out must
    // still happen. The finally block below guarantees it.
  } finally {
    // The actual sign-out. Runs no matter what happened above, so a hung
    // or failed cleanup can never leave the user stuck "logging out".
    await signOut(auth)
  }
}

// ─── PROVIDER ─────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, clearAuth } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    // auth is null during SSR — guard prevents server-side execution
    if (!auth) return

    // Tracks bounded-retry attempts for a missing role claim within the
    // current sign-in session. Reset to 0 whenever a role claim resolves
    // successfully or the user signs out, so each fresh sign-in gets its
    // own full retry budget. Lives in this closure (shared across every
    // firing of the onIdTokenChanged handler below) rather than component
    // state, since it must not trigger a re-render on its own.
    let roleRetryCount = 0
    let retryTimeoutId: ReturnType<typeof setTimeout> | undefined

    // onIdTokenChanged fires on:
    //   • Initial sign-in
    //   • Sign-out
    //   • Automatic token refresh (every ~55 minutes by the Firebase SDK)
    //   • Force-refresh via getIdToken(true)
    //   • Refresh token revocation (triggers a sign-out event)
    //
    // This is strictly better than onAuthStateChanged which only fires
    // on sign-in / sign-out, leaving stale claims in Zustand after a
    // server-side role change (e.g., admin promotes a teacher).
    const unsubscribe = onIdTokenChanged(auth, async (user) => {

      // ── Signed out ──────────────────────────────────────
      if (!user) {
        // Defensive fallback only: normal sign-outs go through logout()
        // above, which already unregisters currentFcmToken (with an
        // explicit pre-signout token) before signOut(auth) ever fires this
        // branch — so currentFcmToken is expected to already be null here.
        // This remains in case something ever calls Firebase signOut(auth)
        // directly instead of going through logout().
        const tokenToRemove = currentFcmToken
        if (tokenToRemove) {
          void unregisterFcmTokenFromServer(tokenToRemove)
        }

        // Client-side deregistration — removes the SW push subscription
        // from Firebase's servers so no more notifications are sent to this device.
        void removeFcmToken()

        currentFcmToken = null
        currentFcmTokenRegisteredAt = null
        roleRetryCount = 0
        clearAuth()
        clearAuthCookies()
        return
      }

      // ── Signed in — resolve fresh token and custom claims ─
      let idTokenResult
      try {
        idTokenResult = await user.getIdTokenResult()
      } catch {
        // Token fetch failed (network error, token invalid, revoked).
        // Treat as unauthenticated — do not set stale state.
        clearAuth()
        clearAuthCookies()
        return
      }

      const claims = idTokenResult.claims

      // ── Force password change ────────────────────────────
      // The requiresPasswordChange claim is set at account creation by the
      // server. The user must change their password before accessing any page.
      if (claims.requiresPasswordChange === true) {
        setCookie(SESSION_COOKIE, user.uid)
        router.replace('/change-password')
        return
      }

      const role     = (claims.role     ?? null) as UserRole | null
      const subtitle = (claims.subtitle ?? null) as string   | null

      // ── No role claim yet ────────────────────────────────
      // Can happen briefly after account creation before the Firebase Admin SDK
      // setCustomUserClaims() call propagates. Bounded retry: force a token
      // refresh (which re-triggers this same handler with fresh claims)
      // up to ROLE_CLAIM_MAX_RETRIES times, a few seconds apart, rather than
      // passively waiting for Firebase's own ~55-minute automatic refresh.
      if (!role) {
        if (roleRetryCount < ROLE_CLAIM_MAX_RETRIES) {
          roleRetryCount += 1
          console.warn(
            `[AuthProvider] User authenticated but no role claim found ` +
            `(retry ${roleRetryCount}/${ROLE_CLAIM_MAX_RETRIES}).`
          )
          retryTimeoutId = setTimeout(() => {
            void user.getIdToken(true)
          }, ROLE_CLAIM_RETRY_DELAY_MS)
          return
        }

        // Retries exhausted — surface an explicit terminal state instead of
        // leaving every RoleGuard/PermissionGuard in an indefinite loading
        // skeleton. setUser is the only store action that sets
        // initialized: true; passing role: null routes RoleGuard to its
        // existing "Access denied" panel and PermissionGuard to its
        // fallback prop — real terminal UI, not a skeleton that never
        // resolves. The account likely needs administrator setup.
        console.error(
          `[AuthProvider] No role claim after ${ROLE_CLAIM_MAX_RETRIES} retries. ` +
          'Account may need administrator setup — contact support.'
        )
        setUser(user, null, subtitle)
        return
      }

      roleRetryCount = 0 // reset for the next sign-in session

      // ── Set routing cookies (Edge Runtime reads these in proxy.ts) ──
      setCookie(SESSION_COOKIE, user.uid)
      setCookie(ROLE_COOKIE, role)

      // ── Update Zustand store (client-side role context) ──
      setUser(user, role, subtitle)

      // ── FCM Token Registration (fire and forget) ─────────
      // Register the device's FCM push token in the background.
      // This does NOT block the login flow. If it fails (user denied permissions,
      // browser doesn't support push, VAPID key missing), auth still completes.
      //
      // Registers when there is no current token (never registered this
      // session, or cleared on logout) OR when the previously registered
      // token is older than FCM_TOKEN_MAX_AGE_MS — FCM tokens expire after
      // roughly two months, and a long-lived session (kept alive
      // indefinitely by Firebase's own ~55-minute automatic token refresh)
      // would otherwise never re-register once its token expired.
      const fcmTokenIsStale =
        currentFcmTokenRegisteredAt !== null &&
        Date.now() - currentFcmTokenRegisteredAt > FCM_TOKEN_MAX_AGE_MS

      if (!currentFcmToken || fcmTokenIsStale) {
        void (async () => {
          const token = await registerFcmToken()
          if (token) {
            currentFcmToken = token
            currentFcmTokenRegisteredAt = Date.now()
          }
        })()
      }
    })

    return () => {
      unsubscribe()
      if (retryTimeoutId) clearTimeout(retryTimeoutId)
    }
  }, [setUser, clearAuth, router])

  return <>{children}</>
}