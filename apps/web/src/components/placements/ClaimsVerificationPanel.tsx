/**
 * [CHANGE TYPE]: MAJOR REWRITE (matching the reference module's exact design)
 * [FILE]: apps/web/src/components/placements/ClaimsVerificationPanel.tsx
 * [PURPOSE]: The "Claims Verification Desk" tab from the reference module —
 *   staff holding placement.verifyOutcome (admin, high_rank only) physically
 *   inspect the printed NCHE gazette against each student-submitted claim
 *   before approving or rejecting it. Two sub-tabs: Pending Verification and
 *   Verification History (claims already approved-via-claim or rejected —
 *   a staff-official entry is never a "claim" so it never appears here).
 *   Each claim renders as a rich card: status pill, submitted date,
 *   candidate name/exam-ID/gender/aggregate, the claimed destination, and
 *   the gazette citation quoted back exactly as the student entered it.
 * [DEPENDS ON]: @/hooks/usePlacements (usePlacementsQueue,
 *   useApprovePlacementClaim, useRejectPlacementClaim), PlacementStatusBadge,
 *   @/components/shared/{AcademicYearSelect, MotionBottomSheet}
 */
'use client'

import { useState } from 'react'
import { usePublicSchoolInfo } from '@/hooks/usePublic'
import { usePlacementsQueue, useApprovePlacementClaim, useRejectPlacementClaim } from '@/hooks/usePlacements'
import { AcademicYearSelect } from '@/components/shared/AcademicYearSelect'
import { MotionBottomSheet } from '@/components/shared/MotionBottomSheet'
import { ShieldCheck, Clock, FileCheck, Check, X, Loader2 } from 'lucide-react'
import type { ApiUniversityPlacement } from '@shared/types/api'

const FALLBACK_YEAR = '2025/2026'

function studentName(row: ApiUniversityPlacement): string {
  if (!row.student) return row.studentId
  return `${row.student.firstName} ${row.student.otherNames ? row.student.otherNames + ' ' : ''}${row.student.lastName}`
}

