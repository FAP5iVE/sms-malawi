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
 * [MAINT 2026-09-16 — Class Subject Presets]: Added useClassSubjects() and
 *   useSetClassSubjectPresets() — GET/PUT /classes/:id/subjects' client
 *   hooks (classService.getClassSubjectsMeta/setClassSubjectPresets).
 * [MAINT 2026-10-28 — Assignment workflow, merged & hardened]: assignment hooks
 *   cover the whole loop - detail, recording that a student opened it (a separate
 *   POST, once per dialog open), class roster, edit, delete, per-student recording,
 *   hand-in (file and/or note) and opening files through authorised endpoints.
 *   Detail and roster keys sit under queryKeys.classes.assignments(classId), so
 *   one invalidation of that prefix refreshes list, detail and roster together.
 * [DEPENDS ON]: W/lib/api-client.ts
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  CreateClassInput, UpdateClassInput, CreateAssignmentInput, UpdateAssignmentInput,
  MarkSubmissionInput, CreateTimetableSlotInput,
} from '@shared/schemas/student'
import type {
  ApiClass, ApiTimetableSlot, ApiAssignment, ApiAssignmentDetail, ApiAssignmentRoster,
  ApiAssignmentRosterRow, ApiSubjectAssignment, ApiClassSubjectsMeta,
} from '@shared/types/api'
import { apiFetch, queryKeys } from '@/lib/api-client'
import { uploadFileDirectly } from '@/lib/directUpload'
import { downloadProtectedFile } from '@/lib/pdfPreview'
import { useViewingPeriod } from '@/hooks/useViewingPeriod'

export function useClasses(academicYear?: string, includeArchived?: boolean, enabled = true) {
  const params = new URLSearchParams()
  if (academicYear) params.set('academicYear', academicYear)
  if (includeArchived) params.set('includeArchived', 'true')
  const query = params.toString()

  return useQuery({
    queryKey: queryKeys.classes.list(academicYear ? { academicYear, includeArchived } : { includeArchived }),
    queryFn: () => apiFetch<ApiClass[]>(query ? `/classes?${query}` : '/classes'),
    enabled,
  })
}

export function useClass(id: string) {
  // The roster's risk dots are assessed for the global viewing period.
  const { academicYear, term } = useViewingPeriod()
  return useQuery({
    queryKey: queryKeys.classes.detail(id, { academicYear, term }),
    queryFn: () => {
      const p = new URLSearchParams()
      if (academicYear) p.set('academicYear', academicYear)
      if (term) p.set('term', String(term))
      return apiFetch<ApiClass>(`/classes/${id}?${p}`)
    },
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

/**
 * [PRODUCTION FIX] The signed-in user's own schedule for today — backs
 * the "Today's Timetable" widget on both the teacher (Academic) and
 * Student dashboards, previously a permanent PlaceholderWidget on each.
 * Self-scoped server-side (by teacherUid for staff, by classId for a
 * student) — see the GET /classes/my-timetable/today route for details.
 */
export function useMyTimetableToday() {
  return useQuery({
    queryKey: queryKeys.classes.myTimetableToday(),
    queryFn: () => apiFetch<ApiTimetableSlot[]>('/classes/my-timetable/today'),
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

// The class's preset subjects + derived 5-day lock state (classService.
// getClassSubjectsMeta). Backs the Class form's subjects section and the
// subject-restriction logic in TimetableSlotForm/ExamForm.
export function useClassSubjects(classId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.classes.subjects(classId ?? ''),
    queryFn: () => apiFetch<ApiClassSubjectsMeta>(`/classes/${classId}/subjects`),
    enabled: !!classId,
  })
}

export function useSetClassSubjectPresets() {
  const qc = useQueryClient()
  return useMutation({
    meta: { successMessage: 'Class subject presets updated', failureTitle: 'Could not set class subject presets' },
    mutationFn: ({ classId, subjects }: { classId: string; subjects: string[] }) =>
      apiFetch<ApiClassSubjectsMeta>(`/classes/${classId}/subjects`, {
        method: 'PUT',
        body:   JSON.stringify({ subjects }),
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.classes.subjects(variables.classId) })
      qc.invalidateQueries({ queryKey: queryKeys.classes.detail(variables.classId) })
    },
    onError: (err) => {
      console.error('[useSetClassSubjectPresets] Failed to save class subjects:', err)
    },
  })
}

export function useCreateClass() {
  const qc = useQueryClient()
  return useMutation({
    meta: { successMessage: 'Class created', failureTitle: 'Could not create class' },
    mutationFn: (data: CreateClassInput) =>
      apiFetch<ApiClass>('/classes', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.classes.all() }),
  })
}

export function useUpdateClass() {
  const qc = useQueryClient()
  return useMutation({
    meta: { successMessage: 'Class updated', failureTitle: 'Could not update class' },
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
    meta: { successMessage: 'Class archived', failureTitle: 'Could not archive class' },
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
    meta: { successMessage: 'Timetable slot created', failureTitle: 'Could not create timetable slot' },
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

// Assignments the signed-in user may see for this class. Scoped on the server
// (assignmentService.scopeForViewer): students and subject teachers get only
// their subject(s); the class teacher gets the whole class. Replaces reading
// them off the class detail payload, which leaked everyone's assignments.
export function useClassAssignments(classId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.classes.assignments(classId ?? ''),
    queryFn:  () => apiFetch<ApiAssignment[]>(`/classes/${classId}/assignments`),
    enabled:  !!classId,
    retry:    false,
  })
}

// One assignment in full. A pure read (the server records a student's view via
// useRecordAssignmentView), so refetching it can never change any data.
export function useAssignmentDetail(classId: string, assignmentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.classes.assignmentDetail(classId, assignmentId ?? ''),
    queryFn:  () => apiFetch<ApiAssignmentDetail>(`/classes/${classId}/assignments/${assignmentId}`),
    enabled:  !!classId && !!assignmentId,
    retry:    false, // a 403/404 (deleted, or not yours) is an answer, not a glitch
    refetchOnWindowFocus: false,
  })
}

// "This student opened it." Fire once per dialog open (the server also debounces
// within a 30-minute visit, so retries / double renders cannot inflate the count).
export function useRecordAssignmentView() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ classId, assignmentId }: { classId: string; assignmentId: string }) =>
      apiFetch<{ viewedAt: string }>(`/classes/${classId}/assignments/${assignmentId}/view`, { method: 'POST' }),
    // Silent: a failed view ping must never disturb reading (QueryProvider's
    // opt-out for the global error toast is `feedback: 'manual'`).
    meta: { feedback: 'manual' },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: queryKeys.classes.assignments(v.classId), refetchType: 'none' })
      // Only the list needs the new "opened" flag; patch it in place instead of refetching.
      qc.setQueryData<ApiAssignment[]>(queryKeys.classes.assignments(v.classId), (old) =>
        old?.map((a) => (a.id === v.assignmentId && !a.viewedAt ? { ...a, viewedAt: new Date().toISOString() } : a)))
    },
  })
}

