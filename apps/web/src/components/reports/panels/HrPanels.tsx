'use client'

/**
 * HR report tabs: overview, workforce, leave (days-based), contracts, staff
 * loans and performance reviews. Leave is measured in DAYS — a one-day request
 * and a thirty-day request are not the same amount of absence — and spread
 * across the months it actually covers.
 */
import { Chart } from '@/components/shared/chart'
import { ChartCard } from '@/components/shared/ChartCard'
import {
  useHrAttention, useHrContracts, useHrLeave, useHrLoans, useHrOverview, useHrPromotions, useHrReviews,
  useHrWorkforce,
} from '@/hooks/reporting/useHrReporting'
import type { ApiContractRow, ApiHrCountRow } from '@shared/types/reporting-hr'
import { formatDate, formatDays, formatMwk, formatPercent } from '@/lib/reportFormat'
import { ReportCard } from '../ui/ReportCard'
import { ReportTable } from '../ui/ReportTable'
import { QueryState } from '../ui/ReportStates'
import { ReportKpiStrip } from '../ui/ReportKpiStrip'
import { kpiTile } from './kpiHelpers'
import { AttentionCard, OverviewSection, PanelStack, TwoUp } from './common'

const counts = (rows: readonly ApiHrCountRow[] | undefined) => (rows ?? []).map((r) => ({ x: r.label, count: r.count }))

export function HrOverviewTab({ academicYear }: { academicYear: string }) {
  const overview = useHrOverview(academicYear)
  const attention = useHrAttention(academicYear)
  return (
    <PanelStack>
      <OverviewSection query={overview} label="HR overview" placeholders={8} />
      <AttentionCard query={attention} title="HR attention queue" />
    </PanelStack>
  )
}

export function HrWorkforceTab() {
  const q = useHrWorkforce()
  const d = q.data
  return (
    <PanelStack>
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          kpiTile('headcount', 'Active staff', d.headcount, 'count', 'Staff who are active or on leave (terminated and suspended excluded).'),
          kpiTile('sexRecorded', 'Sex recorded', d.sexRecordedShare, 'percent', 'Share of staff whose sex is recorded — the gender split below is only as complete as this.', d.sexRecordedShare !== null && d.sexRecordedShare < 90 ? 'watch' : 'neutral'),
        ] : undefined}
      />
      <TwoUp>
        <ChartCard title="Staff by department" isLoading={q.isLoading} height={260}>
          <Chart type="bar" data={counts(d?.byDepartment)} series={[{ key: 'count', label: 'Staff' }]} height={260} emptyStateMessage="No staff records." ariaLabel="Staff headcount by department" />
        </ChartCard>
        <ChartCard title="Staff by role" isLoading={q.isLoading} height={260}>
          <Chart type="bar" data={counts(d?.byRole)} series={[{ key: 'count', label: 'Staff' }]} height={260} emptyStateMessage="No staff records." ariaLabel="Staff headcount by role" />
        </ChartCard>
        <ChartCard title="Employment type" isLoading={q.isLoading} height={240}>
          <Chart type="donut" data={counts(d?.byEmploymentType)} series={[{ key: 'count', label: 'Staff' }]} height={240} emptyStateMessage="No staff records." ariaLabel="Staff by employment type" />
        </ChartCard>
        <ChartCard title="Length of service" isLoading={q.isLoading} height={240}>
          <Chart type="bar" data={counts(d?.byTenure)} series={[{ key: 'count', label: 'Staff' }]} height={240} emptyStateMessage="No staff records." ariaLabel="Staff by length of service" />
        </ChartCard>
        <ChartCard title="Staff by sex" sub="Only staff with a recorded value" isLoading={q.isLoading} height={240}>
          <Chart type="donut" data={counts(d?.bySex)} series={[{ key: 'count', label: 'Staff' }]} height={240} emptyStateMessage="No sex data recorded." ariaLabel="Staff by sex" />
        </ChartCard>
        <ReportCard title="Status breakdown">
          <ReportTable rows={d?.byStatus} rowKey={(r) => r.label} exportLabel="Staff by status" columns={[
            { key: 'status', label: 'Status', sortValue: (r) => r.label },
            { key: 'count', label: 'Staff', align: 'right', sortValue: (r) => r.count },
          ]} />
        </ReportCard>
      </TwoUp>
    </PanelStack>
  )
}

