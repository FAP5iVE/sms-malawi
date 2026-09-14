'use client'

/**
 * apps/web/src/app/(public)/gallery/page.tsx
 * [CHANGE TYPE]: MAJOR REWRITE (hierarchical grid + full-size viewer)
 * [PURPOSE]: Full gallery browsing page. The landing page's "Life at our
 *   school" strip shows 5 photos and links here for everything else.
 *   Photos now render in the shared hierarchical/bento grid (same one the
 *   landing strip uses) instead of a flat uniform grid, and every photo
 *   opens full size in the shared lightbox on click.
 * [DEPENDS ON]: usePublicGallery (GET /public/gallery)
 */

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ImageIcon } from 'lucide-react'
import { usePublicGallery } from '@/hooks/usePublic'
import { PublicAmbientBackground } from '@/components/shared/PublicAmbientBackground'
import { PublicThemeToggle } from '@/components/shared/PublicThemeToggle'
import { HierarchicalPhotoGrid } from '@/components/shared/HierarchicalPhotoGrid'
import { PhotoLightbox } from '@/components/shared/PhotoLightbox'

const PAGE_SIZE = 24

export default function GalleryPage() {
  const [page, setPage] = useState(1)
  const { data, isLoading } = usePublicGallery(PAGE_SIZE, page)
  const photos = data?.photos ?? []
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  // Which photo (index into the *current page's* `photos`) is open
  // full-size, if any. Closed explicitly on pagination below, rather than
  // left open pointing at a now-different photo once the page changes.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const lightboxPhotos = photos.map((p) => ({
    id: p.id,
    url: p.url,
    alt: p.caption ?? p.category ?? 'School photo',
    caption: p.caption,
    category: p.category,
  }))

  return (
    <div className="min-h-screen bg-page">
      <PublicAmbientBackground />
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center justify-between mb-6">
          <Link href="/#gallery" className="inline-flex items-center gap-2 text-sm text-brand-teal hover:underline">
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>
          <PublicThemeToggle />
        </div>
        <h1 className="font-heading font-extrabold text-3xl sm:text-4xl tracking-tight text-brand-navy dark:text-white mb-2">
          School Gallery
        </h1>
        <p className="text-muted mb-8">Moments from life at our school.</p>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-xl bg-surface animate-pulse" />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center py-20 text-muted flex flex-col items-center gap-3">
            <ImageIcon className="w-10 h-10 text-muted/40" aria-hidden />
            No photos have been added to the gallery yet.
          </div>
        ) : (
          <>
            <HierarchicalPhotoGrid photos={lightboxPhotos} onPhotoClick={setLightboxIndex} />

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-10">
                <button
                  onClick={() => { setPage((p) => Math.max(1, p - 1)); setLightboxIndex(null) }}
                  disabled={page <= 1}
                  className="px-4 py-2 rounded-lg border border-base text-sm font-semibold disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-sm text-muted">Page {page} of {totalPages}</span>
                <button
                  onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); setLightboxIndex(null) }}
                  disabled={page >= totalPages}
                  className="px-4 py-2 rounded-lg border border-base text-sm font-semibold disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
      <PhotoLightbox photos={lightboxPhotos} index={lightboxIndex} onIndexChange={setLightboxIndex} />
    </div>
  )
}