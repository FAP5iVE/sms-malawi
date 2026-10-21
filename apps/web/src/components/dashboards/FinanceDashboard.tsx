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
  PlusCircle,
  FileText,
  Users,
  Receipt,
} from 'lucide-react'
import { QuickActions } from '@/components/shared/QuickActions'
import { IncomeExpenseChart } from '@/components/finances/IncomeExpenseChart'
import { useFinanceOverview, useFinanceAttention } from '@/hooks/reporting/useFinanceReporting'
import { DashboardAttention } from './DashboardReport'
import { PrimaryOverviewKpis, ReportLinks, SecondaryKpis } from './DashboardSections'
import type { ReportLink } from './DashboardSections'
import { useViewingPeriod } from '@/hooks/useViewingPeriod'
import type { QuickAction } from '@/components/shared/QuickActions'

const QUICK_ACTIONS: QuickAction[] = [
  {
    // [PRODUCTION FIX] Added — none of the four actions below actually
    // created an invoice; they all just landed on the tab passively
    // (Record Payment / Generate Receipt need an existing invoice to act
    // on, Student Balances is read-only).
    // [2026-09-05] Invoice Entry & Allocation replaced the old
    // list-plus-two-modals design with one always-present entry screen —
    // there's no longer a separate "new invoice" mode to deep-link into,
    // so ?action=new was dropped; landing on the tab and searching for the
    // student now IS the new-invoice flow.
    label: 'New Invoice',
    href: '/finances?tab=invoices',
    icon: FileText,
    color: 'bg-brand-navy/10',
    text: 'text-brand-navy',
  },
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

/** Lead with collection and what is owed; the rest sit in "More figures". */
const PREFERRED = ['collectionRate', 'outstanding', 'overdue', 'budgetUtilisation']

const REPORT_LINKS: ReportLink[] = [
  { label: 'Fee collection', href: '/reports?tab=collection', description: 'Billed, collected and rate by term' },
  { label: 'Receivables ageing', href: '/reports?tab=aging', description: 'Overdue invoices by age' },
  { label: 'Outstanding by class', href: '/reports?tab=outstanding', description: 'Who owes what, by class' },
  { label: 'Expenses and budget', href: '/reports?tab=expenses', description: 'Spend against budget' },
  { label: 'Cash flow', href: '/reports?tab=cashflow', description: 'Money in and out' },
  { label: 'Payments', href: '/reports?tab=payments', description: 'Receipts and methods' },
]

export function FinanceDashboard() {
  const { academicYear, term, isLoading: periodLoading } = useViewingPeriod()
  const period = { academicYear: academicYear ?? '', term: term ?? undefined }
  const overview = useFinanceOverview(period)
  const attention = useFinanceAttention(period)

  return (
    <div className="space-y-4 md:space-y-6">
      <PrimaryOverviewKpis
        title="Finance at a glance"
        summary="Collection, what is owed and how much of the budget is spent. Tap a figure to open its report."
        academicYear={academicYear}
        term={term}
        overview={overview}
        preferred={PREFERRED}
        reportsHref="/reports?tab=overview"
      />
      <IncomeExpenseChart academicYear={academicYear ?? ''} periodLoading={periodLoading} />
      <DashboardAttention query={attention} title="Finance exceptions" limit={5} />
      <SecondaryKpis title="More figures and findings" overview={overview} preferred={PREFERRED} showInsights />
      <QuickActions actions={QUICK_ACTIONS} compact />
      <ReportLinks links={REPORT_LINKS} />
    </div>
  )
}