export function HrLeaveTab() {
  const year = new Date().getFullYear()
  const q = useHrLeave(year)
  const d = q.data
  return (
    <PanelStack>
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          kpiTile('days', 'Leave days taken', d.approvedDays, 'days', `Approved leave days falling in ${d.year}, counted day by day.`, 'neutral', `${d.approvedRequests} approved requests`),
          kpiTile('pending', 'Awaiting decision', d.pendingRequests, 'count', 'Leave requests not yet approved or rejected.', d.pendingRequests > 0 ? 'watch' : 'healthy', `${d.pendingDays} days requested`),
          kpiTile('decision', 'Time to decide', d.avgDecisionDays, 'days', 'Average days from request to decision.'),
          kpiTile('today', 'On leave today', d.onLeaveToday.length, 'count', 'Staff whose approved leave covers today.'),
        ] : undefined}
      />
      <TwoUp>
        <ChartCard title={`Leave days by month — ${year}`} sub="Each leave spell is spread across the months it covers" isLoading={q.isLoading} height={240}>
          <Chart type="bar" data={(d?.byMonth ?? []).map((m) => ({ x: m.label, days: m.days }))} series={[{ key: 'days', label: 'Days' }]} height={240} emptyStateMessage="No leave recorded this year." ariaLabel="Leave days by month" />
        </ChartCard>
        <ChartCard title="Leave days by type" isLoading={q.isLoading} height={240}>
          <Chart type="bar" data={(d?.byType ?? []).map((t) => ({ x: t.leaveType, days: t.days }))} series={[{ key: 'days', label: 'Days' }]} height={240} emptyStateMessage="No leave recorded this year." ariaLabel="Leave days by type" />
        </ChartCard>
        <ChartCard title="Leave days by department" isLoading={q.isLoading} height={240}>
          <Chart type="bar" data={(d?.byDepartment ?? []).map((t) => ({ x: t.department, days: t.days }))} series={[{ key: 'days', label: 'Days' }]} height={240} emptyStateMessage="No leave recorded this year." ariaLabel="Leave days by department" />
        </ChartCard>
        <ReportCard title="On leave today">
          <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
            <ReportTable rows={d?.onLeaveToday} rowKey={(r) => r.staffId} exportLabel="On leave today" emptyMessage="Nobody is on approved leave today." columns={[
              { key: 'name', label: 'Staff', sortValue: (r) => r.name },
              { key: 'dept', label: 'Department', hideOnMobile: true, sortValue: (r) => r.department },
              { key: 'type', label: 'Type', sortValue: (r) => r.leaveType },
              { key: 'end', label: 'Back after', sortValue: (r) => r.endDate, cell: (r) => formatDate(r.endDate), exportValue: (r) => formatDate(r.endDate) },
            ]} />
          </QueryState>
        </ReportCard>
      </TwoUp>
    </PanelStack>
  )
}

const WINDOW_TONE: Record<string, 'critical' | 'watch' | 'neutral'> = { expired: 'critical', d30: 'critical', d60: 'watch', d90: 'neutral' }

export function HrContractsTab() {
  const q = useHrContracts()
  const d = q.data
  return (
    <PanelStack>
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          ...d.windows.map((w) => kpiTile(w.key, w.label, w.count, 'count', w.key === 'expired' ? 'Active staff whose contract end date has already passed.' : `Contracts ending ${w.label.toLowerCase()}.`, w.count > 0 ? (WINDOW_TONE[w.key] ?? 'neutral') : 'healthy')),
          kpiTile('none', 'No end date recorded', d.noExpiryRecorded, 'count', 'Active staff with no contract expiry on file — they cannot be tracked.'),
        ] : undefined}
      />
      <ReportCard title="Contracts to act on" sub={d ? `Expired and expiring within ${d.lookaheadDays} days` : undefined}>
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable<ApiContractRow> rows={d?.rows} rowKey={(r) => r.staffId} exportLabel="Contract expiries" emptyMessage="No contracts are expiring in the window." defaultSort={{ key: 'days', direction: 'asc' }} columns={[
            { key: 'name', label: 'Staff', sortValue: (r) => r.name },
            { key: 'no', label: 'Employee no.', hideOnMobile: true, sortValue: (r) => r.employeeNo },
            { key: 'dept', label: 'Department', hideOnMobile: true, sortValue: (r) => r.department },
            { key: 'title', label: 'Job title', hideOnMobile: true, sortValue: (r) => r.jobTitle },
            { key: 'type', label: 'Type', sortValue: (r) => r.employmentType },
            { key: 'expiry', label: 'Ends', sortValue: (r) => r.contractExpiry, cell: (r) => formatDate(r.contractExpiry), exportValue: (r) => formatDate(r.contractExpiry) },
            { key: 'days', label: 'Days left', align: 'right', sortValue: (r) => r.daysToExpiry, cell: (r) => (r.daysToExpiry < 0 ? `Expired ${Math.abs(r.daysToExpiry)} d ago` : formatDays(r.daysToExpiry)), exportValue: (r) => r.daysToExpiry },
          ]} />
        </QueryState>
      </ReportCard>
    </PanelStack>
  )
}

