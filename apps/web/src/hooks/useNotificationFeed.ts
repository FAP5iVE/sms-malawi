'use client'

/**
 * apps/web/src/hooks/useNotificationFeed.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: Backs PageHeader's notification bell with the real
 *   notification system instead of MOCK_NOTIFICATIONS and the permanently
 *   hardcoded unreadCount = 2 every user has been shown in production.
 *
 *   Source of truth: useAnnouncements() (W/hooks/useAnnouncements.ts) —
 *   the existing real-time Firestore listener over PUBLISHED
 *   announcements, already role-filtered to what the current user may
 *   see, and already the store the R11–R13 FCM/Resend pipelines publish
 *   into. This hook layers unread tracking on top:
 *
 *   • Read state is per-device, persisted in localStorage under
 *     LAST_SEEN_STORAGE_KEY as an epoch-milliseconds watermark. An item is
 *     unread when its createdAt is newer than the watermark. There is no
 *     per-user read-receipt model in the schema, and R15 (a UI phase)
 *     deliberately does not add one — a device-local watermark is the
 *     honest, zero-migration implementation of "the bell reflects real
 *     unread notifications".
 *   • markAllSeen() advances the watermark to now — PageHeader calls it
 *     when the notification panel opens, clearing the badge.
 *   • Timestamps are formatted as relative time ("2h ago") via date-fns,
 *     matching the panel's existing visual design.
 * [DEPENDS ON]: W/hooks/useAnnouncements.ts (R13's real-time listener)
 */

import { useCallback, useMemo, useState } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import { useAnnouncements } from '@/hooks/useAnnouncements'
import type { Announcement } from '@/hooks/useAnnouncements'

// ─────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────

export interface FeedNotification {
  id: string
  title: string
  body: string
  /** Relative display time, e.g. "2 hours ago". */
  time: string
  /** Epoch ms — used for the unread comparison. */
  createdAtMs: number
  unread: boolean
}

// ─────────────────────────────────────────────────────────
//  LAST-SEEN WATERMARK (per-device, localStorage)
// ─────────────────────────────────────────────────────────

const LAST_SEEN_STORAGE_KEY = 'sms-notifications-last-seen'

/** How many announcements the bell panel shows at most. */
const FEED_LIMIT = 15

function readLastSeen(): number {
  if (typeof window === 'undefined') return 0
  const raw = window.localStorage.getItem(LAST_SEEN_STORAGE_KEY)
  const parsed = raw ? Number(raw) : 0
  return Number.isFinite(parsed) ? parsed : 0
}

function writeLastSeen(ms: number): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LAST_SEEN_STORAGE_KEY, String(ms))
}

/**
 * Firestore Timestamps arrive with toMillis(); anything else (a missing
 * field on a legacy document) falls back to 0 — treated as "old", never
 * inflating the unread count.
 */
function createdAtMs(a: Announcement): number {
  const ts = a.createdAt
  if (ts && typeof ts.toMillis === 'function') return ts.toMillis()
  return 0
}

// ─────────────────────────────────────────────────────────
//  HOOK
// ─────────────────────────────────────────────────────────

export function useNotificationFeed() {
  const { announcements, loading } = useAnnouncements()
  const [lastSeen, setLastSeen] = useState<number>(readLastSeen)

  const notifications: FeedNotification[] = useMemo(
    () =>
      announcements.slice(0, FEED_LIMIT).map((a) => {
        const ms = createdAtMs(a)
        return {
          id:          a.id,
          title:       a.title,
          body:        a.body,
          time:        ms > 0 ? `${formatDistanceToNowStrict(new Date(ms))} ago` : '',
          createdAtMs: ms,
          unread:      ms > lastSeen,
        }
      }),
    [announcements, lastSeen],
  )

  const unreadCount = useMemo(
    () => notifications.filter((n) => n.unread).length,
    [notifications],
  )

  /** Advance the watermark to now — call when the panel opens. */
  const markAllSeen = useCallback(() => {
    const now = Date.now()
    writeLastSeen(now)
    setLastSeen(now)
  }, [])

  return { notifications, unreadCount, markAllSeen, isLoading: loading }
}
