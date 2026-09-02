/*
 * apps/web/src/components/calendar/CategoryFilterBar.tsx
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Interactive Calendar UI adoption — the horizontal "All +
 *   8 category" filter-chip row, shared verbatim between the desktop
 *   header strip and the mobile filter bottom sheet (`compact` prop tunes
 *   touch-target sizing for the latter — see MobileCalendarView.tsx's own
 *   comment on "better events color filtering with right size and look").
 *   Replaces calendar/page.tsx's inline CategoryChip function so the same
 *   chip renders identically in both views instead of two hand-rolled
 *   copies drifting apart.
 * [DEPENDS ON]: ./calendarConfig (CATEGORY_LEGEND, categoryColor)
 */
'use client'
import { Check } from 'lucide-react'
import { CATEGORY_LEGEND } from './calendarConfig'
import { CALENDAR_COLORS } from '@shared/types/calendar'
import type { CalendarEventCategory } from '@shared/types/calendar'

interface CategoryFilterBarProps {
  activeCategories: Set<CalendarEventCategory>
  onToggle: (category: CalendarEventCategory) => void
  onSelectAll: () => void
  onClearAll: () => void
  /** Larger touch targets + always-wrapping layout — used inside the
   *  mobile filter sheet instead of the desktop's horizontal scroll strip. */
  compact?: boolean
}

export function CategoryFilterBar({
  activeCategories,
  onToggle,
  onSelectAll,
  onClearAll,
  compact = false,
}: CategoryFilterBarProps) {
  const isAllActive = activeCategories.size === CATEGORY_LEGEND.length

  return (
    <div
      className={
        compact
          ? 'flex flex-wrap gap-2'
          : 'flex items-center gap-2 overflow-x-auto pb-1'
      }
    >
      <button
        type="button"
        onClick={() => (isAllActive ? onClearAll() : onSelectAll())}
        aria-pressed={isAllActive}
        className={`flex items-center gap-1.5 rounded-full font-heading font-medium border shrink-0 transition-colors ${
          compact ? 'min-h-[40px] px-3.5 py-2 text-sm' : 'px-3 py-1.5 text-xs'
        } ${
          isAllActive
            ? 'bg-brand-navy text-white border-brand-navy'
            : 'border-base text-muted bg-surface hover:bg-page'
        }`}
      >
        <span className="w-2 h-2 rounded-full bg-current opacity-70" aria-hidden="true" />
        All
        {isAllActive && <Check className="w-3.5 h-3.5" aria-hidden="true" />}
      </button>

      {CATEGORY_LEGEND.map(({ category, label }) => {
        const active = activeCategories.has(category)
        const color = CALENDAR_COLORS[category]
        return (
          <button
            key={category}
            type="button"
            onClick={() => onToggle(category)}
            aria-pressed={active}
            className={`flex items-center gap-1.5 rounded-full font-medium border shrink-0 transition-all ${
              compact ? 'min-h-[40px] px-3.5 py-2 text-sm' : 'px-3 py-1.5 text-xs'
            } ${
              active
                ? 'border-transparent text-white shadow-sm'
                : 'border-base text-muted bg-surface opacity-60 hover:opacity-100 hover:bg-page'
            }`}
            style={active ? { backgroundColor: color } : {}}
          >
            <span
              className={`rounded-full shrink-0 ${compact ? 'w-2.5 h-2.5' : 'w-2 h-2'}`}
              aria-hidden="true"
              style={{ backgroundColor: active ? 'rgba(255,255,255,0.85)' : color }}
            />
            {label}
          </button>
        )
      })}
    </div>
  )
}
