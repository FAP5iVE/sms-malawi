'use client'

/**
 * apps/web/src/components/students/StudentFormSections.tsx — Phase C5
 * [CHANGE TYPE]: MAJOR REWRITE of three field definitions only (R5)
 * [R-PHASE]: R5 — Academics I: Admissions & Student Records
 * [PURPOSE]: Three field definitions were the reason the Add/Edit Student
 *   form could never be submitted successfully. Sex <select> options were
 *   lowercase 'male'/'female', matching neither SexSchema nor the Prisma
 *   Sex enum (both 'MALE'/'FEMALE'). Academic Status <select> options were
 *   'active'/'inactive'/'suspended' — a status vocabulary that matches
 *   neither StudentStatusSchema nor any real status the backend recognises
 *   (the real enum is ACTIVE/AWAITING_MANEB_RESULTS/GRADUATED/ARCHIVED).
 *   Form/Class <select> submitted a free-standing 'Form 1'–'Form 4' string
 *   literal as `classId` — the server expects a real Class.id (a cuid);
 *   every submission failed server-side validation (or worse, silently
 *   wrote a garbage classId). All three now resolve to real schema-backed
 *   values: Sex from SexSchema, Academic Status from
 *   StudentStatusSchema.options, and Form/Class from a real useClasses()
 *   dropdown submitting the selected Class.id.
 *
 * Decomposed field-group components for the student form.
 * Each section is a pure rendering component — it owns no form state.
 * All form state (register, errors, watch) is passed down from the parent
 * StudentForm.tsx, which holds the single useForm() instance.
 *
 * Exports:
 *   PersonalSection  — Step 1: name, DOB, sex, nationality, district
 *   AcademicSection  — Step 2: form/class, academic status
 *   ContactSection   — Step 3: phone, village, address
 *
 *   Field            — Shared labelled field wrapper with inline error message
 *   FieldDivider     — Horizontal section divider with label (desktop only)
 *   inputCls         — Shared Tailwind input class string
 *   COUNTRIES        — Nationality options list
 *   STEP_FIELDS      — Field key groups per step (used by trigger() in parent)
 *
 * Touch targets:
 *   All interactive elements (selects, inputs) have min-h-[44px] to meet the
 *   44×44 px WCAG 2.5.5 / Apple HIG touch target recommendation.
 */

import type { UseFormRegister, FieldErrors }  from 'react-hook-form'
import { z }                                  from 'zod'
import { CreateStudentSchema }                from '@shared/schemas/student'
import { SexSchema, StudentStatusSchema }     from '@shared/schemas/student'
import { MALAWI_DISTRICTS }                   from '@shared/constants/malawi'
import { GUARDIAN_RELATIONSHIPS }             from '@shared/constants/admissions'
import { getCountriesForForm } from '@shared/constants/countries'
import { useClasses }                         from '@/hooks/useClasses'

// The form is driven by the schema INPUT type (defaulted fields optional), so
// register/errors must be typed on it — not on CreateStudentInput (the output),
// whose required `nationality` would clash with the form's optional one.
type StudentFormValues = z.input<typeof CreateStudentSchema>

// ─────────────────────────────────────────────────────────────────────────────
// SHARED STYLE CONSTANT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base class string applied to every <input>, <select>, and <textarea>.
 * min-h-[44px] enforces the 44 px touch target on all form controls (C5).
 */
export const inputCls =
  'w-full min-h-[44px] border border-base rounded-xl px-3 py-2.5 ' +
  'text-sm bg-page text-body placeholder:text-muted ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-teal/25 focus:border-brand-teal ' +
  'transition-all font-sans'

// ─────────────────────────────────────────────────────────────────────────────
// NATIONALITY OPTIONS
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// STEP FIELD KEY GROUPS
// Used by the parent to call trigger(STEP_FIELDS[step]) before advancing steps.
// Only validates fields that belong to the current step — prevents premature
// errors from showing on fields the user hasn't reached yet.
// ─────────────────────────────────────────────────────────────────────────────

export const STEP_FIELDS: ReadonlyArray<ReadonlyArray<keyof StudentFormValues>> = [
  // Step 1 — Personal
  ['firstName', 'lastName', 'dateOfBirth', 'sex', 'nationality', 'district'],
  // Step 2 — Academic
  ['classId', 'status'],
  // Step 3 — Contact + Guardian (email is the login identifier; guardian
  // fields are required by CreateStudentSchema — omitting them here was what
  // let the final submit fail silently, since handleSubmit blocked on unshown
  // required fields with no visible error).
  ['email', 'phone', 'village', 'address', 'guardianName', 'guardianRelation', 'guardianPhone'],
] as const

// ─────────────────────────────────────────────────────────────────────────────
// FIELD — labelled wrapper with inline error
// ─────────────────────────────────────────────────────────────────────────────

interface FieldProps {
  label: string
  error?: string
  children: React.ReactNode
  className?: string
  required?: boolean
}

