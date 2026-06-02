'use client'

import { useTheme }     from 'next-themes'
import { useEffect, useState }    from 'react'
import { Sun, Moon, Monitor, Check } from 'lucide-react'
import { Button }       from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn }           from '@/lib/utils'
import type { ThemeMode } from '@/store/themeStore'

// ─────────────────────────────────────────────────────────
//  THEME OPTIONS
// ─────────────────────────────────────────────────────────

const THEME_OPTIONS: Array<{
  value: ThemeMode
  label: string
  icon:  React.ElementType
}> = [
  { value: 'light',  label: 'Light',  icon: Sun     },
  { value: 'dark',   label: 'Dark',   icon: Moon    },
  { value: 'system', label: 'System', icon: Monitor },
]

// ─────────────────────────────────────────────────────────
//  ICON RESOLVER
//  Returns the correct icon for the current active theme.
//  Uses the resolved theme (actual light/dark) for the icon
//  when system mode is active, so the icon always reflects
//  what the user is actually seeing.
// ─────────────────────────────────────────────────────────

function ActiveIcon({ resolvedTheme }: { resolvedTheme: string | undefined }) {
  if (resolvedTheme === 'dark') {
    return <Moon className="h-4 w-4" />
  }
  return <Sun className="h-4 w-4" />
}

// ─────────────────────────────────────────────────────────
//  COMPONENT
// ─────────────────────────────────────────────────────────

interface ModeToggleProps {
  /** Render as a full button with label instead of icon-only. */
  showLabel?: boolean
  className?: string
}

export function ModeToggle({ showLabel = false, className }: ModeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme()

  // next-themes requires mounted state to avoid hydration mismatch —
  // the server doesn't know the user's stored theme preference.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted) {
    // Render an inert placeholder with the same dimensions to prevent
    // layout shift while mounting. Never render null — that shifts content.
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn('h-9 w-9 opacity-0 pointer-events-none', className)}
        aria-hidden="true"
        tabIndex={-1}
      >
        <Sun className="h-4 w-4" />
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={showLabel ? 'sm' : 'icon'}
          className={cn(
            'h-9 relative',
            showLabel ? 'gap-2 px-3' : 'w-9',
            'text-muted-foreground hover:text-foreground hover:bg-accent transition-colors',
            className
          )}
          aria-label={`Current theme: ${theme ?? 'system'}. Click to change theme.`}
        >
          <ActiveIcon resolvedTheme={resolvedTheme} />
          {showLabel && (
            <span className="text-sm font-medium capitalize">
              {theme === 'system' ? 'System' : (theme ?? 'System')}
            </span>
          )}
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-36 min-w-0">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className={cn(
              'flex items-center gap-2.5 cursor-pointer',
              theme === value && 'text-foreground font-medium'
            )}
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