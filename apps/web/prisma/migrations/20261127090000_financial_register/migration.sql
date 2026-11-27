-- Finance Hardening Plan P1-06 (D-09, C-02, X-12; plan migration M01, first part):
-- the financial register, durable idempotency records, job runs and financial evidence.
--
-- ADDITIVE: new enum types, four new tables, indexes, constraints, two trigger functions, and one foreign key on the
-- column journal_entries."financialTransactionId" that P1-05 added (it is NULL on every stored row). No existing row
-- is written. One transaction: it applies completely or not at all. Safe to run twice.
--
-- The previous version of the application keeps working against this schema: it does not know these tables and
-- leaves journal_entries."financialTransactionId" empty.

BEGIN;

-- ── 1. Enum types ──────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'FinancialTransactionType' AND n.nspname = current_schema()) THEN
    CREATE TYPE "FinancialTransactionType" AS ENUM (
      'STUDENT_INVOICE_RECOGNITION', 'DEFERRED_INCOME_RELEASE', 'LATE_PENALTY', 'INVOICE_ADJUSTMENT', 'INVOICE_VOID',
      'STUDENT_PAYMENT', 'STUDENT_PAYMENT_REVERSAL', 'CREDIT_APPLICATION', 'STUDENT_REFUND', 'SPONSOR_PAYMENT',
      'EXPENSE_RECOGNITION', 'EXPENSE_PAYMENT', 'EXPENSE_REVERSAL', 'ADVANCE_PAYMENT', 'ADVANCE_RECONCILIATION',
      'ADVANCE_RETURN', 'ADVANCE_WRITE_OFF', 'PAYROLL_RECOGNITION', 'PAYROLL_REVERSAL', 'PAYROLL_DISBURSEMENT',
      'STATUTORY_REMITTANCE', 'LOAN_DISBURSEMENT', 'LOAN_REPAYMENT', 'LOAN_WRITE_OFF', 'LIBRARY_FINE_ASSESSMENT',
      'LIBRARY_FINE_PAYMENT', 'LIBRARY_FINE_WAIVER', 'LIBRARY_FINE_CANCEL', 'ACCOUNT_TRANSFER',
      'RECONCILIATION_ADJUSTMENT', 'OPENING_BALANCE', 'RECLASSIFICATION', 'MANUAL_JOURNAL', 'ACCRUAL_TRANSITION',
      'ASSET_CAPITALISATION', 'ASSET_DEPRECIATION', 'ASSET_DISPOSAL', 'INVENTORY_ADJUSTMENT', 'HISTORICAL_CORRECTION');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'FinancialDirection' AND n.nspname = current_schema()) THEN
    CREATE TYPE "FinancialDirection" AS ENUM ('IN', 'OUT', 'INTERNAL', 'NONE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'FinancialTransactionStatus' AND n.nspname = current_schema()) THEN
    CREATE TYPE "FinancialTransactionStatus" AS ENUM ('PENDING_POSTING', 'POSTED', 'POSTING_FAILED', 'REVERSED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'IdempotencyStatus' AND n.nspname = current_schema()) THEN
    CREATE TYPE "IdempotencyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'FAILED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'FinancialEvidenceKind' AND n.nspname = current_schema()) THEN
    CREATE TYPE "FinancialEvidenceKind" AS ENUM
      ('RECEIPT', 'BANK_SLIP', 'MOBILE_MONEY_SMS', 'SUPPLIER_INVOICE', 'DELIVERY_NOTE', 'APPROVAL_DOC',
       'SPONSOR_AGREEMENT', 'STATEMENT', 'OTHER');
  END IF;
END $$;

-- ── 2. Tables ──────────────────────────────────────────────────────────────────────────────────

-- One row per money event. (sourceType, sourceId, eventKey) is the master duplicate guard (UQ-04).
CREATE TABLE IF NOT EXISTS "financial_transactions" (
  "id"                 TEXT                         NOT NULL,
  "transactionNumber"  TEXT                         NOT NULL DEFAULT '',  -- assigned by the database
  "type"               "FinancialTransactionType"   NOT NULL,
  "sourceType"         "FinancialSourceType"        NOT NULL,
  "sourceId"           TEXT                         NOT NULL,
  "eventKey"           TEXT                         NOT NULL,
  "direction"          "FinancialDirection"         NOT NULL,
  "amount"             DECIMAL(14,2)                NOT NULL,
  "currency"           TEXT                         NOT NULL DEFAULT 'MWK',
  "financialAccountId" TEXT,
  "partyType"          "PartyType",
  "partyId"            TEXT,
  "occurredAt"         TIMESTAMP(3)                 NOT NULL,
  "recordedAt"         TIMESTAMP(3)                 NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status"             "FinancialTransactionStatus" NOT NULL DEFAULT 'PENDING_POSTING',
  "journalEntryId"     TEXT,
  "reversalOfId"       TEXT,
  "idempotencyKey"     TEXT,
  "requestFingerprint" TEXT,
  "actorUid"           TEXT                         NOT NULL,
  "actorRole"          TEXT,
  "approvedByUid"      TEXT,
  "postingPlan"        JSONB,
  "postingAttempts"    INTEGER                      NOT NULL DEFAULT 0,
  "lastError"          TEXT,
  "nextRetryAt"        TIMESTAMP(3),
  "postedAt"           TIMESTAMP(3),
  CONSTRAINT "financial_transactions_pkey" PRIMARY KEY ("id")
);

-- One row per (operation, key). A row is committed only together with the work it protects.
CREATE TABLE IF NOT EXISTS "idempotency_records" (
  "id"                     TEXT                NOT NULL,
  "scope"                  TEXT                NOT NULL,
  "key"                    TEXT                NOT NULL,
  "actorUid"               TEXT                NOT NULL,
  "requestHash"            TEXT                NOT NULL,
  "status"                 "IdempotencyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "responseStatus"         INTEGER,
  "responseBody"           JSONB,
  "financialTransactionId" TEXT,
  "createdAt"              TIMESTAMP(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"            TIMESTAMP(3),
  "expiresAt"              TIMESTAMP(3)        NOT NULL,
  CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- A scheduled job claims its window by inserting here; the second claim of the same window fails.
CREATE TABLE IF NOT EXISTS "job_runs" (
  "id"         TEXT         NOT NULL,
  "jobName"    TEXT         NOT NULL,
  "windowKey"  TEXT         NOT NULL,
  "startedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "summary"    JSONB,
  CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- Proof documents. Append-only: replacing a document adds a row and points the old one at it (TRG-06).
CREATE TABLE IF NOT EXISTS "financial_evidence" (
  "id"             TEXT                    NOT NULL,
  "ownerType"      TEXT                    NOT NULL,
  "ownerId"        TEXT                    NOT NULL,
  "kind"           "FinancialEvidenceKind" NOT NULL,
  "fileKey"        TEXT                    NOT NULL,
  "fileName"       TEXT                    NOT NULL,
  "mimeType"       TEXT                    NOT NULL,
  "sizeBytes"      INTEGER                 NOT NULL,
  "sha256"         TEXT                    NOT NULL,
  "uploadedByUid"  TEXT                    NOT NULL,
  "uploadedAt"     TIMESTAMP(3)            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "supersededById" TEXT,
  CONSTRAINT "financial_evidence_pkey" PRIMARY KEY ("id")
);

-- ── 3. Indexes (UQ-04, UQ-05, UQ-06) ───────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS "financial_transactions_sourceType_sourceId_eventKey_key"
  ON "financial_transactions"("sourceType", "sourceId", "eventKey");                                  -- UQ-04
CREATE UNIQUE INDEX IF NOT EXISTS "financial_transactions_transactionNumber_key"
  ON "financial_transactions"("transactionNumber");                                                    -- UQ-05
CREATE UNIQUE INDEX IF NOT EXISTS "financial_transactions_journalEntryId_key"
  ON "financial_transactions"("journalEntryId");
CREATE UNIQUE INDEX IF NOT EXISTS "financial_transactions_reversalOfId_key"
  ON "financial_transactions"("reversalOfId");
CREATE INDEX IF NOT EXISTS "financial_transactions_status_nextRetryAt_idx"
  ON "financial_transactions"("status", "nextRetryAt");
CREATE INDEX IF NOT EXISTS "financial_transactions_occurredAt_idx" ON "financial_transactions"("occurredAt");

CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_records_scope_key_key" ON "idempotency_records"("scope", "key"); -- UQ-06
CREATE INDEX IF NOT EXISTS "idempotency_records_expiresAt_idx" ON "idempotency_records"("expiresAt");

CREATE UNIQUE INDEX IF NOT EXISTS "job_runs_jobName_windowKey_key" ON "job_runs"("jobName", "windowKey");

CREATE INDEX IF NOT EXISTS "financial_evidence_ownerType_ownerId_idx" ON "financial_evidence"("ownerType", "ownerId");
CREATE INDEX IF NOT EXISTS "financial_evidence_supersededById_idx" ON "financial_evidence"("supersededById");

-- ── 4. Constraints ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- CHK-17: a posted money event always names its journal entry.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'financial_transactions_posted_has_entry_check'
                   AND conrelid = 'financial_transactions'::regclass) THEN
    ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_posted_has_entry_check"
      CHECK ("status" <> 'POSTED' OR "journalEntryId" IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'financial_transactions_amount_check'
                   AND conrelid = 'financial_transactions'::regclass) THEN
    ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_amount_check"
      CHECK ("amount" >= 0 AND "amount" <> 'NaN');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'financial_transactions_journalEntryId_fkey'
                   AND conrelid = 'financial_transactions'::regclass) THEN
    ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_journalEntryId_fkey"
      FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'financial_transactions_reversalOfId_fkey'
                   AND conrelid = 'financial_transactions'::regclass) THEN
    ALTER TABLE "financial_transactions" ADD CONSTRAINT "financial_transactions_reversalOfId_fkey"
      FOREIGN KEY ("reversalOfId") REFERENCES "financial_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'journal_entries_financialTransactionId_fkey'
                   AND conrelid = 'journal_entries'::regclass) THEN
    ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_financialTransactionId_fkey"
      FOREIGN KEY ("financialTransactionId") REFERENCES "financial_transactions"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'financial_evidence_supersededById_fkey'
                   AND conrelid = 'financial_evidence'::regclass) THEN
    ALTER TABLE "financial_evidence" ADD CONSTRAINT "financial_evidence_supersededById_fkey"
      FOREIGN KEY ("supersededById") REFERENCES "financial_evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ── 5. Transaction numbers: TXN-{year}-{000000}, school time, gapless, assigned on insert ──────

