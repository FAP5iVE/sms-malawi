import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import { PublicHeader } from '@/components/shared/PublicHeader'
import { PublicPageLayout } from '@/components/shared/PublicPageLayout'

export const metadata: Metadata = {
  title: 'Page not found',
  description: 'The page you are looking for does not exist or has moved.',
  robots: { index: false, follow: true },
}

const LINKS = [
  { href: '/admissions', label: 'Admissions' },
  { href: '/news', label: 'News' },
  { href: '/events', label: 'Events' },
  { href: '/academics', label: 'Academics' },
  { href: '/login', label: 'Portal login' },
]

/**
 * [CHANGE TYPE]: LOOKS ONLY (Chikangawa Hills theme, Phase 6b, 2026-11-13).
 *   The page sits in <PublicPageLayout>: "Error 404", the title, the sentence,
 *   the Back to home button and the helpful links are the left column on the
 *   sky; the two recoloured illustrations sit on the content surface (white in
 *   the light theme, navy in the dark theme, which is what they were drawn for).
 *   Same words, same links, same two images and the same light/dark swap.
 */
export default function NotFound() {
  return (
    <div className="hills-type relative flex min-h-screen flex-col bg-page">
      {/* Outside the (public) route group, so it doesn't get the layout's
          header, render the same shared bar with an explicit title. */}
      <PublicHeader title="Page not found" />

      <PublicPageLayout
        contents={false}
        title="We can&apos;t find that page"
        above={<p className="hills-page__eyebrow">Error 404</p>}
        intro="The link may be out of date, or the page may have been removed. Try one of these instead."
        below={
          <>
            <Link href="/" className="hills-page__btn">
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back to home
            </Link>

            <nav aria-label="Helpful pages" className="hills-page__quick">
              {LINKS.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
            </nav>
          </>
        }
      >
        {/* Two recolored copies of the same illustration: the light one has
            tinted hills and clouds that stay visible on a white page, the
            dark one swaps the dark outlines for light ones. Plain <img>
            because next/image does not optimise SVG. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/404-light.svg"
          alt=""
          width={860}
          height={571}
          className="h-auto w-full dark:hidden"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/404-dark.svg"
          alt=""
          width={860}
          height={571}
          className="hidden h-auto w-full dark:block"
        />
      </PublicPageLayout>
    </div>
  )
}
