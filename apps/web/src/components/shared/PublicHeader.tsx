'use client'

/**
 * apps/web/src/components/shared/PublicHeader.tsx
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: The one top bar shared by every public page, modelled on the bar
 *   the Student Application page already had: a Home link on the left, a
 *   divider, a small initial badge + the PAGE TITLE, and the theme toggle
 *   pinned to the far right.
 *
 *   Before this, each public page hand-rolled its own variation (a "Back to
 *   home" text row on most pages, a solid bar on /apply, /privacy and /terms,
 *   loose floating chips on /login and /forgot-password, nothing at all on the
 *   sign-in family's other pages), so the Home and theme controls jumped around
 *   from page to page. Rendering ONE header from (public)/layout.tsx fixes that
 *   for every current page and for any public page added later.
 *
 * [HOW THE TITLE IS CHOSEN]: Looked up from the current pathname in
 *   ROUTE_TITLES below (detail pages such as /news/[id] share their list's
 *   title). A page outside the (public) route group, such as app/not-found.tsx,
 *   can pass `title` directly. The landing page ("/") deliberately renders no
 *   bar, it has its own full navigation and its own theme toggle.
 *
 * [TWO LOOKS, ONE COMPONENT]:
 *   - solid (default): `bg-surface` + hairline border, the look from the
 *     Student Application screenshot, used by all content pages.
 *   - glass: used by the sign-in family (login, forgot / change / reset
 *     password). Those pages are built from frosted-glass cards over the
 *     vivid ambient artwork, so their bar is a frosted strip too, still
 *     opaque enough to read, but in the same visual language as the cards.
 *
 * [DEPENDS ON]: PublicThemeToggle (the theme dropdown)
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { PublicThemeToggle } from '@/components/shared/PublicThemeToggle'

/** First matching prefix wins. Keep specific routes before general ones. */
const ROUTE_TITLES: ReadonlyArray<readonly [prefix: string, title: string]> = [
  ['/login', 'Portal Login'],
  ['/forgot-password', 'Forgot Password'],
  ['/change-password', 'Change Password'],
  ['/reset-password', 'Reset Password'],
  ['/apply', 'Student Application'],
  ['/admissions', 'Admissions'],
  ['/academics', 'Academics'],
  ['/student-life', 'Student Life'],
  ['/leadership', 'School Leadership'],
  ['/gallery', 'Gallery'],
  ['/news', 'News'],
  ['/notices', 'Announcements'],
  ['/events', 'Events'],
  ['/academic-advertisements', 'Academic Advertisements'],
  ['/placement-results', 'University Placements'],
  ['/privacy', 'Privacy Policy'],
  ['/terms', 'Terms of Use'],
]

/** Pages built from frosted-glass cards get the frosted bar. */
const GLASS_PREFIXES = ['/login', '/forgot-password', '/change-password', '/reset-password'] as const

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

interface PublicHeaderProps {
  /** Overrides the pathname lookup, for pages outside the (public) group. */
  title?: string
}

export function PublicHeader({ title }: PublicHeaderProps) {
  const pathname = usePathname() ?? ''

  const resolvedTitle = title ?? ROUTE_TITLES.find(([prefix]) => matchesPrefix(pathname, prefix))?.[1]

  // No title means this is the landing page (own navigation) or a route this
  // map doesn't know about, a nameless bar would be worse than none.
  if (!resolvedTitle) return null

  const glass = GLASS_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))

  return (
    <header
      className={[
        'sticky top-0 z-30 border-b print:hidden',
        glass
          ? 'border-black/5 bg-white/70 backdrop-blur-xl dark:border-white/10 dark:bg-[hsl(var(--background)/0.6)]'
          : 'border-base bg-surface',
      ].join(' ')}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 sm:gap-4 sm:px-6">
        <Link
          href="/"
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm text-muted transition-colors hover:text-body"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Home
        </Link>

        <div className="h-4 w-px shrink-0 bg-border" aria-hidden />

        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-deep"
            aria-hidden
          >
            <span className="font-heading text-xs font-bold text-white">
              {resolvedTitle.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="truncate font-heading text-sm font-semibold text-primary">{resolvedTitle}</span>
        </div>

        <PublicThemeToggle className="ml-auto" />
      </div>
    </header>
  )
}
