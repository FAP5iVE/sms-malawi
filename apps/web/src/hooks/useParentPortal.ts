/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/hooks/useParentPortal.ts
 * [PHASE]: Guardian Portal — parent UI (T7c)
 * [PURPOSE]: TanStack Query hooks and response types for the PARENT side (/parent/*). A child is
 *   always addressed by the guardian LINK id, never a student id, exactly as the API does.
 *
 *   A section the guardian was not granted comes back from the API as a plain 404, so callers
 *   pass `enabled` from the child's `capabilities` and never ask for what they cannot have.
 *   The response types mirror parentDto.ts (the only shapes a guardian ever receives).
 * [DEPENDS ON]: @/lib/api-client (apiFetch, queryKeys), @shared/constants/guardianPortal
 */
import { useQuery } from '@tanstack/react-query'
import type { GuardianCapability } from '@shared/constants/guardianPortal'
import { apiFetch, queryKeys, ApiError } from '@/lib/api-client'

export interface ParentChild {
  /** The guardian-link id: the only identifier a parent uses for a child. */
  id: string
  firstName: string | null
  lastName: string | null
  admissionNumber: string | null
  className: string | null
  enrolled: boolean
  relationship: string
  capabilities: GuardianCapability[]
}

export interface ParentResultsTerm {
  academicYear: string | null
  term: number | null
  /** true = held back; no marks are sent at all. */
  withheld: boolean
  average: number | null
  grade: string | null
  classPosition: number | null
  classSize: number | null
  passStatus: boolean | null
  attendanceDays: number | null
  absentDays: number | null
  subjects: Array<{ subject: string; average: number | null; grade: string | null; pass: boolean | null }>
  teacherComment: string | null
  headComment: string | null
}

export interface ParentInvoice {
  invoiceNumber: string | null
  academicYear: string | null
  term: number | null
  totalAmount: number | null
  paidAmount: number | null
  balance: number | null
  status: string | null
  dueDate: string | null
}

export interface ParentPayment { amount: number | null; method: string | null; paidAt: string | null }

export interface ParentFees {
  currency: 'MWK'
  totalOutstanding: number
  invoices: ParentInvoice[]
  payments: ParentPayment[]
}

export interface ParentAttendance {
  summary: { windowSize: number; byStatus: Record<string, number> }
  recent: Array<{ date: string | null; status: string | null }>
}

/** Do not retry a refusal: a 403/404 will not become a 200 by asking again. */
const retry = (count: number, err: unknown) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2

export function useParentMe() {
  return useQuery({
    queryKey: queryKeys.parent.me(),
    queryFn: () => apiFetch<{ displayName: string }>('/parent/me'),
    retry,
  })
}

export function useParentChildren() {
  return useQuery({
    queryKey: queryKeys.parent.children(),
    queryFn: () => apiFetch<{ children: ParentChild[] }>('/parent/children'),
    retry,
  })
}

const childPath = (linkId: string, section: string) => `/parent/children/${encodeURIComponent(linkId)}/${section}`

export function useChildResults(linkId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.parent.child(linkId, 'results'),
    queryFn: () => apiFetch<{ terms: ParentResultsTerm[] }>(childPath(linkId, 'results')),
    enabled, retry,
  })
}

export function useChildFees(linkId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.parent.child(linkId, 'fees'),
    queryFn: () => apiFetch<ParentFees>(childPath(linkId, 'fees')),
    enabled, retry,
  })
}

export function useChildAttendance(linkId: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.parent.child(linkId, 'attendance'),
    queryFn: () => apiFetch<ParentAttendance>(childPath(linkId, 'attendance')),
    enabled, retry,
  })
}
