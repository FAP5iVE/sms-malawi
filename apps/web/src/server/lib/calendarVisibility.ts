/*
 * apps/web/src/server/lib/calendarVisibility.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: Canonical per-category role visibility policy for the
 *   aggregated calendar (GET /calendar/events, routes/calendar.ts).
 *   Centralized for two reasons:
 *
 *   1. Three domain sources — exams, timetable, lab bookings — must share
 *      one identical viewer set (student, academic staff, exam officer,
 *      both staff ranks, admin). Before this change each source had its
 *      own hand-written role array (exams had none at all — visible to
 *      every role; lab bookings' array was missing student and
 *      exam_officer; timetable's only covered academic/student). Three
 *      independent arrays for one policy is exactly the kind of thing
 *      that drifts apart over time; this file is the one place that list
 *      lives now.
 *
 *   2. Manually-created CalendarEvent rows (routes/calendar.ts source 10,
 *      the calendar.createEvent capability's own generic events) had *no*
 *      category-based visibility filtering at all — every manually
 *      created event, regardless of which category its creator picked in
 *      the create/edit form, was visible to every authenticated role that
 *      can open the calendar page, including student. A staff leave
 *      logged this way (the exact "Mercy Gondwe — Unpaid Leave" example
 *      the adopted reference UI itself demonstrates creating) was
 *      therefore visible to students — the concrete bug this file exists
 *      to close. roleCanViewManualCategory() applies the same policy a
 *      category's real domain source enforces to a manual row carrying
 *      that category.
 * [DEPENDS ON]: @shared/types/roles (UserRole), @shared/types/calendar
 *   (CalendarEventCategory)
 */
import type { UserRole } from '@shared/types/roles'
import type { CalendarEventCategory } from '@shared/types/calendar'

/** Exams, timetable, and lab bookings all share this exact viewer set —
 *  student, academic staff (teachers), exam officer, both staff ranks,
 *  and admin. Finance, library, and HR do not see academic scheduling. */
export const ACADEMIC_VISIBLE_ROLES: UserRole[] = [
  'student',
  'academic',
  'exam_officer',
  'high_rank',
  'lower_rank',
  'admin',
]

/** Approved-leave visibility: HR, both staff ranks, and admin see every
 *  staff member's leave. Every other staff role only ever sees their own
 *  (enforced separately, by staffId, in routes/calendar.ts's "own leave"
 *  source) — staff leave is personnel data, so this list stays narrow by
 *  design rather than growing to match ACADEMIC_VISIBLE_ROLES. */
export const LEAVE_VISIBLE_ROLES: UserRole[] = ['admin', 'high_rank', 'hr']

/** Roles that see every assignment system-wide, bypassing the normal
 *  "creator or that assignment's own class" scoping (routes/calendar.ts
 *  source 9, and the assignment branch of roleCanViewManualCategory below). */
export const ASSIGNMENT_UNRESTRICTED_ROLES: UserRole[] = ['admin', 'high_rank']

/** Categories with no viewing restriction at all — visible to every role. */
const OPEN_CATEGORIES: ReadonlySet<CalendarEventCategory> = new Set([
  'term',
  'holiday',
  'announcement', // unrestricted "as it is" — unchanged from before this policy existed
])

/**
 * Whether `role` may view a manually-created CalendarEvent (source 10)
 * carrying `category`, independent of who created it. Callers should
 * additionally always let the event's own creator see their own creation
 * regardless of this result (`createdByUid === uid`) — that check happens
 * at the call site, since a generic CalendarEvent row's only reliable
 * "who is this about" signal is createdByUid, not this function.
 *
 * `assignment` deliberately always returns false here: real assignment
 * visibility depends on which class or teacher an assignment belongs to,
 * and a generic CalendarEvent row has no such relationship to resolve —
 * a manually-created assignment-category event falls back to creator +
 * ASSIGNMENT_UNRESTRICTED_ROLES only, applied directly by the caller,
 * rather than this function pretending to resolve a class link that
 * doesn't exist on the row.
 */
export function roleCanViewManualCategory(
  role: UserRole,
  category: CalendarEventCategory
): boolean {
  if (OPEN_CATEGORIES.has(category)) return true
  if (category === 'exam' || category === 'timetable' || category === 'lab_booking') {
    return ACADEMIC_VISIBLE_ROLES.includes(role)
  }
  if (category === 'leave') return LEAVE_VISIBLE_ROLES.includes(role)
  if (category === 'assignment') return false
  // No policy defined for a category outside the known set — default open
  // rather than silently hiding a future category no one has scoped yet.
  return true
}