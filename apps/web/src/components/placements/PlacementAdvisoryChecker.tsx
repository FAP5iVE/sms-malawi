/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/placements/PlacementAdvisoryChecker.tsx
 * [PURPOSE]: Self-service, PRE-PLACEMENT qualification calculator for a Form 4
 *   student. The student types their own MSCE subject grades — before results
 *   this is an advisory "what if" entry (their expected grades); once MSCE
 *   results exist and a placement record has been generated, the same tool
 *   still works exactly the same way, taking whatever the student types. It
 *   NEVER reads internal exam marks or the student's ManebRecord — the
 *   calculation is purely over the numbers entered here, which is what makes
 *   this "ignore internal exams, use MSCE" by construction rather than a rule
 *   that has to be remembered elsewhere.
 *
 *   Subjects are constrained to the canonical MALAWI_SUBJECTS list (a select,
 *   not free text) and grades to the MSCE 1–9 scale — matching what MANEB
 *   entry already enforces elsewhere in the system. The student may optionally
 *   pick 3+ specific catalogue programmes to get a direct qualify/not-yet
 *   verdict on each; either way, submitting always also returns the top 10
 *   best-matching programmes across the whole catalogue.
 *
 *   This component is deliberately dumb about placement STATE — the parent
 *   page (my-placement) decides whether to render it at all (it's a
 *   pre-placement tool; the server also enforces the same lock).
 * [DEPENDS ON]: @/hooks/usePlacements (useAdvisoryCheck, usePlacementCatalogue),
 *   @shared/constants/malawi (MALAWI_SUBJECTS), @/components/placements/
 *   PlacementRecommendationCard
 */
'use client'

import { useState } from 'react'
import { useAdvisoryCheck, usePlacementCatalogue } from '@/hooks/usePlacements'
import { PlacementRecommendationCard } from '@/components/placements/PlacementRecommendationCard'
import { MALAWI_SUBJECTS } from '@shared/constants/malawi'
import type { University } from '@shared/constants/universities'
import { Plus, Trash2, Calculator, Loader2, Sparkles } from 'lucide-react'

interface GradeRow {
  subject: string
  grade: string // kept as string while editing; validated to 1-9 on submit
}

interface ChosenRow {
  universityId: string
  programmeId: string
}

function emptyGradeRow(): GradeRow {
  return { subject: '', grade: '' }
}

function emptyChosenRow(): ChosenRow {
  return { universityId: '', programmeId: '' }
}

