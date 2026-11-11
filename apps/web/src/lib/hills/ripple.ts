/**
 * apps/web/src/lib/hills/ripple.ts
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, Phase 3)
 * [PURPOSE]: The pure rules behind the typing ripple on the sign-in family, kept
 *   apart from React so they can be tested with the plain node test runner
 *   (tools/hills/__tests__/ripple.test.mts).
 *
 *   Typing in a field adds one expanding contour ring to the sky, at most once
 *   every RIPPLE_MIN_GAP_MS. Nothing is drawn when the visitor asked for reduced
 *   motion or switched the app's own motion setting off.
 */

/** Shortest time between two rings. */
export const RIPPLE_MIN_GAP_MS = 110

/** The ring animation lasts 1.7s (globals.css); remove a ring that never fires
 *  `animationend` (hidden tab, display:none) shortly after. */
export const RIPPLE_CLEANUP_MS = 2200

export interface RippleGateInput {
  /** performance.now() at the input event. */
  now: number
  /** performance.now() when the previous ring was added (0 if none yet). */
  last: number
  /** The app's own motion setting (useMotionEnabled). */
  motionEnabled: boolean
  /** matchMedia('(prefers-reduced-motion: reduce)').matches */
  prefersReducedMotion: boolean
}

/** True when this input event should add a ring. */
export function shouldAddRipple({ now, last, motionEnabled, prefersReducedMotion }: RippleGateInput): boolean {
  if (!motionEnabled || prefersReducedMotion) return false
  return last === 0 || now - last >= RIPPLE_MIN_GAP_MS
}
