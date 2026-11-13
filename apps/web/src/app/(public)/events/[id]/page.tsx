'use client'

/**
 * apps/web/src/app/(public)/events/[id]/page.tsx
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: The full event, only reachable via "Read more" from /events.
 *   GET /public/events/:id is scoped to postType EVENT server-side, so this
 *   URL can never resolve a News article, Announcement, or Ad, the same
 *   explicit-tag guarantee /public/events (list) now enforces.
 * [DEPENDS ON]: usePublicPost('events', id)
 *
 * [CHANGE TYPE]: LOOKS ONLY (Chikangawa Hills theme, Phase 6b, 2026-11-13).
 *   The sky background is now drawn by <PublicPageLayout> inside the shared
 *   PublicArchive view, so this page no longer renders its own.
 */

import { useParams } from 'next/navigation'
import { usePublicPost } from '@/hooks/usePublic'
import { PublicArchiveDetail } from '@/components/shared/PublicArchive'

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading } = usePublicPost('events', id)

  return (
    <PublicArchiveDetail
      post={data}
      isLoading={isLoading}
      notFoundText="This event is unavailable or has been unpublished."
      backHref="/events"
      backLabel="Back to Events"
    />
  )
}