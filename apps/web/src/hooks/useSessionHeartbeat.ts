'use client'

/**
 * apps/web/src/hooks/useSessionHeartbeat.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Pings POST /auth/heartbeat every HEARTBEAT_INTERVAL_MS while
 *   an authenticated tab is open, so sessionService can tell "still
 *   active" apart from "never explicitly logged out" for the Reports >
 *   Admin > Sessions tab. Mounted once in (auth)/layout.tsx, alongside
 *   InactivityManager — side-effect only, no DOM output.
 *
 *   Deliberately independent of useInactivityTimer.ts's activity-event
 *   listeners: that hook resets on user interaction and drives a client-
 *   side auto-logout timer; this one is a plain interval tied to "the tab
 *   is open and authenticated", so the Sessions tab reflects a person
 *   being logged in even during a stretch of read-only inactivity that's
 *   still well under the inactivity timeout.
 * [DEPENDS ON]: W/lib/api-client.ts, W/store/authStore.ts
 */

import { useEffect } from 'react'
import { apiFetch } from '@/lib/api-client'
import { useAuthStore } from '@/store/authStore'

const HEARTBEAT_INTERVAL_MS = 60 * 1000 // 60s — see sessionService's ACTIVE_GRACE_MS (3x this)

export function useSessionHeartbeat(): void {
  const { initialized, user } = useAuthStore()
  const isAuthenticated = initialized && !!user

  useEffect(() => {
    if (!isAuthenticated) return

    function ping() {
      // Fire-and-forget — a missed heartbeat just means this session looks
      // "inactive" a little sooner; it must never surface as a user-facing
      // error or interrupt whatever the person is doing.
      apiFetch<void>('/auth/heartbeat', { method: 'POST' }).catch(() => {})
    }

    ping() // immediate beat on mount / re-auth, not just after the first interval
    const id = setInterval(ping, HEARTBEAT_INTERVAL_MS)
    return () => clearInterval(id)
  }, [isAuthenticated])
}
