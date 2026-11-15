/**
 * apps/web/src/components/shared/StatusText.tsx
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, Phase 8b-0: foundations)
 * [PURPOSE]: ONE way to show a status or role word: Primary, Pays fees, Active,
 *   Cleared, Outstanding, Pending (RULEBOOK section 2).
 *
 *   Coloured text with a small shape in front. Never a pill, never a filled or
 *   outlined box (R2.1). Five meanings only (R2.3): success, warning, danger,
 *   info, neutral. The WORD is always there, and the shape differs by meaning
 *   (circle, ring, triangle, diamond, bar), so colour is never the only signal
 *   (R2.4).
 *
 *   Keep the text at 25 characters or fewer (R2.5). Red and red-orange (danger)
 *   are for failure or error only.
 *
 *   Colours are the status tokens (text-status-*), proven 4.5:1 or better on the
 *   card, the tint, the page and muted rows in both themes by
 *   tools/hills/check-contrast.mts.
 */

import type { ReactNode } from 'react'

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const TONE_TEXT: Record<StatusTone, string> = {
  success: 'text-status-success',
  warning: 'text-status-warning',
  danger: 'text-status-danger',
  info: 'text-status-info',
  neutral: 'text-status-neutral',
}

/** The shape in front of the word; every one is 8px and uses currentColor. */
function Mark({ tone }: { tone: StatusTone }) {
  const common = { width: 8, height: 8, viewBox: '0 0 8 8', 'aria-hidden': true, className: 'shrink-0', focusable: false } as const
  switch (tone) {
    case 'success':
      return (
        <svg {...common}>
          <circle cx="4" cy="4" r="4" fill="currentColor" />
        </svg>
      )
    case 'info':
      return (
        <svg {...common}>
          <circle cx="4" cy="4" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      )
    case 'warning':
      return (
        <svg {...common}>
          <path d="M4 .5 7.8 7.5H.2Z" fill="currentColor" />
        </svg>
      )
    case 'danger':
      return (
        <svg {...common}>
          <path d="M4 0 8 4 4 8 0 4Z" fill="currentColor" />
        </svg>
      )
    case 'neutral':
      return (
        <svg {...common}>
          <rect x="0" y="3" width="8" height="2" rx="1" fill="currentColor" />
        </svg>
      )
  }
}

export interface StatusTextProps {
  tone: StatusTone
  children: ReactNode
  /** 'sm' 12px (tables, rows) or 'md' 14px (detail panels). Default 'sm'. */
  size?: 'sm' | 'md'
  className?: string
}

export function StatusText({ tone, children, size = 'sm', className = '' }: StatusTextProps) {
  return (
    <span
      data-slot="status-text"
      data-tone={tone}
      className={`inline-flex items-center gap-1.5 font-semibold leading-tight ${size === 'md' ? 'text-sm' : 'text-xs'} ${TONE_TEXT[tone]} ${className}`}
    >
      <Mark tone={tone} />
      <span>{children}</span>
    </span>
  )
}

export default StatusText
