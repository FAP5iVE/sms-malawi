/*
 * apps/web/src/components/calendar/CalendarEventFormDialog.tsx
 *
 * [CHANGE TYPE]: NEW FILE (replaces calendar/page.tsx's inline
 *   CreateEventDialog function)
 * [PURPOSE]: Interactive Calendar UI adoption — one create/edit form for
 *   manually-created calendar events, matching the reference's
 *   EventModal.tsx feature set (title, category picker with color swatches,
 *   start/end date+time, all-day toggle, location, description) but wired
 *   to this codebase's real CreateCalendarEventSchema/UpdateCalendarEventSchema
 *   and useCreateCalendarEvent/useUpdateCalendarEvent mutations instead of
 *   the reference's local-state-only mock save. Renders as a centered modal
 *   on desktop and a MotionBottomSheet on mobile via the `presentation`
 *   prop — same component, two shells, so the field logic/validation can't
 *   drift between platforms the way two separate forms would.
 *
 *   The "All-Day Event" checkbox is a pure UI convenience (the schema has
 *   no isAllDay flag): checking it just hides the time inputs and submits
 *   00:00 for both, matching how a blank time already behaved in the
 *   previous CreateEventDialog.
 * [DEPENDS ON]: @/hooks/useCalendarEvents (useCreateCalendarEvent,
 *   useUpdateCalendarEvent), @shared/schemas/calendarEvent
 *   (CreateCalendarEventSchema — reused for both create and edit
 *   client-side validation since edit always submits a full replacement),
 *   ./calendarConfig (CATEGORY_LEGEND, manualEventDbId),
 *   @/components/shared/MotionBottomSheet
 */
'use client'
import { useEffect, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Calendar as CalendarIcon, Clock, MapPin, AlignLeft, Loader2, X } from 'lucide-react'
import { MotionBottomSheet } from '@/components/shared/MotionBottomSheet'
import {
  useCreateCalendarEvent,
  useUpdateCalendarEvent,
} from '@/hooks/useCalendarEvents'
import { CreateCalendarEventSchema } from '@shared/schemas/calendarEvent'
import { CALENDAR_COLORS } from '@shared/types/calendar'
import type { CalendarEvent, CalendarEventCategory } from '@shared/types/calendar'
import { CATEGORY_LEGEND, DEFAULT_EVENT_CATEGORY, manualEventDbId } from './calendarConfig'

interface CalendarEventFormDialogProps {
  open: boolean
  onClose: () => void
  /** Date (yyyy-MM-dd) a brand-new event should default to. Ignored in edit mode. */
  initialDateKey: string
  /** Present to edit an existing manually-created event, absent to create a new one. */
  editEvent?: CalendarEvent | null
  /** 'modal' (desktop, centered overlay) or 'sheet' (mobile, MotionBottomSheet). */
  presentation?: 'modal' | 'sheet'
}

function isAllDayIso(iso: string): boolean {
  return !iso.includes('T') || iso.endsWith('T00:00:00.000Z') || /T00:00(:00)?$/.test(iso)
}

