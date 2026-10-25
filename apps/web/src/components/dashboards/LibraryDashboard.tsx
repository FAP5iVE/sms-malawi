'use client'

/**
 * apps/web/src/components/dashboards/LibraryDashboard.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE (stat-card data-wiring and quick-action
 *   link targets only — the overall visual layout is unaffected)
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: All four stat cards were permanent '—' placeholders. Wired to
 *   useLibraryStats() (GET /library/stats — library staff + high_rank,
 *   which this dashboard's role is): Total Books ← totalBooks; Currently
 *   Borrowed ← activeBorrowings; Overdue Books ← overdueBorrowings. The
 *   fourth card, "Returned Today", is a figure no endpoint produces —
 *   replaced by the real Pending Fines count (pendingFines) from the same
 *   stats call. Quick actions: /library/issue and /library/return have
 *   never existed as routes (guaranteed 404s) — both issuing and returning
 *   live in the Borrowings tab, so the two are corrected to
 *   /library?tab=borrowings, Search Catalog deep-links to
 *   /library?tab=catalog (the page reads ?tab= as of this phase), and
 *   Library Report stays on /reports. PlaceholderWidget import moved to
 *   its new shared home.
 * [DEPENDS ON]: W/hooks/useLibrary.ts (useLibraryStats),
 *   W/components/shared/PlaceholderWidget.tsx (same phase),
 *   W/components/shared/StatCard.tsx (statValue, same phase)
 */

import {
  PlusCircle,
  RotateCcw,
  Search,
  FileText,
} from 'lucide-react'
import { QuickActions } from '@/components/shared/QuickActions'
import { Chart } from '@/components/shared/chart'
import type { ChartDataPoint } from '@/components/shared/chart'
import { useOverdueByClass } from '@/hooks/useLibrary'
import { useLibraryOverview, useLibraryAttention } from '@/hooks/reporting/useLibraryReporting'
import { DashboardAttention } from './DashboardReport'
import { PrimaryOverviewKpis, ReportLinks, SecondaryKpis, TrendCard } from './DashboardSections'
import type { ReportLink } from './DashboardSections'
import { useLibraryBorrowingTrend } from '@/hooks/useAnalytics'
import type { QuickAction } from '@/components/shared/QuickActions'

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Issue Book',
    // R15: was /library/issue — a route that has never existed (404).
    // Issuing lives in the Borrowings tab (page reads ?tab= as of this phase).
    href: '/library?tab=borrowings',
    icon: PlusCircle,
    color: 'bg-brand-teal/10',
    text: 'text-brand-teal',
  },
  {
    label: 'Return Book',
    // R15: was /library/return (404) — returns live in the same Borrowings tab
    href: '/library?tab=borrowings',
    icon: RotateCcw,
    color: 'bg-blue-50',
    text: 'text-blue-600',
  },
  {
    label: 'Search Catalog',
    href: '/library?tab=catalog',
    icon: Search,
    color: 'bg-brand-amber/10',
    text: 'text-brand-amber',
  },
  {
    label: 'Library Report',
    href: '/reports',
    icon: FileText,
    color: 'bg-brand-navy/8',
    text: 'text-brand-navy',
  },
]

/** Lead with what is overdue and what is out; the rest sit in "More figures". */
const PREFERRED = ['overdueRate', 'activeLoans', 'availability', 'finesPending']

const REPORT_LINKS: ReportLink[] = [
  { label: 'Overview', href: '/reports?tab=overview', description: 'Every library figure with its definition' },
  { label: 'Circulation', href: '/reports?tab=circulation', description: 'Loans, returns, overdue' },
  { label: 'Borrowing', href: '/reports?tab=borrowing', description: 'Who borrows what' },
  { label: 'Fines', href: '/reports?tab=fines', description: 'Pending and collected' },
  { label: 'Digital library', href: '/reports?tab=digital', description: 'Views of approved resources' },
  { label: 'Physical stock', href: '/reports?tab=stock', description: 'Copies, losses, no-copy titles' },
]

