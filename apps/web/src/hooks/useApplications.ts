import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAuth } from 'firebase/auth'

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getAuth().currentUser?.getIdToken()
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options?.headers,
    },
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export const appKeys = {
  all: () => ['applications'] as const,
  list: (s?: string) => ['applications', 'list', s] as const,
}

export function useApplications(status?: string) {
  const qs = status ? `?status=${status}` : ''
  return useQuery({
    queryKey: appKeys.list(status),
    queryFn: () => apiFetch<any[]>(`/applications${qs}`),
  })
}

export function useUpdateApplicationStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) =>
      apiFetch<any>(`/applications/${id}/status`, {
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
      apiFetch<any>(`/applications/${id}/convert`, {
        method: 'POST',
        body: JSON.stringify({ classId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: appKeys.all() })
      qc.invalidateQueries({ queryKey: ['students'] })
    },
  })
}
