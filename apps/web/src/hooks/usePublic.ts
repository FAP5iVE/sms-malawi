/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/hooks/usePublic.ts
 * [R-PHASE]: R5 — Academics I: Admissions & Student Records
 * [PURPOSE]: TanStack Query hooks for the three existing, unauthenticated
 *   /public/* endpoints (school-info, maneb-stats, announcements) that the
 *   public landing page previously never called, rendering hardcoded data
 *   instead. Uses the canonical apiFetch/queryKeys singleton — apiFetch
 *   already omits the Authorization header gracefully when no Firebase
 *   user is signed in, so these hooks work identically on the
 *   unauthenticated (public) route group.
 * [DEPENDS ON]: apps/web/src/lib/api-client.ts
 */
'use client'
import { useQuery, useMutation } from '@tanstack/react-query'
import { apiFetch, queryKeys } from '@/lib/api-client'
import { STALE } from '@/components/providers/QueryProvider'

// ─────────────────────────────────────────────────────────
//  RESPONSE TYPES
// ─────────────────────────────────────────────────────────

export interface PublicSchoolInfo {
  schoolName:  string
  slogan:      string
  founded:     number
  address:     string
  phone:       string
  email:       string
  vision:      string
  mission:     string
  coreValues:  string[]
  currentYear: string
}

export interface PublicManebStat {
  examType: string
  total:    number
  passed:   number
  passRate: number
}

export interface PublicManebStats {
  year:  string
  stats: PublicManebStat[]
}

export interface PublicAnnouncement {
  id:        string
  title:     string
  body:      string
  category:  string | null
  createdAt: string
  eventDate: string | null
}

// ─────────────────────────────────────────────────────────
//  QUERIES
// ─────────────────────────────────────────────────────────

export function usePublicSchoolInfo() {
  return useQuery({
    queryKey: queryKeys.public.schoolInfo(),
    queryFn:  () => apiFetch<PublicSchoolInfo>('/public/school-info'),
    staleTime: STALE.SLOW,
  })
}

export function usePublicManebStats(year?: string) {
  return useQuery({
    queryKey: queryKeys.public.manebStats(year),
    queryFn:  () => apiFetch<PublicManebStats>(`/public/maneb-stats${year ? `?year=${year}` : ''}`),
    staleTime: STALE.SLOW,
  })
}

export function usePublicAnnouncements(limit = 6) {
  return useQuery({
    queryKey: queryKeys.public.announcements(limit),
    queryFn:  () => apiFetch<PublicAnnouncement[]>(`/public/announcements?limit=${limit}`),
    staleTime: STALE.MEDIUM,
  })
}

// ─────────────────────────────────────────────────────────
//  MUTATIONS
// ─────────────────────────────────────────────────────────

export function useNewsletterSubscribe() {
  return useMutation({
    mutationFn: (data: { email: string; name?: string }) =>
      apiFetch<{ message: string }>('/public/newsletter/subscribe', {
        method: 'POST',
        body:   JSON.stringify(data),
      }),
  })
}
