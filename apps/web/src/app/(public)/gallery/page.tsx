'use client'

/**
 * apps/web/src/app/(public)/gallery/page.tsx
 * [CHANGE TYPE]: NEW FILE (production fix, 2026-07-28)
 * [PURPOSE]: Full gallery browsing page. The landing page's "Life at our
 *   school" strip shows 5 photos and links here for everything else.
 * [DEPENDS ON]: usePublicGallery (GET /public/gallery)
 */

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ImageIcon } from 'lucide-react'
import { usePublicGallery } from '@/hooks/usePublic'
import { PublicAmbientBackground } from '@/components/shared/PublicAmbientBackground'
import { PublicThemeToggle } from '@/components/shared/PublicThemeToggle'

const PAGE_SIZE = 24

export default function GalleryPage() {
  const [page, setPage] = useState(1)
  const { data, isLoading } = usePublicGallery(PAGE_SIZE, page)
  const photos = data?.photos ?? []
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1

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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {photos.map((p) => (
                <div key={p.id} className="group relative aspect-square rounded-xl overflow-hidden border border-base">
                  {/* eslint-disable-next-line @next/next/no-img-element -- external Appwrite view URL */}
                  <img src={p.url} alt={p.caption ?? p.category ?? 'School photo'} className="w-full h-full object-cover" />
                  {(p.caption || p.category) && (
                    <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/70 to-transparent p-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-xs text-white font-heading font-semibold">{p.caption ?? p.category}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-10">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-4 py-2 rounded-lg border border-base text-sm font-semibold disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-sm text-muted">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
    </div>
  )
}