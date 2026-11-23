/**
 * apps/web/src/hooks/useManebRegistration.ts
 *
 * [PURPOSE]: Client hooks for the school's MANEB candidate list (Exams → MANEB → Registered
 *   candidates). The board is every student who sits the exam this year (Form 2 for JCE, Form 4
 *   for MSCE) with their Registered or Not registered state. Candidates register with MANEB
 *   online themselves; this is the school's own record.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch, queryKeys } from '@/lib/api-client'

export type ManebExamTypeKey = 'JCE' | 'MSCE'

export interface ManebBoardRow {
  studentId: string
  registrationNo: string
  name: string
  className: string
  sex: string | null
  registered: boolean
  registrationId: string | null
  withdrawn: boolean
  withdrawnReason: string | null
  registeredVia: 'SELF' | 'SCHOOL' | null
  candidateNo: string | null
  centerNo: string | null
  invoiceNo: string | null
  feePaid: boolean
  subjects: string[]
  notes: string | null
  hasResult: boolean
}

export interface ManebBoard {
  academicYear: string
  examType: ManebExamTypeKey
  form: number
  locked: boolean
  lockedAt: string | null
  centreNumber: string
  deadline: string
  totals: { students: number; registered: number; notRegistered: number; withNumber: number; feePaid: number; withResults: number }
  rows: ManebBoardRow[]
}

export interface ManebRegistrationFields {
  registeredVia: 'SELF' | 'SCHOOL'
  candidateNo?: string
  centerNo?: string
  invoiceNo?: string
  feePaid: boolean
  subjects: string[]
  notes?: string
}

export function useManebBoard(academicYear: string, examType: ManebExamTypeKey, enabled = true) {
  return useQuery({
    queryKey: queryKeys.exams.manebBoard({ academicYear, examType }),
    queryFn: () => apiFetch<ManebBoard>(`/exams/maneb/registrations?academicYear=${encodeURIComponent(academicYear)}&examType=${examType}`),
    enabled: enabled && Boolean(academicYear),
  })
}

function useBoardMutation<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  meta: { successMessage?: string; failureTitle: string },
) {
  const qc = useQueryClient()
  return useMutation({
    meta,
    mutationFn: fn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exams', 'maneb-board'] }),
  })
}

const post = (path: string, body: unknown) => apiFetch(path, { method: 'POST', body: JSON.stringify(body) })

export function useRegisterManebCandidate() {
  return useBoardMutation(
    (v: { studentId: string; examType: ManebExamTypeKey; academicYear: string } & ManebRegistrationFields) => post('/exams/maneb/registrations', v),
    { successMessage: 'Candidate registered', failureTitle: 'Could not register the candidate' },
  )
}

export function useBulkRegisterManeb() {
  return useBoardMutation(
    (v: { studentIds: string[]; examType: ManebExamTypeKey; academicYear: string; registeredVia: 'SELF' | 'SCHOOL' }) =>
      post('/exams/maneb/registrations/bulk', v) as Promise<{ registered: number; skipped: Array<{ studentId: string; reason: string }> }>,
    { failureTitle: 'Could not register the candidates' },
  )
}

export function useUpdateManebRegistration() {
  return useBoardMutation(
    (v: { id: string; patch: Partial<ManebRegistrationFields> }) =>
      apiFetch(`/exams/maneb/registrations/${v.id}`, { method: 'PATCH', body: JSON.stringify(v.patch) }),
    { successMessage: 'Registration saved', failureTitle: 'Could not save the registration' },
  )
}

export function useWithdrawManeb() {
  return useBoardMutation(
    (v: { id: string; reason: string }) => post(`/exams/maneb/registrations/${v.id}/withdraw`, { reason: v.reason }),
    { successMessage: 'Candidate withdrawn', failureTitle: 'Could not withdraw the candidate' },
  )
}

export function useImportManebNumbers() {
  return useBoardMutation(
    (v: { academicYear: string; examType: ManebExamTypeKey; rows: Array<{ registrationNo: string; candidateNo: string }> }) =>
      post('/exams/maneb/registrations/numbers', v) as Promise<{ updated: number; errors: Array<{ registrationNo: string; error: string }> }>,
    { failureTitle: 'Could not import the examination numbers' },
  )
}

export function useManebListLock() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['exams', 'maneb-board'] })
  const close = useMutation({
    meta: { successMessage: 'List closed', failureTitle: 'Could not close the list' },
    mutationFn: (v: { academicYear: string; examType: ManebExamTypeKey }) => post('/exams/maneb/registrations/lock', v),
    onSuccess: invalidate,
  })
  const reopen = useMutation({
    meta: { successMessage: 'List reopened', failureTitle: 'Could not reopen the list' },
    mutationFn: (v: { academicYear: string; examType: ManebExamTypeKey }) => post('/exams/maneb/registrations/unlock', v),
    onSuccess: invalidate,
  })
  return { close, reopen }
}
