'use client'

import { useTheme }     from '@/components/providers/ThemeProvider'
import { useEffect, useState }    from 'react'
import { Sun, Check } from 'lucide-react'
import { THEME_OPTIONS, ThemeIcon, themeLabel } from '@/components/shared/themeOptions'
import { Button }       from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn }           from '@/lib/utils'

// ─────────────────────────────────────────────────────────
//  COMPONENT
// ─────────────────────────────────────────────────────────

interface ModeToggleProps {
  /** Render as a full button with label instead of icon-only. */
  showLabel?: boolean
  className?: string
}

export function ModeToggle({ showLabel = false, className }: ModeToggleProps) {
  const { theme, setTheme } = useTheme()

  // next-themes requires mounted state to avoid hydration mismatch —
  // the server doesn't know the user's stored theme preference.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
   const id = requestAnimationFrame(() => setMounted(true))
   return () => cancelAnimationFrame(id)
  }, [])

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
          aria-label={`Current theme: ${themeLabel(theme)}. Press to change theme.`}
        >
          <ThemeIcon choice={theme} className="h-4 w-4" />
          {showLabel && (
            <span className="text-sm font-medium capitalize">
              {themeLabel(theme)}
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