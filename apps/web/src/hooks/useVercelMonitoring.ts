/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/hooks/useVercelMonitoring.ts
 * [PURPOSE]: TanStack Query hooks for the "Vercel Platform" tab of
 *   /monitoring. Mirrors useMonitoring.ts's exact shape (apiFetch +
 *   queryKeys, no bespoke fetch helper).
 * [DEPENDS ON]: @/lib/api-client, @shared/types/vercel-monitoring
 */
'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch, queryKeys } from '@/lib/api-client'
import type {
  ApiVercelSummary,
  ApiVercelDeployment,
  ApiVercelErrorLog,
  ApiVercelAlert,
} from '@shared/types/vercel-monitoring'

export function useVercelSummary() {
  return useQuery({
    queryKey: queryKeys.vercelMonitoring.summary(),
    queryFn: () => apiFetch<ApiVercelSummary>('/monitoring/vercel/summary'),
    refetchInterval: 60_000,
  })
}

export function useVercelDeployments(limit?: number) {
  const params = limit ? `?limit=${limit}` : ''
  return useQuery({
    queryKey: queryKeys.vercelMonitoring.deployments(limit),
    queryFn: () => apiFetch<ApiVercelDeployment[]>(`/monitoring/vercel/deployments${params}`),
    refetchInterval: 60_000,
  })
}

export function useVercelErrors(level?: string) {
  const params = new URLSearchParams()
  if (level) params.set('level', level)
  return useQuery({
    queryKey: queryKeys.vercelMonitoring.errors(level),
    queryFn: () => apiFetch<ApiVercelErrorLog[]>(`/monitoring/vercel/errors?${params.toString()}`),
    refetchInterval: 60_000,
  })
}

export function useVercelAlerts() {
  return useQuery({
    queryKey: queryKeys.vercelMonitoring.alerts(),
    queryFn: () => apiFetch<ApiVercelAlert[]>('/monitoring/vercel/alerts'),
    refetchInterval: 60_000,
  })
}

export function useAcknowledgeVercelAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ ok: true }>(`/monitoring/vercel/alerts/${id}/acknowledge`, { method: 'PATCH' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.vercelMonitoring.alerts() })
      qc.invalidateQueries({ queryKey: queryKeys.vercelMonitoring.summary() })
    },
    onError: (err) => console.error('[useAcknowledgeVercelAlert] failed:', err),
  })
}