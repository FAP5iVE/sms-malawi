/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/hooks/useMonitoring.ts
 * [PURPOSE]: TanStack Query hooks for the /monitoring admin dashboard.
 *   Matches usePlacements.ts's exact shape (apiFetch + queryKeys, no
 *   bespoke fetch helper); every mutation carries onSuccess + onError.
 * [DEPENDS ON]: @/lib/api-client, @shared/types/monitoring
 */
'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch, queryKeys } from '@/lib/api-client'
import type {
  ApiMonitoringSummary,
  ApiMonitoringIssue,
  ApiMonitoringAlert,
  ApiMonitoringRelease,
  ApiMonitoringLog,
  ApiMonitoringFeedback,
  ApiMonitoringReplay,
} from '@shared/types/monitoring'

export function useMonitoringSummary() {
  return useQuery({
    queryKey: queryKeys.monitoring.summary(),
    queryFn: () => apiFetch<ApiMonitoringSummary>('/monitoring/summary'),
    refetchInterval: 60_000,
  })
}

export function useMonitoringIssues(opts: { status?: string; level?: string; uptimeOnly?: boolean } = {}) {
  const params = new URLSearchParams()
  if (opts.status) params.set('status', opts.status)
  if (opts.level) params.set('level', opts.level)
  if (opts.uptimeOnly) params.set('uptimeOnly', 'true')
  return useQuery({
    queryKey: queryKeys.monitoring.issues(opts.status, opts.level, opts.uptimeOnly),
    queryFn: () => apiFetch<ApiMonitoringIssue[]>(`/monitoring/issues?${params.toString()}`),
    refetchInterval: 30_000,
  })
}

export function useMonitoringAlerts() {
  return useQuery({
    queryKey: queryKeys.monitoring.alerts(),
    queryFn: () => apiFetch<ApiMonitoringAlert[]>('/monitoring/alerts'),
    refetchInterval: 60_000,
  })
}

export function useToggleAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiFetch<{ ok: true }>(`/monitoring/alerts/${id}/toggle`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.monitoring.alerts() }),
    onError: (err) => console.error('[useToggleAlert] failed:', err),
  })
}

export function useMonitoringReplays(statsPeriod = '14d') {
  return useQuery({
    queryKey: queryKeys.monitoring.replays(statsPeriod),
    queryFn: () => apiFetch<{ data: ApiMonitoringReplay[] }>(`/monitoring/replays?statsPeriod=${statsPeriod}`),
  })
}

export function useMonitoringReleases(statsPeriod = '30d') {
  return useQuery({
    queryKey: queryKeys.monitoring.releases(statsPeriod),
    queryFn: () => apiFetch<ApiMonitoringRelease[]>(`/monitoring/releases?statsPeriod=${statsPeriod}`),
    refetchInterval: 5 * 60_000,
  })
}

export function useMonitoringLogs(level?: string) {
  const params = new URLSearchParams()
  if (level) params.set('level', level)
  return useQuery({
    queryKey: queryKeys.monitoring.logs(level),
    queryFn: () => apiFetch<{ data: ApiMonitoringLog[] }>(`/monitoring/logs?${params.toString()}`),
    refetchInterval: 2 * 60_000,
  })
}

export function useMonitoringFeedback() {
  return useQuery({
    queryKey: queryKeys.monitoring.feedback(),
    queryFn: () => apiFetch<{ data: ApiMonitoringFeedback[] }>('/monitoring/feedback'),
  })
}

export function useSubmitFeedback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { message: string; associatedIssueId?: string }) =>
      apiFetch<{ eventId: string }>('/monitoring/feedback', { method: 'POST', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.monitoring.feedback() }),
    onError: (err) => console.error('[useSubmitFeedback] failed:', err),
  })
}