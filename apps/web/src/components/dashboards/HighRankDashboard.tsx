'use client'

/**
 * apps/web/src/components/dashboards/HighRankDashboard.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE
 * [PURPOSE]: All four stat cards were permanent '—' placeholders. Wired to
 *   the real endpoints this executive role already holds permissions for:
 *   Total Students ← useStudents({status:'ACTIVE'}).total; Total Staff ←
 *   useStaffDirectory() (GET /hr, admin/hr/high_rank); Fee Collection ←
 *   useFinanceSummary(year, term).collectionPercent
 *   (finance.viewSummary); School Pass Rate ← the current year's latest
 *   useSchoolPerformanceTrend point (report.viewSchoolPerformance). Year/
 *   term come from useCurrentAcademicPeriod() — never hardcoded.
 *
 * [PRODUCTION FIX] "Important Reports" was a literal, permanent
 *   PlaceholderWidget with no data fetch at all — not a stuck loading
 *   state, a dead component. Every sibling dashboard (Admin, Finance, HR,
 *   Library, Student) had already been converted to real ChartCard/live
 *   data; High Rank's was the one left behind. Replaced with:
 *     (1) PendingActionsPanel (compact) — the student/class approval queue
 *         that was fully built end-to-end (backend, hooks, UI) but had no
 *         page anywhere in the app to render on (see the new /approvals
 *         page and its PAGE_ACCESS/NAV_ITEMS entries).
 *     (2) Class Performance Comparison — useClassComparison, a real
 *         analytics endpoint already serving /reports' high_rank tab but
 *         absent from this dashboard, broadening coverage beyond
 *         students/staff/fees/pass-rate into per-class academic oversight.
 *     (3) A school attendance KPI strip — useAttendanceSummary, likewise
 *         already live for /reports but not represented here at all.
 *   Also added an "Approvals" quick action pointing at the new page.
 * [DEPENDS ON]: W/hooks/useStudents.ts, W/hooks/useHR.ts,
 *   W/hooks/useFinances.ts, W/hooks/useAnalytics.ts,
 *   W/hooks/useSettings.ts (useCurrentAcademicPeriod),
 *   W/components/shared/PendingActionsPanel.tsx,
 *   W/components/shared/StatCard.tsx (statValue)
 */

import {
  Users,
  Briefcase,
  Banknote,
  GraduationCap,
  TrendingUp,
  BarChart3,
  ClipboardList,
  ClipboardCheck,
  Settings,
  Megaphone,
} from 'lucide-react'
import { StatCard, StatCardGrid, statValue } from '@/components/shared/StatCard'
import { QuickActions } from '@/components/shared/QuickActions'
import type { QuickAction } from '@/components/shared/QuickActions'
import { PendingActionsPanel } from '@/components/shared/PendingActionsPanel'
import { ChartCard } from '@/components/shared/ChartCard'
import { Chart } from '@/components/shared/chart'
import type { ChartDataPoint } from '@/components/shared/chart'
import { FeeCollectionRadial } from '@/components/finances/FeeCollectionRadial'
import { useStudents } from '@/hooks/useStudents'
import { useStaffDirectory } from '@/hooks/useHR'
import { useFinanceSummary } from '@/hooks/useFinances'
import {
  useSchoolPerformanceTrend,
  useEnrollmentTrend,
  useClassComparison,
  useAttendanceSummary,
  useApplicationsFunnel,
  useHRStaffByDepartment,
  useLibraryBorrowingTrend,
} from '@/hooks/useAnalytics'
import { useCurrentAcademicPeriod } from '@/hooks/useSettings'
import type { ApiStaffProfile } from '@shared/types/api'

const QUICK_ACTIONS: QuickAction[] = [
  {
    // [PRODUCTION FIX] The approval queue this role is one of only two
    // reviewer roles for (PENDING_ACTION_REVIEWER_ROLES) had no page
    // anywhere in the app until now — see /approvals.
    label: 'Approvals',
    href: '/approvals',
    icon: ClipboardCheck,
    color: 'bg-brand-navy/8',
    text: 'text-brand-navy',
  },
  {
    // [PRODUCTION FIX 2026-07-28] High Rank already held announcement.create
    // in the permission matrix and the /announcements page's canCreate gate
    // (role !== 'admin') already allowed it — but nothing on this dashboard
    // ever pointed there, so the only path was knowing to find it in the
    // sidebar. Approving publications and authoring announcements are
    // separate abilities; this makes the second one actually discoverable.
    label: 'Make Announcement',
    href: '/announcements',
    icon: Megaphone,
    color: 'bg-brand-coral/10',
    text: 'text-brand-coral',
  },
  {
    label: 'School Reports',
    href: '/reports',
    icon: BarChart3,
    color: 'bg-brand-teal/10',
    text: 'text-brand-teal',
  },
  {
    label: 'Student List',
    href: '/students',
    icon: Users,
    color: 'bg-blue-50',
    text: 'text-blue-600',
  },
  {
    label: 'Exam Results',
    href: '/exams',
    icon: GraduationCap,
    color: 'bg-purple-50',
    text: 'text-purple-600',
  },
  {
    label: 'Finance Summary',
    href: '/finances',
    icon: Banknote,
    color: 'bg-emerald-50',
    text: 'text-emerald-600',
  },
  {
    label: 'Applications',
    href: '/applications',
    icon: ClipboardList,
    color: 'bg-brand-amber/10',
    text: 'text-brand-amber',
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: Settings,
    color: 'bg-brand-navy/8',
    text: 'text-brand-navy',
  },
]

