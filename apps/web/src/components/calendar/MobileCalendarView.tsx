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
 *
 * [CHANGE TYPE]: TARGETED EDIT (feedback round — "add an Add Event button
 *   and a Month/Agenda switch without disturbing the current clean look")
 * [PURPOSE]: The approved top bar (Today/nav/search/filter) is untouched —
 *   pixel-identical to what was already approved. Both new controls landed
 *   in a new, second slim row directly beneath it instead of crowding into
 *   the same row: a compact Month/Agenda segmented toggle (left) and an
 *   Add Event button (right, canCreate-gated) that opens the same full
 *   CalendarEventFormDialog the desktop view uses — a distinct, more
 *   capable entry point than the quick-add bar's title-only creation.
 *   Agenda mode replaces the grid + selected-day list with a single
 *   scrollable list of the month's events, grouped under date headings
 *   (groupEventsByDate) since a whole month flattened into one list
 *   without date breaks isn't scannable on a narrow screen — the quick-add
 *   bar hides in this mode since "add for this day" doesn't apply to a
 *   day-agnostic list.
 * [DEPENDS ON]: ./calendarUtils, ./calendarConfig, ./CategoryFilterBar,
 *   ./CalendarEventListItem, @/components/shared/MotionBottomSheet
 */
'use client'
import { useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
  Loader2,
  AlertCircle,
  CalendarDays,
  Search,
  X,
  ListChecks,
  LayoutGrid,
} from 'lucide-react'
import type { CalendarEvent, CalendarEventCategory } from '@shared/types/calendar'
import { CATEGORY_LEGEND, categoryColor } from './calendarConfig'
import { CategoryFilterBar } from './CategoryFilterBar'
import { CalendarEventListItem } from './CalendarEventListItem'
import { MotionBottomSheet } from '@/components/shared/MotionBottomSheet'
import type { CalendarViewMode } from './DesktopCalendarView'
import {
  WEEK_HEADERS,
  formatMonthShort,
  formatMonthYear,
  formatDisplayDate,
  formatGroupHeading,
  groupEventsByDate,
  type CalendarDayCell,
} from './calendarUtils'

interface MobileCalendarViewProps {
  monthDate: Date
  onNavigateMonth: (delta: number) => void
  onGoToToday: () => void
  selectedDateKey: string
  onSelectDate: (dateKey: string) => void
  days: CalendarDayCell[]
  /** All filtered events in the visible grid range — only needed for
   *  Agenda mode's date-grouped list; Month mode uses `days`/`selectedDayEvents`. */
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
  /** Directly creates a minimal event on the selected day (title only —
   *  category/time/location default; matches the reference's own mobile
   *  quick-add, which creates immediately rather than opening a form).
   *  Full detail can always be added afterwards via the row's Edit action,
   *  which opens the same CalendarEventFormDialog the desktop view uses. */
  onQuickAdd: (title: string, onCreated: () => void) => void
  /** True while the quick-add request is in flight (input + button lock, spinner shows). */
  quickAdding?: boolean
  /** Opens the full CalendarEventFormDialog (category/time/location) on
   *  the selected day — the sub-header's Add Event button, distinct from
   *  the quick-add bar's title-only creation. */
  onOpenCreate: (dateKey?: string) => void
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
  onQuickAdd,
  quickAdding = false,
  onOpenCreate,
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
    if (trimmed.length < 2 || quickAdding) return
    // Cleared only once the event really exists - a failed add keeps the
    // typed title so nothing is lost (the failure is toasted).
    onQuickAdd(trimmed, () => setQuickTitle(''))
  }

  return (
    <div className="md:hidden flex flex-col h-[calc(100vh-9.5rem)] min-h-[480px] overflow-hidden">
      {/* ── TOP BAR ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-base shrink-0">
        <button
          type="button"
          onClick={onGoToToday}
          aria-label="Jump to today"
          className="px-2.5 min-h-11 rounded-xl text-sm font-heading font-semibold text-tone-teal hover:bg-page transition-colors flex items-center justify-center"
        >
          Today
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onNavigateMonth(-1)}
            aria-label="Previous month"
            className="p-2 min-h-11 min-w-11 rounded-xl text-muted hover:text-body hover:bg-page transition-colors flex items-center justify-center"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </button>
          <span className="text-sm font-heading font-bold text-body px-1 min-w-[5.5rem] text-center">
            {formatMonthShort(monthDate)} {monthDate.getFullYear()}
          </span>
          <button
            type="button"
            onClick={() => onNavigateMonth(1)}
            aria-label="Next month"
            className="p-2 min-h-11 min-w-11 rounded-xl text-muted hover:text-body hover:bg-page transition-colors flex items-center justify-center"
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
            className={`p-2 min-h-11 min-w-11 rounded-xl transition-colors flex items-center justify-center ${
              searchOpen ? 'text-tone-teal bg-brand-teal/10' : 'text-muted hover:text-body hover:bg-page'
            }`}
          >
            <Search className="w-4 h-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setFilterSheetOpen(true)}
            aria-label="Filter by category"
            className="relative p-2 min-h-11 min-w-11 rounded-xl text-muted hover:text-body hover:bg-page transition-colors flex items-center justify-center"
          >
            <Filter className="w-4 h-4" aria-hidden="true" />
            {activeCount < totalCount && (
              <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-btn-brand text-btn-brand-fg text-xs font-bold flex items-center justify-center">
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
              placeholder="Search events"
              aria-label="Search events"
              className="w-full pl-9 pr-9 py-2.5 min-h-[44px] text-sm bg-page border border-base rounded-xl text-body placeholder-muted focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Clear search"
                className="absolute right-0 top-1/2 -translate-y-1/2 min-h-11 min-w-11 flex items-center justify-center text-muted hover:text-body"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="px-3 py-1.5 text-xs text-muted flex items-center gap-1.5 shrink-0">
          <span className="w-2 h-2 rounded-full bg-brand-teal animate-pulse" aria-hidden="true" />
          Loading events…
        </div>
      )}
      {isError && (
        <div role="alert" className="mx-3 mt-1.5 text-sm text-tone-coral app-tint rounded-xl px-3 py-2 shrink-0 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          Couldn&apos;t load calendar events.
        </div>
      )}

      {/* ── VIEW / CREATE SUB-HEADER ─────────────────────────────── */}
      {/* New row, kept deliberately separate from the top bar above so the
          approved nav row stays pixel-identical. */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-base shrink-0">
        <div className="flex items-center border border-base rounded-xl p-0.5">
          {(['month', 'agenda'] as CalendarViewMode[]).map((mode) => {
            const Icon = mode === 'month' ? LayoutGrid : ListChecks
            return (
              <button
                key={mode}
                type="button"
                onClick={() => onViewModeChange(mode)}
                aria-pressed={viewMode === mode}
                className={`flex items-center gap-1.5 px-3 py-1.5 min-h-11 rounded-lg text-sm font-heading font-medium capitalize transition-colors ${
                  viewMode === mode
                    ? 'bg-btn-brand text-btn-brand-fg font-semibold'
                    : 'text-muted'
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                {mode}
              </button>
            )
          })}
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={() => onOpenCreate(selectedDateKey)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 min-h-11 rounded-xl bg-btn-brand hover:bg-btn-brand-hover text-btn-brand-fg font-heading font-semibold text-sm transition-colors"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add event
          </button>
        )}
      </div>

      {viewMode === 'month' ? (
        <>
          {/* ── MONTH GRID ───────────────────────────────────────────── */}
          <div className="px-2.5 pt-2 shrink-0">
            <div className="grid grid-cols-7 mb-1">
              {WEEK_HEADERS.map((d, i) => (
                <span key={i} className="text-xs font-medium text-muted text-center py-1">
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
                        ? 'bg-btn-brand text-btn-brand-fg'
                        : cell.isToday
                          ? 'app-tint ring-2 ring-brand-teal'
                          : cell.isCurrentMonth
                            ? 'app-tint hover:bg-brand-teal/10'
                            : 'hover:bg-brand-teal/5'
                    }`}
                  >
                    <span
                      className={`text-sm font-semibold ${
                        isSelected ? 'text-btn-brand-fg' : cell.isToday ? 'text-tone-teal' : cell.isCurrentMonth ? 'text-body' : 'text-muted'
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
            <span className="text-xs font-semibold text-muted shrink-0">
              {selectedDayEvents.length} {selectedDayEvents.length === 1 ? 'event' : 'events'}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto px-3.5 pb-2 divide-y divide-base">
            {selectedDayEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-8 text-muted">
                <CalendarDays className="w-8 h-8 mb-2 opacity-60" aria-hidden="true" />
                <p className="text-sm font-medium">No events for this date</p>
                <p className="text-xs mt-1">Use the box below to add something to this day.</p>
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
              className="flex items-center gap-2 p-2.5 border-t border-base app-tint shrink-0"
            >
              <input
                type="text"
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                disabled={quickAdding}
                placeholder={`Add event on ${Number(selectedDateKey.split('-')[2])} ${formatMonthShort(monthDate)}`}
                className="flex-1 min-w-0 px-4 py-2.5 min-h-11 text-sm bg-surface border border-base rounded-xl text-body placeholder-muted focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
              />
              <button
                type="submit"
                disabled={quickAdding}
                aria-busy={quickAdding}
                aria-label={quickAdding ? 'Adding event' : 'Add event'}
                className="w-11 h-11 shrink-0 rounded-xl bg-btn-brand hover:bg-btn-brand-hover text-btn-brand-fg flex items-center justify-center transition-colors disabled:opacity-70"
              >
                {quickAdding
                  ? <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
                  : <Plus className="w-5 h-5" aria-hidden="true" />}
              </button>
            </form>
          )}
        </>
      ) : (
        /* ── AGENDA LIST ──────────────────────────────────────────── */
        <div className="flex-1 overflow-y-auto px-3.5 py-3">
          <p className="text-xs text-muted mb-2">
            {formatMonthYear(monthDate)} · {filteredEvents.length}{' '}
            {filteredEvents.length === 1 ? 'event' : 'events'}
          </p>
          {filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-12 text-muted">
              <ListChecks className="w-8 h-8 mb-2 opacity-60" aria-hidden="true" />
              <p className="text-sm font-medium">No events match</p>
              <p className="text-xs mt-1">Try a different word or choose more categories.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {groupEventsByDate(filteredEvents).map((group) => (
                <div key={group.dateKey}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectDate(group.dateKey)
                      onViewModeChange('month')
                    }}
                    className="text-sm font-heading font-bold text-tone-teal min-h-11 inline-flex items-center hover:underline"
                  >
                    {formatGroupHeading(group.dateKey)}
                  </button>
                  <div className="divide-y divide-base">
                    {group.events.map((evt) => (
                      <CalendarEventListItem
                        key={evt.id}
                        event={evt}
                        variant="row"
                        onEdit={canEdit ? onEditEvent : undefined}
                        onDelete={canDelete ? onRequestDelete : undefined}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <MotionBottomSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        title="Filter by category"
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
              className="flex-1 py-2.5 min-h-11 text-sm font-medium border border-base rounded-xl hover:bg-page"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={onClearAllCategories}
              className="flex-1 py-2.5 min-h-11 text-sm font-medium border border-base rounded-xl hover:bg-page"
            >
              Clear all
            </button>
          </div>
        </div>
      </MotionBottomSheet>
    </div>
  )
}