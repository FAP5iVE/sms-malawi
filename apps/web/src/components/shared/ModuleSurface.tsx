'use client'

/**
 * apps/web/src/components/shared/ModuleSurface.tsx
 *
 * [PURPOSE]: The one bordered surface every module page's content sits on.
 *   Phase 8a (Hills theme, looks only): a single border, a 14px radius and
 *   one padding. No line-art and no second padding layer. Phones: edge to
 *   edge, with no side border or corners (see `.app-surface` in globals.css).
 *
 *   It provides <FlatSurface>, so StatCard, ListCard, ChartCard, ReportCard,
 *   the report filters and DataTable draw flat on it instead of adding a
 *   second bordered card. Tiles that need a block of their own use the one
 *   `.app-tint` background. Clickable cards keep their border.
 *
 * [USAGE]: Wrap the page's active-tab content in <ModuleSurface>. The page
 *   title and the <ModuleTabs /> strip sit ABOVE it, on the sky, on the
 *   pilot pages (Exams, Students, Finances); other pages keep the tab
 *   strip inside until their batch in Phase 8b.
 *
 * [SAFETY]: Nothing here clips its children (no overflow-hidden), so a
 *   modal that anchors to a non-fixed ancestor is never cut off.
 */

import type { ReactNode } from 'react'
import { FlatSurface } from '@/components/shared/FlatSurface'

interface ModuleSurfaceProps {
  children: ReactNode
  className?: string
  /**
   * Class list for the inner content wrapper around `children`. Defaults to
   * `space-y-4 md:space-y-5`: every page this wraps stacks a few blocks, so
   * vertical rhythm is the sane default. Override when a page needs
   * different spacing (or none) between its direct children.
   */
  contentClassName?: string
}

export function ModuleSurface({ children, className = '', contentClassName = 'space-y-4 md:space-y-5' }: ModuleSurfaceProps) {
  return (
    <div className={`app-surface ${className}`}>
      <FlatSurface>
        <div className={contentClassName}>{children}</div>
      </FlatSurface>
    </div>
  )
}
