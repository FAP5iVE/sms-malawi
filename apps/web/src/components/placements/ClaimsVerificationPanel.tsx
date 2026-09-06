/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/placements/ClaimsVerificationPanel.tsx
 * [PURPOSE]: The "Claims Verification Desk" tab from the reference module —
 *   staff holding placement.verifyOutcome (admin, high_rank only) review
 *   PENDING_APPROVAL student self-claims (plus previously REJECTED ones, for
 *   history/context) and approve or reject each. Approve is a single tap;
 *   reject requires a reason, which is shown to the student.
 * [DEPENDS ON]: @/hooks/usePlacements (usePlacementsQueue,
 *   useApprovePlacementClaim, useRejectPlacementClaim), PlacementStatusBadge,
 *   @/components/shared/{AcademicYearSelect, DataTable, MotionBottomSheet}
 */
'use client'

import { useState } from 'react'
import { usePublicSchoolInfo } from '@/hooks/usePublic'
import { usePlacementsQueue, useApprovePlacementClaim, useRejectPlacementClaim } from '@/hooks/usePlacements'
import { AcademicYearSelect } from '@/components/shared/AcademicYearSelect'
import { DataTable, type DataColumn, type MobileAction } from '@/components/shared/DataTable'
import { MotionBottomSheet } from '@/components/shared/MotionBottomSheet'
import { PlacementStatusBadge } from '@/components/placements/PlacementStatusBadge'
import type { ApiUniversityPlacement } from '@shared/types/api'
import { Check, X, Loader2 } from 'lucide-react'

const FALLBACK_YEAR = '2025/2026'

function studentName(row: ApiUniversityPlacement): string {
  if (!row.student) return row.studentId
  return `${row.student.firstName} ${row.student.otherNames ? row.student.otherNames + ' ' : ''}${row.student.lastName}`
}

export function ClaimsVerificationPanel() {
  const { data: schoolInfo } = usePublicSchoolInfo()
  const [academicYear, setAcademicYear] = useState<string>('')
  const effectiveYear = academicYear || schoolInfo?.currentYear || FALLBACK_YEAR

  const { data: queue = [], isLoading } = usePlacementsQueue(effectiveYear)
  const approve = useApprovePlacementClaim()
  const reject = useRejectPlacementClaim()

  const [rejectTarget, setRejectTarget] = useState<ApiUniversityPlacement | null>(null)
  const [reason, setReason] = useState('')

  const pending = queue.filter((p) => p.status === 'PENDING_APPROVAL')
  const history = queue.filter((p) => p.status === 'REJECTED')

  function handleReject() {
    if (!rejectTarget) return
    if (reason.trim().length < 5) return
    reject.mutate(
      { id: rejectTarget.id, reason: reason.trim() },
      { onSuccess: () => { setRejectTarget(null); setReason('') } },
    )
  }

  const columns: DataColumn<ApiUniversityPlacement>[] = [
    { key: 'student', label: 'Student', priority: 'critical', render: studentName },
    {
      key: 'placedUniversityId', label: 'Claimed destination', priority: 'critical',
      render: (row) => `${row.placedProgrammeName ?? row.placedProgrammeId ?? '—'} — ${row.placedUniversityName ?? row.placedUniversityId ?? '—'}`,
    },
    { key: 'ncheBatchRef', label: 'Gazette reference', priority: 'important', render: (row) => row.ncheBatchRef ?? '—' },
    { key: 'claimProofNote', label: 'Evidence', priority: 'optional', render: (row) => row.claimProofNote ?? '—' },
    {
      key: 'actions', label: 'Actions', priority: 'critical',
      render: (row) => (
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => approve.mutate(row.id)}
            disabled={approve.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-teal text-white text-xs font-semibold disabled:opacity-60"
          >
            <Check className="w-3.5 h-3.5" /> Approve
          </button>
          <button
            type="button"
            onClick={() => { setRejectTarget(row); setReason('') }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-coral text-brand-coral text-xs font-semibold"
          >
            <X className="w-3.5 h-3.5" /> Reject
          </button>
        </div>
      ),
    },
  ]

  // Mobile-only fallback: DataTable's mobile card list doesn't render custom
  // column content inline the way the desktop table/card views do, so
  // Approve/Reject are also offered as bottom-sheet actions on small screens.
  const mobileActions: MobileAction<ApiUniversityPlacement>[] = [
    { label: 'Approve', icon: Check, onClick: (row) => approve.mutate(row.id) },
    { label: 'Reject', icon: X, variant: 'danger', onClick: (row) => { setRejectTarget(row); setReason('') } },
  ]

  const historyColumns: DataColumn<ApiUniversityPlacement>[] = [
    { key: 'student', label: 'Student', priority: 'critical', render: studentName },
    { key: 'rejectionReason', label: 'Reason', priority: 'critical', render: (row) => row.rejectionReason ?? '—' },
    { key: 'status', label: 'Status', priority: 'important', render: (row) => <PlacementStatusBadge status={row.status} /> },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-heading font-semibold text-base">Claims awaiting verification</h3>
          <p className="text-xs text-muted mt-0.5">{pending.length} student self-claim(s) pending for {effectiveYear}.</p>
        </div>
        <AcademicYearSelect
          value={effectiveYear}
          onChange={(e) => setAcademicYear(e.target.value)}
          className="border border-base rounded-xl px-3 py-2 text-sm bg-surface"
        />
      </div>

      <DataTable
        data={pending}
        isLoading={isLoading}
        columns={columns}
        rowKey="id"
        mobileActions={mobileActions}
        emptyMessage="No claims are waiting for verification."
      />

      {/* Mobile card list (DataTable's built-in) also gets these via mobileActions above */}

      {history.length > 0 && (
        <div>
          <h4 className="font-heading font-semibold text-sm mb-2">Previously rejected</h4>
          <DataTable data={history} isLoading={false} columns={historyColumns} rowKey="id" emptyMessage="" />
        </div>
      )}

      <MotionBottomSheet
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        title={rejectTarget ? `Reject ${studentName(rejectTarget)}'s claim` : ''}
      >
        {rejectTarget && (
          <div className="space-y-3 pb-4">
            <label className="text-sm block">
              <span className="block text-xs text-muted mb-1">Reason (shown to the student)</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="e.g. Name not found on the published NCHE gazette for this batch."
                className="w-full border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none resize-none"
              />
            </label>
            {reason.trim().length > 0 && reason.trim().length < 5 && (
              <p className="text-sm text-brand-coral">Give a slightly longer reason.</p>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReject}
                disabled={reject.isPending || reason.trim().length < 5}
                className="flex items-center gap-2 min-h-11 px-5 rounded-xl text-sm font-heading font-semibold bg-brand-coral text-white disabled:opacity-60"
              >
                {reject.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirm rejection
              </button>
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="min-h-11 px-4 rounded-xl text-sm font-semibold border border-base"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </MotionBottomSheet>
    </div>
  )
}
