/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/placements/PlacementOutcomeForm.tsx
 * [R-PHASE]: R18 — University Placement Module (Phase 11 Blueprint)
 * [PURPOSE]: Records a placement outcome — a student self-reporting where they
 *   landed, or staff recording it on their behalf. The destination is EITHER a
 *   catalogue programme (chosen from the university/programme selects) OR a
 *   free-text pair (for a private/foreign institution not in the catalogue),
 *   matching the RecordOutcomeSchema's exclusive-or rule. NOT_PLACED needs no
 *   destination. Submission is gated behind a ConfirmDialog because an outcome
 *   clears any prior verification.
 * [DEPENDS ON]: @/hooks/usePlacements (catalogue + mutation), @/components/shared/ConfirmDialog,
 *   @shared/schemas/placement (RecordOutcomeInput), @shared/types/api
 */
'use client'

import { useState } from 'react'
import { usePlacementCatalogue } from '@/hooks/usePlacements'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import type { RecordOutcomeInput } from '@shared/schemas/placement'
import type { University } from '@shared/constants/universities'

type OutcomeStatus = RecordOutcomeInput['status']

const STATUS_OPTIONS: Array<{ value: OutcomeStatus; label: string }> = [
  { value: 'PLACED',     label: 'Placed (offer received)' },
  { value: 'CONFIRMED',  label: 'Confirmed (accepting the place)' },
  { value: 'DECLINED',   label: 'Declined (turning it down)' },
  { value: 'NOT_PLACED', label: 'Not placed' },
]

interface Props {
  /** Current values to prefill (editing an existing outcome). */
  initial?: Partial<RecordOutcomeInput>
  isSubmitting?: boolean
  onSubmit: (input: RecordOutcomeInput) => void
  onCancel?: () => void
}

export function PlacementOutcomeForm({ initial, isSubmitting, onSubmit, onCancel }: Props) {
  const { data: catalogue = [] } = usePlacementCatalogue()
  const universities = catalogue as University[]

  const [status, setStatus] = useState<OutcomeStatus>(initial?.status ?? 'PLACED')
  const [useFreeText, setUseFreeText] = useState<boolean>(
    Boolean(initial?.placedUniversityName || initial?.placedProgrammeName),
  )
  const [universityId, setUniversityId] = useState(initial?.placedUniversityId ?? '')
  const [programmeId, setProgrammeId] = useState(initial?.placedProgrammeId ?? '')
  const [universityName, setUniversityName] = useState(initial?.placedUniversityName ?? '')
  const [programmeName, setProgrammeName] = useState(initial?.placedProgrammeName ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const needsDestination = status !== 'NOT_PLACED'
  const selectedUni = universities.find((u) => u.id === universityId)

  function buildInput(): RecordOutcomeInput | null {
    if (!needsDestination) {
      return { status, notes: notes.trim() || undefined }
    }
    if (useFreeText) {
      if (!universityName.trim() || !programmeName.trim()) {
        setError('Enter both the university and programme names.')
        return null
      }
      return {
        status,
        placedUniversityName: universityName.trim(),
        placedProgrammeName: programmeName.trim(),
        notes: notes.trim() || undefined,
      }
    }
    if (!universityId || !programmeId) {
      setError('Choose both a university and a programme.')
      return null
    }
    return {
      status,
      placedUniversityId: universityId,
      placedProgrammeId: programmeId,
      notes: notes.trim() || undefined,
    }
  }

  function handleReview() {
    setError(null)
    const input = buildInput()
    if (input) setConfirmOpen(true)
  }

  function handleConfirm() {
    const input = buildInput()
    setConfirmOpen(false)
    if (input) onSubmit(input)
  }

  const fieldClass =
    'w-full rounded-lg border border-base bg-page px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/40'

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-semibold text-muted mb-1">Outcome</label>
        <select className={fieldClass} value={status} onChange={(e) => setStatus(e.target.value as OutcomeStatus)}>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {needsDestination && (
        <>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setUseFreeText(false)}
              className={`px-3 py-1 rounded-full border font-semibold transition-colors ${
                !useFreeText ? 'bg-brand-navy text-white border-brand-navy' : 'border-base text-muted'
              }`}
            >
              From catalogue
            </button>
            <button
              type="button"
              onClick={() => setUseFreeText(true)}
              className={`px-3 py-1 rounded-full border font-semibold transition-colors ${
                useFreeText ? 'bg-brand-navy text-white border-brand-navy' : 'border-base text-muted'
              }`}
            >
              Other institution
            </button>
          </div>

          {!useFreeText ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">University</label>
                <select
                  className={fieldClass}
                  value={universityId}
                  onChange={(e) => {
                    setUniversityId(e.target.value)
                    setProgrammeId('')
                  }}
                >
                  <option value="">Select…</option>
                  {universities.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Programme</label>
                <select
                  className={fieldClass}
                  value={programmeId}
                  onChange={(e) => setProgrammeId(e.target.value)}
                  disabled={!selectedUni}
                >
                  <option value="">Select…</option>
                  {selectedUni?.programs.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">University name</label>
                <input className={fieldClass} value={universityName} onChange={(e) => setUniversityName(e.target.value)} placeholder="e.g. Catholic University of Malawi" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">Programme name</label>
                <input className={fieldClass} value={programmeName} onChange={(e) => setProgrammeName(e.target.value)} placeholder="e.g. Bachelor of Laws" />
              </div>
            </div>
          )}
        </>
      )}

      <div>
        <label className="block text-xs font-semibold text-muted mb-1">Notes (optional)</label>
        <textarea className={`${fieldClass} min-h-[72px]`} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {error && <p className="text-xs text-rose-600" role="alert">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleReview}
          disabled={isSubmitting}
          className="px-4 py-2 rounded-lg bg-brand-navy text-white text-sm font-semibold disabled:opacity-60"
        >
          {isSubmitting ? 'Saving…' : 'Save outcome'}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg border border-base text-sm text-muted">
            Cancel
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Save this outcome?"
        description="Recording an outcome replaces any previously recorded one and clears its verification. A member of staff will need to verify it again."
        confirmLabel="Save outcome"
        onConfirm={handleConfirm}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}
