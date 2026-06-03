'use client'

import { useEffect, useRef } from 'react'
import { useRouter }         from 'next/navigation'
import { onIdTokenChanged }  from 'firebase/auth'
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
 */
async function unregisterFcmTokenFromServer(token: string): Promise<void> {
  try {
    await apiFetch<{ ok: boolean }>('/notifications/unregister-token', {
      method: 'DELETE',
      body: JSON.stringify({ token }),
    })
  } catch {
    // Non-critical — the token will be garbage-collected by push.ts's
    // removeInvalidTokens() when the next push send attempt encounters it.
  }
}

// ─── PROVIDER ─────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, clearAuth } = useAuthStore()
  const router = useRouter()

  // Track the current FCM token so we can deregister on logout.
  // useRef avoids re-renders and persists across the component lifecycle.
  const fcmTokenRef = useRef<string | null>(null)

  useEffect(() => {
    // auth is null during SSR — guard prevents server-side execution
    if (!auth) return

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
        // Deregister FCM token from the server (best-effort, authenticated call
        // may fail if the token is already expired — that's acceptable).
        const tokenToRemove = fcmTokenRef.current
        if (tokenToRemove) {
          // Server-side cleanup (best effort, authenticated)
          void unregisterFcmTokenFromServer(tokenToRemove)
        }

        // Client-side deregistration — removes the SW push subscription
        // from Firebase's servers so no more notifications are sent to this device.
        void removeFcmToken()

        fcmTokenRef.current = null
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
      // setCustomUserClaims() call propagates to the next token refresh.
      // Do not sign out — wait for the next automatic token refresh (~55 min)
      // or force-refresh via getIdToken(true) from the user management page.
      if (!role) {
        console.warn(
          '[AuthProvider] User authenticated but no role claim found. ' +
          'Waiting for role to propagate via next token refresh.'
        )
        return
      }

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
      // We only register on the initial sign-in (fcmTokenRef is null) or if the
      // token was previously cleared, to avoid redundant server calls on every
      // automatic token refresh (~every 55 minutes).
      if (!fcmTokenRef.current) {
        void (async () => {
          const token = await registerFcmToken()
          if (token) {
            fcmTokenRef.current = token
          }
        })()
      }
    })

    return () => unsubscribe()
  }, [setUser, clearAuth, router])

  return <>{children}</>
}
