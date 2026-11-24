'use client'

/**
 * [CHANGE TYPE]: TARGETED EDIT (2026-11-04, student form brought level with the application form)
 *   - Personal: Village now sits after District and T/A (it was under Contact as
 *     "Home Village"); NRB follows it.
 *   - Academic: "Home & Admission" is one group (physical address, admission type,
 *     previous school, reason for transfer), as on the profile and the /apply form.
 *     "Home & Travel" no longer lives under Contact.
 *   - New WelfareSection (orphan status, vulnerability, health / medical alert,
 *     special needs). It owns no form state: StudentForm keeps the draft and saves it
 *     through the welfare endpoints after the student exists, so welfare data never
 *     bypasses student.editWelfare or the audit log.
 *   - the admissionType select sends undefined, not '', for "not recorded"
 *     ('' is not a valid enum value and blocked the form).
 *
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
import {
  MALAWI_DISTRICTS,
  RELIGIONS,
  HOME_LANGUAGES,
  ADMISSION_TYPES,
  ADMISSION_TYPE_LABELS,
  ORPHAN_STATUSES,
  ORPHAN_STATUS_LABELS,
  SUPPORT_NEED_TYPES,
  SUPPORT_NEED_LABELS,
  type OrphanStatusValue,
  type SupportNeedTypeValue,
} from '@shared/constants/malawi'
import { GUARDIAN_RELATIONSHIPS }             from '@shared/constants/admissions'
import { getCountriesForForm } from '@shared/constants/countries'
import { useClasses }                         from '@/hooks/useClasses'
import { useEffectiveAcademicPeriod }            from '@/hooks/useSettings'

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
  ['firstName', 'lastName', 'otherNames', 'dateOfBirth', 'sex', 'nationality', 'district', 'traditionalAuthority', 'village', 'nrbNumber', 'religion', 'homeLanguage'],
  // Step 2 — Academic + Home & Admission
  ['classId', 'status', 'physicalAddress', 'admissionType', 'previousSchool', 'reasonForTransfer'],
  // Step 3 — Contact + Guardian (email is the login identifier; guardian
  // fields are required by CreateStudentSchema — omitting them here was what
  // let the final submit fail silently, since handleSubmit blocked on unshown
  // required fields with no visible error).
  ['email', 'phone', 'address', 'guardianName', 'guardianRelation', 'guardianPhone'],
  // Step 4 — Welfare & Health (create mode, student.editWelfare only). Not part of
  // CreateStudentSchema (see WelfareSection), so there is nothing to trigger().
  [],
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
      <label className="block text-xs font-heading font-semibold text-muted mb-1.5">
        {label}
        {required && (
          <span className="text-tone-coral ml-0.5" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {error && (
        <p role="alert" className="text-xs text-tone-coral mt-1 font-sans">
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
        <span className="text-xs font-heading font-bold text-muted ">
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
  /** Edit mode only: the student's saved Class.id. It may belong to an earlier
   *  academic year (e.g. a graduate), so AcademicSection keeps it selectable. */
  selectedClassId?: string
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSONAL SECTION — Step 1
// Fields: firstName, lastName, dateOfBirth, sex, nationality, district
// ─────────────────────────────────────────────────────────────────────────────

