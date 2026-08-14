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
import type { ApiPublicPlacement } from '@shared/types/api'
import { STALE } from '@/components/providers/QueryProvider'

// ─────────────────────────────────────────────────────────
//  RESPONSE TYPES
// ─────────────────────────────────────────────────────────

export interface PublicSchoolInfo {
  schoolName:  string
  slogan:      string
  /** [PRODUCTION FIX 2026-07-28] Previously hardcoded strings in page.tsx —
   *  now admin/hr/high_rank-editable via Settings, same pattern as schoolName. */
  systemTagline: string
  heroSubtitle:  string
  founded:     number
  address:     string
  phone:       string
  email:       string
  vision:      string
  mission:     string
  coreValues:  string[]
  currentYear: string
  /** [PRODUCTION FIX 2026-07-28] Footer social icons — real URLs, editable
   *  under Settings -> School Identity. null = hide that icon. */
  social: {
    facebook:  string | null
    twitter:   string | null
    instagram: string | null
    youtube:   string | null
    linkedin:  string | null
  }
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
  /** Real, live ACTIVE student count — see public.ts's route comment. */
  enrolledStudents: number
}

export interface PublicAnnouncement {
  id:        string
  title:     string
  body:      string
  category:  string | null
  createdAt: string
  eventDate: string | null
  /** Direct, ready-to-use view URL — resolved server-side via
   *  getPublicViewUrl(), not a raw Appwrite file ID. Present only if a
   *  cover image was attached when the announcement was written. */
  imageUrl:  string | null
}

/** GET /public/placement-stats — real UniversityPlacement outcomes,
 *  previously tracked but never exposed publicly (every /placements/*
 *  route requires auth). "qualified" = MSCE leavers who reached the
 *  placement process; "selected" = outcome PLACED or CONFIRMED. */
export interface PublicPlacementStats {
  year:          string
  qualified:     number
  selected:      number
  selectionRate: number
}

/** GET /public/announcements — paginated. Homepage teaser callers omit
 *  `page` (defaults to 1); the dedicated /news, /announcements and /events
 *  pages pass page/limit to browse the full archive. */
export interface PublicAnnouncementsPage {
  announcements: PublicAnnouncement[]
  total:         number
  page:          number
  pageSize:      number
}

/** GET /public/events — [N6] server-side eventDate-filtered, ordered by
 *  eventDate ascending, with a correct total (fixes the old client-side
 *  filter that broke pagination). */
export interface PublicEventsPage {
  events:   PublicAnnouncement[]
  total:    number
  page:     number
  pageSize: number
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

export function usePublicAnnouncements(limit = 6, page = 1) {
  return useQuery({
    queryKey: [...queryKeys.public.announcements(limit), page] as const,
    queryFn:  () => apiFetch<PublicAnnouncementsPage>(`/public/announcements?limit=${limit}&page=${page}`),
    staleTime: STALE.MEDIUM,
  })
}

/** [N6] Public events — server-side filtered by eventDate with correct total. */
export function usePublicEvents(limit = 20, page = 1) {
  return useQuery({
    queryKey: ['public', 'events', limit, page] as const,
    queryFn:  () => apiFetch<PublicEventsPage>(`/public/events?limit=${limit}&page=${page}`),
    staleTime: STALE.MEDIUM,
  })
}

export function usePublicPlacementStats(year?: string) {
  return useQuery({
    queryKey: queryKeys.public.placementStats(year),
    queryFn:  () => apiFetch<PublicPlacementStats>(`/public/placement-stats${year ? `?year=${year}` : ''}`),
    staleTime: STALE.SLOW,
  })
}

/** GET /public/placements — the actual named NCHE-selection list (student,
    university, programme, status). Genuinely unauthenticated: this IS public
    information once verified — apiFetch works identically with or without a
    signed-in Firebase user. Only VERIFIED PLACED/CONFIRMED rows are ever
    returned by the server; a pending student self-claim never appears here. */
export function usePublicPlacements(year?: string) {
  return useQuery({
    queryKey: queryKeys.public.placements(year),
    queryFn:  () => apiFetch<ApiPublicPlacement[]>(`/public/placements${year ? `?year=${year}` : ''}`),
    staleTime: STALE.SLOW,
  })
}

export interface PublicGalleryPhoto {
  id:       string
  url:      string
  caption:  string | null
  category: string | null
}
export interface PublicGalleryPage {
  photos:   PublicGalleryPhoto[]
  total:    number
  page:     number
  pageSize: number
}

/** GET /public/gallery — real gallery photos (GalleryPhoto table, files in
 *  Appwrite under FILE_PREFIX.SCHOOL_GALLERY). Homepage passes limit=5;
 *  the /gallery page paginates through everything. */
export function usePublicGallery(limit = 5, page = 1) {
  return useQuery({
    queryKey: ['public', 'gallery', limit, page] as const,
    queryFn:  () => apiFetch<PublicGalleryPage>(`/public/gallery?limit=${limit}&page=${page}`),
    staleTime: STALE.MEDIUM,
  })
}

export interface PublicLeadershipMember {
  name:     string
  title:    string
  bio?:     string
  photoKey?: string
  order?:   number
}

export function usePublicLeadership() {
  return useQuery({
    queryKey: ['public', 'leadership'] as const,
    queryFn:  () => apiFetch<{ team: PublicLeadershipMember[] }>('/public/leadership'),
    staleTime: STALE.SLOW,
  })
}

export interface PublicFeeItem { name: string; amount: number }

export function usePublicFeeStructure(year?: string) {
  return useQuery({
    queryKey: ['public', 'fee-structure', year] as const,
    queryFn:  () => apiFetch<{ year: string; items: PublicFeeItem[] }>(`/public/fee-structure${year ? `?year=${year}` : ''}`),
    staleTime: STALE.SLOW,
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

/** POST /public/contact — see public.ts's route comment for why this exists;
 *  the "Send us a message" form had no backend at all before this. */
export function useContactForm() {
  return useMutation({
    mutationFn: (data: { name: string; email: string; subject: string; message: string }) =>
      apiFetch<{ message: string }>('/public/contact', {
        method: 'POST',
        body:   JSON.stringify(data),
      }),
  })
}