/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/hooks/useAssets.ts
 * [R-PHASE]: R20 — Assets & Inventory Management
 * [PURPOSE]: TanStack Query hooks for the assets domain. Structure mirrors
 *   useLibrary.ts exactly — useQuery for reads keyed off queryKeys.assets.*,
 *   useMutation + qc.invalidateQueries(queryKeys.assets.all()) for writes.
 * [DEPENDS ON]: apps/web/src/lib/api-client.ts (queryKeys.assets.* — same
 *   phase), apps/web/src/server/routes/assets.ts (same phase)
 */
'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  CreateAssetInput, UpdateAssetInput, MarkAssetConditionInput, DisposeAssetInput,
  AllocateAssetInput, ReturnAssetInput, CreateAssetRequestInput,
  ReviewAssetRequestInput, RejectAssetRequestInput,
  RecordAdvanceInput, ReconcileAdvanceInput, WriteOffAdvanceInput,
} from '@shared/schemas/assets'
import type { ApiAsset, ApiAssetAssignment, ApiAssetRequest, ApiAssetAdvance } from '@shared/types/api'
import { apiFetch, queryKeys } from '@/lib/api-client'

export interface ApiInventoryStats {
  byCategory: { category: string; count: number; totalQuantity: number }[]
  byStatus:   { status: string; count: number }[]
  totalValuationMWK: number
  pendingRequests: number
  outstandingAdvancesMWK: number
}

export interface ApiRoomInventoryGroup {
  departmentOrRoom: string
  assignedToType: string
  items: ApiAsset[]
}

export interface ApiDepartmentRequestCount {
  department: string
  status: string
  count: number
}

// ─── REGISTER ─────────────────────────────────────────────

export function useAssets(filters: {
  category?: string; status?: string; search?: string
  sortBy?: 'name' | 'category' | 'acquisitionDate' | 'acquisitionCost'
  sortDir?: 'asc' | 'desc'
} = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => { if (v !== undefined) params.set(k, String(v)) })
  return useQuery({
    queryKey: queryKeys.assets.list(filters),
    queryFn: () => apiFetch<ApiAsset[]>(`/assets?${params}`),
  })
}

export function useAsset(id: string) {
  return useQuery({
    queryKey: queryKeys.assets.detail(id),
    queryFn: () => apiFetch<ApiAsset>(`/assets/${id}`),
    enabled: !!id,
  })
}

export function useInventoryStats() {
  return useQuery({ queryKey: queryKeys.assets.stats(), queryFn: () => apiFetch<ApiInventoryStats>('/assets/stats') })
}

/** "What's in Room X" / "what does Department Y hold" — active room/department allocations, grouped. */
export function useRoomInventory() {
  return useQuery({ queryKey: queryKeys.assets.rooms(), queryFn: () => apiFetch<ApiRoomInventoryGroup[]>('/assets/rooms') })
}

export function useCreateAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateAssetInput) => apiFetch('/assets', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assets.all() }),
  })
}

export function useUpdateAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAssetInput }) =>
      apiFetch(`/assets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assets.all() }),
  })
}

export function useMarkAssetCondition() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: MarkAssetConditionInput }) =>
      apiFetch(`/assets/${id}/condition`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assets.all() }),
  })
}

export function useDisposeAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: DisposeAssetInput }) =>
      apiFetch(`/assets/${id}/dispose`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assets.all() }),
  })
}

// ─── ALLOCATION / RETURN ──────────────────────────────────

export function useAssetAssignments(assetId: string) {
  return useQuery({
    queryKey: queryKeys.assets.assignments(assetId),
    queryFn: () => apiFetch<ApiAssetAssignment[]>(`/assets/${assetId}/assignments`),
    enabled: !!assetId,
  })
}

export function useMyAssignedAssets() {
  return useQuery({
    queryKey: queryKeys.assets.myAssigned(),
    queryFn: () => apiFetch<ApiAssetAssignment[]>('/assets/my-assigned'),
  })
}

export function useAllocateAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ assetId, data }: { assetId: string; data: AllocateAssetInput }) =>
      apiFetch(`/assets/${assetId}/allocate`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assets.all() }),
  })
}

export function useReturnAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ assignmentId, data }: { assignmentId: string; data: ReturnAssetInput }) =>
      apiFetch(`/assets/assignments/${assignmentId}/return`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assets.all() }),
  })
}

// ─── REQUISITIONS ─────────────────────────────────────────

export function useAssetRequests(filters: { status?: string; department?: string } = {}) {
  const params = new URLSearchParams()
  if (filters.status)     params.set('status', filters.status)
  if (filters.department) params.set('department', filters.department)
  return useQuery({
    queryKey: queryKeys.assets.requests(filters),
    queryFn: () => apiFetch<ApiAssetRequest[]>(`/assets/requests?${params}`),
  })
}

/** Pending-request counts grouped by department — for a "queue by department" summary. */
export function useRequestsByDepartment() {
  return useQuery({
    queryKey: queryKeys.assets.requestsByDepartment(),
    queryFn: () => apiFetch<ApiDepartmentRequestCount[]>('/assets/requests/by-department'),
  })
}

export function useMyAssetRequests() {
  return useQuery({
    queryKey: queryKeys.assets.myRequests(),
    queryFn: () => apiFetch<ApiAssetRequest[]>('/assets/requests/mine'),
  })
}

export function useCreateAssetRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateAssetRequestInput) => apiFetch('/assets/requests', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assets.all() }),
  })
}

export function useApproveAssetRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ReviewAssetRequestInput }) =>
      apiFetch(`/assets/requests/${id}/approve`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assets.all() }),
  })
}

export function useRejectAssetRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: RejectAssetRequestInput }) =>
      apiFetch(`/assets/requests/${id}/reject`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assets.all() }),
  })
}

// ─── PROCUREMENT ADVANCES ─────────────────────────────────

export function useRequestAdvances(requestId: string) {
  return useQuery({
    queryKey: queryKeys.assets.requestAdvances(requestId),
    queryFn: () => apiFetch<ApiAssetAdvance[]>(`/assets/requests/${requestId}/advances`),
    enabled: !!requestId,
  })
}

export function useAdvances(status?: string) {
  return useQuery({
    queryKey: queryKeys.assets.advances(status),
    queryFn: () => apiFetch<ApiAssetAdvance[]>(`/assets/advances${status ? `?status=${status}` : ''}`),
  })
}

export function useRecordAdvance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ requestId, data }: { requestId: string; data: RecordAdvanceInput }) =>
      apiFetch(`/assets/requests/${requestId}/advances`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assets.all() }),
  })
}

export function useReconcileAdvance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ReconcileAdvanceInput }) =>
      apiFetch(`/assets/advances/${id}/reconcile`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assets.all() }),
  })
}

export function useWriteOffAdvance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: WriteOffAdvanceInput }) =>
      apiFetch(`/assets/advances/${id}/write-off`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.assets.all() }),
  })
}