/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/hooks/useClasses.ts
 * [R-PHASE]: R1 — API Client & Query-Key Singleton Consolidation; further
 *   edited in R6 — Academics II: Classes, Assignments & the Attendance Rebuild
 * [PURPOSE]: R1 repointed these hooks at the canonical apiFetch/queryKeys
 *   singleton. R6 adds useUpdateClass() and useArchiveClass() — the backend
 *   routes (PATCH /classes/:id, DELETE /classes/:id) now exist but had no
 *   hook to call them, matching R5's useUpdateStudent() precedent exactly
 *   (onError included since this is new code — sms-erp-frontend Rule 4).
 *   Also adds useCreateAssignment() and useSubmitAssignment() — assignments
 *   are a class sub-resource, so their hooks live alongside useClasses'
 *   own rather than in a new single-purpose file for two mutations.
 *   useClasses() itself gains an optional includeArchived parameter so the
 *   classes list page's archived-classes toggle has real data to filter —
 *   listClasses()'s own new includeArchived parameter would otherwise be a
 *   backend capability with zero UI caller.
 * [DEPENDS ON]: W/lib/api-client.ts
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateClassInput, UpdateClassInput, CreateAssignmentInput, CreateTimetableSlotInput } from '@shared/schemas/student'
import type { ApiClass, ApiTimetableSlot, ApiAssignment, ApiSubjectAssignment } from '@shared/types/api'
import { apiFetch, queryKeys } from '@/lib/api-client'

export function useClasses(academicYear?: string, includeArchived?: boolean) {
  const params = new URLSearchParams()
  if (academicYear) params.set('academicYear', academicYear)
  if (includeArchived) params.set('includeArchived', 'true')
  const query = params.toString()

  return useQuery({
    queryKey: queryKeys.classes.list(academicYear ? { academicYear, includeArchived } : { includeArchived }),
    queryFn: () => apiFetch<ApiClass[]>(query ? `/classes?${query}` : '/classes'),
  })
}

export function useClass(id: string) {
  return useQuery({
    queryKey: queryKeys.classes.detail(id),
    queryFn: () => apiFetch<ApiClass>(`/classes/${id}`),
    enabled: !!id,
  })
}

export function useClassTimetable(classId: string, term: number) {
  return useQuery({
    queryKey: queryKeys.classes.timetable(classId, undefined, term),
    queryFn: () => apiFetch<ApiTimetableSlot[]>(`/classes/${classId}/timetable?term=${term}`),
    enabled: !!classId,
  })
}

// The signed-in teacher's own subject-teacher assignments for a year —
// backs subject/class scoping in the exam scheduling form (AC-4).
export function useMySubjectAssignments(academicYear?: string) {
  return useQuery({
    queryKey: queryKeys.classes.subjectAssignmentsMine(academicYear),
    queryFn: () =>
      apiFetch<ApiSubjectAssignment[]>(
        academicYear
          ? `/classes/subject-assignments/mine?academicYear=${encodeURIComponent(academicYear)}`
          : '/classes/subject-assignments/mine',
      ),
    enabled: !!academicYear,
  })
}

export function useCreateClass() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateClassInput) =>
      apiFetch<ApiClass>('/classes', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.classes.all() }),
  })
}

export function useUpdateClass() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateClassInput) =>
      apiFetch<ApiClass>(`/classes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.classes.detail(variables.id) })
      qc.invalidateQueries({ queryKey: queryKeys.classes.all() })
    },
    onError: (err) => {
      console.error('[useUpdateClass] Update failed:', err)
    },
  })
}

export function useArchiveClass() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<ApiClass>(`/classes/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: queryKeys.classes.detail(id) })
      qc.invalidateQueries({ queryKey: queryKeys.classes.all() })
    },
    onError: (err) => {
      console.error('[useArchiveClass] Archive failed:', err)
    },
  })
}

export function useCreateTimetableSlot() {
  const qc = useQueryClient()
  return useMutation({
    // POST /classes/:id/timetable — gated server-side to admin/high_rank/exam_officer.
    // classId travels in the URL; the body carries the rest of the slot.
    mutationFn: ({ classId, ...data }: { classId: string } & CreateTimetableSlotInput) =>
      apiFetch<ApiTimetableSlot>(`/classes/${classId}/timetable`, {
        method: 'POST',
        body:   JSON.stringify(data),
      }),
    onSuccess: (_data, variables) => {
      // useClassTimetable keys on (classId, undefined, term); a partial key
      // invalidates every term view for this class so the new slot shows up.
      qc.invalidateQueries({ queryKey: queryKeys.classes.timetable(variables.classId) })
      qc.invalidateQueries({ queryKey: queryKeys.classes.detail(variables.classId) })
    },
    onError: (err) => {
      console.error('[useCreateTimetableSlot] Failed to create timetable slot:', err)
    },
  })
}

export function useCreateAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ classId, ...data }: { classId: string } & CreateAssignmentInput) =>
      apiFetch<ApiAssignment>(`/classes/${classId}/assignments`, {
        method: 'POST',
        body:   JSON.stringify(data),
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.classes.detail(variables.classId) })
      qc.invalidateQueries({ queryKey: queryKeys.classes.assignments(variables.classId) })
    },
    onError: (err) => {
      console.error('[useCreateAssignment] Failed to create assignment:', err)
    },
  })
}

export function useSubmitAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ classId, assignmentId, file }: { classId: string; assignmentId: string; file: File }) => {
      const formData = new FormData()
      formData.append('file', file)
      return apiFetch<{ id: string }>(`/classes/${classId}/assignments/${assignmentId}/submit`, {
        method: 'POST',
        body:   formData,
      })
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.classes.detail(variables.classId) })
      qc.invalidateQueries({ queryKey: queryKeys.classes.assignments(variables.classId) })
    },
    onError: (err) => {
      console.error('[useSubmitAssignment] Submission failed:', err)
    },
  })
}