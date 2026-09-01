'use client'

/**
 * apps/web/src/app/(public)/academic-advertisements/page.tsx
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: [PRODUCTION FIX] Academic Advertisements is now a genuinely
 *   standalone public section — its own postType (ADVERTISEMENT), its own
 *   /public/academic-advertisements feed, its own archive + detail pages.
 *   Previously the homepage's "Academic Advertisements" section (calls for
 *   applications, intake notices, examination circulars) was just another
 *   slice of the same /public/announcements feed as News, linking to
 *   /news — there was no real ads system at all. Same collapsed-card +
 *   "Read more" + detail-page pattern as /news and /announcements.
 * [DEPENDS ON]: usePublicAdverts (GET /public/academic-advertisements)
 */

import { useState } from 'react'
import { Landmark } from 'lucide-react'
import { usePublicAdverts } from '@/hooks/usePublic'
import { PublicArchiveList } from '@/components/shared/PublicArchive'
import { PublicAmbientBackground } from '@/components/shared/PublicAmbientBackground'
import { PublicThemeToggle } from '@/components/shared/PublicThemeToggle'

const PAGE_SIZE = 12

export default function AcademicAdvertisementsPage() {
  const [page, setPage] = useState(1)
  const { data, isLoading } = usePublicAdverts(PAGE_SIZE, page)
  const items = data?.adverts ?? []
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <>
      <PublicAmbientBackground />
      <PublicArchiveList
        title="Academic Advertisements"
        subtitle="Calls for applications, intake notices and examination circulars, published as they are issued."
        basePath="/academic-advertisements"
        backHref="/#ads"
        items={items}
        isLoading={isLoading}
        emptyIcon={Landmark}
        emptyText="No academic advertisements have been published yet."
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        headerRight={<PublicThemeToggle />}
      />
    </>
  )
}