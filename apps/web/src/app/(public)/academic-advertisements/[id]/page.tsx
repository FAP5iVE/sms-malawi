'use client'

/**
 * apps/web/src/app/(public)/academic-advertisements/[id]/page.tsx
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: The full advertisement/circular — only reachable via "Read
 *   more" from /academic-advertisements. GET
 *   /public/academic-advertisements/:id is postType-scoped server-side, so
 *   this URL can never resolve a News article or a plain Announcement.
 * [DEPENDS ON]: usePublicPost('academic-advertisements', id)
 */

import { useParams } from 'next/navigation'
import { usePublicPost } from '@/hooks/usePublic'
import { PublicArchiveDetail } from '@/components/shared/PublicArchive'
import { PublicAmbientBackground } from '@/components/shared/PublicAmbientBackground'

export default function AcademicAdvertisementDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading } = usePublicPost('academic-advertisements', id)

  return (
    <>
      <PublicAmbientBackground />
      <PublicArchiveDetail
        post={data}
        isLoading={isLoading}
        notFoundText="This advertisement is unavailable or has been unpublished."
        backHref="/academic-advertisements"
        backLabel="Back to Academic Advertisements"
      />
    </>
  )
}