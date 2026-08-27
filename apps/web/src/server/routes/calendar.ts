/*
 * apps/web/src/server/routes/calendar.ts
 *
 * [CHANGE TYPE]: MAJOR REWRITE (announcement-source portion and new events
 *   CRUD; the other seven pre-existing event-category sources — holidays,
 *   terms, exams, lab bookings, staff leave, own leave, timetable — are
 *   confirmed correct and unaffected)
 * [R-PHASE]: R13 — Announcements, Timetable & Calendar Domain
 * [PURPOSE]:
 *   1. Source 8 (announcements): replaced the build-breaking
 *      prisma.announcement.findMany() call (Announcements are
 *      Firestore-native — this referenced a Prisma model relationship
 *      that never had a real write path; the one-off Prisma Announcement
 *      model added in an earlier phase as a stopgap for this exact route
 *      and public.ts's landing-page feed had zero writers anywhere in the
 *      codebase and is superseded by this fix, see public.ts's own R13
 *      edit) with a Firestore query against COLLECTIONS.ANNOUNCEMENTS,
 *      filtered to status === 'PUBLISHED' with a real eventDate in range.
 *   2. Added source 9 (assignments) — Assignment.dueDate via Prisma,
 *      scoped like source 7 (timetable): academic sees assignments they
 *      created, student sees their own class's assignments. The
 *      'assignment' category already had a defined color
 *      (CALENDAR_COLORS.assignment) and a rendered filter chip on the
 *      frontend with no backing data before this phase.
 *   3. Fixed WEEKDAY_TO_ISO's silent failure for any TimetableSlot.day
 *      value outside Monday-Friday: previously `if (!isoDay) continue`
 *      silently dropped the slot from the calendar entirely. Now logs a
 *      warning and surfaces a single best-effort event on the range's
 *      start date (not expanded weekly, since the day-of-week to expand
 *      against is unknown) rather than dropping it — Malawian secondary
 *      schools are not guaranteed to have zero Saturday classes.
 *   4. Term periods: replaced the six hardcoded 2025/2026 TERM_PERIODS
 *      date literals with settingsService.getTermDates() — the six
 *      TERM1_START..TERM3_END settings already existed with a real
 *      admin-panel write path (settings.actions.ts) but zero reader
 *      anywhere, the same "settings panel with no effect on real
 *      computation" pattern R7/R8/R12 each closed for their own domain.
 *   5. Added POST /events, PATCH /events/:id, DELETE /events/:id, gated
 *      by requirePermission('calendar.createEvent'/'editEvent'/
 *      'deleteEvent') — closes the four-permission gap
 *      (createEvent/editEvent granted to 7 roles, deleteEvent to 2) for a
 *      generic calendar-event capability that had never had any
 *      model/route/service/UI. Also added source 10 to the aggregated
 *      GET /events response itself — the manually-created CalendarEvent
 *      rows these new routes write, merged in using each row's own
 *      stored category for color/grouping like every other source.
 *      Without this, POST /events would create rows nothing ever
 *      displayed.
 *   6. Added `import 'server-only'`.
 *
 * [CHANGE TYPE]: TARGETED EDIT (production fix, 2026-08-27) — two more
 *   hardcoded-year defects in this same route, found during a codebase-wide
 *   sweep for exactly this bug class:
 *   7. Source 7 (timetable slots): the Prisma `where` filter had
 *      `academicYear: '2025/2026'` hardcoded — every other one of this
 *      file's own sources (holidays, terms, exams, leave) is
 *      request/settings-scoped, but this one could never return timetable
 *      slots for any year but 2025/2026, ever, silently. Replaced with
 *      settingsService.get(SETTING_KEYS.CURRENT_ACADEMIC_YEAR) — same
 *      settingsService import this file already uses for getTermDates(),
 *      same call already used correctly by classes.ts's own
 *      /subject-assignments routes for the identical value.
 *   8. rangeStart/rangeEnd's fallback (used when the caller omits ?start=
 *      /?end=) was `new Date(2025, 8, 1)` / `new Date(2026, 11, 31)` —
 *      hardcoded to one specific academic year's span. Replaced with the
 *      already-fetched termDates' own term1.start/term3.end (moved above
 *      this computation so it's available), so an omitted range now
 *      defaults to the *current* academic year's actual configured span
 *      instead of a permanently-fixed one.
 * [DEPENDS ON]: apps/web/src/server/services/calendarEventService.ts (new,
 *   same phase), apps/web/src/server/services/settingsService.ts
 *   (getTermDates — same phase), apps/web/src/server/services/
 *   studentService.ts (resolveStudentFromUid), @shared/constants/malawi
 *   (COLLECTIONS.ANNOUNCEMENTS), @shared/schemas/calendarEvent (new,
 *   same phase)
 * [DEPENDS ON (added)]: @shared/types/settings (SETTING_KEYS)
 */
