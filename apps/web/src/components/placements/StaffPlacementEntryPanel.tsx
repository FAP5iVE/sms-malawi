/**
 * [CHANGE TYPE]: MAJOR REWRITE (matching the reference module's exact flow)
 * [FILE]: apps/web/src/components/placements/StaffPlacementEntryPanel.tsx
 * [PURPOSE]: The "Staff Placement Entry" tab from the reference module —
 *   staff (admin, high_rank, lower_rank — anyone holding placement.manage or
 *   placement.recordOutcome) cross-reference the official NCHE selection
 *   gazette against the graduating cohort. Two-panel layout:
 *     1. Select Cohort Graduate — searchable list of certified-MSCE Form 4
 *        candidates, each showing sex, MANEB aggregate points, exam ID, their
 *        current placement status (if any), and their actual subject-grade
 *        pills — an "Unplaced only" toggle hides already-CONFIRMED candidates.
 *     2. Assign University, Faculty & Admitted Course — a clickable grid of
 *        the catalogue's public universities, a Faculty/School dropdown
 *        (grouped from that university's active programmes), an Admitted
 *        Degree dropdown, and a detail card showing the programme's real
 *        catalogue data (faculty tag, published requirement text, duration,
 *        cutoff, formatted prerequisites) — then Confirm.
 *   A "not in the catalogue" toggle switches the assignment side to free-text
 *   entry for a private/foreign/off-catalogue destination — the reference
 *   module doesn't need this (it only ever targets 6 public universities),
 *   but our catalogue also carries MCHS/DCE and this preserves the system's
 *   existing free-text fallback for anything else.
 * [DEPENDS ON]: @/hooks/usePlacements (useEligibleCohort,
 *   useRecordStaffPlacement, usePlacementCatalogue), PlacementStatusBadge,
 *   @/lib/placementCatalogueHelpers, @/components/shared/AcademicYearSelect
 */
'use client'

