'use client'

/**
 * Small building blocks shared by every report panel in this folder.
 */
import type { ReactNode } from 'react'
import type { AttentionItem, ReportSectionData } from '@shared/types/reporting'
import { ReportKpiStrip } from '../ui/ReportKpiStrip'
import { AttentionList, InsightList } from '../ui/InsightList'
import { ReportCard } from '../ui/ReportCard'
import { QueryState } from '../ui/ReportStates'
import { useReportSummary } from '../ui/ReportExport'

/** The slice of a TanStack Query result the panels need (keeps them easy to test). */
export interface QueryLike<T> {
  data: T | undefined
  isLoading: boolean
  isError: boolean
  refetch: () => unknown
}

/** Stack of report cards with consistent spacing. */
export function PanelStack({ children }: { children: ReactNode }) {
  return <div className="space-y-4">{children}</div>
}

/** Two-up grid that collapses to one column on small screens. */
export function TwoUp({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{children}</div>
}

/**
 * KPI strip + findings for a domain `/overview` response. Registers the KPIs
 * and findings with the export toolbar so the PDF report pack includes them.
 */
export function OverviewSection({
  query,
  label,
  placeholders,
}: {
  query: QueryLike<ReportSectionData>
  label: string
  placeholders?: number
}) {
  const { data, isLoading, isError, refetch } = query
  useReportSummary(label, data?.kpis, data?.insights)
  return (
    <div className="space-y-4">
      {isError ? (
        <QueryState isLoading={false} isError onRetry={() => void refetch()}>
          {null}
        </QueryState>
      ) : (
        <ReportKpiStrip kpis={data?.kpis} isLoading={isLoading} placeholders={placeholders} />
      )}
      {data && data.insights && data.insights.length > 0 ? (
        <ReportCard title="What stands out" sub={data.scope.description}>
          <InsightList insights={data.insights} />
        </ReportCard>
      ) : null}
      {data?.warnings?.map((w) => (
        <p key={w.key} role="note" className="rounded-lg border border-base bg-page px-3 py-2 text-xs text-muted">
          {w.message}
        </p>
      ))}
    </div>
  )
}

/** "What needs attention" card for a domain `/attention` response. */
export function AttentionCard({
  query,
  title = 'Needs attention',
}: {
  query: QueryLike<AttentionItem[]>
  title?: string
}) {
  return (
    <ReportCard title={title}>
      <QueryState isLoading={query.isLoading} isError={query.isError} onRetry={() => void query.refetch()} loadingHeight={90}>
        <AttentionList items={query.data} />
      </QueryState>
    </ReportCard>
  )
}
