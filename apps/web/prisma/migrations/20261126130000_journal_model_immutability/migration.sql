-- Finance Hardening Plan P1-05 (A1-DEL, D-12, X-09; plan migration M02, second half after I-14):
-- journal model columns, CHK-01, and the immutability triggers TRG-01, TRG-02, TRG-03.
--
-- ADDITIVE: new enum types, new columns, one new table, indexes, two check constraints, two trigger functions.
-- Nothing is dropped, renamed or re-typed. The only data written is the backfill of the new columns
-- (status, entryNumber, entryKind, lineNumber). Amounts, dates, references and balances are not touched.
-- One transaction: it applies completely or not at all. Safe to run twice.
--
-- The previous version of the application keeps working against this schema:
--   * it does not know entryNumber / lineNumber        -> the database assigns them;
--   * it posts by setting only "isPosted" = true       -> the guard moves status DRAFT -> POSTED;
--   * it reverses by setting only "reversedAt" etc.    -> the guard moves status POSTED -> REVERSED.
--
-- Fails (and rolls back) if a stored journal line already breaks CHK-01. Check first with:
--   SELECT count(*) FROM journal_lines
--    WHERE NOT (debit >= 0 AND credit >= 0 AND debit <> 'NaN' AND credit <> 'NaN'
--               AND (debit = 0 OR credit = 0) AND (debit > 0 OR credit > 0));

BEGIN;

-- ── 1. Enum types ──────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'JournalStatus' AND n.nspname = current_schema()) THEN
    CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'POSTED', 'REVERSED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'JournalEntryKind' AND n.nspname = current_schema()) THEN
    CREATE TYPE "JournalEntryKind" AS ENUM
      ('NORMAL', 'REVERSAL', 'ADJUSTMENT', 'OPENING', 'RECLASSIFICATION', 'TRANSITION', 'BACKFILL', 'MANUAL');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'FinancialSourceType' AND n.nspname = current_schema()) THEN
    CREATE TYPE "FinancialSourceType" AS ENUM
      ('PAYMENT', 'INVOICE', 'EXPENSE', 'EXPENSE_PAYMENT', 'PAYROLL_RUN', 'LIBRARY_FINE');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE t.typname = 'PartyType' AND n.nspname = current_schema()) THEN
    CREATE TYPE "PartyType" AS ENUM ('STUDENT', 'STAFF', 'SUPPLIER', 'SPONSOR', 'GUARDIAN', 'OTHER');
  END IF;
END $$;

-- ── 2. Expand: new columns (nullable, or with a safe default) ──────────────────────────────────

ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "entryNumber"            TEXT;
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "status"                 "JournalStatus"    NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "entryKind"              "JournalEntryKind" NOT NULL DEFAULT 'NORMAL';
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "createdByUid"           TEXT;
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "sourceType"             "FinancialSourceType";
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "sourceId"               TEXT;
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "financialTransactionId" TEXT; -- FK arrives with the register (M01)
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "periodId"               TEXT; -- FK arrives with periods (M05)

ALTER TABLE "journal_lines" ADD COLUMN IF NOT EXISTS "lineNumber"         INTEGER;
ALTER TABLE "journal_lines" ADD COLUMN IF NOT EXISTS "memo"               TEXT;
ALTER TABLE "journal_lines" ADD COLUMN IF NOT EXISTS "financialAccountId" TEXT;
ALTER TABLE "journal_lines" ADD COLUMN IF NOT EXISTS "partyType"          "PartyType";
ALTER TABLE "journal_lines" ADD COLUMN IF NOT EXISTS "partyId"            TEXT;
ALTER TABLE "journal_lines" ADD COLUMN IF NOT EXISTS "budgetId"           TEXT;
ALTER TABLE "journal_lines" ADD COLUMN IF NOT EXISTS "departmentId"       TEXT;

