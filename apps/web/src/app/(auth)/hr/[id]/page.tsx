/**
 * apps/web/src/app/(auth)/hr/[id]/page.tsx
 *
 * [CHANGE TYPE]: NEW FILE (mobile UI audit fix).
 * [PURPOSE]: HR Staff Directory cards were not clickable at all — tapping
 *   one did nothing, with no way to view a staff member's fuller profile
 *   (leave balances, active loans, recent performance notes) or edit their
 *   details. This is a new dedicated profile route, structured to directly
 *   mirror students/[id]/page.tsx: a read-only detail view with an Edit
 *   button that opens StaffForm in its new edit mode (staffId prop).
 *   Access is gated the same way GET /hr/:id itself is gated server-side
 *   (RoleGuard allowed=admin/hr/high_rank, matching hr.viewAnyProfile's
 *   real grant — the same REVIEWERS list server/routes/hr.ts already
 *   uses); the Edit button is further gated behind PermissionGuard
 *   permission="hr.editStaff", matching the new PATCH /hr/:id route.
 * [DEPENDS ON]: W/hooks/useHR.ts (useStaffProfile), W/components/hr/
 *   StaffForm.tsx (edit mode), @shared/types/api (ApiStaffDetail),
 *   @shared/types/roles (ROLE_LABELS).
 */
'use client'

import { useParams } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { useStaffProfile, useAddPerformanceNote } from '@/hooks/useHR'
import { useEffectiveViewingPeriod } from '@/hooks/useViewingPeriod'
import { usePermissions } from '@/hooks/usePermissions'
import { StaffResponsibilities } from '@/components/hr/StaffResponsibilities'
import { TerminateStaffModal } from '@/components/hr/TerminateStaffModal'
import {
  EMPLOYMENT_CATEGORY_LABELS,
  QUALIFICATION_LEVEL_LABELS,
  TRAINING_ROUTE_LABELS,
  STAFF_EXIT_REASON_LABELS,
  LICENCE_EXPIRY_WARNING_DAYS,
} from '@shared/constants/malawi'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { PermissionGuard } from '@/components/shared/PermissionGuard'
import { StaffForm } from '@/components/hr/StaffForm'
import { ROLE_LABELS } from '@shared/types/roles'
import type { ApiStaffDetail } from '@shared/types/api'
import { ArrowLeft, Pencil, Star } from 'lucide-react'

const REVIEWERS = ['admin', 'hr', 'high_rank'] as const

/** YYYY-MM-DD as a stable calendar date (no timezone shift). */
function formatDay(ymd: string): string {
  return new Date(`${ymd}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

function formatMonths(months: number): string {
  if (months < 1) return 'Under a month'
  const years = Math.floor(months / 12)
  const rem = months % 12
  const parts = [
    years ? `${years} yr${years > 1 ? 's' : ''}` : '',
    rem ? `${rem} mo` : '',
  ].filter(Boolean)
  return parts.join(' ')
}

function Stars({ value, size = 'w-3.5 h-3.5' }: { value: number; size?: string }) {
  return (
    <span className="inline-flex" role="img" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${size} ${n <= Math.round(value) ? 'fill-current text-tone-amber' : 'text-muted'}`} aria-hidden />
      ))}
    </span>
  )
}

/**
 * Staff performance: average rating, the full list of rating notes (who wrote each, which
 * year and term), and a form to add a new rating and comment. Uses the existing POST /hr/performance.
 */
