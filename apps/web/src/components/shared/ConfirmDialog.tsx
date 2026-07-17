'use client'

/**
 * apps/web/src/components/shared/ConfirmDialog.tsx
 *
 * [CHANGE TYPE]: NEW FILE
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: A single, accessible, reusable confirmation dialog replacing
 *   both the ad-hoc window.confirm() call in ExamGradingSettings.tsx's
 *   handleReset() (a blocking, non-accessible browser dialog) and the
 *   complete absence of any confirmation step on every destructive or
 *   financially-consequential action identified in this audit. Applied in
 *   this phase to: HolidaysManager.tsx's delete action, the Students
 *   list's bulk-archive action, MarksEntrySheet.tsx's "Finalize Marks"
 *   action, BulkInvoiceGenerator.tsx's "Generate Invoices" action,
 *   PayrollTab.tsx's "Run Payroll" action, and LibraryFinesTab.tsx's
 *   "Waive Fine" action.
 *
 *   Accessibility contract:
 *   • Real focus trap — the dialog portals under <body> and, while open,
 *     marks every other direct <body> child `inert` (the same approach
 *     MotionBottomSheet.tsx gains in this phase), so keyboard focus and
 *     assistive technology cannot reach the page behind it.
 *   • Escape → onCancel.
 *   • Default focus lands on the Cancel button — never on the destructive
 *     action — so an accidental Enter cannot execute the operation.
 *   • role="dialog" + aria-modal, with aria-labelledby/aria-describedby
 *     linking the title and description.
 *   • Focus is restored to the previously-focused element on close.
 *   • Fully reduced-motion compliant via reducedMotionVariants/
 *     reducedMotionTransition (instant fade when motion is disabled).
 * [DEPENDS ON]: W/lib/motion.ts, W/store/motionStore.ts
 */

import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { useMotionEnabled } from '@/store/motionStore'
import {
  OVERLAY_VARIANTS,
  SCALE_POP_VARIANTS,
  SPRING,
  DURATION,
  reducedMotionVariants,
  reducedMotionTransition,
} from '@/lib/motion'

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  /** Label on the confirming button. Default: "Confirm". */
  confirmLabel?: string
  /** Styles the confirm button as destructive (coral) when true. */
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const motionEnabled = useMotionEnabled()
  const panelRef      = useRef<HTMLDivElement>(null)
  const cancelRef     = useRef<HTMLButtonElement>(null)
  const titleId       = useId()
  const descId        = useId()

  // ── Escape → cancel ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onCancel])

  // ── Focus trap via `inert` + default focus on Cancel ──────────────────────
  // The dialog portals directly under <body>; every other direct body child
  // is marked inert while open (restored on close), and initial focus lands
  // on the non-destructive Cancel button. Focus returns to the previously
  // focused element when the dialog closes.
  useEffect(() => {
    if (!open) return

    const panelEl  = panelRef.current
    const affected: HTMLElement[] = []

    for (const child of Array.from(document.body.children)) {
      if (!(child instanceof HTMLElement)) continue
      if (panelEl && (child === panelEl || child.contains(panelEl))) continue
      if (child.inert) continue
      child.inert = true
      affected.push(child)
    }

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    cancelRef.current?.focus()

    return () => {
      affected.forEach((el) => {
        el.inert = false
      })
      previouslyFocused?.focus()
    }
  }, [open])

  // ── Motion configs — reduced-motion aware ─────────────────────────────────
  const overlayVariants    = reducedMotionVariants(motionEnabled, OVERLAY_VARIANTS)
  const overlayTransition  = reducedMotionTransition(motionEnabled, { duration: DURATION.fast })
  const panelVariants      = reducedMotionVariants(motionEnabled, SCALE_POP_VARIANTS)
  const panelTransition    = reducedMotionTransition(motionEnabled, SPRING.tight)

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* ── Backdrop ─────────────────────────────────────────────────── */}
          <motion.div
            key="confirm-backdrop"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={overlayTransition}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px]"
            onClick={onCancel}
            aria-hidden="true"
          />

          {/* ── Dialog panel ─────────────────────────────────────────────── */}
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              key="confirm-panel"
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={descId}
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={panelTransition}
              className="
                pointer-events-auto
                w-full max-w-sm
                bg-surface border border-base rounded-2xl shadow-xl
                p-5
              "
            >
              <div className="flex items-start gap-3">
                <div
                  className={[
                    'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                    destructive ? 'bg-brand-coral/10' : 'bg-brand-amber/10',
                  ].join(' ')}
                >
                  <AlertTriangle
                    className={[
                      'w-5 h-5',
                      destructive ? 'text-brand-coral' : 'text-brand-amber',
                    ].join(' ')}
                    aria-hidden
                  />
                </div>
                <div className="min-w-0">
                  <h2
                    id={titleId}
                    className="font-heading font-bold text-base text-body"
                  >
                    {title}
                  </h2>
                  <p id={descId} className="text-sm text-muted mt-1 leading-relaxed">
                    {description}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 mt-5">
                <button
                  ref={cancelRef}
                  type="button"
                  onClick={onCancel}
                  className="
                    min-h-[44px] px-4 rounded-xl
                    text-sm font-heading font-semibold
                    border border-base text-muted
                    hover:bg-page hover:text-body
                    active:bg-base/60
                    transition-colors
                  "
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onConfirm}
                  className={[
                    'min-h-[44px] px-5 rounded-xl',
                    'text-sm font-heading font-semibold text-white',
                    'transition-colors',
                    destructive
                      ? 'bg-brand-coral hover:bg-brand-coral/90 active:bg-brand-coral/80'
                      : 'bg-brand-navy hover:bg-brand-navy/90 active:bg-brand-navy/80',
                  ].join(' ')}
                >
                  {confirmLabel}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