import 'server-only'

import { Router }      from 'express'
import { getFirestore }  from 'firebase-admin/firestore'
import { verifyAuth, getAdminApp }  from '@/lib/verifyAuth'
import { requirePermission } from '@/server/middleware/verifyPermission'
import { prisma }      from '@/lib/prisma'
import { logger }      from '@/lib/logger'
import type { CalendarEvent } from '@shared/types/calendar'
import { CALENDAR_COLORS }   from '@shared/types/calendar'
import { SETTING_KEYS }      from '@shared/types/settings'
import { COLLECTIONS }       from '@shared/constants/storage'
import { CreateCalendarEventSchema, UpdateCalendarEventSchema } from '@shared/schemas/calendarEvent'
import * as settingsService     from '@/server/services/settingsService'
import * as calendarEventService from '@/server/services/calendarEventService'
import * as studentService      from '@/server/services/studentService'
import { format, parseISO, addDays } from 'date-fns'
import { sendError } from '@/server/lib/sendError'

export const calendarRouter = Router()

const WEEKDAY_TO_ISO: Record<string, number> = {
  MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5,
}

function nextWeekdayFrom(from: Date, isoWeekday: number): Date {
  const d = new Date(from)
  const diff = (isoWeekday - d.getDay() + 7) % 7
  d.setDate(d.getDate() + diff)
  return d
}

/**
 * GET /calendar/events?start=<ISO>&end=<ISO>
 * Aggregates all event sources into a unified CalendarEvent[] array.
 */
