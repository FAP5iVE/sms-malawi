/*
 * apps/web/src/components/calendar/MobileCalendarView.tsx
 *
 * [CHANGE TYPE]: NEW FILE (replaces the FullCalendar mobile config
 *   previously inlined in calendar/page.tsx)
 * [PURPOSE]: Interactive Calendar UI adoption — a deliberately different
 *   mobile layout from DesktopCalendarView.tsx (per the reference's own
 *   MobileCalendarView.tsx): compact top bar with month nav, a filter
 *   bottom-sheet instead of a filter strip (screen width can't fit 9 chips),
 *   a full month grid sized for touch, the selected day's events below it,
 *   and a floating quick-add bar pinned above the mobile bottom nav.
 *
 *   Two deliberate departures from the reference, both noted where they
 *   apply: (1) the grid starts on Monday, matching the desktop grid and
 *   the rest of this system, instead of the reference's Sunday-first
 *   mobile grid — the same week position should mean the same weekday on
 *   every surface; (2) the reference's redundant left-side hamburger
 *   button (which only duplicated the filter action) is dropped since
 *   this app's own shell already provides primary navigation — see
 *   MobileBottomNav — so a second nav-shaped icon here would just be an
 *   orphaned duplicate control.
 *
 *   "Better events color filtering with right size and look" (per the
 *   original request): filter chips render at 40px+ min-height inside
 *   the sheet (CategoryFilterBar's `compact` mode) instead of the
 *   reference's cramped inline strip, and day-cell event bars are sized
 *   for a touch grid (rounded-full, 3–4px thick, 44px+ tall cells) rather
 *   than the reference's 1px slivers.
 * [DEPENDS ON]: ./calendarUtils, ./calendarConfig, ./CategoryFilterBar,
 *   ./CalendarEventListItem, @/components/shared/MotionBottomSheet
 */
'use client'
import { useState } from 'react'
import { ChevronLeft, ChevronRight, Filter, Plus, CalendarDays, Search, X } from 'lucide-react'
import type { CalendarEvent, CalendarEventCategory } from '@shared/types/calendar'
import { CATEGORY_LEGEND, categoryColor } from './calendarConfig'
import { CategoryFilterBar } from './CategoryFilterBar'
import { CalendarEventListItem } from './CalendarEventListItem'
import { MotionBottomSheet } from '@/components/shared/MotionBottomSheet'
import {
  WEEK_HEADERS_SHORT,
  formatMonthShort,
  formatDisplayDate,
  type CalendarDayCell,
} from './calendarUtils'

interface MobileCalendarViewProps {
  monthDate: Date
  onNavigateMonth: (delta: number) => void
  onGoToToday: () => void
  selectedDateKey: string
  onSelectDate: (dateKey: string) => void
  days: CalendarDayCell[]
  selectedDayEvents: CalendarEvent[]
  activeCategories: Set<CalendarEventCategory>
  onToggleCategory: (category: CalendarEventCategory) => void
  onSelectAllCategories: () => void
  onClearAllCategories: () => void
  searchQuery: string
  onSearchChange: (q: string) => void
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  /** Directly creates a minimal event on the selected day (title only —
   *  category/time/location default; matches the reference's own mobile
   *  quick-add, which creates immediately rather than opening a form).
   *  Full detail can always be added afterwards via the row's Edit action,
   *  which opens the same CalendarEventFormDialog the desktop view uses. */
  onQuickAdd: (title: string) => void
  onEditEvent: (event: CalendarEvent) => void
  onRequestDelete: (event: CalendarEvent) => void
  isLoading: boolean
  isError: boolean
}

