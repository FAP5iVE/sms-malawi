'use client'

/**
 * apps/web/src/app/(public)/announcements/[id]/page.tsx
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: The full announcement — only reachable via "Read more" from
 *   /announcements. GET /public/announcements/:id is postType-scoped
 *   server-side, so this URL can never resolve a News article or an Ad.
 * [DEPENDS ON]: usePublicPost('announcements', id)
 */

import { useParams } from 'next/navigation'
import { usePublicPost } from '@/hooks/usePublic'
import { PublicArchiveDetail } from '@/components/shared/PublicArchive'
import { PublicAmbientBackground } from '@/components/shared/PublicAmbientBackground'

export default function AnnouncementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading } = usePublicPost('announcements', id)

  return (
    <>
      <PublicAmbientBackground />
      <PublicArchiveDetail
        post={data}
        isLoading={isLoading}
        notFoundText="This announcement is unavailable or has been unpublished."
        backHref="/announcements"
        backLabel="Back to Announcements"
      />
    </>
  )
}