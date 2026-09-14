"use client"

/**
 * [NEW] Hierarchical ("bento") photo grid — every 5th photo renders large,
 * the rest render as equal small tiles around it, repeating for as many
 * photos as are passed in. Used by the two *public* gallery surfaces (the
 * landing page's "Life at our school" strip and /gallery); gallery-admin
 * keeps its existing plain uniform grid unchanged per spec and does not
 * use this component.
 *
 * GalleryPhoto has no width/height in the schema (checked schema.prisma —
 * `fileKey/caption/category/displayOrder` only), so this can't be a real
 * masonry layout driven by each photo's actual aspect ratio. Instead every
 * tile is forced to `aspect-square` and the "large" tile spans 2 columns
 * and 2 rows of same-size square tiles — 2 stacked 1-unit squares are the
 * same total height as one 2-unit square, so the rows line up exactly
 * without any arbitrary pixel row-height. Purely CSS grid auto-placement
 * (`col-span-2 row-span-2` on every 5th item) — no JS chunking, no
 * measuring, so it repeats correctly for any number of photos and any
 * page size.
 */

import { Maximize2Icon } from "lucide-react"

export interface HierarchicalPhoto {
  id: string
  url: string
  alt: string
  caption?: string | null
  category?: string | null
}

interface HierarchicalPhotoGridProps {
  photos: HierarchicalPhoto[]
  onPhotoClick: (index: number) => void
  className?: string
}

export function HierarchicalPhotoGrid({ photos, onPhotoClick, className }: HierarchicalPhotoGridProps) {
  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 ${className ?? ""}`}>
      {photos.map((photo, i) => {
        const isHero = i % 5 === 0
        return (
          <button
            key={photo.id}
            type="button"
            onClick={() => onPhotoClick(i)}
            aria-label={`View ${photo.caption || photo.category || "photo"} full size`}
            className={`group relative aspect-square overflow-hidden rounded-xl border border-base bg-surface ${isHero ? "col-span-2 row-span-2" : ""}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- Appwrite-hosted photo, not a Next static asset */}
            <img
              src={photo.url}
              alt={photo.alt}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/0 to-black/0 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
            <Maximize2Icon className="absolute top-2 right-2 size-4 text-white opacity-0 drop-shadow transition-opacity duration-200 group-hover:opacity-100" />
            {(photo.caption || photo.category) && (
              <div className="absolute inset-x-0 bottom-0 p-2.5 text-left opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                {photo.category && (
                  <span className="block text-[10px] font-medium tracking-wide text-white/70 uppercase">
                    {photo.category}
                  </span>
                )}
                {photo.caption && (
                  <span className="block truncate text-xs font-medium text-white">{photo.caption}</span>
                )}
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
