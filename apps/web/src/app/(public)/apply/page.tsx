/**
 * [CHANGE TYPE]: TARGETED EDIT (2026-11-04, application form brought level with the student record)
 * [FILE]: apps/web/src/app/(public)/apply/page.tsx
 * [PURPOSE]: The form now collects what the student profile shows, so nothing the
 *   applicant could tell us is lost at admission:
 *   1. Personal: Village (after District and T/A) and an optional National ID
 *      (NRB / birth certificate number); both Malawian-applicant fields, like District.
 *   2. Academic step gains the full "Home & Admission" group: where the learner
 *      stays, travel time, admission type, previous school, reason for transfer.
 *   3. New optional "Welfare" step (before Review): orphan status, vulnerability,
 *      health / medical alert and special needs. The labels match the student
 *      profile ("Special needs", not "Support needs").
 *   4. The Review step lists the new answers.
 *   Fields that only exist once a student is registered (class, status, fees) are
 *   deliberately not asked here.
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/app/(public)/apply/page.tsx
 * [R-PHASE]: R5, Academics I: Admissions & Student Records
 * [PURPOSE]: Imports the unified ApplicationSchema from
 *   @shared/schemas/student in place of the local ApplicationSchema
 *   definition, the local schema's field set (firstName/otherNames/
 *   surname/classApplying/guardianRelationship/countryCode/
 *   guardianCountryCode) is now the canonical, server-validated shape, so
 *   no field renaming is needed here. The one real change: `sex`'s <select>
 *   options move from lowercase 'male'/'female' to uppercase 'MALE'/
 *   'FEMALE', matching SexSchema (the canonical schema now used for both
 *   client and server validation) and the real Prisma Sex enum, the
 *   previous lowercase values matched neither. No other change to the
 *   5-step form UI structure.
 * [DEPENDS ON]: @shared/schemas/student (ApplicationSchema)
 *
 * [CHANGE TYPE]: TARGETED EDIT (production fix, 2026-08-25).
 * [PURPOSE]: Academic Year dropdown was a hardcoded ['2026','2027','2028']
 *   array, a fixed, unmaintained placeholder (would run out entirely once
 *   2029 arrived), in the wrong format besides ("2026" vs the "YYYY/YYYY"
 *   format used everywhere else in the system for an academic year), and
 *   the value it collected was never read back anywhere downstream
 *   (applicationService.ts only writes it; the staff review pages and the
 *   application→student conversion route never read it, conversion takes
 *   an explicit classId instead). NOTE: this exact fix was previously
 *   *documented* right here without actually being applied to the code
 *   below (the hardcoded array and the '2027' default were both still
 *   live), this revision is the one that actually wires it in.
 * [CHANGE TYPE]: TARGETED EDIT (production fix, 2026-08-27), three fixes
 *   in the same session:
 *   1. Academic Year dropdown now genuinely uses the shared
 *      <AcademicYearSelect> (apps/web/src/components/shared/
 *      AcademicYearSelect.tsx, new this session) instead of the stale
 *      hardcoded array, it computes options from
 *      getAcademicYearOptions(schoolInfo.currentYear, { back: 0, forward: 1 })
 *      (`back: 0` since an applicant only ever applies for the current or
 *      next intake, never a past one), where schoolInfo comes from
 *      usePublicSchoolInfo() (GET /public/school-info, unauthenticated,
 *      the same call the landing page already makes for the same
 *      SETTING_KEYS.CURRENT_ACADEMIC_YEAR value). No useEffect/setValue
 *      dance is needed: it's a plain register()-based uncontrolled
 *      `<select>`, so the browser's normal "select the first rendered
 *      option" behaviour already lands on the current year, the
 *      hardcoded `academicYear: '2027'` default is removed from
 *      defaultValues entirely rather than fought with.
 *   2. Background redesigned to match (public)/login/page.tsx's ambient
 *      backdrop exactly (vignette, colour glow orbs, organic SVG line
 *      art), extracted into the new shared, zero-prop
 *      <AmbientBackground> (apps/web/src/components/shared/
 *      AmbientBackground.tsx) rather than copy-pasted, since it's now used
 *      by two pages. Only the page background changes; the form/success
 *      cards keep their existing bg-surface styling untouched.
 *   3. Fixed a real auto-submit defect: the Next/Submit button occupying
 *      the same tree position swapped its `type` attribute between
 *      "button" (steps 0-3) and "submit" (step 4) with no distinguishing
 *      `key`, so React reused the same DOM node and mutated its `type` in
 *      place, under React's event-dispatch order, the *same* interaction
 *      that advanced the wizard into step 4 could still have its default
 *      browser action evaluated against the button's new "submit" type,
 *      firing the actual application submission before the Review step
 *      ever finished rendering (reported symptom: reaching Review
 *      immediately shows "Submitting…" with no chance to check the
 *      entered data first). Fixed by giving the two button variants
 *      distinct `key`s, converting both to `type="button"` with an
 *      explicit `onClick={handleSubmit(onSubmit)}` on the Review step's
 *      button (no more reliance on native form submission at all), and
 *      the `<form>` itself now only ever calls `e.preventDefault()` on its
 *      own onSubmit, so an Enter keypress on any earlier step can no
 *      longer trigger an implicit submit either.
 *  [CHANGE TYPE]: TARGETED EDIT (2026-08-27, follow-up).
 *  [PURPOSE]: Swapped this page's background from its own local
 *   <AmbientBackground> (apps/web/src/components/shared/AmbientBackground.tsx)
 *   over to the shared <PublicAmbientBackground> (apps/web/src/components/
 *   shared/PublicAmbientBackground.tsx) that now backs every other public
 *   content page (Events, News, the Discover pages, Gallery, Change
 *   Password, Privacy, Terms), so Apply matches that same artwork, the
 *   same `fixed`-positioning fix for long pages, and the same theme-aware
 *   readability scrim, instead of drifting from it as a second,
 *   independently-maintained copy. Only the import and the two render
 *   sites change; nothing else on this page is touched.
 * [DEPENDS ON]: apps/web/src/components/shared/AcademicYearSelect.tsx,
 *   apps/web/src/components/shared/PublicAmbientBackground.tsx
 *
 * [CHANGE TYPE]: TARGETED EDIT (2026-10-08).
 *  1. This page's own sticky header (Home, "Student Application", theme
 *     toggle) was the model for the new shared <PublicHeader />
 *     (components/shared/PublicHeader.tsx), which (public)/layout.tsx now
 *     renders on every public page, so the local copy is removed. Page roots
 *     use `flex-1` instead of `min-h-screen` so they fill the space BELOW
 *     that header rather than overflowing the viewport by its height.
 *  2. Review step: the four detail groups (Personal / Contact / Academic /
 *     Guardian) are no longer wrapped in their own bordered cards inside the
 *     Review panel; they sit directly on the panel, separated by their
 *     headings and spacing.
 *
 * [CHANGE TYPE]: LOOKS ONLY (Chikangawa Hills theme, Phase 5, 2026-11-12).
 * [PURPOSE]: The form moves to the two-column Hills layout. Only class names,
 *   wrappers and JSX text changed; the logic is exactly as before.
 *     - `max-w-3xl mx-auto` is gone. `.hills-container` holds a `.hills-split`:
 *       from 900px the left column (title, required-field note, the step list,
 *       sticky) sits on the sky and the right column is the form on ONE opaque
 *       surface. Below 900px it is one column and the step list becomes a
 *       compact strip of numbered circles above the form.
 *     - The step list is the same STEPS array, the same `step` state and the same
 *       "click only a completed step" rule (`onClick={() => i < step && setStep(i)}`),
 *       drawn as an <ol>. Labels stay in the DOM on phones (visually hidden), so
 *       every step button now has an accessible name there; before they did not.
 *     - Fields use the underlined style (`.hills-ctl`); the field grid is two
 *       columns when the surface is 560px or wider (container query), otherwise one.
 *     - Previous / Step x of y / Next now sit at the foot of the surface.
 *     - The success screen uses the same two columns.
 *   Not touched: react-hook-form, zodResolver, trigger, STEP_FIELDS, goNext,
 *   onSubmit, the Review-step `handleSubmit(onSubmit)` button, every register()
 *   call, name, placeholder, option, label text and error message.
 *   The page no longer shows the interim readability scrim (`hills-open`).
 *
 * [CHANGE (2026-11-13), requested by the user, the one behaviour addition in the
 *   theme work]: the left column is pinned at any window height and scrolls inside
 *   itself when taller than the window; a small effect on `step` scrolls that column
 *   (never the page) so the current step is in view after Next / Previous. It reads
 *   the DOM only; no form, validation or submit logic is touched.
 */
