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
  createdByUid: string
  createdByRole?: string | null
  /** ISO string (normalized server-side; no Firestore Timestamp on the client). */
  createdAt: string | null
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
 * the page is expected to only mount this for approvers (it renders the tab
 * behind the same permission), but the server is the real authority.
 */
export function usePendingAnnouncements() {
  const query = useQuery({
    queryKey: queryKeys.announcements.pending(),
    queryFn: () => apiFetch<AnnouncementsResponse>('/announcements/pending'),
    staleTime: 30_000,
  })

  return {
    pending: query.data?.announcements ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error as Error).message : null,
  }
}