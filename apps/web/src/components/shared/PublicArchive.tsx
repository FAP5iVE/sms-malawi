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

/**
 * [FIX] `body` can now contain HTML written via RichTextEditor.tsx (bold,
 * lists, alignment, highlight — see AnnouncementForm.tsx). The list cards
 * below only ever show a plain, line-clamped excerpt, so tags need to be
 * stripped first — otherwise a bold News intro would show its literal
 * "<strong>...</strong>" markup instead of being bold, and block tags
 * (</p><p>) would run words together with no separating space.
 * A body with no HTML at all (every article written before this change)
 * passes through unchanged.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<(p|br|li|h[1-4]|blockquote)[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
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
                    <p className="text-sm text-muted leading-relaxed line-clamp-3">{stripHtml(a.body)}</p>
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
            {/* [NEW] Byline — bold, same line as the date, only rendered
                when the author filled it in. */}
            <div className="font-mono text-xs text-muted mb-3 flex flex-wrap items-center gap-x-2">
              <span>{formatArchiveDate(post.createdAt)}</span>
              {post.authorName && (
                <>
                  <span aria-hidden>·</span>
                  <span className="font-sans font-bold text-body">Written by: {post.authorName}</span>
                </>
              )}
            </div>
            <h1 className="font-heading font-extrabold text-2xl sm:text-3xl tracking-tight text-brand-navy dark:text-white mb-6">
              {post.title}
            </h1>
            {post.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- external Appwrite view URL
              <img src={post.imageUrl} alt="" className="w-full h-auto rounded-2xl border border-base mb-6" />
            )}
            {/* [FIX] post.body is HTML now (written via RichTextEditor.tsx),
                sanitized server-side on every write path in
                announcementService.ts / the editOwn route before it ever
                reaches Firestore — safe to render directly here. A
                plain-text body (every article written before this change)
                has no tags to interpret and renders exactly as before. */}
            <div
              className="text-body leading-relaxed whitespace-pre-wrap [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_mark]:bg-amber-200/70 [&_mark]:rounded-sm [&_mark]:px-0.5 [&_p]:my-2 [&_blockquote]:border-l-4 [&_blockquote]:border-brand-teal/40 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted [&_blockquote]:my-3 [&_a]:text-brand-teal [&_a]:underline [&_a]:underline-offset-2 [&_img]:rounded-xl [&_img]:border [&_img]:border-base [&_h2]:font-heading [&_h2]:font-bold [&_h2]:text-xl [&_h2]:mt-5 [&_h2]:mb-2 [&_h3]:font-heading [&_h3]:font-bold [&_h3]:text-lg [&_h3]:mt-4 [&_h3]:mb-2 [&_h4]:font-heading [&_h4]:font-bold [&_h4]:text-base [&_h4]:mt-3 [&_h4]:mb-1.5 after:content-[''] after:table after:clear-both"
              dangerouslySetInnerHTML={{ __html: post.body }}
            />
          </article>
        )}
      </div>
    </div>
  )
}