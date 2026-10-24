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
  PenLine,
  CheckCircle,
  ClipboardList,
  Settings,
  BarChart3,
} from 'lucide-react'
import Link from 'next/link'
import { QuickActions } from '@/components/shared/QuickActions'
import { useExams } from '@/hooks/useExams'
import { useExamOverview, useExamAttention, useExamPipeline } from '@/hooks/reporting/useExamsReporting'
import { Chart } from '@/components/shared/chart'
import { DashboardAttention } from './DashboardReport'
import { PrimaryOverviewKpis, ReportLinks, SecondaryKpis, TrendCard } from './DashboardSections'
import type { ReportLink } from './DashboardSections'
import { useViewingPeriod } from '@/hooks/useViewingPeriod'
import {
  examsInNextSevenDays,
  examsAwaitingRelease,
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

/** Lead with how complete the marks are and what is waiting on a decision; the rest sit in "More figures". */
const PREFERRED = ['markCompletion', 'awaitingApproval', 'awaitingRelease', 'blocked']

const REPORT_LINKS: ReportLink[] = [
  { label: 'Workflow', href: '/reports?tab=pipeline', description: 'Every exam, its stage, who must act, audit trail' },
  { label: 'Marks completion', href: '/reports?tab=completion', description: 'Entered and missing by class and subject' },
  { label: 'Subjects', href: '/reports?tab=subjects', description: 'Performance by subject' },
  { label: 'Marks', href: '/reports?tab=marks', description: 'Mark distributions' },
  { label: 'MANEB', href: '/reports?tab=maneb', description: 'JCE and MSCE candidates and outcomes' },
]

function ExamsLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 py-4">
      <p className="text-sm text-muted">Exams could not be loaded.</p>
      <button
        type="button"
        onClick={onRetry}
        className="min-h-11 rounded-lg border border-base px-3 text-xs font-medium text-brand-navy hover:bg-page focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
      >
        Retry
      </button>
    </div>
  )
}

export function ExamOfficerDashboard() {
  const { academicYear, term, isLoading: periodLoading } = useViewingPeriod()
  const { data: examsData, isLoading: examsLoading, isError: examsError, refetch: refetchExams } = useExams(
    undefined,
    academicYear ?? '',
    term ?? 0,
  )

  const exams     = examsData ?? []
  const isLoading = periodLoading || examsLoading

  const period = { academicYear: academicYear ?? '', term: term ?? undefined }
  const overview = useExamOverview(period)
  const attention = useExamAttention(period)
  const pipeline = useExamPipeline(period)

  return (
    <div className="space-y-4 md:space-y-6">
      <PrimaryOverviewKpis
        title="Examinations at a glance"
        summary="Check marking progress, results awaiting approval and exams still to be completed."
        academicYear={academicYear}
        term={term}
        overview={overview}
        preferred={PREFERRED}
        reportsHref="/reports?tab=completion"
      />
      <div className="grid md:grid-cols-2 gap-3 md:gap-4">
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
          ) : examsError ? (
            <ExamsLoadError onRetry={() => void refetchExams()} />
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
          ) : examsError ? (
            <ExamsLoadError onRetry={() => void refetchExams()} />
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
      <TrendCard
        title="Results pipeline"
        sub="Exams at each stage this term"
        isLoading={pipeline.isLoading}
        isError={pipeline.isError}
        onRetry={() => void pipeline.refetch()}
      >
        <Chart
          type="bar"
          data={(pipeline.data?.stages ?? []).map((st) => ({ x: st.label, count: st.count }))}
          series={[{ key: 'count', label: 'Exams' }]}
          height={200}
          emptyStateMessage="No exams this term."
          ariaLabel="Number of exams at each stage of the results pipeline"
        />
      </TrendCard>
      <DashboardAttention query={attention} title="Examination exceptions" limit={5} />
      <SecondaryKpis title="More figures and findings" overview={overview} preferred={PREFERRED} showInsights />
      <QuickActions actions={QUICK_ACTIONS} compact />
      <ReportLinks links={REPORT_LINKS} />
    </div>
  )
}
