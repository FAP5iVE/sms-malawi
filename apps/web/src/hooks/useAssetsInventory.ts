'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'

// [CHANGE TYPE]: FIX (R22) — supersedes the partner's draft. Renamed fields
// to match the real schema (sku->itemCode, type->transactionType,
// fromRoomId/toRoomId->sourceRoomId/destinationRoomId, expectedQty/foundQty
// ->expectedQuantity/actualQuantity), dropped fields that don't exist
// (minimumStock, department-scoped transfers, custodianUid as client input),
// and fixed two payload shapes that didn't match their routes:
// recordLine now targets an existing pre-populated line by lineId (not by
// asset/item reference — the whole point of "baseline, not fabricated
// evidence" is that lines are snapshotted when the count opens, see
// stocktakeService.startStocktake), and resolveVariance now sends the
// {resolution: 'RESOLVED'|'WRITTEN_OFF'} shape the route actually validates.

export interface InventoryItem {
  id: string
  itemCode: string
  name: string
  category?: string | null
  unitOfMeasure: string
  reorderLevel?: number | string | null
  reorderQuantity?: number | string | null
  isActive: boolean
  currentBalance?: number
  belowReorderLevel?: boolean
}

export interface InventoryTransaction {
  id: string
  inventoryItemId: string
  transactionType: string
  quantity: number | string
  sourceRoomId?: string | null
  destinationRoomId?: string | null
  departmentId?: string | null
  reason?: string | null
  referenceType?: string | null
  referenceId?: string | null
  createdAt: string
  inventoryItem?: Pick<InventoryItem, 'itemCode' | 'name' | 'unitOfMeasure'>
}

export interface StocktakeLine {
  id: string
  assetId?: string | null
  inventoryItemId?: string | null
  expectedQuantity: number | string
  actualQuantity: number | string
  condition?: string | null
  notes?: string | null
  variance?: { id: string; varianceQuantity: number | string; varianceType: string; status: string } | null
}

export interface Stocktake {
  id: string
  stocktakeNumber: string
  academicYear: string
  term?: number | null
  departmentId?: string | null
  roomId?: string | null
  custodianUid?: string | null
  status: string
  startedAt?: string | null
  completedAt?: string | null
  lines?: StocktakeLine[]
  variances?: Array<{
    id: string
    stocktakeLineId: string
    varianceQuantity: number | string
    varianceType: 'SHORTAGE' | 'SURPLUS'
    status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'WRITTEN_OFF'
    reason?: string | null
    resolutionNote?: string | null
  }>
}

const inventoryKeys = {
  all: () => ['assets', 'inventory'] as const,
  items: (filters?: Record<string, unknown>) => ['assets', 'inventory', 'items', filters ?? {}] as const,
  transactions: (itemId?: string) => ['assets', 'inventory', 'transactions', itemId ?? 'all'] as const,
  stocktakes: (filters?: Record<string, unknown>) => ['assets', 'stocktakes', filters ?? {}] as const,
  stocktake: (id: string) => ['assets', 'stocktakes', id] as const,
}

export function useInventoryItems(filters: { category?: string; search?: string; lowStock?: boolean; includeInactive?: boolean } = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value))
  })
  return useQuery({
    queryKey: inventoryKeys.items(filters),
    queryFn: () => apiFetch<InventoryItem[]>(`/inventory/items?${params}`),
  })
}

export function useCreateInventoryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { itemCode: string; name: string; category?: string; description?: string; unitOfMeasure: string; reorderLevel?: number; reorderQuantity?: number }) =>
      apiFetch('/inventory/items', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: inventoryKeys.all() }),
  })
}

