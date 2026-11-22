/**
 * apps/web/src/components/shared/PublicPostSeoLayout.tsx
 *
 * [PURPOSE]: Shared server-side SEO for the four public detail routes
 *   (/news/[id], /notices/[id], /events/[id], /academic-advertisements/[id]).
 *   Each route's layout.tsx is a thin wrapper around these two functions.
 *
 *   buildPostMetadata  -> <title>, description, canonical, og:image, and a
 *                         real 404 when the post is missing or unpublished.
 *   PublicPostLayout   -> JSON-LD (NewsArticle / Event) around the client page.
 */

import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPublicPostSeo, type PublicPostType } from '@/lib/publicPostSeo'
import { pageMetadata, SITE_NAME, SITE_URL } from '@/lib/site'

interface Opts {
  id: string
  postType: PublicPostType
  basePath: string
  fallbackTitle: string
  fallbackDescription: string
}

export async function buildPostMetadata({
  id, postType, basePath, fallbackTitle, fallbackDescription,
}: Opts): Promise<Metadata> {
  const post = await getPublicPostSeo(id, postType)

  // Missing or unpublished: send a real 404 instead of a 200 "unavailable" page.
  if (post === null) notFound()

  // Lookup failed (outage): keep the page working with generic metadata.
  if (post === 'unavailable') {
    return pageMetadata({
      title: fallbackTitle,
      description: fallbackDescription,
      path: `${basePath}/${id}`,
    })
  }

  return pageMetadata({
    title: post.title,
    description: post.description || fallbackDescription,
    path: `${basePath}/${id}`,
    image: post.imageUrl ?? undefined,
    type: postType === 'NEWS' ? 'article' : 'website',
  })
}

export async function PublicPostLayout({
  id, postType, basePath, children,
}: {
  id: string
  postType: PublicPostType
  basePath: string
  children: React.ReactNode
}) {
  const post = await getPublicPostSeo(id, postType)
  const url = `${SITE_URL}${basePath}/${id}`

  let jsonLd: Record<string, unknown> | null = null
  if (post && post !== 'unavailable') {
    const publisher = { '@id': `${SITE_URL}/#school` }
    if (postType === 'NEWS') {
      jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'NewsArticle',
        headline: post.title.slice(0, 110),
        description: post.description,
        datePublished: post.createdAt.toISOString(),
        mainEntityOfPage: url,
        ...(post.imageUrl ? { image: [post.imageUrl] } : {}),
        ...(post.authorName ? { author: { '@type': 'Person', name: post.authorName } } : {}),
        publisher,
      }
    } else if (postType === 'EVENT' && post.eventDate) {
      jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: post.title,
        description: post.description,
        startDate: post.eventDate.toISOString(),
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        url,
        ...(post.imageUrl ? { image: [post.imageUrl] } : {}),
        organizer: { '@type': 'Organization', name: SITE_NAME, ...publisher },
      }
    }
  }

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
        />
      )}
      {children}
    </>
  )
}
