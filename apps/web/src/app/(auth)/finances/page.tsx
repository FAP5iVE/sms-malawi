'use client'

/**
 * apps/web/src/app/(auth)/finances/page.tsx
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: Initialises the active tab from ?tab= (post-hydration,
 *   validated against the role-visible tab list) so FinanceDashboard's
 *   corrected quick actions can deep-link into Invoices/Expenses/etc.
 * [DEPENDS ON]: none
 */

import { useState, Suspense }    from 'react'
import { useSearchParams }       from 'next/navigation'
import { RoleGuard }             from '@/components/shared/RoleGuard'
import { useAuthStore }          from '@/store/authStore'
import { InvoicesTab }           from '@/components/finances/InvoicesTab'
import { ExpensesTab }           from '@/components/finances/ExpensesTab'
import { PayrollTab }            from '@/components/finances/PayrollTab'
import { BudgetTab }             from '@/components/finances/BudgetTab'
import { FeeStructureTab }       from '@/components/finances/FeeStructureTab'
import { useFinanceSummary }     from '@/hooks/useFinances'
import { ScholarshipTab }        from '@/components/finances/ScholarshipTab'
import { ReportsExportPanel }    from '@/components/finances/ReportsExportPanel'
import { LibraryFinesTab }       from '@/components/finances/LibraryFinesTab'
import { ForecastPanel }         from '@/components/finances/ForecastPanel'
import { AccountingLedgerTab }   from '@/components/finances/AccountingLedgerTab'
import { DebtsLoansTab }         from '@/components/finances/DebtsLoansTab'
import { formatMWK }             from '@shared/constants/malawi'
import { Banknote, TrendingDown, TrendingUp, PieChart } from 'lucide-react'
import { ModuleTabs }            from '@/components/shared/ModuleTabs'

type Tab =
  | 'invoices'
  | 'expenses'
  | 'payroll'
  | 'budget'
  | 'feeStructure'
  | 'scholarships'
  | 'fines'
  | 'reports'
  | 'forecast'
  | 'ledger'
  | 'debts'

export default function FinancesPage() {
  return (
    <RoleGuard allowed={['admin', 'high_rank', 'finance', 'student', 'hr']}>
      {/* useSearchParams() requires a Suspense boundary or `next build` fails —
          same convention as (public)/login/page.tsx and (auth)/exams/page.tsx.
          [PRODUCTION FIX 2026-07-28] fallback was `null` — a literal blank
          screen with no loading indicator and no error during any
          suspension, matching the reported "blank, no error" symptom
          exactly. useSearchParams() inside Suspense is a known Next.js App
          Router trip-hazard for intermittent re-suspension on client-side
          navigation; a real skeleton doesn't fix the underlying navigation
          quirk by itself, but it turns "looks completely broken" into
          "visibly loading," and gives a diagnosable state if it recurs. */}
      <Suspense fallback={<FinancesLoadingSkeleton />}>
        <FinancesContent />
      </Suspense>
    </RoleGuard>
  )
}

function FinancesLoadingSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading finances">
      <div className="h-8 w-40 rounded-lg bg-surface animate-pulse" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 rounded-xl bg-surface animate-pulse" />)}
      </div>
      <div className="h-64 rounded-xl bg-surface animate-pulse" />
    </div>
  )
}

