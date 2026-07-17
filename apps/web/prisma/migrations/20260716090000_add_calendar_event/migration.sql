-- [CHANGE TYPE]: NEW FILE (migration)
-- [R-PHASE]: R13 — Announcements, Timetable & Calendar Domain
-- [PURPOSE]: Creates the "calendar_events" table for the new generic
--   calendar-event capability (calendar.createEvent/editEvent/
--   deleteEvent/manageAcademicCalendar were formally granted to seven and
--   two roles respectively per the permission matrix with no
--   model/route/service/UI behind them anywhere). Distinct from the
--   "announcements" table (unrelated, pre-existing) and from the other
--   seven aggregated calendar sources, none of which are rows in this
--   table.
-- [DEPENDS ON]: apps/web/prisma/schema.prisma (CalendarEvent model added
--   in the same change)

CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "category" TEXT NOT NULL,
    "createdByUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "calendar_events_startDate_idx" ON "calendar_events"("startDate");

CREATE INDEX "calendar_events_createdByUid_idx" ON "calendar_events"("createdByUid");
