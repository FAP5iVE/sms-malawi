'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'
import { useThemeStore }                    from '@/store/themeStore'
import {
  HILLS_THEME_STORAGE_KEY,
  malawiHour,
  modeForSky,
  normalizeChoice,
  resolveSky,
  skyForHour,
  type HillsMode,
  type HillsSky,
  type ThemeChoice,
} from '@/lib/hills/sky'

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
//  THEME PROVIDER  (Phase 10a)
//
//  One place decides what the person sees, for the public site, the login
//  page, the staff shell and the guardian shell alike:
//
//    Light  -> the day sky and light colours, always
//    Dark   -> the night sky and dark colours, always
//    Auto   -> follows the Malawi clock: night (19:00 to 04:59) is dark,
//              dawn, day and dusk are light. It does NOT follow the device's
//              own colour setting any more, which is what used to make the
//              sky and the colours disagree.
//
//  It owns three things on <html> together, so they can never disagree:
//  the `dark` class, `color-scheme`, and `data-sky`. The inline script in the
//  root layout (HILLS_SKY_SCRIPT) does the same before first paint.
//
//  The stored value and its key are unchanged ('light' | 'dark' | 'system' in
//  localStorage 'sms-malawi-theme'), so nobody's saved choice is lost. The
//  hook keeps the same shape next-themes had: { theme, setTheme, resolvedTheme }.
// ─────────────────────────────────────────────────────────

interface ThemeContextValue {
  /** The person's choice. Undefined until the page has hydrated. */
  theme: ThemeChoice | undefined
  setTheme: (choice: ThemeChoice) => void
  /** The colours actually showing. Undefined until the page has hydrated. */
  resolvedTheme: HillsMode | undefined
  /** The sky actually showing. Undefined until the page has hydrated. */
  sky: HillsSky | undefined
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: undefined,
  setTheme: () => {},
  resolvedTheme: undefined,
  sky: undefined,
})

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}

// localStorage as an external store, so every tab and every component agrees.
const listeners = new Set<() => void>()

function readChoice(): ThemeChoice {
  try {
    return normalizeChoice(window.localStorage.getItem(HILLS_THEME_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

function subscribeChoice(onChange: () => void): () => void {
  listeners.add(onChange)
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === HILLS_THEME_STORAGE_KEY) onChange()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onStorage)
  }
}

// Set only when localStorage refuses writes, so the buttons still work for
// this page. While storage works, storage is the single truth.
let memoryChoice: ThemeChoice | null = null

function writeChoice(choice: ThemeChoice) {
  try {
    window.localStorage.setItem(HILLS_THEME_STORAGE_KEY, choice)
    memoryChoice = null
  } catch {
    memoryChoice = choice
  }
  listeners.forEach((l) => l())
}

const readChoiceOrMemory = (): ThemeChoice => memoryChoice ?? readChoice()

function applyToDocument(sky: HillsSky) {
  const root = document.documentElement
  const mode = modeForSky(sky)
  root.dataset.sky = sky
  root.classList.toggle('dark', mode === 'dark')
  root.style.colorScheme = mode
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const choice = useSyncExternalStore<ThemeChoice | null>(subscribeChoice, readChoiceOrMemory, () => null)

  // The Malawi clock sky, refreshed every 30 seconds and whenever the tab
  // wakes up (a laptop that slept through sunset must not stay light).
  const [clockSky, setClockSky] = useState<HillsSky | null>(null)
  useEffect(() => {
    const tick = () => setClockSky(skyForHour(malawiHour(new Date())))
    tick()
    const id = window.setInterval(tick, 30_000)
    const wake = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('focus', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('focus', tick)
    }
  }, [])

  const sky: HillsSky | null =
    choice === null || clockSky === null
      ? null
      : choice === 'light'
        ? 'day'
        : choice === 'dark'
          ? 'night'
          : clockSky

  useEffect(() => {
    if (sky) applyToDocument(sky)
  }, [sky])

  const setTheme = useCallback((next: ThemeChoice) => {
    // Apply at once, without waiting for the next render, so the click
    // feels instant and nothing is left half-switched.
    applyToDocument(resolveSky(next, new Date()))
    writeChoice(normalizeChoice(next))
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: choice ?? undefined,
      setTheme,
      resolvedTheme: sky ? modeForSky(sky) : undefined,
      sky: sky ?? undefined,
    }),
    [choice, setTheme, sky],
  )

  return (
    <ThemeContext.Provider value={value}>
      <MotionPreferenceInitialiser />
      {children}
    </ThemeContext.Provider>
  )
}
