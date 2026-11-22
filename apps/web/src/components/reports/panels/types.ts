/**
 * Contract between the Reports page shell and the per-role report panels.
 *
 * Each role file in this directory (e.g. FinanceReports.tsx) exports:
 *   - `FINANCE_REPORT_TABS: ReportTabDef[]`  — the navigation for that job
 *   - `FinanceReports: (props: ReportPanelProps) => JSX`  — renders the active tab
 * and the page shell (app/(auth)/reports/page.tsx) wires them by role. A tab
 * with `requires` is hidden unless the caller holds at least one listed
 * permission, so a role never sees a tab that would 403 (blueprint: omit a
 * report category rather than show an empty tab).
 */
import type { ReactNode } from 'react'
import type { Permission } from '@shared/types/permissions'

export interface ReportTabDef {
  id: string
  label: string
  icon: ReactNode
  /** Show the tab only if the caller holds at least one of these. */
  requires?: readonly Permission[]
}

export interface ReportPanelProps {
  /** Active tab id (one of the role's ReportTabDef ids). */
  tab: string
  /** The period being viewed (from useViewingPeriod) — never hardcoded. */
  academicYear: string
  term: number
}
