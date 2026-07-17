/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/hooks/useLibrary.ts
 * [R-PHASE]: R1 — API Client & Query-Key Singleton Consolidation; further
 *   edited in R12 — Library Domain & the Storage API Contract Fix
 * [PURPOSE]: Library books/borrowings/digital-resources hooks — repointed at the canonical apiFetch/queryKeys singleton. Not named in the roadmap's 13-file list, but matched the identical local-apiFetch/local-keys anti-pattern and was required to satisfy R1's own codebase-wide acceptance criteria.
 *   R12 adds hooks for the two newly-wired library.ts workflows
 *   (resource recommendations, fine-waiver requests) so
 *   library/page.tsx (same phase) can submit/approve/reject through them
 *   instead of a page-local fetch call, and adds a real onError to
 *   useDigitalResourceView() — its only two callers as of this phase
 *   (DigitalResourceViewer.tsx, library/page.tsx) both need visible
 *   failure feedback rather than a silently-discarded rejected mutation.
 *   R15 — UI/UX Polish types useLibraryStats() with the exported
 *   ApiLibraryStats interface (mirrors libraryService.getLibraryStats()'s
 *   return shape) so LibraryDashboard's newly-wired stat cards read typed
 *   figures instead of casting unknown.
 * [DEPENDS ON]: W/lib/api-client.ts
 */
'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  CreateBookInput, IssueBorrowingInput, ReturnBorrowingInput,
  CreateRecommendationInput, ReviewRecommendationInput, RejectRecommendationInput,
  CreateFineWaiverInput, RejectFineWaiverInput,
} from '@shared/schemas/library'
import type { ApiResourceRecommendation, ApiFineWaiverRequest } from '@shared/types/api'
import { apiFetch, queryKeys } from '@/lib/api-client'

/**
 * Response shape of GET /library/stats — mirrors
 * libraryService.getLibraryStats()'s return object (R15).
 */
export interface ApiLibraryStats {
  totalBooks:        number
  activeBorrowings:  number
  overdueBorrowings: number
  pendingFines:      number
  digitalCount:      number
}

export function useBooks(filters: { category?: string; search?: string; available?: boolean } = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => { if (v !== undefined) params.set(k, String(v)) })
  return useQuery({
    queryKey: queryKeys.library.books(filters),
    queryFn: () => apiFetch(`/library?${params}`),
  })
}

export function useBook(id: string) {
  return useQuery({
    queryKey: queryKeys.library.book(id),
    queryFn: () => apiFetch(`/library/${id}`),
    enabled: !!id,
  })
}

export function useLibraryStats() {
  return useQuery({ queryKey: queryKeys.library.stats(), queryFn: () => apiFetch<ApiLibraryStats>('/library/stats') })
}

export function useCreateBook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateBookInput) => apiFetch('/library', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.library.all() }),
  })
}

export function useIssueBorrowing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: IssueBorrowingInput) => apiFetch('/library/borrowings/issue', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.library.all() }),
  })
}

export function useReturnBook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ borrowingId, data }: { borrowingId: string; data: ReturnBorrowingInput }) =>
      apiFetch(`/library/borrowings/${borrowingId}/return`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.library.all() }),
  })
}

export function useBorrowings(filters: { studentId?: string; staffId?: string; status?: string; overdue?: boolean } = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => { if (v !== undefined) params.set(k, String(v)) })
  return useQuery({
    queryKey: queryKeys.library.borrowings(filters),
    queryFn: () => apiFetch(`/library/borrowings/list?${params}`),
  })
}

export function useDigitalResources(filters: { type?: string; form?: number; subject?: string } = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => { if (v !== undefined) params.set(k, String(v)) })
  return useQuery({
    queryKey: queryKeys.library.digitalResources(filters),
    queryFn: () => apiFetch(`/library/digital?${params}`),
  })
}

export function useDigitalResourceView() {
  return useMutation({
    mutationFn: (resourceId: string) => apiFetch<{ url: string }>(`/library/digital/${resourceId}/view`),
    onError: (err) => {
      console.error('[useDigitalResourceView] failed to load resource', err)
    },
  })
}

export function useScanBarcode() {
  return useMutation({
    mutationFn: (barcode: string) => apiFetch(`/library/barcode/${barcode}`),
  })
}

// ─── RESOURCE RECOMMENDATIONS ─────────────────────────────
export function useRecommendations(status?: string) {
  const params = status ? `?status=${encodeURIComponent(status)}` : ''
  return useQuery({
    queryKey: queryKeys.library.recommendations(status),
    queryFn: () => apiFetch<ApiResourceRecommendation[]>(`/library/recommendations${params}`),
  })
}

export function useCreateRecommendation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateRecommendationInput) =>
      apiFetch('/library/recommendations', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.library.recommendations() }),
    onError: (err) => { console.error('[useCreateRecommendation] failed', err) },
  })
}

export function useApproveRecommendation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: ReviewRecommendationInput['notes'] }) =>
      apiFetch(`/library/recommendations/${id}/approve`, { method: 'PATCH', body: JSON.stringify({ notes }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.library.recommendations() }),
    onError: (err) => { console.error('[useApproveRecommendation] failed', err) },
  })
}

export function useRejectRecommendation() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: RejectRecommendationInput['reason'] }) =>
      apiFetch(`/library/recommendations/${id}/reject`, { method: 'PATCH', body: JSON.stringify({ reason }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.library.recommendations() }),
    onError: (err) => { console.error('[useRejectRecommendation] failed', err) },
  })
}

// ─── FINE WAIVER REQUESTS ──────────────────────────────────
export function useFineWaivers(status?: string) {
  const params = status ? `?status=${encodeURIComponent(status)}` : ''
  return useQuery({
    queryKey: queryKeys.library.fineWaivers(status),
    queryFn: () => apiFetch<ApiFineWaiverRequest[]>(`/library/fine-waivers${params}`),
  })
}

export function useCreateFineWaiver() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateFineWaiverInput) =>
      apiFetch('/library/fine-waivers', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.library.fineWaivers() }),
    onError: (err) => { console.error('[useCreateFineWaiver] failed', err) },
  })
}

export function useApproveFineWaiver() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/library/fine-waivers/${id}/approve`, { method: 'PATCH', body: JSON.stringify({}) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.library.fineWaivers() }),
    onError: (err) => { console.error('[useApproveFineWaiver] failed', err) },
  })
}

export function useRejectFineWaiver() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: RejectFineWaiverInput['reason'] }) =>
      apiFetch(`/library/fine-waivers/${id}/reject`, { method: 'PATCH', body: JSON.stringify({ reason }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.library.fineWaivers() }),
    onError: (err) => { console.error('[useRejectFineWaiver] failed', err) },
  })
}