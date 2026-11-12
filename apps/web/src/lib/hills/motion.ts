/**
 * apps/web/src/lib/hills/motion.ts
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, Phase 4b: home polish)
 * [PURPOSE]: The pure rules behind scroll reveals on the landing page, apart from
 *   React so the plain node test runner can check them
 *   (tools/hills/__tests__/motion.test.mts).
 *
 *   An element fades up once as it scrolls into view. It is only hidden when it
 *   starts below the fold, and never when the visitor asked for reduced motion or
 *   switched the app's own motion setting off. The server HTML is always the
 *   visible, final state, so no-JavaScript visitors see everything.
 *
 *   Keep REVEAL_* in step with the `[data-reveal]` rules in globals.css.
 */

/** Share of the viewport height below which an element counts as "below the fold". */
export const REVEAL_FOLD = 0.85

/** Delay between items of a list, in ms. */
export const STAGGER_STEP_MS = 70

/** Only this many items are staggered; later ones appear with the last. */
export const STAGGER_MAX_ITEMS = 6

export interface RevealGateInput {
  /** getBoundingClientRect().top of the element. */
  top: number
  /** window.innerHeight */
  viewportHeight: number
  /** The app's own motion setting (useMotionEnabled). */
  motionEnabled: boolean
  /** matchMedia('(prefers-reduced-motion: reduce)').matches */
  prefersReducedMotion: boolean
}

/** 'hide' = hold the element back until it scrolls in; 'skip' = leave it visible. */
export function revealPlan({ top, viewportHeight, motionEnabled, prefersReducedMotion }: RevealGateInput): 'hide' | 'skip' {
  if (!motionEnabled || prefersReducedMotion) return 'skip'
  return top < viewportHeight * REVEAL_FOLD ? 'skip' : 'hide'
}

/** Delay in ms for the nth item of a list (0-based). */
export function staggerDelay(index: number): number {
  const i = Math.max(0, Math.min(Math.floor(index), STAGGER_MAX_ITEMS - 1))
  return i * STAGGER_STEP_MS
}
