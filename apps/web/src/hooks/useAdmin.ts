'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getAuth } from 'firebase/auth'
import type { CreateUserInput, NotificationPrefInput } from '@shared/schemas/admin'

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = await getAuth().currentUser?.getIdToken()
  const res = await fetch(`/api${path}`, {
    ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...opts?.headers },
  })
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `API error ${res.status}`)
  return res.json() as Promise<T>
}

export function useUsers() {
  return useQuery({ queryKey: ['users'], queryFn: () => apiFetch('/users') })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateUserInput) => apiFetch('/users', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useUpdateUserRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ uid, role }: { uid: string; role: string }) =>
      apiFetch('/users/role', { method: 'PATCH', body: JSON.stringify({ uid, role }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useToggleUserDisabled() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ uid, disabled }: { uid: string; disabled: boolean }) =>
      apiFetch(`/users/${uid}/disable`, { method: 'PATCH', body: JSON.stringify({ disabled }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  })
}

export function useSendPasswordReset() {
  return useMutation({
    mutationFn: (uid: string) => apiFetch(`/users/${uid}/reset-password`, { method: 'POST' }),
  })
}

export function useNotificationPrefs() {
  return useQuery({ queryKey: ['users','notification-prefs'], queryFn: () => apiFetch('/users/me/notification-prefs') })
}

export function useUpdateNotificationPrefs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: NotificationPrefInput) =>
      apiFetch('/users/me/notification-prefs', { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users','notification-prefs'] }),
  })
}