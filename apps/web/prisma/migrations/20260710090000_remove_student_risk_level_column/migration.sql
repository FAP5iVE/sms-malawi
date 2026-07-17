-- [CHANGE TYPE]: NEW FILE (migration)
-- [R-PHASE]: R5 — Academics I: Admissions & Student Records
-- [PURPOSE]: Drops the persisted students.risk_level column. It was never
--   written by any code path (confirmed: studentService.ts's
--   computeRiskLevel() always computed a fresh value per request from
--   feeBalance/feeTotal and, until R7 supplies a real termAverage, never
--   read or wrote this column) and shares a name with — but is a
--   completely different value from — the API-served `riskLevel` field.
--   Keeping a permanently-stale column with the same name as a live
--   computed field is a data-integrity trap for any future direct-database
--   consumer.
-- [DEPENDS ON]: apps/web/prisma/schema.prisma (Student.riskLevel removed
--   in the same change)

ALTER TABLE "students" DROP COLUMN IF EXISTS "riskLevel";
