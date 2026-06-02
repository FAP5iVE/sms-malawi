'use client'

import { useEffect }                        from 'react'
import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from 'next-themes'
import { useThemeStore }                    from '@/store/themeStore'

// ─────────────────────────────────────────────────────────
//  MOTION PREFERENCE INITIALISER
//  Reads the OS prefers-reduced-motion media query once on
//  mount and writes it into themeStore.  Respects any
//  previously saved user override in localStorage.
// ─────────────────────────────────────────────────────────

function MotionPreferenceInitialiser() {
  const { motionEnabled, setMotionEnabled } = useThemeStore()

  useEffect(() => {
    // Only apply the OS default if the user has NOT previously set
    // a manual preference (the persisted value differs from the default).
    // We detect this by checking if the persisted value is still the
    // initialisation default (true) — if so, defer to OS preference.
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')

    // If OS says reduce motion AND the user hasn't overridden to true manually,
    // set motionEnabled to false.
    if (mq.matches && motionEnabled === true) {
      setMotionEnabled(false)
    }

    // Listen for OS preference changes at runtime (e.g., user toggles
    // system accessibility setting while app is open).
    function handleChange(e: MediaQueryListEvent) {
      // Only propagate OS changes if the user hasn't set a manual preference
      // in Settings — we check the store value against the OS value.
      if (e.matches && motionEnabled === true) {
        setMotionEnabled(false)
      } else if (!e.matches && motionEnabled === false) {
        // OS disabled the reduce-motion flag — restore animations
        // only if the user hadn't explicitly disabled them in Settings.
        setMotionEnabled(true)
      }
    }

    mq.addEventListener('change', handleChange)
    return () => mq.removeEventListener('change', handleChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])   // Run once on mount — intentionally omits motionEnabled to avoid loop

  return null
}

// ─────────────────────────────────────────────────────────
//  THEME PROVIDER
// ─────────────────────────────────────────────────────────

interface Props {
  children: React.ReactNode
}

/**
 * Wraps the application with next-themes theme management.
 *
 * Configuration:
 *   attribute="class"    — next-themes adds/removes class="dark" on <html>
 *   defaultTheme="system"— respects OS preference on first visit
 *   enableSystem         — enables the system/OS preference mode
 *   disableTransitionOnChange — prevents a flash of unstyled content when
 *                              switching themes by temporarily disabling CSS
 *                              transitions for one frame.
 *
 * The storageKey ensures theme preference is stored under a project-specific
 * localStorage key, preventing conflicts with other apps on the same origin.
 */
export function ThemeProvider({ children }: Props) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="sms-malawi-theme"
    >
      <MotionPreferenceInitialiser />
      {children}
    </NextThemesProvider>
  )
}