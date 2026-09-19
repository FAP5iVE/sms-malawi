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
// until the admin clicks a row.
export function useSessionActivity(sessionId: string | null) {
  return useQuery({
    queryKey: queryKeys.sessions.activity(sessionId ?? ''),
    queryFn: () => apiFetch<ApiSessionActivityResponse>(`/sessions/${sessionId}/activity`),
    enabled: sessionId !== null,
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
