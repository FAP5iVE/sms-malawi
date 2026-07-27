'use client'

/**
 * apps/web/src/components/students/StudentForm.tsx — Phase C5
 * [CHANGE TYPE]: MAJOR REWRITE of the edit-mode data flow only (R5)
 * [R-PHASE]: R5 — Academics I: Admissions & Student Records
 * [PURPOSE]: Two confirmed defects fixed. (1) When studentId is supplied,
 *   the form previously never fetched or populated the existing record —
 *   "editing" a student opened a blank form. It now calls useStudent(id)
 *   and populates every field via reset() once data resolves. (2) onSubmit
 *   always called useCreateStudent() regardless of mode — editing an
 *   existing student silently created a brand-new record instead of
 *   updating it. onSubmit now branches on isEdit: useUpdateStudent() when
 *   editing, useCreateStudent() only when creating. A submit failure (from
 *   either mutation) is now surfaced inline via role="alert" rather than
 *   failing silently.
 *
 * Adaptive student form with two distinct rendering modes:
 *
 *   MOBILE (< 768px / md):
 *     Renders as a slide-up bottom sheet (SHEET_UP_VARIANTS spring).
 *     Fields are split into 3 animated steps:
 *       Step 1 — Personal (firstName, lastName, DOB, sex, nationality, district) + photo
 *       Step 2 — Academic (classId, status)
 *       Step 3 — Contact  (phone, village, address)
 *     Step navigation uses AnimatePresence with a directional slide (custom prop).
 *     Step-level validation via trigger(STEP_FIELDS[step]) before advancing.
 *     Final step submits the complete form.
 *
 *   DESKTOP (md+):
 *     Renders as a spring-animated centred dialog (max-w-2xl).
 *     All three sections are visible simultaneously with FieldDividers.
 *     Single submit action — no step navigation.
 *
 * Exit animations:
 *   StudentForm manages its own `visible` state (starts true).
 *   handleClose() sets visible=false → AnimatePresence runs exit animations →
 *   onExitComplete fires parent onClose(). Guarantees backdrop and panel
 *   both animate out before the component unmounts.
 *
 * 44 px touch targets:
 *   All <button> elements have min-h-11.
 *   All <input>, <select>, <textarea> inherit min-h-11 from inputCls (C5).
 *
 * Photo upload:
 *   Shown above Step 1 on mobile, and in the form header section on desktop.
 *   State is held locally (photoFile, photoPreview) and uploaded after student
 *   record creation via a POST /students/:id/photo multipart request.
 */

import { useState, useEffect }      from 'react'
import { z }                        from 'zod'
import { useForm }                  from 'react-hook-form'
import { zodResolver }              from '@hookform/resolvers/zod'
import { AnimatePresence, motion }  from 'framer-motion'
import { Check, ChevronLeft, ChevronRight, Loader2, User, X, AlertCircle } from 'lucide-react'
import Image                        from 'next/image'
import { getAuth }                  from 'firebase/auth'
import { CreateStudentSchema }      from '@shared/schemas/student'
import type { CreateStudentInput }  from '@shared/schemas/student'

// CreateStudentSchema has defaulted/required transforms (nationality default,
// email) so its INPUT type differs from CreateStudentInput (the output). useForm
// is parameterised with both to keep the resolver and submit handler aligned —
// this replaces the previous `as Resolver<>` cast, which silently bypassed the
// type check (and hid exactly this kind of input/output mismatch).
type StudentFormValues = z.input<typeof CreateStudentSchema>
import type { ApiStudent }          from '@shared/types/api'
import { useCreateStudent, useUpdateStudent, useStudent } from '@/hooks/useStudents'
import { buildApiUrl }              from '@/lib/api-client'
import { useMotionEnabled }         from '@/store/motionStore'
import {
  SHEET_UP_VARIANTS,
  OVERLAY_VARIANTS,
  reducedMotionVariants,
  reducedMotionTransition,
  DURATION,
  EASE,
} from '@/lib/motion'
import {
  PersonalSection,
  AcademicSection,
  ContactSection,
  FieldDivider,
  STEP_FIELDS,
} from '@/components/students/StudentFormSections'

// ─────────────────────────────────────────────────────────────────────────────
// STEP CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Personal',  shortLabel: '1' },
  { label: 'Academic',  shortLabel: '2' },
  { label: 'Contact',   shortLabel: '3' },
] as const

