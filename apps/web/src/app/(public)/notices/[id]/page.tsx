'use client'

/**
 * apps/web/src/app/(public)/notices/[id]/page.tsx
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: The full announcement — only reachable via "Read more" from
 *   /notices (see /notices/page.tsx's ROUTING NOTE for why this lives at
 *   /notices rather than /announcements). GET /public/announcements/:id is
 *   postType-scoped server-side, so this URL can never resolve a News
 *   article or an Ad.
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
        backHref="/notices"
        backLabel="Back to Notices"
      />
    </>
  )
}