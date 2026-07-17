'use client'

/**
 * apps/web/src/components/dashboards/StudentDashboard.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE (stat-card data-wiring, the StudentResultsView
 *   identity fix, and quick-action link targets only — the overall visual
 *   layout, including the fee-gate notice, is unaffected)
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]:
 *   (1) All four stat cards were permanent '—' placeholders. Wired through
 *       useStudentMe() (W/hooks/useStudents.ts, same phase) — the
 *       student-role self-lookup over GET /students/me, which resolves the
 *       signed-in Firebase UID to the real Student row server-side: My
 *       Class ← className (+ form as trendLabel); Books Borrowed ←
 *       currentBorrowings; Fees Balance ← feeBalance via formatMWK;
 *       Upcoming Exams ← useExams(me.classId, year, term) filtered through
 *       the shared examsInNextSevenDays predicate. Year/term come from
 *       useCurrentAcademicPeriod() (SETTING_KEYS, same phase).
 *   (2) StudentResultsView previously received studentId={user.uid} — a
 *       Firebase UID passed where examService.getStudentResults() queries
 *       TermResult.studentId (the Prisma Student.id space), so a student's
 *       own dashboard could never find their results. It now receives the
 *       resolved Student.id from useStudentMe(), the same UID→Student.id
 *       resolution R7/R8 established server-side.
 *   (3) The fee-gate notice banner was always visible regardless of the
 *       student's actual balance; it now renders only when the real
 *       feeBalance (the R9-established balance figure /students/me
 *       returns) is outstanding, and states the actual amount.
 *   (4) Quick actions already pointed at real pages; My Results now
 *       deep-links to /exams?tab=results (the page reads ?tab= as of this
 *       phase). PlaceholderWidget import moved to its new shared home.
 *       The unused destructured `role` variable is gone with the
 *       useAuthStore dependency itself — identity now flows through
 *       useStudentMe().
 * [DEPENDS ON]: W/hooks/useStudents.ts (useStudentMe, same phase),
 *   W/hooks/useExams.ts, W/hooks/useSettings.ts (useCurrentAcademicPeriod,
 *   same phase), W/lib/examFilters.ts (same phase),
 *   W/components/shared/PlaceholderWidget.tsx (same phase),
 *   W/components/shared/StatCard.tsx (statValue, same phase),
 *   @shared/constants/malawi (formatMWK)
 */

import {
  BookOpen,
  Banknote,
  GraduationCap,
  Library,
  Clock,
  Bell,
  BarChart3,
  AlertCircle,
} from 'lucide-react'
import { StatCard, StatCardGrid, statValue } from '@/components/shared/StatCard'
import { QuickActions } from '@/components/shared/QuickActions'
import { PlaceholderWidget } from '@/components/shared/PlaceholderWidget'
import { ChartCard } from '@/components/shared/ChartCard'
import { Chart } from '@/components/shared/chart'
import type { ChartDataPoint } from '@/components/shared/chart'
import type { QuickAction } from '@/components/shared/QuickActions'
import { StudentResultsView } from '@/components/exams/StudentResultsView'
import { useStudentMe } from '@/hooks/useStudents'
import { useStudentPerformanceTrend, useOwnAttendance } from '@/hooks/useAnalytics'
import { useExams } from '@/hooks/useExams'
import { useCurrentAcademicPeriod } from '@/hooks/useSettings'
import { examsInNextSevenDays } from '@/lib/examFilters'
import { formatMWK } from '@shared/constants/malawi'

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'My Timetable',
    href: '/timetable',
    icon: Clock,
    color: 'bg-brand-teal/10',
    text: 'text-brand-teal',
  },
  { label: 'Library', href: '/library', icon: Library, color: 'bg-blue-50', text: 'text-blue-600' },
  {
    label: 'My Results',
    // R15: results live in the My Results tab (page reads ?tab= as of this phase)
    href: '/exams?tab=results',
    icon: BarChart3,
    color: 'bg-purple-50',
    text: 'text-purple-600',
  },
  {
    label: 'Announcements',
    href: '/announcements',
    icon: Bell,
    color: 'bg-brand-amber/10',
    text: 'text-brand-amber',
  },
]

