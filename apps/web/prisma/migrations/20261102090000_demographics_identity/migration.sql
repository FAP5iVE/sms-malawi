-- ═══════════════════════════════════════════════════════════════════════════
-- Demographics, group 1 of 6 — identity, location and admission columns
--
-- Students   : nrbNumber, traditionalAuthority, religion, homeLanguage,
--              residenceType, travelMinutes, admissionType, previousSchool,
--              reasonForTransfer
-- Applications: traditionalAuthority, religion, homeLanguage
-- Staff      : dateOfBirth, nationality, homeDistrict, nrbNumber, tpin,
--              next-of-kin (name / phone / relation)
--
-- Additive only: every column is nullable or has a default, nothing is dropped,
-- renamed or rewritten. Statements are idempotent (IF NOT EXISTS / guarded DO
-- blocks), matching the repair migration, so re-running is harmless.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ResidenceType') THEN
    CREATE TYPE "ResidenceType" AS ENUM ('DAY_HOME', 'BOARDER', 'LODGING', 'WITH_RELATIVE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AdmissionType') THEN
    CREATE TYPE "AdmissionType" AS ENUM ('NEW_INTAKE', 'TRANSFER_IN', 'RETURNEE');
  END IF;
END $$;

-- ─── students ───────────────────────────────────────────────────────────────
ALTER TABLE "students"
  ADD COLUMN IF NOT EXISTS "nrbNumber"            TEXT,
  ADD COLUMN IF NOT EXISTS "traditionalAuthority" TEXT,
  ADD COLUMN IF NOT EXISTS "religion"             TEXT,
  ADD COLUMN IF NOT EXISTS "homeLanguage"         TEXT,
  ADD COLUMN IF NOT EXISTS "residenceType"        "ResidenceType",
  ADD COLUMN IF NOT EXISTS "travelMinutes"        INTEGER,
  ADD COLUMN IF NOT EXISTS "admissionType"        "AdmissionType" NOT NULL DEFAULT 'NEW_INTAKE',
  ADD COLUMN IF NOT EXISTS "previousSchool"       TEXT,
  ADD COLUMN IF NOT EXISTS "reasonForTransfer"    TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "students_nrbNumber_key" ON "students"("nrbNumber");

-- ─── applications ───────────────────────────────────────────────────────────
ALTER TABLE "applications"
  ADD COLUMN IF NOT EXISTS "traditionalAuthority" TEXT,
  ADD COLUMN IF NOT EXISTS "religion"             TEXT,
  ADD COLUMN IF NOT EXISTS "homeLanguage"         TEXT;

-- ─── staff_profiles ─────────────────────────────────────────────────────────
ALTER TABLE "staff_profiles"
  ADD COLUMN IF NOT EXISTS "dateOfBirth"      TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "nationality"      TEXT DEFAULT 'Malawian',
  ADD COLUMN IF NOT EXISTS "homeDistrict"     TEXT,
  ADD COLUMN IF NOT EXISTS "nrbNumber"        TEXT,
  ADD COLUMN IF NOT EXISTS "tpin"             TEXT,
  ADD COLUMN IF NOT EXISTS "nextOfKinName"    TEXT,
  ADD COLUMN IF NOT EXISTS "nextOfKinPhone"   TEXT,
  ADD COLUMN IF NOT EXISTS "nextOfKinRelation" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "staff_profiles_nrbNumber_key" ON "staff_profiles"("nrbNumber");
