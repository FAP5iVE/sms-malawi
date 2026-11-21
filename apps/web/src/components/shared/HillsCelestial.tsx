'use client'

/**
 * apps/web/src/components/shared/HillsCelestial.tsx
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, Phase 2)
 * [PURPOSE]: The only client code in the sky background. It moves the sun and
 *   moon along their arcs for the `vivid` and `home` variants, by writing a few
 *   CSS custom properties onto the background wrapper (its parent element):
 *     - Auto: follows the Malawi clock, refreshed every minute.
 *     - Light / Dark: a fixed afternoon sun / high moon.
 *   The default and calm variants never mount this, so they stay fully static.
 *
 * It renders one hidden <span>, reads next-themes' `theme`, and touches no auth,
 * routing or data code. Until it has run, the CSS keeps the sun and moon hidden
 * (the `data-ready` attribute below), so there is no jump from a default spot.
 */

import { useEffect, useRef } from 'react'
import { useTheme } from '@/components/providers/ThemeProvider'
import { celestialVars } from '@/lib/hills/celestial'

export function HillsCelestial() {
  const marker = useRef<HTMLSpanElement>(null)
  const { theme } = useTheme()

  useEffect(() => {
    const root = marker.current?.parentElement
    if (!root) return
    const apply = () => {
      for (const [name, value] of Object.entries(celestialVars(theme, new Date()))) {
        root.style.setProperty(name, value)
      }
    }
    apply()
    // Let the first placement happen without a slide, then allow easing.
    const raf = window.requestAnimationFrame(() => root.setAttribute('data-ready', ''))
    const id = window.setInterval(apply, 60_000)
    return () => {
      window.cancelAnimationFrame(raf)
      window.clearInterval(id)
    }
  }, [theme])

  return <span ref={marker} hidden />
}