'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useForm, useWatch, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ApplicationSchema } from '@shared/schemas/student'
import type { ApplicationInput } from '@shared/schemas/student'
import {
  MALAWI_DISTRICTS,
  FORM_LABELS,
  RELIGIONS,
  HOME_LANGUAGES,
  RESIDENCE_TYPES,
  RESIDENCE_TYPE_LABELS,
  ADMISSION_TYPES,
  ADMISSION_TYPE_LABELS,
  TRAVEL_MINUTES_MAX,
  ORPHAN_STATUSES,
  ORPHAN_STATUS_LABELS,
  SUPPORT_NEED_TYPES,
  SUPPORT_NEED_LABELS,
} from '@shared/constants/malawi'
import { getCountriesForForm, COUNTRY_CALLING_CODES } from '@shared/constants/countries'
import { GUARDIAN_RELATIONSHIPS } from '@shared/constants/admissions'
import { AcademicYearSelect } from '@/components/shared/AcademicYearSelect'
import { PublicAmbientBackground } from '@/components/shared/PublicAmbientBackground'
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  User,
  Phone,
  BookOpen,
  Users,
  FileText,
  HeartPulse,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'

// -- HELPERS -------------------------------------------------------------------
// Hills look (Phase 5): the underlined field style lives in globals.css
// (`.hills-ctl`, scoped to `.hills-apply__surface`). These strings are class
// names only.
const inputCls = 'hills-ctl'
const inputError = 'hills-ctl--err'
const inputBase = ''
// Sits next to the phone number input in a flex row, so it has a fixed, compact
// width (`.hills-ctl--code`) instead of stretching. Sized to fit the longest
// calling code in COUNTRY_CALLING_CODES (4 characters, e.g. '+265') plus the
// browser's native dropdown arrow.
const phoneCodeSelectCls = 'hills-ctl hills-ctl--code'

