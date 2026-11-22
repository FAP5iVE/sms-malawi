-- ═══════════════════════════════════════════════════════════════════════════
-- Data backfill (no schema change): recover what was lost at admission.
--
-- Before this release, converting an application to a student wrote otherNames,
-- address and phone as NULL although the application held them, and had no
-- columns for previousSchool / reasonForTransfer. Application.convertedStudentId
-- links each student back to its application, so the data can be restored.
--
-- Only NULL student columns are filled, so anything staff have since typed into
-- a student record is never overwritten, and re-running changes nothing.
-- religion / homeLanguage / traditionalAuthority are not backfilled: the
-- application never stored them (religion was validated, then discarded).
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE "students" AS s
SET
  "otherNames"        = COALESCE(s."otherNames",        a."otherNames"),
  "address"           = COALESCE(s."address",           a."address"),
  "phone"             = COALESCE(s."phone",             a."phone"),
  "previousSchool"    = COALESCE(s."previousSchool",    a."previousSchool"),
  "reasonForTransfer" = COALESCE(s."reasonForTransfer", a."reasonForTransfer")
FROM "applications" AS a
WHERE a."convertedStudentId" = s."id"
  AND (
       (s."otherNames"        IS NULL AND a."otherNames"        IS NOT NULL)
    OR (s."address"           IS NULL AND a."address"           IS NOT NULL)
    OR (s."phone"             IS NULL AND a."phone"             IS NOT NULL)
    OR (s."previousSchool"    IS NULL AND a."previousSchool"    IS NOT NULL)
    OR (s."reasonForTransfer" IS NULL AND a."reasonForTransfer" IS NOT NULL)
  );

-- Learners who joined above Form 1 were transfers; mark them so (only the
-- default NEW_INTAKE value is changed, never a staff-set RETURNEE).
UPDATE "students" AS s
SET "admissionType" = 'TRANSFER_IN'
FROM "applications" AS a
WHERE a."convertedStudentId" = s."id"
  AND a."applyingForForm" >= 2
  AND s."admissionType" = 'NEW_INTAKE';
