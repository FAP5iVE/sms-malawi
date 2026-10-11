'use client'

/**
 * Finance report tabs added by the reports overhaul: overview, receivables
 * aging, payment mix, and (shared with high_rank) procurement and stocktake
 * variance. The long-standing collection / outstanding / expenses / cash-flow /
 * payroll / scholarship panels stay in the page file untouched.
 */
import { Chart } from '@/components/shared/chart'
import { ChartCard } from '@/components/shared/ChartCard'
import {
  useFinanceAging, useFinanceAttention, useFinanceOverview, usePaymentMix,
} from '@/hooks/reporting/useFinanceReporting'
import { useProcurementPipeline, useStocktakeVariance } from '@/hooks/reporting/useOperationsReporting'
import type { ApiAgingBucket, ApiAgingDebtorRow } from '@shared/types/reporting-finance'
import type { ApiVarianceItemRow, ApiVarianceRoomRow } from '@shared/types/reporting-operations'
import { formatDate, formatDays, formatMwk, formatMwkCompact, formatPercent } from '@/lib/reportFormat'
import { ReportCard } from '../ui/ReportCard'
import { ReportTable } from '../ui/ReportTable'
import { QueryState } from '../ui/ReportStates'
import { FilterBar, FilterSelect } from '../ui/ReportFilters'
import { useReportParam } from '../ui/useReportParams'
import { ReportKpiStrip } from '../ui/ReportKpiStrip'
import { kpiTile } from './kpiHelpers'
import { AttentionCard, OverviewSection, PanelStack, TwoUp } from './common'

interface PeriodProps {
  academicYear: string
  term: number
}

export function FinanceOverviewTab({ academicYear, term }: PeriodProps) {
  const overview = useFinanceOverview({ academicYear, term })
  const attention = useFinanceAttention({ academicYear, term })
  return (
    <PanelStack>
      <OverviewSection query={overview} label="Finance overview" placeholders={8} />
      <AttentionCard query={attention} title="Finance attention queue" />
    </PanelStack>
  )
}

const BUCKET_OPTIONS = [
  { value: 'current', label: 'Current' },
  { value: 'd1_30', label: '1–30 days' },
  { value: 'd31_60', label: '31–60 days' },
  { value: 'd61_90', label: '61–90 days' },
  { value: 'd90_plus', label: '90+ days' },
] as const