function PerformanceSection({ staffId, notes }: { staffId: string; notes: ApiStaffDetail['performanceNotes'] }) {
  const period = useEffectiveViewingPeriod()
  const add = useAddPerformanceNote()
  const [yearInput, setYearInput] = useState<string | null>(null)
  const [termInput, setTermInput] = useState<number | null>(null)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const year = yearInput ?? period.academicYear
  const term = termInput ?? period.term
  const average = notes.length ? notes.reduce((s, n) => s + n.rating, 0) / notes.length : null

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!year || !term) { setFormError('Pick the academic year and term.'); return }
    if (rating < 1) { setFormError('Choose a rating from 1 to 5 stars.'); return }
    if (comment.trim().length < 10) { setFormError('Write a comment of at least 10 characters.'); return }
    setFormError(null)
    add.mutate(
      { staffId, academicYear: year, term, rating, notes: comment.trim() },
      { onSuccess: () => { setRating(0); setComment('') } },
    )
  }

  return (
    <div className="pt-5">
      <div className="flex items-center justify-between mb-3 gap-3">
        <p className="font-heading font-semibold text-xs text-muted">Performance</p>
        {average !== null && (
          <span className="flex items-center gap-2 text-xs text-muted">
            <Stars value={average} />
            <span className="font-semibold text-body">{average.toFixed(1)}/5</span>
            <span>· {notes.length} {notes.length === 1 ? 'rating' : 'ratings'}</span>
          </span>
        )}
      </div>

      <form onSubmit={submit} className="bg-page rounded-xl p-3 space-y-3 mb-4">
        <div className="flex flex-wrap gap-3">
          <label className="text-xs text-muted flex flex-col gap-1">
            Academic year
            <input
              value={year ?? ''}
              onChange={(e) => setYearInput(e.target.value)}
              placeholder="e.g. 2026"
              className="border border-base rounded-xl px-3 py-2 text-sm bg-surface text-body min-h-[44px] w-32"
            />
          </label>
          <label className="text-xs text-muted flex flex-col gap-1">
            Term
            <select
              value={term ?? ''}
              onChange={(e) => setTermInput(Number(e.target.value))}
              className="border border-base rounded-xl px-3 py-2 text-sm bg-surface text-body min-h-[44px]"
            >
              {[1, 2, 3].map((t) => <option key={t} value={t}>Term {t}</option>)}
            </select>
          </label>
          <div className="text-xs text-muted flex flex-col gap-1">
            Rating
            <div className="flex items-center min-h-[44px]" role="radiogroup" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n} star${n > 1 ? 's' : ''}`}
                  onClick={() => setRating(n)}
                  className="p-1.5"
                >
                  <Star className={`w-6 h-6 ${n <= rating ? 'fill-current text-tone-amber' : 'text-muted'}`} aria-hidden />
                </button>
              ))}
            </div>
          </div>
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="Comment on this staff member's performance (min. 10 characters)"
          className="w-full border border-base rounded-xl px-3 py-2.5 text-sm bg-surface text-body resize-none"
        />
        {formError && <p role="alert" className="text-xs text-tone-coral">{formError}</p>}
        <button
          type="submit"
          disabled={add.isPending}
          className="px-4 py-2.5 rounded-xl bg-brand-navy text-white text-sm font-medium min-h-[44px] disabled:opacity-60"
        >
          {add.isPending ? 'Saving…' : 'Save rating'}
        </button>
      </form>

      {notes.length === 0 ? (
        <p className="text-sm text-muted">No performance ratings recorded yet.</p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="bg-page rounded-xl p-3">
              <div className="flex items-center justify-between text-xs text-muted mb-1 gap-3">
                <span>{note.academicYear} · Term {note.term}</span>
                <Stars value={note.rating} />
              </div>
              <p className="text-sm text-body">{note.notes}</p>
              <p className="text-xs text-muted mt-1.5">
                {note.authorName ?? 'Reviewer'} · {new Date(note.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function StaffProfilePage() {
  return (
    <RoleGuard allowed={[...REVIEWERS]}>
      <StaffProfileContent />
    </RoleGuard>
  )
}

function StaffProfileContent() {
  const { id } = useParams<{ id: string }>()
  const { data, isLoading } = useStaffProfile(id)
  const staff = data as ApiStaffDetail | undefined
  const [editing, setEditing] = useState(false)
  const [terminating, setTerminating] = useState(false)
  // Captured once on mount so render stays pure (react-hooks/purity forbids Date.now() in render).
  const [now] = useState(() => Date.now())
  const { can } = usePermissions()

  if (isLoading)
    return (
      <div className="space-y-4">
        <div className="skeleton h-8 w-48 rounded-lg" />
        <div className="skeleton h-56 rounded-xl" />
      </div>
    )
  if (!staff) return <p className="text-muted">Staff member not found.</p>

  const activeLoan = staff.loans[0]

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href="/hr"
          className="p-1.5 rounded-lg hover:bg-page border border-base"
          aria-label="Back to HR"
        >
          <ArrowLeft className="w-4 h-4 text-muted" />
        </Link>
        <h1 className="font-heading text-xl font-bold text-brand-navy">
          {staff.firstName} {staff.lastName}
        </h1>
        <span className="font-mono text-xs text-muted">
          {staff.employeeNo}
        </span>
        <span
          className={`text-xs font-semibold ${
            staff.status === 'ACTIVE'
              ? 'text-status-success'
              : 'text-muted'
          }`}
        >
          {staff.status}
        </span>
        <PermissionGuard permission="hr.editStaff">
          <button
            onClick={() => setEditing(true)}
            className="ml-auto flex items-center gap-1.5 border border-base px-3 py-1.5 rounded-lg text-sm hover:bg-page"
            aria-label="Edit staff member"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
        </PermissionGuard>
        <PermissionGuard permission="hr.terminateStaff">
          {staff.status !== 'TERMINATED' && (
            <button
              onClick={() => setTerminating(true)}
              className="flex items-center gap-1.5 border border-brand-coral/40 text-tone-coral px-3 py-1.5 rounded-lg text-sm hover:bg-brand-coral/10"
              aria-label="Terminate staff member"
            >
              Terminate
            </button>
          )}
        </PermissionGuard>
      </div>

      <div className="bg-surface rounded-xl p-5 sm:p-6 divide-y divide-base">
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5 pb-5">
          <div>
            <p className="font-heading font-semibold text-xs text-muted mb-3">
              Employment details
            </p>
            <div className="space-y-2.5">
              {[
                ['Role', ROLE_LABELS[staff.role as keyof typeof ROLE_LABELS] ?? staff.role],
                ['Department', staff.department],
                ['Job Title', staff.jobTitle],
                ['Sex', staff.sex === 'MALE' ? 'Male' : staff.sex === 'FEMALE' ? 'Female' : 'Not recorded'],
                ['Employment Type', staff.employmentType.replace('_', '-')],
                ['Date Joined', new Date(staff.dateJoined).toLocaleDateString()],
                // Full-time staff are employed indefinitely, so they have no end date.
                ['Contract Expiry', staff.contractExpiry ? new Date(staff.contractExpiry).toLocaleDateString() : staff.employmentType === 'FULL_TIME' ? 'Indefinite' : '-'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between text-sm gap-4">
                  <span className="text-muted">{label}</span>
                  <span className="font-medium text-body text-right">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="font-heading font-semibold text-xs text-muted mb-3">
              Contact
            </p>
            <div className="space-y-2.5">
              {[
                ['Email', staff.email],
                ['Phone', staff.phone ?? '-'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between text-sm gap-4">
                  <span className="text-muted">{label}</span>
                  <span className="font-medium text-body text-right break-all">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Identity & retirement — only for roles holding hr.viewStaffSensitive
            (admin / hr / high_rank). The server omits these fields for anyone
            else, so this is a display gate, not the security boundary. */}
        {can('hr.viewStaffSensitive') && (
          <div className="py-5 grid sm:grid-cols-2 gap-x-8 gap-y-5">
            <div>
              <p className="font-heading font-semibold text-xs text-muted mb-3">
                Identity
              </p>
              <div className="space-y-2.5">
                {[
                  ['Date of Birth', staff.dateOfBirth ? formatDay(staff.dateOfBirth.slice(0, 10)) : '-'],
                  ['Nationality', staff.nationality ?? '-'],
                  ['Home District', staff.homeDistrict ?? '-'],
                  ['NRB National ID', staff.nrbNumber ?? '-'],
                  ['MRA TPIN', staff.tpin ?? '-'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between text-sm gap-4">
                    <span className="text-muted">{label}</span>
                    <span className="font-medium text-body text-right">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="font-heading font-semibold text-xs text-muted mb-3">
                Retirement and next of kin
              </p>
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm gap-4">
                  <span className="text-muted">Retirement date</span>
                  <span className="font-medium text-right">
                    {staff.retirement ? (
                      <span
                        className={
                          staff.retirement.status === 'RETIRED'
                            ? 'text-tone-coral'
                            : staff.retirement.status === 'DUE_WITHIN_YEAR'
                              ? 'text-tone-amber'
                              : 'text-body'
                        }
                      >
                        {formatDay(staff.retirement.retirementDate)}
                        <span className="block text-xs font-normal text-muted">
                          {staff.retirement.status === 'RETIRED'
                            ? `Reached retirement age (${staff.retirement.retirementAge})`
                            : `${formatMonths(staff.retirement.monthsRemaining)} left · age ${staff.retirement.retirementAge}`}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted">Add a date of birth to calculate</span>
                    )}
                  </span>
                </div>
                {[
                  ['Next of Kin', staff.nextOfKinName ?? '-'],
                  ['Relationship', staff.nextOfKinRelation ?? '-'],
                  ['Next of Kin Phone', staff.nextOfKinPhone ?? '-'],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between text-sm gap-4">
                    <span className="text-muted">{label}</span>
                    <span className="font-medium text-body text-right">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Teaching, licensing & qualifications — hr.viewStaffSensitive only (the
            server omits these fields for anyone else). */}
        {can('hr.viewStaffSensitive') && (
          <div className="py-5 grid sm:grid-cols-2 gap-x-8 gap-y-5">
            <div>
              <p className="font-heading font-semibold text-xs text-muted mb-3">
                Teaching and licence
              </p>
              <div className="space-y-2.5">
                {[
                  ['Teaching Staff', staff.isTeaching ? 'Yes' : 'No'],
                  ...(staff.isTeaching
                    ? [
                        ['TCM Registration No.', staff.tcmRegistrationNo ?? '-'],
                        ['TCM Licence No.', staff.tcmLicenceNo ?? 'Missing'],
                        ['Training Route', staff.trainingRoute ? TRAINING_ROUTE_LABELS[staff.trainingRoute] : '-'],
                        ['Qualified Subjects', staff.qualifiedSubjects && staff.qualifiedSubjects.length > 0 ? staff.qualifiedSubjects.map((q) => q.subject).join(', ') : '-'],
                      ]
                    : []),
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between text-sm gap-4">
                    <span className="text-muted">{label}</span>
                    <span className={`font-medium text-right ${value === 'Missing' ? 'text-tone-coral' : 'text-body'}`}>{value}</span>
                  </div>
                ))}
                {staff.isTeaching && (() => {
                  if (!staff.tcmLicenceExpiry) {
                    return (
                      <div className="flex justify-between text-sm gap-4">
                        <span className="text-muted">Licence expiry</span>
                        <span className="font-medium text-tone-coral">Missing</span>
                      </div>
                    )
                  }
                  const days = Math.ceil((new Date(staff.tcmLicenceExpiry).getTime() - now) / 86_400_000)
                  const cls = days < 0 ? 'text-tone-coral' : days <= LICENCE_EXPIRY_WARNING_DAYS ? 'text-tone-amber' : 'text-body'
                  return (
                    <div className="flex justify-between text-sm gap-4">
                      <span className="text-muted">Licence expiry</span>
                      <span className={`font-medium text-right ${cls}`}>
                        {formatDay(staff.tcmLicenceExpiry.slice(0, 10))}
                        <span className="block text-xs font-normal">
                          {days < 0 ? 'Expired' : `${days} day${days === 1 ? '' : 's'} left`}
                        </span>
                      </span>
                    </div>
                  )
                })()}
              </div>
            </div>

            <div>
              <p className="font-heading font-semibold text-xs text-muted mb-3">
                Employment and qualifications
              </p>
              <div className="space-y-2.5">
                {[
                  ['Category', staff.employmentCategory ? EMPLOYMENT_CATEGORY_LABELS[staff.employmentCategory] : '-'],
                  ['Payroll No.', staff.payrollNo ?? '-'],
                  ['Highest Qualification', staff.highestQualification ? QUALIFICATION_LEVEL_LABELS[staff.highestQualification] : '-'],
                  ...(staff.qualificationProgram ? [['Programme Studied', staff.qualificationProgram]] : []),
                  ...(staff.exitReason
                    ? [
                        ['Reason for Leaving', STAFF_EXIT_REASON_LABELS[staff.exitReason]],
                        ['Last Day of Service', staff.exitDate ? formatDay(staff.exitDate.slice(0, 10)) : '-'],
                      ]
                    : []),
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between text-sm gap-4">
                    <span className="text-muted shrink-0">{label}</span>
                    <span className="font-medium text-body text-right">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="sm:col-span-2">
              <StaffResponsibilities
                staffId={staff.id}
                responsibilities={staff.responsibilities ?? []}
                canEdit={can('hr.editStaff')}
              />
            </div>
          </div>
        )}

        {terminating && (
          <TerminateStaffModal
            staffId={staff.id}
            staffName={`${staff.firstName} ${staff.lastName}`}
            onClose={() => setTerminating(false)}
          />
        )}

        {/* Leave balances — current calendar year, grouped by leave type */}
        {staff.leaveBalances.length > 0 && (
          <div className="py-5">
            <p className="font-heading font-semibold text-xs text-muted mb-3">
              Leave balances ({staff.leaveBalances[0]?.year ?? new Date().getFullYear()})
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {staff.leaveBalances.map((b) => (
                <div key={b.id} className="bg-page rounded-xl p-3 min-w-0">
                  <p className="text-xs text-muted capitalize truncate">{b.leaveType.toLowerCase()}</p>
                  <p className="text-lg font-heading font-bold text-brand-navy tabular break-words">
                    {b.totalDays - b.usedDays - b.pendingDays}
                    <span className="text-xs font-normal text-muted"> / {b.totalDays} left</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active loan, if any */}
        {activeLoan && (
          <div className="py-5">
            <p className="font-heading font-semibold text-xs text-muted mb-3">
              Active loan
            </p>
            <div className="flex justify-between text-sm gap-4">
              <span className="text-muted">Remaining balance</span>
              <span className="font-heading font-bold text-tone-amber">
                {activeLoan.balance.toLocaleString('en-MW', { style: 'currency', currency: 'MWK', minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}

        {/* Performance: rate, comment, and see the history */}
        <PerformanceSection staffId={staff.id} notes={staff.performanceNotes} />
      </div>

      {editing && <StaffForm staffId={id} onClose={() => setEditing(false)} />}
    </div>
  )
}