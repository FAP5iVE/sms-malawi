"use client"

/**
 * [NEW] Click-to-view-full-size photo viewer, shared by every gallery
 * surface in the app: the public landing page's "Life at our school"
 * strip, the public /gallery page, and the (auth) gallery-admin grid.
 * One component so "click a photo -> see it full size" behaves and looks
 * identical everywhere, rather than three separate implementations
 * drifting apart over time.
 *
 * Built on the shadcn Dialog primitive (Radix) rather than a hand-rolled
 * <div> overlay — Dialog.Content already provides a real focus trap and
 * Escape-to-close; reimplementing that from scratch for an image viewer
 * would be strictly worse and is exactly what the primitive exists to
 * avoid (sms-erp-ux Rule 1: never bypass a shadcn primitive that already
 * solves real accessibility/keyboard/focus-management complexity).
 *
 * showCloseButton is turned off on DialogContent and replaced with a
 * custom close affordance here, styled to match the prev/next arrows —
 * DialogContent's built-in close button can't be restyled per-instance,
 * and its default skin isn't readable against this viewer's black
 * backdrop. It still goes through the real DialogClose primitive
 * underneath, just skinned locally instead of using the generic default.
 */

import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog"

export interface LightboxPhoto {
  id: string
  url: string
  alt: string
  caption?: string | null
  category?: string | null
}

interface PhotoLightboxProps {
  photos: LightboxPhoto[]
  /** Index into `photos` currently shown full-size, or null when closed. */
  index: number | null
  onIndexChange: (index: number | null) => void
}

const navButtonClass =
  "absolute top-1/2 z-10 size-11 -translate-y-1/2 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"

export function PhotoLightbox({ photos, index, onIndexChange }: PhotoLightboxProps) {
  const open = index !== null
  const photo = index !== null ? photos[index] : undefined
  const hasMultiple = photos.length > 1

  // Wrap around in both directions — this is a gallery viewer, not a
  // paginated list, so there's no natural "end" to stop navigation at.
  const goTo = React.useCallback(
    (next: number) => {
      if (photos.length === 0) return
      onIndexChange(((next % photos.length) + photos.length) % photos.length)
    },
    [onIndexChange, photos.length],
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!hasMultiple || index === null) return
    if (e.key === "ArrowLeft") goTo(index - 1)
    if (e.key === "ArrowRight") goTo(index + 1)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onIndexChange(null)}>
      <DialogContent
        showCloseButton={false}
        onKeyDown={handleKeyDown}
        className="max-w-[calc(100%-2rem)] gap-0 overflow-hidden border-none bg-neutral-950 p-0 ring-white/10 sm:max-w-3xl"
      >
        {/* Radix requires a DialogTitle for screen readers even though the
         *  visible content is an image, not a heading — visually hidden,
         *  not omitted. */}
        <DialogTitle className="sr-only">
          {photo?.caption || photo?.alt || "Photo"}
        </DialogTitle>

        {photo && (
          <div className="relative flex max-h-[90vh] flex-col">
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Close"
                className="absolute top-2 right-2 z-10 size-11 rounded-full bg-black/40 text-white hover:bg-black/60 hover:text-white"
              >
                <XIcon className="size-5" />
              </Button>
            </DialogClose>

            <div className="flex items-center justify-center bg-black">
              {/* eslint-disable-next-line @next/next/no-img-element -- Appwrite-hosted photo, not a Next static asset */}
              <img
                src={photo.url}
                alt={photo.alt}
                className="max-h-[75vh] w-full object-contain"
              />
            </div>

            {(photo.caption || photo.category || hasMultiple) && (
              <div className="flex items-center justify-between gap-3 px-5 py-3 text-white">
                <div className="flex min-w-0 flex-col gap-0.5">
                  {photo.category && (
                    <span className="text-xs font-medium tracking-wide text-white/60 uppercase">
                      {photo.category}
                    </span>
                  )}
                  {photo.caption && <span className="truncate text-sm">{photo.caption}</span>}
                </div>
                {hasMultiple && (
                  <span className="shrink-0 text-xs text-white/60">
                    {(index ?? 0) + 1} / {photos.length}
                  </span>
                )}
              </div>
            )}

            {hasMultiple && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Previous photo"
                  onClick={() => goTo((index ?? 0) - 1)}
                  className={`${navButtonClass} left-2`}
                >
                  <ChevronLeftIcon className="size-5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Next photo"
                  onClick={() => goTo((index ?? 0) + 1)}
                  className={`${navButtonClass} right-2`}
                >
                  <ChevronRightIcon className="size-5" />
                </Button>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
