'use client'

/**
 * apps/web/src/components/shared/HillsSkySync.tsx
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, Phase 1)
 * [PURPOSE]: Keeps <html data-sky="..."> correct after the page has loaded.
 *   The inline script in the root layout sets the first value before paint;
 *   this component takes over from there:
 *     - when the visitor picks Auto, Light or Dark in the theme toggle, the sky
 *       follows (Light = day, Dark = night, Auto = the Malawi clock);
 *     - in Auto, the sky is re-checked every minute so it eases from day to
 *       dusk while the page is open.
 *   It renders nothing and touches no auth, routing or data code. The toggles'
 *   own handlers are unchanged: this listens to next-themes' `theme` value.
 *
 * [SCOPE]: data-sky is only read inside `.hills` containers (see the HILLS
 *   THEME section of globals.css), so mounting this globally does not change
 *   any signed-in screen.
 */

import { useEffect } from 'react'
import { useTheme } from 'next-themes'
import { resolveSky } from '@/lib/hills/sky'

export function HillsSkySync() {
  const { theme } = useTheme()

  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.sky = resolveSky(theme, new Date())
    }
    apply()
    const id = window.setInterval(apply, 60_000)
    return () => window.clearInterval(id)
  }, [theme])

  return null
}
