/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/app/(public)/apply/page.tsx
 * [R-PHASE]: R5 — Academics I: Admissions & Student Records
 * [PURPOSE]: Imports the unified ApplicationSchema from
 *   @shared/schemas/student in place of the local ApplicationSchema
 *   definition — the local schema's field set (firstName/otherNames/
 *   surname/classApplying/guardianRelationship/countryCode/
 *   guardianCountryCode) is now the canonical, server-validated shape, so
 *   no field renaming is needed here. The one real change: `sex`'s <select>
 *   options move from lowercase 'male'/'female' to uppercase 'MALE'/
 *   'FEMALE', matching SexSchema (the canonical schema now used for both
 *   client and server validation) and the real Prisma Sex enum — the
 *   previous lowercase values matched neither. No other change to the
 *   5-step form UI structure.
 * [DEPENDS ON]: @shared/schemas/student (ApplicationSchema)
 *
 * [CHANGE TYPE]: TARGETED EDIT (production fix, 2026-08-25).
 * [PURPOSE]: Academic Year dropdown was a hardcoded ['2026','2027','2028']
 *   array — a fixed, unmaintained placeholder (would run out entirely once
 *   2029 arrived), in the wrong format besides ("2026" vs the "YYYY/YYYY"
 *   format used everywhere else in the system for an academic year), and
 *   the value it collected was never read back anywhere downstream
 *   (applicationService.ts only writes it; the staff review pages and the
 *   application→student conversion route never read it — conversion takes
 *   an explicit classId instead). NOTE: this exact fix was previously
 *   *documented* right here without actually being applied to the code
 *   below (the hardcoded array and the '2027' default were both still
 *   live) — this revision is the one that actually wires it in.
 * [CHANGE TYPE]: TARGETED EDIT (production fix, 2026-08-27) — three fixes
 *   in the same session:
 *   1. Academic Year dropdown now genuinely uses the shared
 *      <AcademicYearSelect> (apps/web/src/components/shared/
 *      AcademicYearSelect.tsx, new this session) instead of the stale
 *      hardcoded array — it computes options from
 *      getAcademicYearOptions(schoolInfo.currentYear, { back: 0, forward: 1 })
 *      (`back: 0` since an applicant only ever applies for the current or
 *      next intake, never a past one), where schoolInfo comes from
 *      usePublicSchoolInfo() (GET /public/school-info, unauthenticated —
 *      the same call the landing page already makes for the same
 *      SETTING_KEYS.CURRENT_ACADEMIC_YEAR value). No useEffect/setValue
 *      dance is needed: it's a plain register()-based uncontrolled
 *      `<select>`, so the browser's normal "select the first rendered
 *      option" behaviour already lands on the current year — the
 *      hardcoded `academicYear: '2027'` default is removed from
 *      defaultValues entirely rather than fought with.
 *   2. Background redesigned to match (public)/login/page.tsx's ambient
 *      backdrop exactly (vignette, colour glow orbs, organic SVG line
 *      art) — extracted into the new shared, zero-prop
 *      <AmbientBackground> (apps/web/src/components/shared/
 *      AmbientBackground.tsx) rather than copy-pasted, since it's now used
 *      by two pages. Only the page background changes; the form/success
 *      cards keep their existing bg-surface styling untouched.
 *   3. Fixed a real auto-submit defect: the Next/Submit button occupying
 *      the same tree position swapped its `type` attribute between
 *      "button" (steps 0-3) and "submit" (step 4) with no distinguishing
 *      `key`, so React reused the same DOM node and mutated its `type` in
 *      place — under React's event-dispatch order, the *same* interaction
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
 *      own onSubmit — so an Enter keypress on any earlier step can no
 *      longer trigger an implicit submit either.
 *  [CHANGE TYPE]: TARGETED EDIT (2026-08-27, follow-up).
 *  [PURPOSE]: Swapped this page's background from its own local
 *   <AmbientBackground> (apps/web/src/components/shared/AmbientBackground.tsx)
 *   over to the shared <PublicAmbientBackground> (apps/web/src/components/
 *   shared/PublicAmbientBackground.tsx) that now backs every other public
 *   content page (Events, News, the Discover pages, Gallery, Change
 *   Password, Privacy, Terms) — so Apply matches that same artwork, the
 *   same `fixed`-positioning fix for long pages, and the same theme-aware
 *   readability scrim, instead of drifting from it as a second,
 *   independently-maintained copy. Only the import and the two render
 *   sites change; nothing else on this page is touched.
 * [DEPENDS ON]: apps/web/src/components/shared/AcademicYearSelect.tsx,
 *   apps/web/src/components/shared/PublicAmbientBackground.tsx
 */
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ApplicationSchema } from '@shared/schemas/student'
import type { ApplicationInput } from '@shared/schemas/student'
import { MALAWI_DISTRICTS, FORM_LABELS } from '@shared/constants/malawi'
import { getCountriesForForm, COUNTRY_CALLING_CODES } from '@shared/constants/countries'
import { GUARDIAN_RELATIONSHIPS } from '@shared/constants/admissions'
import { AcademicYearSelect } from '@/components/shared/AcademicYearSelect'
import { PublicAmbientBackground } from '@/components/shared/PublicAmbientBackground'
import { PublicThemeToggle } from '@/components/shared/PublicThemeToggle'
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  User,
  Phone,
  Mail,
  MapPin,
  BookOpen,
  Users,
  FileText,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react'

