/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/placements/StudentClaimPanel.tsx
 * [PURPOSE]: The "Student Claim Portal" tab from the reference module — a
 *   GRADUATED student reports that they were selected by NCHE, citing where
 *   their name appears on the published gazette. Always lands as
 *   PENDING_APPROVAL until a staff member approves or rejects it (never
 *   auto-confirmed). The parent page only renders this tab once
 *   useMyPlacement().data?.isGraduated is true — a below-MSCE or
 *   still-enrolled student never sees it — but this component re-checks the
 *   same flag itself so it is never reachable by a direct link either.
 * [DEPENDS ON]: @/hooks/usePlacements (useMyPlacement, useSubmitPlacementClaim,
 *   usePlacementCatalogue), PlacementDestinationFields, PlacementStatusBadge
 */
'use client'

import { useState } from 'react'
import type { UseMutationResult } from '@tanstack/react-query'
import { useMyPlacement, useSubmitPlacementClaim, usePlacementCatalogue } from '@/hooks/usePlacements'
import { PlacementDestinationFields, type DestinationValue } from '@/components/placements/PlacementDestinationFields'
import { PlacementStatusBadge } from '@/components/placements/PlacementStatusBadge'
import type { University } from '@shared/constants/universities'
import type { ApiUniversityPlacement } from '@shared/types/api'
import type { StudentClaimInput } from '@shared/schemas/placement'
import { Loader2, Send, AlertTriangle } from 'lucide-react'

function nextIntakeYear(): string {
  return String(new Date().getFullYear() + 1)
}