export function FinanceAgingTab({ academicYear, term }: PeriodProps) {
  const q = useFinanceAging({ academicYear, term })
  const [bucket, setBucket] = useReportParam('bucket')
  const data = q.data

  const debtors = (data?.debtors ?? []).filter((d) => !bucket || d.bucket === bucket)
  const bucketLabel = (key: string) => data?.buckets.find((b) => b.key === key)?.label ?? key

  return (
    <PanelStack>
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={
          data
            ? [
                kpiTile('totalOutstanding', 'Outstanding', data.totalOutstanding, 'mwk', 'Unpaid balance on invoices for the selected period.'),
                kpiTile('overdue', 'Past due date', data.overdueAmount, 'mwk', 'Unpaid balance on invoices already past their due date.', data.overdueAmount > 0 ? 'watch' : 'healthy'),
                kpiTile('severe', 'More than 60 days late', data.severeAmount, 'mwk', 'Unpaid balance more than 60 days past the due date.', data.severeAmount > 0 ? 'critical' : 'healthy'),
                kpiTile('severeShare', 'Severe share', data.severeShare, 'percent', 'Share of the outstanding balance that is more than 60 days late.'),
              ]
            : undefined
        }
      />
      <TwoUp>
        <ChartCard title="Receivables aging" sub="Unpaid balance by days past the due date" isLoading={q.isLoading} height={240}>
          <Chart
            type="bar"
            data={(data?.buckets ?? []).map((b: ApiAgingBucket) => ({ x: b.label, amount: b.amount }))}
            series={[{ key: 'amount', label: 'Outstanding (MWK)' }]}
            height={240}
            emptyStateMessage="Nothing outstanding."
            ariaLabel="Outstanding fee balance by aging bucket"
          />
        </ChartCard>
        <ReportCard title="Aging by form" sub="Outstanding balance (MWK) by bucket">
          <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()} isEmpty={!data || data.byForm.length === 0} emptyMessage="No outstanding balances.">
            <ReportTable
              rows={data?.byForm}
              rowKey={(r) => r.label}
              exportLabel="Aging by form"
              columns={[
                { key: 'form', label: 'Form', sortValue: (r) => r.label },
                { key: 'current', label: 'Current', align: 'right', sortValue: (r) => r.buckets.current, cell: (r) => formatMwkCompact(r.buckets.current), exportValue: (r) => r.buckets.current },
                { key: 'd1', label: '1–30', align: 'right', sortValue: (r) => r.buckets.d1_30, cell: (r) => formatMwkCompact(r.buckets.d1_30), exportValue: (r) => r.buckets.d1_30 },
                { key: 'd31', label: '31–60', align: 'right', sortValue: (r) => r.buckets.d31_60, cell: (r) => formatMwkCompact(r.buckets.d31_60), exportValue: (r) => r.buckets.d31_60 },
                { key: 'd61', label: '61–90', align: 'right', sortValue: (r) => r.buckets.d61_90, cell: (r) => formatMwkCompact(r.buckets.d61_90), exportValue: (r) => r.buckets.d61_90 },
                { key: 'd90', label: '90+', align: 'right', sortValue: (r) => r.buckets.d90_plus, cell: (r) => formatMwkCompact(r.buckets.d90_plus), exportValue: (r) => r.buckets.d90_plus },
                { key: 'total', label: 'Total', align: 'right', sortValue: (r) => r.total, cell: (r) => formatMwkCompact(r.total), exportValue: (r) => r.total },
              ]}
            />
          </QueryState>
        </ReportCard>
      </TwoUp>
      <ReportCard
        title="Debtors"
        sub={data?.debtorsTruncated ? 'Largest balances first (list is capped — export for the largest rows)' : 'Largest balances first'}
        actions={
          <FilterBar ariaLabel="Aging filter">
            <FilterSelect label="Bucket" value={bucket ?? ''} options={BUCKET_OPTIONS} allLabel="All buckets" onChange={(v) => setBucket(v || undefined)} />
          </FilterBar>
        }
      >
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable<ApiAgingDebtorRow>
            rows={debtors}
            rowKey={(r) => r.invoiceId}
            exportLabel="Debtors"
            emptyMessage="No invoices in this bucket."
            defaultSort={{ key: 'balance', direction: 'desc' }}
            columns={[
              { key: 'student', label: 'Student', sortValue: (r) => r.studentName },
              { key: 'invoice', label: 'Invoice', hideOnMobile: true, sortValue: (r) => r.invoiceNumber },
              { key: 'class', label: 'Class', hideOnMobile: true, sortValue: (r) => r.className ?? '' },
              { key: 'balance', label: 'Balance', align: 'right', sortValue: (r) => r.balance, cell: (r) => formatMwk(r.balance), exportValue: (r) => r.balance },
              { key: 'due', label: 'Due', hideOnMobile: true, sortValue: (r) => r.dueDate, cell: (r) => formatDate(r.dueDate), exportValue: (r) => formatDate(r.dueDate) },
              { key: 'days', label: 'Days overdue', align: 'right', sortValue: (r) => r.daysOverdue, cell: (r) => (r.daysOverdue > 0 ? formatDays(r.daysOverdue) : '—'), exportValue: (r) => r.daysOverdue },
              { key: 'bucket', label: 'Bucket', sortValue: (r) => r.bucket, cell: (r) => bucketLabel(r.bucket), exportValue: (r) => bucketLabel(r.bucket) },
            ]}
          />
        </QueryState>
      </ReportCard>
    </PanelStack>
  )
}

