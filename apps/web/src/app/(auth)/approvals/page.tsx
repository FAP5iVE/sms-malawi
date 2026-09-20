'use client'

/**
 * [CHANGE TYPE]: MAJOR REWRITE
 * [FILE]: apps/web/src/app/(auth)/approvals/page.tsx
 * [PURPOSE]: The Approvals page — one inbox for every request that needs or
 *   needed a decision, from every module. All roles can open it: reviewers
 *   see what is waiting on them, everyone else tracks their own submissions.
 *
 *   The page previously wrapped PendingActionsPanel, which only ever knew
 *   about student/class change requests, and drew its own counter boxes and
 *   a "Pending / All Actions" toggle. It now uses the same status-tab layout
 *   as HR, Finance and Library (see ApprovalsCenter).
 */

import { RoleGuard } from '@/components/shared/RoleGuard'
import { ApprovalsCenter } from '@/components/approvals/ApprovalsCenter'
import { USER_ROLES } from '@shared/types/roles'

export default function ApprovalsPage() {
  return (
    <RoleGuard allowed={[...USER_ROLES]}>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-brand-navy">Approvals</h1>
          <p className="mt-1 text-sm text-muted">
            Requests awaiting review, and the status of your own submissions — from every module in one place.
          </p>
        </div>
        <ApprovalsCenter />
      </div>
    </RoleGuard>
  )
}
