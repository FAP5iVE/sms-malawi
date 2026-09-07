/**
 * [CHANGE TYPE]: MAJOR REWRITE (matching the reference module's exact flow)
 * [FILE]: apps/web/src/components/placements/StudentClaimPanel.tsx
 * [PURPOSE]: The "Student Claim Portal" tab from the reference module — a
 *   GRADUATED student reports that they were selected by NCHE, citing where
 *   their name appears on the published gazette. Two-panel layout mirrors
 *   the reference: a submission form (University → Faculty → Programme
 *   picker, gazette citation, evidence note) on the left, and a "Student
 *   Claims Tracker" card on the right showing the outcome — status pill,
 *   claimed destination, the gazette citation quoted back, and (once acted
 *   on) who verified/rejected it and when, resolved to a real staff name.
 *
 *   DELIBERATE DEVIATION FROM THE REFERENCE MOCK: the reference lets you
 *   pick "who you are" from a name dropdown, because it has no real
 *   authentication — it's a single-session demo. Here the signed-in
 *   student IS resolved server-side from their Firebase session
 *   (GET /placements/me), so there is no name/MSCE-number selector; a
 *   student can only ever submit a claim for themselves. The tracker
 *   likewise only ever shows this one student's own claim (never another
 *   student's), for the same reason.
 * [DEPENDS ON]: @/hooks/usePlacements (useMyPlacement, useSubmitPlacementClaim,
 *   usePlacementCatalogue), PlacementStatusBadge, @/lib/placementCatalogueHelpers
 */
'use client'

import { useMemo, useState } from 'react'
import { useMyPlacement, useSubmitPlacementClaim, usePlacementCatalogue } from '@/hooks/usePlacements'
import { PlacementStatusBadge } from '@/components/placements/PlacementStatusBadge'
import { groupProgramsByFaculty, formatPrerequisites } from '@/lib/placementCatalogueHelpers'
import { FileText, Clock, Loader2, Send, AlertTriangle, CheckCircle2 } from 'lucide-react'

function nextIntakeYear(): string {
  return String(new Date().getFullYear() + 1)
}

