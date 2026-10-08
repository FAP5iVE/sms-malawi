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
 *   2026-09-05 — YEAR/TERM were hardcoded ('2025/2026' / 1) instead of
 *   using useCurrentAcademicPeriod() (SETTING_KEYS), unlike every other
 *   page in the app (PageHeader, every dashboard) since R15 -- fixed to
 *   match that established pattern; a genuine year/term rollover would
 *   otherwise have silently kept every finance tab pinned to 2025/2026.
 *
 * [CHANGE TYPE]: REWORK -- 14 flat tabs -> 7 grouped tabs with sub-tabs, and
 *   the period now comes from the universal viewing-period filter.
 * [PURPOSE]:
 *   1. YEAR/TERM now come from useViewingPeriod() (the header's period
 *      switcher), not the school's current setting directly, so Finance can
 *      finally be pointed at last term / last year. Every tab is passed it.
 *   2. The horizontal tab strip was 14 wide. Related screens are grouped:
 *        Billing      Invoices / Bulk Generator / Scholarships / Library Fines
 *        Fee Setup    Fee Catalog / Student Fee Structure
 *        Spending     Expenses / Debts & Loans
 *        Budget       Allocations / Windows / Forecast
 *        Procurement  (its own workspace)
 *        Payroll      (its own workspace)
 *        Accounting   Ledger / Reports
 *      Components are untouched; only navigation moved. Every pre-existing
 *      ?tab= value (invoices, expenses, budget, feeStructure, ...) still
 *      deep-links to the same screen: it resolves to its leaf, and the
 *      leaf's group highlights automatically. ?tab=windows is new.
 * [DEPENDS ON]: @/hooks/useViewingPeriod
 */

import { useState, Suspense }    from 'react'
import { useSearchParams }       from 'next/navigation'
import { RoleGuard }             from '@/components/shared/RoleGuard'
import { ModuleSurface }         from '@/components/shared/ModuleSurface'
import { useAuthStore }          from '@/store/authStore'
import { useViewingPeriod }      from '@/hooks/useViewingPeriod'
import { InvoicesTab }           from '@/components/finances/InvoicesTab'
import { ExpensesTab }           from '@/components/finances/ExpensesTab'
import { PayrollTab }            from '@/components/finances/PayrollTab'
import { BudgetTab }             from '@/components/finances/BudgetTab'
import { BudgetWindowsPanel }    from '@/components/finances/BudgetWindowsPanel'
import { FeeStructureTab }       from '@/components/finances/FeeStructureTab'
import { FinanceFeeStructureTab } from '@/components/finances/FinanceFeeStructureTab'
import { BulkInvoiceGenerator }   from '@/components/finances/BulkInvoiceGenerator'
import { useFinanceSummary }     from '@/hooks/useFinances'
import { ScholarshipTab }        from '@/components/finances/ScholarshipTab'
import { ReportsExportPanel }    from '@/components/finances/ReportsExportPanel'
import { LibraryFinesTab }       from '@/components/finances/LibraryFinesTab'
import { ForecastPanel }         from '@/components/finances/ForecastPanel'
import { AccountingLedgerTab }   from '@/components/finances/AccountingLedgerTab'
import { DebtsLoansTab }         from '@/components/finances/DebtsLoansTab'
import { ProcurementWorkspace }  from '@/components/finances/ProcurementWorkspace'
import { formatMWK }             from '@shared/constants/malawi'
import { Banknote, TrendingDown, TrendingUp, PieChart } from 'lucide-react'
import { ModuleTabs }            from '@/components/shared/ModuleTabs'

type Tab =
  | 'invoices'
  | 'expenses'
  | 'payroll'
  | 'budget'
  | 'feeStructure'
  | 'financeFeeStructure'
  | 'bulkInvoiceGenerator'
  | 'scholarships'
  | 'fines'
  | 'reports'
  | 'forecast'
  | 'ledger'
  | 'debts'
  // R22 — the new Assets/Inventory/Procurement redesign's requisition-through-
  // goods-receipt workflow. A distinct tab from 'budget' (which stays the
  // existing Budget/Expense screen, untouched) since this is new territory.
  | 'procurement'
  // Moved here from Procurement's sub-tabs: the calendar half of the budget.
  | 'windows'

type GroupId =
  | 'billing' | 'feeSetup' | 'spending' | 'budget' | 'procurement' | 'payroll' | 'accounting'

interface LeafDef  { id: Tab; label: string; show: boolean }
interface GroupDef { id: GroupId; label: string; leaves: LeafDef[] }

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 rounded-xl bg-surface animate-pulse" />)}
      </div>
      <div className="h-64 rounded-xl bg-surface animate-pulse" />
    </div>
  )
}

