/** Unified FullCalendar-compatible event type shared between server and client. */
export interface CalendarEvent {
  id:       string
  title:    string
  start:    string           // ISO date or datetime
  end?:     string
  allDay?:  boolean
  color:    string
  category: CalendarEventCategory
  meta?:    Record<string, string | number | boolean | null>
}

export type CalendarEventCategory =
  | 'holiday'
  | 'term'
  | 'exam'
  | 'timetable'
  | 'lab_booking'
  | 'leave'
  | 'announcement'
  | 'assignment'

export const CALENDAR_COLORS: Record<CalendarEventCategory, string> = {
  holiday:      '#6B3FA0',
  term:         '#0E8A6A',
  exam:         '#E84040',
  timetable:    '#0F3460',
  lab_booking:  '#00B4D8',
  leave:        '#F5A623',
  announcement: '#D97706',
  assignment:   '#6C63FF',
}