// -- HELPERS -------------------------------------------------------------------
const inputCls =
  'w-full border rounded-xl px-4 py-3 text-sm bg-surface text-body placeholder:text-muted ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-teal/25 focus:border-brand-teal transition-all'
const inputError =
  'border-brand-coral focus:ring-brand-coral/25 focus:border-brand-coral bg-brand-coral/5'
const inputBase = 'border-base'
// Deliberately has no `w-full` (unlike inputCls) — this sits next to the phone
// number input in a flex row, so it needs a fixed, compact width instead of
// stretching. Sized to fit the longest calling code in COUNTRY_CALLING_CODES
// (4 characters, e.g. '+265') plus the browser's native dropdown arrow.
const phoneCodeSelectCls =
  'w-24 shrink-0 truncate border rounded-xl pl-3 pr-1 py-3 text-sm bg-surface text-body ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-teal/25 focus:border-brand-teal transition-all'

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
      <label className="block text-sm font-heading font-medium text-body mb-1.5">
        {label}
        {required && <span className="text-brand-coral ml-1">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted mt-1 font-sans">{hint}</p>}
      {error && <p className="text-xs text-brand-coral mt-1 font-sans">{error}</p>}
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
    <div className="flex items-center gap-3 mb-6 pb-4 border-b border-base">
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <h3 className="font-heading font-bold text-base text-primary">{title}</h3>
        <p className="text-xs text-muted font-sans">{subtitle}</p>
      </div>
    </div>
  )
}

// -- MULTI-STEP CONFIG ---------------------------------------------------------
const STEPS = [
  { label: 'Personal', icon: User },
  { label: 'Contact', icon: Phone },
  { label: 'Academic', icon: BookOpen },
  { label: 'Guardian', icon: Users },
  { label: 'Review', icon: FileText },
]

