'use client'

/**
 * apps/web/src/lib/hills/useTypingRipple.ts
 *
 * [CHANGE TYPE]: REWRITTEN (Chikangawa Hills theme, Phase 10e; first written in Phase 3)
 * [PURPOSE]: The typing response from the approved sign-in mockup. While someone
 *   types in the sign-in family:
 *     1. a contour-shaped ring runs out from the peak (one per keystroke, at most
 *        one per RIPPLE_MIN_GAP_MS);
 *     2. the innermost contour lines light up as the form fills in;
 *     3. the sun's glow swells with the password length (CSS variable --hills-pw).
 *
 *   It listens for `input` events that bubble up to the page wrapper (event
 *   delegation), so the forms' own onChange handlers are never touched or
 *   rewired. It only READS the fields' type and value. It draws into one small
 *   <svg> (the ring is a single path scaled by CSS), never re-renders React, and
 *   writes nothing to any store and calls no API.
 *
 *   Why this is cheap enough for a phone: no mask, no filter, no large gradient.
 *   One thin path scales from the peak and fades; the lit lines change stroke
 *   only when their count changes.
 */

import { useEffect, type RefObject } from 'react'
import { useMotionEnabled } from '@/store/motionStore'
import {
  RIPPLE_CLEANUP_MS, RIPPLE_MAX_RINGS, RIPPLE_START_K,
  glowAmount, litRingCount, ringPath, shouldAddRipple,
  type FieldState,
} from '@/lib/hills/ripple'

const SVG_NS = 'http://www.w3.org/2000/svg'

export function useTypingRipple(
  listenOn: RefObject<HTMLElement | null>,
  layer: RefObject<SVGSVGElement | null>,
  glowOn: RefObject<HTMLElement | null>,
): void {
  const motionEnabled = useMotionEnabled()

  useEffect(() => {
    const host = listenOn.current
    const svg = layer.current
    const glowHost = glowOn.current
    if (!host || !svg || !motionEnabled) return

    const waves = svg.querySelector<SVGGElement>('[data-ripple-waves]')
    const lit = Array.from(svg.querySelectorAll<SVGPathElement>('[data-lit-ring]'))
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const waveD = ringPath(0, 0, RIPPLE_START_K)
    let last = 0
    let litNow = -1
    let glowNow = -1

    const readFields = (): FieldState[] =>
      Array.from(host.querySelectorAll<HTMLInputElement>('input')).map((el) => ({ type: el.type, value: el.value }))

    const onInput = () => {
      const fields = readFields()

      const n = litRingCount(fields)
      if (n !== litNow) {
        litNow = n
        lit.forEach((p, i) => p.classList.toggle('is-lit', i < n))
      }
      const g = glowAmount(fields)
      if (g !== glowNow && glowHost) {
        glowNow = g
        glowHost.style.setProperty('--hills-pw', String(g))
      }

      const now = performance.now()
      if (!waves || !shouldAddRipple({ now, last, motionEnabled, prefersReducedMotion: reduced.matches })) return
      last = now
      const ring = document.createElementNS(SVG_NS, 'path')
      ring.setAttribute('class', 'hills-ripple__ring')
      ring.setAttribute('d', waveD)
      const remove = () => ring.remove()
      ring.addEventListener('animationend', remove, { once: true })
      window.setTimeout(remove, RIPPLE_CLEANUP_MS)
      waves.appendChild(ring)
      while (waves.childElementCount > RIPPLE_MAX_RINGS) waves.firstElementChild?.remove()
    }

    host.addEventListener('input', onInput)
    onInput()
    return () => {
      host.removeEventListener('input', onInput)
      waves?.replaceChildren()
      lit.forEach((p) => p.classList.remove('is-lit'))
      glowHost?.style.removeProperty('--hills-pw')
    }
  }, [listenOn, layer, glowOn, motionEnabled])
}
