-- Physical address replaces the "Stays" dropdown (residenceType) and the travel-time field.
-- Both old fields are removed completely (demo data, nothing to keep).
ALTER TABLE "students"     ADD COLUMN IF NOT EXISTS "physicalAddress" TEXT;
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "physicalAddress" TEXT;

ALTER TABLE "students"     DROP COLUMN IF EXISTS "residenceType";
ALTER TABLE "students"     DROP COLUMN IF EXISTS "travelMinutes";
ALTER TABLE "applications" DROP COLUMN IF EXISTS "residenceType";
ALTER TABLE "applications" DROP COLUMN IF EXISTS "travelMinutes";
DROP TYPE IF EXISTS "ResidenceType";

-- Timestamp of the student's first-login registration form (NULL for students who never saw it).
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "registrationCompletedAt" TIMESTAMP(3);
