'use client'

/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/hooks/useApprovals.ts
 * [PURPOSE]: TanStack Query hooks for the Approvals Hub (/approvals):
 *   the unified list, tab counts, the sidebar badge, and the decision
 *   mutations (single + bulk). One hook family serves every module's
 *   approvals, so the Approvals page, the dashboard widget and the sidebar
 *   badge always agree.
 *
 *   After any decision the hub caches are invalidated AND the caches of the
 *   modules that own the request are marked stale, so the HR / Finance /
 *   Library pages don't keep showing a request as pending.
 *
 * [DEPENDS ON]: @/lib/api-client, @shared/constants/approvals
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, queryKeys } from '@/lib/api-client'
import { STALE } from '@/components/providers/QueryProvider'
import { useAuthStore } from '@/store/authStore'
import type {
  ApprovalAction,
  ApprovalBulkResult,
  ApprovalListParams,
  ApprovalListResult,
  ApprovalScope,
  ApprovalSource,
  ApprovalSummary,
} from '@shared/constants/approvals'

const POLL_MS = 60 * 1000

/** Query-key roots owned by the modules that have approval steps. */
const MODULE_KEY_ROOTS = new Set([
  'hr', 'leave', 'loans', 'payroll', 'finances', 'finance', 'expenses', 'budgets',
  'library', 'assets', 'inventory', 'procurement', 'announcements', 'students',
  'classes', 'exams', 'timetable', 'applications', 'placements', 'pendingActions',
  'pending-actions', 'notifications',
])

function toSearch(params: ApprovalListParams): string {
  const q = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    q.set(key, String(value))
  }
  return q.toString()
}

// ─── READS ────────────────────────────────────────────────

export function useApprovalList(params: ApprovalListParams) {
  const { initialized, role } = useAuthStore()
  return useQuery({
    queryKey: queryKeys.approvals.list(params),
    queryFn: () => apiFetch<ApprovalListResult>(`/approvals?${toSearch(params)}`),
    enabled: initialized && !!role,
    staleTime: STALE.REALTIME,
    refetchInterval: POLL_MS,
    placeholderData: keepPreviousData,
  })
}

export function useApprovalSummary(scope: ApprovalScope) {
  const { initialized, role } = useAuthStore()
  return useQuery({
    queryKey: queryKeys.approvals.summary(scope),
    queryFn: () => apiFetch<ApprovalSummary>(`/approvals/summary?scope=${scope}`),
    enabled: initialized && !!role,
    staleTime: STALE.REALTIME,
    refetchInterval: POLL_MS,
    placeholderData: keepPreviousData,
  })
}

/** Number of requests waiting on THIS user — drives the sidebar badge. */
export function useApprovalBadge() {
  const { initialized, role } = useAuthStore()
  return useQuery({
    queryKey: queryKeys.approvals.badge(),
    queryFn: () => apiFetch<{ awaitingMyReview: number }>('/approvals/badge'),
    enabled: initialized && !!role,
    staleTime: 30 * 1000,
    refetchInterval: POLL_MS,
  })
}

// ─── WRITES ───────────────────────────────────────────────

export interface DecisionVars {
  source: ApprovalSource
  sourceId: string
  action: ApprovalAction
  notes?: string
  paidImmediately?: boolean
}

export interface BulkDecisionVars {
  action: Exclude<ApprovalAction, 'cancel'>
  items: ReadonlyArray<{ source: ApprovalSource; sourceId: string }>
  notes?: string
  paidImmediately?: boolean
}

function useRefreshAfterDecision() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.approvals.all })
    void queryClient.invalidateQueries({
      predicate: (q) => MODULE_KEY_ROOTS.has(String(q.queryKey[0] ?? '')),
    })
  }
}

export function useApprovalDecision() {
  const refresh = useRefreshAfterDecision()
  return useMutation({
    mutationFn: ({ source, sourceId, ...body }: DecisionVars) =>
      apiFetch<{ ok: true; key: string }>(`/approvals/${source}/${encodeURIComponent(sourceId)}/decision`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSettled: refresh,
  })
}

export function useBulkApprovalDecision() {
  const refresh = useRefreshAfterDecision()
  return useMutation({
    mutationFn: (vars: BulkDecisionVars) =>
      apiFetch<ApprovalBulkResult>('/approvals/bulk', {
        method: 'POST',
        body: JSON.stringify(vars),
      }),
    onSettled: refresh,
  })
}
