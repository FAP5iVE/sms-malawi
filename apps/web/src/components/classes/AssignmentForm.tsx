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
import { AlertCircle } from 'lucide-react'
import { CreateAssignmentSchema } from '@shared/schemas/student'
import type { CreateAssignmentInput } from '@shared/schemas/student'
import { useCreateAssignment } from '@/hooks/useClasses'
import { Field, inputCls } from '@/components/students/StudentFormSections'
import { Modal, MODAL_BTN_PRIMARY
} from '@/components/shared/Modal'

interface AssignmentFormProps {
  classId: string
  onClose: () => void
}

export default function AssignmentForm({ classId, onClose }: AssignmentFormProps) {
  const { mutate: createAssignment, isPending } = useCreateAssignment()

  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateAssignmentInput>({
    resolver: zodResolver(CreateAssignmentSchema) as Resolver<CreateAssignmentInput>,
  })

  function handleClose() {
    onClose()
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

  return (
    <Modal
      title="New Assignment"
      onClose={handleClose}
      size="md"
      onSubmit={handleSubmit(onSubmit)}
      busy={isPending}
      bodyClassName="flex flex-col gap-4"
      footer={
        <>
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
            className={MODAL_BTN_PRIMARY}
          >
            {isPending ? 'Creating…' : 'Create Assignment'}
          </button>
        </>
      }
    >
      {formBody}
    </Modal>
  )
}
