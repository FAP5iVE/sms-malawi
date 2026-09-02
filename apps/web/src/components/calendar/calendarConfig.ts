/*
 * apps/web/src/components/calendar/calendarConfig.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Interactive Calendar UI adoption — single source of truth for
 *   the category legend (label + color) shared by every calendar component
 *   (filter chips, month-grid color bars, event cards, the create/edit
 *   form's category picker). Previously this list lived inline inside
 *   calendar/page.tsx as LEGEND_ITEMS; pulling it out here is what lets the
 *   new Desktop/Mobile views and the event form all reference the exact
 *   same category set without redefining it three times.
 * [DEPENDS ON]: @shared/types/calendar (CalendarEventCategory, CALENDAR_COLORS
 *   — the canonical category union and color map; this file only adds
 *   display labels on top)
 */
import { CALENDAR_COLORS } from '@shared/types/calendar'
import type { CalendarEventCategory } from '@shared/types/calendar'

/** Prefix calendarEventService.ts / routes/calendar.ts assign to every
 *  manually-created CalendarEvent row's aggregated id (`calevent-${id}`).
 *  Only events carrying this prefix are editable/deletable — every other
 *  category source (holidays, exams, timetable, leave, announcements,
 *  assignments, term dates) is read-only, derived from its own domain
 *  model elsewhere in the system. */
export const MANUAL_EVENT_PREFIX = 'calevent-'

export function isManualEvent(eventId: string): boolean {
  return eventId.startsWith(MANUAL_EVENT_PREFIX)
}

export function manualEventDbId(eventId: string): string {
  return eventId.slice(MANUAL_EVENT_PREFIX.length)
}

export interface CategoryLegendItem {
  category: CalendarEventCategory
  label: string
}

export const CATEGORY_LEGEND: CategoryLegendItem[] = [
  { category: 'term', label: 'Term Dates' },
  { category: 'holiday', label: 'Public Holidays' },
  { category: 'exam', label: 'Exams' },
  { category: 'timetable', label: 'Timetable' },
  { category: 'lab_booking', label: 'Lab Bookings' },
  { category: 'leave', label: 'Leave' },
  { category: 'announcement', label: 'Announcements' },
  { category: 'assignment', label: 'Assignments' },
]

export const ALL_CATEGORIES: CalendarEventCategory[] = CATEGORY_LEGEND.map((c) => c.category)

export function categoryLabel(category: CalendarEventCategory): string {
  return CATEGORY_LEGEND.find((c) => c.category === category)?.label ?? category
}

export function categoryColor(category: CalendarEventCategory): string {
  return CALENDAR_COLORS[category] ?? CALENDAR_COLORS.term
}

/** Default category pre-selected when opening the create-event form. */
export const DEFAULT_EVENT_CATEGORY: CalendarEventCategory = 'term'
