/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/hooks/useApplications.ts
 * [R-PHASE]: R1 — API Client & Query-Key Singleton Consolidation
 * [PURPOSE]: Admissions-application hooks — repointed at the canonical apiFetch/queryKeys singleton.
 * [DEPENDS ON]: W/lib/api-client.ts
 */
/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/hooks/useApplications.ts
 * [R-PHASE]: R5 — Academics I: Admissions & Student Records
 * [PURPOSE]: Consequential fix, not itself an R5 change-list item:
 *   applications.ts's POST /:id/convert now repoints at
 *   studentService.createFromApplication(), whose response is
 *   { student, firebaseUid, firebaseAccountCreated, tempPasswordSet } —
 *   richer than the raw ApiStudent this hook previously (and incorrectly)
 *   typed the response as. useConvertToStudent() now types the response
 *   with the real shape (@shared/types/api's ApiConvertApplicationResult)
 *   rather than shipping a known-wrong type declaration.
 * [DEPENDS ON]: @shared/types/api (ApiConvertApplicationResult)
 */
/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/hooks/useApplications.ts
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: useApplications() now consumes the paginated
 *   ApiApplicationListResponse envelope ({ applications, total, page,
 *   pages }) the GET /applications route returns as of this phase,
 *   accepting an optional page argument — previously the route returned
 *   (and this hook typed) every matching row unbounded.
 * [DEPENDS ON]: @shared/types/api (ApiApplicationListResponse)
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  ApiApplication,
  ApiApplicationListResponse,
  ApiConvertApplicationResult,
} from '@shared/types/api'
import { apiFetch, queryKeys } from '@/lib/api-client'

export function useApplications(status?: string, page = 1) {
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  params.set('page', String(page))
  return useQuery({
    queryKey: queryKeys.applications.list({ status: status ?? null, page }),
    queryFn: () => apiFetch<ApiApplicationListResponse>(`/applications?${params}`),
  })
}

/**
 * Single application for the applicant detail page. Consumes
 * GET /applications/:id (added alongside this hook). Disabled until an id
 * is available so it never fires with an empty path segment.
 */
export function useApplication(id: string) {
  return useQuery({
    queryKey: queryKeys.applications.detail(id),
    queryFn: () => apiFetch<ApiApplication>(`/applications/${id}`),
    enabled: Boolean(id),
  })
}

export function useUpdateApplicationStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) =>
      apiFetch<ApiApplication>(`/applications/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, notes }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.applications.all() }),
  })
}

export function useConvertToStudent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, classId, createLoginAccount }: { id: string; classId?: string; createLoginAccount?: boolean }) =>
      apiFetch<ApiConvertApplicationResult>(`/applications/${id}/convert`, {
        method: 'POST',
        body: JSON.stringify({ classId, createLoginAccount }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.applications.all() })
      qc.invalidateQueries({ queryKey: queryKeys.students.all() })
    },
  })
}