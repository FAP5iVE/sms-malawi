/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/lib/chartPalette.ts
 * [R-PHASE]: R16 — Constants Centralization (Phase 10B Plan)
 * [PURPOSE]: THE single JavaScript-consumable chart colour palette. Recharts
 *   (and any canvas/SVG chart) needs concrete colour values at runtime — it
 *   cannot consume a Tailwind class or a bare CSS custom property — so the
 *   palette lives here as a real string array rather than as CSS utility
 *   classes. reports/page.tsx's inline BRAND_COLORS hex array (repeated across
 *   four <Pie>/<Cell> chart panels) now imports CHART_PALETTE instead, so no
 *   raw hex colour literal remains in that module.
 *
 *   These are the exact BRAND_COLORS hex values previously inlined in
 *   reports/page.tsx, lifted verbatim so that module's chart appearance is
 *   unchanged. NOTE: globals.css separately defines --chart-1..N design
 *   tokens (a different HSL palette used by the shadcn/ui chart primitives);
 *   unifying this JS palette with those CSS tokens is a visual-design
 *   decision deferred to the R17 charting-architecture phase, which will draw
 *   its series colours from a single reconciled source by index.
 * [DEPENDS ON]: none
 */

/** Ordered categorical chart palette (6 series colours). Mirrors
 *  the BRAND_COLORS values preserved from reports/page.tsx. */
export const CHART_PALETTE = [
  '#0F3460', // chart-1 — deep navy
  '#0E8A6A', // chart-2 — emerald
  '#F5A623', // chart-3 — amber
  '#E84040', // chart-4 — red
  '#6C63FF', // chart-5 — indigo
  '#00B4D8', // chart-6 — cyan
] as const

export type ChartColor = (typeof CHART_PALETTE)[number]

/** Returns the palette colour for a series index, wrapping around the palette
 *  length so any number of series is always coloured. */
export function chartColorAt(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length] as string
}
