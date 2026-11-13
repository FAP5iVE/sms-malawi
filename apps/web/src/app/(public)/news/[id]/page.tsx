'use client'

/**
 * apps/web/src/app/(public)/news/[id]/page.tsx
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: The full news article, only reachable via a "Read more" link
 *   from /news. Pressing Back returns to that same list, never expands
 *   inline. GET /public/news/:id is postType-scoped server-side, so this
 *   URL can never resolve an announcement or an ad even if the id is
 *   guessed.
 * [DEPENDS ON]: usePublicPost('news', id)
 *
 * [CHANGE TYPE]: LOOKS ONLY (Chikangawa Hills theme, Phase 6b, 2026-11-13).
 *   The sky background is now drawn by <PublicPageLayout> inside the shared
 *   PublicArchive view, so this page no longer renders its own.
 */

import { useParams } from 'next/navigation'
import { usePublicPost } from '@/hooks/usePublic'
import { PublicArchiveDetail } from '@/components/shared/PublicArchive'

export default function NewsDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading } = usePublicPost('news', id)

  return (
    <PublicArchiveDetail
      post={data}
      isLoading={isLoading}
      notFoundText="This article is unavailable or has been unpublished."
      backHref="/news"
      backLabel="Back to News"
    />
  )
}