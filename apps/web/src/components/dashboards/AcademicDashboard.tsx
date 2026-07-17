'use client'

/**
 * apps/web/src/components/dashboards/AcademicDashboard.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE (stat-card data-wiring and quick-action
 *   link targets only — the layout, including R8's real "Students Needing
 *   Attention" widget, is unaffected)
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency (earlier R8 TARGETED
 *   EDIT — the StudentRiskBadge widget — retained verbatim)
 * [PURPOSE]: The four stat cards were permanent '—' placeholders. Wired to
 *   endpoints the academic role really holds: Active Classes ←
 *   useClasses(year) (class.view); Total Students ←
 *   useStudents({status:'ACTIVE'}).total (student.view — academic is on
 *   the students page's own allow-list); Exams This Week ← useExams for
 *   the current year/term filtered to the next 7 days; Marks Pending ←
 *   the same exam list filtered to MARKS_PENDING/MARKS_DRAFT status. The
 *   first card is relabelled from "My Classes" to "Active Classes" — no
 *   endpoint scopes classes to the signed-in teacher (Class.teacherId is a
 *   StaffProfile id with no client-side mapping from the auth UID), and
 *   showing the real school-wide figure honestly beats faking a personal
 *   one. Year/term come from useCurrentAcademicPeriod() (SETTING_KEYS,
 *   same phase). Quick actions: Enter Marks deep-links to
 *   /exams?tab=exams (page reads ?tab= as of this phase); the rest already
 *   pointed at real pages. PlaceholderWidget import moved to its new
 *   shared home.
 * [DEPENDS ON]: W/hooks/useClasses.ts, W/hooks/useStudents.ts,
 *   W/hooks/useExams.ts, W/hooks/useSettings.ts (useCurrentAcademicPeriod,
 *   same phase), W/lib/examFilters.ts (same phase),
 *   W/components/shared/PlaceholderWidget.tsx (same phase),
 *   W/components/shared/StatCard.tsx (statValue, same phase),
 *   W/components/shared/StudentRiskBadge.tsx (R8)
 */

import {
  Users,
  BookOpen,
  GraduationCap,
  CheckSquare,
  ClipboardCheck,
  PenLine,
  Clock,
  Bell,
} from 'lucide-react'
import { StatCard, StatCardGrid, statValue } from '@/components/shared/StatCard'
import { QuickActions } from '@/components/shared/QuickActions'
import { PlaceholderWidget } from '@/components/shared/PlaceholderWidget'
import { useStudents } from '@/hooks/useStudents'
import { useClasses } from '@/hooks/useClasses'
import { useExams } from '@/hooks/useExams'
import { useCurrentAcademicPeriod } from '@/hooks/useSettings'
import { StudentRiskBadge } from '@/components/shared/StudentRiskBadge'
import Link from 'next/link'
import type { QuickAction } from '@/components/shared/QuickActions'
import type { ApiClass } from '@shared/types/api'
import { examsInNextSevenDays, examsAwaitingMarks } from '@/lib/examFilters'

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Mark Attendance',
    href: '/classes',
    icon: ClipboardCheck,
    color: 'bg-brand-teal/10',
    text: 'text-brand-teal',
  },
  {
    label: 'Enter Marks',
    // R15: marks entry lives in the Exams tab (page reads ?tab= as of this phase)
    href: '/exams?tab=exams',
    icon: PenLine,
    color: 'bg-blue-50',
    text: 'text-blue-600',
  },
  {
    label: 'View Timetable',
    href: '/timetable',
    icon: Clock,
    color: 'bg-brand-amber/10',
    text: 'text-brand-amber',
  },
  {
    label: 'Announcements',
    href: '/announcements',
    icon: Bell,
    color: 'bg-purple-50',
    text: 'text-purple-600',
  },
]

export function AcademicDashboard() {
  const { academicYear, term, isLoading: periodLoading } = useCurrentAcademicPeriod()

  const { data: studentsData, isLoading: studentsLoading } =
    useStudents({ status: 'ACTIVE' })
  const { data: classesData, isLoading: classesLoading } =
    useClasses(academicYear)
  const { data: examsData, isLoading: examsLoading } = useExams(
    undefined,
    academicYear ?? '',
    term ?? 0,
  )

  const classes = classesData as ApiClass[] | undefined
  const exams   = examsData ?? []

  const highRiskStudents = (studentsData?.students ?? []).filter(
    (s) => s.riskLevel === 'HIGH',
  )

  const examsThisWeek = examsInNextSevenDays(exams).length
  const marksPending  = examsAwaitingMarks(exams).length
  const examsLoadingAll = periodLoading || examsLoading

  return (
    <div className="space-y-6">
      <StatCardGrid className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Active Classes"
          value={statValue(periodLoading || classesLoading, classes?.length)}
          icon={BookOpen}
          trend="neutral"
          trendLabel="this year"
          iconColor="bg-brand-navy/8"
          iconText="text-brand-navy"
        />
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
          label="Exams This Week"
          value={statValue(examsLoadingAll, examsThisWeek)}
          icon={GraduationCap}
          trend="neutral"
          trendLabel="scheduled"
          iconColor="bg-brand-teal/10"
          iconText="text-brand-teal"
        />
        <StatCard
          label="Marks Pending"
          value={statValue(examsLoadingAll, marksPending)}
          icon={CheckSquare}
          trend="neutral"
          trendLabel="to enter"
          iconColor="bg-brand-amber/10"
          iconText="text-brand-amber"
        />
      </StatCardGrid>
      <QuickActions actions={QUICK_ACTIONS} />
      <div className="grid md:grid-cols-2 gap-4">
        <PlaceholderWidget
          title="Today's Timetable"
          sub="Daily schedule widget — wired in R17"
          h="h-40 md:h-56"
        />
        <div className="bg-surface border border-base rounded-xl p-4 h-40 md:h-56 flex flex-col">
          <p className="font-heading font-semibold text-sm text-brand-navy mb-3">
            Students Needing Attention
          </p>
          {highRiskStudents.length === 0 ? (
            <p className="text-sm text-muted flex-1 flex items-center justify-center text-center">
              No high-risk students right now.
            </p>
          ) : (
            <ul className="space-y-2 overflow-y-auto flex-1">
              {highRiskStudents.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/students/${s.id}`}
                    className="flex items-center justify-between gap-2 text-sm hover:bg-page rounded-lg px-2 py-1.5 -mx-2 transition-colors"
                  >
                    <span className="text-body">{s.firstName} {s.lastName}</span>
                    <StudentRiskBadge riskLevel="HIGH" variant="dot" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
