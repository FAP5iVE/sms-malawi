import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAuth } from 'firebase/auth'
import type { CreateStudentInput } from '@shared/schemas/student'
import type { ApiStudent, ApiStudentListResponse } from '@shared/types/api'

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getAuth().currentUser?.getIdToken()
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? `API error ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const studentKeys = {
  all: () => ['students'] as const,
  list: (f: object) => ['students', 'list', f] as const,
  detail: (id: string) => ['students', 'detail', id] as const,
}

export function useStudents(filters: { status?: string; classId?: string; page?: number } = {}) {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.classId) params.set('classId', filters.classId)
  if (filters.page) params.set('page', String(filters.page))
  return useQuery({
    queryKey: studentKeys.list(filters),
    queryFn: () => apiFetch<ApiStudentListResponse>(`/students?${params}`),
  })
}

export function useStudent(id: string) {
  return useQuery({
    queryKey: studentKeys.detail(id),
    queryFn: () => apiFetch<ApiStudent>(`/students/${id}`),
    enabled: !!id,
  })
}

export function useCreateStudent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateStudentInput) =>
      apiFetch<ApiStudent>('/students', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: studentKeys.all() }),
  })
}

export function useArchiveStudent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ archived: boolean }>(`/students/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: studentKeys.all() }),
  })
}
