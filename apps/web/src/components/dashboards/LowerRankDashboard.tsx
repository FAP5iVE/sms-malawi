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
  Users,
  ClipboardList,
  CalendarDays,
  GraduationCap,
  UserPlus,
  UserCheck,
  Bell,
} from 'lucide-react'
import { StatCard, StatCardGrid, statValue } from '@/components/shared/StatCard'
import { QuickActions } from '@/components/shared/QuickActions'
import { PlaceholderWidget } from '@/components/shared/PlaceholderWidget'
import { useStudents } from '@/hooks/useStudents'
import { useApplications } from '@/hooks/useApplications'
import { useExams } from '@/hooks/useExams'
import { useCurrentAcademicPeriod } from '@/hooks/useSettings'
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
  const { academicYear, term, isLoading: periodLoading } = useCurrentAcademicPeriod()

  const { data: studentsData, isLoading: studentsLoading } =
    useStudents({ status: 'ACTIVE' })
  const { data: pendingApps, isLoading: pendingLoading } =
    useApplications('PENDING')
  const { data: awaitingApps, isLoading: awaitingLoading } =
    useApplications('AWAITING_ADMISSION')
  const { data: examsData, isLoading: examsLoading } = useExams(
    undefined,
    academicYear ?? '',
    term ?? 0,
  )

  const examsThisWeek = examsInNextSevenDays(examsData ?? []).length

  return (
    <div className="space-y-6">
      <StatCardGrid className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Students"
          value={statValue(studentsLoading, studentsData?.total)}
          icon={Users}
          trend="neutral"
          trendLabel="enrolled"
          iconColor="bg-blue-50"
          iconText="text-blue-600"
        />
        <StatCard
          label="Pending Applications"
          value={statValue(pendingLoading, pendingApps?.total)}
          icon={ClipboardList}
          trend="neutral"
          trendLabel="awaiting review"
          iconColor="bg-brand-amber/10"
          iconText="text-brand-amber"
        />
        <StatCard
          label="Awaiting Admission"
          value={statValue(awaitingLoading, awaitingApps?.total)}
          icon={UserCheck}
          trend="neutral"
          trendLabel="approved, to admit"
          iconColor="bg-brand-teal/10"
          iconText="text-brand-teal"
        />
        <StatCard
          label="Exams This Week"
          value={statValue(periodLoading || examsLoading, examsThisWeek)}
          icon={GraduationCap}
          trend="neutral"
          trendLabel="scheduled"
          iconColor="bg-purple-50"
          iconText="text-purple-600"
        />
      </StatCardGrid>
      <QuickActions actions={QUICK_ACTIONS} />
      <div className="grid md:grid-cols-2 gap-4">
        <PlaceholderWidget
          title="Exam Schedule This Week"
          sub="Timetable widget"
          h="h-32 md:h-40"
        />
        <PlaceholderWidget
          title="Recent Applications"
          sub="Admissions queue"
          h="h-32 md:h-40"
        />
      </div>
    </div>
  )
}
