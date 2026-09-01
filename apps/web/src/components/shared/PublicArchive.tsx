'use client'

/**
 * apps/web/src/components/shared/PublicArchive.tsx
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Shared presentation for the public News, Announcements, and
 *   Academic Advertisements archive + detail pages — three genuinely
 *   separate postType feeds (see server/routes/public.ts) that otherwise
 *   render identically: a collapsed list of cards (title + date + a
 *   3-line-clamped excerpt) with a "Read more" link that goes to a real
 *   full-page detail view, and a Back link from the detail page that
 *   returns to the list. Modeled on how mubas.ac.mw's own News/
 *   Announcements/Events sections behave — a snippet card that expands only
 *   on its own page, never inline.
 * [DEPENDS ON]: apps/web/src/hooks/usePublic.ts (PublicAnnouncement shape)
 */

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { PublicAnnouncement } from '@/hooks/usePublic'

export function formatArchiveDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

interface ListProps {
  title: string
  subtitle: string
  basePath: string
  backHref: string
  items: PublicAnnouncement[]
  isLoading: boolean
  emptyIcon: LucideIcon
  emptyText: string
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  /** Optional right-aligned header slot (e.g. PublicThemeToggle), rendered
   *  alongside the Back link — avoids every caller re-implementing the
   *  same flex header row. */
  headerRight?: ReactNode
}

/** Collapsed cards — a 3-line excerpt with "Read more", never the full
 *  body. Only the detail page (PublicArchiveDetail below) shows the whole
 *  thing. */
export function PublicArchiveList({
  title, subtitle, basePath, backHref, items, isLoading, emptyIcon: EmptyIcon, emptyText,
  page, totalPages, onPageChange, headerRight,
}: ListProps) {
  return (
    <div className="min-h-screen bg-page">
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center justify-between mb-6">
          <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-brand-teal hover:underline">
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>
          {headerRight}
        </div>
        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl tracking-tight text-brand-navy dark:text-white mb-2">
          {title}
        </h1>
        <p className="text-muted mb-8">{subtitle}</p>

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => <div key={i} className="h-32 rounded-xl bg-surface animate-pulse" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-muted flex flex-col items-center gap-3">
            <EmptyIcon className="w-10 h-10 text-muted/40" aria-hidden />
            {emptyText}
          </div>
        ) : (
          <>
            <div className="space-y-5">
              {items.map((a) => (
                <article key={a.id} className="border border-base rounded-2xl overflow-hidden bg-surface sm:flex">
                  {a.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- external Appwrite view URL
                    <img src={a.imageUrl} alt="" className="sm:w-56 h-40 sm:h-auto object-cover shrink-0" />
                  ) : null}
                  <div className="p-6 min-w-0">
                    <div className="font-mono text-xs text-muted mb-2">{formatArchiveDate(a.createdAt)}</div>
                    <h2 className="font-heading font-bold text-xl text-brand-navy dark:text-white mb-2">{a.title}</h2>
                    {/* [PRODUCTION FIX] Collapsed with a 3-line clamp — the
                        full body only ever shows on the detail page below,
                        never inline in the list. */}
                    <p className="text-sm text-muted leading-relaxed line-clamp-3">{a.body}</p>
                    <Link
                      href={`${basePath}/${a.id}`}
                      className="inline-block mt-3 text-sm font-heading font-bold text-brand-teal hover:underline"
                    >
                      Read more →
                    </Link>
                  </div>
                </article>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-10">
                <button
                  onClick={() => onPageChange(Math.max(1, page - 1))}
                  disabled={page <= 1}
                  className="px-4 py-2 rounded-lg border border-base text-sm font-semibold disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-sm text-muted">Page {page} of {totalPages}</span>
                <button
                  onClick={() => onPageChange(Math.min(totalPages, page + 1))}
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

interface DetailProps {
  post: PublicAnnouncement | undefined
  isLoading: boolean
  notFoundText: string
  backHref: string
  backLabel: string
}

/** The full, un-truncated post — only reachable via a list's "Read more"
 *  link. Back always returns to that same list. */
export function PublicArchiveDetail({ post, isLoading, notFoundText, backHref, backLabel }: DetailProps) {
  return (
    <div className="min-h-screen bg-page">
      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-brand-teal hover:underline mb-6">
          <ArrowLeft className="w-4 h-4" /> {backLabel}
        </Link>

        {isLoading ? (
          <div className="space-y-4">
            <div className="h-8 w-2/3 rounded bg-surface animate-pulse" />
            <div className="h-56 rounded-xl bg-surface animate-pulse" />
            <div className="h-4 rounded bg-surface animate-pulse" />
            <div className="h-4 rounded bg-surface animate-pulse" />
          </div>
        ) : !post ? (
          <div className="text-center py-20 text-muted">{notFoundText}</div>
        ) : (
          <article>
            <div className="font-mono text-xs text-muted mb-3">{formatArchiveDate(post.createdAt)}</div>
            <h1 className="font-heading font-extrabold text-2xl sm:text-3xl tracking-tight text-brand-navy dark:text-white mb-6">
              {post.title}
            </h1>
            {post.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- external Appwrite view URL
              <img src={post.imageUrl} alt="" className="w-full h-auto rounded-2xl border border-base mb-6" />
            )}
            <div className="text-body leading-relaxed whitespace-pre-wrap">{post.body}</div>
          </article>
        )}
      </div>
    </div>
  )
}