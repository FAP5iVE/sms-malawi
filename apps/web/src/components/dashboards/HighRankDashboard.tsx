'use client'

/**
 * apps/web/src/components/dashboards/HighRankDashboard.tsx — the Headteacher's home screen.
 *
 * Information hierarchy (reading order, top to bottom):
 *   1. School at a glance  four headline KPIs: student population, attendance,
 *                          academic performance, fee collection (each with its
 *                          definition and the period it describes)
 *   2. Trends              two charts: academic performance by term, weekly attendance
 *   3. Attention queue     what needs action, most urgent first, with owner, next
 *                          step and age; plus the approvals waiting on this role
 *   4. Details by area     Academic / Students / Finance / Operations as collapsible
 *                          sections. Every figure that used to be its own card is here,
 *                          as a compact list or chart, and loads only when opened
 *   5. Quick actions
 *   6. Detailed reports    links to the full reports (filters, tables, exports)
 *
 * Every number is a KPI the server computed for the Reports page (executive
 * overview), so a figure here and the report it links to cannot disagree. A
 * request that fails is shown as a failure with a retry, never as zero.
 */
import {
  BarChart3,
  Banknote,
  ClipboardCheck,
  GraduationCap,
  Megaphone,
  Users,
} from 'lucide-react'
import Link from 'next/link'
import { useMemo } from 'react'
import { QuickActions } from '@/components/shared/QuickActions'
import type { QuickAction } from '@/components/shared/QuickActions'
import { PendingActionsPanel } from '@/components/shared/PendingActionsPanel'
import { Chart } from '@/components/shared/chart'
import type { ChartDataPoint } from '@/components/shared/chart'
import { QueryState } from '@/components/reports/ui/ReportStates'
import type { QueryLike } from '@/components/reports/panels/common'
import type { ApiExecutiveGroup, ApiExecutiveOverview } from '@shared/types/reporting-executive'
import { useExecutiveOverview, useExecutiveAttention } from '@/hooks/reporting/useExecutiveReporting'
import { useAttendanceReport } from '@/hooks/reporting/useAttendanceReporting'
import {
  useApplicationsFunnel,
  useClassComparison,
  useEnrollmentTrend,
  useHRStaffByDepartment,
  useLibraryBorrowingTrend,
  useSchoolPerformanceTrend,
} from '@/hooks/useAnalytics'
import { useViewingPeriod } from '@/hooks/useViewingPeriod'
import { recentAcademicYears } from '@/lib/academicYears'
import { statusHeadline } from '@/lib/dashboardTiers'
import { DashboardAttention } from './DashboardReport'
import {
  CompactKpiList,
  DashboardSection,
  PrimaryKpis,
  ReportLinks,
  TrendCard,
} from './DashboardSections'
import type { ReportLink } from './DashboardSections'

const PRIMARY_KEYS = new Set(['active', 'attendanceRate', 'schoolPassRate', 'collectionRate'])

/** Common tasks only; everything else is one tap away in the sidebar. */
const QUICK_ACTIONS: QuickAction[] = [
  { label: 'Approvals', href: '/approvals', icon: ClipboardCheck, text: 'text-brand-navy' },
  { label: 'Make announcement', href: '/announcements', icon: Megaphone, text: 'text-brand-coral' },
  { label: 'School reports', href: '/reports', icon: BarChart3, text: 'text-brand-teal' },
  { label: 'Students', href: '/students', icon: Users, text: 'text-blue-600' },
  { label: 'Exam results', href: '/exams', icon: GraduationCap, text: 'text-purple-600' },
  { label: 'Finances', href: '/finances', icon: Banknote, text: 'text-emerald-600' },
]

const REPORT_LINKS: ReportLink[] = [
  { label: 'School overview', href: '/reports?tab=overview', description: 'Every headline figure with its definition' },
  { label: 'Academic performance', href: '/reports?tab=performance', description: 'Pass rate and average by term, by class' },
  { label: 'Attendance', href: '/reports?tab=attendance', description: 'By class and week, chronic absentees' },
  { label: 'Fees and receivables', href: '/reports?tab=finance', description: 'Collection, outstanding and ageing' },
  { label: 'Examinations', href: '/reports?tab=completion', description: 'Marks completion and results workflow' },
  { label: 'Enrollment and admissions', href: '/reports?tab=enrollment', description: 'Population, applications, conversion' },
]

/** Short "year T#" label that stays readable on a phone: "T2 25/26". */
function termLabel(academicYear: string, term: number): string {
  const [from, to] = academicYear.split('/')
  const yy = (v: string | undefined) => (v ?? '').slice(-2)
  return from && to ? `T${term} ${yy(from)}/${yy(to)}` : `T${term} ${academicYear}`
}

// ─── Trends ─────────────────────────────────────────────────────────────────

