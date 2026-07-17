/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/classes/AssignmentForm.tsx
 * [R-PHASE]: R6 — Academics II: Classes, Assignments & the Attendance Rebuild
 * [PURPOSE]: Teacher-facing assignment-creation form (title, description,
 *   subject, due date), rendered from the Class detail page's Assignments
 *   tab. Matches StudentForm.tsx's responsive dialog/bottom-sheet
 *   convention (Phase 1D-ii) — mobile bottom sheet, desktop dialog, shared
 *   form-state hook — simplified to a single step (no multi-step
 *   navigation) since the form has only four fields.
 * [DEPENDS ON]: @shared/schemas/student (CreateAssignmentSchema),
 *   apps/web/src/hooks/useClasses.ts (useCreateAssignment),
 *   apps/web/src/components/students/StudentFormSections.tsx (Field,
 *   inputCls — reused rather than redefined)
 */
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, X } from 'lucide-react'
import { CreateAssignmentSchema } from '@shared/schemas/student'
import type { CreateAssignmentInput } from '@shared/schemas/student'
import { useCreateAssignment } from '@/hooks/useClasses'
import { useMotionEnabled } from '@/store/motionStore'
import { Field, inputCls } from '@/components/students/StudentFormSections'
import {
  SHEET_UP_VARIANTS,
  OVERLAY_VARIANTS,
  reducedMotionVariants,
  reducedMotionTransition,
  DURATION,
} from '@/lib/motion'

interface AssignmentFormProps {
  classId: string
  onClose: () => void
}

export default function AssignmentForm({ classId, onClose }: AssignmentFormProps) {
  const { mutate: createAssignment, isPending } = useCreateAssignment()
  const motionEnabled = useMotionEnabled()

  const [visible, setVisible] = useState(true)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [isMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  )

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateAssignmentInput>({
    resolver: zodResolver(CreateAssignmentSchema) as Resolver<CreateAssignmentInput>,
  })

  function handleClose() {
    setVisible(false)
    // onClose() is called by AnimatePresence onExitComplete
  }

  function onSubmit(data: CreateAssignmentInput) {
    setSubmitError(null)
    createAssignment(
      { classId, ...data },
      {
        onSuccess: () => handleClose(),
        onError: (err) => {
          setSubmitError(err instanceof Error ? err.message : 'Failed to create assignment. Please try again.')
        },
      }
    )
  }

  const backdropVariants   = reducedMotionVariants(motionEnabled, OVERLAY_VARIANTS)
  const backdropTransition = reducedMotionTransition(motionEnabled, { duration: DURATION.fast })
  const sheetVariants      = reducedMotionVariants(motionEnabled, SHEET_UP_VARIANTS)
  const dialogVariants = reducedMotionVariants(motionEnabled, {
    hidden:  { opacity: 0, scale: 0.96, y: 12 },
    visible: { opacity: 1, scale: 1,    y: 0  },
    exit:    { opacity: 0, scale: 0.96, y: 12 },
  })
  const dialogTransition = reducedMotionTransition(motionEnabled, {
    type: 'spring',
    stiffness: 400,
    damping: 30,
  })

  const formBody = (
    <>
      <Field label="Title" error={errors.title?.message} required>
        <input
          type="text"
          {...register('title')}
          placeholder="e.g. Chapter 4 Problem Set"
          className={inputCls}
        />
      </Field>

      <Field label="Subject" error={errors.subject?.message} required>
        <input
          type="text"
          {...register('subject')}
          placeholder="e.g. Mathematics"
          className={inputCls}
        />
      </Field>

      <Field label="Due Date" error={errors.dueDate?.message} required>
        <input type="date" {...register('dueDate')} className={inputCls} />
      </Field>

      <Field label="Description" error={errors.description?.message}>
        <textarea
          {...register('description')}
          rows={4}
          placeholder="Instructions for students (optional)"
          className={`${inputCls} min-h-[100px] resize-y`}
        />
      </Field>

      {submitError && (
        <p
          role="alert"
          className="flex items-start gap-2 text-xs text-brand-coral bg-brand-coral/8 border border-brand-coral/20 rounded-xl px-4 py-3"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
          {submitError}
        </p>
      )}
    </>
  )

  if (isMobile) {
    return (
      <AnimatePresence onExitComplete={onClose}>
        {visible && (
          <>
            <motion.div
              key="assignment-form-backdrop"
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={backdropTransition}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]"
              onClick={handleClose}
              aria-hidden
            />
            <motion.div
              key="assignment-form-sheet"
              variants={sheetVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="fixed inset-x-0 bottom-0 z-50 flex flex-col bg-surface rounded-t-2xl shadow-2xl max-h-[92dvh] overflow-hidden"
              style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
              role="dialog"
              aria-label="New assignment"
              aria-modal="true"
            >
              <div className="flex justify-center pt-3 pb-1 shrink-0" aria-hidden>
                <span className="w-10 h-1 rounded-full bg-muted/25" />
              </div>

              <div className="flex items-center justify-between px-5 py-3 border-b border-base shrink-0">
                <h2 className="font-heading font-bold text-base text-body">New Assignment</h2>
                <button
                  type="button"
                  onClick={handleClose}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-muted hover:bg-page hover:text-body transition-colors"
                  aria-label="Close form"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={handleSubmit(onSubmit)}
                className="flex-1 overflow-y-auto flex flex-col"
              >
                <div className="flex flex-col gap-4 px-5 py-4">
                  {formBody}
                </div>

                <div className="shrink-0 px-5 py-4 border-t border-base bg-surface mt-auto">
                  <button
                    type="submit"
                    disabled={isPending}
                    className="w-full min-h-[44px] rounded-xl bg-brand-teal text-white font-heading font-semibold text-sm hover:bg-brand-teal-light transition-colors disabled:opacity-60"
                  >
                    {isPending ? 'Creating…' : 'Create Assignment'}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    )
  }

  return (
    <AnimatePresence onExitComplete={onClose}>
      {visible && (
        <motion.div
          key="assignment-form-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={backdropTransition}
        >
          <div
            className="absolute inset-0 bg-brand-navy/50 backdrop-blur-sm"
            onClick={handleClose}
            aria-hidden
          />

          <motion.div
            key="assignment-form-dialog"
            variants={dialogVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={dialogTransition}
            className="relative z-10 w-full max-w-md bg-surface rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]"
            role="dialog"
            aria-label="New assignment"
            aria-modal="true"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-base shrink-0">
              <div>
                <h2 className="font-heading font-bold text-lg text-brand-navy">New Assignment</h2>
                <p className="text-xs text-muted font-sans mt-0.5">
                  Create an assignment for this class.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-page text-muted hover:text-body transition-colors"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="flex-1 overflow-y-auto flex flex-col"
            >
              <div className="flex flex-col gap-4 px-6 py-5">
                {formBody}
              </div>

              <div className="shrink-0 px-6 py-4 border-t border-base bg-surface flex justify-end gap-3 mt-auto">
                <button
                  type="button"
                  onClick={handleClose}
                  className="min-h-[44px] px-4 rounded-xl text-sm font-heading font-semibold text-muted hover:bg-page transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="min-h-[44px] px-5 rounded-xl bg-brand-teal text-white font-heading font-semibold text-sm hover:bg-brand-teal-light transition-colors disabled:opacity-60"
                >
                  {isPending ? 'Creating…' : 'Create Assignment'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
