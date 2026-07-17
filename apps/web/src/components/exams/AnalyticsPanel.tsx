'use client'

/**
 * [CHANGE TYPE]: MAJOR REWRITE (chart migration only — the class/term
 *   selectors, KPI cards, and all states are unchanged)
 * [FILE]: apps/web/src/components/exams/AnalyticsPanel.tsx
 * [R-PHASE]: R17 — Unified Charting Architecture (Phase 10C Plan)
 * [PURPOSE]: Migrates the "Top 10 Students" panel — the audit's first
 *   confirmed working chart — off a top-level Recharts import and onto the new
 *   `@/components/shared/chart` module (R17 AC: "Migrate AnalyticsPanel onto
 *   the new Chart module"). Consequences of the migration:
 *     - Recharts is no longer imported at the top level of this component; the
 *       `Chart` module dynamic-imports its renderer, so this panel no longer
 *       forces Recharts into the exams-page bundle before it renders.
 *     - The four raw medal hex literals (`#D97706`/`#94A3B8`/`#CD7F32`/
 *       `#0E8A6A`) that coloured the bars per-rank are gone; a single palette
 *       colour (from the R16 design-token source, applied by the renderer)
 *       colours the series, and rank is already conveyed by the `#1…#10`
 *       position axis. This closes the raw-hex and the missing-`ariaLabel`
 *       gaps CROSS_a11y flagged for this exact chart.
 * [DEPENDS ON]:
 *   - @/components/shared/chart (R17 Chart)
 *   - @/hooks/useExams (useClassAnalytics), @/hooks/useClasses (useClasses)
 */

import { useState } from 'react'
import { useClassAnalytics } from '@/hooks/useExams'
import { useClasses } from '@/hooks/useClasses'
import { Chart } from '@/components/shared/chart'
import type { ChartDataPoint } from '@/components/shared/chart'
import { Trophy, Users, TrendingUp } from 'lucide-react'
import type { ApiClass } from '@shared/types/api'

interface Props { academicYear: string; selectedClassId: string; term: number }

export function AnalyticsPanel({ academicYear, selectedClassId, term }: Props) {
  const [classId, setClassId] = useState(selectedClassId)
  const [t, setT]             = useState(term)
  const { data: classesData }  = useClasses(academicYear)
  const classes                = (classesData ?? []) as ApiClass[]
  const { data: analytics, isLoading } = useClassAnalytics(classId, academicYear, t)

  const top10Data: ChartDataPoint[] = (analytics?.top10 ?? []).map((s) => ({
    x: `#${s.position}`,
    average: s.average,
  }))

  return (
    <div className="space-y-5">
      <div className="flex gap-3 flex-wrap">
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          aria-label="Select class"
          className="border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none"
        >
          <option value="">Select class…</option>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={t}
          onChange={(e) => setT(Number(e.target.value))}
          aria-label="Select term"
          className="border border-base rounded-xl px-3 py-2 text-sm bg-surface focus:outline-none"
        >
          {[1,2,3].map((n) => <option key={n} value={n}>Term {n}</option>)}
        </select>
      </div>

      {!classId && <div className="text-center py-16 text-muted text-sm">Select a class to view analytics</div>}
      {classId && isLoading && <div className="text-center py-16 text-muted text-sm animate-pulse">Computing analytics…</div>}
      {classId && !isLoading && !analytics && (
        <div className="text-center py-16 text-muted text-sm">No results computed for this class and term yet.</div>
      )}

      {analytics && (
        <>
          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: TrendingUp, label: 'Pass Rate',      value: `${analytics.passRate}%`,                    bg: 'bg-brand-teal/15',  ic: 'text-brand-teal' },
              { icon: Users,      label: 'Class Average',  value: `${analytics.classAverage.toFixed(1)}%`,     bg: 'bg-brand-navy/10',  ic: 'text-brand-navy' },
              { icon: Trophy,     label: 'Total Students', value: String(analytics.totalStudents),              bg: 'bg-brand-amber/15', ic: 'text-brand-amber' },
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

          {analytics.top10.length > 0 && (
            <div className="bg-surface border border-base rounded-xl p-5">
              <h3 className="font-heading font-semibold text-sm text-muted uppercase tracking-wide mb-4">Top 10 Students</h3>
              <Chart
                type="bar"
                data={top10Data}
                series={[{ key: 'average', label: 'Average %' }]}
                height={220}
                emptyStateMessage="No ranked results for this class and term yet."
                ariaLabel="Top 10 students by average score for the selected class and term"
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
