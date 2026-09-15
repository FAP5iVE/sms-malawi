'use client'

/**
 * apps/web/src/components/exams/StudentResultsView.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE
 * [PURPOSE]:
 *   1. [MSCE CORRECTION] Forms 3-4 are assessed on the MSCE 1-9 scale, whose
 *      overall result is an AGGREGATE OF POINTS (the sum of the six best
 *      subjects, 6-54, lower is better) — not an overall grade. This view
 *      previously rendered `result.grade` under a hardcoded "Grade" label for
 *      every form, so an MSCE-track student saw "Grade 7", which was the
 *      averaged percentage re-graded on the 1-9 scale. Neither the number nor
 *      the label was an MSCE result. The headline card now reads "Points" and
 *      shows the real aggregate for Forms 3-4, and keeps "Grade" for Forms
 *      1-2 (JCE), branching on the server-supplied gradingTrack/classForm
 *      rather than guessing from the class name.
 *   2. The student's own Average rendered as an em dash while the class
 *      average rendered fine — `average` is a Prisma Decimal that serialises
 *      to a STRING over JSON, so the typeof-number check in pct() always
 *      failed. pct() now coerces numeric strings (the server also coerces at
 *      source; this is the belt-and-braces half).
 *   3. The pass banner said "Passed Term N" purely from passStatus, with no
 *      indication of what the result actually was. It now states the
 *      aggregate/grade and the subjects-passed count so the verdict is
 *      auditable on its face.
 *   4. [SR-3] Students can now VIEW and PRINT their own report card in the
 *      browser, using the same PrintableReportCard modal staff get from the
 *      student profile screen. The old "Download Report Card" button hit the
 *      server-side PDF generate + blob upload path, which was failing for
 *      students; the in-browser path reads the same structured data the staff
 *      preview uses and needs no storage round-trip.
 *   5. Colour-block status highlights replaced with font colour only — the
 *      brand tokens are theme-aware, so they read correctly in light AND
 *      dark mode, which `bg-green-100 text-green-700` did not.
 * [DEPENDS ON]: @/hooks/useExams (useStudentResults, useReportCardData),
 *   @/hooks/useSettings (useCurrentAcademicPeriod),
 *   @/components/shared/PrintableReportCard
 */

import { useState } from 'react'
import { useStudentResults, useReportCardData } from '@/hooks/useExams'
import { useCurrentAcademicPeriod } from '@/hooks/useSettings'
import { PrintableReportCard } from '@/components/shared/PrintableReportCard'
import { AlertTriangle, FileText, TrendingUp, Loader2 } from 'lucide-react'
import type { ApiTermResult } from '@shared/types/api'

interface Props { studentId: string }

/** Renders a percentage value, or an em dash if it isn't a real number.
 *  Coerces numeric STRINGS as well as numbers: Prisma Decimal columns
 *  (average, totalMark) arrive over JSON as strings, and the previous
 *  typeof-number-only check silently turned every one of them into an em
 *  dash — the confirmed cause of the blank Average card. */
function pct(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? `${n.toFixed(1)}%` : '—'
}

