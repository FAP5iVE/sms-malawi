'use client'

/**
 * apps/web/src/components/shared/PublicThemeToggle.tsx
 *
 * [PURPOSE]: The exact theme-toggle button already shipped on the public
 *   homepage and the login page — a solid square icon button (Sun / Moon /
 *   Monitor, cycling light -> dark -> system on click) — extracted into one
 *   shared component so every other public page can drop in the SAME
 *   control instead of re-declaring the identical useTheme + useHasMounted +
 *   cycleTheme wiring locally in each file. Visual styling (solid
 *   bg-brand-navy chip, white icon, 9x9 square, rounded-lg) matches the
 *   Home-button chip already used next to it on those pages.
 *
 * [USAGE]: <PublicThemeToggle /> inside a page's header/back-link row.
 *   Pass a `className` to override sizing/position (e.g. `ml-auto` to push
 *   it to the far end of a flex row that isn't already `justify-between`).
 */

import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useHasMounted } from '@/hooks/useHasMounted'

const THEME_ICONS = {
  light: <Sun className="w-4 h-4" />,
  dark: <Moon className="w-4 h-4" />,
  system: <Monitor className="w-4 h-4" />,
} as const

const THEME_ORDER: Array<keyof typeof THEME_ICONS> = ['light', 'dark', 'system']

interface PublicThemeToggleProps {
  className?: string
}

export function PublicThemeToggle({ className = '' }: PublicThemeToggleProps) {
  const { theme, setTheme } = useTheme()
  const mounted = useHasMounted()

  function cycleTheme() {
    const current = (theme as keyof typeof THEME_ICONS) ?? 'system'
    setTheme(THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length] ?? 'system')
  }

  return (
    <button
      type="button"
      onClick={cycleTheme}
      aria-label={mounted ? `Theme: ${theme}. Click to change.` : 'Toggle theme'}
      className={`w-9 h-9 rounded-lg bg-brand-navy hover:bg-brand-navy-mid text-white shadow-md flex items-center justify-center transition-colors shrink-0 cursor-pointer ${className}`}
    >
      {mounted ? THEME_ICONS[(theme as keyof typeof THEME_ICONS) ?? 'system'] : <Monitor className="w-4 h-4" aria-hidden />}
    </button>
  )
}