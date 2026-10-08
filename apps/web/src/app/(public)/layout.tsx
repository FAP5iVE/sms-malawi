import type { Metadata } from 'next'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { CookieNotice } from '@/components/shared/CookieNotice'
import { PublicHeader } from '@/components/shared/PublicHeader'
import { SchoolJsonLd } from '@/components/shared/SchoolJsonLd'
import { pageMetadata, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from '@/lib/site'

// Home page metadata. Every other public route sets its own in a sibling
// layout.tsx, so this canonical applies to "/" only.
export const metadata: Metadata = pageMetadata({
  title: `${SITE_NAME} | ${SITE_TAGLINE}`,
  absoluteTitle: true,
  description: SITE_DESCRIPTION,
  path: '/',
})

// Structured data reads cached settings; refresh it hourly.
export const revalidate = 3600

// [R15 fix] ErrorBoundary previously wrapped only the authenticated shell
// ((auth)/layout.tsx), a render-time throw on any public page (home,
// admissions, apply, news, gallery, events) still unmounted the entire tree
// down to the bare <body> background, the exact [FE-003] failure mode this
// component exists to prevent, on the pages a prospective parent sees first.
//
// [PUBLIC HEADER] <PublicHeader /> renders the shared top bar (Home, page
// title, theme toggle) for every public page except the landing page, which
// has its own navigation; see PublicHeader.tsx. It sits OUTSIDE the
// ErrorBoundary so a render-time throw inside a page still leaves the visitor
// a way home. The wrapper is a flex column so each page's root can simply
// `flex-1` to fill the space BELOW the bar, pages must not use `min-h-screen`
// themselves any more or they would overflow the viewport by the bar's height.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <SchoolJsonLd />
      <PublicHeader />
      <div className="flex flex-1 flex-col">
        <ErrorBoundary>{children}</ErrorBoundary>
      </div>
      <CookieNotice />
    </div>
  )
}