function FinancesContent() {
  const { role }   = useAuthStore()
  const YEAR = '2025/2026'
  const TERM = 1

  const isStudent = role === 'student'
  const isFinance = role === 'finance' || role === 'admin'
  // HR reaches this page for read-only payroll visibility only (it holds
  // finance.viewPayrollRuns, not the finance-management permissions). high_rank
  // retains its existing broader finance visibility, so scope this strictly to
  // the 'hr' role: HR sees the Payroll tab and nothing else here.
  const isHRPayrollViewer = role === 'hr'

  // Don't fetch the finance summary for the HR payroll viewer — the summary is
  // never rendered for them and GET /finances/summary would 403 (HR lacks it).
  // useFinanceSummary is enabled-gated on both args being truthy, so passing an
  // empty year disables the query without changing the hook's signature.
  const { data: summary, isLoading: summaryLoading } = useFinanceSummary(
    isHRPayrollViewer ? '' : YEAR,
    isHRPayrollViewer ? 0 : TERM,
  )

  // Build visible tab list — filtered by role, then mapped to clean TabItem shape
  // (strips the `show` field before passing to ModuleTabs for type safety)
  const TABS = [
    { id: 'invoices'     as Tab, label: isStudent ? 'My Fees' : 'Invoices', show: !isHRPayrollViewer            },
    { id: 'expenses'     as Tab, label: 'Expenses',                          show: isFinance                     },
    { id: 'payroll'      as Tab, label: 'Payroll',                           show: isFinance || isHRPayrollViewer },
    { id: 'budget'       as Tab, label: 'Budget',                            show: !isStudent && !isHRPayrollViewer },
    { id: 'feeStructure' as Tab, label: 'Fee Structure',                     show: isFinance                     },
    { id: 'scholarships' as Tab, label: 'Scholarships',                      show: isFinance                     },
    { id: 'fines'        as Tab, label: 'Library Fines',                     show: isFinance                     },
    // [PRODUCTION FIX 2026-07-27] Forecast and Ledger were fully-built,
    // orphaned components (ForecastPanel.tsx / AccountingLedgerTab.tsx) —
    // real backend routes, zero UI wiring. Debts & Loans is new. All three
    // gated the same as Expenses/Scholarships/Fines — finance-management
    // only, not students, not the HR read-only payroll viewer.
    { id: 'forecast'     as Tab, label: 'Forecast',                          show: isFinance                     },
    { id: 'debts'        as Tab, label: 'Debts & Loans',                     show: isFinance                     },
    { id: 'ledger'       as Tab, label: 'Ledger',                            show: isFinance                     },
    { id: 'reports'      as Tab, label: 'Reports',                           show: isFinance                     },
  ]
    .filter((t) => t.show)
    .map(({ id, label }) => ({ id, label }))

  // R19 — the active tab is derived from ?tab= during render via Next's
  // useSearchParams() (the codebase's established pattern — see
  // (public)/login/page.tsx and (auth)/exams/page.tsx) instead of a
  // useEffect that read window.location.search and called setActiveTab
  // post-mount. useSearchParams() is backed by the actual request URL on
  // the server, so the correct deep-linked tab (Record Payment / Generate
  // Receipt → /finances?tab=invoices etc.) now renders on first paint,
  // and only a tab this role can actually see is ever accepted.
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  // HR can only see the payroll tab, so its default (and any invalid ?tab=)
  // resolves to 'payroll' rather than the invoices tab it can't open.
  const fallbackTab: Tab = isHRPayrollViewer ? 'payroll' : 'invoices'
  const initialTab: Tab = tabParam && TABS.some((tab) => tab.id === tabParam) ? (tabParam as Tab) : fallbackTab

  const [activeTab, setActiveTab] = useState<Tab>(initialTab)

  // [PRODUCTION FIX 2026-07-28, revised] useState(initialTab) only
  // captures its value on first mount — deep-linking to a different tab
  // (e.g. clicking a quick action for /finances?tab=budget while already
  // on /finances?tab=invoices) never updated activeTab, since the
  // component doesn't remount for a client-side navigation that only
  // changes the query string.
  // First attempt used useEffect + setState, which react-hooks/
  // set-state-in-effect correctly flags — that causes an extra, avoidable
  // cascading render. This is React's own recommended pattern instead:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-state-based-on-a-prop-change
  // — adjust state directly during render (guarded so it only runs when
  // tabParam has actually changed since the last render), not in an effect.
  const [prevTabParam, setPrevTabParam] = useState(tabParam)
  if (tabParam !== prevTabParam) {
    setPrevTabParam(tabParam)
    if (tabParam && TABS.some((t) => t.id === tabParam)) {
      setActiveTab(tabParam as Tab)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-bold text-brand-navy">
          {isStudent ? 'My Fees & Payments' : isHRPayrollViewer ? 'Payroll' : 'Finances'}
        </h1>
        <p className="text-sm text-muted mt-0.5">
          {isHRPayrollViewer ? 'Payroll run history (view only)' : `Academic Year ${YEAR} · Term ${TERM}`}
        </p>
      </div>

      {/* Summary stats — finance staff only (not students, not HR payroll viewers) */}
      {!isStudent && !isHRPayrollViewer && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard
            label="Total Collected"
            value={summaryLoading ? '…' : formatMWK(summary?.totalCollected ?? 0)}
            icon={TrendingUp}
            color="text-emerald-600"
            bg="bg-emerald-50"
          />
          <SummaryCard
            label="Outstanding"
            value={summaryLoading ? '…' : formatMWK(summary?.totalOutstanding ?? 0)}
            icon={TrendingDown}
            color="text-brand-coral"
            bg="bg-brand-coral/10"
          />
          <SummaryCard
            label="Total Expenses"
            value={summaryLoading ? '…' : formatMWK(summary?.totalExpenses ?? 0)}
            icon={Banknote}
            color="text-brand-amber"
            bg="bg-brand-amber/10"
          />
          <SummaryCard
            label="Collection Rate"
            value={summaryLoading ? '…' : `${summary?.collectionPercent ?? 0}%`}
            icon={PieChart}
            color="text-brand-teal"
            bg="bg-brand-teal/10"
          />
        </div>
      )}

      {/* Mobile-scrollable tab navigation — C7 */}
      <ModuleTabs<Tab>
        tabs={TABS}
        active={activeTab}
        onChange={setActiveTab}
        variant="underline"
        id="finance-tabs"
      />

      {/* Tab content */}
      {activeTab === 'invoices'     && <InvoicesTab      academicYear={YEAR} term={TERM} />}
      {activeTab === 'expenses'     && <ExpensesTab      academicYear={YEAR} term={TERM} />}
      {activeTab === 'payroll'      && <PayrollTab />}
      {activeTab === 'budget'       && <BudgetTab        academicYear={YEAR} />}
      {activeTab === 'feeStructure' && <FeeStructureTab  academicYear={YEAR} />}
      {activeTab === 'scholarships' && <ScholarshipTab   academicYear={YEAR} />}
      {activeTab === 'fines'        && <LibraryFinesTab />}
      {activeTab === 'forecast'     && <ForecastPanel />}
      {activeTab === 'debts'        && <DebtsLoansTab />}
      {activeTab === 'ledger'       && <AccountingLedgerTab />}
      {activeTab === 'reports'      && <ReportsExportPanel academicYear={YEAR} term={TERM} />}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  color,
  bg,
}: {
  label: string
  value: string
  icon: React.ElementType
  color: string
  bg: string
}) {
  return (
    <div className="bg-surface border border-base rounded-xl p-4 flex items-start gap-3 min-w-0">
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${bg}`}
      >
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-lg sm:text-xl font-bold font-heading text-brand-navy tabular break-words">
          {value}
        </p>
        <p className="text-xs text-muted mt-0.5">{label}</p>
      </div>
    </div>
  )
}