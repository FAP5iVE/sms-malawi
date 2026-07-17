-- [CHANGE TYPE]: NEW FILE (migration)
-- [R-PHASE]: R6 — Academics II: Classes, Assignments & the Attendance Rebuild
-- [PURPOSE]: Adds the "status" column (ClassStatus: ACTIVE | ARCHIVED) to
--   "classes". The Class entity had no way to represent an archived class
--   at all — DELETE /classes/:id (soft-delete) added in this phase needs a
--   real column to write to, matching the same ACTIVE/ARCHIVED convention
--   already established on Student.status.
-- [DEPENDS ON]: apps/web/prisma/schema.prisma (Class.status + ClassStatus
--   enum added in the same change)

CREATE TYPE "ClassStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

ALTER TABLE "classes" ADD COLUMN "status" "ClassStatus" NOT NULL DEFAULT 'ACTIVE';

CREATE INDEX "classes_status_idx" ON "classes"("status");
