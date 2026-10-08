import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'
import { PublicAmbientBackground } from '@/components/shared/PublicAmbientBackground'
import { PublicHeader } from '@/components/shared/PublicHeader'

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

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col bg-page">
      <PublicAmbientBackground />

      {/* Outside the (public) route group, so it doesn't get the layout's
          header, render the same shared bar with an explicit title. */}
      <PublicHeader title="Page not found" />

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
        {/* Stacked on phones (picture first), side by side from lg. */}
        <div className="flex flex-1 flex-col items-center justify-center gap-8 py-10 lg:flex-row lg:gap-16">
          <div className="w-full max-w-md shrink-0 lg:order-2 lg:max-w-xl lg:flex-1">
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
          </div>

          <div className="w-full max-w-md text-center lg:order-1 lg:max-w-lg lg:text-left">
            <p className="mb-3 font-heading text-[11px] font-bold uppercase tracking-widest text-brand-teal">
              Error 404
            </p>
            <h1 className="mb-3 font-heading text-3xl font-extrabold tracking-tight text-brand-navy sm:text-4xl dark:text-white">
              We can&apos;t find that page
            </h1>
            <p className="mb-8 leading-relaxed text-muted">
              The link may be out of date, or the page may have been removed. Try one of these instead.
            </p>

            <Link
              href="/"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-deep px-6 font-heading text-sm font-bold text-white transition-colors hover:brightness-125"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Back to home
            </Link>

            <nav
              aria-label="Helpful pages"
              className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm lg:justify-start"
            >
              {LINKS.map((l) => (
                <Link key={l.href} href={l.href} className="text-brand-teal underline-offset-2 hover:underline">
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </main>
    </div>
  )
}
