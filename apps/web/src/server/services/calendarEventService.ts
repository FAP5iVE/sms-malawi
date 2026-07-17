/*
 * apps/web/src/server/services/calendarEventService.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [R-PHASE]: R13 — Announcements, Timetable & Calendar Domain
 * [PURPOSE]: Exports createEvent()/updateEvent()/deleteEvent()/
 *   listEvents() for the new generic CalendarEvent model (schema.prisma,
 *   same phase), following this codebase's established service-file
 *   pattern (server-only, Prisma singleton, auditService.log() on every
 *   mutation). Backs the new POST/PATCH/DELETE /calendar/events routes.
 * [DEPENDS ON]: apps/web/src/lib/prisma.ts, apps/web/src/server/services/
 *   auditService.ts, @shared/schemas/calendarEvent (CreateCalendarEventInput/
 *   UpdateCalendarEventInput — same phase)
 */
import 'server-only'

import { prisma } from '@/lib/prisma'
import * as auditService from '@/server/services/auditService'
import type {
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
} from '@shared/schemas/calendarEvent'

export async function createEvent(
  input: CreateCalendarEventInput,
  createdByUid: string,
  actorRole: string
) {
  const event = await prisma.calendarEvent.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      startDate: new Date(input.startDate),
      endDate: input.endDate ? new Date(input.endDate) : null,
      category: input.category,
      createdByUid,
    },
  })

  await auditService.log({
    action: 'calendar.event_created',
    entityType: 'CalendarEvent',
    entityId: event.id,
    actorUid: createdByUid,
    actorRole,
    metadata: { after: { title: event.title, category: event.category } },
  })

  return event
}

export async function updateEvent(
  id: string,
  input: UpdateCalendarEventInput,
  actorUid: string,
  actorRole: string
) {
  const existing = await prisma.calendarEvent.findUnique({ where: { id } })
  if (!existing) {
    throw Object.assign(new Error('Calendar event not found.'), { status: 404 })
  }

  const event = await prisma.calendarEvent.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.startDate !== undefined ? { startDate: new Date(input.startDate) } : {}),
      ...(input.endDate !== undefined ? { endDate: new Date(input.endDate) } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
    },
  })

  await auditService.log({
    action: 'calendar.event_edited',
    entityType: 'CalendarEvent',
    entityId: id,
    actorUid,
    actorRole,
    metadata: { before: { title: existing.title }, after: { title: event.title } },
  })

  return event
}

export async function deleteEvent(id: string, actorUid: string, actorRole: string): Promise<void> {
  const existing = await prisma.calendarEvent.findUnique({ where: { id } })
  if (!existing) {
    throw Object.assign(new Error('Calendar event not found.'), { status: 404 })
  }

  await prisma.calendarEvent.delete({ where: { id } })

  await auditService.log({
    action: 'calendar.event_deleted',
    entityType: 'CalendarEvent',
    entityId: id,
    actorUid,
    actorRole,
    metadata: { before: { title: existing.title } },
  })
}

export async function listEvents(range: { start: string; end: string }) {
  return prisma.calendarEvent.findMany({
    where: {
      startDate: { gte: new Date(range.start), lte: new Date(range.end) },
    },
    orderBy: { startDate: 'asc' },
  })
}
