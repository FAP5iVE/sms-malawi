import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAuth } from 'firebase/auth'
import type { CreateClassInput } from '@shared/schemas/student'
import type { ApiClass, ApiTimetableSlot } from '@shared/types/api'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ''

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getAuth().currentUser?.getIdToken()
  const res = await fetch(`${API_BASE}/api${path}`, {
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

export const classKeys = {
  all: () => ['classes'] as const,
  list: (y?: string) => ['classes', 'list', y] as const,
  detail: (id: string) => ['classes', 'detail', id] as const,
  timetable: (id: string, term: number) => ['classes', 'timetable', id, term] as const,
}

export function useClasses(academicYear?: string) {
  return useQuery({
    queryKey: classKeys.list(academicYear),
    queryFn: () =>
      apiFetch<ApiClass[]>(academicYear ? `/classes?academicYear=${academicYear}` : '/classes'),
  })
}

export function useClass(id: string) {
  return useQuery({
    queryKey: classKeys.detail(id),
    queryFn: () => apiFetch<ApiClass>(`/classes/${id}`),
    enabled: !!id,
  })
}

export function useClassTimetable(classId: string, term: number) {
  return useQuery({
    queryKey: classKeys.timetable(classId, term),
    queryFn: () => apiFetch<ApiTimetableSlot[]>(`/classes/${classId}/timetable?term=${term}`),
    enabled: !!classId,
  })
}

export function useCreateClass() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateClassInput) =>
      apiFetch<ApiClass>('/classes', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: classKeys.all() }),
  })
}