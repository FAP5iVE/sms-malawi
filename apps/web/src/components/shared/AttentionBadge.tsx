/**
 * apps/web/src/components/shared/AttentionBadge.tsx
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, Phase 8b-0: foundations)
 * [PURPOSE]: ONE badge for "something here needs you", used on sidebar items,
 *   bottom-bar items, tabs and the header bell (RULEBOOK section 6).
 *
 *   • A count (filled shape, allowed by R2.2) or a dot. "99+" above 99.
 *   • Draws nothing for 0, NaN, negative, decimal, null or undefined (R6.3).
 *   • Never focusable. Screen readers hear a sentence, "5 waiting for your
 *     review", not a bare number (R6.5).
 *   • `onDark` is for the sidebar, which is dark navy in both themes.
 *
 *   The number must come from data the page already loads. This component
 *   fetches nothing. The list of allowed sources is in lib/hills/attention.ts.
 */

import { countBadgePlan, dotBadgePlan } from '@/lib/hills/attention'

export interface AttentionBadgeProps {
  /** The number that needs attention. Hidden when not a whole number above 0. */
  count?: number | null
  /** Show a dot instead of a number (when the number would not change what the person does). */
  dot?: boolean
  /** Finishes the screen reader sentence: "waiting for your review". */
  noun: string
  /** On the sidebar (always dark). Uses the bright colour pair. */
  onDark?: boolean
  className?: string
}

export function AttentionBadge({ count, dot = false, noun, onDark = false, className = '' }: AttentionBadgeProps) {
  const plan = dot ? dotBadgePlan(true, noun) : countBadgePlan(count, noun)
  if (!plan.show) return null

  const fill = onDark ? 'bg-[hsl(var(--attn-fill-on-dark))]' : 'bg-[hsl(var(--attn-fill))]'
  const ink = onDark ? 'text-[hsl(var(--attn-fg-on-dark))]' : 'text-[hsl(var(--attn-fg))]'

  return (
    <span data-slot="attention-badge" data-kind={dot ? 'dot' : 'count'} className={`inline-flex shrink-0 ${className}`}>
      {dot ? (
        <span aria-hidden="true" className={`block size-2 rounded-full ${fill}`} />
      ) : (
        <span
          aria-hidden="true"
          className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-heading font-bold leading-none tabular-nums ${fill} ${ink}`}
        >
          {plan.text}
        </span>
      )}
      <span className="sr-only">{plan.label}</span>
    </span>
  )
}

export default AttentionBadge