function Field({
  label,
  error,
  required,
  children,
  hint,
  className = '',
}: {
  label: string
  error?: string | undefined
  required?: boolean
  children: React.ReactNode
  hint?: string
  className?: string
}) {
  return (
    <div className={className}>
      <label className="hills-fld__label">
        {label}
        {required && <span className="hills-fld__req">*</span>}
      </label>
      {children}
      {hint && !error && <p className="hills-fld__hint">{hint}</p>}
      {error && <p className="hills-fld__err">{error}</p>}
    </div>
  )
}

function SectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: React.ElementType
  title: string
  subtitle: string
}) {
  return (
    <div className="hills-apply__sec">
      <div className="hills-apply__sec-ico">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <h3 className="hills-apply__sec-title">{title}</h3>
        <p className="hills-apply__sec-sub">{subtitle}</p>
      </div>
    </div>
  )
}

// Small heading that splits one step into groups (e.g. "Home & Admission").
function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="col-span-full hills-fld__group">
      {children}
    </p>
  )
}

// A blank <select> means "not answered": send undefined, never '' (which is not a
// valid enum value and would fail validation).
const blankToUndefined = (v: unknown) => (v === '' || v == null ? undefined : v)

// -- MULTI-STEP CONFIG ---------------------------------------------------------
const STEPS = [
  { label: 'Personal', icon: User },
  { label: 'Contact', icon: Phone },
  { label: 'Academic', icon: BookOpen },
  { label: 'Guardian', icon: Users },
  { label: 'Welfare', icon: HeartPulse },
  { label: 'Review', icon: FileText },
]
const REVIEW_STEP = STEPS.length - 1

