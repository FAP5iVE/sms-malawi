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
import { useStaffProfile } from '@/hooks/useHR'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { PermissionGuard } from '@/components/shared/PermissionGuard'
import { StaffForm } from '@/components/hr/StaffForm'
import { ROLE_LABELS } from '@shared/types/roles'
import type { ApiStaffDetail } from '@shared/types/api'
import { ArrowLeft, Pencil } from 'lucide-react'

const REVIEWERS = ['admin', 'hr', 'high_rank'] as const

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
        <span className="font-mono text-xs text-muted bg-page px-2 py-1 rounded border border-base">
          {staff.employeeNo}
        </span>
        <span
          className={`text-xs font-semibold px-2 py-1 rounded-full ${
            staff.status === 'ACTIVE'
              ? 'bg-brand-teal/10 text-brand-teal'
              : 'bg-muted/10 text-muted'
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
      </div>

      <div className="bg-surface rounded-xl p-5 sm:p-6 divide-y divide-base">
        <div className="grid sm:grid-cols-2 gap-x-8 gap-y-5 pb-5">
          <div>
            <p className="font-heading font-semibold text-xs uppercase tracking-wide text-muted mb-3">
              Employment Details
            </p>
            <div className="space-y-2.5">
              {[
                ['Role', ROLE_LABELS[staff.role as keyof typeof ROLE_LABELS] ?? staff.role],
                ['Department', staff.department],
                ['Job Title', staff.jobTitle],
                ['Employment Type', staff.employmentType.replace('_', '-')],
                ['Date Joined', new Date(staff.dateJoined).toLocaleDateString()],
                ['Contract Expiry', staff.contractExpiry ? new Date(staff.contractExpiry).toLocaleDateString() : '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between text-sm gap-4">
                  <span className="text-muted">{label}</span>
                  <span className="font-medium text-body text-right">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="font-heading font-semibold text-xs uppercase tracking-wide text-muted mb-3">
              Contact
            </p>
            <div className="space-y-2.5">
              {[
                ['Email', staff.email],
                ['Phone', staff.phone ?? '—'],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between text-sm gap-4">
                  <span className="text-muted">{label}</span>
                  <span className="font-medium text-body text-right break-all">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Leave balances — current calendar year, grouped by leave type */}
        {staff.leaveBalances.length > 0 && (
          <div className="py-5">
            <p className="font-heading font-semibold text-xs uppercase tracking-wide text-muted mb-3">
              Leave Balances ({staff.leaveBalances[0]?.year ?? new Date().getFullYear()})
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
            <p className="font-heading font-semibold text-xs uppercase tracking-wide text-muted mb-3">
              Active Loan
            </p>
            <div className="flex justify-between text-sm gap-4">
              <span className="text-muted">Remaining balance</span>
              <span className="font-heading font-bold text-brand-amber">
                {activeLoan.balance.toLocaleString('en-MW', { style: 'currency', currency: 'MWK', minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        )}

        {/* Recent performance notes */}
        {staff.performanceNotes.length > 0 && (
          <div className="pt-5">
            <p className="font-heading font-semibold text-xs uppercase tracking-wide text-muted mb-3">
              Recent Performance Notes
            </p>
            <div className="space-y-3">
              {staff.performanceNotes.map((note) => (
                <div key={note.id} className="bg-page rounded-xl p-3">
                  <div className="flex items-center justify-between text-xs text-muted mb-1">
                    <span>{note.academicYear} · Term {note.term}</span>
                    <span className="font-semibold">{note.rating}/5</span>
                  </div>
                  <p className="text-sm text-body">{note.notes}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {editing && <StaffForm staffId={id} onClose={() => setEditing(false)} />}
    </div>
  )
}