export function StudentDashboard() {
  const { academicYear, term, isLoading: periodLoading } = useCurrentAcademicPeriod()
  const { data: me, isLoading: meLoading } = useStudentMe()
  const { data: examsData, isLoading: examsLoading } = useExams(
    me?.classId ?? undefined,
    academicYear ?? '',
    term ?? 0,
  )

  const upcomingExams = examsInNextSevenDays(examsData ?? []).length
  const examsLoadingAll = periodLoading || meLoading || examsLoading

  // Student performance trend (average % per term) — grade data sourced from
  // gradeService.ts via the R14 analytics endpoint. Unblocked by R7/R8's
  // grading reconciliation.
  const { data: perfTrend = [], isLoading: perfLoading } = useStudentPerformanceTrend(me?.id ?? '')
  const performanceData: ChartDataPoint[] = perfTrend.map((p) => ({
    x: `${p.academicYear} T${p.term}`,
    average: p.average,
  }))

  // Attendance breakdown (present / absent / late) for the current term —
  // unblocked by R6's Postgres Attendance model.
  const { data: attendance, isLoading: attendanceLoading } = useOwnAttendance(
    me?.id ?? '',
    academicYear ?? '',
    term ?? 0,
  )
  const attendanceData: ChartDataPoint[] = attendance
    ? [
        { x: 'Present', value: attendance.daysPresent },
        { x: 'Absent', value: attendance.daysAbsent },
        { x: 'Late', value: attendance.daysLate },
      ]
    : []
  const attendanceLoadingAll = periodLoading || meLoading || attendanceLoading
  const perfLoadingAll = meLoading || perfLoading

  return (
    <div className="space-y-6">
      <StatCardGrid className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="My Class"
          value={statValue(meLoading, me?.className)}
          icon={BookOpen}
          trend="neutral"
          trendLabel={me?.classForm ? `Form ${me.classForm}` : 'current form'}
          iconColor="bg-brand-navy/8"
          iconText="text-brand-navy"
        />
        <StatCard
          label="Books Borrowed"
          value={statValue(meLoading, me?.currentBorrowings)}
          icon={Library}
          trend="neutral"
          trendLabel="from library"
          iconColor="bg-blue-50"
          iconText="text-blue-600"
        />
        <StatCard
          label="Fees Balance"
          value={statValue(
            meLoading,
            me ? formatMWK(me.feeBalance) : undefined,
          )}
          icon={Banknote}
          trend="neutral"
          trendLabel="outstanding"
          iconColor="bg-brand-amber/10"
          iconText="text-brand-amber"
        />
        <StatCard
          label="Upcoming Exams"
          value={statValue(examsLoadingAll, upcomingExams)}
          icon={GraduationCap}
          trend="neutral"
          trendLabel="this week"
          iconColor="bg-brand-teal/10"
          iconText="text-brand-teal"
        />
      </StatCardGrid>

      {/* Fee-gated exam results notice — R15: shown only when the student's
          real balance (R9's feeBalance from /students/me) is outstanding,
          instead of unconditionally for every student. */}
      {me !== undefined && me.feeBalance > 0 && (
        <div className="bg-brand-amber/10 border border-brand-amber/30 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-brand-amber shrink-0 mt-0.5" aria-hidden />
          <div>
            <p className="font-heading font-semibold text-sm text-brand-navy">
              Exam results are linked to your fee balance
            </p>
            <p className="text-xs text-muted mt-1">
              You have an outstanding balance of {formatMWK(me.feeBalance)}. Your results will be
              visible once all outstanding fees for the term are cleared. Visit the Finances page
              to view your balance.
            </p>
          </div>
        </div>
      )}

      <QuickActions actions={QUICK_ACTIONS} />
      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard
          title="My Performance"
          sub="Average score per term"
          isLoading={perfLoadingAll}
          height={220}
        >
          <Chart
            type="line"
            data={performanceData}
            series={[{ key: 'average', label: 'Average %' }]}
            height={220}
            emptyStateMessage="No results published yet."
            ariaLabel="My average exam score per term over time"
          />
        </ChartCard>
        <ChartCard
          title="My Attendance"
          sub={term ? `Term ${term} · ${academicYear}` : 'This term'}
          isLoading={attendanceLoadingAll}
          height={220}
        >
          <Chart
            type="donut"
            data={attendanceData}
            series={[{ key: 'value', label: 'Days' }]}
            height={220}
            emptyStateMessage="No attendance recorded for this term yet."
            ariaLabel={
              attendance
                ? `Attendance this term: ${attendance.daysPresent} days present, ${attendance.daysAbsent} absent, ${attendance.daysLate} late`
                : 'Attendance breakdown — no data available'
            }
          />
        </ChartCard>
      </div>
      <PlaceholderWidget
        title="Today's Timetable"
        sub="Daily schedule"
        h="h-32 md:h-40"
      />
      <div className="bg-surface border border-base rounded-2xl p-5">
        <h3 className="font-heading font-semibold text-brand-navy mb-4">My Exam Results</h3>
        {/* R15: the real Student.id from /students/me — not the Firebase UID */}
        {me?.id
          ? <StudentResultsView studentId={me.id} />
          : (
            <p className="text-sm text-muted" role="status">
              {meLoading
                ? 'Loading your student record…'
                : 'Your student record could not be found. Please contact the school office.'}
            </p>
          )}
      </div>
    </div>
  )
}
