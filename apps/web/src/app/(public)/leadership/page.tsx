'use client'

/**
 * apps/web/src/app/(public)/leadership/page.tsx
 * [CHANGE TYPE]: MAJOR REWRITE (card redesign)
 * [PURPOSE]: Discover -> Leadership destination. Lists the school's public
 *   leadership/management team (admin/hr/high_rank-curated via Settings ->
 *   School Identity, deliberately not real StaffProfile records; see
 *   SETTING_KEYS.SCHOOL_LEADERSHIP_TEAM's comment for why).
 *   Card layout: full-bleed photo covering a uniform top area (same size
 *   whether or not a member has a photo set), then name, title, bio,
 *   matching the reference design exactly. No skills/rating bars, that
 *   part of the reference sketch was an artifact of the found template,
 *   not real data this app has (LeadershipMember only has name/title/
 *   bio/photoKey/order).
 * [DEPENDS ON]: usePublicLeadership (GET /public/leadership)
 *
 * [CHANGE TYPE]: LOOKS ONLY (Chikangawa Hills theme, Phase 6a, 2026-11-12).
 *   The page now sits in <PublicPageLayout wide surface={false}>: the member
 *   cards keep their own rounded frames, the grid fills the wider column with
 *   auto-fill instead of viewport breakpoints, and the empty state gets its own
 *   opaque panel. Data, ordering and photos are unchanged.
 */

import { Users } from 'lucide-react'
import { usePublicLeadership } from '@/hooks/usePublic'
import { PublicPageLayout } from '@/components/shared/PublicPageLayout'

export default function LeadershipPage() {
  const { data, isLoading } = usePublicLeadership()
  const team = data?.team ?? []

  return (
    <PublicPageLayout
      wide
      surface={false}
      title="School Leadership"
      intro="The team responsible for the day-to-day running and long-term direction of the school."
    >
      {isLoading ? (
        <div className="hills-page__cards">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-80 rounded-2xl bg-surface animate-pulse" />)}
        </div>
      ) : team.length === 0 ? (
        <div className="hills-page__empty text-center py-20 text-muted flex flex-col items-center gap-3">
          <Users className="w-10 h-10 text-muted/40" aria-hidden />
          Leadership team details have not been added yet.
        </div>
      ) : (
        <div className="hills-page__cards">
          {[...team].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((m) => (
            <div
              key={m.name}
              className="flex flex-col overflow-hidden rounded-2xl border border-base bg-surface"
            >
              {/* Photo covers the same-size area on every card, whether or
               *  not this member has one set, so the row of cards stays
               *  visually uniform (matches the reference design). */}
              {m.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- R2-hosted photo, not a local Next asset
                <img
                  src={m.photoUrl}
                  alt={m.name}
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center bg-brand-navy/10">
                  <Users className="w-12 h-12 text-brand-navy/40" aria-hidden />
                </div>
              )}
              <div className="flex flex-col gap-1 p-5">
                <h3 className="font-heading font-bold text-lg text-brand-navy dark:text-white">{m.name}</h3>
                <p className="hills-page__accent text-sm font-semibold">{m.title}</p>
                {m.bio && <p className="mt-2 text-sm text-muted leading-relaxed">{m.bio}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </PublicPageLayout>
  )
}