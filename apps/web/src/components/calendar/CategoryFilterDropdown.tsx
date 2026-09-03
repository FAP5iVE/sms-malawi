/*
 * apps/web/src/components/calendar/CategoryFilterDropdown.tsx
 *
 * [CHANGE TYPE]: NEW FILE (feedback round — desktop-only; replaces
 *   DesktopCalendarView.tsx's inline <CategoryFilterBar> row)
 * [PURPOSE]: The full-width horizontal category-chip row sat in its own
 *   strip under the header and was annotated for removal, to be replaced
 *   by a compact dropdown living in the header row itself, right after
 *   Add Event. Multi-select filtering (any subset of the 8 categories, not
 *   just one at a time) is preserved — dropping to single-select would be
 *   a real capability regression — but the *closed* trigger now always
 *   summarizes the current selection as a single small control: one
 *   category's own color + name when exactly one is active (the literal
 *   "box shows the color and name of the selected event" case), a
 *   generalized multi-color dot cluster + count for every other case
 *   (all 8, none, or a partial subset), reusing this codebase's existing
 *   Popover primitive rather than a hand-rolled dropdown.
 *
 *   MobileCalendarView.tsx's own filter bottom-sheet (CategoryFilterBar in
 *   `compact` mode) is untouched — that annotation was specifically on the
 *   desktop screenshot, and a bottom sheet is still the right pattern for
 *   touch.
 * [DEPENDS ON]: @/components/ui/popover, ./calendarConfig (CATEGORY_LEGEND,
 *   categoryColor, categoryLabel)
 */
'use client'
import { useState } from 'react'
import { Check, ChevronDown, Layers } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CATEGORY_LEGEND, categoryColor, categoryLabel } from './calendarConfig'
import type { CalendarEventCategory } from '@shared/types/calendar'

interface CategoryFilterDropdownProps {
  activeCategories: Set<CalendarEventCategory>
  onToggleCategory: (category: CalendarEventCategory) => void
  onSelectAll: () => void
  onClearAll: () => void
}

export function CategoryFilterDropdown({
  activeCategories,
  onToggleCategory,
  onSelectAll,
  onClearAll,
}: CategoryFilterDropdownProps) {
  const [open, setOpen] = useState(false)
  const count = activeCategories.size
  const total = CATEGORY_LEGEND.length
  const onlyActive = count === 1 ? Array.from(activeCategories)[0] : null

  let label: string
  if (count === 0) label = 'No Categories'
  else if (count === total) label = 'All Categories'
  else if (onlyActive) label = categoryLabel(onlyActive)
  else label = `${count} Categories`

  const previewColors = onlyActive
    ? [categoryColor(onlyActive)]
    : CATEGORY_LEGEND.filter((c) => activeCategories.has(c.category))
        .slice(0, 3)
        .map((c) => categoryColor(c.category))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Filter events by category"
          className="flex items-center gap-2 px-3 py-2 min-h-[36px] rounded-xl bg-page border border-base hover:bg-surface transition-colors text-xs font-heading font-medium text-body max-w-[180px]"
        >
          {previewColors.length > 0 ? (
            <span className="flex -space-x-1 shrink-0">
              {previewColors.map((c, i) => (
                <span
                  key={i}
                  className="w-2.5 h-2.5 rounded-full ring-2 ring-page"
                  style={{ backgroundColor: c }}
                  aria-hidden="true"
                />
              ))}
            </span>
          ) : (
            <Layers className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">{label}</span>
          <ChevronDown className="w-3.5 h-3.5 text-muted shrink-0 ml-auto" aria-hidden="true" />
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-64 p-0" align="end">
        <div className="px-3 py-2.5 border-b border-base">
          <span className="text-xs font-heading font-semibold text-muted uppercase tracking-wide">
            Filter by Category
          </span>
        </div>

        <div className="max-h-80 overflow-y-auto p-1.5">
          {CATEGORY_LEGEND.map(({ category, label: catLabel }) => {
            const active = activeCategories.has(category)
            const color = categoryColor(category)
            return (
              <button
                key={category}
                type="button"
                onClick={() => onToggleCategory(category)}
                aria-pressed={active}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-page text-sm text-left transition-colors"
              >
                <span
                  className="w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors"
                  style={active ? { backgroundColor: color, borderColor: color } : undefined}
                  aria-hidden="true"
                >
                  {active && <Check className="w-3 h-3 text-white" aria-hidden="true" />}
                </span>
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                />
                <span className="flex-1 truncate text-body">{catLabel}</span>
              </button>
            )
          })}
        </div>

        <div className="flex gap-2 p-2 border-t border-base">
          <button
            type="button"
            onClick={onClearAll}
            className="flex-1 py-1.5 text-xs font-medium border border-base rounded-lg hover:bg-page transition-colors"
          >
            Clear All
          </button>
          <button
            type="button"
            onClick={onSelectAll}
            className="flex-1 py-1.5 text-xs font-medium border border-base rounded-lg hover:bg-page transition-colors"
          >
            Select All
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}