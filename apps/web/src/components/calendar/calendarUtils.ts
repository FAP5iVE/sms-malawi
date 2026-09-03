/*
 * apps/web/src/components/calendar/calendarUtils.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Interactive Calendar UI adoption — month-grid generation and
 *   date/time formatting for the new Desktop/Mobile calendar views,
 *   built on date-fns (already a dependency, already used server-side in
 *   routes/calendar.ts) rather than introducing a second date library.
 *   Mirrors interactive-calendar-ui's src/utils/dateUtils.ts, adapted to
 *   operate on this codebase's real `CalendarEvent` shape
 *   (@shared/types/calendar — start/end ISO strings, not startDate/endDate
 *   plain-date strings) instead of the reference's mock data shape.
 * [DEPENDS ON]: date-fns, @shared/types/calendar (CalendarEvent)
 */
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay as dfIsSameDay,
  isToday as dfIsToday,
  format,
  parseISO,
} from 'date-fns'
import type { CalendarEvent } from '@shared/types/calendar'

export interface CalendarDayCell {
  date: Date
  dateKey: string // yyyy-MM-dd
  dayNumber: number
  isCurrentMonth: boolean
  isToday: boolean
  events: CalendarEvent[]
}

/** Canonical date-key used to key/select/compare days throughout the
 *  calendar UI — yyyy-MM-dd, timezone-naive (local calendar date). */
export function toDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/** An event's own local calendar date, derived from its ISO `start`. */
function eventDateKey(isoStart: string): string {
  return format(parseISO(isoStart), 'yyyy-MM-dd')
}

function eventEndDateKey(event: CalendarEvent): string {
  return event.end ? format(parseISO(event.end), 'yyyy-MM-dd') : eventDateKey(event.start)
}

export function isEventOnDate(event: CalendarEvent, dateKey: string): boolean {
  const start = eventDateKey(event.start)
  const end = eventEndDateKey(event)
  return dateKey >= start && dateKey <= end
}

export function getEventsForDate(events: CalendarEvent[], dateKey: string): CalendarEvent[] {
  return events.filter((e) => isEventOnDate(e, dateKey))
}

export interface EventDateGroup {
  dateKey: string
  events: CalendarEvent[]
}

/** Groups events by their own start date and sorts both the groups (by
 *  date) and each group's events (by start time) — used by
 *  MobileCalendarView's Agenda mode, where a flat list of a whole month's
 *  events needs date headers to stay scannable on a narrow screen. */
export function groupEventsByDate(events: CalendarEvent[]): EventDateGroup[] {
  const byDate = new Map<string, CalendarEvent[]>()
  for (const e of events) {
    const key = eventDateKey(e.start)
    const bucket = byDate.get(key)
    if (bucket) bucket.push(e)
    else byDate.set(key, [e])
  }
  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, dayEvents]) => ({
      dateKey,
      events: [...dayEvents].sort((a, b) => a.start.localeCompare(b.start)),
    }))
}

/** The month grid's own start/end dates for a given displayed month —
 *  computed independently of any event data so the calendar page can
 *  request exactly this range from the API before events exist yet. */
export function getMonthGridRange(monthDate: Date): { start: string; end: string } {
  const monthStart = startOfMonth(monthDate)
  const monthEnd = endOfMonth(monthDate)
  return {
    start: toDateKey(startOfWeek(monthStart, { weekStartsOn: 1 })),
    end: toDateKey(endOfWeek(monthEnd, { weekStartsOn: 1 })),
  }
}

/**
 * Builds the visible month grid — 5 or 6 full weeks (35 or 42 cells)
 * depending on how the month falls, always starting on Monday. Kept
 * consistent between the mini calendar, the desktop main grid, and the
 * mobile grid so the same week position always means the same weekday
 * across every surface (see MobileCalendarView.tsx's header comment for
 * why this deliberately does not follow interactive-calendar-ui's
 * Sunday-first mobile grid). Row count is dynamic, not padded to a fixed
 * 6 — DesktopCalendarView.tsx sizes its grid rows off `days.length`.
 */
export function buildMonthGrid(monthDate: Date, events: CalendarEvent[]): CalendarDayCell[] {
  const monthStart = startOfMonth(monthDate)
  const monthEnd = endOfMonth(monthDate)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })

  return eachDayOfInterval({ start: gridStart, end: gridEnd }).map((date) => {
    const dateKey = toDateKey(date)
    return {
      date,
      dateKey,
      dayNumber: date.getDate(),
      isCurrentMonth: isSameMonth(date, monthDate),
      isToday: dfIsToday(date),
      events: getEventsForDate(events, dateKey),
    }
  })
}

export const WEEK_HEADERS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
export const WEEK_HEADERS_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export function formatMonthYear(date: Date): string {
  return format(date, 'MMMM yyyy')
}

export function formatMonthShort(date: Date): string {
  return format(date, 'MMM').toUpperCase()
}

export function formatDisplayDate(dateKey: string): string {
  return format(parseISO(`${dateKey}T00:00:00`), 'EEEE, MMMM d, yyyy')
}

export function formatShortDate(dateKey: string): string {
  return format(parseISO(`${dateKey}T00:00:00`), 'MMM d')
}

/** "Fri, Sep 4" — used as the sticky date-group heading in the mobile
 *  Agenda list, where full weekday names (formatDisplayDate) would wrap. */
export function formatGroupHeading(dateKey: string): string {
  return format(parseISO(`${dateKey}T00:00:00`), 'EEE, MMM d')
}

/** Renders an event's time range, e.g. "8:00 AM – 5:00 PM", or "All day"
 *  when the event carries no time-of-day component. */
export function formatEventTimeRange(event: CalendarEvent): string {
  if (event.allDay || !event.start.includes('T')) return 'All day'
  const start = parseISO(event.start)
  const startLabel = format(start, 'h:mm a')
  if (!event.end || !event.end.includes('T')) return startLabel
  const end = parseISO(event.end)
  if (dfIsSameDay(start, end)) {
    return `${startLabel} – ${format(end, 'h:mm a')}`
  }
  return `${startLabel} – ${format(end, 'MMM d, h:mm a')}`
}

/** Compact time label for dense list rows, e.g. "08:00" or "All day". */
export function formatEventTimeShort(event: CalendarEvent): string {
  if (event.allDay || !event.start.includes('T')) return 'All day'
  return format(parseISO(event.start), 'h:mm a')
}