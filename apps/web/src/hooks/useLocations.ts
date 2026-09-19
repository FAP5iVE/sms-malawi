'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'

// [CHANGE TYPE]: NEW FILE (R22) — the location.manage/location.view backend
// (locationService.ts, mappingService.ts, routes/locations.ts) existed with
// no UI hook at all. Every requisition/room/stocktake form that needs a real
// Department or Room was reduced to a raw-ID text box for lack of this.

export interface Department { id: string; code: string; name: string; description?: string | null; isActive: boolean }
export interface Building { id: string; code: string; name: string; description?: string | null; isActive: boolean; _count?: { rooms: number } }
export interface Room {
  id: string; buildingId: string; code: string; name: string; roomType: string
  departmentId?: string | null; custodianUid?: string | null; isActive: boolean
  building?: { name: string; code: string } | null
  department?: { name: string } | null
  custodian?: { firstName: string; lastName: string; uid: string } | null
}
export interface LegacyMapping {
  id: string; mappingType: 'DEPARTMENT' | 'LOCATION'; normalizedValue: string; legacyValue: string
  targetType: string; targetId: string; status: 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'APPLIED'
  notes?: string | null; recordsAffected?: number | null
}

const keys = {
  departments: (includeInactive?: boolean) => ['locations', 'departments', !!includeInactive] as const,
  buildings: (includeInactive?: boolean) => ['locations', 'buildings', !!includeInactive] as const,
  rooms: (filters?: Record<string, unknown>) => ['locations', 'rooms', filters ?? {}] as const,
  mappings: (status?: string) => ['locations', 'mappings', status ?? 'all'] as const,
}

export function useDepartments(includeInactive = false) {
  return useQuery({
    queryKey: keys.departments(includeInactive),
    queryFn: () => apiFetch<Department[]>(`/locations/departments?includeInactive=${includeInactive}`),
  })
}
export function useCreateDepartment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { code: string; name: string; description?: string }) => apiFetch('/locations/departments', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations', 'departments'] }),
  })
}
export function useUpdateDepartment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; description?: string; isActive?: boolean }) => apiFetch(`/locations/departments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations', 'departments'] }),
  })
}

export function useBuildings(includeInactive = false) {
  return useQuery({
    queryKey: keys.buildings(includeInactive),
    queryFn: () => apiFetch<Building[]>(`/locations/buildings?includeInactive=${includeInactive}`),
  })
}
export function useCreateBuilding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { code: string; name: string; description?: string }) => apiFetch('/locations/buildings', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations', 'buildings'] }),
  })
}
export function useUpdateBuilding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; description?: string; isActive?: boolean }) => apiFetch(`/locations/buildings/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations', 'buildings'] }),
  })
}

export function useRooms(filters: { buildingId?: string; departmentId?: string; includeInactive?: boolean } = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => { if (v !== undefined && v !== '') params.set(k, String(v)) })
  return useQuery({ queryKey: keys.rooms(filters), queryFn: () => apiFetch<Room[]>(`/locations/rooms?${params}`) })
}
export function useCreateRoom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { buildingId: string; code: string; name: string; roomType: string; departmentId?: string; custodianUid?: string }) => apiFetch('/locations/rooms', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations', 'rooms'] }),
  })
}
export function useUpdateRoom() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; roomType?: string; departmentId?: string | null; custodianUid?: string | null; isActive?: boolean }) => apiFetch(`/locations/rooms/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations', 'rooms'] }),
  })
}

// ── LEGACY MAPPING REVIEW (Artefacts 9/10) ──

export function useLegacyMappings(status?: string) {
  return useQuery({
    queryKey: keys.mappings(status),
    queryFn: () => apiFetch<LegacyMapping[]>(`/locations/mappings${status ? `?status=${status}` : ''}`),
  })
}
export function useProposeDepartmentMappings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch('/locations/mappings/propose-departments', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations', 'mappings'] }),
  })
}
export function useProposeLocationMappings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch('/locations/mappings/propose-locations', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations', 'mappings'] }),
  })
}
export function useApproveMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => apiFetch(`/locations/mappings/${id}/approve`, { method: 'POST', body: JSON.stringify({ notes }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations', 'mappings'] }),
  })
}
export function useRejectMapping() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => apiFetch(`/locations/mappings/${id}/reject`, { method: 'POST', body: JSON.stringify({ notes }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations', 'mappings'] }),
  })
}
export function useApplyApprovedMappings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch('/locations/mappings/apply', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['locations', 'mappings'] }),
  })
}
