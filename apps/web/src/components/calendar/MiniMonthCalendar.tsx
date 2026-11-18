/*
 * apps/web/src/components/calendar/MiniMonthCalendar.tsx
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Interactive Calendar UI adoption — the compact month picker
 *   in the desktop sidebar (month/year header, prev/next nav, 7-column
 *   day grid with a small colored dot under any day carrying events).
 *   Mirrors interactive-calendar-ui's DesktopCalendarView.tsx mini-calendar
 *   block, extracted to its own component since it renders its own
 *   month grid independent of the main grid's own layout/interaction.
 * [DEPENDS ON]: ./calendarUtils (CalendarDayCell, WEEK_HEADERS_SHORT,
 *   formatMonthYear), ./calendarConfig (categoryColor)
 */
'use client'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { CalendarDayCell } from './calendarUtils'
import { WEEK_HEADERS_SHORT, formatMonthYear } from './calendarUtils'
import { categoryColor } from './calendarConfig'

interface MiniMonthCalendarProps {
  monthDate: Date
  selectedDateKey: string
  onSelectDate: (dateKey: string) => void
  onNavigateMonth: (delta: number) => void
  days: CalendarDayCell[]
}

export function MiniMonthCalendar({
  monthDate,
  selectedDateKey,
  onSelectDate,
  onNavigateMonth,
  days,
}: MiniMonthCalendarProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-heading font-bold text-body">
          {formatMonthYear(monthDate)}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onNavigateMonth(-1)}
            aria-label="Previous month"
            className="inline-flex items-center justify-center min-h-9 min-w-9 rounded-xl text-muted hover:text-body hover:bg-page transition-colors"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onNavigateMonth(1)}
            aria-label="Next month"
            className="inline-flex items-center justify-center min-h-9 min-w-9 rounded-xl text-muted hover:text-body hover:bg-page transition-colors"
          >
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {WEEK_HEADERS_SHORT.map((d, i) => (
          <span key={i} className="text-xs font-medium text-muted py-1">
            {d}
          </span>
        ))}
        {days.map((cell) => {
          const isSelected = cell.dateKey === selectedDateKey
          const firstEventColor = cell.events[0] ? categoryColor(cell.events[0].category) : null

          return (
            <button
              key={cell.dateKey}
              type="button"
              onClick={() => onSelectDate(cell.dateKey)}
              aria-label={cell.dateKey}
              aria-pressed={isSelected}
              className={`h-9 w-9 mx-auto rounded-xl text-sm font-medium flex items-center justify-center relative transition-colors ${
                isSelected
                  ? 'bg-btn-brand text-btn-brand-fg font-bold'
                  : cell.isToday
                    ? 'ring-2 ring-brand-teal text-tone-teal font-semibold'
                    : cell.isCurrentMonth
                      ? 'text-body hover:bg-page'
                      : 'text-muted hover:bg-page'
              }`}
            >
              {cell.dayNumber}
              {cell.events.length > 0 && !isSelected && (
                <span
                  className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{ backgroundColor: firstEventColor ?? undefined }}
                  aria-hidden="true"
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
