-- Finance Hardening Plan P1-04 (A1-F2, A2-F3, UQ-02): one-time journal reversal.
-- ADDITIVE ONLY: four nullable columns, one unique index, one foreign key. No data is read, changed or removed,
-- so the previous version of the code keeps working against this schema. Idempotent.
--
-- reversedAt / reversedByUid / reversalReason  are set on the ORIGINAL entry when it is claimed for reversal.
-- reversalOfId                                 is set on the mirror (reversal) entry and is UNIQUE: an original
--                                              can have at most one reversal, enforced by the database itself.
--
-- Not done here on purpose: existing reversals (references starting 'VOID-') are NOT linked to their originals.
-- `reference` is not unique, so matching on it would be a guess; linking history is the historical repair (P9).

ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "reversalOfId"   TEXT;
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "reversedAt"     TIMESTAMP(3);
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "reversedByUid"  TEXT;
ALTER TABLE "journal_entries" ADD COLUMN IF NOT EXISTS "reversalReason" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "journal_entries_reversalOfId_key" ON "journal_entries"("reversalOfId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'journal_entries_reversalOfId_fkey' AND conrelid = 'journal_entries'::regclass
  ) THEN
    ALTER TABLE "journal_entries"
      ADD CONSTRAINT "journal_entries_reversalOfId_fkey"
      FOREIGN KEY ("reversalOfId") REFERENCES "journal_entries"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
