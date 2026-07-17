/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/hooks/usePlacements.ts
 * [R-PHASE]: R18 — University Placement Module (Phase 11 Blueprint)
 * [PURPOSE]: TanStack Query hooks for the placement domain, all pointed at the
 *   canonical apiFetch/queryKeys singleton. Every mutation carries both an
 *   onSuccess (invalidating the relevant queries) and an onError handler, per
 *   the frontend Rule 4 missing-onError defect this project tracks.
 * [DEPENDS ON]: W/lib/api-client.ts, @shared/types/api, @shared/schemas/placement
 */
'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch, queryKeys } from '@/lib/api-client'
import type {
  ApiPlacementResponse,
  ApiUniversityPlacement,
  ApiPlacementEligibleStudent,
  ApiPlacementAnalytics,
  ApiPlacementBatchResult,
} from '@shared/types/api'
import type { University } from '@shared/constants/universities'
import type { SetChoicesInput, RecordOutcomeInput, VerifyOutcomeInput } from '@shared/schemas/placement'

// ── Reads ────────────────────────────────────────────────

/** The signed-in student's own placement + fresh recommendations. */
export function useMyPlacement() {
  return useQuery({
    queryKey: queryKeys.placements.me(),
    queryFn:  () => apiFetch<ApiPlacementResponse>('/placements/me'),
  })
}

/** A specific student's placement + recommendations (staff view). */
export function useStudentPlacement(studentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.placements.student(studentId ?? ''),
    queryFn:  () => apiFetch<ApiPlacementResponse>(`/placements/${studentId}`),
    enabled:  !!studentId,
  })
}

/** The whole placement cohort, optionally filtered by status. */
export function usePlacementCohort(status?: string) {
  return useQuery({
    queryKey: queryKeys.placements.cohort(status),
    queryFn:  () => apiFetch<ApiUniversityPlacement[]>(status ? `/placements/cohort?status=${status}` : '/placements/cohort'),
  })
}

/** The university/programme catalogue, for pickers. */
export function usePlacementCatalogue() {
  return useQuery({
    queryKey: queryKeys.placements.catalogue(),
    queryFn:  () => apiFetch<University[]>('/placements/catalogue'),
    staleTime: 1000 * 60 * 60, // catalogue is a static constants file
  })
}

/** Form 4 / certified-MSCE students eligible to be placed for a year. */
export function usePlacementEligible(academicYear: string | undefined) {
  return useQuery({
    queryKey: queryKeys.placements.eligible(academicYear ?? ''),
    queryFn:  () => apiFetch<ApiPlacementEligibleStudent[]>(`/placements/eligible?academicYear=${academicYear}`),
    enabled:  !!academicYear,
  })
}

/** Cohort placement analytics for a year (defaults to current on server). */
export function usePlacementAnalytics(academicYear?: string) {
  return useQuery({
    queryKey: queryKeys.placements.analytics(academicYear),
    queryFn:  () =>
      apiFetch<ApiPlacementAnalytics>(
        academicYear ? `/analytics/placements?academicYear=${academicYear}` : '/analytics/placements',
      ),
  })
}

// ── Mutations ────────────────────────────────────────────

/** Student self-records their own ranked choices. */
export function useSetMyChoices() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SetChoicesInput) =>
      apiFetch<ApiUniversityPlacement>('/placements/me/choices', { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.placements.me() }),
    onError:   (err) => console.error('Failed to save placement choices', err),
  })
}

/** Student self-reports their own outcome. */
export function useRecordMyOutcome() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RecordOutcomeInput) =>
      apiFetch<ApiUniversityPlacement>('/placements/me/outcome', { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.placements.me() }),
    onError:   (err) => console.error('Failed to record placement outcome', err),
  })
}

/** Staff (re)generate eligibility for one student. */
export function useGeneratePlacement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ studentId, academicYear }: { studentId: string; academicYear: string }) =>
      apiFetch<ApiPlacementResponse>(`/placements/${studentId}/generate`, {
        method: 'POST',
        body: JSON.stringify({ academicYear }),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.placements.student(vars.studentId) })
      qc.invalidateQueries({ queryKey: queryKeys.placements.all() })
    },
    onError: (err) => console.error('Failed to generate placement eligibility', err),
  })
}

/** Staff batch-generate eligibility for a whole cohort. */
export function useBatchGeneratePlacements() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (academicYear: string) =>
      apiFetch<ApiPlacementBatchResult>('/placements/batch-generate', {
        method: 'POST',
        body: JSON.stringify({ academicYear }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.placements.all() }),
    onError:   (err) => console.error('Failed to batch-generate placements', err),
  })
}

/** Staff set a placement's ranked choices. */
export function useSetPlacementChoices() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SetChoicesInput }) =>
      apiFetch<ApiUniversityPlacement>(`/placements/${id}/choices`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.placements.all() }),
    onError:   (err) => console.error('Failed to set placement choices', err),
  })
}

/** Staff record a placement outcome. */
export function useRecordPlacementOutcome() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RecordOutcomeInput }) =>
      apiFetch<ApiUniversityPlacement>(`/placements/${id}/outcome`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.placements.all() }),
    onError:   (err) => console.error('Failed to record placement outcome', err),
  })
}

/** High-rank verify a recorded outcome. */
export function useVerifyPlacementOutcome() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: VerifyOutcomeInput }) =>
      apiFetch<ApiUniversityPlacement>(`/placements/${id}/verify`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.placements.all() }),
    onError:   (err) => console.error('Failed to verify placement outcome', err),
  })
}
