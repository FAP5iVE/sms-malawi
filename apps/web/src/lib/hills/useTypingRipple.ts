'use client'

/**
 * apps/web/src/lib/hills/useTypingRipple.ts
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, Phase 3)
 * [PURPOSE]: "Effect A" from the approved mockup: while someone types in the
 *   sign-in family, a wave of light runs along the contour lines from the peak to the edge.
 *
 *   It listens for `input` events that bubble up to the page wrapper (event
 *   delegation), so the forms' own onChange handlers are never touched or
 *   rewired. Each ring is a throwaway <span> appended to the ripple layer and
 *   removed on `animationend`. At most one ring per RIPPLE_MIN_GAP_MS; none at
 *   all under prefers-reduced-motion or when the app's motion setting is off.
 *
 *   It reads the motion flag only (useMotionEnabled); it writes nothing to any
 *   store and calls no API.
 */

import { useEffect, type RefObject } from 'react'
import { useMotionEnabled } from '@/store/motionStore'
import { RIPPLE_CLEANUP_MS, RIPPLE_MAX_RINGS, shouldAddRipple } from '@/lib/hills/ripple'

export function useTypingRipple(
  listenOn: RefObject<HTMLElement | null>,
  layer: RefObject<HTMLElement | null>,
): void {
  const motionEnabled = useMotionEnabled()

  useEffect(() => {
    const host = listenOn.current
    const rings = layer.current
    if (!host || !rings || !motionEnabled) return

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    let last = 0

    const onInput = () => {
      const now = performance.now()
      if (!shouldAddRipple({ now, last, motionEnabled, prefersReducedMotion: reduced.matches })) return
      last = now
      const ring = document.createElement('span')
      ring.className = 'hills-ripple__ring'
      const remove = () => ring.remove()
      ring.addEventListener('animationend', remove, { once: true })
      window.setTimeout(remove, RIPPLE_CLEANUP_MS)
      rings.appendChild(ring)
      while (rings.childElementCount > RIPPLE_MAX_RINGS) rings.firstElementChild?.remove()
    }

    host.addEventListener('input', onInput)
    return () => {
      host.removeEventListener('input', onInput)
      rings.replaceChildren()
    }
  }, [listenOn, layer, motionEnabled])
}
