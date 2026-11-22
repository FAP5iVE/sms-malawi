/*
sms-malawi\apps\web\src\hooks\use-mobile.ts
*/
import * as React from 'react'

import { MOBILE_BREAKPOINT } from '@shared/constants/breakpoints'

const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function subscribeMobile(onChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

/**
 * Live, flash-free variant of useIsMobile().
 *
 * useIsMobile() starts `false` and corrects itself in an effect, so a component
 * that mounts on a phone paints one desktop frame first. This reads the media
 * query synchronously (useSyncExternalStore) and re-renders when it flips, so
 * a component that branches mobile/desktop (bottom sheet vs centred dialog)
 * is right on the first paint AND follows window resizes / rotation while open.
 * Server snapshot is `false` (desktop) — only use for client-mounted UI.
 */
export function useIsMobileSync(): boolean {
  return React.useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  )
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)

    function onChange() {
      // setState only inside callback — not in effect body directly
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }

    mql.addEventListener('change', onChange)
    // Set initial value inside effect but via a separate call
    onChange()

    return () => mql.removeEventListener('change', onChange)
  }, [])

  return !!isMobile
}
