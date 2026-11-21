'use client'

/**
 * apps/web/src/components/shared/PublicThemeToggle.tsx
 *
 * [PURPOSE]: The theme-toggle button shown on the public homepage and the
 *   login page, a solid square icon button (Sun / Moon / Monitor) matching
 *   the Home-button chip already used next to it on those pages.
 *
 * [R15 fix]: Previously cycled light -> dark -> system on every click with
 *   no menu, while the authenticated app's ModeToggle.tsx opens a dropdown
 *   listing all three options with a checkmark on the current one. Both
 *   rendered as a near-identical square icon chip in a near-identical
 *   position, so the visual similarity actively promised "these behave the
 *   same way" when they didn't, a user who learned "click the icon, pick
 *   from a list" on the authenticated side hit a completely different,
 *   undiscoverable cycling interaction the moment they landed on /login or
 *   the public site. Now opens the same three-option dropdown ModeToggle
 *   uses, keeping this component's own solid-chip trigger styling (which
 *   matches the public site's hero sections, ModeToggle's ghost-button
 *   style is built for PageHeader's lighter chrome and wouldn't fit here).
 *
 * [CHANGE]: Rendered by <PublicHeader /> (components/shared/PublicHeader.tsx),
 *   which every public page now gets from (public)/layout.tsx, pages no longer
 *   place their own toggle. It now sits on the header bar, so the solid dark
 *   chip + shadow behind it is gone: it is a plain icon button (transparent,
 *   subtle hover/open tint) with a larger 24px icon in a 48px hit area, above
 *   the project's 44px minimum touch target (sms-erp-ux, "Touch targets").
 *
 * [USAGE]: <PublicThemeToggle /> inside a page's header/back-link row.
 *   Pass a `className` to override sizing/position (e.g. `ml-auto` to push
 *   it to the far end of a flex row that isn't already `justify-between`).
 */

import { useTheme } from '@/components/providers/ThemeProvider'
import { Check } from 'lucide-react'
import { THEME_OPTIONS, ThemeIcon, themeLabel } from '@/components/shared/themeOptions'
import { useHasMounted } from '@/hooks/useHasMounted'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface PublicThemeToggleProps {
  className?: string
}

export function PublicThemeToggle({ className = '' }: PublicThemeToggleProps) {
  const { theme, setTheme } = useTheme()
  const mounted = useHasMounted()

  // The button shows the icon of the chosen setting (sun, moon, or sun-and-moon
  // for Auto), so Auto is visible on the button itself. The tick in the menu
  // and the label say the same.
  const choiceLabel = themeLabel(theme)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={mounted ? `Theme: ${choiceLabel}. Press to change.` : 'Toggle theme'}
          title={mounted ? `Theme: ${choiceLabel}` : undefined}
          className={`w-12 h-12 rounded-xl text-body hover:bg-black/5 dark:hover:bg-white/10 data-[state=open]:bg-black/5 dark:data-[state=open]:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/50 relative flex items-center justify-center transition-colors shrink-0 cursor-pointer ${className}`}
        >
          <ThemeIcon choice={mounted ? theme : 'light'} className="w-6 h-6" />
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
            {mounted && theme === value && (
              <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
