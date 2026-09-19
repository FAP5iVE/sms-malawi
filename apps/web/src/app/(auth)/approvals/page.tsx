/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/app/(auth)/approvals/page.tsx
 * [PURPOSE]: PendingActionsPanel.tsx (student/class edit-request approval
 *   queue — full backend already live: pendingActionService.ts,
 *   /pending-actions routes, usePendingActions.ts hooks) had a complete
 *   implementation and nowhere to render. This is that page: the full,
 *   non-compact view with filters, review dialogs, and pagination. Reached
 *   from the sidebar (config/navigation.ts, badge: 'pendingActions') and
 *   from the High Rank dashboard's Quick Actions and compact panel.
 *   Route-level access is enforced by proxy.ts + NAV_ITEMS via the shared
 *   PAGE_ACCESS['/approvals'] entry — RoleGuard here is defense-in-depth,
 *   the same pattern monitoring/page.tsx and exams/page.tsx use.
 * [DEPENDS ON]: @/components/shared/{RoleGuard,PendingActionsPanel}
 */
'use client'

import { RoleGuard } from '@/components/shared/RoleGuard'
import { ModuleSurface } from '@/components/shared/ModuleSurface'
import { PendingActionsPanel } from '@/components/shared/PendingActionsPanel'

export default function ApprovalsPage() {
  return (
    <RoleGuard allowed={['admin', 'high_rank', 'lower_rank', 'academic']}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-brand-navy">Approvals</h1>
          <p className="text-sm text-muted mt-0.5">
            Requests awaiting review, and the status of your own submissions.
          </p>
        </div>
        <ModuleSurface>
        <PendingActionsPanel />
        </ModuleSurface>
      </div>
    </RoleGuard>
  )
}
