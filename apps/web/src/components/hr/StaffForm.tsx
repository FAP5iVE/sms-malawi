/**
 * apps/web/src/components/hr/StaffForm.tsx
 *
 * [CHANGE TYPE]: NEW FILE (production fix, 2026-07-26).
 * [R-PHASE]: n/a — production maintenance.
 * [PURPOSE]: The HR "Add Staff" experience. Until now the HR page's Directory
 *   tab was read-only and HRDashboard's "Add Staff" quick action deep-linked
 *   to a tab that had no create form — so neither admin nor HR could actually
 *   create a staff member from the UI, and useCreateStaff() had no caller.
 *   This modal collects a staff member's details, validates against the same
 *   CreateStaffSchema the server uses (no hand-duplicated shape), and on
 *   success surfaces the temporary password returned by the server as a
 *   fallback for manual relay (the server also emails it). Creating the staff
 *   member now provisions their login end-to-end server-side
 *   (hrService.createStaff) — this form no longer collects a uid.
 * [MOBILE UI AUDIT FIX]: Added edit mode (staffId? prop), mirroring
 *   StudentForm.tsx's studentId? convention exactly — the HR Staff
 *   Directory's cards were not clickable/viewable at all before this
 *   fix. When staffId is supplied: fetches the existing profile
 *   (useStaffProfile), switches the zod resolver from CreateStaffSchema
 *   to the narrower UpdateStaffSchema (no employeeNo/role/dateJoined —
 *   those fields are hidden rather than shown-disabled), prefills via
 *   reset() once data resolves, and submits through the new
 *   useUpdateStaff() mutation instead of useCreateStaff(). The
 *   post-submit temp-password screen only applies to creation.
 * [DEPENDS ON]: W/hooks/useHR.ts (useCreateStaff, useUpdateStaff,
 *   useStaffProfile), @shared/schemas/hr (CreateStaffSchema,
 *   UpdateStaffSchema), @shared/types/roles (ROLE_LABELS/USER_ROLES),
 *   @shared/types/api (ApiStaffDetail).
 */
'use client'

import { useState, useEffect } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import type { Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreateStaffSchema, UpdateStaffSchema } from '@shared/schemas/hr'
import type { CreateStaffInput, UpdateStaffInput } from '@shared/schemas/hr'
import type { ApiStaffDetail } from '@shared/types/api'
type StaffFormValues = z.input<typeof CreateStaffSchema>
import { USER_ROLES, ROLE_LABELS } from '@shared/types/roles'
import { useCreateStaff, useUpdateStaff, useStaffProfile } from '@/hooks/useHR'
import { useDepartmentTitles } from '@/hooks/useSettings'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, AlertTriangle, CheckCircle2, Copy } from 'lucide-react'

interface Props {
  onClose: () => void
  /** When supplied, the form opens pre-filled in edit mode against this
   *  staff member instead of creating a new one — mirrors
   *  StudentForm.tsx's studentId? convention. Edit mode is scoped to
   *  UpdateStaffSchema's fields only (no employeeNo/role/dateJoined —
   *  see that schema's own comment for why), so those fields are hidden
   *  rather than shown-disabled when editing. */
  staffId?: string
}

// Staff cannot be created with the student role — student accounts are
// provisioned through application conversion (studentService), not here.
const STAFF_ROLES = USER_ROLES.filter((r) => r !== 'student')

const EMPLOYMENT_TYPES: { value: CreateStaffInput['employmentType']; label: string }[] = [
  { value: 'FULL_TIME', label: 'Full-time' },
  { value: 'PART_TIME', label: 'Part-time' },
  { value: 'CONTRACT',  label: 'Contract' },
  { value: 'TEMPORARY', label: 'Temporary' },
]

const ic =
  'w-full border border-base rounded-xl px-4 py-3 text-sm bg-surface text-body min-h-11 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-teal/25 focus:border-brand-teal transition-all'

const lbl = 'block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5'

