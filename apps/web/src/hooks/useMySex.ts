'use client'

/**
 * apps/web/src/hooks/useMySex.ts
 *
 * The signed-in user's recorded sex (students from Student.sex, staff from
 * StaffProfile.sex) via GET /users/me/sex. Resolves to null when nothing is
 * recorded, in which case the dashboard shows an initials badge instead of a
 * picture. Changes rarely, so it is cached for a long time.
 */
import { useQuery } from '@tanstack/react-query'
import { apiFetch, queryKeys } from '@/lib/api-client'
import { STALE } from '@/components/providers/QueryProvider'
import { useAuthStore } from '@/store/authStore'

export type MySex = 'MALE' | 'FEMALE' | null

export function useMySex() {
  const { user, role, initialized } = useAuthStore()
  const uid = user?.uid ?? ''
  return useQuery({
    // Keyed by uid so a different person signing in on the same tab never sees
    // the previous person's cached picture.
    queryKey: queryKeys.me.sex(uid),
    queryFn: async () => (await apiFetch<{ sex: MySex }>('/users/me/sex')).sex,
    enabled: initialized && !!role && !!uid,
    staleTime: STALE.SLOW,
  })
}
