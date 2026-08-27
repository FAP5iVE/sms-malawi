'use client'

/**
 * apps/web/src/app/(public)/events/page.tsx
 * [CHANGE TYPE]: TARGETED EDIT
 * [PHASE]: N6 — Event disambiguation + public pagination fix (AUDIT Finding H)
 * [PURPOSE]: Was fetching a page of /public/announcements and filtering
 *   eventDate CLIENT-SIDE — so a page of 20 announcements could contain zero
 *   events, `total` counted all announcements (breaking page count), and some
 *   events were unreachable. Now reads the dedicated /public/events route
 *   (usePublicEvents), which filters by eventDate server-side, orders by
 *   eventDate, and returns a correct total.
 * [DEPENDS ON]: usePublicEvents (GET /public/events)
 */

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CalendarDays } from 'lucide-react'
import { usePublicEvents } from '@/hooks/usePublic'
import { PublicAmbientBackground } from '@/components/shared/PublicAmbientBackground'
import { PublicThemeToggle } from '@/components/shared/PublicThemeToggle'

const PAGE_SIZE = 20
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function EventsPage() {
  const [page, setPage] = useState(1)
  const { data, isLoading } = usePublicEvents(PAGE_SIZE, page)
  const events = data?.events ?? []
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div className="min-h-screen bg-page">
      <PublicAmbientBackground />
      <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center justify-between mb-6">
          <Link href="/#events" className="inline-flex items-center gap-2 text-sm text-brand-teal hover:underline">
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>
          <PublicThemeToggle />
        </div>
        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl tracking-tight text-brand-navy dark:text-white mb-2">
          School Events
        </h1>
        <p className="text-muted mb-8">Upcoming dates and events at our school.</p>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-surface animate-pulse" />)}
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-20 text-muted flex flex-col items-center gap-3">
            <CalendarDays className="w-10 h-10 text-muted/40" aria-hidden />
            No events have been scheduled yet.
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {events.map((ev) => {
                const d = new Date(ev.eventDate!)
                return (
                  <article key={ev.id} className="flex gap-5 border border-base rounded-2xl bg-surface p-5">
                    <div className="shrink-0 w-16 h-16 rounded-xl bg-brand-navy text-white flex flex-col items-center justify-center">
                      <span className="font-heading text-[10px] font-bold tracking-wide text-brand-teal-light">
                        {MONTHS[d.getMonth()]?.slice(0, 3).toUpperCase()}
                      </span>
                      <span className="font-heading text-xl font-extrabold leading-tight">{d.getDate()}</span>
                    </div>
                    <div>
                      <div className="text-xs text-muted mb-1">
                        {d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                      <h2 className="font-heading font-bold text-lg text-brand-navy dark:text-white mb-1.5">{ev.title}</h2>
                      <p className="text-sm text-muted leading-relaxed">{ev.body}</p>
                    </div>
                  </article>
                )
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-10">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-4 py-2 rounded-lg border border-base text-sm font-semibold disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-sm text-muted">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-4 py-2 rounded-lg border border-base text-sm font-semibold disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}