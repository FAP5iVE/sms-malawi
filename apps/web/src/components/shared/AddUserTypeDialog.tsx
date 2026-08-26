'use client'

/**
 * apps/web/src/components/shared/AddUserTypeDialog.tsx
 *
 * [CHANGE TYPE]: NEW FILE (production fix, 2026-08-25).
 * [PURPOSE]: User Management's "Add User" action previously opened its own
 *   independent inline form (email/displayName/phone/role only), POSTing
 *   to /users → userManagementService.createUser() — a bare Firebase Auth
 *   account with no linked Student/StaffProfile row at all, completely
 *   disconnected from the HR and Students domains. This dialog is the
 *   first step of the corrected flow: it asks whether the new account is
 *   for a staff member or a student, then user-management/page.tsx renders
 *   the actual canonical form for that choice — components/hr/StaffForm.tsx
 *   (same one the HR Directory's "Add Staff" uses) or
 *   components/students/StudentForm.tsx (same one the Students page's
 *   "Add Student" uses) — so account + domain record are created together
 *   through the one real, already-audited code path, not a duplicate.
 *
 *   Accessibility contract mirrors ConfirmDialog.tsx (same file, same
 *   reasoning): portals under <body>, marks other direct <body> children
 *   inert while open, Escape → onCancel, initial focus lands on the first
 *   choice, focus is restored to the previously-focused element on close,
 *   role="dialog" + aria-modal with aria-labelledby/aria-describedby, and
 *   reduced-motion compliant via reducedMotionVariants/
 *   reducedMotionTransition.
 * [DEPENDS ON]: W/lib/motion.ts, W/store/motionStore.ts
 */

import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Briefcase, GraduationCap } from 'lucide-react'
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

export type NewUserType = 'staff' | 'student'

export interface AddUserTypeDialogProps {
  open: boolean
  onSelect: (type: NewUserType) => void
  onCancel: () => void
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function AddUserTypeDialog({ open, onSelect, onCancel }: AddUserTypeDialogProps) {
  const motionEnabled = useMotionEnabled()
  const panelRef       = useRef<HTMLDivElement>(null)
  const firstChoiceRef = useRef<HTMLButtonElement>(null)
  const titleId         = useId()
  const descId          = useId()

  // ── Escape → cancel ────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onCancel])

  // ── Focus trap via `inert` + default focus on first choice ────────────
  // Same approach as ConfirmDialog.tsx: every other direct <body> child is
  // marked inert while open (restored on close), so keyboard focus and
  // assistive technology cannot reach the page behind it.
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
    firstChoiceRef.current?.focus()

    return () => {
      affected.forEach((el) => {
        el.inert = false
      })
      previouslyFocused?.focus()
    }
  }, [open])

  // ── Motion configs — reduced-motion aware ──────────────────────────────
  const overlayVariants   = reducedMotionVariants(motionEnabled, OVERLAY_VARIANTS)
  const overlayTransition = reducedMotionTransition(motionEnabled, { duration: DURATION.fast })
  const panelVariants     = reducedMotionVariants(motionEnabled, SCALE_POP_VARIANTS)
  const panelTransition   = reducedMotionTransition(motionEnabled, SPRING.tight)

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* ── Backdrop ─────────────────────────────────────────────── */}
          <motion.div
            key="add-user-type-backdrop"
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={overlayTransition}
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-[2px]"
            onClick={onCancel}
            aria-hidden="true"
          />

          {/* ── Dialog panel ─────────────────────────────────────────── */}
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              key="add-user-type-panel"
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
                w-full max-w-md
                bg-surface border border-base rounded-2xl shadow-xl
                p-5
              "
            >
              <h2 id={titleId} className="font-heading font-bold text-base text-body">
                Add User
              </h2>
              <p id={descId} className="text-sm text-muted mt-1 leading-relaxed">
                What type of user account are you creating? 
              </p>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <button
                  ref={firstChoiceRef}
                  type="button"
                  onClick={() => onSelect('staff')}
                  className="
                    flex flex-col items-center gap-2 min-h-[88px] p-4 rounded-xl
                    border border-base bg-page text-body
                    hover:border-brand-teal hover:bg-brand-teal/5
                    active:bg-brand-teal/10
                    transition-colors
                  "
                >
                  <Briefcase className="w-6 h-6 text-brand-teal" aria-hidden />
                  <span className="text-sm font-heading font-semibold">Staff Member</span>
                  <span className="text-[11px] text-muted leading-tight">
                    Teacher, admin, HR, finance…
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => onSelect('student')}
                  className="
                    flex flex-col items-center gap-2 min-h-[88px] p-4 rounded-xl
                    border border-base bg-page text-body
                    hover:border-brand-teal hover:bg-brand-teal/5
                    active:bg-brand-teal/10
                    transition-colors
                  "
                >
                  <GraduationCap className="w-6 h-6 text-brand-teal" aria-hidden />
                  <span className="text-sm font-heading font-semibold">Student</span>
                  <span className="text-[11px] text-muted leading-tight">
                    Enrol a new student record
                  </span>
                </button>
              </div>

              <div className="flex items-center justify-end mt-5">
                <button
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
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
