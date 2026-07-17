'use client'

/**
 * apps/web/src/components/dashboards/FinanceDashboard.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE (stat-card data-wiring and quick-action
 *   link targets only — the overall visual layout is unaffected)
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: The stat cards were already wired to useFinanceSummary — but
 *   with hardcoded useFinanceSummary('2025/2026', 1) arguments, so this
 *   dashboard would silently show Term 1 2025/2026 figures forever. Year/
 *   term now come from useCurrentAcademicPeriod() (SETTING_KEYS, same
 *   phase). Loading/unavailable states go through the shared statValue()
 *   ('…' while loading, '—' when unavailable — the previous
 *   'Loading…' string overflowed the card on mobile). Quick actions:
 *   Record Payment and Generate Receipt both effectively landed on the
 *   /finances default tab; both now deep-link to /finances?tab=invoices
 *   where payments and receipts actually live (the page gains ?tab=
 *   initialisation this phase). PlaceholderWidget import moved to its new
 *   shared home.
 * [DEPENDS ON]: W/hooks/useFinances.ts (useFinanceSummary, enabled-gated
 *   this phase), W/hooks/useSettings.ts (useCurrentAcademicPeriod, same
 *   phase), W/components/shared/PlaceholderWidget.tsx (same phase),
 *   W/components/shared/StatCard.tsx (statValue, same phase),
 *   @shared/constants/malawi (formatMWK)
 */

import {
  Banknote,
  TrendingUp,
  TrendingDown,
  Clock,
  PlusCircle,
  FileText,
  Users,
  Receipt,
} from 'lucide-react'
import { StatCard, StatCardGrid, statValue } from '@/components/shared/StatCard'
import { QuickActions } from '@/components/shared/QuickActions'
import { FeeCollectionRadial } from '@/components/finances/FeeCollectionRadial'
import { IncomeExpenseChart } from '@/components/finances/IncomeExpenseChart'
import { useFinanceSummary } from '@/hooks/useFinances'
import { useCurrentAcademicPeriod } from '@/hooks/useSettings'
import { formatMWK } from '@shared/constants/malawi'
import type { QuickAction } from '@/components/shared/QuickActions'

const QUICK_ACTIONS: QuickAction[] = [
  {
    label: 'Record Payment',
    // R15: payments live in the Invoices tab (page reads ?tab= as of this phase)
    href: '/finances?tab=invoices',
    icon: PlusCircle,
    color: 'bg-brand-teal/10',
    text: 'text-brand-teal',
  },
  {
    label: 'Generate Receipt',
    // R15: receipts are issued from a recorded payment — same Invoices tab
    href: '/finances?tab=invoices',
    icon: Receipt,
    color: 'bg-emerald-50',
    text: 'text-emerald-600',
  },
  {
    label: 'Fee Reports',
    href: '/reports',
    icon: FileText,
    color: 'bg-blue-50',
    text: 'text-blue-600',
  },
  {
    label: 'Student Balances',
    href: '/finances?tab=invoices',
    icon: Users,
    color: 'bg-brand-amber/10',
    text: 'text-brand-amber',
  },
]

export function FinanceDashboard() {
  const { academicYear, term, isLoading: periodLoading } = useCurrentAcademicPeriod()
  const { data: summary, isLoading: summaryLoading } = useFinanceSummary(
    academicYear ?? '',
    term ?? 0,
  )

  const isLoading = periodLoading || summaryLoading
  const mwk = (v: number | undefined): string | undefined =>
    v === undefined ? undefined : formatMWK(v)

  return (
    <div className="space-y-6">
      <StatCardGrid className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Collected"
          value={statValue(isLoading, mwk(summary?.totalCollected))}
          icon={TrendingUp}
          trend="neutral"
          trendLabel={term ? `Term ${term}` : 'this term'}
          iconColor="bg-emerald-50"
          iconText="text-emerald-600"
        />
        <StatCard
          label="Outstanding Fees"
          value={statValue(isLoading, mwk(summary?.totalOutstanding))}
          icon={TrendingDown}
          trend="neutral"
          trendLabel="unpaid"
          iconColor="bg-brand-coral/10"
          iconText="text-brand-coral"
        />
        <StatCard
          label="Total Expenses"
          value={statValue(isLoading, mwk(summary?.totalExpenses))}
          icon={Banknote}
          trend="neutral"
          trendLabel="approved"
          iconColor="bg-brand-teal/10"
          iconText="text-brand-teal"
        />
        <StatCard
          label="Collection Rate"
          value={statValue(
            isLoading,
            summary ? `${summary.collectionPercent}%` : undefined,
          )}
          icon={Clock}
          trend="neutral"
          trendLabel="of target"
          iconColor="bg-brand-amber/10"
          iconText="text-brand-amber"
        />
      </StatCardGrid>
      <QuickActions actions={QUICK_ACTIONS} />
      <div className="grid md:grid-cols-2 gap-4">
        <FeeCollectionRadial
          academicYear={academicYear ?? ''}
          term={term ?? 0}
          periodLoading={periodLoading}
        />
        <IncomeExpenseChart
          academicYear={academicYear ?? ''}
          periodLoading={periodLoading}
        />
      </div>
    </div>
  )
}
