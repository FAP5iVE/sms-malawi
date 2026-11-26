/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/hooks/useStudents.ts
 * [R-PHASE]: R1 — API Client & Query-Key Singleton Consolidation; further
 *   edited in R5 — Academics I: Admissions & Student Records; and R9 —
 *   Finance I: Invoicing, Fees & the Accounting Ledger Reconnection
 * [PURPOSE]: Student CRUD/photo hooks — repointed at the canonical apiFetch/queryKeys singleton (also fixes a missing `/api` prefix bug in the deleted local apiFetch).
 *   R5 adds useUpdateStudent() — the backend endpoint (PATCH /students/:id)
 *   and studentService.update() were already fully implemented and
 *   audit-logged; only this hook was missing, which is why StudentForm.tsx
 *   could never actually update an existing record. Matches
 *   useCreateStudent()'s shape, with onError added (a required, not
 *   optional, half of a correctly-written mutation per sms-erp-frontend
 *   Rule 4) since this is new code.
 *   R9 adds a `search` filter to useStudents() — the underlying
 *   GET /students route already supported it (students.ts's own `search`
 *   query-param handling), but no hook exposed it. ScholarshipTab.tsx's
 *   new student picker is the first consumer.
 *   R15 — UI/UX Polish adds (a) sortBy/sortDir filters to useStudents(),
 *   the query-side half of DataTable's new onSort server-side sort
 *   dispatch (students.ts + studentService.ts allow-list the column, same
 *   phase); and (b) useStudentMe() — the student-role self-lookup over the
 *   long-existing GET /students/me route, which until now had no client
 *   hook at all. StudentDashboard uses it to resolve the real Student.id
 *   from the signed-in Firebase UID (the same UID-vs-Prisma-id resolution
 *   R7/R8 established server-side) instead of passing user.uid where a
 *   Student.id is expected.
 * [DEPENDS ON]: W/lib/api-client.ts
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  CreateStudentInput,
  UpdateStudentInput,
  GuardianInput,
  UpdateGuardianInput,
  UpdateWelfareInput,
  SupportNeedInput,
  UpdateSupportNeedInput,
  StudentExitInput,
} from '@shared/schemas/student'
import type {
  ApiStudent,
  ApiStudentListResponse,
  ApiHighRiskStudentsResponse,
  ApiStudentGuardian,
  ApiStudentWelfare,
  ApiSupportNeed,
  ApiWelfareSummary,
} from '@shared/types/api'
import type { ApiStudentDetail } from '@/server/services/studentService'
import { apiFetch, queryKeys } from '@/lib/api-client'
import { useAuthStore } from '@/store/authStore'
import { useViewingPeriod } from '@/hooks/useViewingPeriod'

/** `?academicYear=&term=` for the global viewing period (risk is assessed for it). */
function periodParams(academicYear?: string, term?: number): URLSearchParams {
  const p = new URLSearchParams()
  if (academicYear) p.set('academicYear', academicYear)
  if (term) p.set('term', String(term))
  return p
}

export function useStudents(
  filters: {
    status?:  string
    classId?: string
    // [PRODUCTION FIX 2026-07-27] Both already existed and worked server-side
    // (GET /students, studentService.list) — this hook just never passed
    // them through, so the UI had no way to use them.
    sex?:     'MALE' | 'FEMALE'
    form?:    number
    page?:    number
    search?:  string
    sortBy?:  string
    sortDir?: 'asc' | 'desc'
  } = {}
) {
  // Risk badges are assessed for the GLOBAL viewing period, so the list
  // refetches when the person switches term/year in the header.
  const { academicYear, term } = useViewingPeriod()
  const params = periodParams(academicYear, term)
  if (filters.status) params.set('status', filters.status)
  if (filters.classId) params.set('classId', filters.classId)
  if (filters.sex) params.set('sex', filters.sex)
  if (filters.form) params.set('form', String(filters.form))
  if (filters.page) params.set('page', String(filters.page))
  if (filters.search) params.set('search', filters.search)
  if (filters.sortBy && filters.sortDir) {
    params.set('sortBy', filters.sortBy)
    params.set('sortDir', filters.sortDir)
  }
  return useQuery({
    queryKey: queryKeys.students.list({ ...filters, academicYear, term }),
    queryFn: () => apiFetch<ApiStudentListResponse>(`/students?${params}`),
    enabled: filters.search === undefined || filters.search.length >= 2,
  })
}

