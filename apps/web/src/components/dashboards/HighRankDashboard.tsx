'use client'

/**
 * apps/web/src/components/dashboards/HighRankDashboard.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE (stat-card data-wiring and quick-action
 *   link targets only — the overall visual layout is unaffected)
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: All four stat cards were permanent '—' placeholders. Wired to
 *   the real endpoints this executive role already holds permissions for:
 *   Total Students ← useStudents({status:'ACTIVE'}).total; Total Staff ←
 *   useStaffDirectory() (GET /hr, admin/hr/high_rank); Fee Collection ←
 *   useFinanceSummary(year, term).collectionPercent
 *   (finance.viewSummary); School Pass Rate ← the current year's latest
 *   useSchoolPerformanceTrend point (report.viewSchoolPerformance). Year/
 *   term come from useCurrentAcademicPeriod() (SETTING_KEYS, same phase) —
 *   never hardcoded. Quick actions already pointed at real pages;
 *   unchanged. PlaceholderWidget import moved to its new shared home.
 * [DEPENDS ON]: W/hooks/useStudents.ts, W/hooks/useHR.ts,
 *   W/hooks/useFinances.ts, W/hooks/useAnalytics.ts,
 *   W/hooks/useSettings.ts (useCurrentAcademicPeriod, same phase),
 *   W/components/shared/PlaceholderWidget.tsx (same phase),
 *   W/components/shared/StatCard.tsx (statValue, same phase)
 */

import {
  Users,
  Briefcase,
  Banknote,
  GraduationCap,
  TrendingUp,
  BarChart3,
  ClipboardList,
  Settings,
  Megaphone,
} from 'lucide-react'
import { StatCard, StatCardGrid, statValue } from '@/components/shared/StatCard'
import { QuickActions } from '@/components/shared/QuickActions'
import type { QuickAction } from '@/components/shared/QuickActions'
import { PlaceholderWidget } from '@/components/shared/PlaceholderWidget'
import { ChartCard } from '@/components/shared/ChartCard'
import { Chart } from '@/components/shared/chart'
import type { ChartDataPoint } from '@/components/shared/chart'
import { FeeCollectionRadial } from '@/components/finances/FeeCollectionRadial'
import { useStudents } from '@/hooks/useStudents'
import { useStaffDirectory } from '@/hooks/useHR'
import { useFinanceSummary } from '@/hooks/useFinances'
import { useSchoolPerformanceTrend, useEnrollmentTrend } from '@/hooks/useAnalytics'
import { useCurrentAcademicPeriod } from '@/hooks/useSettings'
import type { ApiStaffProfile } from '@shared/types/api'

const QUICK_ACTIONS: QuickAction[] = [
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
      <PlaceholderWidget
        title="Important Reports"
        sub="School performance overview"
        h="h-28 md:h-32"
      />
    </div>
  )
}