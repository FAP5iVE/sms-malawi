'use client'

/**
 * apps/web/src/components/dashboards/LowerRankDashboard.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE (stat-card data-wiring and quick-action
 *   link targets only — the overall visual layout is unaffected)
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: All four stat cards were permanent '—' placeholders. Wired to
 *   endpoints the lower_rank role really holds: Total Students ←
 *   useStudents({status:'ACTIVE'}).total; Pending Applications ←
 *   useApplications('PENDING'); Exams This Week ← the current-term exam
 *   list filtered through the shared examsInNextSevenDays predicate
 *   (lower_rank is on GET /exams' allow-list). The "Total Staff" card is
 *   replaced by Awaiting Admission (useApplications('AWAITING_ADMISSION'))
 *   — GET /hr's staff directory is admin/hr/high_rank only, so lower_rank
 *   could never have populated that figure, while admissions follow-up is
 *   this role's actual daily queue. Year/term come from
 *   useCurrentAcademicPeriod() (SETTING_KEYS, same phase). Quick actions:
 *   /students/new has never existed as a route (guaranteed 404) — student
 *   creation is in-page at /students. PlaceholderWidget import moved to
 *   its new shared home.
 * [DEPENDS ON]: W/hooks/useStudents.ts, W/hooks/useApplications.ts,
 *   W/hooks/useExams.ts, W/hooks/useSettings.ts (useCurrentAcademicPeriod,
 *   same phase), W/lib/examFilters.ts (same phase),
 *   W/components/shared/PlaceholderWidget.tsx (same phase),
 *   W/components/shared/StatCard.tsx (statValue, same phase)
 */

import {
  ClipboardList,
  CalendarDays,
  UserPlus,
  Bell,
} from 'lucide-react'
import { QuickActions } from '@/components/shared/QuickActions'
import { ListCard } from '@/components/shared/ListCard'
import { useAdmissionsOverview, useAdmissionsAttention } from '@/hooks/reporting/useAdmissionsReporting'
import { useAttendanceAttention } from '@/hooks/reporting/useAttendanceReporting'
import { DashboardAttention } from './DashboardReport'
import { PrimaryOverviewKpis, ReportLinks, SecondaryKpis } from './DashboardSections'
import type { ReportLink } from './DashboardSections'
import { useApplications } from '@/hooks/useApplications'
import { useExams } from '@/hooks/useExams'
import { useViewingPeriod } from '@/hooks/useViewingPeriod'
import { examsInNextSevenDays } from '@/lib/examFilters'
import type { QuickAction } from '@/components/shared/QuickActions'

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Add Student',
    // R15: was /students/new — a route that has never existed (404).
    // Student creation is in-page at /students.
    href: '/students',
    icon: UserPlus,
    color: 'bg-brand-teal/10',
    text: 'text-brand-teal',
  },
  {
    label: 'Applications',
    href: '/applications',
    icon: ClipboardList,
    color: 'bg-brand-amber/10',
    text: 'text-brand-amber',
  },
  {
    label: 'View Calendar',
    href: '/calendar',
    icon: CalendarDays,
    color: 'bg-blue-50',
    text: 'text-blue-600',
  },
  {
    label: 'Announcements',
    href: '/announcements',
    icon: Bell,
    color: 'bg-purple-50',
    text: 'text-purple-600',
  },
]

/** Lead with the roll and the admissions queue; the rest sit in "More figures". */
const PREFERRED = ['active', 'pending', 'awaiting', 'attendanceExceptions']

const REPORT_LINKS: ReportLink[] = [
  { label: 'Admissions', href: '/reports?tab=admissions', description: 'Applications by stage, conversion' },
  { label: 'Enrollment', href: '/reports?tab=enrollment', description: 'Students on the roll' },
  { label: 'Attendance', href: '/reports?tab=attendance', description: 'By class and week' },
]

export function LowerRankDashboard() {
  const { academicYear, term, isLoading: periodLoading } = useViewingPeriod()

  const period = { academicYear: academicYear ?? '', term: term ?? undefined }
  const overview = useAdmissionsOverview(period)
  const admissionsAttention = useAdmissionsAttention()
  const attendanceAttention = useAttendanceAttention(period)
  const { data: pendingApps, isLoading: pendingLoading, isError: pendingError, refetch: refetchPending } =
    useApplications('PENDING')
  const { data: examsData, isLoading: examsLoading, isError: examsError, refetch: refetchExams } = useExams(
    undefined,
    academicYear ?? '',
    term ?? 0,
  )

  const examsThisWeekList = examsInNextSevenDays(examsData ?? [])
  const recentApplications = (pendingApps?.applications ?? []).slice(0, 5)

  return (
    <div className="space-y-4 md:space-y-6">
      <PrimaryOverviewKpis
        title="Registry at a glance"
        summary="Keep up with admissions, student registration and attendance issues that need follow-up."
        academicYear={academicYear}
        term={term}
        overview={overview}
        preferred={PREFERRED}
        reportsHref="/reports?tab=admissions"
      />
      <div className="grid md:grid-cols-2 gap-3 md:gap-4">
        <ListCard
          title="Exam Schedule This Week"
          sub="Next 7 days"
          isLoading={periodLoading || examsLoading}
          isEmpty={examsThisWeekList.length === 0}
          isError={examsError}
          onRetry={() => void refetchExams()}
          emptyMessage="No exams scheduled in the next 7 days."
        >
          <ul className="divide-y divide-base">
            {examsThisWeekList.map((exam) => (
              <li key={exam.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-brand-navy truncate">{exam.subject}</p>
                  <p className="text-xs text-muted truncate">
                    {exam.className ?? 'Class'} · {exam.type}
                  </p>
                </div>
                <span className="text-xs text-muted whitespace-nowrap shrink-0">
                  {new Date(exam.date).toLocaleDateString('en-MW')}
                </span>
              </li>
            ))}
          </ul>
        </ListCard>
        <ListCard
          title="Recent Applications"
          sub="Pending review"
          isLoading={pendingLoading}
          isEmpty={recentApplications.length === 0}
          isError={pendingError}
          onRetry={() => void refetchPending()}
          emptyMessage="No pending applications right now."
        >
          <ul className="divide-y divide-base">
            {recentApplications.map((app) => (
              <li key={app.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-brand-navy truncate">
                    {app.firstName} {app.lastName}
                  </p>
                  <p className="text-xs text-muted truncate">Form {app.applyingForForm}</p>
                </div>
                <span className="text-xs text-muted whitespace-nowrap shrink-0">
                  {new Date(app.createdAt).toLocaleDateString('en-MW')}
                </span>
              </li>
            ))}
          </ul>
        </ListCard>
      </div>
      <div className="grid md:grid-cols-2 gap-3 md:gap-4">
        <DashboardAttention query={admissionsAttention} title="Admissions queue" limit={5} />
        <DashboardAttention query={attendanceAttention} title="Attendance exceptions" limit={5} />
      </div>
      <SecondaryKpis title="More figures and findings" overview={overview} preferred={PREFERRED} showInsights />
      <QuickActions actions={QUICK_ACTIONS} compact />
      <ReportLinks links={REPORT_LINKS} />
    </div>
  )
}