function ClaimCard({
  row, onApprove, onReject, approving,
}: {
  row: ApiUniversityPlacement
  onApprove?: () => void
  onReject?: () => void
  approving?: boolean
}) {
  const isPending = row.status === 'PENDING_APPROVAL'
  return (
    <div className={`rounded-xl border p-4 space-y-3 ${isPending ? 'border-brand-amber/40 bg-brand-amber/5' : 'border-base bg-page'}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
            isPending ? 'bg-brand-amber/15 text-brand-amber' : row.status === 'CONFIRMED' ? 'bg-brand-teal/15 text-brand-teal' : 'bg-brand-coral/15 text-brand-coral'
          }`}>
            {isPending ? 'Pending Physical Inspection' : row.status === 'CONFIRMED' ? 'Approved & Confirmed' : 'Rejected'}
          </span>
          <p className="text-xs text-muted mt-1">Submitted: {new Date(row.createdAt).toLocaleString()}</p>
        </div>
        {isPending && onApprove && onReject && (
          <div className="flex items-center gap-2">
            <button
              type="button" onClick={onReject}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-brand-coral text-brand-coral text-xs font-semibold"
            >
              <X className="w-3.5 h-3.5" /> Reject
            </button>
            <button
              type="button" onClick={onApprove} disabled={approving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-teal text-white text-xs font-semibold disabled:opacity-60"
            >
              {approving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Approve Selection
            </button>
          </div>
        )}
      </div>

      <div>
        <p className="font-heading font-semibold text-sm">{studentName(row)}</p>
        <p className="text-xs text-muted">
          MSCE Candidate: {row.student?.candidateNo ?? '\u2014'} {'\u00b7'} Gender: {row.student?.sex === 'FEMALE' ? 'Female' : row.student?.sex === 'MALE' ? 'Male' : '\u2014'}
          {typeof row.student?.aggregatePoints === 'number' && <> {'\u00b7'} Aggregate: {row.student.aggregatePoints} points</>}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="bg-surface border border-base rounded-lg p-3">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Claimed University & Program</p>
          <p className="text-sm font-medium">{row.placedProgrammeName ?? row.placedProgrammeId ?? '\u2014'}</p>
          <p className="text-xs text-muted">{row.placedUniversityName ?? row.placedUniversityId ?? '\u2014'}</p>
        </div>
        <div className="bg-surface border border-base rounded-lg p-3">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Physical Evidence / Gazette Citation</p>
          <p className="text-xs font-medium">{row.ncheBatchRef ?? '\u2014'}</p>
          {row.claimProofNote && <p className="text-xs text-muted italic mt-1">{row.claimProofNote}</p>}
        </div>
      </div>

      {row.status === 'REJECTED' && row.rejectionReason && (
        <p className="text-xs text-brand-coral"><span className="font-semibold">Reason given:</span> {row.rejectionReason}</p>
      )}
      {!isPending && row.verifiedByName && row.verifiedAt && (
        <p className="text-[11px] text-muted">By: {row.verifiedByName} on {new Date(row.verifiedAt).toLocaleString()}</p>
      )}
    </div>
  )
}

export function ClaimsVerificationPanel() {
  const { data: schoolInfo } = usePublicSchoolInfo()
  const [academicYear, setAcademicYear] = useState<string>('')
  const effectiveYear = academicYear || schoolInfo?.currentYear || FALLBACK_YEAR

  const { data: queue = [], isLoading, isError, error } = usePlacementsQueue(effectiveYear)
  const approve = useApprovePlacementClaim()
  const reject = useRejectPlacementClaim()

  const pending = queue.filter((p) => p.status === 'PENDING_APPROVAL')
  const history = queue.filter((p) => p.status !== 'PENDING_APPROVAL')

  const [tab, setTab] = useState<'pending' | 'history'>('pending')
  const [rejectTarget, setRejectTarget] = useState<ApiUniversityPlacement | null>(null)
  const [reason, setReason] = useState('')

  function handleReject() {
    if (!rejectTarget || reason.trim().length < 5) return
    reject.mutate(
      { id: rejectTarget.id, reason: reason.trim() },
      { onSuccess: () => { setRejectTarget(null); setReason('') } },
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-base rounded-xl p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-brand-amber/10 text-brand-amber flex items-center justify-center shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="font-heading font-semibold text-base">
              Claims Verification &amp; Approval Desk
              {pending.length > 0 && (
                <span className="ml-2 inline-flex items-center rounded-full bg-brand-amber/15 text-brand-amber text-xs font-bold px-2 py-0.5 align-middle">
                  {pending.length} Pending
                </span>
              )}
            </h3>
            <AcademicYearSelect
              value={effectiveYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="border border-base rounded-xl px-3 py-1.5 text-sm bg-page"
            />
          </div>
          <p className="text-xs text-muted mt-0.5">
            Physically inspect the printed NCHE Gazette against student-submitted placement claims before granting approval.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-base">
        <button
          type="button"
          onClick={() => setTab('pending')}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === 'pending' ? 'border-brand-amber text-brand-amber' : 'border-transparent text-muted hover:text-body'
          }`}
        >
          <Clock className="w-4 h-4" /> Pending Verification ({pending.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === 'history' ? 'border-brand-navy text-brand-navy' : 'border-transparent text-muted hover:text-body'
          }`}
        >
          <FileCheck className="w-4 h-4" /> Verification History ({history.length})
        </button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted py-8 text-center">Loading…</p>
      ) : isError ? (
        <div className="text-sm text-brand-coral py-8 text-center px-4">
          <p className="font-medium">Could not load the verification queue.</p>
          <p className="text-xs text-muted mt-1">{(error as Error)?.message ?? 'Unknown error — check your connection and try again.'}</p>
        </div>
      ) : tab === 'pending' ? (
        pending.length === 0 ? (
          <p className="text-sm text-muted py-8 text-center">No claims are waiting for verification.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((row) => (
              <ClaimCard
                key={row.id} row={row}
                onApprove={() => approve.mutate(row.id)}
                onReject={() => { setRejectTarget(row); setReason('') }}
                approving={approve.isPending}
              />
            ))}
          </div>
        )
      ) : history.length === 0 ? (
        <p className="text-sm text-muted py-8 text-center">No claims have been verified yet.</p>
      ) : (
        <div className="space-y-3">
          {history.map((row) => <ClaimCard key={row.id} row={row} />)}
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
