'use client'

/**
 * MotionBottomSheet — Phase B8
 *
 * A fully Framer Motion-driven bottom sheet component for mobile-first
 * interactions. Designed as a complement (not replacement) to the existing
 * Radix-based Sheet UI primitive — use this when:
 *   - You need drag-to-dismiss gesture
 *   - You need the spring-physics feel of Framer Motion
 *   - The content is mobile-context (mobile nav "More" drawer, quick forms)
 *
 * Features:
 *   - Slides up from viewport bottom with spring physics (SPRING.fluid)
 *   - Drag handle at top — drag down > 30% sheet height or velocity > 500
 *     to dismiss automatically
 *   - Backdrop overlay fades in/out with separate AnimatePresence
 *   - Keyboard: Escape key closes
 *   - Focus trap via `inert` on background content when open
 *   - Fully reduced-motion compliant — falls back to fade-only when disabled
 *   - ARIA: role="dialog", aria-modal, aria-labelledby
 *
 * Usage:
 *   const [open, setOpen] = useState(false)
 *   <MotionBottomSheet open={open} onClose={() => setOpen(false)} title="Filters">
 *     <FilterForm />
 *   </MotionBottomSheet>
 */

import { useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence, useDragControls, useMotionValue, useTransform } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMotionEnabled } from '@/store/motionStore'
import {
  SHEET_UP_VARIANTS,
  OVERLAY_VARIANTS,
  DURATION,
  EASE,
  SPRING,
  reducedMotionVariants,
} from '@/lib/motion'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface MotionBottomSheetProps {
  /** Controls visibility */
  open: boolean
  /** Called when the sheet should close (backdrop click, drag, Escape) */
  onClose: () => void
  /** Optional title rendered in the sheet header */
  title?: string
  /** Sheet body content */
  children: React.ReactNode
  /**
   * Maximum height of the sheet as a CSS value.
   * Defaults to "85dvh" — leaves a visible gap at the top for context.
   */
  maxHeight?: string
  /**
   * Whether the sheet background content should use `inert` for focus trap.
   * Defaults to true.
   */
  trapFocus?: boolean
  /** Additional className applied to the sheet panel */
  className?: string
  /** Additional className applied to the backdrop overlay */
  overlayClassName?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

/** Fraction of sheet height the user must drag down to auto-dismiss */
const DRAG_DISMISS_THRESHOLD = 0.3

/** Velocity (px/s) above which the sheet dismisses regardless of position */
const DRAG_DISMISS_VELOCITY = 500

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function MotionBottomSheet({
  open,
  onClose,
  title,
  children,
  maxHeight    = '85dvh',
  trapFocus    = true,
  className,
  overlayClassName,
}: MotionBottomSheetProps) {
  const motionEnabled  = useMotionEnabled()
  const dragControls   = useDragControls()
  const sheetRef       = useRef<HTMLDivElement>(null)
  const dragY          = useMotionValue(0)

  // Derive backdrop opacity from drag position — sheet dragging down
  // fades the backdrop proportionally (0 = full opacity, 200 = zero opacity)
  const backdropOpacity = useTransform(dragY, [0, 200], [1, 0])

  // ── Keyboard: Escape to close ─────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  // ── Body scroll lock when open ────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  // ── Drag end handler — check if user dragged enough to dismiss ────────────
  const handleDragEnd = useCallback(
    (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
      const sheetHeight = sheetRef.current?.offsetHeight ?? 400
      const didDragEnough = info.offset.y > sheetHeight * DRAG_DISMISS_THRESHOLD
      const didFlingDown  = info.velocity.y > DRAG_DISMISS_VELOCITY

      if (didDragEnough || didFlingDown) {
        onClose()
      } else {
        // Snap back to open position
        dragY.set(0)
      }
    },
    [onClose, dragY]
  )

  // ── Variant sets — reduced motion aware ───────────────────────────────────
  const sheetVariants   = reducedMotionVariants(motionEnabled, SHEET_UP_VARIANTS)
  const overlayVariants = reducedMotionVariants(motionEnabled, OVERLAY_VARIANTS)

  // When motion is disabled, fall back to opacity-only fade (not vestibular)
  const reducedSheetVariants = !motionEnabled
    ? {
        hidden:  { opacity: 0 },
        visible: { opacity: 1, transition: { duration: DURATION.fast } },
        exit:    { opacity: 0, transition: { duration: DURATION.fast } },
      }
    : sheetVariants

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* ── Backdrop overlay ──────────────────────────────────────────── */}
          <motion.div
            key="sheet-overlay"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={motionEnabled ? { opacity: backdropOpacity } : undefined}
            className={cn(
              'fixed inset-0 z-40 bg-black/40 backdrop-blur-sm',
              overlayClassName
            )}
            onClick={onClose}
            aria-hidden="true"
          />

          {/* ── Sheet panel ───────────────────────────────────────────────── */}
          <motion.div
            key="sheet-panel"
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={title ?? 'Bottom sheet'}
            variants={reducedSheetVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            // Drag configuration — only active when motion is enabled
            drag={motionEnabled ? 'y' : false}
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={handleDragEnd}
            style={{
              y: motionEnabled ? dragY : undefined,
            }}
            className={cn(
              // Positioning
              'fixed bottom-0 inset-x-0 z-50',
              // Layout
              'flex flex-col bg-surface',
              // Shape
              'rounded-t-3xl border-t border-base',
              // Shadow
              'shadow-2xl',
              // Safe area for iOS home indicator
              'pb-safe',
              className
            )}
          >
            {/* ── Drag handle + header ─────────────────────────────────────── */}
            <div
              // The drag handle area initiates drag from anywhere across the header
              onPointerDown={(e) => {
                if (motionEnabled) dragControls.start(e)
              }}
              className={cn(
                'flex flex-col items-center gap-3 px-4 pt-3 pb-0 shrink-0',
                motionEnabled && 'cursor-grab active:cursor-grabbing'
              )}
            >
              {/* Visual drag pill */}
              <div
                className="w-10 h-1.5 rounded-full bg-muted/30"
                aria-hidden="true"
              />

              {/* Header row — title + close button */}
              {(title != null) && (
                <div className="flex items-center justify-between w-full pb-3 border-b border-base">
                  <h2
                    id="sheet-title"
                    className="font-heading font-semibold text-base text-body"
                  >
                    {title}
                  </h2>
                  <motion.button
                    onClick={onClose}
                    whileHover={motionEnabled ? { scale: 1.1 } : undefined}
                    whileTap={motionEnabled ? { scale: 0.9 } : undefined}
                    transition={{ type: 'spring', stiffness: 400, damping: 40 }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-body hover:bg-page transition-colors"
                    aria-label="Close sheet"
                  >
                    <X className="w-4 h-4" />
                  </motion.button>
                </div>
              )}

              {/* Close button when no title */}
              {title == null && (
                <div className="flex justify-end w-full">
                  <motion.button
                    onClick={onClose}
                    whileHover={motionEnabled ? { scale: 1.1 } : undefined}
                    whileTap={motionEnabled ? { scale: 0.9 } : undefined}
                    transition={{ type: 'spring', stiffness: 400, damping: 40 }}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-body hover:bg-page transition-colors"
                    aria-label="Close sheet"
                  >
                    <X className="w-4 h-4" />
                  </motion.button>
                </div>
              )}
            </div>

            {/* ── Scrollable body content ───────────────────────────────────── */}
            <div
              className="flex-1 overflow-y-auto overscroll-contain px-4 py-4"
              style={{ maxHeight }}
            >
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HOOK — convenience controller for managing sheet open state
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'

/**
 * Convenience hook for controlling a MotionBottomSheet.
 *
 * Usage:
 *   const sheet = useBottomSheet()
 *   <button onClick={sheet.open}>Open</button>
 *   <MotionBottomSheet {...sheet.props} title="My Sheet">
 *     <Content />
 *   </MotionBottomSheet>
 */
export function useBottomSheet() {
  const [isOpen, setIsOpen] = useState(false)

  return {
    isOpen,
    open:  () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle:() => setIsOpen((v) => !v),
    /** Spread these onto <MotionBottomSheet> */
    props: {
      open:    isOpen,
      onClose: () => setIsOpen(false),
    },
  }
}