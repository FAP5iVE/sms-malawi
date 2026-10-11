'use client'

/**
 * Library report tabs: the overview KPIs/findings (shown above the existing
 * overview panel), circulation (including overdue aging and the overdue list)
 * and fines (assessed vs collected, with the waived amount shown separately so
 * it is not mistaken for money collected).
 */
import { Chart } from '@/components/shared/chart'
import { ChartCard } from '@/components/shared/ChartCard'
import { useLibraryAttention, useLibraryCirculation, useLibraryFines, useLibraryOverview } from '@/hooks/reporting/useLibraryReporting'
import type { ApiLibraryCountRow, ApiOverdueRow } from '@shared/types/reporting-library'
import { formatCount, formatDate, formatDays, formatMwk } from '@/lib/reportFormat'
import { FilterBar, FilterSelect } from '../ui/ReportFilters'
import { useReportParam } from '../ui/useReportParams'
import { ReportCard } from '../ui/ReportCard'
import { ReportTable } from '../ui/ReportTable'
import { QueryState } from '../ui/ReportStates'
import { ReportKpiStrip } from '../ui/ReportKpiStrip'
import { kpiTile } from './kpiHelpers'
import { AttentionCard, OverviewSection, PanelStack, TwoUp } from './common'

const counts = (rows: readonly ApiLibraryCountRow[] | undefined) => (rows ?? []).map((r) => ({ x: r.label, count: r.count }))

export function LibraryOverviewSection() {
  const overview = useLibraryOverview()
  const attention = useLibraryAttention()
  return (
    <PanelStack>
      <OverviewSection query={overview} label="Library overview" placeholders={6} />
      <AttentionCard query={attention} title="Library attention queue" />
    </PanelStack>
  )
}

const WINDOWS = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '180', label: 'Last 180 days' },
]

export function LibraryCirculationTab() {
  const [windowParam, setWindowParam] = useReportParam('days')
  const days = Number(windowParam) || 30
  const q = useLibraryCirculation(days)
  const d = q.data
  return (
    <PanelStack>
      <FilterBar>
        <FilterSelect label="Window" value={String(days)} onChange={setWindowParam} options={WINDOWS} />
      </FilterBar>
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          kpiTile('loans', 'Loans issued', d.loans, 'count', `Books borrowed in the last ${d.windowDays} days.`),
          kpiTile('returned', 'Returned', d.returned, 'count', 'Loans from the window that have come back.'),
          kpiTile('onTime', 'Returned on time', d.onTimeRate, 'percent', 'Returned on or before the due date, as a share of all returned loans in the window.'),
          kpiTile('keep', 'Average loan length', d.avgLoanDays, 'days', 'Mean days kept for returned loans.'),
        ] : undefined}
      />
      <TwoUp>
        <ChartCard title="Loans by category" isLoading={q.isLoading} height={260}>
          <Chart type="bar" data={counts(d?.byCategory)} series={[{ key: 'count', label: 'Loans' }]} height={260} emptyStateMessage="No loans in this window." ariaLabel="Loans by book category" />
        </ChartCard>
        <ChartCard title="Student loans by form" isLoading={q.isLoading} height={260}>
          <Chart type="bar" data={counts(d?.byForm)} series={[{ key: 'count', label: 'Loans' }]} height={260} emptyStateMessage="No student loans in this window." ariaLabel="Student loans by form" />
        </ChartCard>
        <ChartCard title="Borrowers" sub="Students and staff" isLoading={q.isLoading} height={240}>
          <Chart type="donut" data={counts(d?.byBorrowerType)} series={[{ key: 'count', label: 'Loans' }]} height={240} emptyStateMessage="No loans in this window." ariaLabel="Loans by borrower type" />
        </ChartCard>
        <ChartCard title="Overdue loans by how late" sub="Open loans past their due date" isLoading={q.isLoading} height={240}>
          <Chart type="bar" data={counts(d?.overdueAging)} series={[{ key: 'count', label: 'Loans' }]} height={240} emptyStateMessage="Nothing is overdue." ariaLabel="Overdue loans by days late" />
        </ChartCard>
      </TwoUp>
      <ReportCard title="Overdue loans" sub="Longest overdue first">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable<ApiOverdueRow>
            rows={d?.overdue}
            rowKey={(r) => r.borrowingId}
            exportLabel="Overdue loans"
            emptyMessage="Nothing is overdue."
            defaultSort={{ key: 'late', direction: 'desc' }}
            columns={[
              { key: 'book', label: 'Book', sortValue: (r) => r.bookTitle },
              { key: 'borrower', label: 'Borrower', sortValue: (r) => r.borrower },
              { key: 'type', label: 'Type', hideOnMobile: true, sortValue: (r) => r.borrowerType, cell: (r) => (r.borrowerType === 'STUDENT' ? 'Student' : 'Staff'), exportValue: (r) => r.borrowerType },
              { key: 'class', label: 'Class', hideOnMobile: true, sortValue: (r) => r.className ?? '', cell: (r) => r.className ?? '—', exportValue: (r) => r.className ?? '' },
              { key: 'due', label: 'Due', hideOnMobile: true, sortValue: (r) => r.dueDate, cell: (r) => formatDate(r.dueDate), exportValue: (r) => formatDate(r.dueDate) },
              { key: 'late', label: 'Days overdue', align: 'right', sortValue: (r) => r.daysOverdue, cell: (r) => formatDays(r.daysOverdue), exportValue: (r) => r.daysOverdue },
            ]}
          />
        </QueryState>
      </ReportCard>
      {d ? <p className="text-xs text-muted">{formatCount(d.overdue.length)} overdue loan{d.overdue.length === 1 ? '' : 's'} listed.</p> : null}
    </PanelStack>
  )
}

