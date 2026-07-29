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
import Link from 'next/link'
import { StatCard, StatCardGrid, statValue } from '@/components/shared/StatCard'
import { QuickActions } from '@/components/shared/QuickActions'
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
          href="/exams?tab=exams"
        />
        <StatCard
          label="Marks Pending Entry"
          value={statValue(isLoading, examsAwaitingMarks(exams).length)}
          icon={PenLine}
          trend="neutral"
          trendLabel="to enter"
          iconColor="bg-brand-amber/10"
          iconText="text-brand-amber"
          href="/exams?tab=exams"
        />
        <StatCard
          label="Results to Release"
          value={statValue(isLoading, examsAwaitingRelease(exams).length)}
          icon={CheckCircle}
          trend="neutral"
          trendLabel="approved, awaiting"
          iconColor="bg-blue-50"
          iconText="text-blue-600"
          href="/exams?tab=release"
        />
        <StatCard
          label="Results Released"
          value={statValue(isLoading, examsReleased(exams).length)}
          icon={Send}
          trend="neutral"
          trendLabel={term ? `Term ${term}` : 'this term'}
          iconColor="bg-emerald-50"
          iconText="text-emerald-600"
          href="/exams?tab=release"
        />
      </StatCardGrid>
      <QuickActions actions={QUICK_ACTIONS} />
      <div className="grid md:grid-cols-2 gap-4">
        {/* [PRODUCTION FIX 2026-07-28] Was a permanent PlaceholderWidget
            skeleton ("wired in R17" — never happened). exams is already
            fetched on this dashboard for the stat cards above; both lists
            below just reuse the same examFilters predicates instead of
            fetching anything new. */}
        <div className="bg-surface border border-base rounded-xl p-5">
          <h3 className="font-heading font-semibold text-body mb-1">Exam Schedule This Week</h3>
          <p className="text-xs text-muted mb-4">Exams scheduled in the next 7 days</p>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-lg bg-page animate-pulse" />)}
            </div>
          ) : examsInNextSevenDays(exams).length === 0 ? (
            <p className="text-sm text-muted py-6 text-center">No exams scheduled this week.</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {examsInNextSevenDays(exams).map((ex) => (
                <Link
                  key={ex.id}
                  href="/exams?tab=exams"
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-page transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-body">{ex.subject} — {ex.className ?? ex.classId}</p>
                    <p className="text-xs text-muted">{new Date(ex.date).toLocaleDateString('en-MW', { weekday: 'short', day: 'numeric', month: 'short' })} · {ex.timeStart}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="bg-surface border border-base rounded-xl p-5">
          <h3 className="font-heading font-semibold text-body mb-1">Results Release Queue</h3>
          <p className="text-xs text-muted mb-4">Approved results awaiting release</p>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded-lg bg-page animate-pulse" />)}
            </div>
          ) : examsAwaitingRelease(exams).length === 0 ? (
            <p className="text-sm text-muted py-6 text-center">Nothing waiting on release.</p>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {examsAwaitingRelease(exams).map((ex) => (
                <Link
                  key={ex.id}
                  href="/exams?tab=release"
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-page transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-body">{ex.subject} — {ex.className ?? ex.classId}</p>
                    <p className="text-xs text-muted">{ex.title}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}