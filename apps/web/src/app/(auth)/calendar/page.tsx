/*
 * apps/web/src/app/(auth)/calendar/page.tsx
 *
 * [CHANGE TYPE]: TARGETED EDIT (adds a create/edit/delete dialog for the
 *   new calendar-event capability; the FullCalendar rendering and
 *   category-filter layout are otherwise unaffected)
 * [R-PHASE]: R13 — Announcements, Timetable & Calendar Domain
 * [PURPOSE]:
 *   1. Added a create/edit/delete dialog for the new CalendarEvent
 *      capability (calendar.ts's new POST/PATCH/DELETE /events routes,
 *      same phase) — "Add Event" is gated by calendar.createEvent (7
 *      roles); editing/deleting an existing manually-created event
 *      (identified by its `calevent-` id prefix, the marker
 *      calendar.ts's source 10 assigns) is gated by calendar.editEvent/
 *      deleteEvent from inside the EventDetailPanel.
 *   2. useCalendarEvents' isLoading-only handling is joined by a real
 *      isError branch — previously fetchCalendarEvents swallowed every
 *      fetch failure into an empty array, so a genuine error and a real
 *      empty result set were indistinguishable (fixed in
 *      useCalendarEvents.ts, same phase; this page now reads and
 *      surfaces the isError/error state that fix makes real).
 *   3. Added aria-label to the EventDetailPanel close button and
 *      aria-pressed to CategoryChip filter buttons — bundled here per
 *      this phase's roadmap entry since the file is already open for the
 *      dialog work above, rather than reopening it a second time for
 *      R19 (accessibility completion).
 * [DEPENDS ON]: apps/web/src/hooks/useCalendarEvents.ts (isError fix +
 *   new mutations, same phase), apps/web/src/hooks/usePermissions.ts,
 *   @shared/schemas/calendarEvent (CreateCalendarEventSchema — same phase)
 */
