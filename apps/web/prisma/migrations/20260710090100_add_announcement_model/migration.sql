-- [CHANGE TYPE]: NEW FILE (migration)
-- [R-PHASE]: R5 — Academics I: Admissions & Student Records
-- [PURPOSE]: Creates the minimal "announcements" table. public.ts's
--   GET /public/announcements and calendar.ts's calendar-feed query both
--   already reference prisma.announcement with no Prisma model behind it
--   at all — a confirmed, pre-existing build-breaking defect (neither
--   could have typechecked against the generated Prisma client). This
--   migration adds just enough shape for those two existing, read-only
--   call sites to compile and function; a full Announcements domain
--   (create/publish workflow, role/class targeting, approval) is a
--   separate, dedicated roadmap phase.
-- [DEPENDS ON]: apps/web/prisma/schema.prisma (Announcement model added
--   in the same change)

CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "targetAudience" TEXT NOT NULL DEFAULT 'ALL',
    "eventDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "announcements_published_idx" ON "announcements"("published");

CREATE INDEX "announcements_eventDate_idx" ON "announcements"("eventDate");
