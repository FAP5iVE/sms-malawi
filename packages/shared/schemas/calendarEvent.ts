/*
 * packages/shared/schemas/calendarEvent.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [R-PHASE]: R13 — Announcements, Timetable & Calendar Domain
 * [PURPOSE]: Create/Update schema pair for the new CalendarEvent Prisma
 *   model (schema.prisma, same phase) — no generic calendar-event model
 *   existed anywhere despite calendar.createEvent/editEvent/deleteEvent/
 *   manageAcademicCalendar being formally granted to seven and two roles
 *   respectively per the permission matrix. Follows this codebase's
 *   established Create/Update schema-pairing convention (see
 *   schemas/student.ts).
 * [DEPENDS ON]: @shared/types/calendar (CalendarEventCategory — the same
 *   category union the aggregated GET /calendar/events response already
 *   uses, so a manually-created event renders through the identical
 *   frontend legend/filter/color pipeline as every other source)
 *
 * [CHANGE TYPE]: TARGETED EDIT (Interactive Calendar UI adoption)
 * [PURPOSE]: Added optional `location` — the new calendar UI's create/edit
 *   form collects a "Location / Room" field (matching every other domain
 *   source's own venue-style field: Exam.venue, LabBooking.labName). Wired
 *   through to CalendarEvent.location (schema.prisma, same change) and
 *   surfaced on the aggregated GET /calendar/events response as
 *   meta.venue — the same meta key EventListItem/detail rendering already
 *   reads for exams (see routes/calendar.ts source 3), so a manually
 *   created event's location renders through the identical existing
 *   MapPin-icon display path as every other source, no new meta key.
 */
import { z } from 'zod'

export const CalendarEventCategorySchema = z.enum([
  'holiday',
  'term',
  'exam',
  'timetable',
  'lab_booking',
  'leave',
  'announcement',
  'assignment',
])

export const CreateCalendarEventSchema = z
  .object({
    title: z.string().min(2).max(200),
    description: z.string().max(2000).optional(),
    location: z.string().max(200).optional(),
    startDate: z.string().datetime(),
    endDate: z.string().datetime().optional(),
    category: CalendarEventCategorySchema,
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: 'endDate must not be before startDate.',
    path: ['endDate'],
  })

export const UpdateCalendarEventSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(2000).optional(),
  location: z.string().max(200).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  category: CalendarEventCategorySchema.optional(),
})

export type CreateCalendarEventInput = z.infer<typeof CreateCalendarEventSchema>
export type UpdateCalendarEventInput = z.infer<typeof UpdateCalendarEventSchema>
