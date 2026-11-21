/**
 * apps/web/src/components/shared/themeOptions.ts
 *
 * [PURPOSE]: One list of theme choices (Light, Dark, Auto) and their icons,
 *   shared by the three theme menus (home header, public header, signed-in
 *   header) so they always list the same things with the same icons.
 *
 * [ICONS]: Sun = Light, Moon = Dark, SunMoon = Auto (a sun and a moon in one
 *   glyph: "follows the day"). The menu button shows the icon of the CHOICE,
 *   so Auto is visible on the button itself, and the tick in the open menu
 *   confirms it. The page colours already show whether it is day or night.
 */

import { Sun, Moon, SunMoon } from 'lucide-react'
import type { ThemeChoice } from '@/lib/hills/sky'

export const THEME_OPTIONS: ReadonlyArray<{
  value: ThemeChoice
  label: string
  icon: typeof Sun
}> = [
  { value: 'light',  label: 'Light', icon: Sun     },
  { value: 'dark',   label: 'Dark',  icon: Moon    },
  { value: 'system', label: 'Auto',  icon: SunMoon },
]

export function themeLabel(choice: string | undefined): string {
  return THEME_OPTIONS.find(o => o.value === choice)?.label ?? 'Auto'
}

/** The icon of one choice. A component (not a looked-up value) so callers can render it inline. */
export function ThemeIcon({ choice, className }: { choice: string | undefined; className?: string }) {
  if (choice === 'light') return <Sun className={className} aria-hidden />
  if (choice === 'dark') return <Moon className={className} aria-hidden />
  return <SunMoon className={className} aria-hidden />
}
