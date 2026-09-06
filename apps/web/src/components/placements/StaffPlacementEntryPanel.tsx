/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/placements/StaffPlacementEntryPanel.tsx
 * [PURPOSE]: The "Staff Placement Entry" tab from the reference module —
 *   staff (admin, high_rank, lower_rank — anyone holding placement.manage
 *   or placement.recordOutcome) cross-reference the official NCHE selection
 *   gazette against the graduating cohort and record an immediately
 *   CONFIRMED placement for each candidate found on it. Picking a candidate
 *   who already has a placement (existingStatus) re-opens the same form
 *   pre-filled, so this doubles as the edit/correction flow — there is no
 *   separate "edit" entry point.
 * [DEPENDS ON]: @/hooks/usePlacements (useEligibleCohort,
 *   useRecordStaffPlacement, usePlacementCatalogue), PlacementDestinationFields,
 *   PlacementStatusBadge, @/components/shared/{AcademicYearSelect, DataTable,
 *   MotionBottomSheet}
 */
'use client'

import { useState } from 'react'
import { usePublicSchoolInfo } from '@/hooks/usePublic'
import { useEligibleCohort, useRecordStaffPlacement, usePlacementCatalogue } from '@/hooks/usePlacements'
import { AcademicYearSelect } from '@/components/shared/AcademicYearSelect'
import { DataTable, type DataColumn, type MobileAction } from '@/components/shared/DataTable'
import { MotionBottomSheet } from '@/components/shared/MotionBottomSheet'
import { PlacementDestinationFields, type DestinationValue } from '@/components/placements/PlacementDestinationFields'
import { PlacementStatusBadge } from '@/components/placements/PlacementStatusBadge'
import type { ApiPlacementEligibleStudent } from '@shared/types/api'
import { ClipboardEdit, Loader2 } from 'lucide-react'

const FALLBACK_YEAR = '2025/2026'

function nextIntakeYear(academicYear: string): string {
  const match = academicYear.match(/(\d{4})/)
  return match ? String(Number(match[1]) + 1) : academicYear
}

export function StaffPlacementEntryPanel() {
  const { data: schoolInfo } = usePublicSchoolInfo()
  const { data: catalogue = [] } = usePlacementCatalogue()
  const [academicYear, setAcademicYear] = useState<string>('')
  const effectiveYear = academicYear || schoolInfo?.currentYear || FALLBACK_YEAR

  const { data: cohort = [], isLoading } = useEligibleCohort(effectiveYear)
  const recordEntry = useRecordStaffPlacement(effectiveYear)

  const [candidate, setCandidate] = useState<ApiPlacementEligibleStudent | null>(null)
  const [destination, setDestination] = useState<DestinationValue>({ placedUniversityId: '', placedProgrammeId: '' })
  const [admissionYear, setAdmissionYear] = useState('')
  const [ncheBatchRef, setNcheBatchRef] = useState('NCHE Selection List')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  function openFor(row: ApiPlacementEligibleStudent) {
    setCandidate(row)
    setDestination({ placedUniversityId: '', placedProgrammeId: '' })
    setAdmissionYear(nextIntakeYear(effectiveYear))
    setNcheBatchRef('NCHE Selection List')
    setNotes('')
    setFormError(null)
  }

  function handleSubmit() {
    if (!candidate) return
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
    if (!ncheBatchRef.trim()) {
      setFormError('Cite the NCHE selection list / gazette reference.')
      return
    }

    recordEntry.mutate(
      {
        manebRecordId: candidate.manebRecordId,
        admissionYear: admissionYear.trim(),
        ncheBatchRef: ncheBatchRef.trim(),
        notes: notes.trim() || undefined,
        ...destination,
      },
      { onSuccess: () => setCandidate(null) },
    )
  }

  const columns: DataColumn<ApiPlacementEligibleStudent>[] = [
    { key: 'lastName', label: 'Student', priority: 'critical', render: (row) => `${row.firstName} ${row.lastName}` },
    { key: 'registrationNo', label: 'Reg. No.', priority: 'important' },
    { key: 'sex', label: 'Sex', priority: 'optional', render: (row) => (row.sex === 'FEMALE' ? 'F' : row.sex === 'MALE' ? 'M' : '—') },
    {
      key: 'existingStatus', label: 'Status', priority: 'critical',
      render: (row) => (row.existingStatus ? <PlacementStatusBadge status={row.existingStatus} /> : <span className="text-xs text-muted">Not yet placed</span>),
    },
  ]

  const mobileActions: MobileAction<ApiPlacementEligibleStudent>[] = [
    { label: 'Record placement', icon: ClipboardEdit, onClick: openFor },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-heading font-semibold text-base">Graduating cohort</h3>
          <p className="text-xs text-muted mt-0.5">
            {cohort.length} certified-MSCE Form 4 candidates for {effectiveYear}. Tap a candidate to record their
            official placement from the NCHE selection list.
          </p>
        </div>
        <AcademicYearSelect
          value={effectiveYear}
          onChange={(e) => setAcademicYear(e.target.value)}
          className="border border-base rounded-xl px-3 py-2 text-sm bg-surface"
        />
      </div>

      <DataTable
        data={cohort}
        isLoading={isLoading}
        columns={columns}
        rowKey="studentId"
        mobileActions={mobileActions}
        onRowClick={openFor}
        emptyMessage={`No certified-MSCE candidates found for ${effectiveYear}.`}
      />

      <MotionBottomSheet
        open={candidate !== null}
        onClose={() => setCandidate(null)}
        title={candidate ? `${candidate.firstName} ${candidate.lastName}` : ''}
      >
        {candidate && (
          <div className="space-y-4 pb-4">
            {candidate.existingStatus && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">Current status:</span>
                <PlacementStatusBadge status={candidate.existingStatus} />
              </div>
            )}

            <PlacementDestinationFields universities={catalogue} value={destination} onChange={setDestination} />

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm">
                <span className="block text-xs text-muted mb-1">Admission year</span>
                <input
                  type="text"
                  value={admissionYear}
                  onChange={(e) => setAdmissionYear(e.target.value)}
                  placeholder="2027"
                  className="w-full border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none"
                />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-muted mb-1">NCHE list / gazette reference</span>
                <input
                  type="text"
                  value={ncheBatchRef}
                  onChange={(e) => setNcheBatchRef(e.target.value)}
                  className="w-full border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none"
                />
              </label>
            </div>

            <label className="text-sm block">
              <span className="block text-xs text-muted mb-1">Internal notes (optional)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none resize-none"
              />
            </label>

            {formError && <p role="alert" className="text-sm text-brand-coral">{formError}</p>}

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={recordEntry.isPending}
                className="flex items-center gap-2 min-h-11 px-5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60"
              >
                {recordEntry.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {candidate.existingStatus === 'CONFIRMED' ? 'Save correction' : 'Confirm placement'}
              </button>
              <button
                type="button"
                onClick={() => setCandidate(null)}
                className="min-h-11 px-4 rounded-xl text-sm font-semibold border border-base"
              >
                Cancel
              </button>
            </div>

            {recordEntry.isError && (
              <p role="alert" className="text-sm text-brand-coral">{(recordEntry.error as Error).message}</p>
            )}
          </div>
        )}
      </MotionBottomSheet>
    </div>
  )
}