/**
 * Student-role self-lookup (R15). GET /students/me resolves the signed-in
 * Firebase UID to the real Student row server-side (Student.firebaseUid →
 * Student.id) and returns the full detail shape — class name/form, fee
 * balance, current borrowings, risk level. Only enabled for the student
 * role; every other role reads students through useStudents()/useStudent().
 */
export function useStudentMe() {
  const { role } = useAuthStore()
  const { academicYear, term } = useViewingPeriod()
  return useQuery({
    queryKey: queryKeys.students.me({ academicYear, term }),
    queryFn:  () => apiFetch<ApiStudentDetail>(`/students/me?${periodParams(academicYear, term)}`),
    enabled:  role === 'student',
  })
}

/**
 * [PRODUCTION FIX] Real HIGH-risk active students for the "Students
 * Needing Attention" dashboard widget — see riskService.
 * getHighRiskStudents()'s header comment for why filtering GET /students'
 * riskLevel client-side could never surface anyone (that route's
 * riskLevel is computed by a 2-factor heuristic whose HIGH branch is
 * unreachable without a term average).
 */
export function useHighRiskStudents(limit = 6) {
  const { academicYear, term } = useViewingPeriod()
  return useQuery({
    queryKey: queryKeys.students.atRisk(limit, { academicYear, term }),
    queryFn: () => {
      const params = periodParams(academicYear, term)
      params.set('limit', String(limit))
      return apiFetch<ApiHighRiskStudentsResponse>(`/students/at-risk?${params}`)
    },
  })
}

export function useStudent(id: string) {
  const { academicYear, term } = useViewingPeriod()
  return useQuery({
    queryKey: queryKeys.students.detail(id, { academicYear, term }),
    queryFn: () => apiFetch<ApiStudent>(`/students/${id}?${periodParams(academicYear, term)}`),
    enabled: !!id,
  })
}

export function useCreateStudent() {
  const qc = useQueryClient()
  return useMutation({
    meta: { successMessage: 'Student created', failureTitle: 'Could not create student' },
    mutationFn: (data: CreateStudentInput) =>
      apiFetch<ApiStudent & { tempPassword?: string }>('/students', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.students.all() }),
  })
}

