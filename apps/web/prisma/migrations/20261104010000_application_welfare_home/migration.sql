-- ═══════════════════════════════════════════════════════════════════════════
-- Applications: National ID, home & admission, welfare / health / special needs
--
-- The /apply form now collects the same record the student profile shows, so the
-- application row needs somewhere to keep it until it is converted to a student:
--
--   nrbNumber                       optional NRB / birth-certificate number
--   residenceType, travelMinutes    "Home & Admission" (where the child stays, travel time)
--   admissionType                   NULL = derived from applyingForForm at conversion
--   orphanStatus, isVulnerable,
--   vulnerabilityNote, medicalAlert welfare + health (sensitive)
--   supportNeeds                    JSONB list of special needs [{ type, accommodation?, assistiveDevice? }]
--
-- orphanStatus defaults to UNKNOWN (never NONE) for the same reason as on students:
-- "no answer" must not read as "two living parents". Nothing is backfilled.
-- The enum types (OrphanStatus, ResidenceType, AdmissionType) already exist.
-- Idempotent, additive only.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "applications"
  ADD COLUMN IF NOT EXISTS "nrbNumber"         TEXT,
  ADD COLUMN IF NOT EXISTS "residenceType"     "ResidenceType",
  ADD COLUMN IF NOT EXISTS "travelMinutes"     INTEGER,
  ADD COLUMN IF NOT EXISTS "admissionType"     "AdmissionType",
  ADD COLUMN IF NOT EXISTS "orphanStatus"      "OrphanStatus" NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS "isVulnerable"      BOOLEAN        NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "vulnerabilityNote" TEXT,
  ADD COLUMN IF NOT EXISTS "medicalAlert"      TEXT,
  ADD COLUMN IF NOT EXISTS "supportNeeds"      JSONB;
