'use client'

/**
 * Executive summary for school leadership: the headline KPIs from every domain
 * the viewer may see, composed server-side from the same overviews the domain
 * reports use (so a number here always matches the report it links to).
 */
import { useExecutiveAttention, useExecutiveOverview } from '@/hooks/reporting/useExecutiveReporting'
import { useReportSummary } from '../ui/ReportExport'
import { InsightList } from '../ui/InsightList'
import { ReportCard } from '../ui/ReportCard'
import { ReportKpiStrip } from '../ui/ReportKpiStrip'
import { QueryState } from '../ui/ReportStates'
import { AttentionCard, PanelStack } from './common'

interface Period {
  academicYear: string
  term: number
}

export function ExecutiveOverviewTab({ academicYear, term }: Period) {
  const q = useExecutiveOverview({ academicYear, term })
  const attention = useExecutiveAttention({ academicYear, term })
  const d = q.data
  useReportSummary('Executive summary', d?.groups.flatMap((g) => g.kpis), d?.insights)

  return (
    <PanelStack>
      {q.isError ? (
        <QueryState isLoading={false} isError onRetry={() => void q.refetch()}>
          {null}
        </QueryState>
      ) : null}
      {q.isLoading ? <ReportKpiStrip isLoading kpis={undefined} placeholders={8} /> : null}
      {d && d.insights.length > 0 ? (
        <ReportCard title="What stands out" sub="Across academics, students, finance and operations">
          <InsightList insights={d.insights} />
        </ReportCard>
      ) : null}
      <AttentionCard query={attention} title="Needs leadership attention" />
      {d?.groups.map((g) => (
        <section key={g.key} aria-label={g.title} className="space-y-2">
          <h3 className="font-heading text-sm font-semibold text-brand-navy">{g.title}</h3>
          <ReportKpiStrip kpis={g.kpis} isLoading={false} />
        </section>
      ))}
      {d?.warnings.map((w) => (
        <p key={w.key} role="note" className="rounded-lg border border-base bg-page px-3 py-2 text-xs text-muted">
          {w.message}
        </p>
      ))}
    </PanelStack>
  )
}