function FinancesContent() {
  const { role }   = useAuthStore()
  // [UNIVERSAL PERIOD FILTER] The viewing period (header switcher), not the
  // school's current setting: this is what makes past terms reachable here.
  const { academicYear, term: viewingTerm, isLoading: periodLoading } = useViewingPeriod()
  const YEAR = academicYear ?? ''
  const TERM = viewingTerm ?? 0

  const isStudent = role === 'student'
  const isFinance = role === 'finance' || role === 'admin'
  // HR reaches this page for read-only payroll visibility only (it holds
  // finance.viewPayrollRuns, not the finance-management permissions).
  const isHRPayrollViewer = role === 'hr'
  // [PRODUCTION FIX] The comment this replaced claimed "high_rank retains
  // its existing broader finance visibility" — that was false: isFinance
  // above only ever matched 'finance' and 'admin', so high_rank could see
  // nothing here but Invoices and Budget. high_rank formally holds
  // finance.approveExpense/rejectExpense and finance.approvePayroll
  // (packages/shared/types/permissions.ts), which is exactly what this
  // page's Expenses and Payroll tabs gate their approve/reject/approve
  // actions on internally (ExpensesTab.tsx already checks
  // can('finance.approveExpense'); PayrollApprovalPanel checks
  // can('finance.approvePayroll')) — so high_rank had a real, working
  // approval permission with literally no tab that would ever render it.
  // That's the direct cause of "finance modules that require High rank
  // approval do not appear in the high rank tab or anywhere."
  const isHighRank = role === 'high_rank'

  // Don't fetch the finance summary for the HR payroll viewer — the summary is
  // never rendered for them and GET /finances/summary would 403 (HR lacks it).
  // useFinanceSummary is enabled-gated on both args being truthy, so passing an
  // empty year disables the query without changing the hook's signature.
  const { data: summary, isLoading: summaryLoading } = useFinanceSummary(
    isHRPayrollViewer ? '' : YEAR,
    isHRPayrollViewer ? 0 : TERM,
  )

  // Visibility is decided per LEAF (exactly as it was per flat tab before);
  // a group shows only if at least one of its leaves does, so students and
  // the HR payroll viewer still see just their own screens.
  const GROUPS: GroupDef[] = ([
    {
      id: 'billing', label: isStudent ? 'My Fees' : 'Billing', leaves: [
        { id: 'invoices',             label: 'Invoices',        show: !isHRPayrollViewer },
        { id: 'bulkInvoiceGenerator', label: 'Bulk Generator',  show: isFinance },
        { id: 'scholarships',         label: 'Scholarships',    show: isFinance },
        { id: 'fines',                label: 'Library Fines',   show: isFinance },
      ],
    },
    {
      // feeStructure is the fee catalog *definition*; financeFeeStructure is its
      // per-student *application* (the bursar workstation). Natural pair.
      id: 'feeSetup', label: 'Fee Setup', leaves: [
        { id: 'feeStructure',        label: 'Fee Catalog',           show: isFinance },
        { id: 'financeFeeStructure', label: 'Student Fee Structure', show: isFinance },
      ],
    },
    {
      // high_rank holds finance.approveExpense/rejectExpense, so it reaches Expenses.
      id: 'spending', label: 'Spending', leaves: [
        { id: 'expenses', label: 'Expenses',       show: isFinance || isHighRank },
        { id: 'debts',    label: 'Debts & Loans',  show: isFinance },
      ],
    },
    {
      id: 'budget', label: 'Budget', leaves: [
        { id: 'budget',   label: 'Allocations', show: !isStudent && !isHRPayrollViewer },
        { id: 'windows',  label: 'Windows',     show: !isStudent && !isHRPayrollViewer },
        { id: 'forecast', label: 'Forecast',    show: isFinance },
      ],
    },
    {
      // Requisition-through-goods-receipt workflow. Review/approve/PO/receipt
      // actions are gated inside ProcurementWorkspace via PermissionGuard.
      id: 'procurement', label: 'Procurement', leaves: [
        { id: 'procurement', label: 'Procurement', show: isFinance || isHighRank || role === 'academic' || role === 'hr' },
      ],
    },
    {
      // high_rank holds finance.approvePayroll; HR gets read-only run history.
      id: 'payroll', label: 'Payroll', leaves: [
        { id: 'payroll', label: 'Payroll', show: isFinance || isHRPayrollViewer || isHighRank },
      ],
    },
    {
      id: 'accounting', label: 'Accounting', leaves: [
        { id: 'ledger',  label: 'Ledger',  show: isFinance },
        { id: 'reports', label: 'Reports', show: isFinance },
      ],
    },
  ] as GroupDef[])
    .map((g) => ({ ...g, leaves: g.leaves.filter((l) => l.show) }))
    .filter((g) => g.leaves.length > 0)

  const isVisibleLeaf = (id: string | null): id is Tab =>
    !!id && GROUPS.some((g) => g.leaves.some((l) => l.id === id))

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
  const initialTab: Tab = isVisibleLeaf(tabParam) ? tabParam : fallbackTab

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
    if (isVisibleLeaf(tabParam)) {
      setActiveTab(tabParam)
    }
  }

  // The active GROUP is derived from the active leaf, so a legacy
  // ?tab=expenses highlights "Spending" with no extra state to keep in sync.
  const activeGroup = GROUPS.find((g) => g.leaves.some((l) => l.id === activeTab)) ?? GROUPS[0]
  const currentLeaf: Tab | undefined =
    activeGroup?.leaves.find((l) => l.id === activeTab)?.id ?? activeGroup?.leaves[0]?.id
  function selectGroup(id: GroupId) {
    // `leaves[0]` is `T | undefined` under noUncheckedIndexedAccess; a group
    // is only ever built with >= 1 leaf, but say so in the types, not a cast.
    const first = GROUPS.find((x) => x.id === id)?.leaves[0]
    if (first) setActiveTab(first.id)
  }

  // Same skeleton the Suspense boundary above already uses -- avoids
  // rendering every tab against an empty-string/zero academicYear/term
  // for the one render before the real setting resolves.
  if (periodLoading) return <FinancesLoadingSkeleton />

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

      <ModuleSurface>
      {/* Summary stats — finance staff only (not students, not HR payroll viewers) */}
      {!isStudent && !isHRPayrollViewer && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
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

      {/* Level 1: the 7 grouped tabs */}
      <ModuleTabs<GroupId>
        tabs={GROUPS.map(({ id, label }) => ({ id, label }))}
        active={activeGroup?.id ?? 'billing'}
        onChange={selectGroup}
        variant="underline"
        id="finance-tabs"
      />

      {/* Level 2: sub-tabs, only when the group actually has more than one screen */}
      {activeGroup && activeGroup.leaves.length > 1 && (
        <ModuleTabs<Tab>
          tabs={activeGroup.leaves.map(({ id, label }) => ({ id, label }))}
          active={currentLeaf ?? activeGroup.leaves[0]?.id ?? activeTab}
          onChange={setActiveTab}
          variant="underline"
          id={`finance-subtabs-${activeGroup.id}`}
        />
      )}

      {/* Tab content */}
      {currentLeaf === 'invoices'     && <InvoicesTab      academicYear={YEAR} term={TERM} />}
      {currentLeaf === 'expenses'     && <ExpensesTab      academicYear={YEAR} term={TERM} />}
      {/* [PRODUCTION FIX] PayrollTab now mounts the full Payroll workspace
         (Runs & Approvals / Salary Structure & Allowances / My Pay /
         Financial Insights & Trends / PAYE & Pension Settings — see
         PayrollWorkspace.tsx), including the full submit → approve → lock →
         rollback workflow. The standalone PayrollApprovalPanel this comment
         used to describe was folded into that workspace's Runs &
         Approvals tab and deleted; importing it here separately (as an
         earlier revision of this file did) breaks the build, since the
         file no longer exists. */}
      {currentLeaf === 'payroll'      && <PayrollTab />}
      {currentLeaf === 'budget'       && <BudgetTab        academicYear={YEAR} term={TERM} />}
      {currentLeaf === 'windows'      && <BudgetWindowsPanel academicYear={YEAR} term={TERM} />}
      {currentLeaf === 'procurement'  && <ProcurementWorkspace />}
      {currentLeaf === 'feeStructure'        && <FeeStructureTab        academicYear={YEAR} />}
      {currentLeaf === 'financeFeeStructure' && <FinanceFeeStructureTab academicYear={YEAR} term={TERM} />}
      {currentLeaf === 'bulkInvoiceGenerator' && <BulkInvoiceGenerator key={`${YEAR}-${TERM}`} />}
      {currentLeaf === 'scholarships' && <ScholarshipTab   academicYear={YEAR} />}
      {currentLeaf === 'fines'        && <LibraryFinesTab />}
      {currentLeaf === 'forecast'     && <ForecastPanel key={`${YEAR}-${TERM}`} />}
      {currentLeaf === 'debts'        && <DebtsLoansTab />}
      {currentLeaf === 'ledger'       && <AccountingLedgerTab key={`${YEAR}-${TERM}`} />}
      {currentLeaf === 'reports'      && <ReportsExportPanel academicYear={YEAR} term={TERM} />}
      </ModuleSurface>
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
        <p className="text-lg sm:text-xl font-bold font-heading text-brand-navy tabular wrap-break-word">
          {value}
        </p>
        <p className="text-xs text-muted mt-0.5">{label}</p>
      </div>
    </div>
  )
}