import { useMemo, useState } from 'react'
import { usePublicSchoolInfo } from '@/hooks/usePublic'
import { useEligibleCohort, useRecordStaffPlacement, usePlacementCatalogue } from '@/hooks/usePlacements'
import { AcademicYearSelect } from '@/components/shared/AcademicYearSelect'
import { PlacementStatusBadge } from '@/components/placements/PlacementStatusBadge'
import { groupProgramsByFaculty, formatPrerequisites } from '@/lib/placementCatalogueHelpers'
import type { ApiPlacementEligibleStudent } from '@shared/types/api'
import { Search, Building2, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react'

const FALLBACK_YEAR = '2025/2026'

function abbreviate(subject?: string | null): string {
  if (!subject) return ''
  return subject.split(' ')[0]?.slice(0, 4) ?? ''
}

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

  // ── Left panel: candidate search/filter ──────────────────────────────
  const [search, setSearch] = useState('')
  const [unplacedOnly, setUnplacedOnly] = useState(true)
  const [candidate, setCandidate] = useState<ApiPlacementEligibleStudent | null>(null)

  const visibleCandidates = useMemo(() => {
    const q = search.trim().toLowerCase()
    return cohort.filter((c) => {
      if (unplacedOnly && c.existingStatus === 'CONFIRMED') return false
      if (!q) return true
      return `${c.firstName} ${c.lastName} ${c.candidateNo} ${c.registrationNo}`.toLowerCase().includes(q)
    })
  }, [cohort, search, unplacedOnly])

  // ── Right panel: assignment form ──────────────────────────────────────
  const [freeText, setFreeText] = useState(false)
  const [universityId, setUniversityId] = useState('')
  const [faculty, setFaculty] = useState('')
  const [programmeId, setProgrammeId] = useState('')
  const [freeUniName, setFreeUniName] = useState('')
  const [freeProgName, setFreeProgName] = useState('')
  const [admissionYear, setAdmissionYear] = useState('')
  const [ncheBatchRef, setNcheBatchRef] = useState('NCHE Selection List')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const selectedUniversity = catalogue.find((u) => u.id === universityId)
  const facultyGroups = useMemo(() => groupProgramsByFaculty(selectedUniversity), [selectedUniversity])
  const facultyPrograms = facultyGroups.find((g) => g.faculty === faculty)?.programs ?? []
  const selectedProgramme = facultyPrograms.find((p) => p.id === programmeId)

  function selectCandidate(row: ApiPlacementEligibleStudent) {
    setCandidate(row)
    setFreeText(false)
    setUniversityId('')
    setFaculty('')
    setProgrammeId('')
    setFreeUniName('')
    setFreeProgName('')
    setAdmissionYear(nextIntakeYear(effectiveYear))
    setNcheBatchRef('NCHE Selection List')
    setNotes('')
    setFormError(null)
  }

  function handleSubmit() {
    if (!candidate) return
    setFormError(null)

    const isCatalogue = !freeText && Boolean(universityId && programmeId)
    const isFree = freeText && Boolean(freeUniName.trim() && freeProgName.trim())
    if (!isCatalogue && !isFree) {
      setFormError(freeText ? 'Enter both a university name and a programme name.' : 'Choose a university, faculty and programme.')
      return
    }
    if (!admissionYear.trim()) return setFormError('Enter the admission (intake) year.')
    if (!ncheBatchRef.trim()) return setFormError('Cite the NCHE selection list / gazette reference.')

    recordEntry.mutate(
      {
        manebRecordId: candidate.manebRecordId,
        admissionYear: admissionYear.trim(),
        ncheBatchRef: ncheBatchRef.trim(),
        notes: notes.trim() || undefined,
        ...(isCatalogue
          ? { placedUniversityId: universityId, placedProgrammeId: programmeId }
          : { placedUniversityName: freeUniName.trim(), placedProgrammeName: freeProgName.trim() }),
      },
      { onSuccess: () => setCandidate(null) },
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-surface border border-base rounded-xl p-4 flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-brand-teal/10 text-brand-teal flex items-center justify-center shrink-0">
          <Building2 className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="font-heading font-semibold text-base">Staff Official Placement Entry (NCHE Harmonized Gazette)</h3>
            <AcademicYearSelect
              value={effectiveYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="border border-base rounded-xl px-3 py-1.5 text-sm bg-page"
            />
          </div>
          <p className="text-xs text-muted mt-0.5">
            Cross-reference the published NCHE Selection List with our school cohort and register confirmed placements.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── PANEL 1: SELECT COHORT GRADUATE ─────────────────────────── */}
        <div className="bg-surface border border-base rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-heading font-semibold text-sm flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-brand-navy text-white text-xs font-bold flex items-center justify-center">1</span>
              Select Cohort Graduate
            </h4>
            <label className="flex items-center gap-1.5 text-xs text-muted cursor-pointer">
              <input type="checkbox" checked={unplacedOnly} onChange={(e) => setUnplacedOnly(e.target.checked)} className="accent-brand-teal" />
              Unplaced only
            </label>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search candidate name or MSCE #…"
              className="w-full border border-base rounded-xl pl-9 pr-3 py-2 text-sm bg-page focus:outline-none"
            />
          </div>

          {isLoading ? (
            <p className="text-sm text-muted py-6 text-center">Loading cohort…</p>
          ) : visibleCandidates.length === 0 ? (
            <p className="text-sm text-muted py-6 text-center">No candidates match.</p>
          ) : (
            <div className="max-h-130 overflow-y-auto space-y-2 -mx-1 px-1">
              {visibleCandidates.map((c) => {
                const selected = candidate?.studentId === c.studentId
                return (
                  <button
                    key={c.studentId}
                    type="button"
                    onClick={() => selectCandidate(c)}
                    className={`w-full text-left rounded-xl border p-3 transition-colors ${
                      selected ? 'border-brand-navy bg-brand-navy/5' : 'border-base bg-page hover:border-brand-navy/40'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm flex items-center gap-1.5">
                        {c.firstName} {c.lastName}
                        <span className={`text-[11px] font-bold ${c.sex === 'FEMALE' ? 'text-brand-coral' : 'text-brand-navy'}`}>
                          {c.sex === 'FEMALE' ? 'F' : 'M'}
                        </span>
                      </span>
                      <span className="text-xs font-semibold shrink-0">{c.aggregatePoints ?? '\u2014'} pts</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <p className="text-xs text-muted">{c.candidateNo} {'\u00b7'} ID: {c.registrationNo}</p>
                      {c.existingStatus && (
                        <span className="text-[11px] font-medium text-muted">
                          {c.existingStatus === 'PENDING_APPROVAL' ? 'Pending Approval' : c.existingStatus === 'CONFIRMED' ? 'Confirmed' : 'Rejected'}
                        </span>
                      )}
                      {!c.existingStatus && <span className="text-[11px] font-medium text-muted">Unplaced</span>}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {Object.entries(c.subjectGrades).slice(0, 6).map(([subject, grade]) => (
                        <span key={subject} className="inline-flex items-center rounded bg-surface border border-base px-1.5 py-0.5 text-[11px] text-muted">
                          {abbreviate(subject)}: {grade}
                        </span>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── PANEL 2: ASSIGN UNIVERSITY, FACULTY & COURSE ────────────── */}
        <div className="bg-surface border border-base rounded-xl p-4 space-y-4">
          <h4 className="font-heading font-semibold text-sm flex items-center gap-1.5">
            <span className="w-5 h-5 rounded-full bg-brand-navy text-white text-xs font-bold flex items-center justify-center">2</span>
            Assign University, Faculty & Admitted Course
          </h4>

          {!candidate ? (
            <div className="flex items-center gap-2 bg-brand-amber/10 border border-brand-amber/25 text-brand-amber text-sm rounded-xl px-3 py-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              Please pick a student from the cohort list on the left to proceed.
            </div>
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
                    <p className="text-xs font-medium text-muted mb-1.5">Public University (1 of {catalogue.length} in Malawi)</p>
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
                      <span className="block text-xs text-muted mb-1">Faculty / School at {selectedUniversity.shortName ?? selectedUniversity.name}</span>
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
                      <span className="block text-xs text-muted mb-1">Admitted Degree / Academic Program</span>
                      <select
                        value={programmeId}
                        onChange={(e) => setProgrammeId(e.target.value)}
                        className="w-full border border-base rounded-xl px-3 py-2 text-sm bg-page focus:outline-none"
                      >
                        <option value="">Choose a programme…</option>
                        {facultyPrograms.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}{p.durationYears ? ` \u2014 ${p.durationYears} yrs` : ''}{p.cutOffPoints ? ` (Cutoff: ~${p.cutOffPoints} pts)` : ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {selectedProgramme && (
                    <div className="bg-page border border-base rounded-xl p-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="font-medium text-sm">{selectedProgramme.name}</p>
                        {selectedProgramme.faculty && (
                          <span className="inline-flex items-center rounded bg-brand-navy/10 text-brand-navy text-[11px] font-semibold px-1.5 py-0.5">
                            {selectedProgramme.faculty}
                          </span>
                        )}
                      </div>
                      {selectedProgramme.minimumRequirements?.[0] && (
                        <p className="text-xs text-muted mt-1">{selectedProgramme.minimumRequirements[0]}</p>
                      )}
                      <p className="text-xs text-muted mt-1.5">
                        {selectedProgramme.durationYears ? `Duration: ${selectedProgramme.durationYears} Years \u00b7 ` : ''}
                        {selectedProgramme.cutOffPoints ? `Typical Cutoff: ${selectedProgramme.cutOffPoints} pts \u00b7 ` : ''}
                        Prerequisites: {formatPrerequisites(selectedProgramme)}
                      </p>
                    </div>
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
                  <span className="block text-xs text-muted mb-1">NCHE list / gazette reference</span>
                  <input
                    type="text" value={ncheBatchRef} onChange={(e) => setNcheBatchRef(e.target.value)}
                    className="w-full border border-base rounded-xl px-3 py-2 text-sm bg-page focus:outline-none"
                  />
                </label>
              </div>

              <label className="text-sm block">
                <span className="block text-xs text-muted mb-1">Internal notes (optional)</span>
                <textarea
                  value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  className="w-full border border-base rounded-xl px-3 py-2 text-sm bg-page focus:outline-none resize-none"
                />
              </label>

              {formError && <p role="alert" className="text-sm text-brand-coral">{formError}</p>}
              {recordEntry.isError && <p role="alert" className="text-sm text-brand-coral">{(recordEntry.error as Error).message}</p>}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={recordEntry.isPending}
                className="w-full flex items-center justify-center gap-2 min-h-11 px-5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60"
              >
                {recordEntry.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {candidate.existingStatus === 'CONFIRMED' ? 'Save Correction' : 'Confirm Official Placement'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
