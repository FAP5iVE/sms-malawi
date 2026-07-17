'use client'

/**
 * apps/web/src/hooks/useInactivityTimer.ts — Phase C9
 *
 * Two-stage inactivity timer:
 *
 *   Stage 1 — WARNING  (at timeout − WARNING_BEFORE_MS):
 *     Sets showWarning = true. The InactivityWarningDialog mounts and
 *     begins a 120-second visual countdown.
 *
 *   Stage 2 — LOGOUT   (at timeout):
 *     Signs the user out and redirects to /login?reason=timeout.
 *
 * Reset:
 *   Any of the tracked user events (mousemove, keydown, click, scroll,
 *   touchstart) calls reset(), which:
 *     • clears both timers
 *     • sets showWarning = false  (hides/unmounts the dialog)
 *     • restarts both timers from zero
 *
 *   keepAlive() — called by InactivityWarningDialog "Stay Logged In" button —
 *   dispatches a synthetic mousemove event on window, which triggers the
 *   registered reset listener. This keeps one single reset code path.
 *
 * Timeouts:
 *   student:       1 hour   (60 × 60 × 1000 ms)
 *   all staff:     5 hours  (5 × 60 × 60 × 1000 ms)
 *   Warning fires: 2 minutes before the logout timeout.
 *   Guard:         if timeout ≤ WARNING_BEFORE_MS, warning fires after 10 s.
 *
 * Returns:
 *   showWarning  boolean      — true when the warning dialog should render.
 *   keepAlive    () => void   — call from the dialog's "Stay Logged In" action.
 *
 * [CHANGE TYPE]: TARGETED EDIT (R2 addendum — Auth Session & Login Flow
 *   Correctness). This hook's own Stage 2 auto-logout (fired when the
 *   warning countdown expires with no user response at all — distinct from
 *   the "Log out" button inside InactivityWarningDialog, which layout.tsx's
 *   InactivityManager.handleLogout already handles) was a third,
 *   previously-unlisted call site hand-writing `document.cookie =
 *   'sms_session=...; max-age=0'` and calling Firebase signOut(auth)
 *   directly. Same defect class R2 fixes everywhere else: it now calls
 *   AuthProvider's shared logout(), which sequences the FCM unregister call
 *   ahead of signOut(auth) and lets onIdTokenChanged's signed-out branch
 *   own cookie/store clearing exactly once.
 */

import { useState, useEffect, useCallback } from 'react'
import { useRouter }                         from 'next/navigation'
import { logout as authLogout }              from '@/components/providers/AuthProvider'
import { auth }                              from '@/lib/firebase'
import { useAuthStore }                      from '@/store/authStore'

// Milliseconds before logout at which the warning dialog is shown
const WARNING_BEFORE_MS = 2 * 60 * 1000   // 2 minutes

const TIMEOUTS: Record<string, number> = {
  student: 1 * 60 * 60 * 1000,    // 1 hour
  default: 5 * 60 * 60 * 1000,    // 5 hours for all staff
}

// Events that prove the user is active
const ACTIVITY_EVENTS = [
  'mousemove',
  'keydown',
  'click',
  'scroll',
  'touchstart',
] as const

// ─────────────────────────────────────────────────────────────────────────────

export function useInactivityTimer(): {
  showWarning: boolean
  keepAlive: () => void
} {
  const router = useRouter()
  const { role } = useAuthStore()

  const timeout = role === 'student' ? TIMEOUTS.student! : TIMEOUTS.default!

  // Warning fires this many ms before logout
  const warnDelay = Math.max(10_000, timeout - WARNING_BEFORE_MS)

  const [showWarning, setShowWarning] = useState(false)

  // ── Logout action ──────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    setShowWarning(false)
    if (!auth) return
    await authLogout()
    router.replace('/login?reason=timeout')
  }, [router])

  // ── keepAlive — called by the dialog's "Stay Logged In" button ─────────────
  // Dispatches a synthetic activity event which triggers the reset listener
  // registered in useEffect below. Single reset code path — no timer refs
  // need to be exposed from the effect closure.
  const keepAlive = useCallback(() => {
    window.dispatchEvent(new Event('mousemove'))
  }, [])

  // ── Timer effect ───────────────────────────────────────────────────────────
  useEffect(() => {
    let warningTimer: ReturnType<typeof setTimeout>
    let logoutTimer:  ReturnType<typeof setTimeout>

    const reset = () => {
      clearTimeout(warningTimer)
      clearTimeout(logoutTimer)
      setShowWarning(false)

      // Stage 1: show warning
      warningTimer = setTimeout(() => {
        setShowWarning(true)
      }, warnDelay)

      // Stage 2: logout
      logoutTimer = setTimeout(logout, timeout)
    }

    ACTIVITY_EVENTS.forEach((e) =>
      window.addEventListener(e, reset, { passive: true }),
    )

    // Start timers immediately
    reset()

    return () => {
      clearTimeout(warningTimer)
      clearTimeout(logoutTimer)
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [logout, timeout, warnDelay])

  return { showWarning, keepAlive }
}