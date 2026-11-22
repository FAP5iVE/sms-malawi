/**
 * apps/web/src/lib/site.ts
 *
 * [PURPOSE]: One source for site-wide SEO constants and the metadata helper
 *   every public route segment uses. Safe to import from server components,
 *   route handlers, sitemap.ts and robots.ts (no server-only imports).
 *
 * [CONFIG]: Set these in Vercel (Project Settings -> Environment Variables):
 *   NEXT_PUBLIC_APP_URL                 canonical origin, e.g. https://www.yourschool.edu.mw
 *   NEXT_PUBLIC_SITE_NAME               brand shown in tab titles (default "SMS Malawi")
 *   NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION  token from Google Search Console
 */
import type { Metadata } from 'next'

function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return explicit.replace(/\/+$/, '')
  // Vercel injects the production domain at build time, so previews and a
  // future custom domain are picked up without a code change.
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (vercel) return `https://${vercel}`
  return 'https://sms-malawi.vercel.app'
}

export const SITE_URL = resolveSiteUrl()
export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || 'SMS Malawi'
export const SITE_TAGLINE = 'Secondary school in Malawi'
export const SITE_DESCRIPTION =
  'Admissions, MANEB results, news, events and the student and staff portal for a Malawian secondary school.'
export const DEFAULT_OG_IMAGE = '/images/og-default.png'
export const BRAND_NAVY = '#0B1D33'

/** Public paths that are indexed. Shared by sitemap.ts, robots.ts and llms.txt. */
export const PUBLIC_PAGES: ReadonlyArray<{
  path: string
  priority: number
  changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
}> = [
  { path: '/',                        priority: 1.0, changeFrequency: 'weekly'  },
  { path: '/admissions',              priority: 0.9, changeFrequency: 'monthly' },
  { path: '/apply',                   priority: 0.9, changeFrequency: 'monthly' },
  { path: '/academics',               priority: 0.8, changeFrequency: 'monthly' },
  { path: '/student-life',            priority: 0.7, changeFrequency: 'monthly' },
  { path: '/leadership',              priority: 0.6, changeFrequency: 'monthly' },
  { path: '/placement-results',       priority: 0.7, changeFrequency: 'yearly'  },
  { path: '/news',                    priority: 0.8, changeFrequency: 'daily'   },
  { path: '/notices',                 priority: 0.7, changeFrequency: 'daily'   },
  { path: '/events',                  priority: 0.7, changeFrequency: 'weekly'  },
  { path: '/academic-advertisements', priority: 0.7, changeFrequency: 'weekly'  },
  { path: '/gallery',                 priority: 0.5, changeFrequency: 'weekly'  },
  { path: '/privacy',                 priority: 0.3, changeFrequency: 'yearly'  },
  { path: '/terms',                   priority: 0.3, changeFrequency: 'yearly'  },
]

interface PageMetaInput {
  /** Short page title. The root template appends " | SMS Malawi". */
  title: string
  description: string
  /** Absolute path starting with "/", used for the canonical and og:url. */
  path: string
  /** Absolute or site-relative image URL. Defaults to the site share image. */
  image?: string
  /** Keep the page out of search results (login, password reset, 404). */
  noindex?: boolean
  type?: 'website' | 'article'
  /** True when `title` is already complete and must not get the " | SMS Malawi" suffix. */
  absoluteTitle?: boolean
}

/**
 * Builds a complete Metadata object. openGraph and twitter are repeated in
 * full on purpose: Next.js shallow-merges metadata, so a child that sets only
 * `openGraph.title` would silently drop the parent's image and site name.
 */
export function pageMetadata({
  title,
  description,
  path,
  image = DEFAULT_OG_IMAGE,
  noindex = false,
  type = 'website',
  absoluteTitle = false,
}: PageMetaInput): Metadata {
  const fullTitle = absoluteTitle ? title : `${title} | ${SITE_NAME}`
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    robots: noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      type,
      siteName: SITE_NAME,
      title: fullTitle,
      description,
      url: path,
      locale: 'en_MW',
      images: [{ url: image, width: 1200, height: 630, alt: fullTitle }],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
      images: [image],
    },
  }
}

/** Strips tags and collapses whitespace so rich-text bodies make clean descriptions. */
export function toPlainText(html: string, max = 155): string {
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`
}
