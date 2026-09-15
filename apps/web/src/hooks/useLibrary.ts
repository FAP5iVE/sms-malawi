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
  CreateBookInput, IssueBorrowingInput, ReturnBorrowingInput, MarkBookConditionInput,
  CreateRecommendationInput, ReviewRecommendationInput, RejectRecommendationInput,
  CreateFineWaiverInput, RejectFineWaiverInput, CreateDigitalResourceInput,
} from '@shared/schemas/library'
import type { ApiResourceRecommendation, ApiFineWaiverRequest, ApiLibraryFine, ApiLibraryConditionEntry } from '@shared/types/api'
import type { CreateLibraryFineInput } from '@shared/schemas/finance'
import { apiFetch, queryKeys } from '@/lib/api-client'
import { uploadFileDirectly } from '@/lib/directUpload'

/**
 * Response shape of GET /library/stats — mirrors
 * libraryService.getLibraryStats()'s return object (R15).
 * R21 adds pendingFinesAmount — the redesigned "Pending Fines" stat tile
 * needs the MK total, not just the infraction count.
 */
export interface ApiLibraryStats {
  totalBooks:        number
  activeBorrowings:  number
  overdueBorrowings: number
  pendingFines:      number
  pendingFinesAmount: number
  digitalCount:      number
}

export function useBooks(filters: {
  category?: string; search?: string; available?: boolean
  publisher?: string; year?: number
  sortBy?: 'title' | 'author' | 'publishedYear' | 'availableCopies'
  sortDir?: 'asc' | 'desc'
} = {}) {
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

export function useUploadDigitalResource() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateDigitalResourceInput & { file: File }) => {
      const { file, ...meta } = input
      // [PRODUCTION FIX] Was FormData → POST /library/digital/upload
      // (multer, 100MB limit for eBooks/past papers) — going through this
      // app's own Vercel function for the raw file bytes, which hits a
      // hard 4.5MB cap far below what this route was meant to allow, and
      // has no retry if the connection drops mid-upload. The file now
      // goes straight to Appwrite; this call only sends the small
      // metadata + the resulting fileId.
      const fileId = await uploadFileDirectly('/library/digital/upload-ticket', file)
      return apiFetch('/library/digital/upload', {
        method: 'POST',
        body: JSON.stringify({ ...meta, fileId, fileSize: file.size, mimeType: file.type }),
      })
    },
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

// [R21.2] "no where to change [a book's] status" outside of the return
// flow — marks a shelf copy damaged/lost directly from the Catalog
// (BookDetailModal's eye-icon view). Invalidates the whole library query
// space since this touches the book's copy counts (Catalog/Catalog
// Distribution) and the condition report (Reports & Fines ledger).
export function useMarkBookCondition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ bookId, data }: { bookId: string; data: MarkBookConditionInput }) =>
      apiFetch(`/library/${bookId}/condition`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.library.all() }),
    onError: (err) => { console.error('[useMarkBookCondition] failed', err) },
  })
}

// [R21] `search` (borrower name/student ID/book title/barcode — one box,
// server-side OR across the real Student/Staff/Book relations),
// `unreturned` (ACTIVE+OVERDUE — "All Loans" chip) and `dueSoon` (ACTIVE,
// due within 3 days — "Due Soon" chip) added for the redesigned Active
// Borrowings table's search bar + filter chips.
export function useBorrowings(filters: {
  studentId?: string; staffId?: string; status?: string; overdue?: boolean
  unreturned?: boolean; dueSoon?: boolean; search?: string
} = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== '') params.set(k, String(v)) })
  return useQuery({
    queryKey: queryKeys.library.borrowings(filters),
    queryFn: () => apiFetch<import('@shared/types/api').ApiBorrowing[]>(`/library/borrowings/list?${params}`),
  })
}

// [R21] "Renew (+14d)" circulation action — previously had no mutation at
// all. Extends the loan's due date 14 days from now and clears an
// OVERDUE status back to ACTIVE (see libraryService.renewBorrowing()).
export function useRenewBorrowing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (borrowingId: string) => apiFetch(`/library/borrowings/${borrowingId}/renew`, { method: 'PATCH', body: JSON.stringify({}) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.library.all() }),
    onError: (err) => { console.error('[useRenewBorrowing] failed', err) },
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