export function StaffForm({ onClose, staffId }: Props) {
  const isEdit = !!staffId
  const { data: existingStaff } = useStaffProfile(staffId ?? '')
  const createStaff = useCreateStaff()
  const updateStaff = useUpdateStaff()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ name: string; email: string; tempPassword: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<StaffFormValues, unknown, CreateStaffInput>({
    // The ternary picks between two schemas with different (but
    // compatible-at-runtime) shapes — UpdateStaffSchema's fields are a
    // strict subset of CreateStaffInput's, and onSubmit already narrows to
    // that subset before calling updateStaff, so this is safe. TypeScript
    // can't resolve the ternary to a single static Resolver type since
    // isEdit is only known at runtime, hence the assertion.
    resolver: zodResolver(isEdit ? UpdateStaffSchema : CreateStaffSchema) as unknown as Resolver<StaffFormValues, unknown, CreateStaffInput>,
    defaultValues: { employmentType: 'FULL_TIME' },
  })

  // Prefill once the existing staff member's data resolves.
  useEffect(() => {
    if (existingStaff) {
      reset(mapStaffToFormValues(existingStaff as ApiStaffDetail))
    }
  }, [existingStaff, reset])

  // [PRODUCTION FIX 2026-07-27] Department/title are now selected from the
  // admin/hr/high_rank-editable taxonomy (Settings → Departments & Titles)
  // instead of free text — see useDepartmentTitles(). selectedDept drives
  // which titles the second select offers; changing department clears a
  // title that no longer belongs to it rather than silently submitting a
  // mismatched pair.
  const { data: departmentTitles = {}, isLoading: deptLoading } = useDepartmentTitles()
  const departments = Object.keys(departmentTitles).sort()
  const selectedDept = watch('department')
  const titlesForDept = selectedDept ? (departmentTitles[selectedDept] ?? []) : []

  function handleDepartmentChange() {
    // register('department')'s own onChange already updates that field;
    // this only clears jobTitle when it no longer belongs to the newly
    // selected department.
    setValue('jobTitle', '', { shouldValidate: false })
  }

  function onSubmit(data: CreateStaffInput) {
    setSubmitError(null)
    if (isEdit) {
      const { firstName, lastName, email, phone, department, jobTitle, employmentType, contractExpiry, salaryStructureId } = data
      updateStaff.mutate(
        { id: staffId!, data: { firstName, lastName, email, phone, department, jobTitle, employmentType, contractExpiry, salaryStructureId } as UpdateStaffInput },
        {
          onSuccess: () => onClose(),
          onError: (err) => {
            setSubmitError(err instanceof Error ? err.message : 'Failed to save changes. Please try again.')
          },
        },
      )
      return
    }
    createStaff.mutate(data, {
      onSuccess: (res) => {
        // The server returns the created profile plus a tempPassword fallback.
        const r = res as { firstName?: string; lastName?: string; email?: string; tempPassword?: string }
        if (r.tempPassword) {
          setCreated({
            name: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim(),
            email: r.email ?? data.email,
            tempPassword: r.tempPassword,
          })
        } else {
          onClose()
        }
      },
      onError: (err) => {
        setSubmitError(err instanceof Error ? err.message : 'Failed to create staff member. Please try again.')
      },
    })
  }

  async function copyPassword() {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.tempPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable — user can select the text manually */
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0" onClick={onClose} />
        <motion.div
          className="relative z-10 w-full max-w-lg bg-surface rounded-2xl shadow-xl overflow-hidden"
          initial={{ scale: 0.96, y: 12 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-base">
            <h2 className="font-heading font-bold text-brand-navy">
              {created ? 'Staff Account Created' : isEdit ? 'Edit Staff Member' : 'Add Staff Member'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-2 hover:bg-page rounded-xl min-h-11 min-w-11 flex items-center justify-center"
            >
              <X className="w-4 h-4 text-muted" />
            </button>
          </div>

          {/* Success view — show the temp password as a manual-relay fallback. */}
          {created ? (
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                <span>
                  {created.name}&apos;s account was created. A welcome email with these login
                  details has been sent to <strong>{created.email}</strong>. If it doesn&apos;t
                  arrive, share the temporary password below directly.
                </span>
              </div>
              <div>
                <span className={lbl}>Temporary password</span>
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
                  The staff member will be asked to change this on first login.
                </p>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 text-sm bg-brand-teal text-white rounded-xl font-semibold hover:bg-brand-teal-light min-h-11"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="overflow-y-auto max-h-[80vh]">
              <div className="p-6 grid grid-cols-2 gap-4">
                <div>
                  <label className={lbl} htmlFor="sf-firstName">First name</label>
                  <input id="sf-firstName" {...register('firstName')} className={ic} placeholder="e.g. Grace" />
                  {errors.firstName && <p className="text-xs text-brand-coral mt-1" role="alert">{errors.firstName.message}</p>}
                </div>
                <div>
                  <label className={lbl} htmlFor="sf-lastName">Last name</label>
                  <input id="sf-lastName" {...register('lastName')} className={ic} placeholder="e.g. Banda" />
                  {errors.lastName && <p className="text-xs text-brand-coral mt-1" role="alert">{errors.lastName.message}</p>}
                </div>
                <div className="col-span-full">
                  <label className={lbl} htmlFor="sf-email">Email (login)</label>
                  <input id="sf-email" type="email" {...register('email')} className={ic} placeholder="name@school.mw" />
                  {errors.email && <p className="text-xs text-brand-coral mt-1" role="alert">{errors.email.message}</p>}
                </div>
                {!isEdit && (
                  <div>
                    <label className={lbl} htmlFor="sf-employeeNo">Employee no.</label>
                    <input id="sf-employeeNo" {...register('employeeNo')} className={ic} placeholder="e.g. EMP-014" />
                    {errors.employeeNo && <p className="text-xs text-brand-coral mt-1" role="alert">{errors.employeeNo.message}</p>}
                  </div>
                )}
                <div>
                  <label className={lbl} htmlFor="sf-phone">Phone (optional)</label>
                  <input id="sf-phone" {...register('phone')} className={ic} placeholder="+265…" />
                  {errors.phone && <p className="text-xs text-brand-coral mt-1" role="alert">{errors.phone.message}</p>}
                </div>
                {!isEdit && (
                  <div>
                    <label className={lbl} htmlFor="sf-role">Role</label>
                    <select id="sf-role" {...register('role')} className={ic} defaultValue="">
                      <option value="" disabled>Select role…</option>
                      {STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                    {errors.role && <p className="text-xs text-brand-coral mt-1" role="alert">{errors.role.message}</p>}
                  </div>
                )}
                <div>
                  <label className={lbl} htmlFor="sf-employmentType">Employment type</label>
                  <select id="sf-employmentType" {...register('employmentType')} className={ic}>
                    {EMPLOYMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl} htmlFor="sf-department">Department</label>
                  <select
                    id="sf-department"
                    {...register('department', { onChange: handleDepartmentChange })}
                    className={ic}
                    disabled={deptLoading}
                    defaultValue=""
                  >
                    <option value="" disabled>{deptLoading ? 'Loading…' : 'Select department…'}</option>
                    {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                  {errors.department && <p className="text-xs text-brand-coral mt-1" role="alert">{errors.department.message}</p>}
                  {!deptLoading && departments.length === 0 && (
                    <p className="text-xs text-muted mt-1">
                      No departments defined yet — set them up under Settings → Departments &amp; Titles.
                    </p>
                  )}
                </div>
                <div>
                  <label className={lbl} htmlFor="sf-jobTitle">Job title</label>
                  <select
                    id="sf-jobTitle"
                    {...register('jobTitle')}
                    className={ic}
                    disabled={!selectedDept || titlesForDept.length === 0}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      {!selectedDept ? 'Select a department first…' : titlesForDept.length === 0 ? 'No titles for this department' : 'Select job title…'}
                    </option>
                    {titlesForDept.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  {errors.jobTitle && <p className="text-xs text-brand-coral mt-1" role="alert">{errors.jobTitle.message}</p>}
                </div>
                {!isEdit && (
                  <div>
                    <label className={lbl} htmlFor="sf-dateJoined">Date joined</label>
                    <input id="sf-dateJoined" type="date" {...register('dateJoined')} className={ic} />
                    {errors.dateJoined && <p className="text-xs text-brand-coral mt-1" role="alert">{errors.dateJoined.message}</p>}
                  </div>
                )}
                <div>
                  <label className={lbl} htmlFor="sf-contractExpiry">Contract expiry (optional)</label>
                  <input id="sf-contractExpiry" type="date" {...register('contractExpiry')} className={ic} />
                  {errors.contractExpiry && <p className="text-xs text-brand-coral mt-1" role="alert">{errors.contractExpiry.message}</p>}
                </div>
              </div>

              {submitError && (
                <p role="alert" className="mx-6 mb-4 flex items-start gap-2 text-xs text-brand-coral bg-brand-coral/8 border border-brand-coral/20 rounded-xl px-4 py-3">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
                  {submitError}
                </p>
              )}

              <div className="px-6 py-4 border-t border-base flex justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 text-sm border border-base rounded-xl hover:bg-page min-h-11"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createStaff.isPending || updateStaff.isPending}
                  className="px-5 py-2.5 text-sm bg-brand-teal text-white rounded-xl font-semibold flex items-center gap-2 disabled:opacity-60 hover:bg-brand-teal-light min-h-11"
                >
                  {(createStaff.isPending || updateStaff.isPending) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isEdit ? 'Save Changes' : 'Create Staff & Send Login'}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function mapStaffToFormValues(s: ApiStaffDetail): Partial<StaffFormValues> {
  return {
    firstName:         s.firstName,
    lastName:          s.lastName,
    email:             s.email,
    phone:             s.phone,
    department:        s.department,
    jobTitle:          s.jobTitle,
    employmentType:    s.employmentType as StaffFormValues['employmentType'],
    contractExpiry:    s.contractExpiry?.slice(0, 10),
    salaryStructureId: s.salaryStructureId,
  }
}