export function LibraryDashboard() {
  const overview = useLibraryOverview()
  const attention = useLibraryAttention()
  const { data: borrowTrend = [], isLoading: trendLoading, isError: trendError, refetch: refetchTrend } = useLibraryBorrowingTrend(12)
  const { data: overdueByClass = [], isLoading: overdueLoading, isError: overdueError, refetch: refetchOverdue } = useOverdueByClass()

  const borrowData: ChartDataPoint[] = borrowTrend.map((p) => ({
    x: p.label,
    borrowings: p.value,
  }))

  return (
    <div className="space-y-4 md:space-y-6">
      <PrimaryOverviewKpis
        title="Library at a glance"
        summary="See which books are out, what is overdue and what is available to borrow."
        overview={overview}
        preferred={PREFERRED}
        reportsHref="/reports?tab=overview"
      />
      <div className="grid md:grid-cols-2 gap-3 md:gap-4">
        <TrendCard
          title="Borrowing trend"
          sub="Weekly borrowing activity (last 12 weeks)"
          isLoading={trendLoading}
          isError={trendError}
          onRetry={() => void refetchTrend()}
          height={220}
        >
          <Chart
            type="bar"
            data={borrowData}
            series={[{ key: 'borrowings', label: 'Borrowings' }]}
            height={220}
            emptyStateMessage="No borrowing activity recorded yet."
            ariaLabel="Weekly book-borrowing activity over the last 12 weeks"
          />
        </TrendCard>
        {/* [PRODUCTION FIX 2026-07-29] Was a permanent PlaceholderWidget
            stub, deferred during the librarian console build and never
            actually closed out. Real data via getOverdueByClass(). */}
        {/* [FIX] Was `h-32 md:h-40` — a fixed 128/160px box beside a ~330px chart
            card, so it read as a short stub and clipped the list. On md+ the
            wrapper takes the grid row's height (set by the Borrowing trend
            card) and the card is absolutely filled into it, so a long list
            scrolls inside the card instead of stretching the row. Same frame,
            padding and title/sub styling as ChartCard. */}
        <div className="relative md:min-h-72">
          <div className="flex h-full flex-col rounded-xl border border-base bg-surface p-3 sm:p-5 md:absolute md:inset-0">
            <div className="mb-3 sm:mb-4">
              <p className="font-heading font-semibold text-sm text-brand-navy">Overdue Students</p>
              <p className="mt-1 text-xs text-muted">Open loans past their due date, by class</p>
            </div>
            {overdueLoading ? (
              <div className="flex-1 space-y-2" role="status" aria-label="Overdue students — loading">
                {[1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-8 w-full rounded-lg" aria-hidden />)}
              </div>
            ) : overdueError ? (
              <div role="alert" className="flex flex-1 flex-col items-start gap-2">
                <p className="text-sm text-muted">Overdue books could not be loaded.</p>
                <button
                  type="button"
                  onClick={() => void refetchOverdue()}
                  className="min-h-11 rounded-lg border border-base px-3 text-xs font-medium text-brand-navy hover:bg-page focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
                >
                  Retry
                </button>
              </div>
            ) : overdueByClass.length === 0 ? (
              <p className="flex flex-1 items-center justify-center py-8 text-center text-sm text-muted">
                No overdue books right now.
              </p>
            ) : (
              <div className="min-h-0 max-h-72 flex-1 space-y-3 overflow-y-auto pr-1 md:max-h-none">
                {overdueByClass.map((c) => (
                  <div key={c.className}>
                    <p className="text-xs font-heading font-semibold text-muted uppercase">{c.className} · {c.students.length}</p>
                    {c.students.slice(0, 3).map((s, i) => (
                      <p key={i} className="truncate text-xs text-body">{s.studentName} — {s.bookTitle}</p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <DashboardAttention query={attention} title="Library attention queue" limit={5} />
      <SecondaryKpis title="More figures and findings" overview={overview} preferred={PREFERRED} showInsights />
      <QuickActions actions={QUICK_ACTIONS} compact />
      <ReportLinks links={REPORT_LINKS} />
    </div>
  )
}
