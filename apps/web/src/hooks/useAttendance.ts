/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/hooks/useAttendance.ts
 * [R-PHASE]: R6 — Academics II: Classes, Assignments & the Attendance Rebuild
 * [PURPOSE]: TanStack Query hooks for the new Postgres-backed attendance
 *   routes, matching useStudents.ts's post-R1 convention exactly — imports
 *   apiFetch/queryKeys directly from @/lib/api-client, no local
 *   reimplementation. Replaces AttendanceSheet.tsx's direct Firestore
 *   onSnapshot/setDoc calls.
 * [DEPENDS ON]: apps/web/src/lib/api-client.ts,
 *   @shared/schemas/student (MarkAttendanceInput)
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { MarkAttendanceInput } from '@shared/schemas/student'
import type { ApiAttendanceRecord } from '@shared/types/api'
import { apiFetch, queryKeys } from '@/lib/api-client'

export function useClassAttendance(classId: string, date: string) {
  return useQuery({
    queryKey: queryKeys.attendance.class(classId, date),
    queryFn:  () => apiFetch<ApiAttendanceRecord[]>(`/attendance/class/${classId}?date=${date}`),
    enabled:  !!classId && !!date,
  })
}

export function useMarkAttendance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ classId, ...data }: { classId: string } & MarkAttendanceInput) =>
      apiFetch<{ message: string }>(`/attendance/class/${classId}`, {
        method: 'POST',
        body:   JSON.stringify(data),
      }),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: queryKeys.attendance.class(variables.classId, variables.date) })
    },
    onError: (err) => {
      console.error('[useMarkAttendance] Failed to save attendance:', err)
    },
  })
}

export function useStudentAttendance(studentId: string) {
  return useQuery({
    queryKey: queryKeys.attendance.student(studentId),
    queryFn:  () => apiFetch<ApiAttendanceRecord[]>(`/attendance/student/${studentId}`),
    enabled:  !!studentId,
  })
}
