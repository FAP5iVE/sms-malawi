import type { Metadata } from 'next'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { CookieNotice } from '@/components/shared/CookieNotice'
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
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-page">
      <SchoolJsonLd />
      <ErrorBoundary>{children}</ErrorBoundary>
      <CookieNotice />
    </div>
  )
}