function PerformanceTrend({ academicYear }: { academicYear: string | undefined }) {
  const years = useMemo(() => (academicYear ? recentAcademicYears(academicYear, 2) : []), [academicYear])
  const q = useSchoolPerformanceTrend(years)
  // A term with no computed results is left out, not plotted as 0.
  const data: ChartDataPoint[] = (q.data ?? [])
    .filter((p) => p.total > 0)
    .map((p) => ({ x: termLabel(p.academicYear, p.term), passRate: p.passRate, average: p.average }))
  return (
    <TrendCard
      title="Academic performance"
      sub="Pass rate and average by term, last three years"
      isLoading={!academicYear || q.isLoading}
      isError={q.isError}
      onRetry={() => void q.refetch()}
    >
      <Chart
        type="line"
        data={data}
        series={[
          { key: 'passRate', label: 'Pass rate %' },
          { key: 'average', label: 'Average %' },
        ]}
        height={200}
        emptyStateMessage="No term results have been computed yet."
        ariaLabel="School pass rate and average score for each term over the last three years"
      />
    </TrendCard>
  )
}

function AttendanceTrend({ academicYear, term }: { academicYear: string | undefined; term: number | null | undefined }) {
  const q = useAttendanceReport({ academicYear, term: term ?? undefined })
  // A week with nothing recorded has a null rate and is left out, not plotted as 0.
  const data: ChartDataPoint[] = (q.data?.byWeek ?? []).flatMap((w) => (w.rate === null ? [] : [{ x: w.label, rate: w.rate }]))
  return (
    <TrendCard
      title="Attendance"
      sub="Weekly attendance rate this term"
      isLoading={!academicYear || q.isLoading}
      isError={q.isError}
      onRetry={() => void q.refetch()}
    >
      <Chart
        type="line"
        data={data}
        series={[{ key: 'rate', label: 'Attendance %' }]}
        height={200}
        emptyStateMessage="No attendance has been recorded this term."
        ariaLabel="Weekly school attendance rate for the current term"
      />
    </TrendCard>
  )
}

// ─── Secondary sections ─────────────────────────────────────────────────────

const groupOf = (overview: QueryLike<ApiExecutiveOverview>, key: ApiExecutiveGroup['key']) =>
  overview.data?.groups.find((g) => g.key === key)

/** The group's KPIs that are not already shown as headlines. Loading and failure are shown as such. */
function GroupKpis({ overview, groupKey }: { overview: QueryLike<ApiExecutiveOverview>; groupKey: ApiExecutiveGroup['key'] }) {
  const kpis = (groupOf(overview, groupKey)?.kpis ?? []).filter((k) => !PRIMARY_KEYS.has(k.key))
  return (
    <QueryState isLoading={overview.isLoading} isError={overview.isError} onRetry={() => void overview.refetch()} loadingHeight={80}>
      {kpis.length > 0 ? (
        <CompactKpiList kpis={kpis} />
      ) : (
        <p className="text-sm text-muted">No further figures for this area. The headline figures are shown above.</p>
      )}
    </QueryState>
  )
}

function headlineFor(overview: QueryLike<ApiExecutiveOverview>, key: ApiExecutiveGroup['key']): string | undefined {
  const g = groupOf(overview, key)
  return g ? statusHeadline(g.kpis) || undefined : undefined
}

function ClassComparison({ academicYear, term }: { academicYear: string | undefined; term: number | null | undefined }) {
  const q = useClassComparison(academicYear ?? '', term ?? 0)
  // A class with no computed results has a null average and is left out, not plotted as 0.
  const data: ChartDataPoint[] = (q.data ?? []).flatMap((c) => (c.average === null ? [] : [{ x: c.className, average: c.average }]))
  return (
    <TrendCard title="Class performance" sub="Average score by class, this term" isLoading={!academicYear || q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
      <Chart
        type="bar"
        data={data}
        series={[{ key: 'average', label: 'Average score' }]}
        height={200}
        emptyStateMessage="No computed results for this term yet."
        ariaLabel="Average exam score by class for the current term"
      />
    </TrendCard>
  )
}

function EnrollmentTrend() {
  const q = useEnrollmentTrend(12)
  const data: ChartDataPoint[] = (q.data ?? []).map((e) => ({ x: e.month, enrolled: e.enrolled, departed: e.departed }))
  return (
    <TrendCard title="Student population" sub="New and outgoing students, last 12 months" isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
      <Chart
        type="line"
        data={data}
        series={[
          { key: 'enrolled', label: 'Enrolled', color: 'var(--color-brand-teal, #0e8a6a)' },
          { key: 'departed', label: 'Departed', color: 'var(--color-brand-coral, #dc4f3a)' },
        ]}
        height={200}
        emptyStateMessage="No enrollment movement recorded yet."
        ariaLabel="Student population trend over the last 12 months, showing newly enrolled versus departed students"
      />
    </TrendCard>
  )
}

function AdmissionsFunnel() {
  const q = useApplicationsFunnel()
  const data: ChartDataPoint[] = (q.data ?? []).map((f) => ({ x: f.stage, count: f.count }))
  return (
    <TrendCard title="Admissions funnel" sub="Applications by stage" isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()} height={180}>
      <Chart type="bar" data={data} series={[{ key: 'count', label: 'Applications' }]} height={180} emptyStateMessage="No applications recorded yet." ariaLabel="Number of applications at each admissions stage" />
    </TrendCard>
  )
}

