-- ═══════════════════════════════════════════════════════════════════════════
-- Staff form clean-up (21 Nov 2026)
--
-- 1. staff_profiles.qualificationProgram: the programme a member of staff studied
--    for a diploma or degree (e.g. "Bachelor of Education"). Nullable, additive.
-- 2. "Qualified in education?" and "Housing" are removed from the staff form, the
--    staff card, the API and the code. No data was ever recorded in them, so the
--    two columns and the HousingStatus enum are dropped.
--
-- Idempotent: safe to run twice.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE "staff_profiles"
  ADD COLUMN IF NOT EXISTS "qualificationProgram" TEXT;

ALTER TABLE "staff_profiles"
  DROP COLUMN IF EXISTS "qualifiedInEducation",
  DROP COLUMN IF EXISTS "housingStatus";

DROP TYPE IF EXISTS "HousingStatus";
