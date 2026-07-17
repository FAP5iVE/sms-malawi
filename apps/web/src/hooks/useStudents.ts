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
import type { CreateStudentInput, UpdateStudentInput } from '@shared/schemas/student'
import type { ApiStudent, ApiStudentListResponse } from '@shared/types/api'
import type { ApiStudentDetail } from '@/server/services/studentService'
import { apiFetch, queryKeys } from '@/lib/api-client'
import { useAuthStore } from '@/store/authStore'

export function useStudents(
  filters: {
    status?:  string
    classId?: string
    page?:    number
    search?:  string
    sortBy?:  string
    sortDir?: 'asc' | 'desc'
  } = {}
) {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.classId) params.set('classId', filters.classId)
  if (filters.page) params.set('page', String(filters.page))
  if (filters.search) params.set('search', filters.search)
  if (filters.sortBy && filters.sortDir) {
    params.set('sortBy', filters.sortBy)
    params.set('sortDir', filters.sortDir)
  }
  return useQuery({
    queryKey: queryKeys.students.list(filters),
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
  return useQuery({
    queryKey: queryKeys.students.me(),
    queryFn:  () => apiFetch<ApiStudentDetail>('/students/me'),
    enabled:  role === 'student',
  })
}

export function useStudent(id: string) {
  return useQuery({
    queryKey: queryKeys.students.detail(id),
    queryFn: () => apiFetch<ApiStudent>(`/students/${id}`),
    enabled: !!id,
  })
}

export function useCreateStudent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateStudentInput) =>
      apiFetch<ApiStudent>('/students', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.students.all() }),
  })
}

export function useUpdateStudent() {
  const qc = useQueryClient()
  return useMutation({
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
    mutationFn: (id: string) =>
      apiFetch<{ archived: boolean }>(`/students/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.students.all() }),
  })
}

// Fetches the signed view URL for a student's profile photo
// URL is valid until Appwrite revokes it — refetch every 50 minutes
export function useStudentPhotoUrl(studentId: string, hasPhoto: boolean) {
  return useQuery({
    queryKey: queryKeys.students.photo(studentId),
    queryFn: () => apiFetch<{ url: string }>(`/students/${studentId}/photo`),
    enabled: !!studentId && hasPhoto,
    staleTime: 50 * 60 * 1000, // 50 minutes
    gcTime: 60 * 60 * 1000, // 60 minutes
  })
}
