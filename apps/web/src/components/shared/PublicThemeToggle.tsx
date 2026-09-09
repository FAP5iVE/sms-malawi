'use client'

/**
 * apps/web/src/components/shared/PublicThemeToggle.tsx
 *
 * [PURPOSE]: The theme-toggle button shown on the public homepage and the
 *   login page — a solid square icon button (Sun / Moon / Monitor) matching
 *   the Home-button chip already used next to it on those pages.
 *
 * [R15 fix]: Previously cycled light -> dark -> system on every click with
 *   no menu, while the authenticated app's ModeToggle.tsx opens a dropdown
 *   listing all three options with a checkmark on the current one. Both
 *   rendered as a near-identical square icon chip in a near-identical
 *   position, so the visual similarity actively promised "these behave the
 *   same way" when they didn't — a user who learned "click the icon, pick
 *   from a list" on the authenticated side hit a completely different,
 *   undiscoverable cycling interaction the moment they landed on /login or
 *   the public site. Now opens the same three-option dropdown ModeToggle
 *   uses, keeping this component's own solid-chip trigger styling (which
 *   matches the public site's hero sections — ModeToggle's ghost-button
 *   style is built for PageHeader's lighter chrome and wouldn't fit here).
 *
 * [USAGE]: <PublicThemeToggle /> inside a page's header/back-link row.
 *   Pass a `className` to override sizing/position (e.g. `ml-auto` to push
 *   it to the far end of a flex row that isn't already `justify-between`).
 */

import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor, Check } from 'lucide-react'
import { useHasMounted } from '@/hooks/useHasMounted'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const THEME_OPTIONS = [
  { value: 'light',  label: 'Light',  icon: Sun     },
  { value: 'dark',   label: 'Dark',   icon: Moon    },
  { value: 'system', label: 'System', icon: Monitor },
] as const

const THEME_ICONS = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const

interface PublicThemeToggleProps {
  className?: string
}

export function PublicThemeToggle({ className = '' }: PublicThemeToggleProps) {
  const { theme, setTheme } = useTheme()
  const mounted = useHasMounted()

  const ActiveIcon = mounted ? THEME_ICONS[(theme as keyof typeof THEME_ICONS) ?? 'system'] : Monitor

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={mounted ? `Theme: ${theme}. Click to change.` : 'Toggle theme'}
          className={`w-9 h-9 rounded-lg bg-brand-navy hover:bg-brand-navy-mid text-white shadow-md flex items-center justify-center transition-colors shrink-0 cursor-pointer ${className}`}
        >
          <ActiveIcon className="w-4 h-4" aria-hidden />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-36 min-w-0">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className="flex items-center gap-2.5 cursor-pointer"
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 text-sm">{label}</span>
            {theme === value && (
              <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