// -- MAIN COMPONENT ------------------------------------------------------------
export default function ApplyPage() {
  const [step, setStep] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    trigger,
    formState: { errors },
    getValues,
  } = useForm<ApplicationInput>({
    resolver: zodResolver(ApplicationSchema),
    defaultValues: {
      nationality: 'Malawi',
      countryCode: '+265',
      guardianCountryCode: '+265',
    },
  })

  const nationality = watch('nationality')
  const isMalawian = nationality === 'Malawi'

  const STEP_FIELDS: (keyof ApplicationInput)[][] = [
    ['firstName', 'surname', 'dateOfBirth', 'sex', 'nationality'],
    ['address', 'countryCode', 'phone', 'email'],
    ['classApplying', 'academicYear'],
    ['guardianName', 'guardianRelationship', 'guardianCountryCode', 'guardianPhone'],
    [],
  ]

  async function goNext() {
    const valid = await trigger(STEP_FIELDS[step])
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1))
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
      <div className="relative min-h-screen bg-page flex items-center justify-center px-4">
        <PublicAmbientBackground />
        <div className="relative z-10 text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-brand-teal/15 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-brand-teal" />
          </div>
          <h1 className="font-heading font-bold text-2xl text-primary mb-3">
            Application Submitted!
          </h1>
          <p className="text-muted font-sans leading-relaxed mb-8">
            Thank you for applying. Your application has been received and is pending review. You
            will be contacted by the school admissions office with further instructions.
          </p>
          <div className="bg-surface border border-base rounded-2xl p-5 text-left mb-8">
            <p className="text-xs font-heading font-semibold text-muted uppercase tracking-widest mb-3">
              What happens next?
            </p>
            <ul className="space-y-2">
              {[
                'Your application is reviewed by the admissions team',
                'You will receive an email or phone call within 5–7 working days',
                'If approved, you will be asked to report for admission',
                'Bring original school certificates and guardian ID on admission day',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-body font-sans">
                  <span className="w-5 h-5 rounded-full bg-brand-teal/15 text-brand-teal text-xs font-heading font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-brand-navy text-white px-6 py-3 rounded-xl font-heading font-semibold text-sm hover:bg-brand-navy-mid transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Homepage
          </Link>
        </div>
      </div>
    )
  }

  const values = getValues()

  return (
    <div className="relative min-h-screen bg-page">
      <PublicAmbientBackground />

      {/* -- HEADER -- */}
      <header className="relative z-30 bg-surface border-b border-base sticky top-0">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-muted hover:text-body text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Home
          </Link>
          <div className="h-4 w-px bg-base shrink-0" />
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-brand-navy flex items-center justify-center">
              <span className="text-white text-xs font-heading font-bold">S</span>
            </div>
            <span className="font-heading font-semibold text-sm text-primary">
              Student Application
            </span>
          </div>
          <PublicThemeToggle className="ml-auto" />
        </div>
      </header>

      <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-10">
        {/* Title */}
        <div className="mb-8 text-center">
          <h1 className="font-heading font-bold text-3xl text-primary mb-2">
            Apply for Admission
          </h1>
          <p className="text-muted font-sans">
            Complete all sections below. Fields marked with{' '}
            <span className="text-brand-coral font-semibold">*</span> are required.
          </p>
        </div>

        {/* Progress stepper */}
        <div className="flex items-center gap-0 mb-10">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const done = i < step
            const active = i === step
            return (
              <div key={s.label} className="flex items-center flex-1 last:flex-none">
                <button
                  type="button"
                  onClick={() => i < step && setStep(i)}
                  className={[
                    'flex flex-col items-center gap-1 flex-shrink-0',
                    i < step ? 'cursor-pointer' : 'cursor-default',
                  ].join(' ')}
                >
                  <div
                    className={[
                      'w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all',
                      done
                        ? 'bg-brand-teal border-brand-teal text-white'
                        : active
                          ? 'bg-brand-navy border-brand-navy text-white'
                          : 'bg-surface border-base text-muted',
                    ].join(' ')}
                  >
                    {done ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                  </div>
                  <span
                    className={`text-[10px] font-heading font-semibold hidden sm:block ${active ? 'text-primary' : 'text-muted'}`}
                  >
                    {s.label}
                  </span>
                </button>
                {i < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-1 transition-colors ${i < step ? 'bg-brand-teal' : 'bg-base'}`}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Form card */}
        {/* [PRODUCTION FIX 2026-08-27] Never rely on native <form> submission —
            see this file's header comment for the full auto-submit defect this
            closes. onSubmit here only ever prevents the browser's default
            action; the Review step's button below calls handleSubmit(onSubmit)
            explicitly, and every other step's button is type="button". */}
        <form onSubmit={(e) => e.preventDefault()}>
          <div className="bg-surface border border-base rounded-3xl p-6 sm:p-8 mb-6">

            {/* -- STEP 0: Personal Details -- */}
            {step === 0 && (
              <>
                <SectionHeader
                  icon={User}
                  title="Personal Details"
                  subtitle="Legal name and demographic information"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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
                  <Field label="Religion" error={errors.religion?.message} hint="Optional">
                    <input
                      {...register('religion')}
                      className={`${inputCls} ${inputBase}`}
                      placeholder="e.g. Christianity, Islam"
                    />
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
                    <Field
                      label="District of Origin"
                      error={errors.district?.message}
                      hint="Malawian applicants only"
                    >
                      <select {...register('district')} className={`${inputCls} ${inputBase}`}>
                        <option value="">Select district…</option>
                        {MALAWI_DISTRICTS.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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
                    <div className="flex gap-2">
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
                    hint="Required — your student login and password will be sent here once admitted"
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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
                      value={watch('academicYear')}
                      {...register('academicYear')}
                      optionsConfig={{ back: 0, forward: 1 }}
                      className={`${inputCls} ${errors.academicYear ? inputError : inputBase}`}
                    />
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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
                    <div className="flex gap-2">
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

            {/* -- STEP 4: Review & Submit -- */}
            {step === 4 && (
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
                      ...(values.previousSchool
                        ? [['Previous School', values.previousSchool] as [string, string]]
                        : []),
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
                ].map(({ heading, rows }) => (
                  <div key={heading} className="mb-5 bg-page rounded-2xl p-5 border border-base">
                    <h4 className="font-heading font-semibold text-sm text-primary mb-3">
                      {heading}
                    </h4>
                    <dl className="space-y-1.5">
                      {rows.map(([label, value]) => (
                        <div key={label} className="flex gap-4 text-sm">
                          <dt className="text-muted font-sans w-36 shrink-0">{label}</dt>
                          <dd className="text-body font-sans font-medium">{value || '—'}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
                <p className="text-xs text-muted font-sans leading-relaxed bg-brand-amber/8 border border-brand-amber/20 rounded-xl px-4 py-3 mt-4">
                  By submitting this application you confirm that all information provided is
                  accurate and complete. Providing false information may result in rejection or
                  cancellation of admission.
                </p>
                {serverError && (
                  <div className="mt-4 text-sm text-brand-coral bg-brand-coral/8 border border-brand-coral/20 rounded-xl px-4 py-3">
                    {serverError}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(s - 1, 0))}
              disabled={step === 0}
              className="flex items-center gap-2 text-sm font-heading font-semibold text-muted hover:text-body disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </button>
            <div className="text-xs text-muted font-sans">
              Step {step + 1} of {STEPS.length}
            </div>
            {step < STEPS.length - 1 ? (
              <button
                key="next-btn"
                type="button"
                onClick={goNext}
                className="flex items-center gap-2 bg-brand-navy text-white px-6 py-2.5 rounded-xl text-sm font-heading font-semibold hover:bg-brand-navy-mid transition-colors"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                key="submit-btn"
                type="button"
                onClick={handleSubmit(onSubmit)}
                disabled={submitting}
                className="flex items-center gap-2 bg-brand-teal text-white px-8 py-2.5 rounded-xl text-sm font-heading font-semibold hover:bg-brand-teal-light transition-colors disabled:opacity-60 shadow-sm"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? 'Submitting…' : 'Submit Application'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}