function StaffByDepartment() {
  const q = useHRStaffByDepartment()
  const data: ChartDataPoint[] = (q.data ?? []).map((d) => ({ x: d.category, staff: d.value }))
  return (
    <TrendCard title="Staff by department" sub="Active staff headcount" isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()} height={180}>
      <Chart type="bar" data={data} series={[{ key: 'staff', label: 'Staff' }]} height={180} emptyStateMessage="No staff records yet." ariaLabel="Active staff headcount by department" />
    </TrendCard>
  )
}

function LibraryBorrowing() {
  const q = useLibraryBorrowingTrend(12)
  const data: ChartDataPoint[] = (q.data ?? []).map((p) => ({ x: p.label, value: p.value }))
  return (
    <TrendCard title="Library borrowing" sub="Books issued, last 12 weeks" isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()} height={180}>
      <Chart type="line" data={data} series={[{ key: 'value', label: 'Books issued' }]} height={180} emptyStateMessage="No borrowing activity recorded yet." ariaLabel="Weekly books issued over the last 12 weeks" />
    </TrendCard>
  )
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

export function HighRankDashboard() {
  const { academicYear, term } = useViewingPeriod()
  const period = { academicYear: academicYear ?? '', term: term ?? undefined }
  const executive = useExecutiveOverview(period)
  const attention = useExecutiveAttention(period)

  const urgent = (attention.data ?? []).filter((i) => i.severity === 'critical').length

  return (
    <div className="space-y-4 md:space-y-6">
      <PrimaryKpis overview={executive} academicYear={academicYear} term={term} />

      {urgent > 0 ? (
        <Link
          href="#needs-attention"
          className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-brand-coral/30 bg-brand-coral/5 px-3 py-2 text-sm font-medium text-brand-navy focus:outline-none focus:ring-2 focus:ring-brand-coral/30"
        >
          <span>
            {urgent} urgent {urgent === 1 ? 'issue needs' : 'issues need'} attention
          </span>
          <span className="text-xs text-brand-coral">See the queue</span>
        </Link>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 md:gap-4">
        <PerformanceTrend academicYear={academicYear} />
        <AttendanceTrend academicYear={academicYear} term={term} />
      </div>

      <div id="needs-attention" className="grid scroll-mt-4 gap-3 lg:grid-cols-2 md:gap-4">
        <DashboardAttention query={attention} title="Needs leadership attention" limit={5} />
        <PendingActionsPanel compact title="Waiting for your approval" />
      </div>

      <section aria-label="Details by area" className="space-y-2">
        <h2 className="font-heading text-xs font-semibold uppercase tracking-wide text-muted">Details by area</h2>
        <DashboardSection title="Academic" headline={headlineFor(executive, 'academic')} href="/reports?tab=performance" hrefLabel="Open performance report">
          <GroupKpis overview={executive} groupKey="academic" />
          <ClassComparison academicYear={academicYear} term={term} />
        </DashboardSection>
        <DashboardSection title="Students" headline={headlineFor(executive, 'students')} href="/reports?tab=enrollment" hrefLabel="Open enrollment report">
          <GroupKpis overview={executive} groupKey="students" />
          <div className="grid gap-3 md:grid-cols-2">
            <EnrollmentTrend />
            <AdmissionsFunnel />
          </div>
        </DashboardSection>
        <DashboardSection title="Finance" headline={headlineFor(executive, 'finance')} href="/reports?tab=finance" hrefLabel="Open finance report">
          <GroupKpis overview={executive} groupKey="finance" />
        </DashboardSection>
        <DashboardSection title="People & operations" headline={headlineFor(executive, 'operations')} href="/reports?tab=workforce" hrefLabel="Open HR report">
          <GroupKpis overview={executive} groupKey="operations" />
          <div className="grid gap-3 md:grid-cols-2">
            <StaffByDepartment />
            <LibraryBorrowing />
          </div>
        </DashboardSection>
      </section>

      <QuickActions actions={QUICK_ACTIONS} compact />
      <ReportLinks links={REPORT_LINKS} />
    </div>
  )
}
