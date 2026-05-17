import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAuth } from 'firebase/auth'
import type { ApiApplication, ApiStudent } from '@shared/types/api'

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
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json() as Promise<T>
}

export const appKeys = {
  all: () => ['applications'] as const,
  list: (s?: string) => ['applications', 'list', s] as const,
}

export function useApplications(status?: string) {
  return useQuery({
    queryKey: appKeys.list(status),
    queryFn: () => apiFetch<ApiApplication[]>(`/applications${status ? `?status=${status}` : ''}`),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: appKeys.all() }),
  })
}

export function useConvertToStudent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, classId }: { id: string; classId?: string }) =>
      apiFetch<ApiStudent>(`/applications/${id}/convert`, {
        method: 'POST',
        body: JSON.stringify({ classId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: appKeys.all() })
      qc.invalidateQueries({ queryKey: ['students'] })
    },
  })
}
