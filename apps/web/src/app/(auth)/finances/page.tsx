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
import { useFinanceSummary }     from '@/hooks/useFinances'
import { ScholarshipTab }        from '@/components/finances/ScholarshipTab'
import { ReportsExportPanel }    from '@/components/finances/ReportsExportPanel'
import { LibraryFinesTab }       from '@/components/finances/LibraryFinesTab'
import { formatMWK }             from '@shared/constants/malawi'
import { Banknote, TrendingDown, TrendingUp, PieChart } from 'lucide-react'
import { ModuleTabs }            from '@/components/shared/ModuleTabs'

type Tab =
  | 'invoices'
  | 'expenses'
  | 'payroll'
  | 'budget'
  | 'scholarships'
  | 'fines'
  | 'reports'

export default function FinancesPage() {
  return (
    <RoleGuard allowed={['admin', 'high_rank', 'finance', 'student']}>
      {/* useSearchParams() requires a Suspense boundary or `next build` fails —
          same convention as (public)/login/page.tsx and (auth)/exams/page.tsx. */}
      <Suspense fallback={null}>
        <FinancesContent />
      </Suspense>
    </RoleGuard>
  )
}

function FinancesContent() {
  const { role }   = useAuthStore()
  const YEAR = '2025/2026'
  const TERM = 1

  const { data: summary, isLoading: summaryLoading } = useFinanceSummary(YEAR, TERM)

  const isStudent = role === 'student'
  const isFinance = role === 'finance' || role === 'admin'

  // Build visible tab list — filtered by role, then mapped to clean TabItem shape
  // (strips the `show` field before passing to ModuleTabs for type safety)
  const TABS = [
    { id: 'invoices'     as Tab, label: isStudent ? 'My Fees' : 'Invoices', show: true        },
    { id: 'expenses'     as Tab, label: 'Expenses',                          show: isFinance    },
    { id: 'payroll'      as Tab, label: 'Payroll',                           show: isFinance    },
    { id: 'budget'       as Tab, label: 'Budget',                            show: !isStudent   },
    { id: 'scholarships' as Tab, label: 'Scholarships',                      show: isFinance    },
    { id: 'fines'        as Tab, label: 'Library Fines',                     show: isFinance    },
    { id: 'reports'      as Tab, label: 'Reports',                           show: isFinance    },
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
  const initialTab: Tab = tabParam && TABS.some((tab) => tab.id === tabParam) ? (tabParam as Tab) : 'invoices'

  const [activeTab, setActiveTab] = useState<Tab>(initialTab)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-bold text-brand-navy">
          {isStudent ? 'My Fees & Payments' : 'Finances'}
        </h1>
        <p className="text-sm text-muted mt-0.5">
          Academic Year {YEAR} · Term {TERM}
        </p>
      </div>

      {/* Summary stats — finance staff only */}
      {!isStudent && (
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
      {activeTab === 'scholarships' && <ScholarshipTab   academicYear={YEAR} />}
      {activeTab === 'fines'        && <LibraryFinesTab />}
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
    <div className="bg-surface border border-base rounded-xl p-4 flex items-start gap-3">
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${bg}`}
      >
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <p className="text-xl font-bold font-heading text-brand-navy tabular">{value}</p>
        <p className="text-xs text-muted mt-0.5">{label}</p>
      </div>
    </div>
  )
}