-- Numbering counters (plan Part 3 §2.2). Only the 'JE' key is used so far.
CREATE TABLE IF NOT EXISTS "sequence_counters" (
  "key"       TEXT    NOT NULL,
  "scope"     TEXT    NOT NULL,
  "nextValue" INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "sequence_counters_key_scope_key" ON "sequence_counters"("key", "scope");

-- ── 3. Backfill (runs before the triggers exist; on a second run it matches no rows) ───────────

-- status from the flags the application has been writing.
UPDATE "journal_entries"
   SET "status" = (CASE WHEN NOT "isPosted" THEN 'DRAFT'
                        WHEN "reversedAt" IS NOT NULL THEN 'REVERSED'
                        ELSE 'POSTED' END)::"JournalStatus"
 WHERE "status" IS DISTINCT FROM
       (CASE WHEN NOT "isPosted" THEN 'DRAFT'
             WHEN "reversedAt" IS NOT NULL THEN 'REVERSED'
             ELSE 'POSTED' END)::"JournalStatus";

-- Only entries linked by reversalOfId are known to be reversals. Older 'VOID-' references are not guessed at.
UPDATE "journal_entries" SET "entryKind" = 'REVERSAL'
 WHERE "reversalOfId" IS NOT NULL AND "entryKind" = 'NORMAL';

-- JE-{year}-{000000}, in chronological order within the year of entryDate (school time, Africa/Blantyre).
WITH numbered AS (
  SELECT "id",
         to_char(("entryDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Blantyre', 'YYYY') AS y,
         row_number() OVER (
           PARTITION BY to_char(("entryDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Blantyre', 'YYYY')
           ORDER BY "entryDate", "createdAt", "id") AS n
    FROM "journal_entries"
   WHERE "entryNumber" IS NULL
)
UPDATE "journal_entries" e
   SET "entryNumber" = 'JE-' || numbered.y || '-' || lpad(numbered.n::text, GREATEST(6, length(numbered.n::text)), '0')
  FROM numbered
 WHERE e."id" = numbered."id";

-- Each counter continues after the highest number in use.
INSERT INTO "sequence_counters" AS c ("key", "scope", "nextValue")
SELECT 'JE', split_part("entryNumber", '-', 2), max(split_part("entryNumber", '-', 3)::integer) + 1
  FROM "journal_entries"
 WHERE "entryNumber" ~ '^JE-[0-9]{4}-[0-9]+$'
 GROUP BY split_part("entryNumber", '-', 2)
ON CONFLICT ("key", "scope") DO UPDATE SET "nextValue" = GREATEST(c."nextValue", EXCLUDED."nextValue");

-- Line numbers: existing lines are numbered in id order within their entry.
WITH numbered AS (
  SELECT "id", row_number() OVER (PARTITION BY "journalEntryId" ORDER BY "id") AS n
    FROM "journal_lines"
   WHERE "lineNumber" IS NULL
)
UPDATE "journal_lines" l SET "lineNumber" = numbered.n FROM numbered WHERE l."id" = numbered."id";

-- ── 4. Enforce ─────────────────────────────────────────────────────────────────────────────────

-- '' and 0 mean "not assigned yet": the insert triggers replace them.
ALTER TABLE "journal_entries" ALTER COLUMN "entryNumber" SET DEFAULT '';
ALTER TABLE "journal_entries" ALTER COLUMN "entryNumber" SET NOT NULL;
ALTER TABLE "journal_lines"   ALTER COLUMN "lineNumber"  SET DEFAULT 0;
ALTER TABLE "journal_lines"   ALTER COLUMN "lineNumber"  SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "journal_entries_entryNumber_key"            ON "journal_entries"("entryNumber");            -- UQ-01
CREATE UNIQUE INDEX IF NOT EXISTS "journal_entries_financialTransactionId_key" ON "journal_entries"("financialTransactionId"); -- UQ-03
CREATE INDEX IF NOT EXISTS "journal_entries_status_idx"               ON "journal_entries"("status");
CREATE INDEX IF NOT EXISTS "journal_entries_sourceType_sourceId_idx"  ON "journal_entries"("sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "journal_entries_periodId_idx"             ON "journal_entries"("periodId");
CREATE INDEX IF NOT EXISTS "journal_lines_accountId_partyType_partyId_idx" ON "journal_lines"("accountId", "partyType", "partyId");

DO $$
BEGIN
  -- isPosted stays true exactly when the entry is no longer a draft.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'journal_entries_status_isposted_check' AND conrelid = 'journal_entries'::regclass) THEN
    ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_status_isposted_check"
      CHECK ("isPosted" = ("status" <> 'DRAFT')) NOT VALID;
  END IF;
  -- CHK-01: each line is a debit or a credit, never both, never neither, never negative.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'journal_lines_debit_credit_check' AND conrelid = 'journal_lines'::regclass) THEN
    ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_debit_credit_check"
      CHECK ("debit" >= 0 AND "credit" >= 0 AND "debit" <> 'NaN' AND "credit" <> 'NaN' -- NaN sorts above zero
             AND ("debit" = 0 OR "credit" = 0) AND ("debit" > 0 OR "credit" > 0)) NOT VALID;
  END IF;
END $$;

ALTER TABLE "journal_entries" VALIDATE CONSTRAINT "journal_entries_status_isposted_check";
ALTER TABLE "journal_lines"   VALIDATE CONSTRAINT "journal_lines_debit_credit_check";

-- ── 5. TRG-01 and TRG-03: journal_entries ──────────────────────────────────────────────────────
-- Insert: only drafts; assigns entryNumber (gapless: a rolled-back insert returns the number). A number cannot be
--         supplied or changed: one taken by hand would collide with the counter and stop all later inserts.
-- Draft:  may be edited, deleted, or posted. Posting needs at least two lines and exact balance.
-- Posted: frozen. The one change allowed is the reversal: status POSTED -> REVERSED with the reversed* columns.
-- Reversed: frozen. Posted and reversed entries cannot be deleted.

CREATE OR REPLACE FUNCTION "journal_entries_guard"() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_scope  text;
  v_number integer;
  v_lines  bigint;
  v_debit  numeric;
  v_credit numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'DRAFT' THEN
      RAISE EXCEPTION 'LEDGER_IMMUTABLE: journal entry % is % and cannot be deleted; reverse it instead', OLD."id", OLD."status"
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'DRAFT' OR NEW."isPosted" OR NEW."reversedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'LEDGER_IMMUTABLE: journal entry % must be inserted as a draft and then posted', NEW."id"
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW."reversalOfId" IS NOT NULL AND NEW."entryKind" = 'NORMAL' THEN
      NEW."entryKind" := 'REVERSAL';
    END IF;
    IF NEW."entryNumber" <> '' THEN
      RAISE EXCEPTION 'LEDGER_IMMUTABLE: journal entry numbers are assigned by the database; % was supplied', NEW."entryNumber"
        USING ERRCODE = 'restrict_violation';
    END IF;
    v_scope := to_char((NEW."entryDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Africa/Blantyre', 'YYYY');
    INSERT INTO "sequence_counters" AS c ("key", "scope", "nextValue") VALUES ('JE', v_scope, 2)
    ON CONFLICT ("key", "scope") DO UPDATE SET "nextValue" = c."nextValue" + 1
    RETURNING c."nextValue" - 1 INTO v_number;
    NEW."entryNumber" := 'JE-' || v_scope || '-' || lpad(v_number::text, GREATEST(6, length(v_number::text)), '0');
    RETURN NEW;
  END IF;

  -- UPDATE. First, writers that predate "status" (the previous application version) change only the old flags.
  IF NEW."status" = OLD."status" THEN
    IF OLD."status" = 'DRAFT' AND NEW."isPosted" AND NOT OLD."isPosted" THEN
      NEW."status" := 'POSTED';
    ELSIF OLD."status" = 'POSTED' AND OLD."reversedAt" IS NULL AND NEW."reversedAt" IS NOT NULL THEN
      NEW."status" := 'REVERSED';
    END IF;
  END IF;

  IF NEW."entryNumber" IS DISTINCT FROM OLD."entryNumber" THEN
    RAISE EXCEPTION 'LEDGER_IMMUTABLE: the number of journal entry % cannot be changed', OLD."id"
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD."status" = 'DRAFT' THEN
    IF NEW."status" = 'REVERSED' OR NEW."reversedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'LEDGER_IMMUTABLE: journal entry % is a draft and cannot be reversed', OLD."id"
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW."status" = 'POSTED' THEN
      -- TRG-03. This row is locked here, and line writers update it (below), so the lines cannot change under us.
      SELECT count(*), COALESCE(sum("debit"), 0), COALESCE(sum("credit"), 0)
        INTO v_lines, v_debit, v_credit
        FROM "journal_lines" WHERE "journalEntryId" = OLD."id";
      IF v_lines < 2 THEN
        RAISE EXCEPTION 'LEDGER_TOO_FEW_LINES: journal entry % has % line(s); at least 2 are needed to post', OLD."id", v_lines
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_debit <> v_credit THEN
        RAISE EXCEPTION 'LEDGER_UNBALANCED: journal entry % cannot be posted: debits % <> credits %', OLD."id", v_debit, v_credit
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- OLD is POSTED or REVERSED.
  IF to_jsonb(NEW) = to_jsonb(OLD) THEN
    RETURN NEW;
  END IF;
  IF OLD."status" = 'POSTED' AND NEW."status" = 'REVERSED' AND NEW."reversedAt" IS NOT NULL
     AND (to_jsonb(NEW) - ARRAY['status', 'reversedAt', 'reversedByUid', 'reversalReason'])
       = (to_jsonb(OLD) - ARRAY['status', 'reversedAt', 'reversedByUid', 'reversalReason'])
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'LEDGER_IMMUTABLE: journal entry % is % and cannot be changed; only a one-time reversal is allowed', OLD."id", OLD."status"
    USING ERRCODE = 'restrict_violation';
END;
$fn$;

-- ── 6. TRG-02: journal_lines ───────────────────────────────────────────────────────────────────
-- Lines can be added, changed or removed only while their entry is a draft. Every line write first makes a no-op
-- update of its draft entry. That locks the entry, so a line writer and a posting wait for each other, and it leaves
-- a new row version: a REPEATABLE READ or SERIALIZABLE transaction whose snapshot misses the new line gets a
-- serialization error when it tries to post, instead of passing the balance check on stale lines. A share lock
-- would not do that.

CREATE OR REPLACE FUNCTION "journal_lines_guard"() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
  v_status "JournalStatus";
BEGIN
  IF TG_OP <> 'INSERT' THEN
    UPDATE "journal_entries" SET "status" = "status" WHERE "id" = OLD."journalEntryId" AND "status" = 'DRAFT';
    IF NOT FOUND THEN
      SELECT "status" INTO v_status FROM "journal_entries" WHERE "id" = OLD."journalEntryId";
      IF v_status IS NOT NULL THEN
        RAISE EXCEPTION 'LEDGER_IMMUTABLE: line % belongs to a % journal entry and cannot be changed or removed', OLD."id", v_status
          USING ERRCODE = 'restrict_violation';
      END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR NEW."journalEntryId" IS DISTINCT FROM OLD."journalEntryId" THEN
    UPDATE "journal_entries" SET "status" = "status" WHERE "id" = NEW."journalEntryId" AND "status" = 'DRAFT';
    IF NOT FOUND THEN
      -- A missing parent is left to the foreign key (v_status stays NULL).
      SELECT "status" INTO v_status FROM "journal_entries" WHERE "id" = NEW."journalEntryId";
      IF v_status IS NOT NULL THEN
        RAISE EXCEPTION 'LEDGER_IMMUTABLE: no line can be added to a % journal entry (%)', v_status, NEW."journalEntryId"
          USING ERRCODE = 'restrict_violation';
      END IF;
    END IF;
  END IF;
  -- The entry is locked by now, so two writers cannot be given the same number.
  IF TG_OP = 'INSERT' AND (NEW."lineNumber" IS NULL OR NEW."lineNumber" <= 0) THEN
    SELECT COALESCE(max("lineNumber"), 0) + 1 INTO NEW."lineNumber"
      FROM "journal_lines" WHERE "journalEntryId" = NEW."journalEntryId";
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS "journal_entries_guard_trg" ON "journal_entries";
CREATE TRIGGER "journal_entries_guard_trg"
  BEFORE INSERT OR UPDATE OR DELETE ON "journal_entries"
  FOR EACH ROW EXECUTE FUNCTION "journal_entries_guard"();

DROP TRIGGER IF EXISTS "journal_lines_guard_trg" ON "journal_lines";
CREATE TRIGGER "journal_lines_guard_trg"
  BEFORE INSERT OR UPDATE OR DELETE ON "journal_lines"
  FOR EACH ROW EXECUTE FUNCTION "journal_lines_guard"();

COMMIT;
