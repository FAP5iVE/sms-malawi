'use client'

/**
 * apps/web/src/components/exams/AnalyticsPanel.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE
 * [PURPOSE]:
 *   1. [CROSS-FORM RANKING] "All classes (school-wide)" previously merged
 *      every class into ONE Top 10 / Bottom 10. A Form 2 result is a JCE
 *      letter grade and a Form 4 result is an MSCE aggregate of points —
 *      two different grading systems over two different syllabuses. Ordering
 *      them against each other ranks quantities that are not comparable, and
 *      it is why the school-wide list read as one long Form 4B block above a
 *      Form 2A block. School-wide now renders a PER-CLASS breakdown; Top and
 *      Bottom 10 are produced only within a single selected class.
 *   2. [MSCE RANKING] Within an MSCE-track class the ranking quantity is the
 *      aggregate, where LOWER is better. The panel now shows points for
 *      those classes instead of a percentage that was never what MSCE
 *      measures.
 *   3. [EMPTY STATE] "No results computed for this selection yet." covered
 *      four distinct causes indistinguishably — class never computed, subject
 *      not taught to that class, wrong term, wrong year. The server now
 *      returns an `emptyReason` naming the actual cause with the next step.
 *   4. Colour-block chips replaced with font colour only, using the
 *      theme-aware brand tokens so they read in light AND dark mode.
 *   5. [STREAMS] "Form N — all streams" scope: Form 1A + Form 1B are one
 *      cohort (same syllabus, same grading track), so they can be ranked
 *      together. Shows a combined Top / Bottom 10 (each row tagged with its
 *      stream), a stream-vs-stream summary and a subject-by-subject comparison.
 *      Used by Exams > Analytics and embedded in the Reports page.
 *   6. [STUDENTS] StudentAnalyticsPanel (same file): the student's view of the
 *      same data for THEIR OWN class only — class top ten, and their marks vs
 *      the class best / average / lowest, overall and per subject. No bottom
 *      ten list, and the lowest figures are never attached to a name.
 * [DEPENDS ON]: @/hooks/useExams (useExamAnalytics, useStudentClassStanding),
 *   @/hooks/useClasses, @/components/shared/chart,
 *   @shared/constants/malawi (MALAWI_SUBJECTS)
 */

import { useState } from 'react'
import { useExamAnalytics, useStudentClassStanding } from '@/hooks/useExams'
import { useClasses } from '@/hooks/useClasses'
import { Chart } from '@/components/shared/chart'
import type { ChartDataPoint } from '@/components/shared/chart'
import { Trophy, Users, TrendingUp, AlertTriangle, Info, Medal } from 'lucide-react'
import type { ApiClass, ApiRankedStudent, ApiClassAnalyticsSummary, ApiSubjectStreamComparison } from '@shared/types/api'
import { MALAWI_SUBJECTS } from '@shared/constants/malawi'

interface Props { academicYear: string; selectedClassId: string; term: number }

