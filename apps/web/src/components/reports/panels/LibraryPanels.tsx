'use client'

/**
 * Library report tabs: the overview KPIs/findings (shown above the existing
 * overview panel), circulation (including overdue aging and the overdue list)
 * and fines (assessed vs collected, with the waived amount shown separately so
 * it is not mistaken for money collected), then digital-resource usage and
 * physical stock. A catalogue record is never presented as use: digital usage
 * comes only from recorded view events, and measures the application does not
 * record are named rather than shown as zero.
 */
import { Chart } from '@/components/shared/chart'
import { ChartCard } from '@/components/shared/ChartCard'
import {
  useLibraryAttention, useLibraryCirculation, useLibraryDigital, useLibraryFines, useLibraryOverview, useLibraryStock,
} from '@/hooks/reporting/useLibraryReporting'
import type {
  ApiDigitalGroupRow, ApiDigitalPendingRow, ApiDigitalUsageRow, ApiLibraryCountRow, ApiLibraryStockCategoryRow,
  ApiLibraryUnavailableRow, ApiOverdueRow,
} from '@shared/types/reporting-library'
import { MALAWI_SUBJECTS } from '@shared/constants/malawi'
import { formatCount, formatDate, formatDays, formatMwk } from '@/lib/reportFormat'
import { FilterBar, FilterDate, FilterSelect } from '../ui/ReportFilters'
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
              { key: 'class', label: 'Class', hideOnMobile: true, sortValue: (r) => r.className ?? '', cell: (r) => r.className ?? '-', exportValue: (r) => r.className ?? '' },
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
          kpiTile('waived', 'Waived', d.waivedAmount, 'mwk', 'Fines forgiven: not money collected.'),
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

// ─── Shared ───────────────────────────────────────────────────────────────────

const humanize = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ')

function link(path: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v)
  const qs = search.toString()
  return qs ? `${path}?${qs}` : path
}

const dateOrUndefined = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined)

// ─── Digital library ──────────────────────────────────────────────────────────

const DIGITAL_WINDOWS = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '180', label: 'Last 180 days' },
  { value: '365', label: 'Last 12 months' },
]
const TYPE_OPTIONS = [
  { value: 'EBOOK', label: 'eBook' },
  { value: 'PAST_PAPER', label: 'Past paper' },
  { value: 'REFERENCE', label: 'Reference' },
  { value: 'STUDY_GUIDE', label: 'Study guide' },
]
const FORM_OPTIONS = [1, 2, 3, 4].map((f) => ({ value: String(f), label: `Form ${f}` }))
const STATUS_OPTIONS = [
  { value: 'approved', label: 'Approved' },
  { value: 'pending', label: 'Awaiting approval' },
  { value: 'rejected', label: 'Rejected' },
]
const SUBJECT_OPTIONS = MALAWI_SUBJECTS.map((s) => ({ value: s, label: s }))

