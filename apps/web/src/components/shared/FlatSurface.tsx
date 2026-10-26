'use client'

/**
 * apps/web/src/components/shared/FlatSurface.tsx
 *
 * [PURPOSE]: Tells report/chart cards that they are sitting on a ModuleSurface
 *   panel (the white module card), so they draw their title and content flat on
 *   it instead of adding a second bordered card — the same way the Library,
 *   Finance and Exams tabs lay their content out on that panel.
 *
 *   Opt-in and scoped: only a page that wraps its content in <FlatSurface>
 *   (today: /reports) changes. ReportCard / ChartCard / FilterBar keep their
 *   card look everywhere else — notably the dashboards, which sit on the page
 *   background and need the card.
 */

import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

const FlatSurfaceContext = createContext(false)

export function FlatSurface({ children }: { children: ReactNode }) {
  return <FlatSurfaceContext.Provider value>{children}</FlatSurfaceContext.Provider>
}

/** True when rendered inside <FlatSurface>: draw flat, no card chrome. */
export function useFlatSurface(): boolean {
  return useContext(FlatSurfaceContext)
}
