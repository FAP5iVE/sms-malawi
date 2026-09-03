/*
 * apps/web/src/app/(auth)/calendar/page.tsx
 *
 * [CHANGE TYPE]: TARGETED EDIT (Interactive Calendar UI adoption — full
 *   rewrite of the page body; RoleGuard wrapping and role list unchanged)
 * [R-PHASE]: R13 — Announcements, Timetable & Calendar Domain (carried
 *   forward; this edit lands on top of that phase's create/edit/delete
 *   capability rather than replacing it)
 * [PURPOSE]: Replaced the FullCalendar-based render (day-grid/time-grid/
 *   list views, dense text-in-cell month grid) with the adopted Interactive
 *   Calendar UI: a Desktop split-view (mini calendar + selected-day list
 *   sidebar, borderless month grid with stacked category-color bars
 *   instead of in-cell event text, plus an Agenda list) and a structurally
 *   different Mobile view (compact grid, filter bottom-sheet, selected-day
 *   list, floating quick-add bar). Both views are extracted to
 *   components/calendar/{Desktop,Mobile}CalendarView.tsx and mount side by
 *   side here (`hidden md:flex` / `md:hidden`), matching this app's own
 *   established CSS-controlled-visibility responsive pattern rather than
 *   introducing a JS-conditional mount — see app/(auth)/layout.tsx's
 *   sidebar/bottom-nav split for the precedent. This page is now a thin
 *   orchestration layer: it owns the displayed month, selected date, view
 *   mode, category filters, search query, and the create/edit/delete
 *   dialogs, and hands fully-derived props down to both views so neither
 *   duplicates the other's data logic.
 *
 *   CreateEventDialog and EventDetailPanel (previously inlined here) are
 *   both retired — superseded by components/calendar/
 *   CalendarEventFormDialog.tsx (create AND edit, one component, presented
 *   as a centered modal on desktop or a MotionBottomSheet on mobile) and
 *   by folding read-only event detail directly into
 *   CalendarEventListItem.tsx's card, matching how the adopted reference
 *   itself has no separate detail popup — a list card already shows time,
 *   category, description and location, with inline Edit/Delete actions
 *   gated to manually-created events. Deleting now goes through the
 *   shared ConfirmDialog (this codebase's standard destructive-action
 *   pattern) instead of the old panel's plain inline button — no other
 *   calendar page in this system deletes without that confirmation step,
 *   and this one shouldn't be the exception.
 * [DEPENDS ON]: apps/web/src/hooks/useCalendarEvents.ts,
 *   apps/web/src/hooks/usePermissions.ts, apps/web/src/hooks/use-mobile.ts,
 *   apps/web/src/hooks/usePublic.ts (usePublicSchoolInfo — Academic Year
 *   label, replacing the reference's hardcoded "2025/2026"),
 *   apps/web/src/components/shared/RoleGuard.tsx,
 *   apps/web/src/components/shared/ConfirmDialog.tsx,
 *   apps/web/src/components/calendar/* (new, this change),
 *   @shared/types/calendar, date-fns
 *
 * [CHANGE TYPE]: TARGETED EDIT (feedback round)
 * [PURPOSE]: `viewMode` (month/agenda) and `filteredEvents` — previously
 *   only threaded to DesktopCalendarView — now also go to
 *   MobileCalendarView, which grew its own Month/Agenda toggle and a
 *   dedicated Add Event entry point (see MobileCalendarView.tsx's own
 *   header comment). `openCreate` is now passed to both views instead of
 *   just Desktop's. No new state was added here — the same single
 *   viewMode/filteredEvents values just now drive both mounted views
 *   instead of one, keeping desktop and mobile in sync if the viewport
 *   crosses the md breakpoint mid-session.
 */
