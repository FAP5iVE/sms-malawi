'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch, queryKeys }                    from '@/lib/api-client'
import { useAuthStore }                           from '@/store/authStore'
import type { PendingActionStatus }               from '@prisma/client'

// ─────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────

export interface PendingActionRow {
  id:              string
  entityType:      string
  entityId:        string
  action:          string
  description:     string
  requestedByUid:  string
  requestedByRole: string
  targetState:     Record<string, unknown> | null
  status:          PendingActionStatus
  reviewedByUid:   string | null
  reviewedAt:      string | null
  reviewNotes:     string | null
  expiresAt:       string | null
  createdAt:       string
  updatedAt:       string
}

export interface PendingActionQueryResult {
  actions:      PendingActionRow[]
  total:        number
  page:         number
  pages:        number
  pageSize:     number
  pendingCount: number
}

export interface PendingActionCounts {
  pending:   number
  approved:  number
  rejected:  number
  cancelled: number
  expired:   number
  total:     number
}

export interface PendingActionFilters {
  status?:     PendingActionStatus | 'ALL'
  entityType?: string
  action?:     string
  page?:       number
  pageSize?:   number
  dateFrom?:   string
  dateTo?:     string
}

const PENDING_ACTIONS_KEY = 'pending-actions'

// ─────────────────────────────────────────────────────────
//  LIST
// ─────────────────────────────────────────────────────────

export function usePendingActions(filters: PendingActionFilters = {}) {
  const { role, initialized } = useAuthStore()

  const canAccess =
    role === 'admin'      ||
    role === 'high_rank'  ||
    role === 'lower_rank' ||
    role === 'academic'

  const params = new URLSearchParams()
  if (filters.status)     params.set('status',     filters.status)
  if (filters.entityType) params.set('entityType',  filters.entityType)
  if (filters.action)     params.set('action',      filters.action)
  if (filters.page)       params.set('page',        String(filters.page))
  if (filters.pageSize)   params.set('pageSize',    String(filters.pageSize))
  if (filters.dateFrom)   params.set('dateFrom',    filters.dateFrom)
  if (filters.dateTo)     params.set('dateTo',      filters.dateTo)

  return useQuery({
    queryKey: [PENDING_ACTIONS_KEY, 'list', filters],
    queryFn:  () =>
      apiFetch<PendingActionQueryResult>(`/pending-actions?${params}`),
    enabled:       initialized && canAccess,
    staleTime:     15 * 1000,          // 15 s — these need to be fairly fresh
    refetchInterval: 30 * 1000,        // Poll every 30 s for new incoming actions
  })
}

// ─────────────────────────────────────────────────────────
//  COUNTS  (for dashboard badge)
// ─────────────────────────────────────────────────────────

export function usePendingActionCounts() {
  const { role, initialized } = useAuthStore()
  const canAccess = role === 'admin' || role === 'high_rank'

  return useQuery({
    queryKey: [PENDING_ACTIONS_KEY, 'counts'],
    queryFn:  () => apiFetch<PendingActionCounts>('/pending-actions/counts'),
    enabled:       initialized && canAccess,
    staleTime:     15 * 1000,
    refetchInterval: 30 * 1000,
  })
}

// ─────────────────────────────────────────────────────────
//  SINGLE
// ─────────────────────────────────────────────────────────

export function usePendingAction(id: string | null) {
  const { initialized } = useAuthStore()

  return useQuery({
    queryKey: [PENDING_ACTIONS_KEY, 'detail', id],
    queryFn:  () => apiFetch<PendingActionRow>(`/pending-actions/${id}`),
    enabled:  initialized && Boolean(id),
    staleTime: 30 * 1000,
  })
}

// ─────────────────────────────────────────────────────────
//  CREATE
// ─────────────────────────────────────────────────────────

export interface CreatePendingActionVars {
  entityType:   string
  entityId:     string
  action:       string
  description:  string
  targetState?: Record<string, unknown>
  expiresAt?:   string
}

export function useCreatePendingAction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (vars: CreatePendingActionVars) =>
      apiFetch<PendingActionRow>('/pending-actions', {
        method: 'POST',
        body:   JSON.stringify(vars),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [PENDING_ACTIONS_KEY] })
    },
  })
}

// ─────────────────────────────────────────────────────────
//  APPROVE
// ─────────────────────────────────────────────────────────

export function useApprovePendingAction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      apiFetch<PendingActionRow>(`/pending-actions/${id}/approve`, {
        method: 'PATCH',
        body:   JSON.stringify({ notes }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [PENDING_ACTIONS_KEY] })
    },
  })
}

// ─────────────────────────────────────────────────────────
//  REJECT
// ─────────────────────────────────────────────────────────

export function useRejectPendingAction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      apiFetch<PendingActionRow>(`/pending-actions/${id}/reject`, {
        method: 'PATCH',
        body:   JSON.stringify({ notes }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [PENDING_ACTIONS_KEY] })
    },
  })
}

// ─────────────────────────────────────────────────────────
//  CANCEL
// ─────────────────────────────────────────────────────────

export function useCancelPendingAction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<PendingActionRow>(`/pending-actions/${id}/cancel`, {
        method: 'PATCH',
        body:   JSON.stringify({}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [PENDING_ACTIONS_KEY] })
    },
  })
}