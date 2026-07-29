/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/hooks/useHR.ts
 * [R-PHASE]: R1 — API Client & Query-Key Singleton Consolidation; further
 *   edited in R11 — HR Domain: Loans UI, Leave-Conflict Wiring &
 *   Directory Access Correction
 * [PURPOSE]: HR staff/leave/loans/performance hooks — repointed at the canonical apiFetch/queryKeys singleton. Not named in the roadmap's 13-file list, but matched the identical local-apiFetch/local-keys anti-pattern and was required to satisfy R1's own codebase-wide acceptance criteria.
 *   R11 adds useLoans()/useApproveLoan()/useDisburseLoan()/
 *   useRecordLoanRepayment() — the Loans tab's admin-management view
 *   needs all four; only useRequestLoan() existed despite the roadmap's
 *   claim that its "approve/disburse siblings" were "confirmed
 *   implemented but callerless" (verified directly against this file:
 *   they did not exist at all). The backend routes and service functions
 *   these call were already correct — only the hooks were missing.
 *   [POST-R11 follow-up]: adds useMyLoans() — self-service loan status,
 *   a gap identified after R11 shipped (a staff member who requested a
 *   loan had no way to check on it afterward).
 * [DEPENDS ON]: W/lib/api-client.ts
 */
'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateStaffInput, LeaveRequestInput, ReviewLeaveInput, LoanRequestInput, PerformanceNoteInput } from '@shared/schemas/hr'
import type { ApiStaffLoan, ApiLeaveRequest } from '@shared/types/api'
import type { ConflictCheckResult } from '@/server/services/leaveConflictService'
import { apiFetch, queryKeys } from '@/lib/api-client'
import { STALE } from '@/components/providers/QueryProvider'

export function useStaffDirectory(filters: { department?: string; jobTitle?: string; status?: string; search?: string } = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
  return useQuery({
    queryKey: queryKeys.hr.staff(filters),
    queryFn: () => apiFetch(`/hr?${params}`),
  })
}

export function useStaffProfile(id: string) {
  return useQuery({
    queryKey: queryKeys.hr.staffDetail(id),
    queryFn: () => apiFetch(`/hr/${id}`),
    enabled: !!id,
  })
}

export function useCreateStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateStaffInput) => apiFetch('/hr', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.hr.all() }),
  })
}

export function useLeaveRequests(filters: { staffId?: string; status?: string } = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
  return useQuery({
    queryKey: queryKeys.hr.leaveRequests(filters),
    queryFn: () => apiFetch(`/hr/leave/requests?${params}`),
    // Same fix and same reasoning as useLoans() above — a submission in
    // one session doesn't invalidate another already-open session's cache.
    staleTime: STALE.REALTIME,
    refetchInterval: STALE.REALTIME,
  })
}

export function useApplyForLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: LeaveRequestInput) => apiFetch('/hr/leave/apply', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.hr.all() }),
  })
}

export function useReviewLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ReviewLeaveInput }) =>
      apiFetch<ApiLeaveRequest & { conflictResult: ConflictCheckResult }>(
        `/hr/leave/requests/${id}/review`,
        { method: 'PATCH', body: JSON.stringify(data) }
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.hr.all() }),
  })
}

export function useRequestLoan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: LoanRequestInput) => apiFetch('/hr/loans/request', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.hr.all() }),
  })
}

/**
 * [R-PHASE]: R11 — HR Domain: Loans UI, Leave-Conflict Wiring & Directory
 *   Access Correction
 * Admin-management loan hooks — the Loans tab's request/approve/disburse
 * form (previously a "coming in Phase 6" placeholder).
 */
export function useLoans(status?: ApiStaffLoan['status']) {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  return useQuery({
    queryKey: queryKeys.hr.loans({ status }),
    queryFn: () => apiFetch<ApiStaffLoan[]>(`/hr/loans?${params}`),
    // [PRODUCTION FIX 2026-07-28] A loan submitted by one user in their own
    // session doesn't invalidate another (HR's) already-open session's
    // cache — invalidateQueries only affects the submitter's own client.
    // Traced creation, the staff relation, and invalidation and all were
    // structurally correct; this closes the actual gap — HR's queue was
    // relying entirely on a fresh page load/remount to ever refetch.
    // Short staleTime + background polling keeps it current without one.
    staleTime: STALE.REALTIME,
    refetchInterval: STALE.REALTIME,
  })
}

/**
 * [POST-R11 follow-up]: self-service loan status — a staff member who
 * submits a request via useRequestLoan() previously had no way to check
 * on it afterward.
 */
export function useMyLoans() {
  return useQuery({
    queryKey: queryKeys.hr.loans({ mine: true }),
    queryFn: () => apiFetch<ApiStaffLoan[]>('/hr/loans/mine'),
  })
}

export function useApproveLoan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (loanId: string) => apiFetch<ApiStaffLoan>(`/hr/loans/${loanId}/approve`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.hr.all() }),
  })
}

export function useDisburseLoan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (loanId: string) => apiFetch<ApiStaffLoan>(`/hr/loans/${loanId}/disburse`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.hr.all() }),
  })
}

export function useRecordLoanRepayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ loanId, amount }: { loanId: string; amount: number }) =>
      apiFetch<ApiStaffLoan>(`/hr/loans/${loanId}/repay`, {
        method: 'PATCH',
        body: JSON.stringify({ amount }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.hr.all() }),
  })
}

export function useContractAlerts(days = 60) {
  return useQuery({
    queryKey: queryKeys.hr.contractAlerts(days),
    queryFn: () => apiFetch(`/hr/alerts/contracts?days=${days}`),
  })
}

export function useAddPerformanceNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: PerformanceNoteInput) => apiFetch('/hr/performance', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.hr.all() }),
  })
}