export function StudentResultsView({ studentId }: Props) {
  const { academicYear, isLoading: periodLoading } = useCurrentAcademicPeriod()
  const [term, setTerm] = useState(1)
  const [showReportCard, setShowReportCard] = useState(false)
  const { data: result, isLoading, error } = useStudentResults(studentId, academicYear ?? '', term)

  const {
    data:      reportCardData,
    isLoading: reportCardLoading,
    error:     reportCardError,
  } = useReportCardData(showReportCard ? studentId : '', academicYear ?? '', term)

  if (isLoading || periodLoading) return <div className="animate-pulse h-40 rounded-xl bg-surface" />

  // Fee gate error — shown when API returns 403
  if (error) {
    const msg = (error as Error).message
    const isFeeGate = msg.includes('fee') || msg.includes('Outstanding')
    return (
      <div className="rounded-xl p-5 border border-base bg-surface flex items-start gap-3">
        <AlertTriangle className={`w-5 h-5 mt-0.5 shrink-0 ${isFeeGate ? 'text-brand-coral' : 'text-muted'}`} />
        <div>
          <p className={`font-semibold ${isFeeGate ? 'text-brand-coral' : 'text-body'}`}>
            {isFeeGate ? 'Results Unavailable — Outstanding Fee Balance' : 'Results Not Yet Released'}
          </p>
          <p className="text-sm text-muted mt-1">
            {isFeeGate
              ? 'Your exam results are blocked until all outstanding fees for this term are paid in full. Please visit the Finance office.'
              : 'Results have not been released yet. Please check back later.'}
          </p>
        </div>
      </div>
    )
  }

  if (!result) return <div className="text-center py-12 text-muted text-sm">No results for this term.</div>

  const r = result as ApiTermResult
  const subjects = r.subjectResults

  // [MSCE CORRECTION] Which of the two grading systems this student sits
  // under. gradingTrack is written at compute time; classForm is the
  // fallback for rows computed before that column existed. Forms 3-4 are
  // MSCE (aggregate of points), Forms 1-2 are JCE (overall grade).
  const isMsce = r.gradingTrack === 'MSCE' || (r.gradingTrack == null && (r.classForm ?? 0) >= 3)

  const aggregateSubjects = r.aggregateSubjects ?? []
  const subjectEntries    = Object.entries(subjects)
  const passedCount       = subjectEntries.filter(([, d]) => d?.pass).length

  // The headline card: "Points" for MSCE, "Grade" for JCE. Never "Grade"
  // with an averaged number behind it.
  const headline = isMsce
    ? {
        label: 'Points',
        value: r.aggregatePoints != null ? String(r.aggregatePoints) : '—',
        hint:  r.aggregatePoints != null
          ? 'Aggregate of your six best subjects'
          : 'Needs six graded subjects',
      }
    : {
        label: 'Grade',
        value: r.grade || '—',
        hint:  'Overall grade for the term',
      }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-2">
          {[1,2,3].map((t) => (
            <button key={t} onClick={() => setTerm(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                term === t ? 'bg-brand-navy text-white border-brand-navy' : 'border-base text-muted'
              }`}>
              Term {t}
            </button>
          ))}
        </div>
        {/* SR-3: opens the same in-browser PrintableReportCard staff use,
            which has its own Print button. Replaces the server-PDF download
            that was erroring for students. */}
        <button
          onClick={() => setShowReportCard(true)}
          className="flex items-center gap-1.5 text-sm border border-base px-3 py-1.5 rounded-xl hover:bg-page transition-colors"
        >
          <FileText className="w-4 h-4" />
          View / Print Report Card
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Average',       value: pct(r.average),                         hint: 'Mean of your subject scores' },
          { label: headline.label,  value: headline.value,                          hint: headline.hint },
          { label: 'Position',      value: r.position ? `#${r.position}` : '—',     hint: 'Rank in your class' },
        ].map(({ label, value, hint }) => (
          <div key={label} className="bg-surface border border-base rounded-xl p-4 text-center">
            <p className="text-xl font-bold text-brand-navy">{value}</p>
            <p className="text-xs text-muted mt-1">{label}</p>
            <p className="text-[10px] text-muted mt-0.5 leading-tight">{hint}</p>
          </div>
        ))}
      </div>

      {/* [MSCE CORRECTION] Show WHICH subjects made the aggregate, so the
          number is checkable rather than opaque. */}
      {isMsce && aggregateSubjects.length > 0 && (
        <div className="bg-page border border-base rounded-xl px-4 py-3 text-xs text-muted">
          <span className="font-semibold text-body">Counted in your aggregate: </span>
          {aggregateSubjects.join(', ')}
          <span className="block mt-1 text-[11px] italic">
            MSCE adds the points of your six best subjects. A lower total is better — 6 is the best possible.
          </span>
        </div>
      )}

      {/* SR-2: class benchmark — own vs class, no other students named */}
      {(r.classAverage != null || r.classSize != null) && (
        <div className="flex items-center gap-4 flex-wrap text-xs text-muted bg-page border border-base rounded-xl px-4 py-3">
          {r.classAverage != null && (
            <span>Class average: <strong className="text-body">{pct(r.classAverage)}</strong></span>
          )}
          {isMsce && r.classAveragePoints != null && (
            <span>Class average points: <strong className="text-body">{r.classAveragePoints}</strong></span>
          )}
          {r.position != null && r.classSize != null && (
            <span>Your position: <strong className="text-body">#{r.position} of {r.classSize}</strong></span>
          )}
          <span className="text-[11px] italic">Benchmarks compare you to your class without naming other students.</span>
        </div>
      )}

      {/* Verdict — font colour only, no colour block. Both brand tokens are
          theme-aware and read correctly in light and dark mode. */}
      <div className="rounded-xl px-4 py-3 text-sm border border-base bg-surface flex items-start gap-2">
        <TrendingUp className={`w-4 h-4 mt-0.5 shrink-0 ${r.passStatus ? 'text-brand-teal' : 'text-brand-coral'}`} />
        <div>
          <span className={`font-semibold ${r.passStatus ? 'text-brand-teal' : 'text-brand-coral'}`}>
            {r.passStatus ? `Passed Term ${term}` : `Did not meet the pass requirement this term`}
          </span>
          <span className="text-muted">
            {' — '}
            {passedCount} of {subjectEntries.length} subject{subjectEntries.length === 1 ? '' : 's'} passed
            {isMsce && r.aggregatePoints != null && `, aggregate ${r.aggregatePoints} points`}
            {!isMsce && r.grade && `, overall grade ${r.grade}`}
          </span>
          {term === 3 && (
            <span className="block text-xs text-muted mt-1">
              Promotion to the next class is decided after all Term 3 results are released.
            </span>
          )}
        </div>
      </div>

      <div className="border border-base rounded-xl overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-page border-b border-base">
              {['Subject','Average','Grade','Result'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-base">
            {subjectEntries.map(([subject, data]) => {
              const counted = isMsce && aggregateSubjects.includes(subject)
              return (
                <tr key={subject} className="hover:bg-page">
                  <td className="px-4 py-3 font-medium">
                    {subject}
                    {counted && (
                      <span className="ml-2 text-[10px] text-brand-teal font-semibold uppercase tracking-wide">
                        in aggregate
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{pct(data?.average)}</td>
                  {/* Per-subject grade stays "Grade" on BOTH tracks — MSCE
                      subjects really are graded 1-9. Only the OVERALL result
                      differs (points, not a grade). */}
                  <td className="px-4 py-3 font-bold text-brand-navy">{data?.grade ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold ${data?.pass ? 'text-brand-teal' : 'text-brand-coral'}`}>
                      {data?.pass ? 'Pass' : 'Fail'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* SR-3: same modal shape as the staff-side student profile screen. */}
      {showReportCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="absolute inset-0" onClick={() => setShowReportCard(false)} />
          <div className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-surface rounded-2xl shadow-xl p-4">
            {reportCardLoading && (
              <div className="flex items-center justify-center gap-2 py-16 text-muted text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading report card…
              </div>
            )}
            {reportCardError && (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <AlertTriangle className="w-6 h-6 text-brand-coral" />
                <p className="text-sm text-brand-coral font-medium">
                  {reportCardError instanceof Error ? reportCardError.message : 'Failed to load report card.'}
                </p>
                <button onClick={() => setShowReportCard(false)} className="mt-2 text-sm text-muted hover:text-body underline">
                  Close
                </button>
              </div>
            )}
            {reportCardData && (
              <PrintableReportCard data={reportCardData} onClose={() => setShowReportCard(false)} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
