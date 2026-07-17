/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/hooks/useAdmin.ts
 * [R-PHASE]: R1 — API Client & Query-Key Singleton Consolidation
 * [PURPOSE]: User/admin management hooks — repointed at the canonical apiFetch/queryKeys singleton.
 * [DEPENDS ON]: W/lib/api-client.ts
 */
'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateUserInput, NotificationPrefInput } from '@shared/schemas/admin'
import { apiFetch, queryKeys } from '@/lib/api-client'

export function useUsers() {
  return useQuery({ queryKey: queryKeys.admin.users(), queryFn: () => apiFetch('/users') })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateUserInput) => apiFetch('/users', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.users() }),
  })
}

export function useUpdateUserRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ uid, role }: { uid: string; role: string }) =>
      apiFetch('/users/role', { method: 'PATCH', body: JSON.stringify({ uid, role }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.users() }),
  })
}

export function useToggleUserDisabled() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ uid, disabled }: { uid: string; disabled: boolean }) =>
      apiFetch(`/users/${uid}/disable`, { method: 'PATCH', body: JSON.stringify({ disabled }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.users() }),
  })
}

export function useSendPasswordReset() {
  return useMutation({
    mutationFn: (uid: string) => apiFetch(`/users/${uid}/reset-password`, { method: 'POST' }),
  })
}

export function useNotificationPrefs() {
  return useQuery({ queryKey: queryKeys.admin.notifPrefs(), queryFn: () => apiFetch('/users/me/notification-prefs') })
}

export function useUpdateNotificationPrefs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: NotificationPrefInput) =>
      apiFetch('/users/me/notification-prefs', { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.admin.notifPrefs() }),
  })
}