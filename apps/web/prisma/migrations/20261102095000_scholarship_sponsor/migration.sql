-- ═══════════════════════════════════════════════════════════════════════════
-- Demographics, group 5 of 6 — scholarship sponsor
--
-- Scholarship: sponsorType, sponsorName (both nullable; existing scholarships
-- keep NULL rather than a guessed sponsor). Nothing about how a scholarship
-- discounts an invoice changes: a FIXED_AMOUNT scholarship already models a
-- bursary covering part of the fees.
-- Idempotent, additive only.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SponsorType') THEN
    CREATE TYPE "SponsorType" AS ENUM (
      'GOVERNMENT_BURSARY', 'NGO', 'CHURCH', 'EMPLOYER', 'FAMILY', 'SCHOOL', 'OTHER'
    );
  END IF;
END $$;

ALTER TABLE "scholarships"
  ADD COLUMN IF NOT EXISTS "sponsorType" "SponsorType",
  ADD COLUMN IF NOT EXISTS "sponsorName" TEXT;