export function LibraryDigitalTab() {
  const [windowParam, setWindowParam] = useReportParam('days')
  const [type, setType] = useReportParam('type')
  const [form, setForm] = useReportParam('form')
  const [subject, setSubject] = useReportParam('subject')
  const [status, setStatus] = useReportParam('status')
  const [from, setFrom] = useReportParam('from')
  const [to, setTo] = useReportParam('to')
  const days = Number(windowParam) || 90
  const f = dateOrUndefined(from)
  const t = dateOrUndefined(to)

  const q = useLibraryDigital({ days, type, form, subject, status, from: f, to: t })
  const d = q.data
  const manage = (extra: Record<string, string | undefined> = {}) => link('/library', { tab: 'digital', ...extra })

  // Usage is only known from the day views started being recorded.
  const startsBeforeTracking = d && d.trackingSince !== null && new Date(d.from).getTime() < new Date(d.trackingSince).getTime()

  return (
    <PanelStack>
      <FilterBar ariaLabel="Digital library filters">
        <FilterSelect label="Window" value={String(days)} onChange={(v) => { setWindowParam(v); setFrom(''); setTo('') }} options={DIGITAL_WINDOWS} />
        <FilterDate label="From" value={from ?? ''} onChange={setFrom} max={to || undefined} />
        <FilterDate label="To" value={to ?? ''} onChange={setTo} min={from || undefined} />
        <FilterSelect label="Type" value={type ?? ''} onChange={setType} options={TYPE_OPTIONS} allLabel="All types" />
        <FilterSelect label="Form" value={form ?? ''} onChange={setForm} options={FORM_OPTIONS} allLabel="All forms" />
        <FilterSelect label="Subject" value={subject ?? ''} onChange={setSubject} options={SUBJECT_OPTIONS} allLabel="All subjects" />
        <FilterSelect label="Status" value={status ?? ''} onChange={setStatus} options={STATUS_OPTIONS} allLabel="All statuses" />
      </FilterBar>

      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          kpiTile('resources', 'Digital resources', d.catalogue.total, 'count', 'Resources in the digital library that match the filters. Having a resource available says nothing about whether it is used.', 'neutral', `${formatCount(d.catalogue.approved)} approved`, manage({ type, form, subject })),
          kpiTile('pending', 'Awaiting approval', d.catalogue.pending, 'count', 'Uploaded resources that no one has approved yet. Students cannot open them.', d.catalogue.pending > 0 ? 'watch' : 'healthy', d.catalogue.oldestPendingDays !== null ? `Oldest ${d.catalogue.oldestPendingDays} days` : undefined, manage({ status: 'pending' })),
          kpiTile('rejected', 'Rejected', d.catalogue.rejected, 'count', 'Uploaded resources that library staff turned down. They stay hidden from students and are kept with the reason given.', 'neutral', undefined, manage({ status: 'rejected' })),
          kpiTile('views', 'Views', d.usage.views, 'count', 'Times an approved resource was opened in the period. A person re-opening the same resource within ten minutes counts once.', 'neutral', `${formatCount(d.usage.uniqueViewers)} different people`),
          kpiTile('viewed', 'Resources used', d.usage.usageRate, 'percent', 'Approved resources opened at least once in the period ÷ approved resources.', 'neutral', `${formatCount(d.usage.resourcesViewed)} of ${formatCount(d.catalogue.approved)} approved`),
          kpiTile('unused', 'Approved, not opened', d.usage.approvedNotViewed, 'count', 'Approved resources with no recorded view in the period.', d.usage.approvedNotViewed > 0 && d.catalogue.approved > 0 ? 'watch' : 'neutral'),
        ] : undefined}
      />

      {d ? (
        <p role="status" className="rounded-lg border border-base bg-surface p-3 text-sm text-muted">
          {d.trackingSince === null
            ? 'No views have been recorded yet. A view is recorded each time someone opens an approved resource, so usage figures start from the first one.'
            : startsBeforeTracking
              ? `Views have been recorded since ${formatDate(d.trackingSince)}. Use before that date was not recorded, so this period understates earlier use.`
              : `Views have been recorded since ${formatDate(d.trackingSince)}.`}
          {d.viewsCapped ? ' There are more views than one report reads, so figures cover only the latest ones.' : ''}
        </p>
      ) : null}

      <TwoUp>
        <ChartCard title="Views over time" sub={d?.trendUnit === 'week' ? 'By week' : 'By day'} isLoading={q.isLoading} height={260}>
          <Chart
            type="bar"
            data={(d?.trend ?? []).map((p) => ({ x: p.label, views: p.views }))}
            series={[{ key: 'views', label: 'Views' }]}
            height={260}
            emptyStateMessage="No views in this period."
            ariaLabel="Digital resource views over time"
          />
        </ChartCard>
        <ReportCard title="By resource type" sub="Select a row to open those resources">
          <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
            <GroupTable rows={d?.byType} noun="Type" exportLabel="Digital resources by type" hrefFor={(r) => manage({ type: r.key })} />
          </QueryState>
        </ReportCard>
      </TwoUp>

      <TwoUp>
        <ReportCard title="By subject" sub="Most used subjects first">
          <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
            <GroupTable rows={d?.bySubject} noun="Subject" exportLabel="Digital resources by subject" hrefFor={(r) => (r.key ? manage({ subject: r.key }) : undefined)} />
          </QueryState>
        </ReportCard>
        <ReportCard title="By form">
          <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
            <GroupTable rows={d?.byForm} noun="Form" exportLabel="Digital resources by form" hrefFor={(r) => (r.key ? manage({ form: r.key }) : undefined)} />
          </QueryState>
        </ReportCard>
      </TwoUp>

      <TwoUp>
        <ReportCard title="Most used" sub="Approved resources opened most in the period">
          <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
            <UsageTable rows={d?.mostUsed} exportLabel="Most used digital resources" emptyMessage="No resource was opened in this period." manage={manage} />
          </QueryState>
        </ReportCard>
        <ReportCard title="Least used" sub="Approved resources opened least, never opened first">
          <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
            <UsageTable rows={d?.leastUsed} exportLabel="Least used digital resources" emptyMessage="No approved resources match these filters." manage={manage} />
          </QueryState>
        </ReportCard>
      </TwoUp>

      <ReportCard title="Awaiting approval" sub="Oldest first: open the library to approve" href={manage({ status: 'pending' })} hrefLabel="Open digital library">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable<ApiDigitalPendingRow>
            rows={d?.pending}
            rowKey={(r) => r.id}
            rowHref={(r) => manage({ resource: r.id })}
            exportLabel="Digital resources awaiting approval"
            emptyMessage="Nothing is waiting for approval."
            defaultSort={{ key: 'age', direction: 'desc' }}
            columns={[
              { key: 'title', label: 'Resource', sortValue: (r) => r.title },
              { key: 'type', label: 'Type', hideOnMobile: true, sortValue: (r) => r.type, cell: (r) => humanize(r.type), exportValue: (r) => r.type },
              { key: 'subject', label: 'Subject', hideOnMobile: true, sortValue: (r) => r.subject ?? '', cell: (r) => r.subject ?? '-', exportValue: (r) => r.subject ?? '' },
              { key: 'form', label: 'Form', hideOnMobile: true, sortValue: (r) => r.form ?? 0, cell: (r) => (r.form ? `Form ${r.form}` : 'All'), exportValue: (r) => r.form ?? '' },
              { key: 'submitted', label: 'Submitted', hideOnMobile: true, sortValue: (r) => r.submittedAt, cell: (r) => formatDate(r.submittedAt), exportValue: (r) => r.submittedAt },
              { key: 'age', label: 'Days waiting', align: 'right', sortValue: (r) => r.ageDays, cell: (r) => formatDays(r.ageDays), exportValue: (r) => r.ageDays },
            ]}
          />
        </QueryState>
      </ReportCard>
    </PanelStack>
  )
}