export function HighRankDashboard() {
  const { academicYear, term, isLoading: periodLoading } = useCurrentAcademicPeriod()

  const { data: studentsData, isLoading: studentsLoading } =
    useStudents({ status: 'ACTIVE' })
  const { data: staffData, isLoading: staffLoading } = useStaffDirectory()
  const { data: finance, isLoading: financeLoading } = useFinanceSummary(
    academicYear ?? '',
    term ?? 0,
  )
  const { data: perfTrend, isLoading: perfLoading } = useSchoolPerformanceTrend(
    academicYear ? [academicYear] : [],
  )

  const staff = staffData as ApiStaffProfile[] | undefined

  // Latest trend point for the current year — the trend endpoint returns
  // one point per (year, term); take the highest term present.
  const latestPerf = perfTrend && perfTrend.length > 0
    ? perfTrend[perfTrend.length - 1]
    : undefined

  const financeLoadingAll = periodLoading || financeLoading
  const perfLoadingAll    = periodLoading || perfLoading

  const { data: enrollment = [], isLoading: enrollmentLoading } = useEnrollmentTrend(12)
  const enrollmentData: ChartDataPoint[] = enrollment.map((e) => ({
    x: e.month,
    enrolled: e.enrolled,
    departed: e.departed,
  }))

  // [PRODUCTION FIX] New — see the file header. Both endpoints were already
  // live and serving /reports' high_rank tab; neither had ever been pulled
  // onto this dashboard.
  const { data: classComparison, isLoading: classComparisonLoading } = useClassComparison(
    academicYear ?? '',
    term ?? 0,
  )
  const classComparisonData: ChartDataPoint[] = (classComparison ?? []).map((c) => ({
    x: c.className,
    average: c.average,
  }))
  const classComparisonLoadingAll = periodLoading || classComparisonLoading

  const { data: attendance, isLoading: attendanceLoading } = useAttendanceSummary(
    academicYear ?? '',
    term ?? 0,
  )
  const attendanceLoadingAll = periodLoading || attendanceLoading

  // [PRODUCTION FIX — follow-up] The three widgets above still only cover
  // academic performance, finance, and school-wide enrollment/attendance.
  // "A wide range of issues across all sections" means the modules with
  // zero presence on this dashboard: Admissions, HR, and Library. All
  // three hooks below already exist, are already permission-verified for
  // high_rank (report.viewAdmissionTrends / viewHRReports /
  // viewLibraryUsage — packages/shared/types/permissions.ts), and already
  // serve real data to /reports — just never pulled onto this page.
  const { data: funnel, isLoading: funnelLoading } = useApplicationsFunnel()
  const funnelData: ChartDataPoint[] = (funnel ?? []).map((f) => ({
    x: f.stage,
    count: f.count,
  }))

  const { data: staffByDept, isLoading: staffByDeptLoading } = useHRStaffByDepartment()
  const staffByDeptData: ChartDataPoint[] = (staffByDept ?? []).map((d) => ({
    x: d.category,
    staff: d.value,
  }))

  const { data: borrowing, isLoading: borrowingLoading } = useLibraryBorrowingTrend(12)
  const borrowingData: ChartDataPoint[] = (borrowing ?? []).map((p) => ({
    x: p.label,
    value: p.value,
  }))

  return (
    <div className="space-y-6">
      <StatCardGrid className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Students"
          value={statValue(studentsLoading, studentsData?.total)}
          icon={Users}
          trend="neutral"
          trendLabel="active"
          iconColor="bg-blue-50"
          iconText="text-blue-600"
        />
        {/* R15: distinct icon from the adjacent Total Students card */}
        <StatCard
          label="Total Staff"
          value={statValue(staffLoading, staff?.length)}
          icon={Briefcase}
          trend="neutral"
          trendLabel="on record"
          iconColor="bg-brand-teal/10"
          iconText="text-brand-teal"
        />
        <StatCard
          label="Fee Collection"
          value={statValue(
            financeLoadingAll,
            finance ? `${finance.collectionPercent}%` : undefined,
          )}
          icon={Banknote}
          trend="neutral"
          trendLabel="of target"
          iconColor="bg-emerald-50"
          iconText="text-emerald-600"
        />
        <StatCard
          label="School Pass Rate"
          value={statValue(
            perfLoadingAll,
            latestPerf ? `${latestPerf.passRate}%` : undefined,
          )}
          icon={TrendingUp}
          trend="neutral"
          trendLabel={latestPerf ? `Term ${latestPerf.term}` : 'this year'}
          iconColor="bg-purple-50"
          iconText="text-purple-600"
        />
      </StatCardGrid>
      <QuickActions actions={QUICK_ACTIONS} />
      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard
          title="Student Population Trend"
          sub="New vs outgoing (last 12 months)"
          isLoading={enrollmentLoading}
          height={220}
        >
          <Chart
            type="line"
            data={enrollmentData}
            series={[
              { key: 'enrolled', label: 'Enrolled' },
              { key: 'departed', label: 'Departed' },
            ]}
            height={220}
            emptyStateMessage="No enrollment movement recorded yet."
            ariaLabel="Student population trend over the last 12 months, showing newly enrolled versus departed students"
          />
        </ChartCard>
        <FeeCollectionRadial
          academicYear={academicYear ?? ''}
          term={term ?? 0}
          periodLoading={periodLoading}
        />
      </div>
      {/* [PRODUCTION FIX] Was a dead PlaceholderWidget — see file header. */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-surface border border-base rounded-xl p-5">
          <PendingActionsPanel compact title="Pending Approvals" />
        </div>
        <ChartCard
          title="Class Performance Comparison"
          sub="Average score by class, current term"
          isLoading={classComparisonLoadingAll}
          height={220}
        >
          <Chart
            type="bar"
            data={classComparisonData}
            series={[{ key: 'average', label: 'Average Score' }]}
            height={220}
            emptyStateMessage="No computed results for this term yet."
            ariaLabel="Average exam score by class for the current term"
          />
        </ChartCard>
      </div>
      <div className="bg-surface border border-base rounded-xl p-5">
        <p className="font-heading font-semibold text-sm text-brand-navy mb-3">
          School Attendance {academicYear ? `— ${academicYear} Term ${term}` : ''}
        </p>
        {attendanceLoadingAll ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3" role="status" aria-label="Attendance — loading">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="skeleton h-14 rounded-lg" aria-hidden />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-page rounded-lg p-3 text-center">
              <p className="text-lg font-heading font-bold text-brand-navy">
                {attendance ? `${attendance.attendanceRate}%` : '—'}
              </p>
              <p className="text-xs text-muted mt-0.5">Attendance Rate</p>
            </div>
            <div className="bg-page rounded-lg p-3 text-center">
              <p className="text-lg font-heading font-bold text-brand-navy">
                {attendance ? attendance.daysPresent.toLocaleString() : '—'}
              </p>
              <p className="text-xs text-muted mt-0.5">Days Present</p>
            </div>
            <div className="bg-page rounded-lg p-3 text-center">
              <p className="text-lg font-heading font-bold text-brand-navy">
                {attendance ? attendance.daysAbsent.toLocaleString() : '—'}
              </p>
              <p className="text-xs text-muted mt-0.5">Days Absent</p>
            </div>
            <div className="bg-page rounded-lg p-3 text-center">
              <p className="text-lg font-heading font-bold text-brand-navy">
                {attendance ? attendance.daysLate.toLocaleString() : '—'}
              </p>
              <p className="text-xs text-muted mt-0.5">Days Late</p>
            </div>
          </div>
        )}
      </div>

      {/* [PRODUCTION FIX — follow-up] Admissions, HR, and Library had zero
         presence anywhere on this dashboard — the sections above only ever
         covered academic performance and finance. All three endpoints
         below already exist and already serve /reports; this is the first
         time they're pulled onto the High Rank home screen itself. */}
      <div className="grid md:grid-cols-3 gap-4">
        <ChartCard
          title="Admissions Funnel"
          sub="Applications by stage"
          isLoading={funnelLoading}
          height={180}
        >
          <Chart
            type="bar"
            data={funnelData}
            series={[{ key: 'count', label: 'Applications' }]}
            height={180}
            emptyStateMessage="No applications recorded yet."
            ariaLabel="Number of applications at each admissions stage"
          />
        </ChartCard>
        <ChartCard
          title="Staff by Department"
          sub="Active staff headcount"
          isLoading={staffByDeptLoading}
          height={180}
        >
          <Chart
            type="bar"
            data={staffByDeptData}
            series={[{ key: 'staff', label: 'Staff' }]}
            height={180}
            emptyStateMessage="No staff records yet."
            ariaLabel="Active staff headcount by department"
          />
        </ChartCard>
        <ChartCard
          title="Library Borrowing"
          sub="Books issued, last 12 weeks"
          isLoading={borrowingLoading}
          height={180}
        >
          <Chart
            type="line"
            data={borrowingData}
            series={[{ key: 'value', label: 'Books Issued' }]}
            height={180}
            emptyStateMessage="No borrowing activity recorded yet."
            ariaLabel="Weekly books issued over the last 12 weeks"
          />
        </ChartCard>
      </div>
    </div>
  )
}