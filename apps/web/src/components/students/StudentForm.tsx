'use client'

/**
 * [CHANGE TYPE]: TARGETED EDIT (2026-11-04, student form brought level with the application form)
 * [PURPOSE]: Creating a student now collects the same record the profile shows and
 *   the /apply form asks for. New "Welfare" step (create mode, roles with
 *   student.editWelfare): orphan status, vulnerability, health / medical alert,
 *   special needs. Welfare is not part of CreateStudentSchema by design, so after the
 *   student is created the draft is saved through the existing welfare endpoints
 *   (permission-checked and audited). If that save fails the student still exists,
 *   so the form closes and a toast points at the profile's Welfare card instead of
 *   leaving the form open to be submitted twice. Editing an existing student does not
 *   show the step: the profile's Welfare card is where welfare is edited.
 *
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

import { useState, useEffect, useRef } from 'react'
import { useIsMobileSync }          from '@/hooks/use-mobile'
import { createPortal }             from 'react-dom'
import { z }                        from 'zod'
import { useForm }                  from 'react-hook-form'
import { zodResolver }              from '@hookform/resolvers/zod'
import { AnimatePresence, motion }  from 'framer-motion'
import { Check, CheckCircle2, ChevronLeft, ChevronRight, Copy, Loader2, User, X, AlertCircle } from 'lucide-react'
import Image                        from 'next/image'
import { toast }                    from 'sonner'
import { CreateStudentSchema, UpdateWelfareSchema, SupportNeedInputSchema } from '@shared/schemas/student'
import type { CreateStudentInput }  from '@shared/schemas/student'

// CreateStudentSchema has defaulted/required transforms (nationality default,
// email) so its INPUT type differs from CreateStudentInput (the output). useForm
// is parameterised with both to keep the resolver and submit handler aligned —
// this replaces the previous `as Resolver<>` cast, which silently bypassed the
// type check (and hid exactly this kind of input/output mismatch).
type StudentFormValues = z.input<typeof CreateStudentSchema>
import type { ApiStudent }          from '@shared/types/api'
import { useCreateStudent, useUpdateStudent, useStudent } from '@/hooks/useStudents'
import { Modal, MODAL_BTN_PRIMARY } from '@/components/shared/Modal'
import { usePermissions }           from '@/hooks/usePermissions'
import { apiFetch }                 from '@/lib/api-client'
import { StudentFeeStructure } from '@/components/students/StudentFeeStructure'
import { uploadFileDirectly } from '@/lib/directUpload'
import { useMotionEnabled }         from '@/store/motionStore'
import {
  decideClose,
  isUserEdit,
  UNSAVED_TITLE,
  UNSAVED_BODY,
  UNSAVED_KEEP,
  UNSAVED_DISCARD,
} from '@/lib/hills/unsaved'
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
  WelfareSection,
  FieldDivider,
  STEP_FIELDS,
  EMPTY_WELFARE_DRAFT,
  welfareDraftHasData,
  type WelfareDraft,
} from '@/components/students/StudentFormSections'

// ─────────────────────────────────────────────────────────────────────────────
// STEP CONFIG
// ─────────────────────────────────────────────────────────────────────────────

const BASE_STEPS = [
  { label: 'Personal',  shortLabel: '1' },
  { label: 'Academic',  shortLabel: '2' },
  { label: 'Contact',   shortLabel: '3' },
] as const

// Only offered when creating a student and the user may record welfare data.
const WELFARE_STEP = { label: 'Welfare', shortLabel: '4' } as const

type StepDef = { readonly label: string; readonly shortLabel: string }

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
  steps,
  currentStep,
  motionEnabled,
}: {
  steps: readonly StepDef[]
  currentStep: number
  motionEnabled: boolean
}) {
  return (
    <div className="flex items-center gap-0 justify-center" role="list" aria-label="Form steps">
      {steps.map((step, idx) => {
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
                'text-xs font-heading font-bold transition-colors',
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
            {idx < steps.length - 1 && (
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
          className="cursor-pointer text-sm font-heading font-semibold text-tone-teal hover:text-brand-teal/80 transition-colors"
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
    otherNames:       s.otherNames,
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
    nrbNumber:            s.nrbNumber ?? '',
    traditionalAuthority: s.traditionalAuthority ?? '',
    religion:             s.religion ?? '',
    homeLanguage:         s.homeLanguage ?? '',
    physicalAddress:      s.physicalAddress ?? '',
    admissionType:        s.admissionType ?? 'NEW_INTAKE',
    previousSchool:       s.previousSchool ?? '',
    reasonForTransfer:    s.reasonForTransfer ?? '',
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
  const { can } = usePermissions()

  // Welfare is collected on create only, and only for roles allowed to record it
  // (the server enforces student.editWelfare again on each welfare request).
  const withWelfare = !isEdit && can('student.editWelfare')
  const steps: readonly StepDef[] = withWelfare ? [...BASE_STEPS, WELFARE_STEP] : BASE_STEPS
  const stepCount = steps.length
  const [welfare, setWelfare] = useState<WelfareDraft>(EMPTY_WELFARE_DRAFT)

  // Local visible state so exit animations complete before parent unmounts
  const [visible, setVisible]         = useState(true)
  const [photoFile, setPhotoFile]     = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState(0)
  const [direction, setDirection]     = useState<1 | -1>(1)
  const [submitError, setSubmitError] = useState<string | null>(null)
  // Set after a successful create when the server returned a temporary password.
  const [created, setCreated] = useState<{ name: string; email: string; tempPassword: string } | null>(null)
  const [copied, setCopied]   = useState(false)

  // Unsaved-changes warning — the same rule and wording as the staff form (the
  // shared dialog, lib/hills/unsaved.ts): once anything has been entered, the X,
  // an outside click and Escape ask "Keep editing / Discard changes" instead of
  // closing silently. A form nobody has typed in closes at once. The footer's
  // Cancel button and the close after a successful save are unchanged.
  const [typedIn, setTypedIn] = useState(false)
  const [asking, setAsking]   = useState(false)

  // Live breakpoint (was a one-shot read at mount, so resizing or rotating
  // with the form open left the wrong layout). Form state lives in this
  // component, so switching sheet <-> dialog keeps everything the user typed.
  const isMobile = useIsMobileSync()

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
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

  // Anything entered counts: typed or picked fields (user-caused input events),
  // fields set from code that react-hook-form tracks, a chosen photo, or welfare.
  const dirty = typedIn || isDirty || photoFile !== null || welfare !== EMPTY_WELFARE_DRAFT

  /** Close request from the X, the backdrop or Escape. */
  function attemptClose() {
    const decision = decideClose({ busy: isPending, guarded: true, dirty, asking })
    if (decision === 'close') handleClose()
    else if (decision === 'ask') setAsking(true)
    else if (decision === 'keep-editing') setAsking(false)
  }
  const attemptCloseRef = useRef(attemptClose)
  useEffect(() => {
    attemptCloseRef.current = attemptClose
  })

  useEffect(() => {
    if (!visible || created) return
    const onKeyDown = (e: KeyboardEvent) => {
      // A picker inside the form may call preventDefault() on Escape to close itself first.
      if (e.key !== 'Escape' || e.defaultPrevented) return
      e.preventDefault()
      attemptCloseRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [visible, created])

  /** Marks the form as typed in; fired by input events bubbling up from any field. */
  function handleFormInput(e: React.FormEvent<HTMLFormElement>) {
    if (isUserEdit(e.nativeEvent)) setTypedIn(true)
  }

  function handlePhotoChange(file: File, preview: string) {
    setPhotoFile(file)
    setPhotoPreview(preview)
  }

  async function copyPassword() {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.tempPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable: the password can be selected by hand */
    }
  }

  async function handleNext() {
    const fields = [...STEP_FIELDS[currentStep]!] as Array<keyof StudentFormValues>
    const valid  = await trigger(fields)
    if (!valid) return
    setDirection(1)
    setCurrentStep((s) => Math.min(s + 1, stepCount - 1))
  }

  function handleBack() {
    setDirection(-1)
    setCurrentStep((s) => Math.max(s - 1, 0))
  }

  async function uploadPhotoIfNeeded(id: string) {
    if (!photoFile) return
    // [PRODUCTION FIX] This called POST /students/:id/photo, a route that
    // was never actually defined anywhere on the backend — every student
    // photo upload has been silently 404ing since this form was written
    // (the failure was swallowed by .catch(console.error) below, never
    // shown to the user). Built as a direct-to-R2 upload against the
    // newly-added backend route, matching the rest of the app's upload
    // flows, rather than fixing the old multipart route and having to
    // convert it again later.
    try {
      await uploadFileDirectly(`/students/${id}/photo/upload-ticket`, photoFile)
    } catch (e) {
      console.error('Photo upload failed:', e)
    }
  }

  /** Builds the welfare requests from the draft, or returns the first validation message. */
  function buildWelfareRequests():
    | { error: string }
    | { welfare: ReturnType<typeof UpdateWelfareSchema.parse> | null; needs: Array<ReturnType<typeof SupportNeedInputSchema.parse>> } {
    if (!withWelfare || !welfareDraftHasData(welfare)) return { welfare: null, needs: [] }

    const body: Record<string, unknown> = {}
    if (welfare.orphanStatus !== 'UNKNOWN')   body.orphanStatus = welfare.orphanStatus
    if (welfare.isVulnerable)                 body.isVulnerable = true
    if (welfare.vulnerabilityNote.trim())     body.vulnerabilityNote = welfare.vulnerabilityNote
    if (welfare.medicalAlert.trim())          body.medicalAlert = welfare.medicalAlert
    const parsedWelfare = Object.keys(body).length > 0 ? UpdateWelfareSchema.safeParse(body) : null
    if (parsedWelfare && !parsedWelfare.success) {
      return { error: parsedWelfare.error.issues[0]?.message ?? 'Check the welfare details.' }
    }

    const needs: Array<ReturnType<typeof SupportNeedInputSchema.parse>> = []
    for (const n of welfare.needs) {
      const parsed = SupportNeedInputSchema.safeParse({
        type: n.type,
        accommodation: n.accommodation,
        assistiveDevice: n.assistiveDevice,
      })
      if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the special needs.' }
      needs.push(parsed.data)
    }
    return { welfare: parsedWelfare && parsedWelfare.success ? parsedWelfare.data : null, needs }
  }

  /** Saves the welfare draft against the new student. Never throws: the student already exists. */
  async function saveWelfare(id: string, req: Exclude<ReturnType<typeof buildWelfareRequests>, { error: string }>) {
    if (!req.welfare && req.needs.length === 0) return
    try {
      if (req.welfare) {
        await apiFetch(`/students/${id}/welfare`, { method: 'PATCH', body: JSON.stringify(req.welfare) })
      }
      for (const need of req.needs) {
        await apiFetch(`/students/${id}/support-needs`, { method: 'POST', body: JSON.stringify(need) })
      }
    } catch (e) {
      console.error('Welfare save failed:', e)
      toast.error('Student created, but the welfare details could not be saved. Add them from the student profile.')
    }
  }

  async function onSubmit(data: CreateStudentInput) {
    setSubmitError(null)
    const welfareRequests = buildWelfareRequests()
    if ('error' in welfareRequests) {
      setSubmitError(welfareRequests.error)
      return
    }
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
          await saveWelfare(student.id, welfareRequests)
          await uploadPhotoIfNeeded(student.id)
          if (student.tempPassword) {
            setCreated({
              name:         `${data.firstName} ${data.lastName}`.trim(),
              email:        data.email,
              tempPassword: student.tempPassword,
            })
          } else {
            handleClose()
          }
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
  const sectionProps = { register, errors, selectedClassId: existingStudent?.classId }

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
    ...(withWelfare
      ? [<WelfareSection key="welfare" value={welfare} onChange={setWelfare} />]
      : []),
  ]

  // The question shown over the form (same markup and wording as the shared dialog).
  const unsavedPrompt = (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="student-form-unsaved-title"
      aria-describedby="student-form-unsaved-body"
      className="app-unsaved absolute inset-0 z-10 flex items-end justify-center bg-brand-navy/40 p-4 sm:items-center"
    >
      <div className="w-full max-w-sm rounded-[14px] border border-base bg-surface p-5 shadow-xl">
        <h3 id="student-form-unsaved-title" className="font-heading text-base font-bold text-brand-navy">
          {UNSAVED_TITLE}
        </h3>
        <p id="student-form-unsaved-body" className="mt-1 text-sm text-muted">
          {UNSAVED_BODY}
        </p>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="inline-flex items-center justify-center gap-2 min-h-11 px-5 rounded-xl text-sm font-heading font-semibold transition-colors border border-base text-tone-coral hover:bg-page"
          >
            {UNSAVED_DISCARD}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => setAsking(false)}
            className="inline-flex items-center justify-center gap-2 min-h-11 px-5 rounded-xl text-sm font-heading font-semibold transition-colors bg-btn-brand text-btn-brand-fg hover:bg-btn-brand-hover"
          >
            {UNSAVED_KEEP}
          </button>
        </div>
      </div>
    </div>
  )

  // [PRODUCTION FIX] Both render paths below now portal directly under
  // <body> instead of rendering inline in the page tree — same reasoning
  // as AnnouncementForm.tsx/StaffForm.tsx: escapes the page-transition
  // wrapper's stacking context/containing-block entirely.
  if (typeof document === 'undefined') return null

  // After a successful create, show the temporary password in a dialog (same as
  // the staff form). The form is unmounted; Done closes everything.
  if (created) {
    return (
      <Modal
        title="Student account created"
        onClose={onClose}
        size="m"
        footer={
          <button type="button" onClick={onClose} className={MODAL_BTN_PRIMARY}>
            Done
          </button>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2 text-sm text-body bg-status-success/10 rounded-xl px-4 py-3">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
            <span>
              {created.name}&apos;s account was created. A welcome email with the login
              details was sent to <strong>{created.email}</strong>. If it does not
              arrive, give the temporary password below to the student.
            </span>
          </div>
          <div>
            <span className="block text-xs font-semibold text-muted mb-1.5">Temporary password</span>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-page border border-base rounded-xl px-4 py-3 text-sm break-all">
                {created.tempPassword}
              </code>
              <button
                type="button"
                onClick={copyPassword}
                className="shrink-0 border border-base rounded-xl px-3 py-3 text-xs hover:bg-page min-h-11 flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" aria-hidden />
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-muted mt-1.5">
              The student will be asked to change this at first login.
            </p>
          </div>
        </div>
      </Modal>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MOBILE RENDER — bottom sheet + stepped navigation
  // ═══════════════════════════════════════════════════════════════════════════

  if (isMobile) {
    return createPortal(
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
              onClick={attemptClose}
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
              {asking && unsavedPrompt}

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
                    Step {currentStep + 1} of {stepCount} - {steps[currentStep]!.label}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <StepIndicator
                    steps={steps}
                    currentStep={currentStep}
                    motionEnabled={motionEnabled}
                  />
                  <button
                    type="button"
                    onClick={attemptClose}
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
                onInput={handleFormInput}
                className="flex-1 min-h-0 overflow-hidden flex flex-col"
              >
                {/* Photo upload — Step 1 only */}
                {currentStep === 0 && (
                  <PhotoUpload
                    preview={photoPreview}
                    onChange={handlePhotoChange}
                    compact
                  />
                )}

                {/* Animated step panel — the real scroll owner. Vertical
                    overflow now scrolls here (previously this div's plain
                    overflow-hidden silently clipped fields below the fold,
                    while the outer form's overflow-y-auto never had
                    anything to scroll); horizontal stays clipped to keep
                    masking the AnimatePresence slide transition between
                    steps. */}
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative">
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

                {/* [PRODUCTION FIX] Mirrors StaffForm.tsx's SalarySection
                    for students — shown on the final mobile step only,
                    same gating pattern as the submit-error message right
                    below (isEdit + last step), so it doesn't compete with
                    the personal/academic fields on earlier steps. */}
                {isEdit && studentId && currentStep === stepCount - 1 && (
                  <div className="mx-5 mb-3">
                    <StudentFeeStructure studentId={studentId} />
                  </div>
                )}

                {/* Submit error */}
                {submitError && currentStep === stepCount - 1 && (
                  <p
                    role="alert"
                    className="mx-5 mb-3 flex items-start gap-2 text-xs text-tone-coral bg-brand-coral/8 border border-brand-coral/20 rounded-xl px-4 py-3"
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
                  {currentStep < stepCount - 1 ? (
                    <button
                      type="button"
                      onClick={handleNext}
                      className="flex items-center gap-1.5 min-h-11 px-5 rounded-xl text-sm font-heading font-semibold bg-brand-deep text-white hover:brightness-110 transition-colors"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" aria-hidden />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={isPending}
                      className="flex items-center gap-2 min-h-11 px-6 rounded-xl text-sm font-heading font-semibold bg-btn-brand text-btn-brand-fg hover:bg-btn-brand-hover transition-colors disabled:opacity-60"
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
      </AnimatePresence>,
      document.body,
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DESKTOP RENDER — centred dialog, all sections visible simultaneously
  // ═══════════════════════════════════════════════════════════════════════════

  return createPortal(
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
            onClick={attemptClose}
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
            {asking && unsavedPrompt}

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
                onClick={attemptClose}
                className="min-h-11 min-w-11 flex items-center justify-center rounded-xl hover:bg-page text-muted hover:text-body transition-colors"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable form body */}
            <form
              onSubmit={handleSubmit(onSubmit, onInvalid)}
              onInput={handleFormInput}
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
                  <FieldDivider title="Personal details" />
                </div>
                <PersonalSection {...sectionProps} />

                {/* Academic section */}
                <div className="grid grid-cols-2 gap-x-5 gap-y-1 mt-2">
                  <FieldDivider title="Academic details" />
                </div>
                <AcademicSection {...sectionProps} />

                {/* Contact section */}
                <div className="grid grid-cols-2 gap-x-5 gap-y-1 mt-2">
                  <FieldDivider title="Contact details" />
                </div>
                <ContactSection {...sectionProps} />

                {/* Welfare & Health — create mode, student.editWelfare only */}
                {withWelfare && (
                  <>
                    <div className="grid grid-cols-2 gap-x-5 gap-y-1 mt-2">
                      <FieldDivider title="Welfare and health" />
                    </div>
                    <WelfareSection value={welfare} onChange={setWelfare} />
                  </>
                )}

                {/* [PRODUCTION FIX] Mirrors StaffForm.tsx's SalarySection
                    for students — "how staff has a salary structure,
                    student should also have a tab of all the fees
                    structure." Only shown once a student record exists
                    (needs the studentId to look up invoices/fee
                    structures against). */}
                {isEdit && studentId && (
                  <div className="mt-2">
                    <StudentFeeStructure studentId={studentId} />
                  </div>
                )}

                {submitError && (
                  <p
                    role="alert"
                    className="flex items-start gap-2 text-xs text-tone-coral bg-brand-coral/8 border border-brand-coral/20 rounded-xl px-4 py-3 mt-2"
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
                  className="min-h-11 px-6 rounded-xl text-sm font-heading font-semibold bg-brand-deep text-white hover:brightness-110 transition-colors flex items-center gap-2 disabled:opacity-60"
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
    </AnimatePresence>,
    document.body,
  )
}