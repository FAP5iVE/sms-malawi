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
import { DashboardAttention, DashboardKpis } from './DashboardReport'
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

export function LowerRankDashboard() {
  const { academicYear, term, isLoading: periodLoading } = useViewingPeriod()

  const period = { academicYear: academicYear ?? '', term: term ?? undefined }
  const overview = useAdmissionsOverview(period)
  const admissionsAttention = useAdmissionsAttention()
  const attendanceAttention = useAttendanceAttention(period)
  const { data: pendingApps, isLoading: pendingLoading } =
    useApplications('PENDING')
  const { data: examsData, isLoading: examsLoading } = useExams(
    undefined,
    academicYear ?? '',
    term ?? 0,
  )

  const examsThisWeekList = examsInNextSevenDays(examsData ?? [])
  const recentApplications = (pendingApps?.applications ?? []).slice(0, 5)

  return (
    <div className="space-y-4 md:space-y-6">
      <DashboardKpis
        title="Registry overview"
        summary="Students on the roll, the admissions queue and attendance exceptions. Each figure opens the report behind it."
        academicYear={academicYear}
        term={term}
        overview={overview}
        reportsHref="/reports?tab=admissions"
        showInsights
        placeholders={6}
      />
      <QuickActions actions={QUICK_ACTIONS} />
      <div className="grid md:grid-cols-2 gap-3 md:gap-4">
        <ListCard
          title="Exam Schedule This Week"
          sub="Next 7 days"
          isLoading={periodLoading || examsLoading}
          isEmpty={examsThisWeekList.length === 0}
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
        <DashboardAttention query={admissionsAttention} title="Admissions queue" />
        <DashboardAttention query={attendanceAttention} title="Attendance exceptions" />
      </div>
    </div>
  )
}
