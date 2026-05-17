import * as React from 'react'

const MOBILE_BREAKPOINT = 768

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
