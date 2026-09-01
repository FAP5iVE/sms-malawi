'use client'

/**
 * apps/web/src/app/(public)/leadership/page.tsx
 * [CHANGE TYPE]: NEW FILE (production fix, 2026-07-28)
 * [PURPOSE]: Discover -> Leadership destination. Lists the school's public
 *   leadership/management team (admin/hr/high_rank-curated via Settings ->
 *   School Identity — deliberately not real StaffProfile records; see
 *   SETTING_KEYS.SCHOOL_LEADERSHIP_TEAM's comment for why).
 * [DEPENDS ON]: usePublicLeadership (GET /public/leadership)
 */

import Link from 'next/link'
import { ArrowLeft, Users } from 'lucide-react'
import { usePublicLeadership } from '@/hooks/usePublic'
import { PublicAmbientBackground } from '@/components/shared/PublicAmbientBackground'
import { PublicThemeToggle } from '@/components/shared/PublicThemeToggle'

export default function LeadershipPage() {
  const { data, isLoading } = usePublicLeadership()
  const team = data?.team ?? []

  return (
    <div className="min-h-screen bg-page">
      <PublicAmbientBackground />
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center justify-between mb-6">
          <Link href="/#about" className="inline-flex items-center gap-2 text-sm text-brand-teal hover:underline">
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>
          <PublicThemeToggle />
        </div>
        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl tracking-tight text-brand-navy dark:text-white mb-2">
          School Leadership
        </h1>
        <p className="text-muted mb-10 max-w-2xl">
          The team responsible for the day-to-day running and long-term direction of the school.
        </p>

        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => <div key={i} className="h-48 rounded-2xl bg-surface animate-pulse" />)}
          </div>
        ) : team.length === 0 ? (
          <div className="text-center py-20 text-muted flex flex-col items-center gap-3">
            <Users className="w-10 h-10 text-muted/40" aria-hidden />
            Leadership team details have not been added yet.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...team].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((m) => (
              <div key={m.name} className="border border-base rounded-2xl bg-surface p-6">
                {m.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Appwrite-hosted photo, not a local Next asset
                  <img
                    src={m.photoUrl}
                    alt={m.name}
                    className="w-14 h-14 rounded-full object-cover mb-4"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-brand-navy/10 flex items-center justify-center mb-4">
                    <Users className="w-6 h-6 text-brand-navy" aria-hidden />
                  </div>
                )}
                <h3 className="font-heading font-bold text-lg text-brand-navy dark:text-white">{m.name}</h3>
                <p className="text-sm text-brand-teal font-semibold mb-3">{m.title}</p>
                {m.bio && <p className="text-sm text-muted leading-relaxed">{m.bio}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}