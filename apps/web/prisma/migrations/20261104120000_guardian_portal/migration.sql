-- ═══════════════════════════════════════════════════════════════════════════
-- Guardian portal, foundation (plan phase 1)
--
-- ADDITIVE ONLY. Nothing existing is altered or dropped. New enums, then new tables
-- guardian_profiles, guardian_contacts, guardian_links, guardian_invitations,
-- guardian_link_requests, guardian_onboarding_batches/items, guardian_access_logs.
--
-- student_guardians (the school's contact cards) is untouched: guardian_links only
-- references it (ON DELETE SET NULL) as provenance. A contact card never grants access.
--
-- Written to be re-runnable (IF NOT EXISTS / guarded blocks), matching the repair
-- style of the 20261102* migrations. No data is created here: onboarding runs as a
-- reviewed dry-run/apply batch from the app (see guardianOnboardingService).
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GuardianProfileStatus') THEN
    CREATE TYPE "GuardianProfileStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'MERGED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GuardianContactKind') THEN
    CREATE TYPE "GuardianContactKind" AS ENUM ('PHONE', 'EMAIL');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GuardianContactVerification') THEN
    CREATE TYPE "GuardianContactVerification" AS ENUM ('UNVERIFIED', 'STAFF_CONFIRMED', 'CODE_VERIFIED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GuardianLinkStatus') THEN
    CREATE TYPE "GuardianLinkStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REVOKED', 'REJECTED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GuardianLinkSource') THEN
    CREATE TYPE "GuardianLinkSource" AS ENUM ('ADMISSION', 'STAFF', 'BACKFILL', 'PARENT_REQUEST');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GuardianEvidence') THEN
    CREATE TYPE "GuardianEvidence" AS ENUM ('NONE', 'DOCUMENT_SEEN', 'IN_PERSON_VERIFIED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GuardianInvitationChannel') THEN
    CREATE TYPE "GuardianInvitationChannel" AS ENUM ('EMAIL', 'SLIP');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GuardianInvitationStatus') THEN
    CREATE TYPE "GuardianInvitationStatus" AS ENUM ('ACTIVE', 'CLAIMED', 'REVOKED', 'EXPIRED', 'LOCKED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GuardianRequestStatus') THEN
    CREATE TYPE "GuardianRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GuardianBatchStatus') THEN
    CREATE TYPE "GuardianBatchStatus" AS ENUM ('DRY_RUN', 'APPLYING', 'APPLIED', 'ROLLED_BACK');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GuardianBatchItemAction') THEN
    CREATE TYPE "GuardianBatchItemAction" AS ENUM ('CREATE_NEW', 'SUGGEST_MATCH', 'SKIP_EXISTING', 'SKIP_INVALID');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "guardian_profiles" (
  "id"                       TEXT NOT NULL,
  "fullName"                 TEXT NOT NULL,
  "normalizedName"           TEXT NOT NULL,
  "status"                   "GuardianProfileStatus" NOT NULL DEFAULT 'ACTIVE',
  "firebaseUid"              TEXT,
  "claimedAt"                TIMESTAMP(3),
  "createdSource"            "GuardianLinkSource" NOT NULL DEFAULT 'ADMISSION',
  "mergedIntoId"             TEXT,
  "createdByUid"             TEXT,
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMP(3) NOT NULL,
  CONSTRAINT "guardian_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "guardian_contacts" (
  "id"                       TEXT NOT NULL,
  "profileId"                TEXT NOT NULL,
  "kind"                     "GuardianContactKind" NOT NULL,
  "value"                    TEXT NOT NULL,
  "normalizedValue"          TEXT NOT NULL,
  "verification"             "GuardianContactVerification" NOT NULL DEFAULT 'UNVERIFIED',
  "verifiedAt"               TIMESTAMP(3),
  "isPreferred"              BOOLEAN NOT NULL DEFAULT false,
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMP(3) NOT NULL,
  CONSTRAINT "guardian_contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "guardian_links" (
  "id"                       TEXT NOT NULL,
  "profileId"                TEXT NOT NULL,
  "studentId"                TEXT NOT NULL,
  "relationship"             TEXT NOT NULL,
  "relationshipNote"         TEXT,
  "status"                   "GuardianLinkStatus" NOT NULL DEFAULT 'PENDING',
  "source"                   "GuardianLinkSource" NOT NULL DEFAULT 'ADMISSION',
  "evidence"                 "GuardianEvidence" NOT NULL DEFAULT 'NONE',
  "capabilities"             TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "isPrimaryContact"         BOOLEAN NOT NULL DEFAULT false,
  "isFinancialResponsible"   BOOLEAN NOT NULL DEFAULT false,
  "directoryEntryId"         TEXT,
  "reverifyRequired"         BOOLEAN NOT NULL DEFAULT false,
  "reverifyReason"           TEXT,
  "verifiedSnapshot"         JSONB,
  "suggestedProfileId"       TEXT,
  "suggestedMethod"          TEXT,
  "statusReason"             TEXT,
  "createdByUid"             TEXT,
  "approvedByUid"            TEXT,
  "approvedAt"               TIMESTAMP(3),
  "statusChangedByUid"       TEXT,
  "statusChangedAt"          TIMESTAMP(3),
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMP(3) NOT NULL,
  CONSTRAINT "guardian_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "guardian_invitations" (
  "id"                       TEXT NOT NULL,
  "ref"                      TEXT NOT NULL,
  "secretHash"               TEXT NOT NULL,
  "linkId"                   TEXT NOT NULL,
  "channel"                  "GuardianInvitationChannel" NOT NULL,
  "contactId"                TEXT,
  "status"                   "GuardianInvitationStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt"                TIMESTAMP(3) NOT NULL,
  "failedAttempts"           INTEGER NOT NULL DEFAULT 0,
  "lockedAt"                 TIMESTAMP(3),
  "issuedByUid"              TEXT NOT NULL,
  "issuedAt"                 TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt"                   TIMESTAMP(3),
  "claimedAt"                TIMESTAMP(3),
  "claimedByUid"             TEXT,
  "revokedAt"                TIMESTAMP(3),
  "revokedByUid"             TEXT,
  CONSTRAINT "guardian_invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "guardian_link_requests" (
  "id"                       TEXT NOT NULL,
  "profileId"                TEXT NOT NULL,
  "studentId"                TEXT,
  "admissionNumber"          TEXT,
  "claimedRelationship"      TEXT NOT NULL,
  "note"                     TEXT,
  "status"                   "GuardianRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedByUid"            TEXT,
  "reviewedAt"               TIMESTAMP(3),
  "reviewNote"               TEXT,
  "resultingLinkId"          TEXT,
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMP(3) NOT NULL,
  CONSTRAINT "guardian_link_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "guardian_onboarding_batches" (
  "id"                       TEXT NOT NULL,
  "status"                   "GuardianBatchStatus" NOT NULL DEFAULT 'DRY_RUN',
  "scope"                    JSONB,
  "summary"                  JSONB,
  "createdByUid"             TEXT NOT NULL,
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "appliedAt"                TIMESTAMP(3),
  "appliedByUid"             TEXT,
  "rolledBackAt"             TIMESTAMP(3),
  "rolledBackByUid"          TEXT,
  CONSTRAINT "guardian_onboarding_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "guardian_onboarding_items" (
  "id"                       TEXT NOT NULL,
  "batchId"                  TEXT NOT NULL,
  "directoryEntryId"         TEXT NOT NULL,
  "studentId"                TEXT NOT NULL,
  "action"                   "GuardianBatchItemAction" NOT NULL,
  "reason"                   TEXT,
  "flags"                    JSONB,
  "createdProfileId"         TEXT,
  "createdLinkId"            TEXT,
  "createdContactIds"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  CONSTRAINT "guardian_onboarding_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "guardian_access_logs" (
  "id"                       TEXT NOT NULL,
  "profileId"                TEXT NOT NULL,
  "linkId"                   TEXT,
  "studentId"                TEXT,
  "module"                   TEXT NOT NULL,
  "outcome"                  TEXT NOT NULL,
  "reason"                   TEXT,
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "guardian_access_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "guardian_profiles_firebaseUid_key" ON "guardian_profiles"("firebaseUid");
CREATE INDEX IF NOT EXISTS "guardian_profiles_normalizedName_idx" ON "guardian_profiles"("normalizedName");
CREATE INDEX IF NOT EXISTS "guardian_profiles_status_idx" ON "guardian_profiles"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "guardian_contacts_profileId_kind_normalizedValue_key" ON "guardian_contacts"("profileId", "kind", "normalizedValue");
CREATE INDEX IF NOT EXISTS "guardian_contacts_kind_normalizedValue_idx" ON "guardian_contacts"("kind", "normalizedValue");
CREATE UNIQUE INDEX IF NOT EXISTS "guardian_links_directoryEntryId_key" ON "guardian_links"("directoryEntryId");
CREATE UNIQUE INDEX IF NOT EXISTS "guardian_links_profileId_studentId_key" ON "guardian_links"("profileId", "studentId");
CREATE INDEX IF NOT EXISTS "guardian_links_studentId_status_idx" ON "guardian_links"("studentId", "status");
CREATE INDEX IF NOT EXISTS "guardian_links_profileId_status_idx" ON "guardian_links"("profileId", "status");
CREATE INDEX IF NOT EXISTS "guardian_links_status_reverifyRequired_idx" ON "guardian_links"("status", "reverifyRequired");
CREATE UNIQUE INDEX IF NOT EXISTS "guardian_invitations_ref_key" ON "guardian_invitations"("ref");
CREATE INDEX IF NOT EXISTS "guardian_invitations_linkId_status_idx" ON "guardian_invitations"("linkId", "status");
CREATE INDEX IF NOT EXISTS "guardian_invitations_status_expiresAt_idx" ON "guardian_invitations"("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "guardian_link_requests_status_createdAt_idx" ON "guardian_link_requests"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "guardian_link_requests_profileId_idx" ON "guardian_link_requests"("profileId");
CREATE INDEX IF NOT EXISTS "guardian_onboarding_batches_status_createdAt_idx" ON "guardian_onboarding_batches"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "guardian_onboarding_items_batchId_action_idx" ON "guardian_onboarding_items"("batchId", "action");
CREATE INDEX IF NOT EXISTS "guardian_onboarding_items_directoryEntryId_idx" ON "guardian_onboarding_items"("directoryEntryId");
CREATE INDEX IF NOT EXISTS "guardian_access_logs_profileId_createdAt_idx" ON "guardian_access_logs"("profileId", "createdAt");
CREATE INDEX IF NOT EXISTS "guardian_access_logs_studentId_createdAt_idx" ON "guardian_access_logs"("studentId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guardian_profiles_mergedIntoId_fkey') THEN
    ALTER TABLE "guardian_profiles"
      ADD CONSTRAINT "guardian_profiles_mergedIntoId_fkey"
      FOREIGN KEY ("mergedIntoId") REFERENCES "guardian_profiles"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guardian_contacts_profileId_fkey') THEN
    ALTER TABLE "guardian_contacts"
      ADD CONSTRAINT "guardian_contacts_profileId_fkey"
      FOREIGN KEY ("profileId") REFERENCES "guardian_profiles"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guardian_links_profileId_fkey') THEN
    ALTER TABLE "guardian_links"
      ADD CONSTRAINT "guardian_links_profileId_fkey"
      FOREIGN KEY ("profileId") REFERENCES "guardian_profiles"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guardian_links_studentId_fkey') THEN
    ALTER TABLE "guardian_links"
      ADD CONSTRAINT "guardian_links_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "students"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guardian_links_directoryEntryId_fkey') THEN
    ALTER TABLE "guardian_links"
      ADD CONSTRAINT "guardian_links_directoryEntryId_fkey"
      FOREIGN KEY ("directoryEntryId") REFERENCES "student_guardians"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guardian_links_suggestedProfileId_fkey') THEN
    ALTER TABLE "guardian_links"
      ADD CONSTRAINT "guardian_links_suggestedProfileId_fkey"
      FOREIGN KEY ("suggestedProfileId") REFERENCES "guardian_profiles"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guardian_invitations_linkId_fkey') THEN
    ALTER TABLE "guardian_invitations"
      ADD CONSTRAINT "guardian_invitations_linkId_fkey"
      FOREIGN KEY ("linkId") REFERENCES "guardian_links"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guardian_invitations_contactId_fkey') THEN
    ALTER TABLE "guardian_invitations"
      ADD CONSTRAINT "guardian_invitations_contactId_fkey"
      FOREIGN KEY ("contactId") REFERENCES "guardian_contacts"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guardian_link_requests_profileId_fkey') THEN
    ALTER TABLE "guardian_link_requests"
      ADD CONSTRAINT "guardian_link_requests_profileId_fkey"
      FOREIGN KEY ("profileId") REFERENCES "guardian_profiles"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guardian_onboarding_items_batchId_fkey') THEN
    ALTER TABLE "guardian_onboarding_items"
      ADD CONSTRAINT "guardian_onboarding_items_batchId_fkey"
      FOREIGN KEY ("batchId") REFERENCES "guardian_onboarding_batches"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guardian_access_logs_profileId_fkey') THEN
    ALTER TABLE "guardian_access_logs"
      ADD CONSTRAINT "guardian_access_logs_profileId_fkey"
      FOREIGN KEY ("profileId") REFERENCES "guardian_profiles"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'guardian_access_logs_linkId_fkey') THEN
    ALTER TABLE "guardian_access_logs"
      ADD CONSTRAINT "guardian_access_logs_linkId_fkey"
      FOREIGN KEY ("linkId") REFERENCES "guardian_links"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