export function Field({
  label,
  error,
  children,
  className = '',
  required = false,
}: FieldProps) {
  return (
    <div className={className}>
      <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">
        {label}
        {required && (
          <span className="text-brand-coral ml-0.5" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {error && (
        <p role="alert" className="text-xs text-brand-coral mt-1 font-sans">
          {error}
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FIELD DIVIDER — horizontal rule with centred label (desktop all-in-one view)
// Hidden on mobile where sections are shown as distinct steps.
// ─────────────────────────────────────────────────────────────────────────────

export function FieldDivider({ title }: { title: string }) {
  return (
    <div className="col-span-2 pt-2 pb-1 hidden md:block">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-base" />
        <span className="text-[10px] font-heading font-bold text-muted uppercase tracking-widest">
          {title}
        </span>
        <div className="h-px flex-1 bg-base" />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION PROPS — shared interface for all three section components
// ─────────────────────────────────────────────────────────────────────────────

export interface SectionProps {
  register: UseFormRegister<StudentFormValues>
  errors: FieldErrors<StudentFormValues>
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSONAL SECTION — Step 1
// Fields: firstName, lastName, dateOfBirth, sex, nationality, district
// ─────────────────────────────────────────────────────────────────────────────

export function PersonalSection({ register, errors }: SectionProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">

      {/* First name */}
      <Field label="First Name" error={errors.firstName?.message} required>
        <input
          {...register('firstName')}
          className={inputCls}
          placeholder="Given name"
          autoComplete="given-name"
        />
      </Field>

      {/* Last name */}
      <Field label="Last Name" error={errors.lastName?.message} required>
        <input
          {...register('lastName')}
          className={inputCls}
          placeholder="Family name"
          autoComplete="family-name"
        />
      </Field>

      {/* Date of birth */}
      <Field label="Date of Birth" error={errors.dateOfBirth?.message} required>
        <input
          type="date"
          {...register('dateOfBirth')}
          className={inputCls}
        />
      </Field>

      {/* Sex */}
      <Field label="Sex" error={errors.sex?.message} required>
        <select {...register('sex')} className={inputCls}>
          <option value="">Select…</option>
          {SexSchema.options.map((s) => (
            <option key={s} value={s}>
              {s === 'MALE' ? 'Male' : 'Female'}
            </option>
          ))}
        </select>
      </Field>

      {/* Nationality */}
      <Field label="Nationality" error={errors.nationality?.message}>
        <select {...register('nationality')} className={inputCls}>
          {getCountriesForForm().map((c) => (
            <option key={c.code} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      {/* District of origin (Malawi) */}
      <Field label="District of Origin" error={errors.district?.message}>
        <select {...register('district')} className={inputCls}>
          <option value="">Select district…</option>
          {MALAWI_DISTRICTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </Field>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ACADEMIC SECTION — Step 2
// Fields: classId (form), status
// ─────────────────────────────────────────────────────────────────────────────

export function AcademicSection({ register, errors }: SectionProps) {
  const { data: classes, isLoading: classesLoading } = useClasses()

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">

      {/* Form / class — real dropdown, submits the selected Class.id (cuid) */}
      <Field label="Form / Class" error={errors.classId?.message} required>
        <select {...register('classId')} className={inputCls} disabled={classesLoading}>
          <option value="">{classesLoading ? 'Loading classes…' : 'Select class…'}</option>
          {classes?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      {/* Academic status */}
      <Field label="Academic Status" error={errors.status?.message} required>
        <select {...register('status')} className={inputCls}>
          {StudentStatusSchema.options.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </Field>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACT SECTION — Step 3
// Fields: phone, village, address
// ─────────────────────────────────────────────────────────────────────────────

export function ContactSection({ register, errors }: SectionProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">

      {/* Email — login identifier; spans full width */}
      <Field
        label="Email Address"
        error={errors.email?.message}
        required
        className="col-span-full"
      >
        <input
          {...register('email')}
          type="email"
          className={inputCls}
          placeholder="student@example.com"
          autoComplete="email"
        />
        <p className="text-xs text-muted mt-1">
          The student signs in with this email. A temporary password is emailed here and must be changed on first login.
        </p>
      </Field>

      {/* Phone */}
      <Field label="Phone Number" error={errors.phone?.message}>
        <input
          {...register('phone')}
          type="tel"
          className={inputCls}
          placeholder="+265 999 000 000"
          autoComplete="tel"
        />
      </Field>

      {/* Village */}
      <Field label="Home Village" error={errors.village?.message}>
        <input
          {...register('village')}
          className={inputCls}
          placeholder="Home village or town"
        />
      </Field>

      {/* Address — spans full width */}
      <Field
        label="Postal / Physical Address"
        error={errors.address?.message}
        className="col-span-full"
      >
        <textarea
          {...register('address')}
          className={`${inputCls} resize-none`}
          rows={3}
          placeholder="Postal or physical address"
        />
      </Field>

      <FieldDivider title="Guardian / Next of Kin" />

      {/* Guardian name */}
      <Field label="Guardian Full Name" error={errors.guardianName?.message} required>
        <input
          {...register('guardianName')}
          className={inputCls}
          placeholder="Guardian full name"
        />
      </Field>

      {/* Guardian relationship */}
      <Field label="Relationship" error={errors.guardianRelation?.message} required>
        <select {...register('guardianRelation')} className={inputCls} defaultValue="">
          <option value="" disabled>Select relationship…</option>
          {GUARDIAN_RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>

      {/* Guardian phone — spans full width */}
      <Field
        label="Guardian Phone Number"
        error={errors.guardianPhone?.message}
        required
        className="col-span-full"
      >
        <input
          {...register('guardianPhone')}
          type="tel"
          className={inputCls}
          placeholder="+265 999 000 000"
          autoComplete="tel"
        />
      </Field>
    </div>
  )
}