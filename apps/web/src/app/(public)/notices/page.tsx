'use client'

/**
 * apps/web/src/app/(public)/notices/page.tsx
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: [PRODUCTION FIX] General public Announcements archive —
 *   postType ANNOUNCEMENT only (via usePublicAnnouncements / GET
 *   /public/announcements), now genuinely separate from News (postType
 *   NEWS) and Academic Advertisements (postType ADVERTISEMENT), which
 *   previously all shared this one feed with no distinction. Same
 *   collapsed-card + "Read more" + detail-page pattern as /news.
 *
 *   [ROUTING NOTE] Lives at /notices, not /announcements — the (auth)
 *   route group's internal /announcements management page already owns
 *   that URL, and Next.js route groups don't affect the URL path, so
 *   /(auth)/announcements and /(public)/announcements would collide
 *   ("You cannot have two parallel pages that resolve to the same path").
 *   The underlying API path (GET /public/announcements) is unaffected —
 *   that's a separate Express router, not a Next.js page route.
 * [DEPENDS ON]: usePublicAnnouncements (GET /public/announcements)
 */

import { useState } from 'react'
import { Bell } from 'lucide-react'
import { usePublicAnnouncements } from '@/hooks/usePublic'
import { PublicArchiveList } from '@/components/shared/PublicArchive'
import { PublicAmbientBackground } from '@/components/shared/PublicAmbientBackground'
import { PublicThemeToggle } from '@/components/shared/PublicThemeToggle'

const PAGE_SIZE = 12

export default function AnnouncementsArchivePage() {
  const [page, setPage] = useState(1)
  const { data, isLoading } = usePublicAnnouncements(PAGE_SIZE, page)
  const items = data?.announcements ?? []
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <>
      <PublicAmbientBackground />
      <PublicArchiveList
        title="Announcements"
        subtitle="General notices from the school — separate from News and Academic Advertisements."
        basePath="/notices"
        backHref="/#announcements"
        items={items}
        isLoading={isLoading}
        emptyIcon={Bell}
        emptyText="No announcements have been published yet."
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        headerRight={<PublicThemeToggle />}
      />
    </>
  )
}