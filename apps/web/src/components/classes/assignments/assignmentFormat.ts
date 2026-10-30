/**
 * [FILE]: apps/web/src/components/classes/assignments/assignmentFormat.ts
 * [PURPOSE]: Display helpers for the assignment screens. Rules (what is late, what
 *   "today" is, what counts as outstanding) come from @shared/utils/assignment so the
 *   screens can never disagree with the API; this file only turns them into words.
 *   Dates are shown in school time (Africa/Blantyre) whatever the viewer's device
 *   time zone is, because "due 5 Nov" is a school-calendar fact.
 */
import { SCHOOL_TIME_ZONE, daysBetween, schoolDayOf, todayInSchool } from '@shared/utils/assignment'

/** A calendar day (YYYY-MM-DD) as "5 Nov 2026". */
export function formatDay(ymd: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/** An ISO instant as YYYY-MM-DD in school time - the value for an <input type="date">. */
export const schoolDayInput = (iso: string): string => schoolDayOf(iso)

/** An ISO instant as the school-calendar day it falls on, e.g. a due date. */
export const formatDueDate = (iso: string): string => formatDay(schoolDayOf(iso))

/** An ISO instant as "5 Nov, 14:32" in school time. */
export function formatInstant(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: SCHOOL_TIME_ZONE,
  })
}

/** "Due in 3 days" / "Due today" / "Overdue by 2 days", relative to school "today". */
export function dueLabel(dueIso: string, now: Date = new Date()): { text: string; overdue: boolean } {
  const d = daysBetween(todayInSchool(now), schoolDayOf(dueIso))
  if (d > 1) return { text: `Due in ${d} days`, overdue: false }
  if (d === 1) return { text: 'Due tomorrow', overdue: false }
  if (d === 0) return { text: 'Due today', overdue: false }
  return { text: `Overdue by ${-d} day${d === -1 ? '' : 's'}`, overdue: true }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** "8.5 / 10" or "8.5" */
export const formatMarks = (marks: number, max?: number | null): string => `${marks}${max ? ` / ${max}` : ''}`

/** Who may open other people's hand-in files (mirrors the file proxy's role gate). */
export const FILE_STAFF_ROLES: ReadonlySet<string> = new Set(['admin', 'high_rank', 'academic'])
