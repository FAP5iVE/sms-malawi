/**
 * apps/web/src/hooks/usePlacements.ts
 *
 * [CHANGE TYPE]: MAJOR REWRITE (OVERHAUL)
 * [R-PHASE]: R18 — University Placement Module, redesigned against the
 *   "Malawi Higher Education Placement & Advisory" reference module.
 * [PURPOSE]: React Query hooks over the redesigned /placements/* surface.
 *   The old cohort/student/generate/batch-generate/set-choices/verify hooks
 *   are gone with the ranked-choices pipeline they served; replaced by
 *   hooks matching the reference module's five tabs (Student Claim Portal,
 *   MSCE Advisory, Registry & Analytics, Staff Entry, Claims Verification).
 * [DEPENDS ON]: @/lib/api-client (apiFetch, queryKeys), @tanstack/react-query,
 *   @shared/types/api, @shared/schemas/placement
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  ApiMyPlacementResponse,
  ApiUniversityPlacement,
  ApiPlacementEligibleStudent,
  ApiPlacementAnalytics,
  ApiAdvisoryResponse,
} from '@shared/types/api'
import type { StaffPlacementEntryInput, StudentClaimInput, RejectClaimInput, AdvisoryCheckInput } from '@shared/schemas/placement'
import type { University } from '@shared/constants/universities'
import { apiFetch, queryKeys } from '@/lib/api-client'

// ─────────────────────────────────────────────────────────
//  STUDENT CLAIM PORTAL
// ─────────────────────────────────────────────────────────

export function useMyPlacement(enabled: boolean = true) {
  return useQuery({
    queryKey: queryKeys.placements.me(),
    queryFn:  () => apiFetch<ApiMyPlacementResponse>('/placements/me'),
    enabled,
  })
}

export function useSubmitPlacementClaim() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: StudentClaimInput) =>
      apiFetch<ApiUniversityPlacement>('/placements/me/claim', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.placements.me() })
      qc.invalidateQueries({ queryKey: ['placements', 'registry'] })
      qc.invalidateQueries({ queryKey: ['placements', 'analytics'] })
    },
  })
}

// ─────────────────────────────────────────────────────────
//  MSCE ADVISORY — self-service calculator, all roles
// ─────────────────────────────────────────────────────────

export function useAdvisoryCheck() {
  return useMutation({
    mutationFn: (data: AdvisoryCheckInput) =>
      apiFetch<ApiAdvisoryResponse>('/placements/advisory', { method: 'POST', body: JSON.stringify(data) }),
  })
}

// ─────────────────────────────────────────────────────────
//  PLACEMENT REGISTRY & ANALYTICS — everyone
// ─────────────────────────────────────────────────────────

export function usePlacementRegistry(academicYear?: string) {
  return useQuery({
    queryKey: queryKeys.placements.registry(academicYear),
    queryFn:  () =>
      apiFetch<ApiUniversityPlacement[]>(
        `/placements/registry${academicYear ? `?academicYear=${academicYear}` : ''}`,
      ),
  })
}

export function usePlacementAnalytics(academicYear?: string) {
  return useQuery({
    queryKey: queryKeys.placements.analytics(academicYear),
    queryFn:  () =>
      apiFetch<ApiPlacementAnalytics>(
        `/analytics/placements${academicYear ? `?academicYear=${academicYear}` : ''}`,
      ),
    enabled: Boolean(academicYear),
  })
}

export function usePlacementCatalogue() {
  return useQuery({
    queryKey: queryKeys.placements.catalogue(),
    queryFn:  () => apiFetch<University[]>('/placements/catalogue'),
    staleTime: 60 * 60 * 1000, // the catalogue barely changes — cache for an hour
  })
}

// ─────────────────────────────────────────────────────────
//  STAFF PLACEMENT ENTRY
// ─────────────────────────────────────────────────────────

export function useEligibleCohort(academicYear: string | undefined) {
  return useQuery({
    queryKey: queryKeys.placements.eligible(academicYear ?? ''),
    queryFn:  () => apiFetch<ApiPlacementEligibleStudent[]>(`/placements/eligible?academicYear=${academicYear}`),
    enabled:  Boolean(academicYear),
  })
}

export function useRecordStaffPlacement(academicYear?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: StaffPlacementEntryInput) =>
      apiFetch<ApiUniversityPlacement>('/placements/staff-entry', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.placements.eligible(academicYear ?? '') })
      qc.invalidateQueries({ queryKey: ['placements', 'registry'] })
      qc.invalidateQueries({ queryKey: ['placements', 'analytics'] })
    },
  })
}

// ─────────────────────────────────────────────────────────
//  CLAIMS VERIFICATION DESK
// ─────────────────────────────────────────────────────────

export function usePlacementsQueue(academicYear?: string, enabled: boolean = true) {
  return useQuery({
    queryKey: queryKeys.placements.queue(academicYear),
    queryFn:  () =>
      apiFetch<ApiUniversityPlacement[]>(
        `/placements/queue${academicYear ? `?academicYear=${academicYear}` : ''}`,
      ),
    enabled,
  })
}

function invalidateAfterVerification(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['placements', 'queue'] })
  qc.invalidateQueries({ queryKey: ['placements', 'registry'] })
  qc.invalidateQueries({ queryKey: ['placements', 'eligible'] })
  qc.invalidateQueries({ queryKey: ['placements', 'analytics'] })
}

export function useApprovePlacementClaim() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<ApiUniversityPlacement>(`/placements/${id}/approve`, { method: 'PATCH' }),
    onSuccess:  () => invalidateAfterVerification(qc),
  })
}

export function useRejectPlacementClaim() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: RejectClaimInput & { id: string }) =>
      apiFetch<ApiUniversityPlacement>(`/placements/${id}/reject`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => invalidateAfterVerification(qc),
  })
}
