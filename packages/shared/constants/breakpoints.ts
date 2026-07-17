/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: packages/shared/constants/breakpoints.ts
 * [R-PHASE]: R16 — Constants Centralization (Phase 10B Plan)
 * [PURPOSE]: Named JS-side breakpoint pixel values that must match Tailwind's
 *   scale, for the two components that read window width in JS rather than via
 *   CSS media queries. LG_BREAKPOINT moved from Sidebar.tsx; MOBILE_BREAKPOINT
 *   moved from use-mobile.ts.
 * [DEPENDS ON]: none
 */

/** Tailwind `lg` breakpoint (px). Used by Sidebar.tsx's tablet/desktop logic. */
export const LG_BREAKPOINT = 1024

/** Tailwind `md` breakpoint (px). Used by use-mobile.ts's mobile detection. */
export const MOBILE_BREAKPOINT = 768