export function PlacementAdvisoryChecker() {
  const { data: catalogue = [] } = usePlacementCatalogue()
  const universities = catalogue as University[]
  const advisory = useAdvisoryCheck()

  const [grades, setGrades] = useState<GradeRow[]>([emptyGradeRow(), emptyGradeRow(), emptyGradeRow()])
  const [wantsProgrammeCheck, setWantsProgrammeCheck] = useState(false)
  const [chosen, setChosen] = useState<ChosenRow[]>([emptyChosenRow(), emptyChosenRow(), emptyChosenRow()])
  const [formError, setFormError] = useState<string | null>(null)

  const usedSubjects = new Set(grades.map((g) => g.subject).filter(Boolean))

  function updateGrade(i: number, patch: Partial<GradeRow>) {
    setGrades((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function addGradeRow() {
    if (grades.length >= MALAWI_SUBJECTS.length) return
    setGrades((rows) => [...rows, emptyGradeRow()])
  }
  function removeGradeRow(i: number) {
    setGrades((rows) => rows.filter((_, idx) => idx !== i))
  }

  function updateChosen(i: number, patch: Partial<ChosenRow>) {
    setChosen((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  function addChosenRow() {
    if (chosen.length >= 20) return
    setChosen((rows) => [...rows, emptyChosenRow()])
  }
  function removeChosenRow(i: number) {
    setChosen((rows) => rows.filter((_, idx) => idx !== i))
  }

  function handleSubmit() {
    setFormError(null)
    const cleanGrades = grades
      .filter((g) => g.subject && g.grade !== '')
      .map((g) => ({ subject: g.subject, grade: Number(g.grade) }))

    if (cleanGrades.length === 0) {
      setFormError('Enter at least one subject and grade.')
      return
    }
    if (cleanGrades.some((g) => !Number.isInteger(g.grade) || g.grade < 1 || g.grade > 9)) {
      setFormError('Grades must be whole numbers from 1 (best) to 9 (fail).')
      return
    }

    const cleanChosen = wantsProgrammeCheck
      ? chosen.filter((c) => c.universityId && c.programmeId)
      : []
    if (wantsProgrammeCheck && cleanChosen.length < 3) {
      setFormError('Choose at least three programmes to check, or turn off "Check specific programmes".')
      return
    }

    advisory.mutate({
      grades: cleanGrades,
      programmes: cleanChosen.length > 0 ? cleanChosen : undefined,
    })
  }

  const result = advisory.data

  return (
    <div className="space-y-5">
      <div className="bg-brand-navy/5 border border-brand-navy/15 rounded-xl px-4 py-3 text-sm text-body flex items-start gap-2">
        <Calculator className="w-4 h-4 mt-0.5 shrink-0 text-brand-navy" />
        <span>
          Type your subject grades — your <strong>expected</strong> grades now, or your real <strong>MSCE</strong> grades
          once you have them. This is advisory only: it never looks at your internal school exam marks, only the
          numbers you enter here.
        </span>
      </div>

      {/* Grades entry */}
      <section>
        <h3 className="font-heading font-semibold text-sm mb-3">Your subject grades</h3>
        <div className="space-y-2">
          {grades.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={row.subject}
                onChange={(e) => updateGrade(i, { subject: e.target.value })}
                aria-label={`Subject ${i + 1}`}
                className="flex-1 border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none"
              >
                <option value="">Select subject…</option>
                {MALAWI_SUBJECTS.filter((subj) => subj === row.subject || !usedSubjects.has(subj)).map((subj) => (
                  <option key={subj} value={subj}>{subj}</option>
                ))}
              </select>
              <select
                value={row.grade}
                onChange={(e) => updateGrade(i, { grade: e.target.value })}
                aria-label={`Grade for ${row.subject || 'subject'} ${i + 1}`}
                className="w-24 border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none"
              >
                <option value="">Grade</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removeGradeRow(i)}
                disabled={grades.length <= 1}
                aria-label="Remove subject"
                className="p-2 text-muted hover:text-brand-coral disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addGradeRow}
          disabled={grades.length >= MALAWI_SUBJECTS.length}
          className="mt-2 flex items-center gap-1.5 text-sm text-brand-teal font-semibold hover:underline disabled:opacity-40"
        >
          <Plus className="w-4 h-4" /> Add subject
        </button>
      </section>

      {/* Optional: check specific programmes */}
      <section>
        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={wantsProgrammeCheck}
            onChange={(e) => setWantsProgrammeCheck(e.target.checked)}
            className="rounded border-base"
          />
          Check specific programmes (choose at least 3)
        </label>

        {wantsProgrammeCheck && (
          <div className="mt-3 space-y-2">
            {chosen.map((row, i) => {
              const uni = universities.find((u) => u.id === row.universityId)
              return (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={row.universityId}
                    onChange={(e) => updateChosen(i, { universityId: e.target.value, programmeId: '' })}
                    aria-label={`University choice ${i + 1}`}
                    className="flex-1 border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none"
                  >
                    <option value="">University…</option>
                    {universities.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                  <select
                    value={row.programmeId}
                    onChange={(e) => updateChosen(i, { programmeId: e.target.value })}
                    disabled={!uni}
                    aria-label={`Programme choice ${i + 1}`}
                    className="flex-1 border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none disabled:opacity-50"
                  >
                    <option value="">Programme…</option>
                    {uni?.programs.filter((p) => p.isActive !== false).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => removeChosenRow(i)}
                    disabled={chosen.length <= 3}
                    aria-label="Remove programme"
                    className="p-2 text-muted hover:text-brand-coral disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )
            })}
            <button
              type="button"
              onClick={addChosenRow}
              disabled={chosen.length >= 20}
              className="flex items-center gap-1.5 text-sm text-brand-teal font-semibold hover:underline disabled:opacity-40"
            >
              <Plus className="w-4 h-4" /> Add programme
            </button>
          </div>
        )}
      </section>

      {formError && (
        <p role="alert" className="text-sm text-brand-coral">{formError}</p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={advisory.isPending}
        className="flex items-center gap-2 min-h-11 px-6 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60"
      >
        {advisory.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        Check what I qualify for
      </button>

      {advisory.isError && (
        <p role="alert" className="text-sm text-brand-coral">
          {(advisory.error as Error).message}
        </p>
      )}

      {result && (
        <div className="space-y-6 pt-2">
          {result.chosen && result.chosen.length > 0 && (
            <section>
              <h3 className="font-heading font-semibold text-sm mb-3">Your chosen programmes</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {[...result.chosen].sort((a, b) => a.rank - b.rank).map((r) => (
                  <PlacementRecommendationCard key={`${r.universityId}-${r.programmeId}`} recommendation={r} />
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="font-heading font-semibold text-sm mb-3">Top 10 programmes for your grades</h3>
            {result.top.length === 0 ? (
              <p className="text-sm text-muted">No matching programmes found for the grades entered.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {result.top.map((r) => (
                  <PlacementRecommendationCard key={`${r.universityId}-${r.programmeId}`} recommendation={r} />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}