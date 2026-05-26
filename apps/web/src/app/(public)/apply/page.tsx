'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MALAWI_DISTRICTS } from '@shared/constants/malawi'
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

// -- COUNTRIES LIST ------------------------------------------------------------
const COUNTRIES = [
  'Malawi',
  'Zambia',
  'Mozambique',
  'Tanzania',
  'Zimbabwe',
  'South Africa',
  'Kenya',
  'Uganda',
  'Rwanda',
  'Ethiopia',
  'Botswana',
  'Namibia',
  'Angola',
  'Democratic Republic of Congo',
  'United Kingdom',
  'United States',
  'India',
  'China',
  'Germany',
  'France',
  'Australia',
  'Canada',
  'Brazil',
  'Other',
]

const COUNTRY_CODES = [
  { code: '+265', label: 'Malawi (+265)' },
  { code: '+260', label: 'Zambia (+260)' },
  { code: '+258', label: 'Mozambique (+258)' },
  { code: '+255', label: 'Tanzania (+255)' },
  { code: '+263', label: 'Zimbabwe (+263)' },
  { code: '+27', label: 'South Africa (+27)' },
  { code: '+254', label: 'Kenya (+254)' },
  { code: '+44', label: 'UK (+44)' },
  { code: '+1', label: 'USA/Canada (+1)' },
  { code: '+91', label: 'India (+91)' },
]

const GUARDIAN_RELATIONSHIPS = [
  'Father',
  'Mother',
  'Guardian',
  'Uncle',
  'Aunt',
  'Grandparent',
  'Elder Sibling',
  'Other Relative',
  'Other',
]

// -- ZOD SCHEMA ----------------------------------------------------------------
const ApplicationSchema = z.object({
  // Personal
  firstName: z.string().min(2, 'First name is required'),
  otherNames: z.string().optional(),
  surname: z.string().min(2, 'Surname is required'),
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  sex: z.enum(['male', 'female'], { required_error: 'Please select sex' }),
  nationality: z.string().min(1, 'Nationality is required'),
  district: z.string().optional(),
  religion: z.string().optional(),
  // Contact
  address: z.string().min(5, 'Address is required'),
  countryCode: z.string().min(1, 'Select country code'),
  phone: z.string().min(7, 'Phone number is required'),
  email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  // Academic
  classApplying: z.enum(['Form 1', 'Form 2', 'Form 3', 'Form 4'], {
    required_error: 'Please select the form',
  }),
  previousSchool: z.string().optional(),
  reasonForTransfer: z.string().optional(),
  academicYear: z.string().min(1, 'Academic year is required'),
  // Guardian
  guardianName: z.string().min(2, 'Guardian name is required'),
  guardianRelationship: z.string().min(1, 'Relationship is required'),
  guardianCountryCode: z.string().min(1, 'Select country code'),
  guardianPhone: z.string().min(7, 'Guardian phone is required'),
  guardianEmail: z.string().email('Enter a valid email').optional().or(z.literal('')),
  guardianAddress: z.string().optional(),
})

type ApplicationInput = z.infer<typeof ApplicationSchema>

// -- HELPERS -------------------------------------------------------------------
const inputCls =
  'w-full border rounded-xl px-4 py-3 text-sm bg-surface text-body placeholder:text-muted ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-teal/25 focus:border-brand-teal transition-all'
const inputError =
  'border-brand-coral focus:ring-brand-coral/25 focus:border-brand-coral bg-brand-coral/5'
const inputBase = 'border-base'

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
      <div className="w-10 h-10 rounded-xl bg-brand-navy/8 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-brand-navy" />
      </div>
      <div>
        <h3 className="font-heading font-bold text-base text-brand-navy">{title}</h3>
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
      academicYear: '2027',
    },
  })

  const nationality = watch('nationality')
  const isMalawian = nationality === 'Malawi'

  const STEP_FIELDS: (keyof ApplicationInput)[][] = [
    ['firstName', 'surname', 'dateOfBirth', 'sex', 'nationality'],
    ['address', 'countryCode', 'phone'],
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
        const err = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(err.error ?? 'Submission failed. Please try again.')
      }
      setSubmitted(true)
    } catch (e) {
      setServerError(e instanceof Error ? e.message : 'Submission failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  // -- SUCCESS STATE ----------------------------------------------------------
  if (submitted) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 rounded-full bg-brand-teal/15 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-10 h-10 text-brand-teal" />
          </div>
          <h1 className="font-heading font-bold text-2xl text-brand-navy mb-3">
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
    <div className="min-h-screen bg-page">
      {/* -- HEADER -- */}
      <header className="bg-surface border-b border-base sticky top-0 z-10">
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
            <span className="font-heading font-semibold text-sm text-brand-navy">
              Student Application
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        {/* Title */}
        <div className="mb-8 text-center">
          <h1 className="font-heading font-bold text-3xl text-brand-navy mb-2">
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
                    className={`text-[10px] font-heading font-semibold hidden sm:block ${active ? 'text-brand-navy' : 'text-muted'}`}
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
        <form onSubmit={handleSubmit(onSubmit)}>
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
                      <option value="male">Male</option>
                      <option value="female">Female</option>
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
                      {COUNTRIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
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
                        className={`${inputCls} ${inputBase} w-40 flex-shrink-0`}
                      >
                        {COUNTRY_CODES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <input
                        {...register('phone')}
                        type="tel"
                        className={`${inputCls} flex-1 ${errors.phone ? inputError : inputBase}`}
                        placeholder="999 123 456"
                      />
                    </div>
                  </Field>
                  <Field
                    label="Email Address"
                    error={errors.email?.message}
                    hint="Optional — for application updates"
                    className="col-span-full"
                  >
                    <input
                      {...register('email')}
                      type="email"
                      className={`${inputCls} ${inputBase}`}
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
                      {['Form 1', 'Form 2', 'Form 3', 'Form 4'].map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Academic Year" required error={errors.academicYear?.message}>
                    <select
                      {...register('academicYear')}
                      className={`${inputCls} ${errors.academicYear ? inputError : inputBase}`}
                    >
                      {['2026', '2027', '2028'].map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
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
                        className={`${inputCls} ${inputBase} w-40 flex-shrink-0`}
                      >
                        {COUNTRY_CODES.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <input
                        {...register('guardianPhone')}
                        type="tel"
                        className={`${inputCls} flex-1 ${errors.guardianPhone ? inputError : inputBase}`}
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
                    <h4 className="font-heading font-semibold text-sm text-brand-navy mb-3">
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
                type="button"
                onClick={goNext}
                className="flex items-center gap-2 bg-brand-navy text-white px-6 py-2.5 rounded-xl text-sm font-heading font-semibold hover:bg-brand-navy-mid transition-colors"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
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