export function useUpdateInventoryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; category?: string; description?: string; reorderLevel?: number; reorderQuantity?: number; isActive?: boolean }) =>
      apiFetch(`/inventory/items/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: inventoryKeys.all() }),
  })
}

export function useInventoryTransactions(itemId?: string) {
  const query = itemId ? `?inventoryItemId=${encodeURIComponent(itemId)}` : ''
  return useQuery({
    queryKey: inventoryKeys.transactions(itemId),
    queryFn: () => apiFetch<InventoryTransaction[]>(`/inventory/transactions${query}`),
  })
}

export function useReceiveInventory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { inventoryItemId: string; quantity: number; destinationRoomId?: string; departmentId?: string; reason?: string }) =>
      apiFetch('/inventory/transactions/receipt', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: inventoryKeys.all() }),
  })
}

export function useIssueInventory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { inventoryItemId: string; quantity: number; sourceRoomId?: string; departmentId?: string; reason?: string }) =>
      apiFetch('/inventory/transactions/issue', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: inventoryKeys.all() }),
  })
}

export function useTransferInventory() {
  const qc = useQueryClient()
  return useMutation({
    // sourceRoomId/destinationRoomId are both required — a transfer moves
    // stock between two specific rooms; there's no department-to-department
    // transfer concept in the schema (InventoryTransaction has one
    // departmentId, not a from/to pair).
    mutationFn: (data: { inventoryItemId: string; quantity: number; sourceRoomId: string; destinationRoomId: string; reason?: string }) =>
      apiFetch('/inventory/transactions/transfer', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: inventoryKeys.all() }),
  })
}

export function useAdjustInventory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { inventoryItemId: string; quantity: number; direction: 'INCREASE' | 'DECREASE'; reason: string }) =>
      apiFetch('/inventory/transactions/adjust', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: inventoryKeys.all() }),
  })
}

export function useStocktakes(filters: { academicYear?: string; term?: number; roomId?: string; departmentId?: string; status?: string } = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value))
  })
  return useQuery({
    queryKey: inventoryKeys.stocktakes(filters),
    queryFn: () => apiFetch<Stocktake[]>(`/stocktakes?${params}`),
  })
}

export function useStocktake(id: string) {
  return useQuery({
    queryKey: inventoryKeys.stocktake(id),
    queryFn: () => apiFetch<Stocktake>(`/stocktakes/${id}`),
    enabled: !!id,
  })
}

export function useCreateStocktake() {
  const qc = useQueryClient()
  return useMutation({
    // custodianUid is NOT client input — the server derives it from the
    // room's own custodianUid when roomId is given (stocktakeService.createStocktake).
    mutationFn: (data: { academicYear: string; term?: number; roomId?: string; departmentId?: string; notes?: string }) =>
      apiFetch('/stocktakes', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: inventoryKeys.stocktakes() }),
  })
}

export function useStartStocktake() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/stocktakes/${id}/start`, { method: 'POST' }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: inventoryKeys.stocktakes() })
      qc.invalidateQueries({ queryKey: inventoryKeys.stocktake(id) })
    },
  })
}

export function useRecordStocktakeLine() {
  const qc = useQueryClient()
  return useMutation({
    // Matches stocktakesRouter's POST /:id/lines exactly: stocktakeId goes in
    // the URL, the body is just the existing line being counted.
    mutationFn: ({ stocktakeId, ...data }: { stocktakeId: string; lineId: string; actualQuantity: number; condition?: string; notes?: string }) =>
      apiFetch(`/stocktakes/${stocktakeId}/lines`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (_data, variables) => qc.invalidateQueries({ queryKey: inventoryKeys.stocktake(variables.stocktakeId) }),
  })
}

export function useCompleteStocktake() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/stocktakes/${id}/complete`, { method: 'POST' }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: inventoryKeys.stocktakes() })
      qc.invalidateQueries({ queryKey: inventoryKeys.stocktake(id) })
    },
  })
}

export function useResolveInventoryVariance() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ stocktakeId, varianceId, resolution, resolutionNote }: { stocktakeId: string; varianceId: string; resolution: 'RESOLVED' | 'WRITTEN_OFF'; resolutionNote?: string }) =>
      apiFetch(`/stocktakes/${stocktakeId}/variances/${varianceId}/resolve`, { method: 'POST', body: JSON.stringify({ resolution, resolutionNote }) }),
    onSuccess: (_data, variables) => qc.invalidateQueries({ queryKey: inventoryKeys.stocktake(variables.stocktakeId) }),
  })
}
