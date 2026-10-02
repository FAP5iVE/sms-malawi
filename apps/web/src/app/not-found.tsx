import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowLeft } from 'lucide-react'

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
    <main className="min-h-screen bg-page flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-md text-center">
        <p className="font-heading text-[11px] font-bold uppercase tracking-widest text-brand-teal mb-3">
          Error 404
        </p>
        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl tracking-tight text-brand-navy dark:text-white mb-3">
          We can&apos;t find that page
        </h1>
        <p className="text-muted leading-relaxed mb-8">
          The link may be out of date, or the page may have been removed. Try one of these instead.
        </p>

        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-navy px-6 font-heading text-sm font-bold text-white transition-colors hover:bg-brand-navy-mid"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden /> Back to home
        </Link>

        <nav aria-label="Helpful pages" className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-brand-teal underline-offset-2 hover:underline">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </main>
  )
}