calendarRouter.get('/events',
  verifyAuth,
  async (req, res) => {
    const startStr = req.query.start as string | undefined
    const endStr   = req.query.end   as string | undefined
    const role     = req.user!.role
    const uid      = req.user!.uid

    // [PRODUCTION FIX 2026-08-27] termDates is fetched here now (moved up
    // from source 2, below) specifically so its term1.start/term3.end can
    // serve as the default range when the caller omits ?start=/?end= —
    // previously a hardcoded new Date(2025, 8, 1)/new Date(2026, 11, 31)
    // span that only ever matched the 2025/2026 academic year.
    const termDates = await settingsService.getTermDates()

    const rangeStart = startStr ? parseISO(startStr) : parseISO(termDates.term1.start)
    const rangeEnd   = endStr   ? parseISO(endStr)   : parseISO(termDates.term3.end)

    const events: CalendarEvent[] = []

// ── 1. Public holidays (dynamic from DB — seeded via admin panel) ──
    const dbHolidays = await prisma.malawiPublicHoliday.findMany({
      where: {
        OR: [
          { date: { gte: rangeStart, lte: rangeEnd } },
          { isRecurring: true },
        ],
      },
      orderBy: { date: 'asc' },
    })
    for (const h of dbHolidays) {
      const d = new Date(h.date)
      if (d >= rangeStart && d <= rangeEnd) {
        events.push({
          id:       `holiday-${h.id}`,
          title:    h.name,
          start:    format(d, 'yyyy-MM-dd'),
          allDay:   true,
          color:    CALENDAR_COLORS.holiday,
          category: 'holiday',
        })
      }
    }

    // ── 2. Term start/end dates (SETTING_KEYS.TERM1_START..TERM3_END —
    //      admin-configurable, previously six hardcoded 2025/2026 literals) ──
    const TERM_PERIODS = [
      { id: 't1-start', title: 'Term 1 Starts', date: termDates.term1.start },
      { id: 't1-end',   title: 'Term 1 Ends',   date: termDates.term1.end },
      { id: 't2-start', title: 'Term 2 Starts', date: termDates.term2.start },
      { id: 't2-end',   title: 'Term 2 Ends',   date: termDates.term2.end },
      { id: 't3-start', title: 'Term 3 Starts', date: termDates.term3.start },
      { id: 't3-end',   title: 'Term 3 Ends',   date: termDates.term3.end },
    ]
    for (const t of TERM_PERIODS) {
      const d = parseISO(t.date)
      if (d >= rangeStart && d <= rangeEnd) {
        events.push({ id: t.id, title: t.title, start: t.date, allDay: true, color: CALENDAR_COLORS.term, category: 'term' })
      }
    }

    // ── 3. Exams scheduled in the range ──
    // No `status` filter: every Exam row already has a real, confirmed
    // ExamStatus (SCHEDULED, IN_PROGRESS, MARKS_PENDING, MARKS_DRAFT,
    // MARKS_FINAL, RESULTS_APPROVED, RESULTS_RELEASED — defaults to
    // SCHEDULED on creation). There is no "not yet scheduled" draft state
    // for an exam's own scheduling in this domain — MARKS_DRAFT is about
    // the marks-entry progress *after* the exam has already happened, not
    // whether the exam itself belongs on the calendar. The previous
    // `status: { not: 'DRAFT' }` referenced a status value that has never
    // existed in the ExamStatus enum.
    const exams = await prisma.exam.findMany({
      where: {
        date: { gte: rangeStart, lte: rangeEnd },
      },
      select: { id: true, subject: true, date: true, timeStart: true, timeEnd: true, type: true, venue: true },
    })
    for (const exam of exams) {
      const dateStr = format(exam.date, 'yyyy-MM-dd')
      const isManeb = exam.type === 'MANEB_JCE' || exam.type === 'MANEB_MSCE'
      events.push({
        id:       `exam-${exam.id}`,
        title:    `${isManeb ? 'MANEB ' : ''}${exam.subject} Exam`,
        start:    exam.timeStart ? `${dateStr}T${exam.timeStart}` : dateStr,
        end:      exam.timeEnd   ? `${dateStr}T${exam.timeEnd}`   : undefined,
        allDay:   !exam.timeStart,
        color:    CALENDAR_COLORS.exam,
        category: 'exam',
        meta:     { examId: exam.id, venue: exam.venue ?? '' },
      })
    }

    // ── 4. Lab bookings in the range ──
    if (['admin', 'high_rank', 'academic', 'lower_rank'].includes(role)) {
      const labBookings = await prisma.labBooking.findMany({
        where: {
          date: { gte: rangeStart, lte: rangeEnd },
          ...(role === 'academic' ? { bookedByUid: uid } : {}),
        },
        include: { class: { select: { name: true } } },
      })
      for (const lb of labBookings) {
        const dateStr = format(lb.date, 'yyyy-MM-dd')
        events.push({
          id:       `lab-${lb.id}`,
          title:    `${lb.labName} — ${(lb as typeof lb & { class: { name: string } }).class.name}`,
          start:    `${dateStr}T${lb.periodStart}`,
          end:      `${dateStr}T${lb.periodEnd}`,
          color:    CALENDAR_COLORS.lab_booking,
          category: 'lab_booking',
          meta:     { labName: lb.labName, purpose: lb.purpose ?? '' },
        })
      }
    }

    // ── 5. Approved staff leave in the range ──
    if (['admin', 'high_rank', 'hr'].includes(role)) {
      const leaves = await prisma.leaveRequest.findMany({
        where: {
          status:    'APPROVED',
          startDate: { lte: rangeEnd },
          endDate:   { gte: rangeStart },
        },
        include: { staff: { select: { firstName: true, lastName: true } } },
      })
      for (const lv of leaves) {
        events.push({
          id:       `leave-${lv.id}`,
          title:    `${(lv as typeof lv & { staff: { firstName: string; lastName: string } }).staff.firstName} ${(lv as typeof lv & { staff: { firstName: string; lastName: string } }).staff.lastName} — ${lv.leaveType} Leave`,
          start:    format(lv.startDate, 'yyyy-MM-dd'),
          end:      format(addDays(lv.endDate, 1), 'yyyy-MM-dd'),
          allDay:   true,
          color:    CALENDAR_COLORS.leave,
          category: 'leave',
        })
      }
    }

    // ── 6. Own leave (for all staff roles) ──
    if (!['admin', 'high_rank', 'hr', 'student'].includes(role)) {
      const myLeave = await prisma.leaveRequest.findMany({
        where: {
          staffId:   uid,
          status:    'APPROVED',
          startDate: { lte: rangeEnd },
          endDate:   { gte: rangeStart },
        },
      })
      for (const lv of myLeave) {
        if (events.find((e) => e.id === `leave-${lv.id}`)) continue
        events.push({
          id:       `leave-${lv.id}`,
          title:    `My ${lv.leaveType} Leave`,
          start:    format(lv.startDate, 'yyyy-MM-dd'),
          end:      format(addDays(lv.endDate, 1), 'yyyy-MM-dd'),
          allDay:   true,
          color:    CALENDAR_COLORS.leave,
          category: 'leave',
        })
      }
    }

    // ── 7. Timetable slots expanded into concrete dates in the range ──
    //    Academic staff see their own slots; students see their class slots.
    if (['academic', 'student'].includes(role)) {
      const timetableFilter = role === 'academic'
        ? { teacherUid: uid }
        : {}

      const currentAcademicYear = await settingsService.get(SETTING_KEYS.CURRENT_ACADEMIC_YEAR)
      const slots = await prisma.timetableSlot.findMany({
        where: { ...timetableFilter, academicYear: currentAcademicYear },
        include: { class: { select: { name: true } } },
        take: 200,
      })

      // Expand each slot for every matching weekday in the range
      for (const slot of slots) {
        const isoDay = WEEKDAY_TO_ISO[slot.day]
        if (!isoDay) {
          // A day value outside Monday-Friday (e.g. a genuine Saturday
          // class) previously vanished from the calendar silently. Log
          // it and surface one best-effort occurrence on the range's
          // start date rather than dropping it — we don't know which
          // weekday to expand a non-Mon-Fri value against, so a single
          // occurrence (not a weekly-repeated series) is the honest
          // representation of what we actually know.
          logger.warn({ slotId: slot.id, day: slot.day }, 'TimetableSlot.day outside Monday-Friday — surfacing a single best-effort calendar occurrence')
          const dateStr = format(rangeStart, 'yyyy-MM-dd')
          events.push({
            id:       `timetable-${slot.id}-${dateStr}`,
            title:    `${slot.subject} — ${(slot as typeof slot & { class: { name: string } }).class.name} (${slot.day})`,
            start:    `${dateStr}T${slot.periodStart}`,
            end:      `${dateStr}T${slot.periodEnd}`,
            color:    CALENDAR_COLORS.timetable,
            category: 'timetable',
            meta:     { subject: slot.subject, room: slot.room ?? '' },
          })
          continue
        }
        let cursor = nextWeekdayFrom(rangeStart, isoDay)
        while (cursor <= rangeEnd) {
          const dateStr = format(cursor, 'yyyy-MM-dd')
          events.push({
            id:       `timetable-${slot.id}-${dateStr}`,
            title:    `${slot.subject} — ${(slot as typeof slot & { class: { name: string } }).class.name}`,
            start:    `${dateStr}T${slot.periodStart}`,
            end:      `${dateStr}T${slot.periodEnd}`,
            color:    CALENDAR_COLORS.timetable,
            category: 'timetable',
            meta:     { subject: slot.subject, room: slot.room ?? '' },
          })
          cursor = addDays(cursor, 7)
        }
      }
    }

    // ── 8. Announcements with an event date, published and in range ──
    //      Firestore-native — Announcements have no Prisma model with a
    //      real write path (see this file's header comment).
    const announcementsSnap = await getFirestore(getAdminApp())
      .collection(COLLECTIONS.ANNOUNCEMENTS)
      .where('status', '==', 'PUBLISHED')
      .get()
    for (const doc of announcementsSnap.docs) {
      const data = doc.data() as { title: string; eventDate?: string | null }
      if (!data.eventDate) continue
      const d = parseISO(data.eventDate)
      if (d < rangeStart || d > rangeEnd) continue
      events.push({
        id:       `ann-${doc.id}`,
        title:    data.title,
        start:    format(d, 'yyyy-MM-dd'),
        allDay:   true,
        color:    CALENDAR_COLORS.announcement,
        category: 'announcement',
      })
    }

    // ── 9. Assignment due dates ──
    //      academic sees assignments they created; student sees their own
    //      class's assignments. The 'assignment' category already had a
    //      color and a rendered filter chip with no backing data before
    //      this phase.
    if (['academic', 'student'].includes(role)) {
      let classId: string | null = null
      let creatorUid: string | null = null
      if (role === 'academic') {
        creatorUid = uid
      } else {
        const student = await studentService.resolveStudentFromUid(uid)
        classId = student?.classId ?? null
      }

      if (creatorUid || classId) {
        const assignments = await prisma.assignment.findMany({
          where: {
            dueDate: { gte: rangeStart, lte: rangeEnd },
            ...(creatorUid ? { createdByUid: creatorUid } : {}),
            ...(classId ? { classId } : {}),
          },
          include: { class: { select: { name: true } } },
        })
        for (const a of assignments) {
          events.push({
            id:       `assignment-${a.id}`,
            title:    `${a.title} Due — ${(a as typeof a & { class: { name: string } }).class.name}`,
            start:    format(a.dueDate, 'yyyy-MM-dd'),
            allDay:   true,
            color:    CALENDAR_COLORS.assignment,
            category: 'assignment',
            meta:     { subject: a.subject },
          })
        }
      }
    }

    // ── 10. Manually-created calendar events (this phase's new
    //         CalendarEvent model) — reuses its own stored category for
    //         color/grouping, same as every other source. ──
    const manualEvents = await calendarEventService.listEvents({
      start: rangeStart.toISOString(),
      end:   rangeEnd.toISOString(),
    })
    for (const ev of manualEvents) {
      const category = ev.category as CalendarEvent['category']
      events.push({
        id:       `calevent-${ev.id}`,
        title:    ev.title,
        start:    ev.startDate.toISOString(),
        end:      ev.endDate ? ev.endDate.toISOString() : undefined,
        allDay:   !ev.endDate,
        color:    CALENDAR_COLORS[category] ?? CALENDAR_COLORS.term,
        category,
        meta:     ev.description ? { description: ev.description } : undefined,
      })
    }

    res.json(events)
  },
)