// -- MAIN COMPONENT ------------------------------------------------------------
export default function ApplyPage() {
  const [step, setStep] = useState(0)
  // The left column is pinned and scrolls inside itself on short windows: when
  // the step changes, bring the current step into view (without moving the page).
  const sideRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const side = sideRef.current
    const el = side?.querySelector<HTMLElement>('[aria-current="step"]')
    if (!side || !el || side.scrollHeight <= side.clientHeight) return
    const s = side.getBoundingClientRect()
    const e = el.getBoundingClientRect()
    if (e.bottom > s.bottom) side.scrollTop += e.bottom - s.bottom + 16
    else if (e.top < s.top) side.scrollTop -= s.top - e.top + 16
  }, [step])
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    trigger,
    setError,
    control,
    formState: { errors },
    getValues,
  } = useForm<ApplicationInput>({
    resolver: zodResolver(ApplicationSchema),
    defaultValues: {
      nationality: 'Malawi',
      countryCode: '+265',
      guardianCountryCode: '+265',
      orphanStatus: 'UNKNOWN',
      isVulnerable: false,
      supportNeeds: [],
    },
  })

  const nationality = useWatch({ control, name: 'nationality' })
  const isMalawian = nationality === 'Malawi'
  const isVulnerable = useWatch({ control, name: 'isVulnerable' })
  const academicYearValue = useWatch({ control, name: 'academicYear' })

  const STEP_FIELDS: (keyof ApplicationInput)[][] = [
    ['firstName', 'surname', 'dateOfBirth', 'sex', 'nationality', 'nrbNumber'],
    ['address', 'countryCode', 'phone', 'email'],
    ['classApplying', 'academicYear', 'travelMinutes'],
    ['guardianName', 'guardianRelationship', 'guardianCountryCode', 'guardianPhone'],
    ['vulnerabilityNote', 'medicalAlert'],
    [],
  ]

  async function goNext() {
    const valid = await trigger(STEP_FIELDS[step])
    if (!valid) return
    // District of origin is required for Malawian applicants. The schema enforces
    // it too, but its cross-field rule only runs once every other step is valid,
    // so the error would surface on the review step where there is no district
    // input. Check it here so it shows beside the field on the step that owns it.
    if (step === 0 && isMalawian && !getValues('district')?.trim()) {
      setError('district', { type: 'custom', message: 'District of origin is required' })
      return
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  async function onSubmit(data: ApplicationInput) {
    setSubmitting(true)
    setServerError(null)
    try {
      const res = await fetch(`/api/applications/public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          // District, T/A, village and National ID are Malawian-applicant fields.
          // If the applicant switched nationality after filling them in, don't send them.
          ...(data.nationality === 'Malawi'
            ? {}
            : { district: undefined, traditionalAuthority: undefined, village: undefined, nrbNumber: undefined }),
          phone: `${data.countryCode}${data.phone.replace(/^0/, '')}`,
          guardianPhone: `${data.guardianCountryCode}${data.guardianPhone.replace(/^0/, '')}`,
        }),
      })
     if (!res.ok) {
        const body = await res.json() as { error?: string; message?: string }
        if (body.error === 'DUPLICATE') {
          setServerError(body.message ?? 'A duplicate application was found. Please contact the admissions office if you believe this is an error.')
        } else {
          throw new Error(body.message ?? body.error ?? 'Submission failed')
        }
        return
      }
      setSubmitted(true)
    } catch (err: unknown) {
      if (err instanceof Error) {
        setServerError(err.message)
      } else {
        setServerError('Failed to submit application. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // -- SUCCESS STATE ----------------------------------------------------------
  if (submitted) {
    return (
      <div className="hills hills-apply hills-open relative flex-1">
        <PublicAmbientBackground />
        <div className="relative z-10 hills-container hills-apply__wrap">
          <div className="hills-split hills-apply__grid">
            <div className="hills-apply__side">
              <div className="hills-apply__tick">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <h1 className="hills-apply__title">Application submitted</h1>
              <p className="hills-apply__note">
                Thank you for applying. Your application has been received and is pending review. You
                will be contacted by the school admissions office with further instructions.
              </p>
            </div>
            <div className="hills-apply__surface">
              <p className="hills-fld__group hills-apply__next-title">What happens next?</p>
              <ul className="hills-apply__next">
                {[
                  'Your application is reviewed by the admissions team',
                  'You will receive an email or phone call within 5–7 working days',
                  'If approved, you will be asked to report for admission',
                  'Bring original school certificates and guardian ID on admission day',
                ].map((item, i) => (
                  <li key={i}>
                    <span className="hills-apply__next-n">{i + 1}</span>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="hills-apply__nav hills-apply__nav--end">
                <Link href="/" className="hills-go hills-go--inline">
                  <ArrowLeft className="w-4 h-4" /> Back to Homepage
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const values = getValues()

  return (
    <div className="hills hills-apply hills-open relative flex-1">
      <PublicAmbientBackground />

      {/* The top bar (Home, "Student Application" title, theme toggle) is the
          shared <PublicHeader />, rendered by (public)/layout.tsx. */}

      <div className="relative z-10 hills-container hills-apply__wrap">
        <div className="hills-split hills-apply__grid hills-apply__grid--form">
          {/* Left (from 900px) / top: title, note and the step list, on the sky. */}
          <div ref={sideRef} className="hills-apply__side hills-apply__side--sticky">
            <h1 className="hills-apply__title">Apply for Admission</h1>
            <p className="hills-apply__note">
              Complete all sections below. Fields marked with{' '}
              <span className="hills-apply__req">*</span> are required.
            </p>

            {/* Progress: vertical list from 900px, a strip of circles below. */}
            <ol className="hills-apply__steps">
              {STEPS.map((s, i) => {
                const Icon = s.icon
                const done = i < step
                const active = i === step
                return (
                  <li
                    key={s.label}
                    className={`hills-apply__step ${done ? 'is-done' : active ? 'is-active' : ''}`}
                  >
                    <button
                      type="button"
                      onClick={() => i < step && setStep(i)}
                      className="hills-apply__stepbtn"
                      aria-current={active ? 'step' : undefined}
                    >
                      <span className="hills-apply__chip">
                        {done ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                      </span>
                      <span className="hills-apply__steplabel">{s.label}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>

          {/* Form surface */}
          {/* [PRODUCTION FIX 2026-08-27] Never rely on native <form> submission,
              see this file's header comment for the full auto-submit defect this
              closes. onSubmit here only ever prevents the browser's default
              action; the Review step's button below calls handleSubmit(onSubmit)
              explicitly, and every other step's button is type="button". */}
          <form onSubmit={(e) => e.preventDefault()} className="hills-apply__form">
            <div className="hills-apply__surface">

            {/* -- STEP 0: Personal Details -- */}
            {step === 0 && (
              <>
                <SectionHeader
                  icon={User}
                  title="Personal Details"
                  subtitle="Legal name and demographic information"
                />
                <div className="hills-apply__fields">
                  <Field label="First Name" required error={errors.firstName?.message}>
                    <input
                      {...register('firstName')}
                      className={`${inputCls} ${errors.firstName ? inputError : inputBase}`}
                      placeholder="Given name"
                    />
                  </Field>
                  <Field label="Other Names" error={errors.otherNames?.message}>
                    <input
                      {...register('otherNames')}
                      className={`${inputCls} ${inputBase}`}
                      placeholder="Middle name(s)"
                    />
                  </Field>
                  <Field label="Surname" required error={errors.surname?.message}>
                    <input
                      {...register('surname')}
                      className={`${inputCls} ${errors.surname ? inputError : inputBase}`}
                      placeholder="Family name"
                    />
                  </Field>
                  <Field label="Date of Birth" required error={errors.dateOfBirth?.message}>
                    <input
                      type="date"
                      {...register('dateOfBirth')}
                      className={`${inputCls} ${errors.dateOfBirth ? inputError : inputBase}`}
                    />
                  </Field>
                  <Field label="Sex" required error={errors.sex?.message}>
                    <select
                      {...register('sex')}
                      className={`${inputCls} ${errors.sex ? inputError : inputBase}`}
                    >
                      <option value="">Select…</option>
                      <option value="MALE">Male</option>
                      <option value="FEMALE">Female</option>
                    </select>
                  </Field>
                  <Field
                    label="Nationality"
                    required
                    error={errors.nationality?.message}
                    className="col-span-full sm:col-span-1"
                  >
                    <select
                      {...register('nationality')}
                      className={`${inputCls} ${errors.nationality ? inputError : inputBase}`}
                    >
                      {getCountriesForForm().map((c) => (
                        <option key={c.code} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {isMalawian && (
                    <>
                      <Field
                        label="District of Origin"
                        required
                        error={errors.district?.message}
                        hint="Malawian applicants only"
                      >
                        <select
                          {...register('district')}
                          className={`${inputCls} ${errors.district ? inputError : inputBase}`}
                        >
                          <option value="">Select district…</option>
                          {MALAWI_DISTRICTS.map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field
                        label="Traditional Authority (T/A)"
                        error={errors.traditionalAuthority?.message}
                        hint="Optional"
                      >
                        <input
                          {...register('traditionalAuthority')}
                          className={`${inputCls} ${inputBase}`}
                          placeholder="Example: T/A Kuntaja"
                        />
                      </Field>
                      <Field label="Village" error={errors.village?.message} hint="Optional">
                        <input
                          {...register('village')}
                          className={`${inputCls} ${inputBase}`}
                          placeholder="Home village"
                          autoComplete="off"
                        />
                      </Field>
                      <Field
                        label="National ID / Birth Certificate No. (NRB)"
                        error={errors.nrbNumber?.message}
                        hint="Optional. Leave blank if not registered"
                      >
                        <input
                          {...register('nrbNumber')}
                          className={`${inputCls} ${errors.nrbNumber ? inputError : inputBase}`}
                          placeholder="NRB number"
                          autoComplete="off"
                        />
                      </Field>
                    </>
                  )}
                  <Field label="Religion" error={errors.religion?.message} hint="Optional">
                    <input
                      {...register('religion')}
                      list="apply-religions"
                      className={`${inputCls} ${inputBase}`}
                      placeholder="Example: Christianity, Islam"
                    />
                    <datalist id="apply-religions">
                      {RELIGIONS.map((r) => <option key={r} value={r} />)}
                    </datalist>
                  </Field>
                  <Field label="Home Language" error={errors.homeLanguage?.message} hint="Optional">
                    <input
                      {...register('homeLanguage')}
                      list="apply-languages"
                      className={`${inputCls} ${inputBase}`}
                      placeholder="Example: Chichewa, Chitumbuka"
                    />
                    <datalist id="apply-languages">
                      {HOME_LANGUAGES.map((l) => <option key={l} value={l} />)}
                    </datalist>
                  </Field>
                </div>
              </>
            )}

            {/* -- STEP 1: Contact Details -- */}
            {step === 1 && (
              <>
                <SectionHeader
                  icon={Phone}
                  title="Contact Details"
                  subtitle="How we can reach the applicant"
                />
                <div className="hills-apply__fields">
                  <Field
                    label="Physical / Postal Address"
                    required
                    error={errors.address?.message}
                    className="col-span-full"
                  >
                    <textarea
                      {...register('address')}
                      rows={2}
                      className={`${inputCls} resize-none ${errors.address ? inputError : inputBase}`}
                      placeholder="Village, Traditional Authority, District"
                    />
                  </Field>
                  <Field label="Phone Number" required error={errors.phone?.message} className="col-span-full">
                    <div className="hills-apply__phone">
                      <select
                        {...register('countryCode')}
                        aria-label="Country calling code"
                        className={`${phoneCodeSelectCls} ${inputBase}`}
                      >
                        {COUNTRY_CALLING_CODES.map((c) => (
                          <option key={c.code} value={c.callingCode}>
                            {c.callingCode} {c.name}
                          </option>
                        ))}
                      </select>
                      <input
                        {...register('phone')}
                        type="tel"
                        className={`${inputCls} flex-1 min-w-0 ${errors.phone ? inputError : inputBase}`}
                        placeholder="999 123 456"
                      />
                    </div>
                  </Field>
                  <Field
                    label="Email Address"
                    error={errors.email?.message}
                    hint="Required, your student login and password will be sent here once admitted"
                    className="col-span-full"
                  >
                    <input
                      {...register('email')}
                      type="email"
                      className={`${inputCls} ${errors.email ? inputError : inputBase}`}
                      placeholder="applicant@example.com"
                    />
                  </Field>
                </div>
              </>
            )}

            {/* -- STEP 2: Academic Details -- */}
            {step === 2 && (
              <>
                <SectionHeader
                  icon={BookOpen}
                  title="Academic Details"
                  subtitle="Class applied for and school background"
                />
                <div className="hills-apply__fields">
                  <Field label="Class Applying For" required error={errors.classApplying?.message}>
                    <select
                      {...register('classApplying')}
                      className={`${inputCls} ${errors.classApplying ? inputError : inputBase}`}
                    >
                      <option value="">Select form…</option>
                      {FORM_LABELS.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Academic Year" required error={errors.academicYear?.message}>
                    <AcademicYearSelect
                      value={academicYearValue}
                      {...register('academicYear')}
                      optionsConfig={{ back: 0, forward: 1 }}
                      className={`${inputCls} ${errors.academicYear ? inputError : inputBase}`}
                    />
                  </Field>

                  <GroupHeading>Home &amp; Admission</GroupHeading>
                  <Field label="Where the Applicant Stays" error={errors.residenceType?.message} hint="Optional">
                    <select
                      {...register('residenceType', { setValueAs: blankToUndefined })}
                      className={`${inputCls} ${inputBase}`}
                      defaultValue=""
                    >
                      <option value="">Not stated</option>
                      {RESIDENCE_TYPES.map((t) => (
                        <option key={t} value={t}>{RESIDENCE_TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Travel Time to School (minutes, one way)"
                    error={errors.travelMinutes?.message}
                    hint="Optional"
                  >
                    <input
                      {...register('travelMinutes', {
                        setValueAs: (v) => (v === '' || v == null || Number.isNaN(Number(v)) ? null : Number(v)),
                      })}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={TRAVEL_MINUTES_MAX}
                      className={`${inputCls} ${errors.travelMinutes ? inputError : inputBase}`}
                      placeholder="e.g. 45"
                    />
                  </Field>
                  <Field
                    label="Admission Type"
                    error={errors.admissionType?.message}
                    hint="Leave blank and the school will decide from the form applied for"
                  >
                    <select
                      {...register('admissionType', { setValueAs: blankToUndefined })}
                      className={`${inputCls} ${inputBase}`}
                      defaultValue=""
                    >
                      <option value="">Not sure</option>
                      {ADMISSION_TYPES.map((t) => (
                        <option key={t} value={t}>{ADMISSION_TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label="Previous School"
                    error={errors.previousSchool?.message}
                    hint="If applying for Form 2, 3 or 4"
                  >
                    <input
                      {...register('previousSchool')}
                      className={`${inputCls} ${inputBase}`}
                      placeholder="Name of previous school"
                    />
                  </Field>
                  <Field
                    label="Reason for Transfer / Application"
                    error={errors.reasonForTransfer?.message}
                    hint="Optional"
                    className="col-span-full"
                  >
                    <textarea
                      {...register('reasonForTransfer')}
                      rows={3}
                      className={`${inputCls} resize-none ${inputBase}`}
                      placeholder="Briefly explain why you are applying to this school…"
                    />
                  </Field>
                </div>
              </>
            )}

            {/* -- STEP 3: Guardian Details -- */}
            {step === 3 && (
              <>
                <SectionHeader
                  icon={Users}
                  title="Guardian / Parent Details"
                  subtitle="Emergency contact and responsible adult"
                />
                <div className="hills-apply__fields">
                  <Field label="Guardian Full Name" required error={errors.guardianName?.message}>
                    <input
                      {...register('guardianName')}
                      className={`${inputCls} ${errors.guardianName ? inputError : inputBase}`}
                      placeholder="Full name"
                    />
                  </Field>
                  <Field
                    label="Relationship to Applicant"
                    required
                    error={errors.guardianRelationship?.message}
                  >
                    <select
                      {...register('guardianRelationship')}
                      className={`${inputCls} ${errors.guardianRelationship ? inputError : inputBase}`}
                    >
                      <option value="">Select relationship…</option>
                      {GUARDIAN_RELATIONSHIPS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Guardian Phone" required error={errors.guardianPhone?.message} className="col-span-full">
                    <div className="hills-apply__phone">
                      <select
                        {...register('guardianCountryCode')}
                        aria-label="Country calling code"
                        className={`${phoneCodeSelectCls} ${inputBase}`}
                      >
                        {COUNTRY_CALLING_CODES.map((c) => (
                          <option key={c.code} value={c.callingCode}>
                            {c.callingCode} {c.name}
                          </option>
                        ))}
                      </select>
                      <input
                        {...register('guardianPhone')}
                        type="tel"
                        className={`${inputCls} flex-1 min-w-0 ${errors.guardianPhone ? inputError : inputBase}`}
                        placeholder="999 123 456"
                      />
                    </div>
                  </Field>
                  <Field
                    label="Guardian Email"
                    error={errors.guardianEmail?.message}
                    hint="Optional"
                    className="col-span-full"
                  >
                    <input
                      {...register('guardianEmail')}
                      type="email"
                      className={`${inputCls} ${inputBase}`}
                      placeholder="guardian@example.com"
                    />
                  </Field>
                  <Field
                    label="Guardian Address"
                    error={errors.guardianAddress?.message}
                    hint="If different from applicant"
                    className="col-span-full"
                  >
                    <textarea
                      {...register('guardianAddress')}
                      rows={2}
                      className={`${inputCls} resize-none ${inputBase}`}
                      placeholder="Village, Traditional Authority, District"
                    />
                  </Field>
                </div>
              </>
            )}

            {/* -- STEP 4: Welfare & Health (optional, sensitive) -- */}
            {step === 4 && (
              <>
                <SectionHeader
                  icon={HeartPulse}
                  title="Welfare & Health"
                  subtitle="Optional. Helps the school give the right support"
                />
                <p className="hills-apply__lead">
                  Everything on this page is optional. It is private: only the headteacher, school
                  administrators and HR can see it.
                </p>
                <div className="hills-apply__fields">
                  <Field label="Orphan Status" error={errors.orphanStatus?.message} className="col-span-full sm:col-span-1">
                    <select
                      {...register('orphanStatus')}
                      className={`${inputCls} ${inputBase}`}
                    >
                      {ORPHAN_STATUSES.map((o) => (
                        <option key={o} value={o}>
                          {o === 'UNKNOWN' ? 'Prefer not to say' : ORPHAN_STATUS_LABELS[o]}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <div className="col-span-full">
                    <label className="hills-chkrow hills-chkrow--top">
                      <input
                        type="checkbox"
                        {...register('isVulnerable')}
                        className="hills-chk"
                      />
                      <span>
                        The applicant needs extra support (vulnerable)
                        <span className="hills-chkrow__sub">
                          For example a child-headed household or serious family hardship.
                        </span>
                      </span>
                    </label>
                  </div>
                  {isVulnerable && (
                    <Field
                      label="Tell Us More"
                      error={errors.vulnerabilityNote?.message}
                      hint="Optional"
                      className="col-span-full"
                    >
                      <textarea
                        {...register('vulnerabilityNote')}
                        rows={3}
                        maxLength={1000}
                        className={`${inputCls} resize-none ${inputBase}`}
                        placeholder="What kind of support would help?"
                      />
                    </Field>
                  )}

                  <Field
                    label="Health / Medical Alert"
                    error={errors.medicalAlert?.message}
                    hint="Conditions or allergies the school should know about"
                    className="col-span-full"
                  >
                    <textarea
                      {...register('medicalAlert')}
                      rows={2}
                      maxLength={500}
                      className={`${inputCls} resize-none ${errors.medicalAlert ? inputError : inputBase}`}
                      placeholder="Example: Asthma, carries an inhaler"
                    />
                  </Field>

                  <div className="col-span-full">
                    <p className="hills-fld__label">Special Needs</p>
                    <p className="hills-fld__hint hills-fld__hint--lead">
                      Tick anything that applies. You can say what would help for each one.
                    </p>
                    <Controller
                      control={control}
                      name="supportNeeds"
                      render={({ field }) => {
                        const list = field.value ?? []
                        const has = (t: (typeof SUPPORT_NEED_TYPES)[number]) => list.some((n) => n.type === t)
                        const toggle = (t: (typeof SUPPORT_NEED_TYPES)[number]) =>
                          field.onChange(has(t) ? list.filter((n) => n.type !== t) : [...list, { type: t }])
                        const setNote = (t: (typeof SUPPORT_NEED_TYPES)[number], accommodation: string) =>
                          field.onChange(list.map((n) => (n.type === t ? { ...n, accommodation } : n)))
                        return (
                          <>
                            <div className="hills-apply__checks">
                              {SUPPORT_NEED_TYPES.map((t) => (
                                <label key={t} className="hills-chkrow">
                                  <input
                                    type="checkbox"
                                    checked={has(t)}
                                    onChange={() => toggle(t)}
                                    className="hills-chk"
                                  />
                                  {SUPPORT_NEED_LABELS[t]}
                                </label>
                              ))}
                            </div>
                            {list.length > 0 && (
                              <div className="hills-apply__needs">
                                {list.map((n) => (
                                  <div key={n.type}>
                                    <label className="hills-fld__label hills-fld__label--sm">
                                      {SUPPORT_NEED_LABELS[n.type]}: what would help? (optional)
                                    </label>
                                    <input
                                      value={n.accommodation ?? ''}
                                      onChange={(e) => setNote(n.type, e.target.value)}
                                      maxLength={300}
                                      className={`${inputCls} ${inputBase}`}
                                      placeholder="Example: Front-row seating, large print, hearing aid"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )
                      }}
                    />
                  </div>
                </div>
              </>
            )}

            {/* -- STEP 5: Review & Submit -- */}
            {step === REVIEW_STEP && (
              <>
                <SectionHeader
                  icon={FileText}
                  title="Review Your Application"
                  subtitle="Please check all details before submitting"
                />
                {[
                  {
                    heading: 'Personal Details',
                    rows: [
                      [
                        'Full Name',
                        `${values.firstName} ${values.otherNames ?? ''} ${values.surname}`.trim(),
                      ],
                      ['Date of Birth', values.dateOfBirth],
                      ['Sex', values.sex],
                      ['Nationality', values.nationality],
                      ...(values.district
                        ? [['District', values.district] as [string, string]]
                        : []),
                      ...(values.traditionalAuthority
                        ? [['Traditional Authority', values.traditionalAuthority] as [string, string]]
                        : []),
                      ...(values.village
                        ? [['Village', values.village] as [string, string]]
                        : []),
                      ...(values.nrbNumber
                        ? [['National ID / Birth Cert.', values.nrbNumber] as [string, string]]
                        : []),
                      ...(values.religion
                        ? [['Religion', values.religion] as [string, string]]
                        : []),
                      ...(values.homeLanguage
                        ? [['Home Language', values.homeLanguage] as [string, string]]
                        : []),
                    ],
                  },
                  {
                    heading: 'Contact Details',
                    rows: [
                      ['Address', values.address],
                      ['Phone', `${values.countryCode} ${values.phone}`],
                      ...(values.email ? [['Email', values.email] as [string, string]] : []),
                    ],
                  },
                  {
                    heading: 'Academic Details',
                    rows: [
                      ['Class Applying For', values.classApplying],
                      ['Academic Year', values.academicYear],
                    ],
                  },
                  {
                    heading: 'Home & Admission',
                    rows: [
                      ['Stays', values.residenceType ? RESIDENCE_TYPE_LABELS[values.residenceType] : ''],
                      ['Travel to School', values.travelMinutes != null ? `${values.travelMinutes} min` : ''],
                      ['Admission', values.admissionType ? ADMISSION_TYPE_LABELS[values.admissionType] : 'Decided by the school'],
                      ['Previous School', values.previousSchool ?? ''],
                      ['Reason for Transfer', values.reasonForTransfer ?? ''],
                    ],
                  },
                  {
                    heading: 'Guardian Details',
                    rows: [
                      ['Name', values.guardianName],
                      ['Relationship', values.guardianRelationship],
                      ['Phone', `${values.guardianCountryCode} ${values.guardianPhone}`],
                      ...(values.guardianEmail
                        ? [['Email', values.guardianEmail] as [string, string]]
                        : []),
                    ],
                  },
                  {
                    heading: 'Welfare & Health',
                    rows: [
                      [
                        'Orphan Status',
                        values.orphanStatus && values.orphanStatus !== 'UNKNOWN'
                          ? ORPHAN_STATUS_LABELS[values.orphanStatus]
                          : 'Prefer not to say',
                      ],
                      ['Needs Extra Support', values.isVulnerable ? `Yes${values.vulnerabilityNote ? `: ${values.vulnerabilityNote}` : ''}` : 'No'],
                      ['Health / Medical Alert', values.medicalAlert ?? ''],
                      [
                        'Special Needs',
                        (values.supportNeeds ?? [])
                          .map((n) => SUPPORT_NEED_LABELS[n.type] + (n.accommodation?.trim() ? ` (${n.accommodation.trim()})` : ''))
                          .join(', '),
                      ],
                    ],
                  },
                ].map(({ heading, rows }) => (
                  // No inner card: each group sits directly on the Review
                  // panel and is told apart by its own heading, not a box.
                  <section key={heading} className="hills-apply__rsec">
                    <h4 className="hills-apply__rh">
                      {heading}
                    </h4>
                    <dl className="hills-apply__dl">
                      {rows.map(([label, value]) => (
                        <div key={label} className="hills-apply__row">
                          <dt className="hills-apply__dt">{label}</dt>
                          <dd className="hills-apply__dd">{value || 'Not provided'}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                ))}
                <p className="hills-apply__confirm">
                  By submitting this application you confirm that all information provided is
                  accurate and complete. Providing false information may result in rejection or
                  cancellation of admission.
                </p>
                {serverError && (
                  <div className="hills-alert hills-alert--danger hills-apply__err">
                    {serverError}
                  </div>
                )}
              </>
            )}

              {/* Navigation buttons */}
              <div className="hills-apply__nav">
                <button
                  type="button"
                  onClick={() => setStep((s) => Math.max(s - 1, 0))}
                  disabled={step === 0}
                  className="hills-apply__prev"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </button>
                <div className="hills-apply__count">
                  Step {step + 1} of {STEPS.length}
                </div>
                {step < STEPS.length - 1 ? (
                  <button
                    key="next-btn"
                    type="button"
                    onClick={goNext}
                    className="hills-go hills-go--inline"
                  >
                    Next <ChevronRight className="hills-go__arrow" />
                  </button>
                ) : (
                  <button
                    key="submit-btn"
                    type="button"
                    onClick={handleSubmit(onSubmit)}
                    disabled={submitting}
                    className="hills-go hills-go--inline hills-go--solid"
                  >
                    {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                    {submitting ? 'Submitting…' : 'Submit Application'}
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