export function StudentClaimPanel() {
  const { data, isLoading } = useMyPlacement()
  const { data: catalogue = [] } = usePlacementCatalogue()
  const submitClaim = useSubmitPlacementClaim()

  const [destination, setDestination] = useState<DestinationValue>({ placedUniversityId: '', placedProgrammeId: '' })
  const [admissionYear, setAdmissionYear] = useState(nextIntakeYear())
  const [ncheBatchRef, setNcheBatchRef] = useState('')
  const [claimProofNote, setClaimProofNote] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  if (isLoading) {
    return <div className="text-center py-10 text-sm text-muted animate-pulse">Loading…</div>
  }

  if (!data?.isGraduated) {
    return (
      <div className="text-center py-10 px-4">
        <AlertTriangle className="w-8 h-8 mx-auto text-brand-amber mb-2" />
        <p className="text-sm text-muted">
          The Student Claim Portal is only available once you have graduated (after your MSCE examinations).
        </p>
      </div>
    )
  }

  const record = data.record

  if (record) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-heading font-semibold text-base">Your placement claim</h3>
          <PlacementStatusBadge status={record.status} />
        </div>

        <div className="bg-surface border border-base rounded-xl p-4 space-y-2 text-sm">
          <p>
            <span className="text-muted">Programme:</span>{' '}
            <span className="font-medium">{record.placedProgrammeName ?? record.placedProgrammeId ?? '—'}</span>
          </p>
          <p>
            <span className="text-muted">University:</span>{' '}
            <span className="font-medium">{record.placedUniversityName ?? record.placedUniversityId ?? '—'}</span>
          </p>
          <p><span className="text-muted">Admission year:</span> <span className="font-medium">{record.admissionYear}</span></p>
          {record.status === 'REJECTED' && record.rejectionReason && (
            <p className="text-brand-coral"><span className="text-muted">Reason:</span> {record.rejectionReason}</p>
          )}
        </div>

        {record.status !== 'CONFIRMED' && (
          <p className="text-xs text-muted">
            {record.status === 'PENDING_APPROVAL'
              ? 'The admissions office is reviewing your claim. You will be notified once it is confirmed or rejected.'
              : 'Your claim was rejected. Submit a corrected claim below if you believe this was in error.'}
          </p>
        )}

        {record.status === 'REJECTED' && (
          <ClaimForm
            catalogue={catalogue}
            destination={destination} setDestination={setDestination}
            admissionYear={admissionYear} setAdmissionYear={setAdmissionYear}
            ncheBatchRef={ncheBatchRef} setNcheBatchRef={setNcheBatchRef}
            claimProofNote={claimProofNote} setClaimProofNote={setClaimProofNote}
            formError={formError} setFormError={setFormError}
            submitClaim={submitClaim}
          />
        )}
      </div>
    )
  }

  if (!data.hasCertifiedMsce) {
    return (
      <div className="text-center py-10 px-4">
        <AlertTriangle className="w-8 h-8 mx-auto text-brand-amber mb-2" />
        <p className="text-sm text-muted">
          No certified MSCE record was found for your account yet. Once your results are certified, you'll be able
          to submit a placement claim here.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="font-heading font-semibold text-base">Claim your placement</h3>
      <p className="text-sm text-muted">
        If you've been selected by the National Council for Higher Education, tell us where — and cite the gazette
        page or reference where your name appears. Your claim goes to the admissions office for verification before
        it appears on the public register.
      </p>
      <ClaimForm
        catalogue={catalogue}
        destination={destination} setDestination={setDestination}
        admissionYear={admissionYear} setAdmissionYear={setAdmissionYear}
        ncheBatchRef={ncheBatchRef} setNcheBatchRef={setNcheBatchRef}
        claimProofNote={claimProofNote} setClaimProofNote={setClaimProofNote}
        formError={formError} setFormError={setFormError}
        submitClaim={submitClaim}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────
//  CLAIM FORM (submit or resubmit-after-rejection)
// ─────────────────────────────────────────────────────────

interface ClaimFormProps {
  catalogue: University[]
  destination: DestinationValue
  setDestination: (v: DestinationValue) => void
  admissionYear: string
  setAdmissionYear: (v: string) => void
  ncheBatchRef: string
  setNcheBatchRef: (v: string) => void
  claimProofNote: string
  setClaimProofNote: (v: string) => void
  formError: string | null
  setFormError: (v: string | null) => void
  submitClaim: UseMutationResult<ApiUniversityPlacement, Error, StudentClaimInput>
}

function ClaimForm({
  catalogue, destination, setDestination, admissionYear, setAdmissionYear,
  ncheBatchRef, setNcheBatchRef, claimProofNote, setClaimProofNote,
  formError, setFormError, submitClaim,
}: ClaimFormProps) {
  function handleSubmit() {
    setFormError(null)
    const hasCatalogue = Boolean(destination.placedUniversityId && destination.placedProgrammeId)
    const hasFreeText = Boolean(destination.placedUniversityName && destination.placedProgrammeName)
    if (hasCatalogue === hasFreeText) {
      setFormError('Choose a catalogue programme, or switch to manual entry and fill in both fields.')
      return
    }
    if (!admissionYear.trim()) {
      setFormError('Enter the admission (intake) year.')
      return
    }
    if (ncheBatchRef.trim().length < 1) {
      setFormError('Cite where your name appears on the published gazette.')
      return
    }

    submitClaim.mutate({
      admissionYear: admissionYear.trim(),
      ncheBatchRef: ncheBatchRef.trim(),
      claimProofNote: claimProofNote.trim() || undefined,
      ...destination,
    })
  }

  return (
    <div className="space-y-3 bg-surface border border-base rounded-xl p-4">
      <PlacementDestinationFields universities={catalogue} value={destination} onChange={setDestination} />

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-sm">
          <span className="block text-xs text-muted mb-1">Admission year</span>
          <input
            type="text"
            value={admissionYear}
            onChange={(e) => setAdmissionYear(e.target.value)}
            className="w-full border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs text-muted mb-1">Gazette page / reference</span>
          <input
            type="text"
            value={ncheBatchRef}
            onChange={(e) => setNcheBatchRef(e.target.value)}
            placeholder="e.g. NCHE Gazette Vol. 12, p.4"
            className="w-full border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none"
          />
        </label>
      </div>

      <label className="text-sm block">
        <span className="block text-xs text-muted mb-1">Additional evidence (optional)</span>
        <textarea
          value={claimProofNote}
          onChange={(e) => setClaimProofNote(e.target.value)}
          rows={2}
          className="w-full border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none resize-none"
        />
      </label>

      {formError && <p role="alert" className="text-sm text-brand-coral">{formError}</p>}
      {submitClaim.isError && (
        <p role="alert" className="text-sm text-brand-coral">{(submitClaim.error as Error).message}</p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitClaim.isPending}
        className="flex items-center gap-2 min-h-11 px-5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60"
      >
        {submitClaim.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        Submit claim
      </button>
    </div>
  )
}