'use client'
import { useCallback, useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import type { EventClickArg, DatesSetArg } from '@fullcalendar/core'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import { AnimatePresence, motion } from 'framer-motion'
import { X, Calendar, Clock, MapPin, Tag, PlusCircle, Trash2, Loader2 } from 'lucide-react'
import { RoleGuard } from '@/components/shared/RoleGuard'
import {
  useCalendarEvents,
  useCreateCalendarEvent,
  useDeleteCalendarEvent,
} from '@/hooks/useCalendarEvents'
import { usePermissions } from '@/hooks/usePermissions'
import { useMotionEnabled } from '@/store/motionStore'
import {
  FADE_DOWN_VARIANTS,
  reducedMotionVariants,
  reducedMotionTransition,
  SPRING,
} from '@/lib/motion'
import { CALENDAR_COLORS } from '@shared/types/calendar'
import type { CalendarEvent, CalendarEventCategory } from '@shared/types/calendar'
import { CreateCalendarEventSchema } from '@shared/schemas/calendarEvent'
import { format } from 'date-fns'

// ─── CATEGORY LEGEND ─────────────────────────────────────────────────────────

const LEGEND_ITEMS: { category: CalendarEventCategory; label: string }[] = [
  { category: 'term', label: 'Term Dates' },
  { category: 'holiday', label: 'Public Holidays' },
  { category: 'exam', label: 'Exams' },
  { category: 'timetable', label: 'Timetable' },
  { category: 'lab_booking', label: 'Lab Bookings' },
  { category: 'leave', label: 'Leave' },
  { category: 'announcement', label: 'Events' },
  { category: 'assignment', label: 'Assignments' },
]

// ─── CATEGORY FILTER CHIP ─────────────────────────────────────────────────────

function CategoryChip({
  category,
  label,
  active,
  onToggle,
}: {
  category: CalendarEventCategory
  label: string
  active: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={active}
      className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium transition-all border ${
        active ? 'border-transparent text-white' : 'border-base text-muted bg-surface hover:bg-page'
      }`}
      style={active ? { backgroundColor: CALENDAR_COLORS[category] } : {}}
    >
      <span
        className="w-2 h-2 rounded-full shrink-0"
        aria-hidden="true"
        style={{ backgroundColor: active ? 'rgba(255,255,255,0.7)' : CALENDAR_COLORS[category] }}
      />
      {label}
    </button>
  )
}

// ─── CREATE EVENT DIALOG ──────────────────────────────────────────────────────

function CreateEventDialog({ onClose }: { onClose: () => void }) {
  const createEvent = useCreateCalendarEvent()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [category, setCategory] = useState<CalendarEventCategory>('term')
  const [fieldError, setFieldError] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFieldError(null)

    // Start/End are now collected as separate date + time inputs (see
    // render below) rather than a single native <input type="datetime-local">
    // — recombined here into the same "YYYY-MM-DDTHH:mm" shape that control
    // used to produce, so the existing new Date(...).toISOString() /
    // CreateCalendarEventSchema validation below needs no other changes.
    // Time defaults to midnight when left blank (an all-day-style event).
    const startDateTime = startDate ? `${startDate}T${startTime || '00:00'}` : ''
    const endDateTime = endDate ? `${endDate}T${endTime || '00:00'}` : ''

    const parsed = CreateCalendarEventSchema.safeParse({
      title,
      description: description || undefined,
      startDate: startDateTime ? new Date(startDateTime).toISOString() : '',
      endDate: endDateTime ? new Date(endDateTime).toISOString() : undefined,
      category,
    })
    if (!parsed.success) {
      setFieldError(parsed.error.errors[0]?.message ?? 'Please check the form for errors.')
      return
    }
    createEvent.mutate(parsed.data, { onSuccess: onClose })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      {/* [UX-003] Had no height cap and no scroll — on a shorter viewport
          the footer buttons (Cancel/Create) could be pushed off-screen
          with no way to reach them. Capped height + scrollable body;
          header is sticky so the close button stays reachable no matter
          how far you've scrolled — matches AnnouncementForm.tsx's own
          established fix for the identical defect. */}
      <div className="bg-surface rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-surface flex items-center justify-between px-6 py-4 border-b border-base">
          <h2 className="font-heading font-bold text-brand-navy">New Calendar Event</h2>
          <button
            onClick={onClose}
            aria-label="Close event form"
            className="p-1.5 hover:bg-page rounded-lg"
          >
            <X className="w-4 h-4 text-muted" aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="event-title" className="text-xs font-medium text-muted mb-1 block">
              Title
            </label>
            <input
              id="event-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full border border-base rounded-xl px-4 py-2.5 text-sm bg-page min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
            />
          </div>
          <div>
            <label
              htmlFor="event-description"
              className="text-xs font-medium text-muted mb-1 block"
            >
              Description
            </label>
            <textarea
              id="event-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full border border-base rounded-xl px-4 py-2.5 text-sm bg-page resize-none min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
            />
          </div>
          {/* Schedule — visually distinct panel so start/end read as a
              connected time range rather than two generic form fields.
              Date and time are separate native inputs per side (rather than
              one cramped <input type="datetime-local">), each labelled with
              an icon so the field's purpose is legible at a glance. */}
          <div className="rounded-xl border border-base bg-page p-4 space-y-3">
            <p className="text-xs font-heading font-semibold text-muted uppercase tracking-wider">
              Schedule
            </p>

            <div className="flex gap-3 items-start">
              <div className="flex flex-col items-center pt-2.5 shrink-0 w-5">
                <span className="w-2 h-2 rounded-full bg-brand-teal" />
                <span className="w-px flex-1 min-h-[28px] bg-base my-1" />
                <span className="w-2 h-2 rounded-full border-2 border-muted" />
              </div>

              <div className="flex-1 space-y-3">
                <div>
                  <label htmlFor="event-start-date" className="text-xs font-medium text-muted mb-1 block">
                    Start
                  </label>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <div className="relative">
                      <Calendar className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                      <input
                        id="event-start-date"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        required
                        className="w-full border border-base rounded-xl pl-9 pr-3 py-2.5 text-sm bg-surface min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
                      />
                    </div>
                    <div className="relative">
                      <Clock className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                      <input
                        aria-label="Start time"
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-32 border border-base rounded-xl pl-9 pr-3 py-2.5 text-sm bg-surface min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="event-end-date" className="text-xs font-medium text-muted mb-1 block">
                    End <span className="text-muted/70 font-normal">(optional)</span>
                  </label>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <div className="relative">
                      <Calendar className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                      <input
                        id="event-end-date"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        min={startDate || undefined}
                        className="w-full border border-base rounded-xl pl-9 pr-3 py-2.5 text-sm bg-surface min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
                      />
                    </div>
                    <div className="relative">
                      <Clock className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                      <input
                        aria-label="End time"
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-32 border border-base rounded-xl pl-9 pr-3 py-2.5 text-sm bg-surface min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div>
            <label htmlFor="event-category" className="text-xs font-medium text-muted mb-1 block">
              Category
            </label>
            <select
              id="event-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as CalendarEventCategory)}
              className="w-full border border-base rounded-xl px-4 py-2.5 text-sm bg-page min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
            >
              {LEGEND_ITEMS.map((l) => (
                <option key={l.category} value={l.category}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          {(fieldError || createEvent.isError) && (
            <p role="alert" className="text-xs text-brand-coral">
              {fieldError ?? 'Failed to create event. Please try again.'}
            </p>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 text-sm border border-base rounded-xl hover:bg-page min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createEvent.isPending}
              className="px-5 py-2 text-sm bg-brand-navy text-white rounded-xl font-semibold flex items-center gap-2 disabled:opacity-60 min-h-[44px]"
            >
              {createEvent.isPending && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              )}
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── EVENT DETAIL PANEL ──────────────────────────────────────────────────────

const MANUAL_EVENT_PREFIX = 'calevent-'

function EventDetailPanel({
  event,
  onClose,
}: {
  event: CalendarEvent | null
  onClose: () => void
}) {
  const motionEnabled = useMotionEnabled()
  const { can } = usePermissions()
  const deleteEvent = useDeleteCalendarEvent()

  const isManualEvent = !!event?.id.startsWith(MANUAL_EVENT_PREFIX)
  const canDelete = isManualEvent && can('calendar.deleteEvent')

  function handleDelete() {
    if (!event) return
    const id = event.id.slice(MANUAL_EVENT_PREFIX.length)
    deleteEvent.mutate(id, { onSuccess: onClose })
  }

  return (
    <AnimatePresence>
      {event && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/20 z-40"
            onPointerDown={onClose}
          />
          <motion.div
            key="panel"
            variants={reducedMotionVariants(motionEnabled, FADE_DOWN_VARIANTS)}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={reducedMotionTransition(motionEnabled, SPRING.snappy)}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm bg-surface border border-base rounded-2xl shadow-xl p-5"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full shrink-0 mt-0.5"
                  aria-hidden="true"
                  style={{ backgroundColor: event.color }}
                />
                <span className="text-xs font-medium uppercase tracking-wide text-muted capitalize">
                  {event.category.replace('_', ' ')}
                </span>
              </div>
              <button
                onClick={onClose}
                aria-label="Close event details"
                className="text-muted hover:text-brand-navy transition-colors"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <h2 className="font-heading font-bold text-brand-navy text-base mb-3">{event.title}</h2>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted">
                <Calendar className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>
                  {format(new Date(event.start), 'EEEE, d MMMM yyyy')}
                  {event.end && ` → ${format(new Date(event.end), 'd MMMM yyyy')}`}
                </span>
              </div>
              {!event.allDay && (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>
                    {event.start.includes('T') ? event.start.split('T')[1]?.slice(0, 5) : '—'}
                    {event.end?.includes('T') ? ` – ${event.end.split('T')[1]?.slice(0, 5)}` : ''}
                  </span>
                </div>
              )}
              {event.meta?.venue && (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <MapPin className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{String(event.meta.venue)}</span>
                </div>
              )}
              {event.meta?.purpose && (
                <div className="flex items-center gap-2 text-sm text-muted">
                  <Tag className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{String(event.meta.purpose)}</span>
                </div>
              )}
              {event.meta?.description && (
                <p className="text-sm text-muted leading-relaxed">
                  {String(event.meta.description)}
                </p>
              )}
            </div>

            {canDelete && (
              <div className="mt-4 pt-4 border-t border-base">
                <button
                  onClick={handleDelete}
                  disabled={deleteEvent.isPending}
                  className="flex items-center gap-1.5 text-xs text-brand-coral hover:underline disabled:opacity-60 min-h-[44px]"
                >
                  {deleteEvent.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  Delete event
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// ─── CALENDAR CONTENT ────────────────────────────────────────────────────────

function CalendarContent() {
  const calRef = useRef<InstanceType<typeof FullCalendar>>(null)
  const [dateRange, setDateRange] = useState({ start: '2025-09-01', end: '2026-07-31' })
  const [selected, setSelected] = useState<CalendarEvent | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const { can } = usePermissions()
  const [activeCategories, setActiveCategories] = useState<Set<CalendarEventCategory>>(
    new Set(LEGEND_ITEMS.map((l) => l.category))
  )

  const {
    data: serverEvents = [],
    isLoading,
    isError,
  } = useCalendarEvents(dateRange.start, dateRange.end)

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setDateRange({
      start: format(arg.start, 'yyyy-MM-dd'),
      end: format(arg.end, 'yyyy-MM-dd'),
    })
  }, [])

  const filteredEvents = useMemo(
    () => serverEvents.filter((e) => activeCategories.has(e.category)),
    [serverEvents, activeCategories]
  )

  const handleEventClick = useCallback(
    (arg: EventClickArg) => {
      const ev = serverEvents.find((e) => e.id === arg.event.id) ?? null
      setSelected(ev)
    },
    [serverEvents]
  )

  function toggleCategory(cat: CalendarEventCategory) {
    setActiveCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold text-brand-navy">Calendar</h1>
          <p className="text-sm text-muted mt-0.5">
            School academic calendar — all events, exams, and schedules
          </p>
        </div>
        {can('calendar.createEvent') && (
          <button
            onClick={() => setShowCreateDialog(true)}
            className="shrink-0 flex items-center gap-2 bg-brand-teal text-white px-4 py-2 rounded-xl text-sm font-heading font-semibold hover:bg-brand-teal-light transition-colors min-h-[44px]"
          >
            <PlusCircle className="w-4 h-4" aria-hidden="true" /> Add Event
          </button>
        )}
      </div>

      {/* ── Category Filter Chips ── */}
      <div className="flex flex-wrap gap-2">
        {LEGEND_ITEMS.map((item) => (
          <CategoryChip
            key={item.category}
            category={item.category}
            label={item.label}
            active={activeCategories.has(item.category)}
            onToggle={() => toggleCategory(item.category)}
          />
        ))}
      </div>

      {/* ── Loading / error state ── */}
      {isLoading && (
        <div className="text-xs text-muted flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-brand-teal animate-pulse" aria-hidden="true" />
          Loading events…
        </div>
      )}
      {isError && (
        <div
          role="alert"
          className="text-xs text-brand-coral bg-red-50 border border-red-200 rounded-lg px-3 py-2"
        >
          Couldn&apos;t load calendar events. Please try again.
        </div>
      )}

      {/* ── FullCalendar ── */}
      <div className="bg-surface border border-base rounded-2xl overflow-hidden">
        <div className="p-1 sm:p-4 [&_.fc-toolbar-title]:font-heading [&_.fc-toolbar-title]:text-brand-navy [&_.fc-toolbar-title]:font-bold [&_.fc-button]:bg-brand-navy [&_.fc-button]:border-brand-navy [&_.fc-button:hover]:bg-brand-navy/80 [&_.fc-button-active]:bg-brand-teal [&_.fc-button-active]:border-brand-teal [&_.fc-today-button]:bg-brand-teal [&_.fc-today-button]:border-brand-teal [&_.fc-event]:rounded-md [&_.fc-event]:text-xs [&_.fc-daygrid-day-number]:text-brand-navy [&_.fc-col-header-cell-cushion]:font-heading [&_.fc-col-header-cell-cushion]:text-brand-navy [&_.fc-daygrid-day.fc-day-today]:bg-brand-teal/5">
          <FullCalendar
            ref={calRef}
            plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
            }}
            events={filteredEvents}
            datesSet={handleDatesSet}
            eventClick={handleEventClick}
            height="auto"
            eventDisplay="block"
            dayMaxEvents={3}
            nowIndicator
            weekends
            firstDay={1}
            buttonText={{
              today: 'Today',
              month: 'Month',
              week: 'Week',
              day: 'Day',
              list: 'Agenda',
            }}
            eventTimeFormat={{
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            }}
            views={{
              timeGridWeek: {
                slotMinTime: '07:00:00',
                slotMaxTime: '18:00:00',
                slotDuration: '00:30:00',
              },
              timeGridDay: {
                slotMinTime: '07:00:00',
                slotMaxTime: '18:00:00',
                slotDuration: '00:30:00',
              },
            }}
          />
        </div>
      </div>

      {/* ── Event Detail Panel ── */}
      <EventDetailPanel event={selected} onClose={() => setSelected(null)} />

      {/* ── Create Event Dialog ── */}
      {showCreateDialog && <CreateEventDialog onClose={() => setShowCreateDialog(false)} />}
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