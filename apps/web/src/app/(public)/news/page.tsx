'use client'

/**
 * apps/web/src/app/(public)/news/page.tsx
 * [CHANGE TYPE]: MAJOR REWRITE
 * [PURPOSE]: [PRODUCTION FIX] Real news archive — postType NEWS only (via
 *   usePublicNews / GET /public/news), no longer a client-side
 *   `!a.eventDate` slice of the general /public/announcements feed shared
 *   with plain announcements. Cards are now collapsed (3-line excerpt) with
 *   a "Read more" link to a real detail page (/news/[id]) instead of
 *   showing the full body inline — clicking through and pressing Back
 *   returns to this same list. See PublicArchiveList/PublicArchiveDetail in
 *   components/shared/PublicArchive.tsx, shared with the /announcements and
 *   /academic-advertisements archives.
 * [DEPENDS ON]: usePublicNews (GET /public/news)
 */

import { useState } from 'react'
import { Newspaper } from 'lucide-react'
import { usePublicNews } from '@/hooks/usePublic'
import { PublicArchiveList } from '@/components/shared/PublicArchive'
import { PublicAmbientBackground } from '@/components/shared/PublicAmbientBackground'
import { PublicThemeToggle } from '@/components/shared/PublicThemeToggle'

const PAGE_SIZE = 12

export default function NewsPage() {
  const [page, setPage] = useState(1)
  const { data, isLoading } = usePublicNews(PAGE_SIZE, page)
  const items = data?.news ?? []
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <>
      <PublicAmbientBackground />
      <PublicArchiveList
        title="Latest News"
        subtitle="News and stories from around the school."
        basePath="/news"
        backHref="/#news"
        items={items}
        isLoading={isLoading}
        emptyIcon={Newspaper}
        emptyText="No news articles have been published yet."
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        headerRight={<PublicThemeToggle />}
      />
    </>
  )
}