function GroupTable({
  rows, noun, exportLabel, hrefFor,
}: {
  rows: readonly ApiDigitalGroupRow[] | undefined
  noun: string
  exportLabel: string
  hrefFor: (r: ApiDigitalGroupRow) => string | undefined
}) {
  return (
    <ReportTable<ApiDigitalGroupRow>
      rows={rows}
      rowKey={(r) => r.key || r.label}
      rowHref={hrefFor}
      exportLabel={exportLabel}
      emptyMessage="No digital resources match these filters."
      columns={[
        { key: 'label', label: noun, sortValue: (r) => r.label },
        { key: 'resources', label: 'Resources', align: 'right', sortValue: (r) => r.resources, cell: (r) => formatCount(r.resources) },
        { key: 'pending', label: 'Awaiting approval', align: 'right', hideOnMobile: true, sortValue: (r) => r.pending, cell: (r) => formatCount(r.pending) },
        { key: 'rejected', label: 'Rejected', align: 'right', hideOnMobile: true, sortValue: (r) => r.rejected, cell: (r) => formatCount(r.rejected) },
        { key: 'viewed', label: 'Opened', align: 'right', hideOnMobile: true, sortValue: (r) => r.resourcesViewed, cell: (r) => formatCount(r.resourcesViewed) },
        { key: 'views', label: 'Views', align: 'right', sortValue: (r) => r.views, cell: (r) => formatCount(r.views) },
      ]}
    />
  )
}

