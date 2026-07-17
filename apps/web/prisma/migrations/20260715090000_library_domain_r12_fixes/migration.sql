-- [CHANGE TYPE]: NEW FILE (migration)
-- [R-PHASE]: R12 — Library Domain & the Storage API Contract Fix
-- [PURPOSE]:
--   1. Makes "library_fines"."studentId" nullable — returnBook() (this
--      phase) now creates a LibraryFine row for staff borrowers too, and a
--      staff-borrower fine has no studentId.
--   2. Adds "library_fines"."staffId" — plain, nullable, no foreign-key
--      constraint, mirroring studentId's existing established convention
--      on this table (finances.ts's own comment documents this model has
--      never used a real Prisma relation for the borrower).
--   3. Adds "library_fines"."borrowingId" (unique) plus its foreign key to
--      "borrowings" — formalizes the borrowingId-shaped relation
--      libraryWorkflowService.ts's fine-waiver workflow already assumed
--      existed (referenced as `fine.borrowing` before this fix, which did
--      not compile).
--   4. Drops "digital_resources"."approvedBy" — written only by the
--      now-deleted digitalResourceService.ts; "approvedByUid" (written by
--      the live libraryService.ts) becomes the sole field for this
--      concept.
--   5. Adds "borrowings"."condition" ("BorrowCondition": GOOD/DAMAGED/
--      LOST, default GOOD) — returnBook() (this phase) now persists a
--      real DAMAGED flag instead of collapsing it into the identical
--      RETURNED status a clean return produces.
-- [DEPENDS ON]: apps/web/prisma/schema.prisma (matching changes made in
--   the same change)

CREATE TYPE "BorrowCondition" AS ENUM ('GOOD', 'DAMAGED', 'LOST');
ALTER TABLE "borrowings" ADD COLUMN "condition" "BorrowCondition" NOT NULL DEFAULT 'GOOD';

ALTER TABLE "library_fines" ALTER COLUMN "studentId" DROP NOT NULL;
ALTER TABLE "library_fines" ADD COLUMN "staffId" TEXT;
ALTER TABLE "library_fines" ADD COLUMN "borrowingId" TEXT;

CREATE UNIQUE INDEX "library_fines_borrowingId_key" ON "library_fines"("borrowingId");
CREATE INDEX "library_fines_staffId_idx" ON "library_fines"("staffId");

ALTER TABLE "library_fines"
  ADD CONSTRAINT "library_fines_borrowingId_fkey"
  FOREIGN KEY ("borrowingId") REFERENCES "borrowings"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "digital_resources" DROP COLUMN "approvedBy";
