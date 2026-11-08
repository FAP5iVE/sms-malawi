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
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { GuardianCapability } from '@shared/constants/guardianPortal'
import type { ReportCardData } from '@/components/shared/PrintableReportCard'
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

export interface ParentExam {
  id: string
  title: string
  subject: string
  type: string
  academicYear: string | null
  term: number | null
  date: string | null
  maxMark: number | null
  /** null when the child was absent or no mark was recorded. */
  mark: number | null
  percent: number | null
  absent: boolean
}

export interface ParentResultsTerm {
  academicYear: string | null
  term: number | null
  /** true = held back for unpaid fees; no marks and no exams are sent at all. */
  withheld: boolean
  /** false for a term that has released exams but no computed term result yet. */
  hasSummary: boolean
  average: number | null
  grade: string | null
  gradingTrack: 'JCE' | 'MSCE' | null
  aggregatePoints: number | null
  aggregateSubjects: string[]
  classPosition: number | null
  classSize: number | null
  passStatus: boolean | null
  attendanceDays: number | null
  absentDays: number | null
  subjects: Array<{ subject: string; average: number | null; grade: string | null; pass: boolean | null }>
  teacherComment: string | null
  headComment: string | null
  exams: ParentExam[]
  /** true when this term's report card can be opened. */
  reportCard: boolean
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
  /** The term the summary describes (the school's current term unless one was asked for). */
  period: { academicYear: string; term: number }
  /** The same figures the student's own attendance page shows for that term. */
  summary: { present: number; late: number; absent: number; recorded: number; attendanceRate: number | null }
  /** Day records, newest first (about two school years), for the calendar. */
  records: Array<{ date: string | null; status: string | null }>
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

export function useChildAttendance(linkId: string, enabled: boolean, period?: { academicYear: string; term: number }) {
  const qs = period ? `?academicYear=${encodeURIComponent(period.academicYear)}&term=${period.term}` : ''
  return useQuery({
    queryKey: queryKeys.parent.child(linkId, 'attendance', period ? `${period.academicYear}|${period.term}` : ''),
    queryFn: () => apiFetch<ParentAttendance>(`${childPath(linkId, 'attendance')}${qs}`),
    enabled, retry,
    // Switching term keeps the calendar on screen instead of flashing a loading state.
    placeholderData: keepPreviousData,
  })
}

/** The school's official report card for one term, the same payload the student's own screen prints. */
export function useChildReportCard(linkId: string, academicYear: string, term: number, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.parent.child(linkId, 'reportCard', `${academicYear}|${term}`),
    queryFn: () => apiFetch<ReportCardData>(`${childPath(linkId, 'report-card')}?academicYear=${encodeURIComponent(academicYear)}&term=${term}`),
    enabled: enabled && Boolean(academicYear) && term >= 1 && term <= 3,
    retry: false,                                        // a refusal (fees, release) will not change by asking again
  })
}
