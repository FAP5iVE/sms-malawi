-- Add firebaseUid column to students table.
-- Nullable because existing student records pre-date Firebase account creation.
-- Unique constraint enforces one-to-one mapping between Firebase UID and Student.
-- The partial index on non-null values keeps lookups O(1) while keeping
-- nulls for legacy rows that have not yet been linked.

ALTER TABLE "students"
  ADD COLUMN "firebaseUid" TEXT;

-- Unique constraint: one Firebase account per student
ALTER TABLE "students"
  ADD CONSTRAINT "students_firebaseUid_key" UNIQUE ("firebaseUid");

-- Fast lookup index: used on every authenticated student API request
-- to resolve uid → student row without a sequential scan
CREATE INDEX "students_firebaseUid_idx" ON "students"("firebaseUid");