/*
 * apps/web/src/hooks/useAnnouncements.ts
 *
 * [CHANGE TYPE]: MAJOR REWRITE
 * [PHASE]: N2 — Fix the read gate (AUDIT §6 Option 1)
 * [PURPOSE]: Previously read Firestore directly from the client via
 *   onSnapshot, which meant every read was evaluated against
 *   firestore.rules — a hand-maintained parallel copy of the permission
 *   matrix. That design was the single largest source of outages this
 *   cycle: any status-vocabulary drift or a single malformed document
 *   (missing an accessed field) failed the whole list query with a
 *   blanket "Missing or insufficient permissions", and every fix required
 *   a separate `firebase deploy --only firestore:rules` decoupled from the
 *   app deploy.
 *
 *   Now reads go through the backend (GET /announcements, GET
 *   /announcements/pending) like every other domain: permission-gated in
 *   Express, visibility resolved server-side, data returned already
 *   role-filtered with createdAt normalized to an ISO string. The client
 *   uses TanStack Query (refetch-on-focus + short staleTime) instead of a
 *   realtime listener — announcements are not chat; near-real-time is
 *   ample and matches the rest of the app.
 *
 *   [PRODUCTION FIX] usePendingAnnouncements()/useMyDrafts() now take an
 *   optional `enabled` flag (default true — every existing call site keeps
 *   firing unconditionally). The redesigned (auth)/announcements/page.tsx
 *   calls both once at the top of the page (so their counts can badge
 *   every content-type tab, not just whichever one is open) instead of
 *   only mounting PendingApprovalList/DraftsList when the viewer could see
 *   them — `enabled` reproduces that same "don't fire the request unless
 *   the viewer holds the permission the route requires" behavior without
 *   depending on conditional mounting to achieve it.
 * [DEPENDS ON]: W/lib/api-client (apiFetch, queryKeys)
 */
'use client'

import { useQuery } from '@tanstack/react-query'
import { apiFetch, queryKeys } from '@/lib/api-client'

export interface Announcement {
  id: string
  title: string
  body: string
  status: string
  targetAll?: boolean
  targetRoles?: string[]
  eventDate?: string | null
  publicWebsite?: boolean
  imageKey?: string | null
  /** [NEW] Byline — see @shared/schemas/announcement's authorName comment. */
  authorName?: string | null
  createdByUid: string
  createdByRole?: string | null
  /** ISO string (normalized server-side; no Firestore Timestamp on the client). */
  createdAt: string | null
  /** [NEW] ANNOUNCEMENT | NEWS | EVENT | ADVERTISEMENT — see
   *  @shared/schemas/announcement. Previously missing from the client type
   *  even though the server always sent it, which is how the auth
   *  Announcements page had no way to tell an Event apart from a plain
   *  Announcement in its own list. */
  postType: 'ANNOUNCEMENT' | 'NEWS' | 'EVENT' | 'ADVERTISEMENT'
}

interface AnnouncementsResponse {
  announcements: Announcement[]
}

/** PUBLISHED announcements visible to the current user (server-resolved). */
export function useAnnouncements() {
  const query = useQuery({
    queryKey: queryKeys.announcements.list(),
    queryFn: () => apiFetch<AnnouncementsResponse>('/announcements'),
    staleTime: 30_000,
  })

  return {
    announcements: query.data?.announcements ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
  }
}

/**
 * PENDING_APPROVAL announcements — for the approver Pending tab. The route
 * is gated by announcement.approvePublish, so non-approvers receive 403;
 * the caller is expected to only enable this for approvers (previously via
 * conditional mounting, now via the `enabled` param below), but the server
 * is the real authority.
 *
 * @param enabled  [NEW] Pass `false` to skip the request entirely (e.g. the
 *   viewer doesn't hold announcement.approvePublish) — defaults to `true`,
 *   so every pre-existing call site is unaffected.
 */
export function usePendingAnnouncements(enabled: boolean = true) {
  const query = useQuery({
    queryKey: queryKeys.announcements.pending(),
    queryFn: () => apiFetch<AnnouncementsResponse>('/announcements/pending'),
    staleTime: 30_000,
    enabled,
  })

  return {
    pending: query.data?.announcements ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
  }
}

/**
 * [NEW] The caller's own DRAFT documents, across all four post types
 * (announcement/event/news/ad) — GET /announcements/drafts. Backs the
 * "Drafts" tab: continue writing later, and keep several drafts before
 * committing to Publish.
 *
 * @param enabled  [NEW] Pass `false` to skip the request entirely (e.g. the
 *   viewer holds neither announcement.create nor
 *   announcement.createWithApproval) — defaults to `true`, so every
 *   pre-existing call site is unaffected.
 */
export function useMyDrafts(enabled: boolean = true) {
  const query = useQuery({
    queryKey: queryKeys.announcements.drafts(),
    queryFn: () => apiFetch<AnnouncementsResponse>('/announcements/drafts'),
    staleTime: 15_000,
    enabled,
  })

  return {
    drafts: query.data?.announcements ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
  }
}