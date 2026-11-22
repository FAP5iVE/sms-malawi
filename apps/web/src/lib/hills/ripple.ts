/**
 * apps/web/src/lib/hills/ripple.ts
 *
 * [CHANGE TYPE]: REWRITTEN (Chikangawa Hills theme, Phase 10e; first written in Phase 3)
 * [PURPOSE]: The pure rules behind the typing response on the sign-in family, kept
 *   apart from React so they can be tested with the plain node test runner
 *   (tools/hills/__tests__/ripple.test.mts).
 *
 *   It follows the approved sign-in mockup (chikangawa-login.html):
 *     - every keystroke sends one contour-shaped ring out from the peak, at most
 *       once every RIPPLE_MIN_GAP_MS;
 *     - the innermost contour lines light up as the form fills in (a valid email,
 *       then each password character), and the sun's glow swells with the password.
 *
 *   The ring is drawn with the SAME formula that draws the contour lines
 *   (tools/hills/generate-assets.mts), so a ring is the same family of shape as
 *   the lines it travels over, and the lit lines are exactly the background's
 *   own lines. A test pins this against public/hills/contours.svg.
 *
 *   Nothing moves when the visitor asked for reduced motion or switched the
 *   app's own motion setting off.
 */

/** Shortest time between two rings. */
export const RIPPLE_MIN_GAP_MS = 110

/** The ring animation lasts 1.9s (globals.css); remove a ring that never fires
 *  `animationend` (hidden tab, display:none) shortly after. */
export const RIPPLE_CLEANUP_MS = 2600

/** Most rings alive at once. Fast typing would otherwise stack a dozen; the oldest goes first. */
export const RIPPLE_MAX_RINGS = 5

/** The artwork's canvas, peak and ring spacing (same numbers as generate-assets.mts). */
export const CANVAS = { w: 1200, h: 800 } as const
export const PEAK = { x: 860, y: 290 } as const
export const RING_SPACING = 26

/** How many of the innermost contour lines can light up. */
export const LIT_RING_COUNT = 8

/** Radius (in ring units) a ripple starts from; the animation scales it out from there. */
export const RIPPLE_START_K = RING_SPACING * 5.5

/** One closed contour around (cx, cy). Same maths as the artwork generator. */
export function ringPath(cx: number, cy: number, k: number): string {
  const N = 96
  let d = ''
  for (let s = 0; s <= N; s++) {
    const a = (s / N) * Math.PI * 2
    const rr =
      k *
      (1 +
        0.16 * Math.sin(3 * a + 1.2) +
        0.1 * Math.sin(5 * a + 0.4) +
        0.07 * Math.sin(7 * a + 2.1) +
        0.05 * Math.sin(2 * a + k * 0.01))
    d += `${s ? 'L' : 'M'}${(cx + Math.cos(a) * rr * 1.35).toFixed(1)} ${(cy + Math.sin(a) * rr * 0.82).toFixed(1)}`
  }
  return `${d}Z`
}

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

export interface FieldState {
  type: string
  value: string
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** How many inner contour lines are lit for what has been typed so far:
 *  a complete email is worth 3, each password character 1 (up to 5), any other
 *  text field 1 per 4 characters (up to 2). Never more than LIT_RING_COUNT. */
export function litRingCount(fields: readonly FieldState[]): number {
  let n = 0
  for (const f of fields) {
    const v = f.value.trim()
    if (f.type === 'email') n += EMAIL.test(v) ? 3 : 0
    else if (f.type === 'password') n += Math.min(f.value.length, 5)
    else if (f.type === 'text' || f.type === 'tel' || f.type === 'search') n += Math.min(Math.floor(v.length / 4), 2)
  }
  return Math.min(n, LIT_RING_COUNT)
}

/** 0..1: how much the sun's glow swells. Follows the longest password typed (12 characters = full). */
export function glowAmount(fields: readonly FieldState[]): number {
  let longest = 0
  for (const f of fields) if (f.type === 'password') longest = Math.max(longest, f.value.length)
  return Math.round(Math.min(longest / 12, 1) * 100) / 100
}
