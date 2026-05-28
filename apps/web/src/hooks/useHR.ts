'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAuth } from 'firebase/auth'
import type { CreateStaffInput, LeaveRequestInput, ReviewLeaveInput, LoanRequestInput, PerformanceNoteInput } from '@shared/schemas/hr'

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = await getAuth().currentUser?.getIdToken()
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  })
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `API error ${res.status}`)
  return res.json() as Promise<T>
}

export const hrKeys = {
  all:      () => ['hr'] as const,
  staff:    (f: object) => ['hr', 'staff', f] as const,
  profile:  (id: string) => ['hr', 'profile', id] as const,
  leave:    (f: object) => ['hr', 'leave', f] as const,
  contracts: () => ['hr', 'contracts'] as const,
}

export function useStaffDirectory(filters: { department?: string; status?: string; search?: string } = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
  return useQuery({
    queryKey: hrKeys.staff(filters),
    queryFn: () => apiFetch(`/hr?${params}`),
  })
}

export function useStaffProfile(id: string) {
  return useQuery({
    queryKey: hrKeys.profile(id),
    queryFn: () => apiFetch(`/hr/${id}`),
    enabled: !!id,
  })
}

export function useCreateStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateStaffInput) => apiFetch('/hr', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: hrKeys.all() }),
  })
}

export function useLeaveRequests(filters: { staffId?: string; status?: string } = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v) })
  return useQuery({
    queryKey: hrKeys.leave(filters),
    queryFn: () => apiFetch(`/hr/leave/requests?${params}`),
  })
}

export function useApplyForLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: LeaveRequestInput) => apiFetch('/hr/leave/apply', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: hrKeys.all() }),
  })
}

export function useReviewLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ReviewLeaveInput }) =>
      apiFetch(`/hr/leave/requests/${id}/review`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: hrKeys.all() }),
  })
}

export function useRequestLoan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: LoanRequestInput) => apiFetch('/hr/loans/request', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: hrKeys.all() }),
  })
}

export function useContractAlerts(days = 60) {
  return useQuery({
    queryKey: hrKeys.contracts(),
    queryFn: () => apiFetch(`/hr/alerts/contracts?days=${days}`),
  })
}

export function useAddPerformanceNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: PerformanceNoteInput) => apiFetch('/hr/performance', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: hrKeys.all() }),
  })
}