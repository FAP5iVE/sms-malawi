/*
 * apps/web/src/components/calendar/DesktopCalendarView.tsx
 *
 * [CHANGE TYPE]: NEW FILE (replaces the FullCalendar-based desktop render
 *   previously inlined in calendar/page.tsx)
 * [PURPOSE]: Interactive Calendar UI adoption — desktop layout matching
 *   the reference's DesktopCalendarView.tsx: a left sidebar (Calendar Hub
 *   header + mini month calendar + selected-day event list) and a main
 *   pane (nav/search/view-mode header + category filter strip + a
 *   borderless month grid with stacked category-color bars — no event
 *   text inside day cells, per the reference screenshots — or an Agenda
 *   list). Hidden on mobile (`hidden md:flex`) — MobileCalendarView.tsx
 *   is the `md:hidden` counterpart; both mount from calendar/page.tsx so
 *   data is fetched once and passed down, matching this codebase's
 *   established CSS-controlled-visibility responsive pattern (see
 *   app/(auth)/layout.tsx's own header comment on that convention).
 * [DEPENDS ON]: ./calendarUtils, ./calendarConfig, ./MiniMonthCalendar,
 *   ./CategoryFilterBar, ./CalendarEventListItem, @shared/types/calendar
 */
'use client'
import { useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
  Calendar as CalendarIcon,
  Layers,
} from 'lucide-react'
import type { CalendarEvent, CalendarEventCategory } from '@shared/types/calendar'
import { CATEGORY_LEGEND, categoryColor } from './calendarConfig'
import { CategoryFilterBar } from './CategoryFilterBar'
import { CalendarEventListItem } from './CalendarEventListItem'
import { MiniMonthCalendar } from './MiniMonthCalendar'
import {
  WEEK_HEADERS,
  formatMonthYear,
  formatDisplayDate,
  type CalendarDayCell,
} from './calendarUtils'

export type CalendarViewMode = 'month' | 'agenda'

interface DesktopCalendarViewProps {
  monthDate: Date
  onNavigateMonth: (delta: number) => void
  onGoToToday: () => void
  selectedDateKey: string
  onSelectDate: (dateKey: string) => void
  days: CalendarDayCell[]
  filteredEvents: CalendarEvent[]
  selectedDayEvents: CalendarEvent[]
  activeCategories: Set<CalendarEventCategory>
  onToggleCategory: (category: CalendarEventCategory) => void
  onSelectAllCategories: () => void
  onClearAllCategories: () => void
  searchQuery: string
  onSearchChange: (q: string) => void
  viewMode: CalendarViewMode
  onViewModeChange: (mode: CalendarViewMode) => void
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  onOpenCreate: (dateKey?: string) => void
  onEditEvent: (event: CalendarEvent) => void
  onRequestDelete: (event: CalendarEvent) => void
  isLoading: boolean
  isError: boolean
  academicYearLabel?: string
}

