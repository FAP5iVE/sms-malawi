'use client'

/**
 * apps/web/src/hooks/useSessions.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Data hooks for the Reports > Admin > Sessions tab —
 *   GET /sessions, GET /sessions/summary, GET /sessions/:id/activity,
 *   POST /sessions/:uid/force-logout.
 * [DEPENDS ON]: W/lib/api-client.ts
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch, queryKeys } from '@/lib/api-client'
import type {
  ApiSessionListResponse, ApiSessionSummary, ApiSessionActivityResponse, ApiSessionWindow,
} from '@shared/types/api'

// Sessions change as people work — a 30s refetch keeps "active now" honest
// without hammering the server, same interval AuditLogViewer's own polling
// convention uses for similarly live admin data.
const SESSIONS_REFETCH_MS = 30 * 1000

export function useSessions(sessionWindow: ApiSessionWindow) {
  return useQuery({
    queryKey: queryKeys.sessions.list(sessionWindow),
    queryFn: () => apiFetch<ApiSessionListResponse>(`/sessions?window=${sessionWindow}`),
    refetchInterval: SESSIONS_REFETCH_MS,
  })
}

export function useSessionsSummary() {
  return useQuery({
    queryKey: queryKeys.sessions.summary(),
    queryFn: () => apiFetch<ApiSessionSummary>('/sessions/summary'),
    refetchInterval: SESSIONS_REFETCH_MS,
  })
}

// Enabled only once a session is actually selected — sessionId is null
// until the admin clicks a row. Polls at the same interval as the list
// itself, but only while the session it's showing is still OPEN — an
// action performed after opening the card (in another tab, or by the
// viewed person themself) then appears without needing to close and
// reopen it. refetchInterval as a function reads the query's own latest
// data (TanStack Query v5), so this needs no separate "is it open" input
// from the caller: a closed session's activity can't change, so once
// isActiveNow flips false, polling stops on its own.
export function useSessionActivity(sessionId: string | null) {
  return useQuery({
    queryKey: queryKeys.sessions.activity(sessionId ?? ''),
    queryFn: () => apiFetch<ApiSessionActivityResponse>(`/sessions/${sessionId}/activity`),
    enabled: sessionId !== null,
    refetchInterval: (query) => (query.state.data?.session.isActiveNow ? SESSIONS_REFETCH_MS : false),
  })
}

export function useForceLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (uid: string) => apiFetch<{ success: true }>(`/sessions/${uid}/force-logout`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}
