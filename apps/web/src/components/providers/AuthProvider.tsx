'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { onIdTokenChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuthStore } from '@/store/authStore'
import { SESSION_COOKIE, ROLE_COOKIE } from '@/proxy'
import type { UserRole } from '@shared/types/roles'

// ─── COOKIE UTILITIES ─────────────────────────────────────
// These must stay in sync with proxy.ts SESSION_COOKIE / ROLE_COOKIE.
// HttpOnly is intentionally false — the proxy reads these cookies at
// the edge, but they are set here from client JS.  The cookies contain
// only the Firebase UID (not a secret) and the user role (not sensitive
// for routing — actual authorisation happens server-side).

const COOKIE_MAX_AGE = 60 * 60          // 1 hour — matches Firebase ID token lifetime
const COOKIE_ATTRS = `; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Strict${
  process.env.NODE_ENV === 'production' ? '; Secure' : ''
}`

function setCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=${encodeURIComponent(value)}${COOKIE_ATTRS}`
}

function clearCookie(name: string): void {
  if (typeof document === 'undefined') return
  // Setting Max-Age=0 immediately expires the cookie
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Strict${
    process.env.NODE_ENV === 'production' ? '; Secure' : ''
  }`
}

function clearAuthCookies(): void {
  clearCookie(SESSION_COOKIE)
  clearCookie(ROLE_COOKIE)
}

// ─── PROVIDER ─────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, clearAuth } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    // auth is null during SSR — guard prevents server-side execution
    if (!auth) return

    // onIdTokenChanged fires on:
    //   • Initial sign-in
    //   • Sign-out
    //   • Automatic token refresh (every ~55 minutes by the Firebase SDK)
    //   • Force-refresh via getIdToken(true)
    //   • Refresh token revocation (triggers sign-out event)
    //
    // This is strictly better than onAuthStateChanged which only fires
    // on sign-in / sign-out, leaving stale claims in Zustand after a
    // server-side role change.
    const unsubscribe = onIdTokenChanged(auth, async (user) => {
      // ── Signed out
      if (!user) {
        clearAuth()
        clearAuthCookies()
        return
      }

      // ── Signed in — resolve fresh token and custom claims
      let idTokenResult
      try {
        idTokenResult = await user.getIdTokenResult()
      } catch {
        // Token fetch failed (network error, token invalid)
        // Treat as unauthenticated — do not set stale state
        clearAuth()
        clearAuthCookies()
        return
      }

      const claims = idTokenResult.claims

      // ── Force password change (set at account creation)
      if (claims.requiresPasswordChange === true) {
        // Set a minimal session cookie so proxy.ts lets the
        // change-password route through, then redirect.
        setCookie(SESSION_COOKIE, user.uid)
        router.replace('/change-password')
        return
      }

      const role = (claims.role ?? null) as UserRole | null
      const subtitle = (claims.subtitle ?? null) as string | null

      // ── Guard: user account exists but has no role claim yet
      // This can happen briefly after account creation before the
      // Firebase Admin SDK setCustomUserClaims call completes.
      if (!role) {
        // Do not sign the user out — wait for next token refresh.
        // Zustand will remain in its initial cleared state.
        console.warn(
          '[AuthProvider] User authenticated but no role claim found. ' +
            'Waiting for role to propagate via token refresh.'
        )
        return
      }

      // ── Set routing cookies (Edge Runtime reads these in proxy.ts)
      setCookie(SESSION_COOKIE, user.uid)
      setCookie(ROLE_COOKIE, role)

      // ── Update Zustand store (client-side role context)
      setUser(user, role, subtitle)
    })

    return () => unsubscribe()
  }, [setUser, clearAuth, router])

  return <>{children}</>
}