function UsageTable({
  rows, exportLabel, emptyMessage, manage,
}: {
  rows: readonly ApiDigitalUsageRow[] | undefined
  exportLabel: string
  emptyMessage: string
  manage: (extra?: Record<string, string | undefined>) => string
}) {
  return (
    <ReportTable<ApiDigitalUsageRow>
      rows={rows}
      rowKey={(r) => r.id}
      rowHref={(r) => manage({ resource: r.id })}
      exportLabel={exportLabel}
      emptyMessage={emptyMessage}
      columns={[
        { key: 'title', label: 'Resource', sortValue: (r) => r.title },
        { key: 'type', label: 'Type', hideOnMobile: true, sortValue: (r) => r.type, cell: (r) => humanize(r.type), exportValue: (r) => r.type },
        { key: 'subject', label: 'Subject', hideOnMobile: true, sortValue: (r) => r.subject ?? '', cell: (r) => r.subject ?? '-', exportValue: (r) => r.subject ?? '' },
        { key: 'views', label: 'Views', align: 'right', sortValue: (r) => r.views, cell: (r) => formatCount(r.views) },
        { key: 'people', label: 'People', align: 'right', hideOnMobile: true, sortValue: (r) => r.uniqueViewers, cell: (r) => formatCount(r.uniqueViewers) },
        { key: 'last', label: 'Last opened', align: 'right', hideOnMobile: true, sortValue: (r) => r.lastViewedAt, cell: (r) => (r.lastViewedAt ? formatDate(r.lastViewedAt) : 'Never'), exportValue: (r) => r.lastViewedAt },
      ]}
    />
  )
}

// ─── Physical stock ───────────────────────────────────────────────────────────

const BOOK_CATEGORY_OPTIONS = ['TEXTBOOK', 'REFERENCE', 'FICTION', 'NONFICTION', 'SCIENCE', 'MATHEMATICS', 'HUMANITIES', 'PAST_PAPER', 'OTHER']
  .map((c) => ({ value: c, label: humanize(c) }))
const STOCK_WINDOWS = [
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '180', label: 'Last 180 days' },
  { value: '365', label: 'Last 12 months' },
]

