'use client'

/**
 * apps/web/src/components/exams/AnalyticsPanel.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE
 * [PURPOSE]: AN-1 (top AND bottom performers with class/term/subject filters,
 *   tie-safe deterministic ranking, staff-facing names) + AN-3 (pass rate,
 *   class average, at-risk count, grade distribution) — all from the single
 *   scoped endpoint GET /exams/analytics/top-bottom (useExamAnalytics). Oversight
 *   roles may view any class (or school-wide when no class is picked); teachers
 *   are scoped server-side to classes they teach. Keeps the migrated Chart for
 *   the top-N bar, now fed from the same source.
 * [DEPENDS ON]: @/hooks/useExams (useExamAnalytics), @/hooks/useClasses,
 *   @/components/shared/chart, @shared/constants/malawi (MALAWI_SUBJECTS)
 */

import { useState } from 'react'
import { useExamAnalytics } from '@/hooks/useExams'
import { useClasses } from '@/hooks/useClasses'
import { Chart } from '@/components/shared/chart'
import type { ChartDataPoint } from '@/components/shared/chart'
import { Trophy, Users, TrendingUp, AlertTriangle } from 'lucide-react'
import type { ApiClass, ApiRankedStudent } from '@shared/types/api'
import { MALAWI_SUBJECTS } from '@shared/constants/malawi'

interface Props { academicYear: string; selectedClassId: string; term: number }

function RankList({ title, rows, accent }: { title: string; rows: ApiRankedStudent[]; accent: string }) {
  if (rows.length === 0) return null
  return (
    <div className="bg-surface border border-base rounded-xl p-5">
      <h3 className="font-heading font-semibold text-sm text-muted uppercase tracking-wide mb-3">{title}</h3>
      <ol className="divide-y divide-base">
        {rows.map((r) => (
          <li key={r.studentId} className="flex items-center justify-between gap-3 py-2">
            <div className="flex items-center gap-3 min-w-0">
              <span className={`w-7 h-7 shrink-0 rounded-full text-xs font-bold flex items-center justify-center ${accent}`}>{r.position}</span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-body truncate">{r.name}</p>
                <p className="text-xs text-muted truncate">{r.registrationNo} · {r.className}</p>
              </div>
            </div>
            <span className="text-sm font-semibold text-brand-navy tabular shrink-0">{r.value.toFixed(1)}%</span>
          </li>
        ))}
      </ol>
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

  const chartData: ChartDataPoint[] = (data?.top ?? []).map((s: ApiRankedStudent) => ({ x: `#${s.position}`, average: s.value }))
  const metricLabel = subject ? `${subject} average` : 'overall average'

  return (
    <div className="space-y-5">
      <div className="flex gap-3 flex-wrap">
        <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Select class"
          className="border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none">
          <option value="">All classes (school-wide)</option>
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
        <div role="alert" className="bg-brand-coral/8 border border-brand-coral/25 rounded-xl px-4 py-3 text-sm text-brand-coral">
          {(error as Error).message}
        </div>
      )}
      {!isLoading && !error && data && data.total === 0 && (
        <div className="text-center py-16 text-muted text-sm">No results computed for this selection yet.</div>
      )}

      {!isLoading && !error && data && data.total > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: TrendingUp,   label: 'Pass Rate',     value: data.passRate != null ? `${data.passRate}%` : '—',        bg: 'bg-brand-teal/15',  ic: 'text-brand-teal' },
              { icon: Users,        label: 'Average',       value: data.classAverage != null ? `${data.classAverage.toFixed(1)}%` : '—', bg: 'bg-brand-navy/10', ic: 'text-brand-navy' },
              { icon: AlertTriangle,label: 'At Risk',       value: String(data.atRiskCount),                                  bg: 'bg-brand-coral/10', ic: 'text-brand-coral' },
              { icon: Trophy,       label: 'Students',      value: String(data.total),                                        bg: 'bg-brand-amber/15', ic: 'text-brand-amber' },
            ].map(({ icon: Icon, label, value, bg, ic }) => (
              <div key={label} className="bg-surface border border-base rounded-xl p-5 text-center">
                <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center mx-auto mb-2`}>
                  <Icon className={`w-5 h-5 ${ic}`} aria-hidden />
                </div>
                <p className="text-2xl font-bold text-brand-navy">{value}</p>
                <p className="text-xs text-muted mt-1">{label}</p>
              </div>
            ))}
          </div>

          {data.gradeDistribution.length > 0 && (
            <div className="bg-surface border border-base rounded-xl p-5">
              <h3 className="font-heading font-semibold text-sm text-muted uppercase tracking-wide mb-3">Grade distribution</h3>
              <div className="flex flex-wrap gap-2">
                {data.gradeDistribution.map((g: { grade: string; count: number }) => (
                  <span key={g.grade} className="inline-flex items-center gap-1.5 bg-page border border-base rounded-full px-3 py-1 text-xs">
                    <strong className="text-body">{g.grade}</strong><span className="text-muted">{g.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {chartData.length > 0 && (
            <div className="bg-surface border border-base rounded-xl p-5">
              <h3 className="font-heading font-semibold text-sm text-muted uppercase tracking-wide mb-4">Top performers ({metricLabel})</h3>
              <Chart type="bar" data={chartData} series={[{ key: 'average', label: 'Average %' }]} height={220}
                emptyStateMessage="No ranked results for this selection yet."
                ariaLabel="Top performers by average score for the selected filters" />
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <RankList title="Top 10" rows={data.top} accent="bg-brand-teal/15 text-brand-teal" />
            <RankList title="Bottom 10" rows={data.bottom} accent="bg-brand-coral/10 text-brand-coral" />
          </div>
        </>
      )}
    </div>
  )
}