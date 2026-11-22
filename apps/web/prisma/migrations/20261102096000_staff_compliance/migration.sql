-- ═══════════════════════════════════════════════════════════════════════════
-- Demographics, group 6 of 6 — staff teaching, licensing, qualifications, exit
--
-- StaffProfile: isTeaching, TCM registration / licence number / licence expiry,
--   employmentCategory, payrollNo, highestQualification, qualifiedInEducation,
--   trainingRoute, housingStatus, exitReason, exitDate
-- New tables: staff_qualified_subjects, staff_responsibilities
--
-- isTeaching defaults to false and is NOT inferred from role: no existing member
-- of staff is suddenly "a teacher without a licence". HR marks teaching staff.
-- Idempotent, additive only.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmploymentCategory') THEN
    CREATE TYPE "EmploymentCategory" AS ENUM ('GOVERNMENT_POSTED', 'SCHOOL_EMPLOYED', 'COMMUNITY_PAID', 'VOLUNTEER', 'OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'QualificationLevel') THEN
    CREATE TYPE "QualificationLevel" AS ENUM ('MSCE', 'DIPLOMA', 'DEGREE', 'POSTGRADUATE', 'OTHER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TrainingRoute') THEN
    CREATE TYPE "TrainingRoute" AS ENUM (
      'UNIVERSITY_EDUCATION_DEGREE', 'EDUCATION_DIPLOMA', 'TEACHER_CERTIFICATE', 'ODL', 'UNTRAINED', 'OTHER'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HousingStatus') THEN
    CREATE TYPE "HousingStatus" AS ENUM ('SCHOOL_HOUSE', 'RENT_ALLOWANCE', 'OWN_ARRANGEMENT');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StaffExitReason') THEN
    CREATE TYPE "StaffExitReason" AS ENUM ('RESIGNED', 'TRANSFERRED', 'RETIRED', 'CONTRACT_ENDED', 'DISMISSED', 'DECEASED', 'OTHER');
  END IF;
END $$;

ALTER TABLE "staff_profiles"
  ADD COLUMN IF NOT EXISTS "isTeaching"           BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "tcmRegistrationNo"    TEXT,
  ADD COLUMN IF NOT EXISTS "tcmLicenceNo"         TEXT,
  ADD COLUMN IF NOT EXISTS "tcmLicenceExpiry"     TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "employmentCategory"   "EmploymentCategory",
  ADD COLUMN IF NOT EXISTS "payrollNo"            TEXT,
  ADD COLUMN IF NOT EXISTS "highestQualification" "QualificationLevel",
  ADD COLUMN IF NOT EXISTS "qualifiedInEducation" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "trainingRoute"        "TrainingRoute",
  ADD COLUMN IF NOT EXISTS "housingStatus"        "HousingStatus",
  ADD COLUMN IF NOT EXISTS "exitReason"           "StaffExitReason",
  ADD COLUMN IF NOT EXISTS "exitDate"             TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "staff_profiles_tcmLicenceExpiry_idx" ON "staff_profiles"("tcmLicenceExpiry");

CREATE TABLE IF NOT EXISTS "staff_qualified_subjects" (
  "id"      TEXT NOT NULL,
  "staffId" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  CONSTRAINT "staff_qualified_subjects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "staff_qualified_subjects_staffId_subject_key"
  ON "staff_qualified_subjects"("staffId", "subject");

CREATE TABLE IF NOT EXISTS "staff_responsibilities" (
  "id"        TEXT         NOT NULL,
  "staffId"   TEXT         NOT NULL,
  "title"     TEXT         NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate"   TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_responsibilities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "staff_responsibilities_staffId_idx" ON "staff_responsibilities"("staffId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_qualified_subjects_staffId_fkey') THEN
    ALTER TABLE "staff_qualified_subjects"
      ADD CONSTRAINT "staff_qualified_subjects_staffId_fkey"
      FOREIGN KEY ("staffId") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_responsibilities_staffId_fkey') THEN
    ALTER TABLE "staff_responsibilities"
      ADD CONSTRAINT "staff_responsibilities_staffId_fkey"
      FOREIGN KEY ("staffId") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