export function LibraryStockTab() {
  const [category, setCategory] = useReportParam('category')
  const [windowParam, setWindowParam] = useReportParam('days')
  const days = Number(windowParam) || 90
  const q = useLibraryStock({ category, days })
  const d = q.data
  const catalog = (extra: Record<string, string | undefined> = {}) => link('/library', { tab: 'catalog', ...extra })
  const damagedOrLost = d ? d.condition.shelfDamagedCopies + d.condition.shelfLostCopies + d.condition.loansLost : null

  return (
    <PanelStack>
      <FilterBar ariaLabel="Physical stock filters">
        <FilterSelect label="Category" value={category ?? ''} onChange={setCategory} options={BOOK_CATEGORY_OPTIONS} allLabel="All categories" />
        <FilterSelect label="Returns and renewals in" value={String(days)} onChange={setWindowParam} options={STOCK_WINDOWS} />
      </FilterBar>

      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          kpiTile('copies', 'Copies owned', d.copies, 'count', 'Total copies across the titles that match the filter.', 'neutral', `${formatCount(d.titles)} titles`, catalog({ category })),
          kpiTile('available', 'On the shelf', d.availabilityRate, 'percent', 'Copies available to borrow now ÷ copies owned.', 'neutral', `${formatCount(d.available)} of ${formatCount(d.copies)} copies`),
          kpiTile('onLoan', 'On loan', d.onLoan, 'count', 'Copies currently borrowed and not returned (lost copies excluded).', 'neutral', d.overdueLoans > 0 ? `${formatCount(d.overdueLoans)} overdue` : undefined, '/library?tab=borrowings'),
          kpiTile('offShelf', 'Neither on shelf nor on loan', d.offShelf, 'count', 'Copies owned that are not available and not out on loan. For example, copies marked damaged.', d.offShelf > 0 ? 'watch' : 'neutral'),
          kpiTile('renewed', 'Loans renewed', d.renewals.loansRenewed, 'count', 'Loans whose latest renewal falls in the period. Only the latest renewal date is kept for each loan, so a loan is counted once, in the period it was last renewed. Renewals made before the count was stored were not recorded.', 'neutral', `${formatCount(d.renewals.renewalCount)} renewals in total on these loans`, '/library?tab=borrowings'),
          kpiTile('damaged', 'Damaged or lost', damagedOrLost, 'count', 'Copies marked damaged or lost from the catalogue, plus loans never returned. Repairs are not recorded, so this is a running total.', damagedOrLost ? 'watch' : 'neutral', d ? `${d.condition.shelfDamagedCopies} damaged · ${d.condition.shelfLostCopies + d.condition.loansLost} lost` : undefined),
        ] : undefined}
      />

      <TwoUp>
        <ReportCard title="By category" sub="Lowest availability first: select a row to open the catalogue">
          <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
            <ReportTable<ApiLibraryStockCategoryRow>
              rows={d?.byCategory}
              rowKey={(r) => r.category}
              rowHref={(r) => catalog({ category: r.category })}
              exportLabel="Library stock by category"
              emptyMessage="No books match this filter."
              columns={[
                { key: 'category', label: 'Category', sortValue: (r) => r.category, cell: (r) => humanize(r.category), exportValue: (r) => r.category },
                { key: 'titles', label: 'Titles', align: 'right', hideOnMobile: true, sortValue: (r) => r.titles, cell: (r) => formatCount(r.titles) },
                { key: 'copies', label: 'Copies', align: 'right', sortValue: (r) => r.copies, cell: (r) => formatCount(r.copies) },
                { key: 'available', label: 'Available', align: 'right', sortValue: (r) => r.available, cell: (r) => formatCount(r.available) },
                { key: 'onLoan', label: 'On loan', align: 'right', hideOnMobile: true, sortValue: (r) => r.onLoan, cell: (r) => formatCount(r.onLoan) },
                { key: 'off', label: 'Off shelf', align: 'right', hideOnMobile: true, sortValue: (r) => r.offShelf, cell: (r) => formatCount(r.offShelf) },
                { key: 'rate', label: 'On shelf %', align: 'right', sortValue: (r) => r.availabilityRate, cell: (r) => (r.availabilityRate === null ? 'N/A' : `${r.availabilityRate}%`), exportValue: (r) => r.availabilityRate },
              ]}
            />
          </QueryState>
        </ReportCard>
        <ChartCard title="Copies by category" sub="Available, on loan and off the shelf" isLoading={q.isLoading} height={260}>
          <Chart
            type="bar"
            data={(d?.byCategory ?? []).map((c) => ({ x: humanize(c.category), available: c.available, onLoan: c.onLoan, offShelf: c.offShelf }))}
            series={[{ key: 'available', label: 'Available' }, { key: 'onLoan', label: 'On loan' }, { key: 'offShelf', label: 'Off shelf' }]}
            height={260}
            emptyStateMessage="No books match this filter."
            ariaLabel="Copies by category and where they are"
          />
        </ChartCard>
      </TwoUp>

      <ReportCard title="No copy available" sub="Titles owned but with nothing on the shelf. Most overdue first">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable<ApiLibraryUnavailableRow>
            rows={d?.unavailable}
            rowKey={(r) => r.bookId}
            rowHref={(r) => catalog({ q: r.title })}
            exportLabel="Titles with no copy available"
            emptyMessage="Every title has a copy on the shelf."
            columns={[
              { key: 'title', label: 'Title', sortValue: (r) => r.title },
              { key: 'author', label: 'Author', hideOnMobile: true, sortValue: (r) => r.author },
              { key: 'category', label: 'Category', hideOnMobile: true, sortValue: (r) => r.category, cell: (r) => humanize(r.category), exportValue: (r) => r.category },
              { key: 'copies', label: 'Copies', align: 'right', sortValue: (r) => r.copies },
              { key: 'onLoan', label: 'On loan', align: 'right', sortValue: (r) => r.onLoan },
              { key: 'overdue', label: 'Overdue', align: 'right', sortValue: (r) => r.overdue },
            ]}
          />
        </QueryState>
      </ReportCard>

      <ReportCard title="Condition" sub="From catalogue condition changes and returned loans">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          {d ? (
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {([
                ['Marked damaged', d.condition.shelfDamagedCopies, 'Copies, from the catalogue'],
                ['Written off as lost', d.condition.shelfLostCopies, 'Copies, from the catalogue'],
                ['Loans never returned', d.condition.loansLost, 'Recorded as lost'],
                [`Returned damaged (${d.windowDays} days)`, d.condition.returnedDamaged, 'Loans'],
              ] as const).map(([label, v, hint]) => (
                <div key={label}>
                  <dt className="text-xs text-muted">{label}</dt>
                  <dd className="font-heading text-lg font-semibold text-brand-navy">{formatCount(v)}</dd>
                  <p className="text-xs text-muted">{hint}</p>
                </div>
              ))}
            </dl>
          ) : null}
        </QueryState>
      </ReportCard>
    </PanelStack>
  )
}
