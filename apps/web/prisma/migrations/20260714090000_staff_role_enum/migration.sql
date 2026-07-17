-- [CHANGE TYPE]: NEW FILE (migration)
-- [R-PHASE]: R11 — HR Domain: Loans UI, Leave-Conflict Wiring & Directory
--   Access Correction
-- [PURPOSE]: "staff_profiles"."role" was an unenforced String column
--   documented only in a comment as "matches UserRole values" — converted
--   to a real Postgres enum ("StaffRole") mirroring
--   packages/shared/types/roles.ts's USER_ROLES exactly, so an invalid
--   role can no longer be persisted at the database layer (matching this
--   same phase's Zod-layer fix to CreateStaffSchema.role). Existing
--   stored values are the exact lowercase role strings already used
--   everywhere else in the codebase (Firebase custom claims, the
--   permissions matrix, RoleGuard), so the direct enum cast is safe.
-- [DEPENDS ON]: apps/web/prisma/schema.prisma (StaffRole enum +
--   StaffProfile.role, same change)

CREATE TYPE "StaffRole" AS ENUM ('admin', 'high_rank', 'finance', 'library', 'lower_rank', 'academic', 'hr', 'exam_officer', 'student');

ALTER TABLE "staff_profiles" ALTER COLUMN "role" TYPE "StaffRole" USING ("role"::"StaffRole");
