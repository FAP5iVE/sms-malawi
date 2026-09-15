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
 * [DEPENDS ON]: @/hooks/useExams (useExamAnalytics), @/hooks/useClasses,
 *   @/components/shared/chart, @shared/constants/malawi (MALAWI_SUBJECTS)
 */

import { useState } from 'react'
import { useExamAnalytics } from '@/hooks/useExams'
import { useClasses } from '@/hooks/useClasses'
import { Chart } from '@/components/shared/chart'
import type { ChartDataPoint } from '@/components/shared/chart'
import { Trophy, Users, TrendingUp, AlertTriangle, Info } from 'lucide-react'
import type { ApiClass, ApiRankedStudent, ApiClassAnalyticsSummary } from '@shared/types/api'
import { MALAWI_SUBJECTS } from '@shared/constants/malawi'

interface Props { academicYear: string; selectedClassId: string; term: number }

function RankList({
  title, rows, accent, usePoints,
}: {
  title: string; rows: ApiRankedStudent[]; accent: string; usePoints: boolean
}) {
  if (rows.length === 0) return null
  return (
    <div className="bg-surface border border-base rounded-xl p-5">
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
    <div className="border border-base rounded-xl overflow-hidden bg-surface">
      <table className="w-full text-sm border-collapse">
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

export function AnalyticsPanel({ academicYear, selectedClassId, term }: Props) {
  const [classId, setClassId] = useState(selectedClassId)
  const [t, setT]             = useState(term)
  const [subject, setSubject] = useState('')
  const { data: classesData } = useClasses(academicYear)
  const classes               = (classesData ?? []) as ApiClass[]
  const { data, isLoading, error } = useExamAnalytics(academicYear, t, { classId: classId || undefined, subject: subject || undefined })

  // MSCE-track classes are ranked and summarised on POINTS, not percentage —
  // but only for the overall result. A single-subject view is a percentage on
  // both tracks, because one subject has no aggregate.
  const usePoints = data?.gradingTrack === 'MSCE' && !subject

  const chartData: ChartDataPoint[] = (data?.top ?? []).map((s: ApiRankedStudent) => ({
    x: `#${s.position}`,
    average: usePoints ? (s.points ?? 0) : s.value,
  }))
  const metricLabel = subject
    ? `${subject} average`
    : usePoints ? 'aggregate points — lower is better' : 'overall average'

  return (
    <div className="space-y-5">
      <div className="flex gap-3 flex-wrap">
        <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Select class"
          className="border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none">
          <option value="">All classes (per-class summary)</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={t} onChange={(e) => setT(Number(e.target.value))} aria-label="Select term"
          className="border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none">
          {[1,2,3].map((n) => <option key={n} value={n}>Term {n}</option>)}
        </select>
        <select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Filter by subject"
          className="border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none">
          <option value="">All subjects (overall)</option>
          {MALAWI_SUBJECTS.map((subj) => <option key={subj} value={subj}>{subj}</option>)}
        </select>
      </div>

      {isLoading && <div className="text-center py-16 text-muted text-sm animate-pulse">Computing analytics…</div>}
      {error && (
        <div role="alert" className="border border-base rounded-xl px-4 py-3 text-sm text-brand-coral bg-surface">
          {(error as Error).message}
        </div>
      )}

      {/* Empty state now names the actual cause and the next step, instead of
          one flat sentence that covered four different situations. */}
      {!isLoading && !error && data && data.total === 0 && (
        <div className="border border-base rounded-xl px-5 py-8 bg-surface flex items-start gap-3 max-w-2xl mx-auto">
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
              <div className="border border-base rounded-xl px-4 py-3 text-xs text-muted bg-surface flex items-start gap-2">
                <Info className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                <span>
                  Classes are summarised separately because Forms 1–2 are graded on the
                  JCE letter scale and Forms 3–4 on the MSCE points scale. Select a single
                  class above to see its Top and Bottom 10.
                </span>
              </div>
              <PerClassTable rows={data.perClass} />
            </>
          )}

          {!data.schoolWide && (
            <>
              {data.gradeDistribution.length > 0 && (
                <div className="bg-surface border border-base rounded-xl p-5">
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
                <div className="bg-surface border border-base rounded-xl p-5">
                  <h3 className="font-heading font-semibold text-sm text-muted uppercase tracking-wide mb-4">
                    Top performers, {data.className} ({metricLabel})
                  </h3>
                  <Chart type="bar" data={chartData}
                    series={[{ key: 'average', label: usePoints ? 'Aggregate points' : 'Average %' }]}
                    height={220}
                    emptyStateMessage="No ranked results for this selection yet."
                    ariaLabel="Top performers for the selected class and filters" />
                </div>
              )}

              <div className="grid gap-4 lg:grid-cols-2">
                <RankList title={`Top 10 — ${data.className ?? ''}`} rows={data.top}
                  accent="text-brand-teal" usePoints={!!usePoints} />
                <RankList title={`Bottom 10 — ${data.className ?? ''}`} rows={data.bottom}
                  accent="text-brand-coral" usePoints={!!usePoints} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