export function CalendarEventFormDialog({
  open,
  onClose,
  initialDateKey,
  editEvent,
  presentation = 'modal',
}: CalendarEventFormDialogProps) {
  const createEvent = useCreateCalendarEvent()
  const updateEvent = useUpdateCalendarEvent()
  const isEditing = !!editEvent
  const pending = createEvent.isPending || updateEvent.isPending

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [category, setCategory] = useState<CalendarEventCategory>(DEFAULT_EVENT_CATEGORY)
  const [startDate, setStartDate] = useState(initialDateKey)
  const [startTime, setStartTime] = useState('09:00')
  const [endDate, setEndDate] = useState(initialDateKey)
  const [endTime, setEndTime] = useState('10:00')
  const [allDay, setAllDay] = useState(false)
  const [fieldError, setFieldError] = useState<string | null>(null)

  // Reset/populate fields whenever the dialog opens for a new create vs. an edit target
  useEffect(() => {
    if (!open) return
    setFieldError(null)
    if (editEvent) {
      setTitle(editEvent.title)
      setDescription(editEvent.meta?.description ? String(editEvent.meta.description) : '')
      setLocation(editEvent.meta?.venue ? String(editEvent.meta.venue) : '')
      setCategory(editEvent.category)

      const startIso = editEvent.start
      const startAllDay = isAllDayIso(startIso)
      const startD = parseISO(startIso)
      setStartDate(format(startD, 'yyyy-MM-dd'))
      setStartTime(startAllDay ? '09:00' : format(startD, 'HH:mm'))

      if (editEvent.end) {
        const endD = parseISO(editEvent.end)
        setEndDate(format(endD, 'yyyy-MM-dd'))
        setEndTime(isAllDayIso(editEvent.end) ? '10:00' : format(endD, 'HH:mm'))
      } else {
        setEndDate(format(startD, 'yyyy-MM-dd'))
        setEndTime('10:00')
      }
      setAllDay(!!editEvent.allDay && startAllDay)
    } else {
      setTitle('')
      setDescription('')
      setLocation('')
      setCategory(DEFAULT_EVENT_CATEGORY)
      setStartDate(initialDateKey)
      setStartTime('09:00')
      setEndDate(initialDateKey)
      setEndTime('10:00')
      setAllDay(false)
    }
  }, [open, editEvent, initialDateKey])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFieldError(null)

    const startDateTime = startDate ? `${startDate}T${allDay ? '00:00' : startTime || '00:00'}` : ''
    const endDateTime = endDate ? `${endDate}T${allDay ? '00:00' : endTime || '00:00'}` : ''

    const parsed = CreateCalendarEventSchema.safeParse({
      title,
      description: description || undefined,
      location: location || undefined,
      startDate: startDateTime ? new Date(startDateTime).toISOString() : '',
      endDate: endDateTime ? new Date(endDateTime).toISOString() : undefined,
      category,
    })
    if (!parsed.success) {
      setFieldError(parsed.error.errors[0]?.message ?? 'Please check the form for errors.')
      return
    }

    if (isEditing && editEvent) {
      updateEvent.mutate(
        { id: manualEventDbId(editEvent.id), input: parsed.data },
        { onSuccess: onClose }
      )
    } else {
      createEvent.mutate(parsed.data, { onSuccess: onClose })
    }
  }

  const mutationError = createEvent.isError || updateEvent.isError

  const formBody = (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="cal-event-title" className="text-xs font-medium text-muted mb-1 block">
          Event Title
        </label>
        <input
          id="cal-event-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="e.g. Mid-Term Exam, Faculty Review, Lab Practical"
          className="w-full border border-base rounded-xl px-4 py-2.5 text-sm bg-page min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
        />
      </div>

      <div>
        <span className="text-xs font-medium text-muted mb-2 block">Category</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CATEGORY_LEGEND.map(({ category: cat, label }) => {
            const active = category === cat
            const color = CALENDAR_COLORS[cat]
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                aria-pressed={active}
                className="px-2.5 py-2 min-h-[44px] rounded-xl text-xs font-medium border flex items-center gap-2 text-left transition-colors"
                style={
                  active
                    ? { backgroundColor: `${color}18`, borderColor: color, color }
                    : undefined
                }
              >
                <span
                  className={
                    active
                      ? 'w-2.5 h-2.5 rounded-full shrink-0'
                      : 'w-2.5 h-2.5 rounded-full shrink-0 border border-base'
                  }
                  style={{ backgroundColor: color }}
                />
                <span className="truncate">{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="rounded-xl border border-base bg-page p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-heading font-semibold text-muted uppercase tracking-wider">
            Schedule
          </p>
          <label className="flex items-center gap-2 text-xs font-medium text-body cursor-pointer">
            <input
              type="checkbox"
              checked={allDay}
              onChange={(e) => setAllDay(e.target.checked)}
              className="w-4 h-4 rounded accent-brand-teal"
            />
            All-day
          </label>
        </div>

        <div className="flex gap-3 items-start">
          <div className="flex flex-col items-center pt-2.5 shrink-0 w-5">
            <span className="w-2 h-2 rounded-full bg-brand-teal" aria-hidden="true" />
            <span className="w-px flex-1 min-h-[28px] bg-base my-1" aria-hidden="true" />
            <span className="w-2 h-2 rounded-full border-2 border-muted" aria-hidden="true" />
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <label htmlFor="cal-event-start-date" className="text-xs font-medium text-muted mb-1 block">
                Start
              </label>
              <div className={allDay ? '' : 'grid grid-cols-[1fr_auto] gap-2'}>
                <div className="relative">
                  <CalendarIcon className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                  <input
                    id="cal-event-start-date"
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value)
                      if (endDate < e.target.value) setEndDate(e.target.value)
                    }}
                    required
                    className="w-full border border-base rounded-xl pl-9 pr-3 py-2.5 text-sm bg-surface min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
                  />
                </div>
                {!allDay && (
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
                )}
              </div>
            </div>

            <div>
              <label htmlFor="cal-event-end-date" className="text-xs font-medium text-muted mb-1 block">
                End <span className="text-muted/70 font-normal">(optional)</span>
              </label>
              <div className={allDay ? '' : 'grid grid-cols-[1fr_auto] gap-2'}>
                <div className="relative">
                  <CalendarIcon className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                  <input
                    id="cal-event-end-date"
                    type="date"
                    value={endDate}
                    min={startDate || undefined}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full border border-base rounded-xl pl-9 pr-3 py-2.5 text-sm bg-surface min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
                  />
                </div>
                {!allDay && (
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
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="cal-event-location" className="text-xs font-medium text-muted mb-1 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5" aria-hidden="true" /> Location / Room
        </label>
        <input
          id="cal-event-location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. Science Complex Lab 4, Main Auditorium, Room 204"
          className="w-full border border-base rounded-xl px-4 py-2.5 text-sm bg-page min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
        />
      </div>

      <div>
        <label htmlFor="cal-event-description" className="text-xs font-medium text-muted mb-1 flex items-center gap-1.5">
          <AlignLeft className="w-3.5 h-3.5" aria-hidden="true" /> Description / Notes
        </label>
        <textarea
          id="cal-event-description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add additional details, agenda or requirements..."
          className="w-full border border-base rounded-xl px-4 py-2.5 text-sm bg-page resize-none min-h-[44px] focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
        />
      </div>

      {(fieldError || mutationError) && (
        <p role="alert" className="text-xs text-brand-coral">
          {fieldError ?? `Failed to ${isEditing ? 'update' : 'create'} event. Please try again.`}
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
          disabled={pending}
          className="px-5 py-2 text-sm bg-brand-navy text-white rounded-xl font-heading font-semibold flex items-center gap-2 disabled:opacity-60 min-h-[44px]"
        >
          {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
          {isEditing ? 'Save Changes' : 'Create Event'}
        </button>
      </div>
    </form>
  )

  if (presentation === 'sheet') {
    // MotionBottomSheet stays mounted regardless of `open` — it drives its
    // own AnimatePresence-based enter/exit animation from that prop
    // internally (see its own usage docs); unmounting it here whenever
    // open is false would skip the closing animation entirely.
    return (
      <MotionBottomSheet
        open={open}
        onClose={onClose}
        title={isEditing ? 'Edit Event' : 'New Calendar Event'}
      >
        {formBody}
      </MotionBottomSheet>
    )
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-surface flex items-center justify-between px-6 py-4 border-b border-base">
          <h2 className="font-heading font-bold text-brand-navy flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-brand-teal" aria-hidden="true" />
            {isEditing ? 'Edit Event' : 'New Calendar Event'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close event form"
            className="p-1.5 hover:bg-page rounded-lg"
          >
            <X className="w-4 h-4 text-muted" aria-hidden="true" />
          </button>
        </div>
        <div className="p-6">{formBody}</div>
      </div>
    </div>
  )
}