// [PRODUCTION FIX 2026-07-28] Catalog editing/archiving, catalog report
// stats (most-borrowed/most-read/category breakdown), and fines listing/
// clearing — all real backend capability added this pass, previously
// missing entirely (not just missing a UI).

export function useUpdateBook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiFetch(`/library/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.library.books() }),
  })
}

export function useArchiveBook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/library/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.library.books() }),
  })
}

export function useCatalogReportStats() {
  return useQuery({
    queryKey: ['library', 'reports', 'catalog'] as const,
    queryFn: () => apiFetch<{
      mostBorrowed: { book?: { id: string; title: string; author: string }; borrowCount: number }[]
      mostRead: { resource?: { id: string; title: string; type: string }; viewCount: number }[]
      // [R21] availableCount added — Catalog Distribution's redesigned
      // cards show an "In-Shelf Available: X / Y" bar per category.
      byCategory: { category: string; titleCount: number; copyCount: number; availableCount: number }[]
    }>('/library/reports/catalog'),
  })
}

// [R21] "no where to see how many and what books are lost, damaged" —
// libraryService.getConditionReport() surfaces returned copies recorded
// as DAMAGED/LOST for the ledger's new "Damaged & Lost Books" panel.
export function useConditionReport() {
  return useQuery({
    queryKey: ['library', 'reports', 'conditions'] as const,
    queryFn: () => apiFetch<ApiLibraryConditionEntry[]>('/library/reports/conditions'),
  })
}

// [R21] Widened to the fields already present in listFines()'s spread
// (`...f`) but previously left off the return-type annotation —
// studentId/staffId/paidAt/waivedAt are needed by the Clearance Checker
// (per-student pending-fine lookup) and the Treasury CSV export
// (paidAt), both built client-side from this same query.
export function useFines(status?: string) {
  const params = status ? `?status=${encodeURIComponent(status)}` : ''
  return useQuery({
    queryKey: ['library', 'fines', status ?? null] as const,
    queryFn: () => apiFetch<Array<{
      id: string; bookTitle: string; amount: number; reason: string; status: string
      studentId?: string | null; staffId?: string | null
      borrowerName: string; createdAt: string; paidAt?: string; waivedAt?: string
    }>>(`/library/fines${params}`),
    // [FIX] Belt-and-suspenders against the Decimal-as-string bug fixed
    // in listFines() — coerces `amount` again on the client so any future
    // Decimal field that slips through a JSON response can't silently
    // turn the ledger's summary-card totals into string concatenation.
    select: (data) => data.map((f) => ({ ...f, amount: Number(f.amount) })),
  })
}

export function useClearFine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/library/fines/${id}/clear`, { method: 'PATCH', body: JSON.stringify({}) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['library', 'fines'] }),
  })
}

// [R21] "+ Assess Fine" (Fines & Penalties Ledger) and the inline "Waive"
// action on each pending fine row — both had a screenshot button but no
// UI wiring. Rather than duplicate fine-creation/waiver logic already
// built and working on the finance side (POST/PATCH /finances/library-
// fines — the only place a paid fine also posts an accounting-ledger
// entry), these two call straight through to it and invalidate both this
// module's fines query key and finance's own, so the Reports & Fines
// ledger and Finance's Library Fines tab never drift out of sync.
export function useAssessFine() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateLibraryFineInput) => apiFetch<ApiLibraryFine>('/finances/library-fines', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library', 'fines'] })
      qc.invalidateQueries({ queryKey: queryKeys.finances.libraryFines() })
      qc.invalidateQueries({ queryKey: queryKeys.library.stats() })
    },
    onError: (err) => { console.error('[useAssessFine] failed', err) },
  })
}

export function useWaiveFineDirect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch<ApiLibraryFine>(`/finances/library-fines/${id}/waive`, { method: 'PATCH', body: JSON.stringify({}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library', 'fines'] })
      qc.invalidateQueries({ queryKey: queryKeys.finances.libraryFines() })
      qc.invalidateQueries({ queryKey: queryKeys.library.stats() })
    },
    onError: (err) => { console.error('[useWaiveFineDirect] failed', err) },
  })
}

export function useOverdueByClass() {
  return useQuery({
    queryKey: ['library', 'reports', 'overdue-by-class'] as const,
    queryFn: () => apiFetch<{
      className: string
      students: { studentName: string; bookTitle: string; dueDate: string }[]
    }[]>('/library/reports/overdue-by-class'),
  })
}