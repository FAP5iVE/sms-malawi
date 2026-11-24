'use client'

/**
 * apps/web/src/hooks/useSignature.ts
 *
 * [CHANGE TYPE]: NEW (phase 17, digital signature)
 * [PURPOSE]: "My signature" and the school's switch for using signatures on documents. The server never
 *   sends the image back: these hooks only carry the status.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-client'

export interface SignatureStatus {
  hasSignature: boolean
  updatedAt: string | null
  sizeBytes: number | null
  /** The school-wide switch: signatures are drawn on documents only while this is on. */
  useOnDocuments: boolean
}

const KEY = ['signature', 'me'] as const

export function useSignatureStatus(enabled: boolean) {
  return useQuery({ queryKey: KEY, queryFn: () => apiFetch<SignatureStatus>('/signatures/me'), enabled, retry: false })
}

export function useSaveSignature() {
  const qc = useQueryClient()
  return useMutation({
    meta: { successMessage: 'Your signature was saved', failureTitle: 'Could not save your signature' },
    // The file goes up as the request body itself; its own type is the content type.
    mutationFn: (file: File) => apiFetch<SignatureStatus>('/signatures/me', { method: 'PUT', body: file, headers: { 'Content-Type': file.type } }),
    onSuccess: (status) => qc.setQueryData(KEY, status),
  })
}

export function useRemoveSignature() {
  const qc = useQueryClient()
  return useMutation({
    meta: { successMessage: 'Your signature was removed', failureTitle: 'Could not remove your signature' },
    mutationFn: () => apiFetch<SignatureStatus>('/signatures/me', { method: 'DELETE' }),
    onSuccess: (status) => qc.setQueryData(KEY, status),
  })
}

export function useSetUseSignatures() {
  const qc = useQueryClient()
  return useMutation({
    meta: { successMessage: 'Saved', failureTitle: 'Could not change this setting' },
    mutationFn: (useOnDocuments: boolean) => apiFetch<SignatureStatus>('/signatures/settings', { method: 'PUT', body: JSON.stringify({ useOnDocuments }) }),
    onSuccess: (status) => qc.setQueryData(KEY, status),
  })
}