export function MobileCalendarView({
  monthDate,
  onNavigateMonth,
  onGoToToday,
  selectedDateKey,
  onSelectDate,
  days,
  selectedDayEvents,
  activeCategories,
  onToggleCategory,
  onSelectAllCategories,
  onClearAllCategories,
  searchQuery,
  onSearchChange,
  canCreate,
  canEdit,
  canDelete,
  onQuickAdd,
  onEditEvent,
  onRequestDelete,
  isLoading,
  isError,
}: MobileCalendarViewProps) {
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [quickTitle, setQuickTitle] = useState('')

  const activeCount = activeCategories.size
  const totalCount = CATEGORY_LEGEND.length

  function handleQuickAdd(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = quickTitle.trim()
    if (trimmed.length < 2) return
    onQuickAdd(trimmed)
    setQuickTitle('')
  }

  return (
    <div className="md:hidden flex flex-col h-[calc(100vh-9.5rem)] min-h-[480px] bg-surface border border-base rounded-2xl overflow-hidden">
      {/* ── TOP BAR ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-base shrink-0">
        <button
          type="button"
          onClick={onGoToToday}
          aria-label="Jump to today"
          className="p-2 min-h-[40px] min-w-[40px] rounded-xl text-muted hover:text-body hover:bg-page transition-colors flex items-center justify-center"
        >
          <CalendarDays className="w-4 h-4" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onNavigateMonth(-1)}
            aria-label="Previous month"
            className="p-2 min-h-[40px] min-w-[40px] rounded-xl text-muted hover:text-body hover:bg-page transition-colors flex items-center justify-center"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <span className="text-sm font-heading font-bold text-body px-1 min-w-[7.5rem] text-center">
            {formatMonthShort(monthDate)} {monthDate.getFullYear()}
          </span>
          <button
            type="button"
            onClick={() => onNavigateMonth(1)}
            aria-label="Next month"
            className="p-2 min-h-[40px] min-w-[40px] rounded-xl text-muted hover:text-body hover:bg-page transition-colors flex items-center justify-center"
          >
            <ChevronRight className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSearchOpen((s) => !s)}
            aria-label="Search events"
            aria-pressed={searchOpen}
            className={`p-2 min-h-[40px] min-w-[40px] rounded-xl transition-colors flex items-center justify-center ${
              searchOpen ? 'text-brand-teal bg-brand-teal/10' : 'text-muted hover:text-body hover:bg-page'
            }`}
          >
            <Search className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setFilterSheetOpen(true)}
            aria-label="Filter by category"
            className="relative p-2 min-h-[40px] min-w-[40px] rounded-xl text-muted hover:text-body hover:bg-page transition-colors flex items-center justify-center"
          >
            <Filter className="w-4 h-4" aria-hidden="true" />
            {activeCount < totalCount && (
              <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-brand-coral text-white text-[9px] font-bold flex items-center justify-center">
                {activeCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="px-3 py-2 border-b border-base shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search events..."
              aria-label="Search events"
              className="w-full pl-9 pr-9 py-2.5 min-h-[44px] text-sm bg-page border border-base rounded-xl text-body placeholder-muted focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 min-h-[32px] min-w-[32px] text-muted hover:text-body"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="px-3 py-1.5 text-[11px] text-muted flex items-center gap-1.5 shrink-0">
          <span className="w-2 h-2 rounded-full bg-brand-teal animate-pulse" aria-hidden="true" />
          Loading events…
        </div>
      )}
      {isError && (
        <div role="alert" className="mx-3 mt-1.5 text-[11px] text-brand-coral bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5 shrink-0">
          Couldn&apos;t load calendar events.
        </div>
      )}

      {/* ── MONTH GRID ───────────────────────────────────────────── */}
      <div className="px-2.5 pt-2 shrink-0">
        <div className="grid grid-cols-7 mb-1">
          {WEEK_HEADERS_SHORT.map((d, i) => (
            <span key={i} className="text-[10px] font-bold text-muted text-center py-1">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((cell) => {
            const isSelected = cell.dateKey === selectedDateKey
            return (
              <button
                key={cell.dateKey}
                type="button"
                onClick={() => onSelectDate(cell.dateKey)}
                aria-label={cell.dateKey}
                aria-pressed={isSelected}
                className={`min-h-[46px] rounded-xl flex flex-col items-center justify-start gap-1 pt-1.5 pb-1 transition-colors ${
                  isSelected
                    ? 'bg-brand-teal text-white shadow-sm'
                    : cell.isToday
                      ? 'bg-brand-teal/10 ring-1 ring-brand-teal/50'
                      : cell.isCurrentMonth
                        ? 'hover:bg-page'
                        : 'opacity-35 hover:bg-page'
                }`}
              >
                <span
                  className={`text-xs font-semibold ${
                    isSelected ? 'text-white' : cell.isToday ? 'text-brand-teal' : 'text-body'
                  }`}
                >
                  {cell.dayNumber}
                </span>
                <div className="flex flex-col gap-[3px] w-full px-1.5">
                  {cell.events.slice(0, 3).map((evt) => (
                    <span
                      key={evt.id}
                      className="h-[3px] w-full rounded-full"
                      style={{
                        backgroundColor: isSelected ? 'rgba(255,255,255,0.85)' : categoryColor(evt.category),
                      }}
                    />
                  ))}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── SELECTED DAY LIST ────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3.5 pt-3.5 pb-1.5 shrink-0">
        <h3 className="text-sm font-heading font-bold text-body truncate">
          {formatDisplayDate(selectedDateKey)}
        </h3>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-page text-muted border border-base shrink-0">
          {selectedDayEvents.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3.5 pb-2 divide-y divide-base">
        {selectedDayEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-8 text-muted">
            <CalendarDays className="w-8 h-8 mb-2 opacity-60" aria-hidden="true" />
            <p className="text-sm font-medium">No events for this date</p>
            <p className="text-xs mt-1">Use the input below to quickly add a schedule item.</p>
          </div>
        ) : (
          selectedDayEvents.map((evt) => (
            <CalendarEventListItem
              key={evt.id}
              event={evt}
              variant="row"
              onEdit={canEdit ? onEditEvent : undefined}
              onDelete={canDelete ? onRequestDelete : undefined}
            />
          ))
        )}
      </div>

      {/* ── QUICK-ADD BAR ────────────────────────────────────────── */}
      {canCreate && (
        <form
          onSubmit={handleQuickAdd}
          className="flex items-center gap-2 p-2.5 border-t border-base bg-page/60 shrink-0"
        >
          <input
            type="text"
            value={quickTitle}
            onChange={(e) => setQuickTitle(e.target.value)}
            placeholder={`Add event on ${formatMonthShort(monthDate)} ${Number(selectedDateKey.split('-')[2])}`}
            className="flex-1 min-w-0 px-4 py-2.5 min-h-[44px] text-sm bg-surface border border-base rounded-full text-body placeholder-muted focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
          />
          <button
            type="submit"
            aria-label="Add event"
            className="w-11 h-11 shrink-0 rounded-full bg-brand-teal hover:bg-brand-teal-light text-white flex items-center justify-center transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" aria-hidden="true" />
          </button>
        </form>
      )}

      <MotionBottomSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        title="Filter by Category"
      >
        <div className="space-y-4">
          <CategoryFilterBar
            activeCategories={activeCategories}
            onToggle={onToggleCategory}
            onSelectAll={onSelectAllCategories}
            onClearAll={onClearAllCategories}
            compact
          />
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onSelectAllCategories}
              className="flex-1 py-2.5 min-h-[44px] text-sm font-medium border border-base rounded-xl hover:bg-page"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={onClearAllCategories}
              className="flex-1 py-2.5 min-h-[44px] text-sm font-medium border border-base rounded-xl hover:bg-page"
            >
              Clear All
            </button>
          </div>
        </div>
      </MotionBottomSheet>
    </div>
  )
}
