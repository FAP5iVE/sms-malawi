import type { MetadataRoute } from 'next'
import { PUBLIC_PAGES, SITE_URL } from '@/lib/site'
import { listPublicPostRefs } from '@/lib/publicPostSeo'

// Rebuilt hourly so newly published posts appear without a redeploy.
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticEntries: MetadataRoute.Sitemap = PUBLIC_PAGES.map((p) => ({
    url: `${SITE_URL}${p.path === '/' ? '' : p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }))

  // Detail pages. If Firestore is unreachable these come back empty and the
  // sitemap still lists every static page.
  const [news, notices, events, ads] = await Promise.all([
    listPublicPostRefs('NEWS'),
    listPublicPostRefs('ANNOUNCEMENT'),
    listPublicPostRefs('EVENT'),
    listPublicPostRefs('ADVERTISEMENT'),
  ])

  const detail = (base: string, refs: Array<{ id: string; lastModified: Date }>): MetadataRoute.Sitemap =>
    refs.map((r) => ({
      url: `${SITE_URL}${base}/${r.id}`,
      lastModified: r.lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }))

  return [
    ...staticEntries,
    ...detail('/news', news),
    ...detail('/notices', notices),
    ...detail('/events', events),
    ...detail('/academic-advertisements', ads),
  ]
}
