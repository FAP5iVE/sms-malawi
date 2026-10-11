'use client'

/**
 * Report-backed blocks shared by every role dashboard.
 *
 *   <DashboardKpis>      header + KPI strip from the domain's /overview, placed
 *                        at the top of a dashboard
 *   <DashboardAttention> the domain's /attention queue, placed after the charts
 *
 * Both read the same server services as the Reports page, so a KPI here and the
 * report it links to always agree. A failed load degrades to a short note — the
 * rest of the dashboard keeps working.
 */
import type { AttentionItem, ReportSectionData } from '@shared/types/reporting'
import type { ApiExecutiveOverview } from '@shared/types/reporting-executive'
import { QueryState } from '@/components/reports/ui/ReportStates'
import { ReportKpiStrip } from '@/components/reports/ui/ReportKpiStrip'
import { AttentionList, InsightList } from '@/components/reports/ui/InsightList'
import { ReportCard } from '@/components/reports/ui/ReportCard'
import type { QueryLike } from '@/components/reports/panels/common'
import { DashboardIntro } from './DashboardIntro'

export function DashboardKpis({
  title,
  summary,
  academicYear,
  term,
  overview,
  reportsHref = '/reports',
  showInsights = false,
  placeholders = 6,
}: {
  title: string
  summary: string
  academicYear?: string
  term?: number | null
  overview: QueryLike<ReportSectionData>
  reportsHref?: string | null
  /** Also list the overview's findings under the KPIs. */
  showInsights?: boolean
  placeholders?: number
}) {
  const { data, isLoading, isError, refetch } = overview
  return (
    <section aria-label={title} className="space-y-3">
      <DashboardIntro
        title={title}
        summary={summary}
        academicYear={academicYear}
        term={term}
        reportsHref={reportsHref}
        generatedAt={data?.generatedAt}
      />
      {isError ? (
        <QueryState isLoading={false} isError onRetry={() => void refetch()}>
          {null}
        </QueryState>
      ) : (
        <ReportKpiStrip kpis={data?.kpis} isLoading={isLoading} placeholders={placeholders} />
      )}
      {showInsights && data && data.insights && data.insights.length > 0 ? (
        <ReportCard title="What stands out" sub={data.scope.description}>
          <InsightList insights={data.insights} />
        </ReportCard>
      ) : null}
      {data?.warnings?.map((w) => (
        <p key={w.key} role="note" className="rounded-lg border border-base bg-page px-3 py-2 text-xs text-muted">
          {w.message}
        </p>
      ))}
    </section>
  )
}

export function DashboardAttention({
  query,
  title = 'Needs attention',
  emptyMessage,
}: {
  query: QueryLike<AttentionItem[]>
  title?: string
  emptyMessage?: string
}) {
  return (
    <ReportCard title={title}>
      <QueryState isLoading={query.isLoading} isError={query.isError} onRetry={() => void query.refetch()} loadingHeight={90}>
        <AttentionList items={query.data} emptyMessage={emptyMessage} />
      </QueryState>
    </ReportCard>
  )
}

/**
 * The school-wide executive KPIs (academics, students, finance, operations),
 * grouped under headings. Only the groups the viewer may see are returned by
 * the server, so nothing here needs a client-side permission check.
 */
export function ExecutiveKpiGroups({
  academicYear,
  term,
  overview,
}: {
  academicYear?: string
  term?: number | null
  overview: QueryLike<ApiExecutiveOverview>
}) {
  const { data, isLoading, isError, refetch } = overview
  return (
    <section aria-label="School overview" className="space-y-3">
      <DashboardIntro
        title="School overview"
        summary="Headline numbers across academics, students, finance and operations. Each figure opens the report behind it."
        academicYear={academicYear}
        term={term}
        reportsHref="/reports?tab=overview"
        generatedAt={data?.generatedAt}
      />
      {isError ? (
        <QueryState isLoading={false} isError onRetry={() => void refetch()}>
          {null}
        </QueryState>
      ) : isLoading || !data ? (
        <ReportKpiStrip kpis={undefined} isLoading placeholders={8} />
      ) : (
        data.groups.map((g) => (
          <div key={g.key} className="space-y-2">
            <h3 className="font-heading text-xs font-semibold uppercase tracking-wide text-muted">{g.title}</h3>
            <ReportKpiStrip kpis={g.kpis} isLoading={false} />
          </div>
        ))
      )}
      {data?.warnings.map((w) => (
        <p key={w.key} role="note" className="rounded-lg border border-base bg-page px-3 py-2 text-xs text-muted">
          {w.message}
        </p>
      ))}
    </section>
  )
}