// ── CALENDAR EVENT CRUD ──────────────────────────────────
// Closes the four-permission gap (calendar.createEvent/editEvent granted
// to 7 roles, deleteEvent to 2) for a generic calendar-event capability
// that had never had any model/route/service/UI before this phase.

calendarRouter.post('/events',
  verifyAuth,
  requirePermission('calendar.createEvent'),
  async (req, res) => {
    const parsed = CreateCalendarEventSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    const event = await calendarEventService.createEvent(parsed.data, req.user!.uid, req.user!.role)
    return res.status(201).json(event)
  }
)

calendarRouter.patch('/events/:id',
  verifyAuth,
  requirePermission('calendar.editEvent'),
  async (req, res) => {
    const parsed = UpdateCalendarEventSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten() })
    try {
      const event = await calendarEventService.updateEvent(
        String(req.params.id),
        parsed.data,
        req.user!.uid,
        req.user!.role
      )
      return res.json(event)
    } catch (err: unknown) {
      return sendError(res, err, { defaultStatus: 400, tags: { module: 'calendar' } })
    }
  }
)

calendarRouter.delete('/events/:id',
  verifyAuth,
  requirePermission('calendar.deleteEvent'),
  async (req, res) => {
    await calendarEventService.deleteEvent(String(req.params.id), req.user!.uid, req.user!.role)
    return res.json({ success: true })
  }
)