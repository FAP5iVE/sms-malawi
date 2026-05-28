'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAuth } from 'firebase/auth'
import type { CreateBookInput, IssueBorrowingInput, ReturnBorrowingInput } from '@shared/schemas/library'

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = await getAuth().currentUser?.getIdToken()
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  })
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `API error ${res.status}`)
  return res.json() as Promise<T>
}

export const libKeys = {
  all:      () => ['library'] as const,
  books:    (f: object) => ['library', 'books', f] as const,
  book:     (id: string) => ['library', 'book', id] as const,
  digital:  (f: object) => ['library', 'digital', f] as const,
  borrowings:(f: object) => ['library', 'borrowings', f] as const,
  stats:    () => ['library', 'stats'] as const,
}

export function useBooks(filters: { category?: string; search?: string; available?: boolean } = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => { if (v !== undefined) params.set(k, String(v)) })
  return useQuery({
    queryKey: libKeys.books(filters),
    queryFn: () => apiFetch(`/library?${params}`),
  })
}

export function useBook(id: string) {
  return useQuery({
    queryKey: libKeys.book(id),
    queryFn: () => apiFetch(`/library/${id}`),
    enabled: !!id,
  })
}

export function useLibraryStats() {
  return useQuery({ queryKey: libKeys.stats(), queryFn: () => apiFetch('/library/stats') })
}

export function useCreateBook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateBookInput) => apiFetch('/library', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: libKeys.all() }),
  })
}

export function useIssueBorrowing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: IssueBorrowingInput) => apiFetch('/library/borrowings/issue', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: libKeys.all() }),
  })
}

export function useReturnBook() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ borrowingId, data }: { borrowingId: string; data: ReturnBorrowingInput }) =>
      apiFetch(`/library/borrowings/${borrowingId}/return`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: libKeys.all() }),
  })
}

export function useBorrowings(filters: { studentId?: string; staffId?: string; status?: string; overdue?: boolean } = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => { if (v !== undefined) params.set(k, String(v)) })
  return useQuery({
    queryKey: libKeys.borrowings(filters),
    queryFn: () => apiFetch(`/library/borrowings/list?${params}`),
  })
}

export function useDigitalResources(filters: { type?: string; form?: number; subject?: string } = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([k, v]) => { if (v !== undefined) params.set(k, String(v)) })
  return useQuery({
    queryKey: libKeys.digital(filters),
    queryFn: () => apiFetch(`/library/digital?${params}`),
  })
}

export function useDigitalResourceView() {
  return useMutation({
    mutationFn: (resourceId: string) => apiFetch<{ url: string }>(`/library/digital/${resourceId}/view`),
  })
}

export function useScanBarcode() {
  return useMutation({
    mutationFn: (barcode: string) => apiFetch(`/library/barcode/${barcode}`),
  })
}