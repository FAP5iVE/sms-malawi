'use client'

/**
 * [CHANGE TYPE]: MAJOR REWRITE
 * [FILE]: apps/web/src/components/shared/PendingActionsPanel.tsx
 * [PURPOSE]: Compact "Pending Approvals" widget for dashboards.
 *
 *   This component used to be the whole approvals UI, but it only ever read
 *   the generic PendingAction table (student/class change requests), so a
 *   pending leave request, expense or purchase order never appeared in it.
 *   It is now a small window onto the Approvals Hub: the oldest requests
 *   waiting on the viewer, from every module, each linking to /approvals
 *   where the full inbox, filters and decision tools live.
 *
 *   `compact` and `entityType` are retained so existing call sites keep
 *   compiling; the widget is always compact and always cross-module.
 */

import Link from 'next/link'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { useApprovalList, useApprovalSummary } from '@/hooks/useApprovals'
import { MODULE_ICONS, timeAgo } from '@/components/approvals/approvalDisplay'
import { APPROVAL_MODULE_LABELS } from '@shared/constants/approvals'

interface PendingActionsPanelProps {
  /** Retained for compatibility — the widget is always compact. */
  compact?: boolean
  /** Retained for compatibility — the widget is always cross-module. */
  entityType?: string
  title?: string
  /** Maximum requests to list. Default: 5 */
  compactLimit?: number
}

export function PendingActionsPanel({ title = 'Pending Approvals', compactLimit = 5 }: PendingActionsPanelProps) {
  const summary = useApprovalSummary('review')
  const list = useApprovalList({ scope: 'review', status: 'PENDING', sort: 'oldest', page: 1, pageSize: compactLimit })

  const total = summary.data?.byStatus.PENDING ?? 0
  const items = list.data?.items ?? []

  return (
    <section className="rounded-2xl border border-base bg-surface p-4" aria-label={title}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-heading text-base font-semibold text-body">{title}</h2>
        {total > 0 ? (
          <span className="rounded-full bg-brand-coral px-2 text-xs font-bold leading-5 text-white">{total}</span>
        ) : null}
      </div>

      {list.isLoading ? (
        <div className="space-y-2" role="status" aria-label="Loading approvals">
          {[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 w-full rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" aria-hidden="true" />
          <p className="text-sm text-muted">No pending approvals — everything is up to date.</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => {
            const Icon = MODULE_ICONS[item.module]
            return (
              <li key={item.key}>
                <Link
                  href="/approvals"
                  className="flex min-h-[44px] items-center gap-3 rounded-xl px-2 py-2 hover:bg-page focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/40"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-teal/10 text-brand-teal">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-body">{item.title}</span>
                    <span className="block truncate text-xs text-muted">
                      {APPROVAL_MODULE_LABELS[item.module]} · {item.requester.name} · {timeAgo(item.createdAt)}
                    </span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      <Link
        href="/approvals"
        className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-brand-teal hover:underline"
      >
        {total > items.length ? `View all ${total}` : 'Open approvals'} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  )
}