export function useUpdateStudent() {
  const qc = useQueryClient()
  return useMutation({
    meta: { successMessage: 'Student updated', failureTitle: 'Could not update student' },
    mutationFn: ({ id, ...data }: { id: string } & UpdateStudentInput) =>
      apiFetch<ApiStudent>(`/students/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.students.detail(variables.id) })
      qc.invalidateQueries({ queryKey: queryKeys.students.lists() })
    },
    onError: (err) => {
      console.error('[useUpdateStudent] Update failed:', err)
    },
  })
}

export function useArchiveStudent() {
  const qc = useQueryClient()
  return useMutation({
    meta: { successMessage: 'Student archived', failureTitle: 'Could not archive student' },
    // The reason for leaving and the exit date are required by the server.
    mutationFn: ({ id, ...exit }: { id: string } & StudentExitInput) =>
      apiFetch<{ archived: boolean }>(`/students/${id}`, { method: 'DELETE', body: JSON.stringify(exit) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.students.all() }),
  })
}

// Fetches the signed view URL for a student's profile photo
// The proxy URL itself never expires; refetch every 50 minutes anyway
export function useStudentPhotoUrl(studentId: string, hasPhoto: boolean) {
  return useQuery({
    queryKey: queryKeys.students.photo(studentId),
    queryFn: () => apiFetch<{ url: string }>(`/students/${studentId}/photo`),
    enabled: !!studentId && hasPhoto,
    staleTime: 50 * 60 * 1000, // 50 minutes
    gcTime: 60 * 60 * 1000, // 60 minutes
  })
}

// ─── GUARDIANS ───────────────────────────────────────────────────────────────
// The primary guardian is mirrored onto the legacy Student columns server-side,
// so the student detail is invalidated alongside the guardian list.

const guardiansKey = (studentId: string) => ['student-guardians', studentId] as const

export function useStudentGuardians(studentId: string, enabled = true) {
  return useQuery({
    queryKey: guardiansKey(studentId),
    queryFn: () => apiFetch<ApiStudentGuardian[]>(`/students/${studentId}/guardians`),
    enabled: !!studentId && enabled,
  })
}

function useGuardianInvalidation(studentId: string) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: guardiansKey(studentId) })
    qc.invalidateQueries({ queryKey: queryKeys.students.detail(studentId) })
  }
}

export function useAddGuardian(studentId: string) {
  const invalidate = useGuardianInvalidation(studentId)
  return useMutation({
    meta: { successMessage: 'Guardian added', failureTitle: 'Could not add guardian' },
    mutationFn: (data: GuardianInput) =>
      apiFetch<ApiStudentGuardian>(`/students/${studentId}/guardians`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: invalidate,
  })
}

export function useUpdateGuardian(studentId: string) {
  const invalidate = useGuardianInvalidation(studentId)
  return useMutation({
    meta: { successMessage: 'Guardian updated', failureTitle: 'Could not update guardian' },
    mutationFn: ({ guardianId, ...data }: { guardianId: string } & UpdateGuardianInput) =>
      apiFetch<ApiStudentGuardian>(`/students/${studentId}/guardians/${guardianId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: invalidate,
  })
}

export function useDeleteGuardian(studentId: string) {
  const invalidate = useGuardianInvalidation(studentId)
  return useMutation({
    meta: { successMessage: 'Guardian removed', failureTitle: 'Could not remove guardian' },
    mutationFn: (guardianId: string) =>
      apiFetch<{ ok: true }>(`/students/${studentId}/guardians/${guardianId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

// ─── WELFARE (sensitive: student.viewWelfare / student.editWelfare) ──────────
// `enabled` must be passed as can('student.viewWelfare') by the caller so a role
// without the permission never even issues the request (the server refuses it
// regardless). The welfare data is never part of the student detail query.

const welfareKey = (studentId: string) => ['student-welfare', studentId] as const

export function useStudentWelfare(studentId: string, enabled: boolean) {
  return useQuery({
    queryKey: welfareKey(studentId),
    queryFn: () => apiFetch<ApiStudentWelfare>(`/students/${studentId}/welfare`),
    enabled: !!studentId && enabled,
  })
}

export function useWelfareSummary(enabled: boolean) {
  return useQuery({
    queryKey: ['student-welfare-summary'] as const,
    queryFn: () => apiFetch<ApiWelfareSummary>('/students/welfare-summary'),
    enabled,
  })
}

function useWelfareInvalidation(studentId: string) {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: welfareKey(studentId) })
    qc.invalidateQueries({ queryKey: ['student-welfare-summary'] })
  }
}

export function useUpdateWelfare(studentId: string) {
  const invalidate = useWelfareInvalidation(studentId)
  return useMutation({
    meta: { successMessage: 'Welfare details saved', failureTitle: 'Could not save welfare details' },
    mutationFn: (data: UpdateWelfareInput) =>
      apiFetch<ApiStudentWelfare>(`/students/${studentId}/welfare`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: invalidate,
  })
}

export function useAddSupportNeed(studentId: string) {
  const invalidate = useWelfareInvalidation(studentId)
  return useMutation({
    meta: { successMessage: 'Special need added', failureTitle: 'Could not add special need' },
    mutationFn: (data: SupportNeedInput) =>
      apiFetch<ApiSupportNeed>(`/students/${studentId}/support-needs`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: invalidate,
  })
}

export function useUpdateSupportNeed(studentId: string) {
  const invalidate = useWelfareInvalidation(studentId)
  return useMutation({
    meta: { successMessage: 'Special need updated', failureTitle: 'Could not update special need' },
    mutationFn: ({ needId, ...data }: { needId: string } & UpdateSupportNeedInput) =>
      apiFetch<ApiSupportNeed>(`/students/${studentId}/support-needs/${needId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: invalidate,
  })
}

export function useDeleteSupportNeed(studentId: string) {
  const invalidate = useWelfareInvalidation(studentId)
  return useMutation({
    meta: { successMessage: 'Special need removed', failureTitle: 'Could not remove special need' },
    mutationFn: (needId: string) =>
      apiFetch<{ ok: true }>(`/students/${studentId}/support-needs/${needId}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}