export function FinancePaymentsTab({ academicYear, term }: PeriodProps) {
  const q = usePaymentMix({ academicYear, term })
  const data = q.data
  return (
    <PanelStack>
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={
          data
            ? [
                kpiTile('collected', 'Collected', data.totalCollected, 'mwk', 'Total of payments recorded for the selected period.'),
                kpiTile('count', 'Payments', data.paymentCount, 'count', 'Number of payments recorded.'),
                kpiTile('average', 'Average payment', data.averagePayment, 'mwk', 'Total collected ÷ number of payments.'),
              ]
            : undefined
        }
      />
      <TwoUp>
        <ChartCard title="Payment methods" sub="Share of money collected" isLoading={q.isLoading} height={240}>
          <Chart
            type="donut"
            data={(data?.byMethod ?? []).map((m) => ({ x: m.label, amount: m.amount }))}
            series={[{ key: 'amount', label: 'Collected (MWK)' }]}
            height={240}
            emptyStateMessage="No payments recorded."
            ariaLabel="Fee payments by method"
          />
        </ChartCard>
        <ChartCard title="Payments by weekday" sub="Money collected on each day of the week" isLoading={q.isLoading} height={240}>
          <Chart
            type="bar"
            data={(data?.byWeekday ?? []).map((d) => ({ x: d.label, amount: d.amount }))}
            series={[{ key: 'amount', label: 'Collected (MWK)' }]}
            height={240}
            emptyStateMessage="No payments recorded."
            ariaLabel="Fee payments by weekday"
          />
        </ChartCard>
      </TwoUp>
      <ReportCard title="Method detail">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()} isEmpty={!data || data.byMethod.length === 0} emptyMessage="No payments recorded.">
          <ReportTable
            rows={data?.byMethod}
            rowKey={(r) => r.method}
            exportLabel="Payment methods"
            columns={[
              { key: 'method', label: 'Method', sortValue: (r) => r.label },
              { key: 'count', label: 'Payments', align: 'right', sortValue: (r) => r.count },
              { key: 'amount', label: 'Collected', align: 'right', sortValue: (r) => r.amount, cell: (r) => formatMwk(r.amount), exportValue: (r) => r.amount },
              { key: 'share', label: 'Share', align: 'right', sortValue: (r) => r.share, cell: (r) => formatPercent(r.share), exportValue: (r) => r.share },
            ]}
          />
        </QueryState>
      </ReportCard>
    </PanelStack>
  )
}

export function ProcurementTab() {
  const q = useProcurementPipeline(365)
  const data = q.data
  return (
    <PanelStack>
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={
          data
            ? [
                kpiTile('requisitions', 'Requisitions (12 months)', data.stages.find((s) => s.key === 'requisitions')?.count ?? null, 'count', 'Purchase requisitions raised in the last 12 months.'),
                kpiTile('approvalDays', 'Time to approve', data.avgApprovalDays, 'days', 'Average days from submission to approval.'),
                kpiTile('deliveryDays', 'Time to deliver', data.avgDeliveryDays, 'days', 'Average days from purchase order date to first goods receipt.'),
              ]
            : undefined
        }
      />
      <TwoUp>
        <ChartCard title="Procurement pipeline" sub="Requisitions that reached each stage (last 12 months)" isLoading={q.isLoading} height={260}>
          <Chart
            type="bar"
            data={(data?.stages ?? []).map((s) => ({ x: s.label, count: s.count }))}
            series={[{ key: 'count', label: 'Requisitions' }]}
            height={260}
            emptyStateMessage="No procurement activity in this window."
            ariaLabel="Procurement pipeline stages"
          />
        </ChartCard>
        <ReportCard title="Stage values">
          <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()} isEmpty={!data || data.stages.length === 0}>
            <ReportTable
              rows={data?.stages}
              rowKey={(r) => r.key}
              exportLabel="Procurement stages"
              columns={[
                { key: 'stage', label: 'Stage', sortValue: (r) => r.label },
                { key: 'count', label: 'Count', align: 'right', sortValue: (r) => r.count },
                { key: 'value', label: 'Value', align: 'right', sortValue: (r) => r.value, cell: (r) => formatMwkCompact(r.value), exportValue: (r) => r.value },
              ]}
            />
          </QueryState>
        </ReportCard>
      </TwoUp>
      <TwoUp>
        <ReportCard title="Requisitions by status" sub="Where work is sitting now">
          <ReportTable
            rows={data?.requisitionsByStatus}
            rowKey={(r) => r.status}
            exportLabel="Requisitions by status"
            columns={[
              { key: 'status', label: 'Status', sortValue: (r) => r.status },
              { key: 'count', label: 'Requisitions', align: 'right', sortValue: (r) => r.count },
            ]}
          />
        </ReportCard>
        <ReportCard title="Purchase orders by status">
          <ReportTable
            rows={data?.purchaseOrdersByStatus}
            rowKey={(r) => r.status}
            exportLabel="Purchase orders by status"
            columns={[
              { key: 'status', label: 'Status', sortValue: (r) => r.status },
              { key: 'count', label: 'Orders', align: 'right', sortValue: (r) => r.count },
              { key: 'value', label: 'Value', align: 'right', sortValue: (r) => r.value, cell: (r) => formatMwkCompact(r.value), exportValue: (r) => r.value },
            ]}
          />
        </ReportCard>
      </TwoUp>
    </PanelStack>
  )
}

