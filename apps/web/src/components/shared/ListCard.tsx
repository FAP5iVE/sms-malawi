/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/shared/ListCard.tsx
 * [R-PHASE]: POST-R17 — Dashboard List Widgets (permanent-skeleton fix)
 * [PURPOSE]: The card shell for every dashboard *list* widget (Recent
 *   Announcements, Contract Expiry Alerts, Staff Leave Calendar, Exam
 *   Schedule This Week, Recent Applications, Today's Timetable, Students
 *   Needing Attention) — the list-content counterpart to ChartCard.tsx,
 *   which already plays this role for chart widgets. These seven were all
 *   still permanent PlaceholderWidgets ("wired in R17" never happened for
 *   list content, only for charts).
 *
 *   Matches ChartCard/PlaceholderWidget styling exactly (`bg-surface
 *   border border-base rounded-xl p-5`) so a wired list card is visually
 *   continuous with any chart card or still-placeholder widget beside it.
 *   Same `role="status"` + `aria-label` skeleton convention as both
 *   (CROSS_a11y: loading elements must be announced). Unlike ChartCard,
 *   this shell also owns the empty state, since every consumer needs one
 *   ("No announcements yet.", "No high-risk students right now.", etc.) —
 *   centralising it here means an empty list can never be confused with a
 *   stuck loading skeleton, which was the entire original bug.
 * [DEPENDS ON]: none (pure presentational shell)
 */

'use client'

import type { ReactNode } from 'react'

interface ListCardProps {
  title: string
  sub?: string
  isLoading: boolean
  isEmpty: boolean
  emptyMessage?: string
  children: ReactNode
  className?: string
}

export function ListCard({
  title,
  sub,
  isLoading,
  isEmpty,
  emptyMessage = 'Nothing to show right now.',
  children,
  className = '',
}: ListCardProps) {
  return (
    <div className={`bg-surface border border-base rounded-xl p-5 min-h-[8rem] md:min-h-[10rem] ${className}`}>
      <div className="mb-4">
        <p className="font-heading font-semibold text-sm text-brand-navy">{title}</p>
        {sub ? <p className="text-xs text-muted mt-1">{sub}</p> : null}
      </div>

      {isLoading ? (
        <div className="space-y-2" role="status" aria-label={`${title} — loading`}>
          <div className="skeleton h-3 w-full rounded" aria-hidden />
          <div className="skeleton h-3 w-4/5 rounded" aria-hidden />
          <div className="skeleton h-3 w-3/5 rounded" aria-hidden />
        </div>
      ) : isEmpty ? (
        <p className="text-sm text-muted" role="status">{emptyMessage}</p>
      ) : (
        children
      )}
    </div>
  )
}