// Class list (teacher view): opened / submitted / late / not submitted, per student.
export function useAssignmentRoster(classId: string, assignmentId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.classes.assignmentRoster(classId, assignmentId ?? ''),
    queryFn:  () => apiFetch<ApiAssignmentRoster>(`/classes/${classId}/assignments/${assignmentId}/roster`),
    enabled:  enabled && !!classId && !!assignmentId,
    retry:    false,
    refetchInterval: 60_000,
  })
}

// ── Subject -> teacher assignment for one class (per academic year) ─────────
export function useClassSubjectAssignments(classId: string | undefined, academicYear: string | undefined) {
  return useQuery({
    queryKey: queryKeys.classes.subjectAssignments(classId ?? '', academicYear),
    queryFn:  () => apiFetch<ApiSubjectAssignment[]>(
      `/classes/${classId}/subject-assignments?academicYear=${encodeURIComponent(academicYear ?? '')}`,
    ),
    enabled:  !!classId && !!academicYear,
  })
}

function useInvalidateSubjectTeachers() {
  const qc = useQueryClient()
  // Everything that depends on "who teaches what": the panel, a teacher's own
  // list (exam form, marks), and the assignment lists.
  return () => qc.invalidateQueries({ queryKey: queryKeys.classes.all() })
}

export function useAssignSubjectTeacher() {
  const invalidate = useInvalidateSubjectTeachers()
  return useMutation({
    meta: { successMessage: 'Subject teacher assigned', failureTitle: 'Could not assign subject teacher' },
    mutationFn: (data: { classId: string; subject: string; teacherUid: string; academicYear: string }) =>
      apiFetch<ApiSubjectAssignment>('/classes/subject-assignments', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: invalidate,
  })
}

export function useChangeSubjectTeacher() {
  const invalidate = useInvalidateSubjectTeachers()
  return useMutation({
    meta: { successMessage: 'Subject teacher changed', failureTitle: 'Could not change the subject teacher' },
    mutationFn: ({ id, teacherUid }: { id: string; teacherUid: string }) =>
      apiFetch<ApiSubjectAssignment>(`/classes/subject-assignments/${id}`, { method: 'PATCH', body: JSON.stringify({ teacherUid }) }),
    onSuccess: invalidate,
  })
}

export function useRemoveSubjectTeacher() {
  const invalidate = useInvalidateSubjectTeachers()
  return useMutation({
    meta: { successMessage: 'Subject teacher removed', failureTitle: 'Could not remove subject teacher' },
    mutationFn: (id: string) => apiFetch<{ success: boolean }>(`/classes/subject-assignments/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  })
}

// One-time import of (class, subject, teacher) triples already in the timetable.
export function useBackfillSubjectAssignments() {
  const invalidate = useInvalidateSubjectTeachers()
  return useMutation({
    meta: { successMessage: 'Subject assignments backfilled', failureTitle: 'Could not backfill the assignments' },
    mutationFn: (academicYear: string) =>
      apiFetch<{ created: number }>('/classes/subject-assignments/backfill', { method: 'POST', body: JSON.stringify({ academicYear }) }),
    onSuccess: invalidate,
  })
}

export function useCreateAssignment() {
  const qc = useQueryClient()
  return useMutation({
    meta: { successMessage: 'Assignment created', failureTitle: 'Could not create assignment' },
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

export function useUpdateAssignment() {
  const qc = useQueryClient()
  return useMutation({
    meta: { successMessage: 'Assignment updated', failureTitle: 'Could not update assignment' },
    mutationFn: ({ classId, assignmentId, ...data }: { classId: string; assignmentId: string } & UpdateAssignmentInput) =>
      apiFetch<ApiAssignment>(`/classes/${classId}/assignments/${assignmentId}`, {
        method: 'PATCH',
        body:   JSON.stringify(data),
      }),
    onSuccess: (_data, v) => {
      qc.invalidateQueries({ queryKey: queryKeys.classes.assignments(v.classId) })
    },
    onError: (err) => {
      console.error('[useUpdateAssignment] Failed to update assignment:', err)
    },
  })
}

export function useDeleteAssignment() {
  const qc = useQueryClient()
  return useMutation({
    meta: { successMessage: 'Assignment deleted', failureTitle: 'Could not delete assignment' },
    mutationFn: ({ classId, assignmentId }: { classId: string; assignmentId: string }) =>
      apiFetch<{ success: boolean }>(`/classes/${classId}/assignments/${assignmentId}`, { method: 'DELETE' }),
    onSuccess: (_data, v) => {
      qc.invalidateQueries({ queryKey: queryKeys.classes.assignments(v.classId) })
      qc.invalidateQueries({ queryKey: queryKeys.classes.detail(v.classId) })
    },
    onError: (err) => {
      console.error('[useDeleteAssignment] Failed to delete assignment:', err)
    },
  })
}

// Teacher records ONE student: Submitted / Late submission / Not submitted (+ the
// required submitted-on date, optional session marks and comment). The server
// checks the status against the date with the shared lateness rule.
export function useMarkAssignmentStudent() {
  const qc = useQueryClient()
  return useMutation({
    meta: { successMessage: 'Student record saved', failureTitle: 'Could not save this student' },
    mutationFn: ({ classId, assignmentId, studentId, ...data }: { classId: string; assignmentId: string; studentId: string } & MarkSubmissionInput) =>
      apiFetch<ApiAssignmentRosterRow>(`/classes/${classId}/assignments/${assignmentId}/submissions/${studentId}`, {
        method: 'PUT',
        body:   JSON.stringify(data),
      }),
    onSuccess: (_data, v) => {
      qc.invalidateQueries({ queryKey: queryKeys.classes.assignments(v.classId) })
    },
    onError: (err) => {
      console.error('[useMarkAssignmentStudent] Failed to save student:', err)
    },
  })
}

export function useSubmitAssignment() {
  const qc = useQueryClient()
  return useMutation({
    meta: { successMessage: 'Assignment submitted', failureTitle: 'Could not submit assignment' },
    mutationFn: async ({ classId, assignmentId, file, note }: { classId: string; assignmentId: string; file?: File | null; note?: string }) => {
      // [PRODUCTION FIX] Was FormData → POST .../submit (multer, 25MB
      // limit) — going through this app's own Vercel function for the raw
      // file bytes, hitting the same two hard limits as every other
      // upload in this codebase (Vercel's 4.5MB request-body cap, and no
      // retry on a dropped connection mid-upload). The file now goes
      // straight to Appwrite; this call only sends the resulting fileId.
      const fileId = file
        ? await uploadFileDirectly(`/classes/${classId}/assignments/${assignmentId}/submit/upload-ticket`, file)
        : undefined
      return apiFetch<{ id: string }>(`/classes/${classId}/assignments/${assignmentId}/submit`, {
        method: 'POST',
        // Name/type/size are read from the stored object by the server; only the id is sent.
        body:   JSON.stringify({ fileId, note: note?.trim() || undefined }),
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


/**
 * Opens one student's hand-in through the AUTHORISED endpoint (the storage id is
 * never in list payloads): the server checks "student is self / teacher has the
 * class", returns the proxy URL, and the proxy checks again before streaming.
 * Throws ApiError (403/404) for the caller to surface.
 */
export async function openAssignmentSubmissionFile(
  classId: string, assignmentId: string, studentId: string, fileName: string,
): Promise<void> {
  const { url } = await apiFetch<{ url: string }>(`/classes/${classId}/assignments/${assignmentId}/submissions/${studentId}/file`)
  await downloadProtectedFile(url, fileName)
}

/** Downloads a teacher attachment (private; the proxy authorises class membership). */
export async function downloadAssignmentAttachment(url: string, fileName: string): Promise<void> {
  await downloadProtectedFile(url, fileName)
}