const MONTH_WINDOWS = [
  { value: '6', label: 'Last 6 months' },
  { value: '12', label: 'Last 12 months' },
]

export function LibraryFinesTab() {
  const [monthsParam, setMonthsParam] = useReportParam('months')
  const months = Number(monthsParam) || 6
  const q = useLibraryFines(months)
  const d = q.data
  return (
    <PanelStack>
      <FilterBar>
        <FilterSelect label="Window" value={String(months)} onChange={setMonthsParam} options={MONTH_WINDOWS} />
      </FilterBar>
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          kpiTile('pending', 'Outstanding fines', d.pendingAmount, 'mwk', 'Fines assessed and not yet paid or waived.', d.pendingAmount > 0 ? 'watch' : 'healthy', `${formatCount(d.pendingCount)} fine${d.pendingCount === 1 ? '' : 's'}`),
          kpiTile('paid', 'Collected', d.paidAmount, 'mwk', 'Fines paid.'),
          kpiTile('waived', 'Waived', d.waivedAmount, 'mwk', 'Fines forgiven — not money collected.'),
          kpiTile('rate', 'Collection rate', d.collectionRate, 'percent', 'Paid and waived, as a share of everything assessed.'),
        ] : undefined}
      />
      <ChartCard title="Fines assessed and collected" sub="By month" isLoading={q.isLoading} height={280}>
        <Chart
          type="bar"
          data={(d?.monthly ?? []).map((m) => ({ x: m.label, assessed: m.assessed, collected: m.collected }))}
          series={[{ key: 'assessed', label: 'Assessed (MWK)' }, { key: 'collected', label: 'Collected (MWK)' }]}
          height={280}
          emptyStateMessage="No fines in this window."
          ariaLabel="Library fines assessed and collected by month"
        />
      </ChartCard>
      <ReportCard title="Monthly detail">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable rows={d?.monthly} rowKey={(r) => r.label} exportLabel="Library fines by month" emptyMessage="No fines in this window." columns={[
            { key: 'month', label: 'Month', sortValue: (r) => r.label },
            { key: 'assessed', label: 'Assessed', align: 'right', sortValue: (r) => r.assessed, cell: (r) => formatMwk(r.assessed), exportValue: (r) => r.assessed },
            { key: 'collected', label: 'Collected', align: 'right', sortValue: (r) => r.collected, cell: (r) => formatMwk(r.collected), exportValue: (r) => r.collected },
          ]} />
        </QueryState>
      </ReportCard>
    </PanelStack>
  )
}