export function HrLoansTab() {
  const q = useHrLoans()
  const d = q.data
  return (
    <PanelStack>
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          kpiTile('active', 'Active loans', d.activeCount, 'count', 'Staff loans currently being repaid.'),
          kpiTile('balance', 'Outstanding balance', d.outstandingBalance, 'mwk', 'Total still to be repaid on active loans.'),
          kpiTile('deductions', 'Monthly deductions', d.monthlyDeductions, 'mwk', 'Total payroll deductions for active loans each month.'),
          kpiTile('pending', 'Awaiting approval', d.pendingApprovals, 'count', 'Loan applications not yet decided.', d.pendingApprovals > 0 ? 'watch' : 'healthy', d.pendingApprovals > 0 ? formatMwk(d.pendingAmount) : undefined),
        ] : undefined}
      />
      <ReportCard title="Loan book" sub="Staff with active or pending loans">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable rows={d?.rows} rowKey={(r) => r.loanId} exportLabel="Staff loans" emptyMessage="No staff loans." columns={[
            { key: 'name', label: 'Staff', sortValue: (r) => r.name },
            { key: 'status', label: 'Status', sortValue: (r) => r.status },
            { key: 'amount', label: 'Amount', align: 'right', sortValue: (r) => r.amount, cell: (r) => formatMwk(r.amount), exportValue: (r) => r.amount },
            { key: 'balance', label: 'Balance', align: 'right', sortValue: (r) => r.balance, cell: (r) => formatMwk(r.balance), exportValue: (r) => r.balance },
            { key: 'deduction', label: 'Monthly', align: 'right', hideOnMobile: true, sortValue: (r) => r.monthlyDeduction, cell: (r) => formatMwk(r.monthlyDeduction), exportValue: (r) => r.monthlyDeduction },
            { key: 'repaid', label: 'Repaid', align: 'right', sortValue: (r) => r.repaidShare, cell: (r) => formatPercent(r.repaidShare), exportValue: (r) => r.repaidShare },
          ]} />
        </QueryState>
      </ReportCard>
    </PanelStack>
  )
}

export function HrReviewsTab({ academicYear }: { academicYear: string }) {
  const q = useHrReviews(academicYear)
  const promos = useHrPromotions()
  const d = q.data
  const p = promos.data
  return (
    <PanelStack>
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          kpiTile('completion', 'Reviews completed', d.completionRate, 'percent', `Active staff with a performance review recorded for ${d.academicYear}.`, d.completionRate !== null && d.completionRate < 60 ? 'watch' : 'neutral', `${d.reviewed} of ${d.activeStaff}`),
          kpiTile('score', 'Average score', d.averageScore, 'score', 'Mean score across completed reviews.'),
          ...(p ? [
            kpiTile('promoPending', 'Promotions pending', p.pending, 'count', 'Promotion requests awaiting a decision.', p.pending > 0 ? 'watch' : 'healthy'),
            kpiTile('promoApproved', 'Promotions approved', p.approvedThisYear, 'count', 'Promotions approved this calendar year.'),
          ] : []),
        ] : undefined}
      />
      <TwoUp>
        <ChartCard title="Review status" isLoading={q.isLoading} height={240}>
          <Chart type="donut" data={counts(d?.byStatus)} series={[{ key: 'count', label: 'Reviews' }]} height={240} emptyStateMessage="No reviews recorded." ariaLabel="Performance reviews by status" />
        </ChartCard>
        <ChartCard title="Score distribution" isLoading={q.isLoading} height={240}>
          <Chart type="bar" data={counts(d?.scoreBands)} series={[{ key: 'count', label: 'Reviews' }]} height={240} emptyStateMessage="No scored reviews." ariaLabel="Performance review scores by band" />
        </ChartCard>
      </TwoUp>
      <ReportCard title="Recent promotions">
        <QueryState isLoading={promos.isLoading} isError={promos.isError} onRetry={() => void promos.refetch()}>
          <ReportTable rows={p?.recent} rowKey={(r) => r.id} exportLabel="Promotions" emptyMessage="No promotion requests." columns={[
            { key: 'name', label: 'Staff', sortValue: (r) => r.name },
            { key: 'from', label: 'From', hideOnMobile: true, sortValue: (r) => r.fromJobTitle },
            { key: 'to', label: 'To', sortValue: (r) => r.toJobTitle },
            { key: 'date', label: 'Effective', sortValue: (r) => r.effectiveDate, cell: (r) => formatDate(r.effectiveDate), exportValue: (r) => formatDate(r.effectiveDate) },
            { key: 'status', label: 'Status', sortValue: (r) => r.status },
          ]} />
        </QueryState>
      </ReportCard>
    </PanelStack>
  )
}
