'use client'

/**
 * apps/web/src/hooks/useNotificationFeed.ts
 *
 * [CHANGE TYPE]: MAJOR REWRITE
 * [PHASE]: N4 — Build the real per-user notification feed (AUDIT §2-D)
 * [PURPOSE]: Previously this hook did NOT read a notification feed at all —
 *   it re-read useAnnouncements() (published announcements) and tracked
 *   "unread" with a per-device localStorage watermark. There was no real
 *   per-user, per-event feed, so events like fee reminders, result
 *   releases, leave/placement updates never appeared in the bell, and read
 *   state didn't follow the user across devices.
 *
 *   Now it reads the real notifications/{uid}/items feed via
 *   GET /notifications/feed (backed by notificationFeedService, written by
 *   every server-side event generator). Unread state is server-side per-user
 *   `read` flags. markAllSeen() calls PATCH /notifications/feed/read-all.
 *
 *   The return shape ({ notifications, unreadCount, markAllSeen, isLoading }
 *   and the FeedNotification type) is preserved so PageHeader is unchanged.
 * [DEPENDS ON]: W/lib/api-client (apiFetch, queryKeys)
 */

import { useCallback, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNowStrict } from 'date-fns'
import { apiFetch, queryKeys } from '@/lib/api-client'

// ─────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────

export interface FeedNotification {
  id: string
  title: string
  body: string
  /** Relative display time, e.g. "2 hours ago". */
  time: string
  /** Epoch ms — retained for compatibility; derived from createdAt. */
  createdAtMs: number
  unread: boolean
  /** Optional deep-link the panel can navigate to. */
  actionUrl: string | null
}

interface ApiFeedItem {
  id: string
  title: string
  body: string
  type: string
  category: string
  read: boolean
  actionUrl: string | null
  createdAt: string | null
  readAt: string | null
}

interface FeedResponse {
  items: ApiFeedItem[]
  unreadCount: number
}

/** How many items the bell panel shows at most. */
const FEED_LIMIT = 15

function toMs(iso: string | null): number {
  if (!iso) return 0
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : 0
}

// ─────────────────────────────────────────────────────────
//  HOOK
// ─────────────────────────────────────────────────────────

export function useNotificationFeed() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: queryKeys.notifications.feed(),
    queryFn: () => apiFetch<FeedResponse>('/notifications/feed'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const notifications: FeedNotification[] = useMemo(() => {
    const items = query.data?.items ?? []
    return items.slice(0, FEED_LIMIT).map((it) => {
      const ms = toMs(it.createdAt)
      return {
        id: it.id,
        title: it.title,
        body: it.body,
        time: ms > 0 ? `${formatDistanceToNowStrict(new Date(ms))} ago` : '',
        createdAtMs: ms,
        unread: !it.read,
        actionUrl: it.actionUrl,
      }
    })
  }, [query.data])

  const unreadCount = query.data?.unreadCount ?? 0

  /** Mark every item read server-side, then refetch. Called when the panel opens. */
  const markAllSeen = useCallback(async () => {
    try {
      await apiFetch('/notifications/feed/read-all', { method: 'PATCH' })
    } catch {
      // Best-effort — a failed mark-read shouldn't throw in the UI.
    } finally {
      await queryClient.invalidateQueries({ queryKey: queryKeys.notifications.feed() })
    }
  }, [queryClient])

  return { notifications, unreadCount, markAllSeen, isLoading: query.isLoading }
}