-- ═══════════════════════════════════════════════════════════════════════════
-- Demographics, group 3 of 6 — student welfare (sensitive)
--
-- Student: orphanStatus, isVulnerable, vulnerabilityNote,
--          vulnerabilityReviewedAt, medicalAlert
-- New table student_support_needs.
--
-- orphanStatus defaults to UNKNOWN, not NONE, so no existing student is ever
-- recorded as having two living parents on the strength of a default. Nothing is
-- backfilled: welfare data is entered deliberately by the staff who may see it.
-- Idempotent, additive only.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrphanStatus') THEN
    CREATE TYPE "OrphanStatus" AS ENUM ('UNKNOWN', 'NONE', 'FATHER_DECEASED', 'MOTHER_DECEASED', 'BOTH_DECEASED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupportNeedType') THEN
    CREATE TYPE "SupportNeedType" AS ENUM (
      'LOW_VISION', 'BLIND', 'HARD_OF_HEARING', 'DEAF', 'PHYSICAL_IMPAIRMENT',
      'LEARNING_DIFFICULTY', 'ALBINISM', 'OTHER'
    );
  END IF;
END $$;

ALTER TABLE "students"
  ADD COLUMN IF NOT EXISTS "orphanStatus"            "OrphanStatus" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS "isVulnerable"            BOOLEAN        NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "vulnerabilityNote"       TEXT,
  ADD COLUMN IF NOT EXISTS "vulnerabilityReviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "medicalAlert"            TEXT;

CREATE TABLE IF NOT EXISTS "student_support_needs" (
  "id"              TEXT              NOT NULL,
  "studentId"       TEXT              NOT NULL,
  "type"            "SupportNeedType" NOT NULL,
  "accommodation"   TEXT,
  "assistiveDevice" TEXT,
  "identifiedAt"    TIMESTAMP(3),
  "recordedByUid"   TEXT              NOT NULL,
  "createdAt"       TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "student_support_needs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "student_support_needs_studentId_idx" ON "student_support_needs"("studentId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_support_needs_studentId_fkey'
  ) THEN
    ALTER TABLE "student_support_needs"
      ADD CONSTRAINT "student_support_needs_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "students"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
