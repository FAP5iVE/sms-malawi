'use client'

/**
 * apps/web/src/components/finances/PayrollTab.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE
 * [PURPOSE]: Finance's "Payroll" tab (user-requested redesign). Previously
 *   a bare history table plus a single "Run Payroll" button with no
 *   window/lock enforcement and no visible approval workflow — see
 *   PayrollWorkspace.tsx's header comment for the full history of what
 *   replaced it. Now mounts the shared 5-tab Payroll workspace, opening on
 *   Payroll Runs & Approvals — the tab this entry point is named for.
 *   Kept as its own file (rather than importing PayrollWorkspace directly
 *   into finances/page.tsx) so that page's import stays unchanged.
 * [DEPENDS ON]: components/finances/payroll/PayrollWorkspace.tsx
 */

import { PayrollWorkspace } from '@/components/finances/payroll/PayrollWorkspace'

export function PayrollTab() {
  return <PayrollWorkspace defaultTab="runs" />
}