const STEP_COUNT = STEPS.length

// ─────────────────────────────────────────────────────────────────────────────
// DIRECTIONAL STEP VARIANTS
// `custom` prop carries direction: 1 (forward) | -1 (back)
// ─────────────────────────────────────────────────────────────────────────────

const STEP_VARIANTS = {
  enter:  (d: number) => ({ x: d > 0 ?  40 : -40, opacity: 0 }),
  center:              ({ x: 0, opacity: 1 }),
  exit:   (d: number) => ({ x: d > 0 ? -40 :  40, opacity: 0 }),
}

const STEP_TRANSITION = { duration: 0.18, ease: 'easeOut' } as const

// ─────────────────────────────────────────────────────────────────────────────
// STEP INDICATOR
// ─────────────────────────────────────────────────────────────────────────────

function StepIndicator({
  currentStep,
  motionEnabled,
}: {
  currentStep: number
  motionEnabled: boolean
}) {
  return (
    <div className="flex items-center gap-0 justify-center" role="list" aria-label="Form steps">
      {STEPS.map((step, idx) => {
        const done    = idx < currentStep
        const active  = idx === currentStep
        const future  = idx > currentStep

        return (
          <div key={step.label} className="flex items-center" role="listitem">
            {/* Step circle */}
            <motion.div
              animate={{
                backgroundColor: done
                  ? 'var(--color-brand-teal)'
                  : active
                  ? 'var(--color-brand-navy)'
                  : 'transparent',
                borderColor: future
                  ? 'var(--color-base)'
                  : done || active
                  ? 'transparent'
                  : 'var(--color-brand-teal)',
              }}
              transition={reducedMotionTransition(motionEnabled, {
                duration: DURATION.fast,
              })}
              className={[
                'w-7 h-7 rounded-full border-2 flex items-center justify-center',
                'text-[11px] font-heading font-bold transition-colors',
                done    ? 'text-white'         : '',
                active  ? 'text-white'         : '',
                future  ? 'text-muted'         : '',
              ].join(' ')}
              aria-current={active ? 'step' : undefined}
            >
              {done ? (
                <Check className="w-3.5 h-3.5" aria-hidden />
              ) : (
                <span>{idx + 1}</span>
              )}
            </motion.div>

            {/* Connector line (not after last step) */}
            {idx < STEP_COUNT - 1 && (
              <div className="relative w-8 h-0.5 mx-0.5">
                <div className="absolute inset-0 bg-base rounded-full" />
                <motion.div
                  className="absolute inset-y-0 left-0 bg-brand-teal rounded-full"
                  animate={{ width: done ? '100%' : '0%' }}
                  transition={reducedMotionTransition(motionEnabled, {
                    duration: DURATION.normal,
                    ease: EASE.out,
                  })}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// PHOTO UPLOAD ROW
// ─────────────────────────────────────────────────────────────────────────────

interface PhotoUploadProps {
  preview: string | null
  onChange: (file: File, preview: string) => void
  compact?: boolean
}

function PhotoUpload({ preview, onChange, compact = false }: PhotoUploadProps) {
  return (
    <div
      className={[
        'flex items-center gap-4 bg-page border-b border-base',
        compact ? 'px-5 py-3' : 'px-6 py-4',
      ].join(' ')}
    >
      <div
        className={[
          'rounded-full border-2 border-dashed border-base bg-surface',
          'flex items-center justify-center overflow-hidden shrink-0 relative',
          compact ? 'w-12 h-12' : 'w-16 h-16',
        ].join(' ')}
      >
        {preview ? (
          <Image
            src={preview}
            alt="Student photo preview"
            fill
            className="object-cover"
          />
        ) : (
          <User
            className={compact ? 'w-5 h-5 text-muted' : 'w-7 h-7 text-muted'}
            aria-hidden
          />
        )}
      </div>

      <div>
        <label
          htmlFor="student-photo-upload"
          className="cursor-pointer text-sm font-heading font-semibold text-brand-teal hover:text-brand-teal/80 transition-colors"
        >
          {preview ? 'Change photo' : 'Upload photo'}
        </label>
        <input
          id="student-photo-upload"
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onChange(f, URL.createObjectURL(f))
          }}
        />
        <p className="text-xs text-muted mt-0.5">JPG, PNG or WebP · max 5 MB</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAP EXISTING STUDENT → FORM VALUES
// ApiStudent's field names already match CreateStudentInput one-for-one
// (both derive from the same real Student model shape) — the only real
// transformation needed is trimming the server's full ISO datetime string
// down to the YYYY-MM-DD the form's date input and CreateStudentSchema's
// regex both expect.
// ─────────────────────────────────────────────────────────────────────────────

function mapStudentToFormValues(s: ApiStudent): Partial<StudentFormValues> {
  return {
    firstName:        s.firstName,
    lastName:         s.lastName,
    dateOfBirth:      s.dateOfBirth.slice(0, 10),
    sex:              s.sex,
    nationality:      s.nationality,
    district:         s.district,
    village:          s.village,
    address:          s.address,
    phone:            s.phone,
    guardianName:     s.guardianName,
    guardianPhone:    s.guardianPhone,
    guardianRelation: s.guardianRelation,
    classId:          s.classId,
    status:           s.status as CreateStudentInput['status'],
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT FORM
// ─────────────────────────────────────────────────────────────────────────────

interface StudentFormProps {
  onClose: () => void
  studentId?: string
}

export function StudentForm({ onClose, studentId }: StudentFormProps) {
  const isEdit = !!studentId
  const { data: existingStudent } = useStudent(studentId ?? '')
  const { mutate: createStudent, isPending: isCreating } = useCreateStudent()
  const { mutate: updateStudent, isPending: isUpdating } = useUpdateStudent()
  const isPending = isCreating || isUpdating
  const motionEnabled = useMotionEnabled()

  // Local visible state so exit animations complete before parent unmounts
  const [visible, setVisible]         = useState(true)
  const [photoFile, setPhotoFile]     = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [direction, setDirection]     = useState<1 | -1>(1)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Detect mobile at mount time — safe: component only ever mounts on click
  const [isMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  )

  const {
    register,
    handleSubmit,
    formState: { errors },
    trigger,
    reset,
  } = useForm<StudentFormValues, unknown, CreateStudentInput>({
    resolver: zodResolver(CreateStudentSchema),
    defaultValues: { nationality: 'Malawian' },
  })

  // Populate the form once the existing student record resolves (edit mode only)
  useEffect(() => {
    if (existingStudent) {
      reset(mapStudentToFormValues(existingStudent))
    }
  }, [existingStudent, reset])

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleClose() {
    setVisible(false)
    // onClose() is called by AnimatePresence onExitComplete
  }

  function handlePhotoChange(file: File, preview: string) {
    setPhotoFile(file)
    setPhotoPreview(preview)
  }

  async function handleNext() {
    const fields = [...STEP_FIELDS[currentStep]!] as Array<keyof StudentFormValues>
    const valid  = await trigger(fields)
    if (!valid) return
    setDirection(1)
    setCurrentStep((s) => Math.min(s + 1, STEP_COUNT - 1))
  }

  function handleBack() {
    setDirection(-1)
    setCurrentStep((s) => Math.max(s - 1, 0))
  }

  async function uploadPhotoIfNeeded(id: string) {
    if (!photoFile) return
    const formData = new FormData()
    formData.append('photo', photoFile)
    const token = await getAuth().currentUser?.getIdToken()
    await fetch(
      buildApiUrl(`/students/${id}/photo`),
      {
        method:  'POST',
        headers: { Authorization: `Bearer ${token ?? ''}` },
        body:    formData,
      },
    ).catch((e) => console.error('Photo upload failed:', e))
  }

  async function onSubmit(data: CreateStudentInput) {
    setSubmitError(null)
    if (isEdit) {
      updateStudent(
        { id: studentId!, ...data },
        {
          onSuccess: async () => {
            await uploadPhotoIfNeeded(studentId!)
            handleClose()
          },
          onError: (err) => {
            setSubmitError(err instanceof Error ? err.message : 'Failed to save changes. Please try again.')
          },
        },
      )
    } else {
      createStudent(data, {
        onSuccess: async (student) => {
          await uploadPhotoIfNeeded(student.id)
          handleClose()
        },
        onError: (err) => {
          setSubmitError(err instanceof Error ? err.message : 'Failed to create student. Please try again.')
        },
      })
    }
  }

  // Runs when handleSubmit's validation fails. Previously a client-side
  // validation failure produced no visible response at all (the submit handler
  // simply never fired). Now it always surfaces a message, and on mobile it
  // jumps to the first step that contains an invalid field so the user can see
  // and fix it.
  function onInvalid(formErrors: typeof errors) {
    const firstStep = STEP_FIELDS.findIndex((stepFields) =>
      stepFields.some((f) => formErrors[f as keyof typeof formErrors]),
    )
    if (firstStep >= 0 && firstStep !== currentStep) {
      setDirection(firstStep > currentStep ? 1 : -1)
      setCurrentStep(firstStep)
    }
    setSubmitError('Please complete the highlighted required fields before submitting.')
  }

  // ── Shared section props ────────────────────────────────────────────────────
  const sectionProps = { register, errors }

  // Animation variant sets
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

  const stepVariants = motionEnabled
    ? STEP_VARIANTS
    : {
        enter:  () => ({ opacity: 0 }),
        center: { opacity: 1 },
        exit:   () => ({ opacity: 0 }),
      }

  // ── SHARED: section content array indexed by step ──────────────────────────
  const stepSections = [
    <PersonalSection key="personal" {...sectionProps} />,
    <AcademicSection key="academic" {...sectionProps} />,
    <ContactSection  key="contact"  {...sectionProps} />,
  ]

  // ═══════════════════════════════════════════════════════════════════════════
  // MOBILE RENDER — bottom sheet + stepped navigation
  // ═══════════════════════════════════════════════════════════════════════════

  if (isMobile) {
    return (
      <AnimatePresence onExitComplete={onClose}>
        {visible && (
          <>
            {/* Backdrop */}
            <motion.div
              key="mobile-form-backdrop"
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={backdropTransition}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]"
              onClick={handleClose}
              aria-hidden
            />

            {/* Bottom sheet */}
            <motion.div
              key="mobile-form-sheet"
              variants={sheetVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="fixed inset-x-0 bottom-0 z-50 flex flex-col bg-surface rounded-t-2xl shadow-2xl max-h-[92dvh] overflow-hidden"
              style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
              role="dialog"
              aria-label={isEdit ? 'Edit student' : 'Add new student'}
              aria-modal="true"
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1 shrink-0" aria-hidden>
                <span className="w-10 h-1 rounded-full bg-muted/25" />
              </div>

              {/* Sheet header — title + step indicator + close */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-base shrink-0">
                <div className="min-w-0">
                  <h2 className="font-heading font-bold text-base text-body">
                    {isEdit ? 'Edit Student' : 'Add Student'}
                  </h2>
                  <p className="text-xs text-muted mt-0.5">
                    Step {currentStep + 1} of {STEP_COUNT} — {STEPS[currentStep]!.label}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <StepIndicator
                    currentStep={currentStep}
                    motionEnabled={motionEnabled}
                  />
                  <button
                    type="button"
                    onClick={handleClose}
                    className="min-h-11 min-w-11 flex items-center justify-center rounded-xl text-muted hover:bg-page hover:text-body transition-colors"
                    aria-label="Close form"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Scrollable step content */}
              <form
                onSubmit={handleSubmit(onSubmit, onInvalid)}
                className="flex-1 overflow-y-auto flex flex-col"
              >
                {/* Photo upload — Step 1 only */}
                {currentStep === 0 && (
                  <PhotoUpload
                    preview={photoPreview}
                    onChange={handlePhotoChange}
                    compact
                  />
                )}

                {/* Animated step panel */}
                <div className="flex-1 overflow-hidden relative">
                  <AnimatePresence custom={direction} mode="wait" initial={false}>
                    <motion.div
                      key={currentStep}
                      custom={direction}
                      variants={stepVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={STEP_TRANSITION}
                      className="px-5 py-5"
                    >
                      {stepSections[currentStep]}
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Submit error */}
                {submitError && currentStep === STEP_COUNT - 1 && (
                  <p
                    role="alert"
                    className="mx-5 mb-3 flex items-start gap-2 text-xs text-brand-coral bg-brand-coral/8 border border-brand-coral/20 rounded-xl px-4 py-3"
                  >
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
                    {submitError}
                  </p>
                )}

                {/* Step navigation footer */}
                <div className="shrink-0 px-5 py-4 border-t border-base bg-surface flex items-center justify-between gap-3">
                  {/* Back button — hidden on step 0 */}
                  {currentStep > 0 ? (
                    <button
                      type="button"
                      onClick={handleBack}
                      className="flex items-center gap-1.5 min-h-11 px-5 rounded-xl text-sm font-heading font-semibold text-muted border border-base hover:bg-page transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" aria-hidden />
                      Back
                    </button>
                  ) : (
                    <div />
                  )}

                  {/* Next / Submit */}
                  {currentStep < STEP_COUNT - 1 ? (
                    <button
                      type="button"
                      onClick={handleNext}
                      className="flex items-center gap-1.5 min-h-11 px-5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" aria-hidden />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={isPending}
                      className="flex items-center gap-2 min-h-11 px-6 rounded-xl text-sm font-heading font-semibold bg-brand-teal text-white hover:bg-brand-teal/90 transition-colors disabled:opacity-60"
                    >
                      {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />}
                      {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Student'}
                    </button>
                  )}
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DESKTOP RENDER — centred dialog, all sections visible simultaneously
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <AnimatePresence onExitComplete={onClose}>
      {visible && (
        <motion.div
          key="desktop-form-overlay"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={backdropTransition}
        >
          {/* Dim backdrop */}
          <div
            className="absolute inset-0 bg-brand-navy/50 backdrop-blur-sm"
            onClick={handleClose}
            aria-hidden
          />

          {/* Dialog panel */}
          <motion.div
            key="desktop-form-dialog"
            variants={dialogVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={dialogTransition}
            className="relative z-10 w-full max-w-2xl bg-surface rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]"
            role="dialog"
            aria-label={isEdit ? 'Edit student' : 'Add new student'}
            aria-modal="true"
          >
            {/* Dialog header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-base shrink-0">
              <div>
                <h2 className="font-heading font-bold text-lg text-brand-navy">
                  {isEdit ? 'Edit Student' : 'Add New Student'}
                </h2>
                <p className="text-xs text-muted font-sans mt-0.5">
                  {isEdit
                    ? 'Update student record details.'
                    : "Fill in the student's details to create a new record."}
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="min-h-11 min-w-11 flex items-center justify-center rounded-xl hover:bg-page text-muted hover:text-body transition-colors"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable form body */}
            <form
              onSubmit={handleSubmit(onSubmit, onInvalid)}
              className="flex-1 overflow-y-auto flex flex-col"
            >
              {/* Photo upload row */}
              <PhotoUpload
                preview={photoPreview}
                onChange={handlePhotoChange}
              />

              {/* All sections — 2-column grid, sections separated by FieldDividers */}
              <div className="px-6 py-5 space-y-1">
                {/* Personal section */}
                <div className="grid grid-cols-2 gap-x-5 gap-y-1">
                  <FieldDivider title="Personal Details" />
                </div>
                <PersonalSection {...sectionProps} />

                {/* Academic section */}
                <div className="grid grid-cols-2 gap-x-5 gap-y-1 mt-2">
                  <FieldDivider title="Academic Details" />
                </div>
                <AcademicSection {...sectionProps} />

                {/* Contact section */}
                <div className="grid grid-cols-2 gap-x-5 gap-y-1 mt-2">
                  <FieldDivider title="Contact Details" />
                </div>
                <ContactSection {...sectionProps} />

                {submitError && (
                  <p
                    role="alert"
                    className="flex items-start gap-2 text-xs text-brand-coral bg-brand-coral/8 border border-brand-coral/20 rounded-xl px-4 py-3 mt-2"
                  >
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
                    {submitError}
                  </p>
                )}
              </div>

              {/* Dialog footer — sticky actions */}
              <div className="px-6 py-4 border-t border-base bg-surface flex items-center justify-end gap-3 shrink-0 mt-auto">
                <button
                  type="button"
                  onClick={handleClose}
                  className="min-h-11 px-5 rounded-xl text-sm font-heading font-semibold text-muted border border-base hover:bg-page transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="min-h-11 px-6 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors flex items-center gap-2 disabled:opacity-60"
                >
                  {isPending && (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                  )}
                  {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Student'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}