'use client'

/**
 * apps/web/src/components/finances/payroll/PayrollWorkspace.tsx
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: One shared 5-tab payroll module — Payroll Runs & Approvals,
 *   Salary Structure & Allowances, My Pay (Self-Service), Financial
 *   Insights & Trends, PAYE & Pension Settings — mounted at both entry
 *   points the redesign named: Finance's "Payroll" tab (PayrollTab.tsx,
 *   defaultTab="runs") and HR's "My Pay" tab
 *   (app/(auth)/hr/page.tsx, defaultTab="mypay"). Same component either
 *   way — only which tab opens first differs, and each of the 5 sub-tabs
 *   is independently gated by the real permission it already maps to in
 *   S/types/permissions.ts, so who sees what is identical regardless of
 *   which entry point they arrived from:
 *     runs       → finance.viewPayrollRuns   (finance, hr, high_rank)
 *     structure  → hr.manageSalaryStructure  (hr)
 *                  or finance.manageSalaryStructure (finance)
 *     mypay      → hr.viewOwnPayslips        (every non-admin staff role)
 *     insights   → report.viewPayrollSummary (finance, high_rank)
 *     settings   → settings.managePayrollConfig (finance)
 *   A role with none of the above (only admin, verified against
 *   S/types/permissions.ts — admin holds zero payroll permissions despite
 *   Finance's page treating admin as isFinance for tab visibility) sees an
 *   empty-state message instead of a blank tab bar.
 * [DEPENDS ON]: PayrollRunsTab / SalaryStructureTab / MyPayTab /
 *   PayrollInsightsTab / PayrollSettingsTab (same change), W/components/
 *   shared/ModuleTabs.tsx, W/hooks/usePermissions.ts
 */

import { useState } from 'react'
import { ClipboardList, Users, Wallet, TrendingUp, Settings } from 'lucide-react'
import { ModuleTabs, type TabItem } from '@/components/shared/ModuleTabs'
import { usePermissions } from '@/hooks/usePermissions'
import { PayrollRunsTab } from './PayrollRunsTab'
import { SalaryStructureTab } from './SalaryStructureTab'
import { MyPayTab } from './MyPayTab'
import { PayrollInsightsTab } from './PayrollInsightsTab'
import { PayrollSettingsTab } from './PayrollSettingsTab'

export type PayrollWorkspaceTab = 'runs' | 'structure' | 'mypay' | 'insights' | 'settings'

interface PayrollWorkspaceProps {
  /** Which sub-tab opens first. Falls back to the first tab this caller's
   *  role actually has access to if they don't hold the permission for
   *  their entry point's usual default (e.g. a lower_rank teacher landing
   *  via HR's "My Pay" destination — 'mypay' is also their only option). */
  defaultTab: PayrollWorkspaceTab
}

export function PayrollWorkspace({ defaultTab }: PayrollWorkspaceProps) {
  const { can } = usePermissions()

  const canRuns = can('finance.viewPayrollRuns')
  const canStructure = can('hr.manageSalaryStructure') || can('finance.manageSalaryStructure')
  const canMyPay = can('hr.viewOwnPayslips')
  const canInsights = can('report.viewPayrollSummary')
  const canSettings = can('settings.managePayrollConfig')
  const canViewAnyPayslips = can('hr.viewAnyPayslips')

  const tabs = [
    canRuns ? { id: 'runs' as const, label: 'Payroll Runs & Approvals', icon: ClipboardList } : null,
    canStructure ? { id: 'structure' as const, label: 'Salary Structure & Allowances', icon: Users } : null,
    canMyPay ? { id: 'mypay' as const, label: 'My Pay (Self-Service)', icon: Wallet } : null,
    canInsights ? { id: 'insights' as const, label: 'Financial Insights & Trends', icon: TrendingUp } : null,
    canSettings ? { id: 'settings' as const, label: 'PAYE & Pension Settings', icon: Settings } : null,
  ].filter((t): t is NonNullable<typeof t> => t !== null) as TabItem<PayrollWorkspaceTab>[]

  const [active, setActive] = useState<PayrollWorkspaceTab>(
    tabs.some((t) => t.id === defaultTab) ? defaultTab : (tabs[0]?.id ?? 'mypay'),
  )

  if (tabs.length === 0) {
    return (
      <div className="text-center py-16 text-muted text-sm border border-dashed border-base rounded-xl">
        You don&apos;t have access to any payroll details.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ModuleTabs tabs={tabs} active={active} onChange={setActive} variant="underline" id="payroll-workspace" />
      {active === 'runs' && canRuns && <PayrollRunsTab />}
      {active === 'structure' && canStructure && <SalaryStructureTab />}
      {active === 'mypay' && canMyPay && <MyPayTab canViewAnyPayslips={canViewAnyPayslips} />}
      {active === 'insights' && canInsights && <PayrollInsightsTab />}
      {active === 'settings' && canSettings && <PayrollSettingsTab />}
    </div>
  )
}