function RankList({
  title, rows, accent, usePoints,
}: {
  title: string; rows: ApiRankedStudent[]; accent: string; usePoints: boolean
}) {
  if (rows.length === 0) return null
  return (
    <div className="pb-2">
      <h3 className="font-heading font-semibold text-sm text-muted uppercase tracking-wide mb-3">{title}</h3>
      <ol className="divide-y divide-base">
        {rows.map((r) => (
          <li key={r.studentId} className="flex items-center justify-between gap-3 py-2">
            <div className="flex items-center gap-3 min-w-0">
              {/* Font colour only — no colour block behind the rank number. */}
              <span className={`w-7 h-7 shrink-0 rounded-full border border-base text-xs font-bold flex items-center justify-center ${accent}`}>
                {r.position}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-body truncate">{r.name}</p>
                <p className="text-xs text-muted truncate">{r.registrationNo} · {r.className}</p>
              </div>
            </div>
            <span className="text-sm font-semibold text-brand-navy tabular shrink-0">
              {usePoints
                ? (r.points != null ? `${r.points} pts` : '—')
                : `${r.value.toFixed(1)}%`}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function PerClassTable({ rows }: { rows: ApiClassAnalyticsSummary[] }) {
  return (
    // [PRODUCTION FIX] Was its own bordered/bg-surface card — now nested
    // inside ModuleSurface's own panel (exams/page.tsx), which made this
    // read as a box-within-a-box and ate into the panel's side padding.
    // The header row's bg-page + row dividers already give the table
    // definition without a second outer card.
    <div className="table-scroll">
      <table className="w-full text-sm border-collapse min-w-130">
        <thead>
          <tr className="bg-page border-b border-base">
            {['Class', 'Graded as', 'Students', 'Average', 'Aggregate', 'Pass rate', 'At risk'].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-base">
          {rows.map((c) => (
            <tr key={c.classId} className="hover:bg-page">
              <td className="px-4 py-3 font-medium text-body">{c.className}</td>
              <td className="px-4 py-3 text-xs text-muted">
                {c.gradingTrack === 'MSCE' ? 'MSCE — points' : 'JCE — grades'}
              </td>
              <td className="px-4 py-3 text-muted">{c.total}</td>
              <td className="px-4 py-3">{c.classAverage != null ? `${c.classAverage.toFixed(1)}%` : '—'}</td>
              <td className="px-4 py-3">
                {c.gradingTrack === 'MSCE'
                  ? (c.averagePoints != null ? `${c.averagePoints} pts` : '—')
                  : <span className="text-muted text-xs">n/a</span>}
              </td>
              <td className="px-4 py-3">{c.passRate != null ? `${c.passRate}%` : '—'}</td>
              <td className={`px-4 py-3 font-semibold ${c.atRiskCount > 0 ? 'text-brand-coral' : 'text-brand-teal'}`}>
                {c.atRiskCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Streams of one form that have more than one class, e.g. Form 1 → [1A, 1B]. */
function streamGroups(classes: ApiClass[]): { form: number; names: string[] }[] {
  const byForm = new Map<number, string[]>()
  for (const c of classes) byForm.set(c.form, [...(byForm.get(c.form) ?? []), c.name])
  return Array.from(byForm.entries())
    .filter(([, names]) => names.length > 1)
    .map(([form, names]) => ({ form, names: names.sort() }))
    .sort((a, b) => a.form - b.form)
}

/** Subject-by-subject, stream-by-stream. The stronger stream in each row is in
 *  the brand teal; the gap column says by how many points. */
function StreamSubjectTable({ rows, streams }: { rows: ApiSubjectStreamComparison[]; streams: string[] }) {
  return (
    <div className="table-scroll">
      <table className="w-full text-sm border-collapse min-w-130">
        <thead>
          <tr className="bg-page border-b border-base">
            {['Subject', ...streams, 'Combined', 'Gap'].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-base">
          {rows.map((r) => {
            const avgs = streams.map((n) => r.byClass.find((c) => c.className === n)?.average ?? null)
            const present = avgs.filter((a): a is number => a !== null)
            const top = present.length ? Math.max(...present) : null
            const gap = present.length > 1 ? Math.max(...present) - Math.min(...present) : null
            return (
              <tr key={r.subject} className="hover:bg-page">
                <td className="px-4 py-3 font-medium text-body">{r.subject}</td>
                {avgs.map((a, i) => (
                  <td key={streams[i]} className={`px-4 py-3 tabular ${a !== null && a === top && gap ? 'text-brand-teal font-semibold' : 'text-body'}`}>
                    {a !== null ? `${a.toFixed(1)}%` : '—'}
                  </td>
                ))}
                <td className="px-4 py-3 tabular text-muted">{r.overall !== null ? `${r.overall.toFixed(1)}%` : '—'}</td>
                <td className={`px-4 py-3 tabular ${gap !== null && gap >= 10 ? 'text-brand-coral font-semibold' : 'text-muted'}`}>
                  {gap !== null ? `${gap.toFixed(1)} pts` : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function AnalyticsPanel({ academicYear, selectedClassId, term }: Props) {
  // `scope` is a class id, "form:N" (every stream of Form N combined) or ''.
  const [scope, setScope]     = useState(selectedClassId)
  const [subject, setSubject] = useState('')
  const { data: classesData } = useClasses(academicYear)
  const classes               = (classesData ?? []) as ApiClass[]
  const groups                = streamGroups(classes)
  const form                  = scope.startsWith('form:') ? Number(scope.slice(5)) : undefined
  const classId               = form ? undefined : scope || undefined
  const { data, isLoading, error } = useExamAnalytics(academicYear, term, { classId, form, subject: subject || undefined })

  // MSCE-track classes are ranked and summarised on POINTS, not percentage —
  // but only for the overall result. A single-subject view is a percentage on
  // both tracks, because one subject has no aggregate.
  const usePoints = data?.gradingTrack === 'MSCE' && !subject

  const chartData: ChartDataPoint[] = (data?.top ?? []).map((s: ApiRankedStudent) => ({
    x: `#${s.position}`,
    average: usePoints ? (s.points ?? 0) : s.value,
  }))
  const isForm      = data?.scope === 'form'
  const streamNames = (data?.perClass ?? []).map((c) => c.className)
  const scopeLabel  = isForm ? `Form ${data?.form} (${streamNames.join(' + ')} combined)` : (data?.className ?? '')
  // One series per stream, one group of bars per subject.
  const streamChart: ChartDataPoint[] = (data?.subjectComparison ?? []).map((r) => {
    const point: ChartDataPoint = { x: r.subject }
    streamNames.forEach((n, i) => { point[`s${i}`] = r.byClass.find((c) => c.className === n)?.average ?? 0 })
    return point
  })
  const metricLabel = subject
    ? `${subject} average`
    : usePoints ? 'aggregate points — lower is better' : 'overall average'

  return (
    <div className="space-y-5">
      <div className="flex gap-3 flex-wrap">
        <select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Select class or form"
          className="border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none">
          <option value="">All classes (per-class summary)</option>
          {groups.length > 0 && (
            <optgroup label="Combined streams">
              {groups.map((g) => (
                <option key={g.form} value={`form:${g.form}`}>Form {g.form} — all streams ({g.names.join(' + ')})</option>
              ))}
            </optgroup>
          )}
          <optgroup label="Single class">
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
        </select>
        <select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Filter by subject"
          className="border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none">
          <option value="">All subjects (overall)</option>
          {MALAWI_SUBJECTS.map((subj) => <option key={subj} value={subj}>{subj}</option>)}
        </select>
      </div>

      {isLoading && <div className="text-center py-16 text-muted text-sm animate-pulse">Computing analytics…</div>}
      {error && (
        <div role="alert" className="py-3 text-sm text-brand-coral">
          {(error as Error).message}
        </div>
      )}

      {/* Empty state now names the actual cause and the next step, instead of
          one flat sentence that covered four different situations. */}
      {!isLoading && !error && data && data.total === 0 && (
        <div className="px-5 py-8 flex items-start gap-3 max-w-2xl mx-auto">
          <Info className="w-5 h-5 text-muted shrink-0 mt-0.5" aria-hidden />
          <p className="text-sm text-muted">
            {data.emptyReason ?? 'No results computed for this selection yet.'}
          </p>
        </div>
      )}

      {!isLoading && !error && data && data.total > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: TrendingUp,    label: 'Pass Rate', value: data.passRate != null ? `${data.passRate}%` : '—', ic: 'text-brand-teal' },
              {
                icon: Users,
                label: usePoints ? 'Avg. Points' : 'Average',
                value: usePoints
                  ? (data.averagePoints != null ? String(data.averagePoints) : '—')
                  : (data.classAverage != null ? `${data.classAverage.toFixed(1)}%` : '—'),
                ic: 'text-brand-navy',
              },
              { icon: AlertTriangle, label: 'At Risk',   value: String(data.atRiskCount), ic: 'text-brand-coral' },
              { icon: Trophy,        label: 'Students',  value: String(data.total),       ic: 'text-brand-amber' },
            ].map(({ icon: Icon, label, value, ic }) => (
              <div key={label} className="bg-surface border border-base rounded-xl p-5 text-center">
                {/* Icon tinted by font colour, no filled colour tile behind it. */}
                <Icon className={`w-5 h-5 mx-auto mb-2 ${ic}`} aria-hidden />
                <p className="text-2xl font-bold text-brand-navy">{value}</p>
                <p className="text-xs text-muted mt-1">{label}</p>
              </div>
            ))}
          </div>

          {/* School-wide: per-class breakdown INSTEAD of a merged ranking. */}
          {data.schoolWide && (
            <>
              <div className="py-1 text-xs text-muted flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                <span>
                  Classes are summarised separately because Forms 1–2 are graded on the
                  JCE letter scale and Forms 3–4 on the MSCE points scale. Select a single
                  class or a form&apos;s combined streams above to see its Top and Bottom 10.
                </span>
              </div>
              <PerClassTable rows={data.perClass} />
            </>
          )}

          {!data.schoolWide && (
            <>
              {isForm && (
                <>
                  <div className="py-1 text-xs text-muted flex items-start gap-2">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                    <span>
                      Form {data.form} streams ({streamNames.join(', ')}) sit the same syllabus, so they are
                      ranked together below each row shows the stream the student belongs to.
                    </span>
                  </div>
                  <div className="pb-2">
                    <h3 className="font-heading font-semibold text-sm text-muted uppercase tracking-wide mb-3">
                      Stream comparison
                    </h3>
                    <PerClassTable rows={data.perClass} />
                  </div>
                  {data.subjectComparison.length > 0 && (
                    <div className="pb-2 space-y-4">
                      <h3 className="font-heading font-semibold text-sm text-muted uppercase tracking-wide">
                        Subject by subject — average % per stream
                      </h3>
                      <Chart type="bar" data={streamChart}
                        series={streamNames.map((n, i) => ({ key: `s${i}`, label: n }))}
                        height={260}
                        emptyStateMessage="No subject results for these streams yet."
                        ariaLabel={`Subject averages for each Form ${data.form} stream`} />
                      <StreamSubjectTable rows={data.subjectComparison} streams={streamNames} />
                    </div>
                  )}
                </>
              )}

              {data.gradeDistribution.length > 0 && (
                <div className="pb-2">
                  <h3 className="font-heading font-semibold text-sm text-muted uppercase tracking-wide mb-3">
                    {usePoints ? 'Aggregate distribution' : 'Grade distribution'}
                  </h3>
                  <div className="flex flex-wrap gap-4">
                    {data.gradeDistribution.map((g: { grade: string; count: number }) => (
                      <span key={g.grade} className="inline-flex items-center gap-1.5 text-xs">
                        <strong className="text-body">{g.grade}</strong>
                        <span className="text-muted">{g.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {chartData.length > 0 && (
                <div className="pb-2">
                  <h3 className="font-heading font-semibold text-sm text-muted uppercase tracking-wide mb-4">
                    Top performers, {scopeLabel} ({metricLabel})
                  </h3>
                  <Chart type="bar" data={chartData}
                    series={[{ key: 'average', label: usePoints ? 'Aggregate points' : 'Average %' }]}
                    height={220}
                    emptyStateMessage="No ranked results for this selection yet."
                    ariaLabel="Top performers for the selected class and filters" />
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <RankList title={`Top 10 — ${scopeLabel}`} rows={data.top}
                  accent="text-brand-teal" usePoints={!!usePoints} />
                <RankList title={`Bottom 10 — ${scopeLabel}`} rows={data.bottom}
                  accent="text-brand-coral" usePoints={!!usePoints} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  STUDENT VIEW — own class only
// ─────────────────────────────────────────────────────────────────────────────

const pct1 = (n: number) => `${n.toFixed(1)}%`

/** A track from the class lowest to the class best with markers for the class
 *  average and for "you". Position is the value's place between lowest and
 *  best, so a wider gap between markers is a bigger gap in marks. */
function RangeBar({ you, best, worst, average }: { you: number; best: number; worst: number; average: number }) {
  const span = Math.max(best - worst, 0.0001)
  const at = (v: number) => `${Math.min(100, Math.max(0, ((v - worst) / span) * 100))}%`
  return (
    <div className="relative h-5 min-w-28" role="img"
      aria-label={`You ${pct1(you)}; class lowest ${pct1(worst)}, average ${pct1(average)}, best ${pct1(best)}`}>
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-base border border-base" />
      <span className="absolute top-1/2 h-3 w-0.5 -translate-y-1/2 bg-muted" style={{ left: at(average) }} title="Class average" />
      <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-brand-teal bg-surface"
        style={{ left: at(you) }} title="You" />
    </div>
  )
}

function CompareCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: string }) {
  return (
    <div className="bg-surface border border-base rounded-xl p-4 text-center">
      <p className={`text-2xl font-bold tabular ${accent}`}>{value}</p>
      <p className="text-xs text-muted mt-1">{label}</p>
      {sub && <p className="text-[10px] text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

interface StudentProps { studentId: string; academicYear: string; term: number }

export function StudentAnalyticsPanel({ studentId, academicYear, term }: StudentProps) {
  const { data, isLoading, error } = useStudentClassStanding(studentId, academicYear, term)

  if (isLoading) return <div className="animate-pulse h-40 rounded-xl bg-surface" />

  if (error) {
    const msg = (error as Error).message
    const isFeeGate = msg.includes('fee') || msg.includes('Outstanding')
    return (
      <div className="rounded-xl p-5 border border-base bg-surface flex items-start gap-3">
        <AlertTriangle className={`w-5 h-5 mt-0.5 shrink-0 ${isFeeGate ? 'text-brand-coral' : 'text-muted'}`} aria-hidden />
        <div>
          <p className={`font-semibold ${isFeeGate ? 'text-brand-coral' : 'text-body'}`}>
            {isFeeGate ? 'Class analytics unavailable, outstanding fee balance' : 'Class analytics unavailable'}
          </p>
          <p className="text-sm text-muted mt-1">
            {isFeeGate
              ? 'Like your results, class analytics open once this term\'s fees are paid in full. Please visit the Finance office.'
              : 'Please check back later.'}
          </p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="px-5 py-8 flex items-start gap-3 max-w-2xl mx-auto">
        <Info className="w-5 h-5 text-muted shrink-0 mt-0.5" aria-hidden />
        <p className="text-sm text-muted">
          Your class analytics appear here once Term {term} results have been released.
        </p>
      </div>
    )
  }

  const { standing, topTen, className, rankedByPoints } = data
  const me = topTen.find((t) => t.isYou)
  const pts = standing.points
  const chartData: ChartDataPoint[] = standing.subjects.map((s) => ({
    x: s.subject, you: s.you, best: s.best, average: s.average, lowest: s.worst,
  }))
  const diff = standing.overall.you - standing.overall.average

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted">
          <span className="font-semibold text-body">{className}</span> · Term {term} · {academicYear}
        </p>
        <p className="text-sm text-muted">
          You are <strong className="text-body">#{standing.position}</strong> of {standing.outOf} in your class
          {' '}
          <span className={diff >= 0 ? 'text-brand-teal' : 'text-brand-coral'}>
            ({diff >= 0 ? '+' : '−'}{Math.abs(diff).toFixed(1)} pts vs class average)
          </span>
        </p>
      </div>

      {/* Overall: you vs best vs average vs lowest — the lowest is a bare number. */}
      <div>
        <h3 className="font-heading font-semibold text-sm text-muted uppercase tracking-wide mb-3">Overall comparison</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <CompareCard label="You" value={pct1(standing.overall.you)}
            sub={pts ? `${pts.you} pts` : undefined} accent="text-brand-teal" />
          <CompareCard label="Class best" value={pct1(standing.overall.best)}
            sub={pts ? `${pts.best} pts` : undefined} accent="text-brand-navy" />
          <CompareCard label="Class average" value={pct1(standing.overall.average)}
            sub={pts ? `${pts.average} pts` : undefined} accent="text-brand-navy" />
          <CompareCard label="Class lowest" value={pct1(standing.overall.worst)}
            sub={pts ? `${pts.worst} pts` : undefined} accent="text-muted" />
        </div>
        {pts && (
          <p className="text-[11px] text-muted mt-2">
            Points are your MSCE aggregate — lower is better, so the best points figure is the lowest total.
          </p>
        )}
      </div>

      {/* Subject by subject */}
      {standing.subjects.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-heading font-semibold text-sm text-muted uppercase tracking-wide">Subject by subject</h3>
          <Chart type="bar" data={chartData}
            series={[
              { key: 'you',     label: 'You' },
              { key: 'average', label: 'Class average' },
              { key: 'best',    label: 'Class best' },
              { key: 'lowest',  label: 'Class lowest' },
            ]}
            height={280}
            emptyStateMessage="No subject results yet."
            ariaLabel="Your mark in each subject against the class best, average and lowest" />
          <div className="table-scroll">
            <table className="w-full text-sm border-collapse min-w-160">
              <thead>
                <tr className="bg-page border-b border-base">
                  {['Subject', 'You', 'Best', 'Average', 'Lowest', 'Where you sit', 'Rank'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-base">
                {standing.subjects.map((sub) => {
                  const d = sub.you - sub.average
                  return (
                    <tr key={sub.subject} className="hover:bg-page">
                      <td className="px-4 py-3 font-medium text-body">{sub.subject}</td>
                      <td className="px-4 py-3 tabular">
                        <span className="font-semibold text-brand-navy">{pct1(sub.you)}</span>
                        <span className={`ml-2 text-[11px] ${d >= 0 ? 'text-brand-teal' : 'text-brand-coral'}`}>
                          {d >= 0 ? '+' : '−'}{Math.abs(d).toFixed(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular text-muted">{pct1(sub.best)}</td>
                      <td className="px-4 py-3 tabular text-muted">{pct1(sub.average)}</td>
                      <td className="px-4 py-3 tabular text-muted">{pct1(sub.worst)}</td>
                      <td className="px-4 py-3"><RangeBar you={sub.you} best={sub.best} worst={sub.worst} average={sub.average} /></td>
                      <td className="px-4 py-3 tabular text-muted">#{sub.position} of {sub.outOf}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted">
            The ring is you, the tick is the class average, and the ends of the bar are the class lowest and best.
            Compared with your own class only; no other student is named except the top ten below.
          </p>
        </div>
      )}

      {/* Top ten of the student's own class — and nothing about the bottom. */}
      <div>
        <h3 className="font-heading font-semibold text-sm text-muted uppercase tracking-wide mb-3 flex items-center gap-2">
          <Medal className="w-4 h-4 text-brand-amber" aria-hidden /> Top 10 — {className}
        </h3>
        <ol className="divide-y divide-base">
          {topTen.map((t) => (
            <li key={t.position}
              className={`flex items-center justify-between gap-3 py-2 ${t.isYou ? 'font-semibold' : ''}`}
              aria-current={t.isYou ? 'true' : undefined}>
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-7 h-7 shrink-0 rounded-full border border-base text-xs font-bold flex items-center justify-center text-brand-teal">
                  {t.position}
                </span>
                <p className="text-sm text-body truncate">
                  {t.name}
                  {t.isYou && <span className="ml-2 text-[10px] uppercase tracking-wide text-brand-teal">You</span>}
                </p>
              </div>
              <span className="text-sm text-brand-navy tabular shrink-0">
                {rankedByPoints ? (t.points != null ? `${t.points} pts` : '—') : pct1(t.value)}
              </span>
            </li>
          ))}
        </ol>
        {!me && (
          <p className="mt-3 text-sm text-muted">
            You are #{standing.position} of {standing.outOf} — {pct1(standing.overall.you)}
            {pts ? `, ${pts.you} points` : ''}..
          </p>
        )}
      </div>
    </div>
  )
}
