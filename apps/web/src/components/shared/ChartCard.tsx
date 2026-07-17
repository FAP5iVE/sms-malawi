/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/shared/ChartCard.tsx
 * [R-PHASE]: R17 — Unified Charting Architecture (Phase 10C Plan)
 * [PURPOSE]: The card shell every dashboard chart sits in. R17 wires real
 *   charts into five role dashboards (Admin login-trends, Finance/HighRank
 *   fee-collection + income/expense, Library borrow-trends, Student
 *   performance + attendance), each replacing a `PlaceholderWidget`. Rather
 *   than duplicate the card frame + title + loading-skeleton across all five
 *   (the "no duplicate logic" rule), that shell lives here once.
 *
 *   Matches `PlaceholderWidget`'s card styling exactly (`bg-surface border
 *   border-base rounded-xl p-5`) so a wired chart card is visually continuous
 *   with any still-placeholder widget beside it. The loading branch reuses
 *   `PlaceholderWidget`'s `role="status"` + `aria-label` skeleton convention
 *   (CROSS_a11y: loading elements must be announced). The rendered chart owns
 *   its own `role="img"`/`ariaLabel` and empty state (see the chart module), so
 *   this shell only provides the frame, the human title, and the load state.
 * [DEPENDS ON]: none (pure presentational shell)
 */

'use client'

import type { ReactNode } from 'react'

interface ChartCardProps {
  title: string
  sub?: string
  isLoading: boolean
  /** Pixel height reserved for the plot/skeleton area. */
  height?: number
  children: ReactNode
  className?: string
}

export function ChartCard({
  title,
  sub,
  isLoading,
  height = 260,
  children,
  className = '',
}: ChartCardProps) {
  return (
    <div className={`bg-surface border border-base rounded-xl p-5 ${className}`}>
      <div className="mb-4">
        <p className="font-heading font-semibold text-sm text-brand-navy">{title}</p>
        {sub ? <p className="text-xs text-muted mt-1">{sub}</p> : null}
      </div>

      {isLoading ? (
        <div
          className="space-y-2 flex flex-col justify-end"
          role="status"
          aria-label={`${title} — loading`}
          style={{ height }}
        >
          <div className="skeleton h-1/2 w-full rounded" aria-hidden />
          <div className="skeleton h-1/3 w-4/5 rounded" aria-hidden />
          <div className="skeleton h-1/4 w-3/5 rounded" aria-hidden />
        </div>
      ) : (
        children
      )}
    </div>
  )
}