export function PersonalSection({ register, errors }: SectionProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">

      {/* First name */}
      <Field label="First name" error={errors.firstName?.message} required>
        <input
          {...register('firstName')}
          className={inputCls}
          placeholder="Given name"
          autoComplete="given-name"
        />
      </Field>

      {/* Last name */}
      <Field label="Last name" error={errors.lastName?.message} required>
        <input
          {...register('lastName')}
          className={inputCls}
          placeholder="Family name"
          autoComplete="family-name"
        />
      </Field>
      {/* Other names (middle names) — optional. The Student model carries this
          and applications capture it; it was previously never editable here. */}
      <Field label="Other names" error={errors.otherNames?.message}>
        <input
          {...register('otherNames')}
          className={inputCls}
          placeholder="Middle name(s), if any"
          autoComplete="additional-name"
        />
      </Field>

      {/* Date of birth */}
      <Field label="Date of birth" error={errors.dateOfBirth?.message} required>
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
      <Field label="District of origin" error={errors.district?.message}>
        <select {...register('district')} className={inputCls}>
          <option value="">Select district…</option>
          {MALAWI_DISTRICTS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </Field>

      {/* Traditional Authority — free text; sits with district of origin */}
      <Field label="Traditional authority (T/A)" error={errors.traditionalAuthority?.message}>
        <input
          {...register('traditionalAuthority')}
          className={inputCls}
          placeholder="T/A Kuntaja"
        />
      </Field>

      {/* Village — after District and T/A, the order the profile shows them in. */}
      <Field label="Village" error={errors.village?.message}>
        <input
          {...register('village')}
          className={inputCls}
          placeholder="Home village"
          autoComplete="off"
        />
      </Field>

      {/* NRB number — optional: many children are not yet registered.
          Length is checked; the national format is not enforced. */}
      <Field label="NRB / Birth Certificate No." error={errors.nrbNumber?.message}>
        <input
          {...register('nrbNumber')}
          className={inputCls}
          placeholder="Leave blank if not registered"
          autoComplete="off"
        />
      </Field>

      <FieldDivider title="Background" />

      <Field label="Religion" error={errors.religion?.message}>
        <input
          {...register('religion')}
          list="student-religions"
          className={inputCls}
          placeholder="Christianity, Islam"
        />
        <datalist id="student-religions">
          {RELIGIONS.map((r) => <option key={r} value={r} />)}
        </datalist>
      </Field>

      <Field label="Home language" error={errors.homeLanguage?.message}>
        <input
          {...register('homeLanguage')}
          list="student-languages"
          className={inputCls}
          placeholder="Chichewa, Chitumbuka"
        />
        <datalist id="student-languages">
          {HOME_LANGUAGES.map((l) => <option key={l} value={l} />)}
        </datalist>
      </Field>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ACADEMIC SECTION — Step 2
// Fields: classId (form), status
// ─────────────────────────────────────────────────────────────────────────────

export function AcademicSection({ register, errors, selectedClassId }: SectionProps) {
  // [MAINT 2026-10-23] Class rows are one-per-academic-year, and useClasses()
  // with no year returns all of them — so every class appeared once per year
  // ("Form 2A" ×3) and a new student could be put in a PAST year's class by
  // mistake. Offer only the school's current-year classes, plus (edit mode) the
  // student's own saved class if it is from another year, labelled with its year.
  const { academicYear } = useEffectiveAcademicPeriod()
  const { data: allClasses, isLoading: classesLoading } = useClasses()
  const classes = allClasses?.filter(
    (c) => c.academicYear === academicYear || c.id === selectedClassId,
  )

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">

      {/* Form / class — real dropdown, submits the selected Class.id (cuid) */}
      <Field label="Form / class" error={errors.classId?.message} required>
        <select {...register('classId')} className={inputCls} disabled={classesLoading}>
          <option value="">{classesLoading ? 'Loading classes…' : 'Select class…'}</option>
          {classes?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.academicYear === academicYear ? c.name : `${c.name} (${c.academicYear})`}
            </option>
          ))}
        </select>
      </Field>

      {/* Academic status */}
      <Field label="Academic status" error={errors.status?.message} required>
        <select {...register('status')} className={inputCls}>
          {StudentStatusSchema.options.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </Field>

      <FieldDivider title="Home and admission" />

      {/* Where the learner is staying now (free text). The postal address is under Contact. */}
      <Field label="Physical address" error={errors.physicalAddress?.message} className="col-span-full">
        <textarea
          {...register('physicalAddress')}
          className={`${inputCls} resize-none`}
          rows={2}
          placeholder="e.g. Area 47, Sector 3, Lilongwe"
        />
      </Field>

      {/* How the learner joined. Chosen by staff when the application is admitted
          (defaults to NEW_INTAKE for Form 1, TRANSFER_IN for Form 2+); RETURNEE is set here by staff. */}
      <Field label="Admission type" error={errors.admissionType?.message}>
        <select {...register('admissionType')} className={inputCls} defaultValue="NEW_INTAKE">
          {ADMISSION_TYPES.map((t) => (
            <option key={t} value={t}>{ADMISSION_TYPE_LABELS[t]}</option>
          ))}
        </select>
      </Field>

      <Field label="Previous school" error={errors.previousSchool?.message}>
        <input
          {...register('previousSchool')}
          className={inputCls}
          placeholder="School attended before"
        />
      </Field>

      <Field
        label="Reason for transfer"
        error={errors.reasonForTransfer?.message}
        className="col-span-full"
      >
        <input
          {...register('reasonForTransfer')}
          className={inputCls}
          placeholder="Only if transferring in"
        />
      </Field>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTACT SECTION — Step 3
// Fields: email, phone, address, guardian
// ─────────────────────────────────────────────────────────────────────────────

export function ContactSection({ register, errors }: SectionProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">

      {/* Email — login identifier; spans full width */}
      <Field
        label="Email address"
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
      <Field label="Phone number" error={errors.phone?.message}>
        <input
          {...register('phone')}
          type="tel"
          className={inputCls}
          placeholder="+265 999 000 000"
          autoComplete="tel"
        />
      </Field>

      {/* Address — spans full width */}
      <Field
        label="Postal address"
        error={errors.address?.message}
        className="col-span-full"
      >
        <textarea
          {...register('address')}
          className={`${inputCls} resize-none`}
          rows={3}
          placeholder="e.g. P.O. Box 123, Blantyre"
        />
      </Field>

      <FieldDivider title="Guardian / next of kin" />

      {/* Guardian name */}
      <Field label="Guardian full name" error={errors.guardianName?.message} required>
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
        label="Guardian phone number"
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
// ─────────────────────────────────────────────────────────────────────────────
// WELFARE SECTION — Step 4 (create mode, student.editWelfare only)
//
// Orphan status, vulnerability, health / medical alert and special needs: the same
// four things the profile's Welfare card shows, collected up front so a new student
// starts with a complete record. They are deliberately NOT in CreateStudentSchema:
// welfare data only travels through the permission-checked, audited welfare
// endpoints, so StudentForm saves this draft through them once the student exists.
// This component is controlled (no react-hook-form) for that reason.
// ─────────────────────────────────────────────────────────────────────────────

export interface WelfareDraftNeed {
  type: SupportNeedTypeValue
  accommodation: string
  assistiveDevice: string
}

export interface WelfareDraft {
  orphanStatus: OrphanStatusValue
  isVulnerable: boolean
  vulnerabilityNote: string
  medicalAlert: string
  needs: WelfareDraftNeed[]
}

export const EMPTY_WELFARE_DRAFT: WelfareDraft = {
  orphanStatus: 'UNKNOWN',
  isVulnerable: false,
  vulnerabilityNote: '',
  medicalAlert: '',
  needs: [],
}

/** True when the draft holds anything worth saving (so an untouched step makes no request). */
export function welfareDraftHasData(d: WelfareDraft): boolean {
  return (
    d.orphanStatus !== 'UNKNOWN' ||
    d.isVulnerable ||
    d.vulnerabilityNote.trim() !== '' ||
    d.medicalAlert.trim() !== '' ||
    d.needs.length > 0
  )
}

export function WelfareSection({
  value,
  onChange,
}: {
  value: WelfareDraft
  onChange: (next: WelfareDraft) => void
}) {
  const set = <K extends keyof WelfareDraft>(key: K, v: WelfareDraft[K]) => onChange({ ...value, [key]: v })
  const has = (t: SupportNeedTypeValue) => value.needs.some((n) => n.type === t)
  const toggleNeed = (t: SupportNeedTypeValue) =>
    set(
      'needs',
      has(t)
        ? value.needs.filter((n) => n.type !== t)
        : [...value.needs, { type: t, accommodation: '', assistiveDevice: '' }],
    )
  const patchNeed = (t: SupportNeedTypeValue, patch: Partial<WelfareDraftNeed>) =>
    set('needs', value.needs.map((n) => (n.type === t ? { ...n, ...patch } : n)))

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
      <p className="col-span-full text-xs text-muted font-sans -mb-1">
        Sensitive. Visible only to the headteacher, administrators and HR. Everything here is optional.
      </p>

      <Field label="Orphan status">
        <select
          className={inputCls}
          value={value.orphanStatus}
          onChange={(e) => set('orphanStatus', e.target.value as OrphanStatusValue)}
        >
          {ORPHAN_STATUSES.map((o) => (
            <option key={o} value={o}>{ORPHAN_STATUS_LABELS[o]}</option>
          ))}
        </select>
      </Field>

      <div className="flex items-end pb-2.5">
        <label className="flex items-center gap-2 text-sm text-body font-sans cursor-pointer">
          <input
            type="checkbox"
            checked={value.isVulnerable}
            onChange={(e) => set('isVulnerable', e.target.checked)}
            className="accent-brand-teal"
          />
          Needs extra support (vulnerable)
        </label>
      </div>

      {value.isVulnerable && (
        <Field label="Vulnerability note" className="col-span-full">
          <textarea
            className={`${inputCls} resize-none`}
            rows={2}
            maxLength={1000}
            value={value.vulnerabilityNote}
            onChange={(e) => set('vulnerabilityNote', e.target.value)}
          />
        </Field>
      )}

      <Field label="Health / medical alert" className="col-span-full">
        <textarea
          className={`${inputCls} resize-none`}
          rows={2}
          maxLength={500}
          value={value.medicalAlert}
          onChange={(e) => set('medicalAlert', e.target.value)}
          placeholder="Asthma - inhaler kept at the school office"
        />
      </Field>

      <div className="col-span-full">
        <p className="block text-xs font-heading font-semibold text-muted mb-2">
          Special needs
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2.5">
          {SUPPORT_NEED_TYPES.map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm text-body font-sans cursor-pointer">
              <input
                type="checkbox"
                checked={has(t)}
                onChange={() => toggleNeed(t)}
                className="accent-brand-teal"
              />
              {SUPPORT_NEED_LABELS[t]}
            </label>
          ))}
        </div>

        {value.needs.length > 0 && (
          <div className="mt-4 space-y-4">
            {value.needs.map((n) => (
              <div key={n.type} className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3">
                <Field label={`${SUPPORT_NEED_LABELS[n.type]}: accommodation`}>
                  <input
                    className={inputCls}
                    maxLength={300}
                    value={n.accommodation}
                    onChange={(e) => patchNeed(n.type, { accommodation: e.target.value })}
                    placeholder="Front-row seating, large print"
                  />
                </Field>
                <Field label={`${SUPPORT_NEED_LABELS[n.type]}: assistive device`}>
                  <input
                    className={inputCls}
                    maxLength={200}
                    value={n.assistiveDevice}
                    onChange={(e) => patchNeed(n.type, { assistiveDevice: e.target.value })}
                  />
                </Field>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
