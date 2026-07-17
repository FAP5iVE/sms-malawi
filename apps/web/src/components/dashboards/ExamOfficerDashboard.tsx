'use client'

/**
 * apps/web/src/components/dashboards/ExamOfficerDashboard.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE (stat-card data-wiring and quick-action
 *   link targets only — the overall visual layout is unaffected)
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: All four stat cards were permanent '—'/'0' literals. Wired to
 *   the current-term exam list (useExams — exam_officer is on that route's
 *   allow-list) with the shared examFilters predicates: Exams This Week,
 *   Marks Pending Entry (MARKS_PENDING/MARKS_DRAFT), Results to Release
 *   (RESULTS_APPROVED). The hardcoded "MANEB Config Alerts: 0 / all clear"
 *   card — a figure no endpoint has ever produced — is replaced by the
 *   real Results Released count for the term. Year/term come from
 *   useCurrentAcademicPeriod() (SETTING_KEYS, same phase). Quick actions:
 *   /exams/marks, /exams/results and /exams/maneb have never existed as
 *   routes (guaranteed 404s) — corrected to the real in-page tabs
 *   /exams?tab=exams, /exams?tab=release and /exams?tab=maneb; Exam
 *   Analytics moves from the generic /reports to the exams page's own
 *   Analytics tab; Exam Settings deep-links to the Exam & Grading settings
 *   section (both pages read their URL param as of this phase).
 *   PlaceholderWidget import moved to its new shared home.
 * [DEPENDS ON]: W/hooks/useExams.ts, W/hooks/useSettings.ts
 *   (useCurrentAcademicPeriod, same phase), W/lib/examFilters.ts (same
 *   phase), W/components/shared/PlaceholderWidget.tsx (same phase),
 *   W/components/shared/StatCard.tsx (statValue, same phase)
 */

import {
  GraduationCap,
  PenLine,
  CheckCircle,
  Send,
  ClipboardList,
  Settings,
  BarChart3,
} from 'lucide-react'
import { StatCard, StatCardGrid, statValue } from '@/components/shared/StatCard'
import { QuickActions } from '@/components/shared/QuickActions'
import { PlaceholderWidget } from '@/components/shared/PlaceholderWidget'
import { useExams } from '@/hooks/useExams'
import { useCurrentAcademicPeriod } from '@/hooks/useSettings'
import {
  examsInNextSevenDays,
  examsAwaitingMarks,
  examsAwaitingRelease,
  examsReleased,
} from '@/lib/examFilters'
import type { QuickAction } from '@/components/shared/QuickActions'

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Enter Marks',
    // R15: was /exams/marks — a route that has never existed (404)
    href: '/exams?tab=exams',
    icon: PenLine,
    color: 'bg-brand-teal/10',
    text: 'text-brand-teal',
  },
  {
    label: 'Release Results',
    // R15: was /exams/results (404) — release lives in the Results Release tab
    href: '/exams?tab=release',
    icon: CheckCircle,
    color: 'bg-emerald-50',
    text: 'text-emerald-600',
  },
  {
    label: 'MANEB Records',
    // R15: was /exams/maneb (404) — MANEB import/records live in the MANEB tab
    href: '/exams?tab=maneb',
    icon: ClipboardList,
    color: 'bg-blue-50',
    text: 'text-blue-600',
  },
  {
    label: 'Exam Analytics',
    // R15: the exams page has its own Analytics tab — more direct than /reports
    href: '/exams?tab=analytics',
    icon: BarChart3,
    color: 'bg-brand-amber/10',
    text: 'text-brand-amber',
  },
  {
    label: 'Exam Settings',
    // R15: deep-links to the Exam & Grading section (page reads ?section=)
    href: '/settings?section=exam-grading',
    icon: Settings,
    color: 'bg-brand-navy/8',
    text: 'text-brand-navy',
  },
]

export function ExamOfficerDashboard() {
  const { academicYear, term, isLoading: periodLoading } = useCurrentAcademicPeriod()
  const { data: examsData, isLoading: examsLoading } = useExams(
    undefined,
    academicYear ?? '',
    term ?? 0,
  )

  const exams     = examsData ?? []
  const isLoading = periodLoading || examsLoading

  return (
    <div className="space-y-6">
      <StatCardGrid className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Exams This Week"
          value={statValue(isLoading, examsInNextSevenDays(exams).length)}
          icon={GraduationCap}
          trend="neutral"
          trendLabel="scheduled"
          iconColor="bg-brand-teal/10"
          iconText="text-brand-teal"
        />
        <StatCard
          label="Marks Pending Entry"
          value={statValue(isLoading, examsAwaitingMarks(exams).length)}
          icon={PenLine}
          trend="neutral"
          trendLabel="to enter"
          iconColor="bg-brand-amber/10"
          iconText="text-brand-amber"
        />
        <StatCard
          label="Results to Release"
          value={statValue(isLoading, examsAwaitingRelease(exams).length)}
          icon={CheckCircle}
          trend="neutral"
          trendLabel="approved, awaiting"
          iconColor="bg-blue-50"
          iconText="text-blue-600"
        />
        <StatCard
          label="Results Released"
          value={statValue(isLoading, examsReleased(exams).length)}
          icon={Send}
          trend="neutral"
          trendLabel={term ? `Term ${term}` : 'this term'}
          iconColor="bg-emerald-50"
          iconText="text-emerald-600"
        />
      </StatCardGrid>
      <QuickActions actions={QUICK_ACTIONS} />
      <div className="grid md:grid-cols-2 gap-4">
        <PlaceholderWidget
          title="Exam Schedule This Week"
          sub="Timetable view — wired in R17"
          h="h-40 md:h-56"
        />
        <PlaceholderWidget
          title="Results Release Queue"
          sub="Pending authorization — wired in R17"
          h="h-40 md:h-56"
        />
      </div>
    </div>
  )
}
