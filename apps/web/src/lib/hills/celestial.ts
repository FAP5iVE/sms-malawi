/**
 * apps/web/src/lib/hills/celestial.ts
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, Phase 2)
 * [PURPOSE]: Where the sun and moon sit, as CSS custom properties for the
 *   `vivid` and `home` backgrounds. Pure and tested (tools/hills/__tests__).
 *
 * [RULES]  (same as the approved mockup)
 *   - Sun is up from 05:30 to 18:00 Malawi time, the moon the rest of the day.
 *   - Each rides an arc: rises on the left, peaks mid-way, sets on the right.
 *   - Auto follows the clock. Light always shows an afternoon sun, Dark always a
 *     high moon, so the picture matches the sky the toggle forces.
 *   - Near the horizon the sun is warmer (orange) and slightly larger.
 *
 * Values are percentages of the screen, so the layout needs no measuring.
 */

import { malawiHour } from './sky'

export const SUN_RISE = 5.5
export const SUN_SET = 18

/** Arc limits as percentages of the screen. */
const X_LEFT = 12
const X_SPAN = 76
const Y_HORIZON = 36
const Y_PEAK = 13

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const mix = (a: number[], b: number[], k: number): number[] => a.map((v, i) => Math.round(v + (b[i]! - v) * k))

export interface Body {
  /** 0 to 100, percent of screen width */
  x: number
  /** 0 to 100, percent of screen height */
  y: number
  /** 0 to 1; fades in and out at the ends of the arc */
  opacity: number
  /** 1 at the top of the arc, 0 at the horizon */
  elevation: number
}

/** Position on the arc for f in 0..1, or null when the body is below the horizon. */
export function arc(f: number | null): Body | null {
  if (f === null) return null
  const e = Math.sin(Math.PI * f)
  return {
    x: X_LEFT + X_SPAN * f,
    y: Y_HORIZON - e * (Y_HORIZON - Y_PEAK),
    opacity: smoothstep(0, 0.08, f) * smoothstep(0, 0.08, 1 - f),
    elevation: e,
  }
}

/** Fractional Malawi hour, 0 to 24. */
export function malawiTime(now: Date): number {
  return malawiHour(now) + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600
}

/** Where along each arc the sun and moon are at time T (hours). */
export function arcFractions(T: number): { sun: number | null; moon: number | null } {
  if (T >= SUN_RISE && T < SUN_SET) return { sun: (T - SUN_RISE) / (SUN_SET - SUN_RISE), moon: null }
  const night = 24 - (SUN_SET - SUN_RISE)
  return { sun: null, moon: (T >= SUN_SET ? T - SUN_SET : T + 6) / night }
}

/** Light is a fixed afternoon sun, Dark a fixed high moon. */
const FIXED_SUN_F = 0.55
const FIXED_MOON_F = 0.45

export function celestialVars(theme: string | null | undefined, now: Date): Record<string, string> {
  let sun: Body | null
  let moon: Body | null
  if (theme === 'light') {
    sun = { ...arc(FIXED_SUN_F)!, opacity: 1 }
    moon = null
  } else if (theme === 'dark') {
    sun = null
    moon = { ...arc(FIXED_MOON_F)!, opacity: 1 }
  } else {
    const f = arcFractions(malawiTime(now))
    sun = arc(f.sun)
    moon = arc(f.moon)
  }

  const vars: Record<string, string> = {
    '--sun-o': sun ? sun.opacity.toFixed(3) : '0',
    '--moon-o': moon ? moon.opacity.toFixed(3) : '0',
  }
  if (sun) {
    vars['--sun-x'] = `${sun.x.toFixed(2)}%`
    vars['--sun-y'] = `${sun.y.toFixed(2)}%`
    vars['--sun-scale'] = (1 + (1 - sun.elevation) * 0.12).toFixed(3)
    const c = mix([255, 160, 86], [255, 243, 191], smoothstep(0, 0.55, sun.elevation))
    vars['--sunc'] = `rgb(${c.join(',')})`
    vars['--sun-glow'] = `rgba(${c.join(',')},0.5)`
  }
  if (moon) {
    vars['--moon-x'] = `${moon.x.toFixed(2)}%`
    vars['--moon-y'] = `${moon.y.toFixed(2)}%`
    vars['--moon-scale'] = (1 + (1 - moon.elevation) * 0.12).toFixed(3)
  }
  return vars
}