export function StudentClaimPanel() {
  const { data, isLoading } = useMyPlacement()
  const { data: catalogue = [] } = usePlacementCatalogue()
  const submitClaim = useSubmitPlacementClaim()

  const [freeText, setFreeText] = useState(false)
  const [universityId, setUniversityId] = useState('')
  const [faculty, setFaculty] = useState('')
  const [programmeId, setProgrammeId] = useState('')
  const [freeUniName, setFreeUniName] = useState('')
  const [freeProgName, setFreeProgName] = useState('')
  const [admissionYear, setAdmissionYear] = useState(nextIntakeYear())
  const [ncheBatchRef, setNcheBatchRef] = useState('')
  const [claimProofNote, setClaimProofNote] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const selectedUniversity = catalogue.find((u) => u.id === universityId)
  const facultyGroups = useMemo(() => groupProgramsByFaculty(selectedUniversity), [selectedUniversity])
  const facultyPrograms = facultyGroups.find((g) => g.faculty === faculty)?.programs ?? []
  const selectedProgramme = facultyPrograms.find((p) => p.id === programmeId)

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

  if (!data.hasCertifiedMsce && !data.record) {
    return (
      <div className="text-center py-10 px-4">
        <AlertTriangle className="w-8 h-8 mx-auto text-brand-amber mb-2" />
        <p className="text-sm text-muted">
          No certified MSCE record was found for your account yet. Once your results are certified, you will be able
          to submit a placement claim here.
        </p>
      </div>
    )
  }

  const record = data.record
  const canSubmitNew = !record || record.status === 'REJECTED'

  function handleSubmit() {
    setFormError(null)
    const isCatalogue = !freeText && Boolean(universityId && programmeId)
    const isFree = freeText && Boolean(freeUniName.trim() && freeProgName.trim())
    if (!isCatalogue && !isFree) {
      setFormError(freeText ? 'Enter both a university name and a programme name.' : 'Choose a university, faculty and programme.')
      return
    }
    if (!admissionYear.trim()) return setFormError('Enter the admission (intake) year.')
    if (!ncheBatchRef.trim()) return setFormError('Cite where your name appears on the published gazette.')

    submitClaim.mutate({
      admissionYear: admissionYear.trim(),
      ncheBatchRef: ncheBatchRef.trim(),
      claimProofNote: claimProofNote.trim() || undefined,
      ...(isCatalogue
        ? { placedUniversityId: universityId, placedProgrammeId: programmeId }
        : { placedUniversityName: freeUniName.trim(), placedProgrammeName: freeProgName.trim() }),
    })
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* ── SUBMISSION FORM ──────────────────────────────────────────── */}
      <div className="bg-surface border border-base rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-brand-navy" />
          <h3 className="font-heading font-semibold text-sm">Placement Claim Submission Form</h3>
        </div>

        {!canSubmitNew ? (
          <p className="text-sm text-muted">
            {record!.status === 'PENDING_APPROVAL'
              ? 'You already have a claim awaiting verification — see the tracker for details.'
              : 'You already have a confirmed placement on file — see the tracker for details.'}
          </p>
        ) : (
          <>
            <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
              <input type="checkbox" checked={freeText} onChange={(e) => setFreeText(e.target.checked)} className="accent-brand-teal" />
              Not in the catalogue (private / foreign university)
            </label>

            {freeText ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  type="text" value={freeUniName} onChange={(e) => setFreeUniName(e.target.value)}
                  placeholder="University name"
                  className="border border-base rounded-xl px-3 py-2 text-sm bg-page focus:outline-none"
                />
                <input
                  type="text" value={freeProgName} onChange={(e) => setFreeProgName(e.target.value)}
                  placeholder="Programme name"
                  className="border border-base rounded-xl px-3 py-2 text-sm bg-page focus:outline-none"
                />
              </div>
            ) : (
              <>
                <div>
                  <p className="text-xs font-medium text-muted mb-1.5">Public University Where Selected</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {catalogue.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => { setUniversityId(u.id); setFaculty(''); setProgrammeId('') }}
                        className={`text-left rounded-xl border p-2.5 transition-colors ${
                          universityId === u.id ? 'border-brand-navy bg-brand-navy text-white' : 'border-base bg-page hover:border-brand-navy/40'
                        }`}
                      >
                        <p className="text-xs font-bold">{u.shortName ?? u.id.toUpperCase()}</p>
                        <p className={`text-[11px] leading-snug ${universityId === u.id ? 'text-white/80' : 'text-muted'}`}>{u.name}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {selectedUniversity && (
                  <label className="text-sm block">
                    <span className="block text-xs text-muted mb-1">Faculty / School</span>
                    <select
                      value={faculty}
                      onChange={(e) => { setFaculty(e.target.value); setProgrammeId('') }}
                      className="w-full border border-base rounded-xl px-3 py-2 text-sm bg-page focus:outline-none"
                    >
                      <option value="">Choose a faculty…</option>
                      {facultyGroups.map((g) => (
                        <option key={g.faculty} value={g.faculty}>{g.faculty} ({g.programs.length} programs)</option>
                      ))}
                    </select>
                  </label>
                )}

                {faculty && (
                  <label className="text-sm block">
                    <span className="block text-xs text-muted mb-1">Claimed Program / Course</span>
                    <select
                      value={programmeId}
                      onChange={(e) => setProgrammeId(e.target.value)}
                      className="w-full border border-base rounded-xl px-3 py-2 text-sm bg-page focus:outline-none"
                    >
                      <option value="">Choose a programme…</option>
                      {facultyPrograms.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </label>
                )}

                {selectedProgramme && (
                  <p className="text-xs text-muted bg-page border border-base rounded-xl p-2.5">
                    {selectedProgramme.durationYears ? `Duration: ${selectedProgramme.durationYears} Years \u00b7 ` : ''}
                    Prerequisites: {formatPrerequisites(selectedProgramme)}
                  </p>
                )}
              </>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-sm">
                <span className="block text-xs text-muted mb-1">Admission year</span>
                <input
                  type="text" value={admissionYear} onChange={(e) => setAdmissionYear(e.target.value)}
                  className="w-full border border-base rounded-xl px-3 py-2 text-sm bg-page focus:outline-none"
                />
              </label>
              <label className="text-sm">
                <span className="block text-xs text-muted mb-1">Where did you see your selection on the NCHE list?</span>
                <input
                  type="text" value={ncheBatchRef} onChange={(e) => setNcheBatchRef(e.target.value)}
                  placeholder="e.g. NCHE 2026 Gazette, Page 44"
                  className="w-full border border-base rounded-xl px-3 py-2 text-sm bg-page focus:outline-none"
                />
              </label>
            </div>

            <label className="text-sm block">
              <span className="block text-xs text-muted mb-1">Additional Verification Note / Physical Evidence</span>
              <textarea
                value={claimProofNote} onChange={(e) => setClaimProofNote(e.target.value)} rows={3}
                placeholder="e.g. Verified with printed list pinned at DEO office, or received official SMS from NCHE."
                className="w-full border border-base rounded-xl px-3 py-2 text-sm bg-page focus:outline-none resize-none"
              />
            </label>

            {formError && <p role="alert" className="text-sm text-brand-coral">{formError}</p>}
            {submitClaim.isError && <p role="alert" className="text-sm text-brand-coral">{(submitClaim.error as Error).message}</p>}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitClaim.isPending}
              className="flex items-center gap-2 min-h-11 px-5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60"
            >
              {submitClaim.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Submit Claim
            </button>
          </>
        )}
      </div>

      {/* ── CLAIMS TRACKER ───────────────────────────────────────────── */}
      <div className="bg-surface border border-base rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-navy" />
            <h3 className="font-heading font-semibold text-sm">Student Claims Tracker ({record ? 1 : 0})</h3>
          </div>
          <span className="text-xs text-muted">Live Status</span>
        </div>

        {!record ? (
          <p className="text-sm text-muted py-6 text-center">You have not submitted a placement claim yet.</p>
        ) : (
          <div className="border border-base rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <PlacementStatusBadge status={record.status} />
              {record.status === 'CONFIRMED' && <CheckCircle2 className="w-4 h-4 text-brand-teal" />}
            </div>
            <div>
              <p className="font-medium text-sm">{record.placedProgrammeName ?? record.placedProgrammeId}</p>
              <p className="text-xs text-muted">{record.placedUniversityName ?? record.placedUniversityId}</p>
            </div>
            {record.ncheBatchRef && (
              <p className="text-xs text-muted"><span className="font-medium text-body">Gazette Ref:</span> {record.ncheBatchRef}</p>
            )}
            {record.claimProofNote && (
              <p className="text-xs text-muted italic bg-page border border-base rounded-lg p-2">{record.claimProofNote}</p>
            )}
            {record.status === 'REJECTED' && record.rejectionReason && (
              <p className="text-xs text-brand-coral"><span className="font-medium">Reason:</span> {record.rejectionReason}</p>
            )}
            {record.verifiedByName && record.verifiedAt && (
              <p className="text-[11px] text-muted">
                {record.status === 'REJECTED' ? 'Reviewed' : 'Verified'} by {record.verifiedByName} on{' '}
                {new Date(record.verifiedAt).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {record?.status === 'REJECTED' && (
          <p className="text-xs text-muted">Your claim was rejected. Submit a corrected claim on the left if you believe this was in error.</p>
        )}
      </div>
    </div>
  )
}
