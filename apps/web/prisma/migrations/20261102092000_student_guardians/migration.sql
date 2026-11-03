-- ═══════════════════════════════════════════════════════════════════════════
-- Demographics, group 2 of 6 — multiple guardians
--
-- New table student_guardians. Student.guardianName / guardianPhone /
-- guardianRelation are NOT touched: they remain the denormalised primary
-- guardian (invoices, SMS, Algolia and the forms read them).
--
-- Backfill: one primary guardian row per existing student, copied from those
-- legacy columns and marked as the emergency contact so the "exactly one
-- primary, at least one emergency contact" rule holds from day one. Fee payer is
-- NOT assumed. Idempotent: students that already have a guardian row are skipped.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "student_guardians" (
  "id"                 TEXT         NOT NULL,
  "studentId"          TEXT         NOT NULL,
  "fullName"           TEXT         NOT NULL,
  "relation"           TEXT         NOT NULL,
  "phone"              TEXT         NOT NULL,
  "altPhone"           TEXT,
  "email"              TEXT,
  "address"            TEXT,
  "nrbNumber"          TEXT,
  "isPrimary"          BOOLEAN      NOT NULL DEFAULT false,
  "isFeePayer"         BOOLEAN      NOT NULL DEFAULT false,
  "isEmergencyContact" BOOLEAN      NOT NULL DEFAULT false,
  "livesWithStudent"   BOOLEAN,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "student_guardians_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "student_guardians_studentId_idx" ON "student_guardians"("studentId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_guardians_studentId_fkey'
  ) THEN
    ALTER TABLE "student_guardians"
      ADD CONSTRAINT "student_guardians_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "students"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- One primary guardian per student, copied from the legacy columns.
-- Application.guardianEmail / guardianAddress are recovered where the student was
-- converted from an application.
INSERT INTO "student_guardians"
  ("id", "studentId", "fullName", "relation", "phone", "email", "address",
   "isPrimary", "isFeePayer", "isEmergencyContact", "updatedAt")
SELECT
  'sg_' || s."id",
  s."id",
  s."guardianName",
  s."guardianRelation",
  s."guardianPhone",
  NULLIF(a."guardianEmail", ''),
  NULLIF(a."guardianAddress", ''),
  true, false, true,
  CURRENT_TIMESTAMP
FROM "students" AS s
LEFT JOIN "applications" AS a ON a."convertedStudentId" = s."id"
WHERE NOT EXISTS (SELECT 1 FROM "student_guardians" g WHERE g."studentId" = s."id")
ON CONFLICT ("id") DO NOTHING;