CREATE OR REPLACE FUNCTION "financial_transactions_number"() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_scope  text;
  v_number integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW."transactionNumber" IS DISTINCT FROM OLD."transactionNumber" THEN
      RAISE EXCEPTION 'REGISTER_IMMUTABLE: the number of financial transaction % cannot be changed', OLD."id"
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."transactionNumber" <> '' THEN
    RAISE EXCEPTION 'REGISTER_IMMUTABLE: transaction numbers are assigned by the database; % was supplied', NEW."transactionNumber"
      USING ERRCODE = 'restrict_violation';
  END IF;
  v_scope := to_char((NEW."occurredAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Blantyre', 'YYYY');
  INSERT INTO "sequence_counters" AS c ("key", "scope", "nextValue") VALUES ('TXN', v_scope, 2)
  ON CONFLICT ("key", "scope") DO UPDATE SET "nextValue" = c."nextValue" + 1
  RETURNING c."nextValue" - 1 INTO v_number;
  NEW."transactionNumber" := 'TXN-' || v_scope || '-' || lpad(v_number::text, GREATEST(6, length(v_number::text)), '0');
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS "financial_transactions_number_trg" ON "financial_transactions";
CREATE TRIGGER "financial_transactions_number_trg"
  BEFORE INSERT OR UPDATE ON "financial_transactions"
  FOR EACH ROW EXECUTE FUNCTION "financial_transactions_number"();

-- ── 6. TRG-06: financial_evidence is append-only ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "financial_evidence_guard"() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'EVIDENCE_IMMUTABLE: evidence % cannot be deleted; add a new document instead', OLD."id"
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF to_jsonb(NEW) = to_jsonb(OLD) THEN
    RETURN NEW;
  END IF;
  -- The one change allowed: mark a current document as replaced by another one.
  IF OLD."supersededById" IS NULL AND NEW."supersededById" IS NOT NULL AND NEW."supersededById" <> OLD."id"
     AND (to_jsonb(NEW) - 'supersededById') = (to_jsonb(OLD) - 'supersededById') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'EVIDENCE_IMMUTABLE: evidence % cannot be changed; add a new document instead', OLD."id"
    USING ERRCODE = 'restrict_violation';
END;
$fn$;

DROP TRIGGER IF EXISTS "financial_evidence_guard_trg" ON "financial_evidence";
CREATE TRIGGER "financial_evidence_guard_trg"
  BEFORE UPDATE OR DELETE ON "financial_evidence"
  FOR EACH ROW EXECUTE FUNCTION "financial_evidence_guard"();

COMMIT;
