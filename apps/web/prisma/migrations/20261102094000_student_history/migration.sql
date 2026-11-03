-- ═══════════════════════════════════════════════════════════════════════════
-- Demographics, group 4 of 6 — student history: exit reasons + year outcomes
--
-- Student: exitReason, exitDate, exitNote (ARCHIVED stays the terminal status;
--          the service requires reason + date when a student is archived).
-- New table student_year_outcomes: one row per student per academic year,
--          written at promotion commit going forward.
--
-- Backfill: committed promotion runs already hold per-student results in
-- promotion_runs.log, so past years are recovered from there. Students who no
-- longer exist are skipped; existing rows win (ON CONFLICT DO NOTHING). Exit
-- reasons for students archived BEFORE this release are NOT guessed: they stay
-- NULL until staff record them.
-- Idempotent, additive only.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExitReason') THEN
    CREATE TYPE "ExitReason" AS ENUM ('TRANSFERRED_OUT', 'DROPPED_OUT', 'DISMISSED', 'DECEASED', 'WITHDRAWN', 'OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'YearOutcome') THEN
    CREATE TYPE "YearOutcome" AS ENUM ('PROMOTED', 'REPEATED', 'GRADUATED', 'AWAITING_MANEB');
  END IF;
END $$;

ALTER TABLE "students"
  ADD COLUMN IF NOT EXISTS "exitReason" "ExitReason",
  ADD COLUMN IF NOT EXISTS "exitDate"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "exitNote"   TEXT;

CREATE TABLE IF NOT EXISTS "student_year_outcomes" (
  "id"             TEXT          NOT NULL,
  "studentId"      TEXT          NOT NULL,
  "academicYear"   TEXT          NOT NULL,
  "form"           INTEGER       NOT NULL,
  "outcome"        "YearOutcome" NOT NULL,
  "promotionRunId" TEXT,
  "createdAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "student_year_outcomes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "student_year_outcomes_studentId_academicYear_key"
  ON "student_year_outcomes"("studentId", "academicYear");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_year_outcomes_studentId_fkey'
  ) THEN
    ALTER TABLE "student_year_outcomes"
      ADD CONSTRAINT "student_year_outcomes_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "students"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Past years, from committed promotion runs.
INSERT INTO "student_year_outcomes"
  ("id", "studentId", "academicYear", "form", "outcome", "promotionRunId")
SELECT
  'syo_' || r."id" || '_' || (e.entry ->> 'studentId'),
  e.entry ->> 'studentId',
  r."academicYear",
  (e.entry ->> 'currentForm')::INTEGER,
  (e.entry ->> 'outcome')::"YearOutcome",
  r."id"
FROM "promotion_runs" AS r
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(r."log"::jsonb) = 'array' THEN r."log"::jsonb ELSE '[]'::jsonb END
) AS e(entry)
JOIN "students" AS s ON s."id" = e.entry ->> 'studentId'
WHERE r."status" = 'COMMITTED'
  AND e.entry ->> 'outcome' IN ('PROMOTED', 'REPEATED', 'AWAITING_MANEB')
  AND e.entry ->> 'currentForm' IS NOT NULL
ON CONFLICT DO NOTHING;

-- Students who have already graduated: their final-year row (recorded as
-- AWAITING_MANEB by the promotion run) becomes GRADUATED. Only rows that are
-- still AWAITING_MANEB for a GRADUATED student are touched, so re-running is a no-op.
UPDATE "student_year_outcomes" AS o
SET "outcome" = 'GRADUATED'
FROM "students" AS s
WHERE s."id" = o."studentId"
  AND s."status" = 'GRADUATED'
  AND o."outcome" = 'AWAITING_MANEB';
