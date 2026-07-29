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
  BookOpen,
  BookX,
  Library,
  PlusCircle,
  RotateCcw,
  Search,
  FileText,
  AlertTriangle,
} from 'lucide-react'
import { StatCard, StatCardGrid, statValue } from '@/components/shared/StatCard'
import { QuickActions } from '@/components/shared/QuickActions'
import { ChartCard } from '@/components/shared/ChartCard'
import { Chart } from '@/components/shared/chart'
import type { ChartDataPoint } from '@/components/shared/chart'
import { useLibraryStats, useOverdueByClass } from '@/hooks/useLibrary'
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

export function LibraryDashboard() {
  const { data: stats, isLoading } = useLibraryStats()
  const { data: borrowTrend = [], isLoading: trendLoading } = useLibraryBorrowingTrend(12)
  const { data: overdueByClass = [], isLoading: overdueLoading } = useOverdueByClass()

  const borrowData: ChartDataPoint[] = borrowTrend.map((p) => ({
    x: p.label,
    borrowings: p.value,
  }))

  return (
    <div className="space-y-6">
      <StatCardGrid className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Books"
          value={statValue(isLoading, stats?.totalBooks)}
          icon={Library}
          trend="neutral"
          trendLabel="in catalog"
          iconColor="bg-brand-navy/8"
          iconText="text-brand-navy"
          href="/library"
        />
        <StatCard
          label="Currently Borrowed"
          value={statValue(isLoading, stats?.activeBorrowings)}
          icon={BookOpen}
          trend="neutral"
          trendLabel="checked out"
          iconColor="bg-brand-teal/10"
          iconText="text-brand-teal"
          href="/library?tab=borrowings"
        />
        <StatCard
          label="Overdue Books"
          value={statValue(isLoading, stats?.overdueBorrowings)}
          icon={BookX}
          trend="neutral"
          trendLabel="past due"
          iconColor="bg-brand-coral/10"
          iconText="text-brand-coral"
          href="/library?tab=borrowings"
        />
        <StatCard
          label="Pending Fines"
          value={statValue(isLoading, stats?.pendingFines)}
          icon={AlertTriangle}
          trend="neutral"
          trendLabel="unpaid"
          iconColor="bg-brand-amber/10"
          iconText="text-brand-amber"
          href="/library?tab=reports"
        />
      </StatCardGrid>
      <QuickActions actions={QUICK_ACTIONS} />
      <div className="grid md:grid-cols-2 gap-4">
        <ChartCard
          title="Borrow Trends"
          sub="Weekly borrowing activity (last 12 weeks)"
          isLoading={trendLoading}
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
        </ChartCard>
        {/* [PRODUCTION FIX 2026-07-29] Was a permanent PlaceholderWidget
            stub, deferred during the librarian console build and never
            actually closed out. Real data via getOverdueByClass(). */}
        <div className="bg-surface border border-base rounded-xl p-4 h-32 md:h-40 flex flex-col">
          <p className="font-heading font-semibold text-sm text-brand-navy mb-2">Overdue Students</p>
          {overdueLoading ? (
            <div className="space-y-1.5 flex-1">
              {[1, 2].map((i) => <div key={i} className="h-6 rounded-lg bg-page animate-pulse" />)}
            </div>
          ) : overdueByClass.length === 0 ? (
            <p className="text-sm text-muted flex-1 flex items-center justify-center text-center">
              No overdue books right now.
            </p>
          ) : (
            <div className="space-y-2 overflow-y-auto flex-1">
              {overdueByClass.map((c) => (
                <div key={c.className}>
                  <p className="text-xs font-heading font-semibold text-muted uppercase">{c.className} · {c.students.length}</p>
                  {c.students.slice(0, 3).map((s, i) => (
                    <p key={i} className="text-xs text-body truncate">{s.studentName} — {s.bookTitle}</p>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}