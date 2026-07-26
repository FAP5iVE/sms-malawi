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
 * [DEPENDS ON]: W/hooks/useHR.ts (useCreateStaff), @shared/schemas/hr
 *   (CreateStaffSchema), @shared/types/roles (ROLE_LABELS/USER_ROLES).
 */
'use client'

import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreateStaffSchema } from '@shared/schemas/hr'
import type { CreateStaffInput } from '@shared/schemas/hr'

// CreateStaffSchema has a defaulted field (employmentType), so its INPUT type
// (what the form fields hold before parsing — employmentType optional) differs
// from its OUTPUT type (CreateStaffInput — employmentType required). useForm is
// parameterised with both so the resolver, field registration, and the
// transformed submit handler all line up. Typing useForm on the output type
// alone is what produced the "two different Resolver types" mismatch.
type StaffFormValues = z.input<typeof CreateStaffSchema>
import { USER_ROLES, ROLE_LABELS } from '@shared/types/roles'
import { useCreateStaff } from '@/hooks/useHR'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, AlertTriangle, CheckCircle2, Copy } from 'lucide-react'

interface Props {
  onClose: () => void
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

export function StaffForm({ onClose }: Props) {
  const createStaff = useCreateStaff()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ name: string; email: string; tempPassword: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StaffFormValues, unknown, CreateStaffInput>({
    resolver: zodResolver(CreateStaffSchema),
    defaultValues: { employmentType: 'FULL_TIME' },
  })

  function onSubmit(data: CreateStaffInput) {
    setSubmitError(null)
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
              {created ? 'Staff Account Created' : 'Add Staff Member'}
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
                <div>
                  <label className={lbl} htmlFor="sf-employeeNo">Employee no.</label>
                  <input id="sf-employeeNo" {...register('employeeNo')} className={ic} placeholder="e.g. EMP-014" />
                  {errors.employeeNo && <p className="text-xs text-brand-coral mt-1" role="alert">{errors.employeeNo.message}</p>}
                </div>
                <div>
                  <label className={lbl} htmlFor="sf-phone">Phone (optional)</label>
                  <input id="sf-phone" {...register('phone')} className={ic} placeholder="+265…" />
                  {errors.phone && <p className="text-xs text-brand-coral mt-1" role="alert">{errors.phone.message}</p>}
                </div>
                <div>
                  <label className={lbl} htmlFor="sf-role">Role</label>
                  <select id="sf-role" {...register('role')} className={ic} defaultValue="">
                    <option value="" disabled>Select role…</option>
                    {STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  {errors.role && <p className="text-xs text-brand-coral mt-1" role="alert">{errors.role.message}</p>}
                </div>
                <div>
                  <label className={lbl} htmlFor="sf-employmentType">Employment type</label>
                  <select id="sf-employmentType" {...register('employmentType')} className={ic}>
                    {EMPLOYMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className={lbl} htmlFor="sf-department">Department</label>
                  <input id="sf-department" {...register('department')} className={ic} placeholder="e.g. Sciences" />
                  {errors.department && <p className="text-xs text-brand-coral mt-1" role="alert">{errors.department.message}</p>}
                </div>
                <div>
                  <label className={lbl} htmlFor="sf-jobTitle">Job title</label>
                  <input id="sf-jobTitle" {...register('jobTitle')} className={ic} placeholder="e.g. Biology Teacher" />
                  {errors.jobTitle && <p className="text-xs text-brand-coral mt-1" role="alert">{errors.jobTitle.message}</p>}
                </div>
                <div>
                  <label className={lbl} htmlFor="sf-dateJoined">Date joined</label>
                  <input id="sf-dateJoined" type="date" {...register('dateJoined')} className={ic} />
                  {errors.dateJoined && <p className="text-xs text-brand-coral mt-1" role="alert">{errors.dateJoined.message}</p>}
                </div>
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
                  disabled={createStaff.isPending}
                  className="px-5 py-2.5 text-sm bg-brand-teal text-white rounded-xl font-semibold flex items-center gap-2 disabled:opacity-60 hover:bg-brand-teal-light min-h-11"
                >
                  {createStaff.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Create Staff &amp; Send Login
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}