'use client'
import { useCallback, useMemo, useState } from 'react'
import { addMonths, subMonths } from 'date-fns'
import { RoleGuard } from '@/components/shared/RoleGuard'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  useCalendarEvents,
  useCreateCalendarEvent,
  useDeleteCalendarEvent,
} from '@/hooks/useCalendarEvents'
import { usePermissions } from '@/hooks/usePermissions'
import { usePublicSchoolInfo } from '@/hooks/usePublic'
import type { CalendarEvent, CalendarEventCategory } from '@shared/types/calendar'
import { DesktopCalendarView } from '@/components/calendar/DesktopCalendarView'
import type { CalendarViewMode } from '@/components/calendar/DesktopCalendarView'
import { MobileCalendarView } from '@/components/calendar/MobileCalendarView'
import { CalendarEventFormDialog } from '@/components/calendar/CalendarEventFormDialog'
import {
  ALL_CATEGORIES,
  DEFAULT_EVENT_CATEGORY,
  manualEventDbId,
} from '@/components/calendar/calendarConfig'
import {
  buildMonthGrid,
  getEventsForDate,
  getMonthGridRange,
  toDateKey,
} from '@/components/calendar/calendarUtils'

// ─── CALENDAR CONTENT ────────────────────────────────────────────────────────

function CalendarContent() {
  const isMobile = useIsMobile()
  const { can } = usePermissions()
  const { data: schoolInfo } = usePublicSchoolInfo()

  const [monthDate, setMonthDate] = useState(() => new Date())
  const [selectedDateKey, setSelectedDateKey] = useState(() => toDateKey(new Date()))
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategories, setActiveCategories] = useState<Set<CalendarEventCategory>>(
    new Set(ALL_CATEGORIES)
  )

  const [formOpen, setFormOpen] = useState(false)
  const [formInitialDateKey, setFormInitialDateKey] = useState(selectedDateKey)
  const [editTarget, setEditTarget] = useState<CalendarEvent | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null)

  const canCreate = can('calendar.createEvent')
  const canEdit = can('calendar.editEvent')
  const canDelete = can('calendar.deleteEvent')

  const gridRange = useMemo(() => getMonthGridRange(monthDate), [monthDate])
  const {
    data: serverEvents = [],
    isLoading,
    isError,
  } = useCalendarEvents(gridRange.start, gridRange.end)

  const createEvent = useCreateCalendarEvent()
  const deleteEvent = useDeleteCalendarEvent()

  // ── Filtering (category chips + search box) — one pipeline feeds the
  //    mini calendar, the main grid, the Agenda list, and both selected-day
  //    lists, so every surface always agrees on what's currently visible.
  const filteredEvents = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return serverEvents.filter((e) => {
      if (!activeCategories.has(e.category)) return false
      if (!query) return true
      const haystack = [
        e.title,
        e.meta?.description ? String(e.meta.description) : '',
        e.meta?.venue ? String(e.meta.venue) : '',
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [serverEvents, activeCategories, searchQuery])

  const days = useMemo(() => buildMonthGrid(monthDate, filteredEvents), [monthDate, filteredEvents])
  const selectedDayEvents = useMemo(
    () => getEventsForDate(filteredEvents, selectedDateKey),
    [filteredEvents, selectedDateKey]
  )

  // ── Navigation ──────────────────────────────────────────────────────────
  const navigateMonth = useCallback((delta: number) => {
    setMonthDate((prev) => (delta < 0 ? subMonths(prev, 1) : addMonths(prev, 1)))
  }, [])

  const goToToday = useCallback(() => {
    const now = new Date()
    setMonthDate(now)
    setSelectedDateKey(toDateKey(now))
  }, [])

  const selectDate = useCallback(
    (dateKey: string) => {
      setSelectedDateKey(dateKey)
      // Clicking a spillover day (from the previous/next month) navigates
      // the grid to that month, matching how every mainstream calendar
      // handles tapping a greyed-out edge date.
      const clicked = new Date(`${dateKey}T00:00:00`)
      if (clicked.getMonth() !== monthDate.getMonth() || clicked.getFullYear() !== monthDate.getFullYear()) {
        setMonthDate(clicked)
      }
    },
    [monthDate]
  )

  // ── Category filters ────────────────────────────────────────────────────
  const toggleCategory = useCallback((cat: CalendarEventCategory) => {
    setActiveCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }, [])
  const selectAllCategories = useCallback(() => setActiveCategories(new Set(ALL_CATEGORIES)), [])
  const clearAllCategories = useCallback(() => setActiveCategories(new Set()), [])

  // ── Create / edit / delete ──────────────────────────────────────────────
  const openCreate = useCallback(
    (dateKey?: string) => {
      setFormInitialDateKey(dateKey ?? selectedDateKey)
      setEditTarget(null)
      setFormOpen(true)
    },
    [selectedDateKey]
  )

  const openEdit = useCallback((event: CalendarEvent) => {
    setEditTarget(event)
    setFormOpen(true)
  }, [])

  const closeForm = useCallback(() => {
    setFormOpen(false)
    setEditTarget(null)
  }, [])

  const requestDelete = useCallback((event: CalendarEvent) => setDeleteTarget(event), [])

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return
    deleteEvent.mutate(manualEventDbId(deleteTarget.id), {
      onSuccess: () => setDeleteTarget(null),
    })
  }, [deleteTarget, deleteEvent])

  // Mobile quick-add — creates immediately with sensible defaults; full
  // detail (category/time/location) can always be added afterwards via
  // the row's Edit action, which opens this same CalendarEventFormDialog.
  const quickAdd = useCallback(
    (title: string) => {
      createEvent.mutate({
        title,
        category: DEFAULT_EVENT_CATEGORY,
        startDate: new Date(`${selectedDateKey}T09:00`).toISOString(),
      })
    },
    [createEvent, selectedDateKey]
  )

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div>
        <h1 className="font-heading text-2xl font-bold text-brand-navy">Calendar</h1>
        <p className="text-sm text-muted mt-0.5">
          School academic calendar — all events, exams, and schedules
        </p>
      </div>

      <DesktopCalendarView
        monthDate={monthDate}
        onNavigateMonth={navigateMonth}
        onGoToToday={goToToday}
        selectedDateKey={selectedDateKey}
        onSelectDate={selectDate}
        days={days}
        filteredEvents={filteredEvents}
        selectedDayEvents={selectedDayEvents}
        activeCategories={activeCategories}
        onToggleCategory={toggleCategory}
        onSelectAllCategories={selectAllCategories}
        onClearAllCategories={clearAllCategories}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
        onOpenCreate={openCreate}
        onEditEvent={openEdit}
        onRequestDelete={requestDelete}
        isLoading={isLoading}
        isError={isError}
        academicYearLabel={schoolInfo?.currentYear}
      />

      <MobileCalendarView
        monthDate={monthDate}
        onNavigateMonth={navigateMonth}
        onGoToToday={goToToday}
        selectedDateKey={selectedDateKey}
        onSelectDate={selectDate}
        days={days}
        filteredEvents={filteredEvents}
        selectedDayEvents={selectedDayEvents}
        activeCategories={activeCategories}
        onToggleCategory={toggleCategory}
        onSelectAllCategories={selectAllCategories}
        onClearAllCategories={clearAllCategories}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
        onQuickAdd={quickAdd}
        onOpenCreate={openCreate}
        onEditEvent={openEdit}
        onRequestDelete={requestDelete}
        isLoading={isLoading}
        isError={isError}
      />

      <CalendarEventFormDialog
        open={formOpen}
        onClose={closeForm}
        initialDateKey={formInitialDateKey}
        editEvent={editTarget}
        presentation={isMobile ? 'sheet' : 'modal'}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this event?"
        description={
          deleteTarget
            ? `"${deleteTarget.title}" will be permanently removed from the calendar. This can't be undone.`
            : ''
        }
        confirmLabel="Delete Event"
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  return (
    <RoleGuard
      allowed={[
        'admin',
        'high_rank',
        'finance',
        'library',
        'lower_rank',
        'academic',
        'hr',
        'exam_officer',
        'student',
      ]}
    >
      <CalendarContent />
    </RoleGuard>
  )
}