'use client'

/**
 * Finance report tabs added by the reports overhaul: overview, receivables
 * aging and payment mix. The long-standing collection / outstanding / expenses / cash-flow /
 * payroll / scholarship panels stay in the page file untouched.
 */
import { Chart } from '@/components/shared/chart'
import { ChartCard } from '@/components/shared/ChartCard'
import {
  useFinanceAging, useFinanceAttention, useFinanceOverview, usePaymentMix,
} from '@/hooks/reporting/useFinanceReporting'
import type { ApiAgingBucket, ApiAgingDebtorRow } from '@shared/types/reporting-finance'
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
        sub={data?.debtorsTruncated ? 'Largest balances first. The list is capped, and the export has the same rows' : 'Largest balances first'}
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
            exportNote={data?.debtorsTruncated ? `Largest ${data?.debtors.length ?? 0} balances only` : undefined}
            emptyMessage="No invoices in this bucket."
            defaultSort={{ key: 'balance', direction: 'desc' }}
            columns={[
              { key: 'student', label: 'Student', sortValue: (r) => r.studentName },
              { key: 'invoice', label: 'Invoice', hideOnMobile: true, sortValue: (r) => r.invoiceNumber },
              { key: 'class', label: 'Class', hideOnMobile: true, sortValue: (r) => r.className ?? '' },
              { key: 'balance', label: 'Balance', align: 'right', sortValue: (r) => r.balance, cell: (r) => formatMwk(r.balance), exportValue: (r) => r.balance },
              { key: 'due', label: 'Due', hideOnMobile: true, sortValue: (r) => r.dueDate, cell: (r) => formatDate(r.dueDate), exportValue: (r) => formatDate(r.dueDate) },
              { key: 'days', label: 'Days overdue', align: 'right', sortValue: (r) => r.daysOverdue, cell: (r) => (r.daysOverdue > 0 ? formatDays(r.daysOverdue) : '-'), exportValue: (r) => r.daysOverdue },
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
                kpiTile('received', 'Cash received', data.totalCollected, 'mwk', 'Total of payments recorded against the selected term’s invoices, whenever they were paid. Equals fees applied to invoices plus any overpayment held as credit.'),
                kpiTile('applied', 'Applied to invoices', data.appliedToInvoices, 'mwk', 'The part of the cash received that reduced the term’s invoice balances (the figure behind the collection rate).'),
                kpiTile('credit', 'Held as credit', data.heldAsCredit, 'mwk', 'Overpayments not applied to an invoice; they are carried to the student’s next invoice.', data.heldAsCredit > 0 ? 'watch' : 'neutral'),
                kpiTile('count', 'Payments', data.paymentCount, 'count', 'Number of payments recorded.'),
                kpiTile('average', 'Average payment', data.averagePayment, 'mwk', 'Cash received ÷ number of payments.'),
              ]
            : undefined
        }
      />
      <TwoUp>
        <ChartCard title="Payment methods" sub="Share of cash received" isLoading={q.isLoading} height={240}>
          <Chart
            type="donut"
            data={(data?.byMethod ?? []).map((m) => ({ x: m.label, amount: m.amount }))}
            series={[{ key: 'amount', label: 'Received (MWK)' }]}
            height={240}
            emptyStateMessage="No payments recorded."
            ariaLabel="Fee payments by method"
          />
        </ChartCard>
        <ChartCard title="Payments by weekday" sub="Cash received on each day of the week" isLoading={q.isLoading} height={240}>
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
              { key: 'amount', label: 'Received', align: 'right', sortValue: (r) => r.amount, cell: (r) => formatMwk(r.amount), exportValue: (r) => r.amount },
              { key: 'share', label: 'Share', align: 'right', sortValue: (r) => r.share, cell: (r) => formatPercent(r.share), exportValue: (r) => r.share },
            ]}
          />
        </QueryState>
      </ReportCard>
    </PanelStack>
  )
}