export function DesktopCalendarView({
  monthDate,
  onNavigateMonth,
  onGoToToday,
  selectedDateKey,
  onSelectDate,
  days,
  filteredEvents,
  selectedDayEvents,
  activeCategories,
  onToggleCategory,
  onSelectAllCategories,
  onClearAllCategories,
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  canCreate,
  canEdit,
  canDelete,
  onOpenCreate,
  onEditEvent,
  onRequestDelete,
  isLoading,
  isError,
  academicYearLabel,
}: DesktopCalendarViewProps) {
  const [hoveredDateKey, setHoveredDateKey] = useState<string | null>(null)

  return (
    <div className="hidden md:flex h-[calc(100vh-8.5rem)] min-h-[560px] w-full bg-surface border border-base rounded-2xl overflow-hidden">
      {/* ── LEFT SIDEBAR ─────────────────────────────────────────── */}
      <aside className="w-80 xl:w-96 shrink-0 bg-page/60 border-r border-base flex flex-col h-full overflow-hidden">
        <div className="p-4 pb-3 border-b border-base flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-brand-teal/15 border border-brand-teal/30 flex items-center justify-center text-brand-teal shrink-0">
              <CalendarIcon className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-heading font-bold text-body truncate">Calendar Hub</h2>
              {academicYearLabel && (
                <p className="text-[11px] text-muted truncate">Academic Year {academicYearLabel}</p>
              )}
            </div>
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={() => onOpenCreate(selectedDateKey)}
              title="Create Event"
              aria-label="Create event"
              className="p-2 min-h-[36px] min-w-[36px] rounded-xl bg-brand-teal hover:bg-brand-teal-light text-white transition-colors shadow-sm flex items-center justify-center shrink-0"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="px-5 pt-4 pb-2">
          <MiniMonthCalendar
            monthDate={monthDate}
            selectedDateKey={selectedDateKey}
            onSelectDate={onSelectDate}
            onNavigateMonth={onNavigateMonth}
            days={days}
          />
        </div>

        <div className="px-5 pt-3 pb-2 border-t border-base flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-brand-teal">
              Selected Date
            </span>
            <h3 className="text-sm font-heading font-semibold text-body truncate">
              {formatDisplayDate(selectedDateKey)}
            </h3>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-page text-muted border border-base shrink-0">
            {selectedDayEvents.length} {selectedDayEvents.length === 1 ? 'event' : 'events'}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2.5">
          {selectedDayEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center p-6 text-muted">
              <div className="w-12 h-12 rounded-2xl bg-page border border-base flex items-center justify-center mb-2.5">
                <CalendarIcon className="w-6 h-6" aria-hidden="true" />
              </div>
              <p className="text-sm font-medium">No events scheduled</p>
              <p className="text-xs mt-1 max-w-[200px]">
                {canCreate
                  ? 'Click below to add a lecture, deadline, holiday, or schedule item.'
                  : 'Nothing on the calendar for this day yet.'}
              </p>
              {canCreate && (
                <button
                  type="button"
                  onClick={() => onOpenCreate(selectedDateKey)}
                  className="mt-3 px-3.5 py-2 min-h-[40px] rounded-lg bg-page hover:bg-base/60 text-xs font-heading font-semibold text-body border border-base flex items-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 text-brand-teal" aria-hidden="true" />
                  Add Event for this Day
                </button>
              )}
            </div>
          ) : (
            selectedDayEvents.map((evt) => (
              <CalendarEventListItem
                key={evt.id}
                event={evt}
                onEdit={canEdit ? onEditEvent : undefined}
                onDelete={canDelete ? onRequestDelete : undefined}
              />
            ))
          )}
        </div>

        <div className="p-3 border-t border-base flex items-center gap-1.5 text-xs text-muted">
          <Layers className="w-3.5 h-3.5" aria-hidden="true" />
          <span>
            Active filters: {activeCategories.size}/{CATEGORY_LEGEND.length}
          </span>
        </div>
      </aside>

      {/* ── MAIN PANE ────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-surface">
        <header className="p-4 px-6 border-b border-base flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-page border border-base rounded-xl p-1">
              <button
                type="button"
                onClick={() => onNavigateMonth(-1)}
                title="Previous month"
                aria-label="Previous month"
                className="p-1.5 min-h-[36px] min-w-[36px] rounded-lg text-muted hover:text-body hover:bg-surface transition-colors"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={onGoToToday}
                className="px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-heading font-semibold text-body hover:bg-surface transition-colors"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => onNavigateMonth(1)}
                title="Next month"
                aria-label="Next month"
                className="p-1.5 min-h-[36px] min-w-[36px] rounded-lg text-muted hover:text-body hover:bg-surface transition-colors"
              >
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <h1 className="text-xl font-heading font-bold text-body ml-1">
              {formatMonthYear(monthDate)}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search
                className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search events..."
                aria-label="Search events"
                className="pl-9 pr-3 py-2 min-h-[36px] text-xs bg-page border border-base rounded-xl text-body placeholder-muted focus:outline-none focus:ring-2 focus:ring-brand-teal/25 w-44 lg:w-60 transition-all"
              />
            </div>

            <div className="flex items-center bg-page border border-base rounded-xl p-1">
              {(['month', 'agenda'] as CalendarViewMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onViewModeChange(mode)}
                  aria-pressed={viewMode === mode}
                  className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-heading font-medium capitalize transition-colors ${
                    viewMode === mode
                      ? 'bg-brand-navy text-white font-semibold shadow-sm'
                      : 'text-muted hover:text-body'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {canCreate && (
              <button
                type="button"
                onClick={() => onOpenCreate(selectedDateKey)}
                className="px-3.5 py-2 min-h-[36px] rounded-xl bg-brand-teal hover:bg-brand-teal-light text-white font-heading font-semibold text-xs transition-colors shadow-sm flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Add Event
              </button>
            )}
          </div>
        </header>

        <div className="px-6 py-2.5 bg-page/50 border-b border-base shrink-0">
          <CategoryFilterBar
            activeCategories={activeCategories}
            onToggle={onToggleCategory}
            onSelectAll={onSelectAllCategories}
            onClearAll={onClearAllCategories}
          />
        </div>

        {isLoading && (
          <div className="px-6 py-2 text-xs text-muted flex items-center gap-2 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-teal animate-pulse" aria-hidden="true" />
            Loading events…
          </div>
        )}
        {isError && (
          <div
            role="alert"
            className="mx-6 mt-2 text-xs text-brand-coral bg-red-50 border border-red-200 rounded-lg px-3 py-2 shrink-0"
          >
            Couldn&apos;t load calendar events. Please try again.
          </div>
        )}

        <div className="flex-1 flex flex-col min-h-0 p-4 lg:p-6 overflow-hidden">
          {viewMode === 'agenda' ? (
            <div className="h-full overflow-y-auto pr-2 space-y-4">
              <h2 className="text-base font-heading font-bold text-body flex items-center gap-2">
                <span>Agenda for {formatMonthYear(monthDate)}</span>
                <span className="text-xs font-normal text-muted">
                  ({filteredEvents.length} {filteredEvents.length === 1 ? 'event' : 'events'})
                </span>
              </h2>
              {filteredEvents.length === 0 ? (
                <div className="p-8 text-center text-muted bg-page/40 rounded-2xl border border-base">
                  No events found matching your search or filters.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredEvents.map((evt) => (
                    <CalendarEventListItem
                      key={evt.id}
                      event={evt}
                      onEdit={canEdit ? onEditEvent : undefined}
                      onDelete={canDelete ? onRequestDelete : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="grid grid-cols-7 gap-2 mb-2 shrink-0">
                {WEEK_HEADERS.map((day) => (
                  <div
                    key={day}
                    className="text-center text-xs font-bold tracking-wider text-muted uppercase py-1"
                  >
                    {day}
                  </div>
                ))}
              </div>

              <div
                className="grid grid-cols-7 gap-2 flex-1 min-h-0"
                style={{ gridTemplateRows: `repeat(${days.length / 7}, minmax(0, 1fr))` }}
              >
                {days.map((cell) => {
                  const isSelected = cell.dateKey === selectedDateKey
                  const isHovered = hoveredDateKey === cell.dateKey
                  const hasEvents = cell.events.length > 0

                  return (
                    <div
                      key={cell.dateKey}
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectDate(cell.dateKey)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') onSelectDate(cell.dateKey)
                      }}
                      onMouseEnter={() => setHoveredDateKey(cell.dateKey)}
                      onMouseLeave={() => setHoveredDateKey(null)}
                      className={`relative flex flex-col justify-between p-2 lg:p-2.5 rounded-2xl transition-colors cursor-pointer outline-none ${
                        isSelected
                          ? 'bg-page ring-2 ring-brand-teal/80 shadow-sm'
                          : cell.isToday
                            ? 'bg-page ring-1 ring-brand-teal/50'
                            : cell.isCurrentMonth
                              ? 'bg-page/60 hover:bg-page'
                              : 'bg-page/20 hover:bg-page/40 opacity-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-sm lg:text-base font-semibold ${
                            isSelected || cell.isToday
                              ? 'text-brand-teal font-bold'
                              : cell.isCurrentMonth
                                ? 'text-body'
                                : 'text-muted'
                          }`}
                        >
                          {cell.dayNumber}
                        </span>
                        {cell.isToday && (
                          <span className="w-1.5 h-1.5 rounded-full bg-brand-teal" aria-hidden="true" />
                        )}
                      </div>

                      <div className="flex flex-col gap-1 my-auto w-full px-0.5">
                        {cell.events.slice(0, 4).map((evt) => (
                          <div
                            key={evt.id}
                            className="h-1.5 lg:h-2 w-full rounded-full"
                            style={{ backgroundColor: categoryColor(evt.category) }}
                            title={evt.title}
                          />
                        ))}
                        {cell.events.length > 4 && (
                          <span className="text-[10px] font-bold text-muted text-center leading-none">
                            +{cell.events.length - 4} more
                          </span>
                        )}
                      </div>

                      {isHovered && hasEvents && (
                        <div className="absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 p-2.5 rounded-xl bg-body text-page shadow-2xl pointer-events-none text-left">
                          <p className="text-[11px] font-bold pb-1 border-b border-white/15">
                            {formatDisplayDate(cell.dateKey)}
                          </p>
                          <div className="mt-1.5 space-y-1.5 max-h-36 overflow-hidden">
                            {cell.events.map((e) => (
                              <div key={e.id} className="flex items-center gap-1.5 text-xs">
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: categoryColor(e.category) }}
                                  aria-hidden="true"
                                />
                                <span className="truncate font-medium">{e.title}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
