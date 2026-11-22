import type { MetadataRoute } from 'next'
import { PAGE_ACCESS } from '@shared/constants/pageAccess'
import { SITE_URL } from '@/lib/site'

// No trailing slash, so both "/students" and "/students/123" are blocked.
// The portal pages are everything in PAGE_ACCESS (the same list the login
// proxy protects), so a new private page is covered here automatically.
// The password pages carry a noindex meta tag instead of a Disallow, because
// a crawler that is blocked from fetching a page can never see its noindex.
const PORTAL_PATHS = Object.keys(PAGE_ACCESS)

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', ...PORTAL_PATHS],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
