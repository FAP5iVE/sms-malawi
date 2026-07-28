'use client'

/**
 * apps/web/src/app/(public)/news/page.tsx
 * [CHANGE TYPE]: NEW FILE (production fix, 2026-07-28)
 * [PURPOSE]: Full news/announcements archive. The landing page's "All News"
 *   and "More Announcements" buttons link here — both draw from the same
 *   real usePublicAnnouncements() feed (see page.tsx's file header for why
 *   there is only one real content source), filtered to items without an
 *   eventDate (dated ones are Events, at /events).
 * [DEPENDS ON]: usePublicAnnouncements (GET /public/announcements)
 */

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Newspaper } from 'lucide-react'
import { usePublicAnnouncements } from '@/hooks/usePublic'

const PAGE_SIZE = 12

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function NewsPage() {
  const [page, setPage] = useState(1)
  const { data, isLoading } = usePublicAnnouncements(PAGE_SIZE, page)
  const allItems = data?.announcements ?? []
  const newsItems = allItems.filter((a) => !a.eventDate)
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

  return (
    <div className="min-h-screen bg-page">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Link href="/#news" className="inline-flex items-center gap-2 text-sm text-brand-teal hover:underline mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to home
        </Link>
        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl tracking-tight text-brand-navy dark:text-white mb-2">
          News &amp; Announcements
        </h1>
        <p className="text-muted mb-8">All published news and academic advertisements from the school.</p>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-32 rounded-xl bg-surface animate-pulse" />)}
          </div>
        ) : newsItems.length === 0 ? (
          <div className="text-center py-20 text-muted flex flex-col items-center gap-3">
            <Newspaper className="w-10 h-10 text-muted/40" aria-hidden />
            No announcements have been published yet.
          </div>
        ) : (
          <>
            <div className="space-y-5">
              {newsItems.map((a) => (
                <article key={a.id} className="border border-base rounded-2xl overflow-hidden bg-surface sm:flex">
                  {a.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- external Appwrite view URL
                    <img src={a.imageUrl} alt="" className="sm:w-56 h-40 sm:h-auto object-cover shrink-0" />
                  ) : null}
                  <div className="p-6">
                    <div className="font-mono text-xs text-muted mb-2">{formatDate(a.createdAt)}</div>
                    <h2 className="font-heading font-bold text-xl text-brand-navy dark:text-white mb-2">{a.title}</h2>
                    <p className="text-sm text-muted leading-relaxed">{a.body}</p>
                  </div>
                </article>
              ))}
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