export function StocktakeTab({ academicYear }: { academicYear: string }) {
  const q = useStocktakeVariance(academicYear)
  const data = q.data
  return (
    <PanelStack>
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={
          data
            ? [
                kpiTile('stocktakes', 'Stocktakes', data.stocktakes, 'count', 'Stocktakes recorded this academic year.'),
                kpiTile('variances', 'Variances', data.totalVariances, 'count', 'Lines where the counted quantity differed from the book quantity.'),
                kpiTile('unresolved', 'Unresolved', data.unresolved, 'count', 'Variances still open or under investigation.', data.unresolved > 0 ? 'watch' : 'healthy'),
                kpiTile('rate', 'Variance rate', data.varianceRate, 'percent', 'Variances ÷ lines counted.'),
              ]
            : undefined
        }
      />
      <ReportCard title="Variances by room" sub="Shortages and surpluses (units)">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()} isEmpty={!data || data.byRoom.length === 0} emptyMessage="No stocktake variances recorded.">
          <ReportTable<ApiVarianceRoomRow>
            rows={data?.byRoom}
            rowKey={(r) => `${r.building}|${r.room}`}
            exportLabel="Variances by room"
            columns={[
              { key: 'room', label: 'Room', sortValue: (r) => `${r.building} · ${r.room}` },
              { key: 'open', label: 'Open', align: 'right', sortValue: (r) => r.open },
              { key: 'resolved', label: 'Resolved', align: 'right', sortValue: (r) => r.resolved },
              { key: 'short', label: 'Short (units)', align: 'right', sortValue: (r) => r.shortageQty },
              { key: 'surplus', label: 'Surplus (units)', align: 'right', sortValue: (r) => r.surplusQty },
            ]}
          />
        </QueryState>
      </ReportCard>
      <ReportCard title="Variance items" sub="Unresolved first">
        <ReportTable<ApiVarianceItemRow>
          rows={data?.items}
          rowKey={(r) => r.varianceId}
          exportLabel="Variance items"
          columns={[
            { key: 'item', label: 'Item', sortValue: (r) => r.itemName },
            { key: 'room', label: 'Room', hideOnMobile: true, sortValue: (r) => `${r.building} · ${r.room}` },
            { key: 'type', label: 'Type', sortValue: (r) => r.varianceType },
            { key: 'qty', label: 'Qty', align: 'right', sortValue: (r) => r.quantity },
            { key: 'status', label: 'Status', sortValue: (r) => r.status },
            { key: 'stocktake', label: 'Stocktake', hideOnMobile: true, sortValue: (r) => r.stocktakeNumber },
          ]}
        />
      </ReportCard>
    </PanelStack>
  )
}
