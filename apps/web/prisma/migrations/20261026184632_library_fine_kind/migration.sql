-- CreateEnum
CREATE TYPE "FineKind" AS ENUM ('LATE', 'DAMAGED', 'LOST', 'OTHER');

-- DropIndex
DROP INDEX "library_fines_borrowingId_key";

-- AlterTable
ALTER TABLE "library_fines" ADD COLUMN     "kind" "FineKind" NOT NULL DEFAULT 'OTHER';

-- CreateIndex
CREATE INDEX "library_fines_borrowingId_idx" ON "library_fines"("borrowingId");
