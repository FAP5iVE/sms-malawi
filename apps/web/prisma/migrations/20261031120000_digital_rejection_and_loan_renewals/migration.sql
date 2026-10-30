-- AlterTable: a digital resource can now be rejected (kept, with who/when/why) instead of only approved or waiting
ALTER TABLE "digital_resources" ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedByUid" TEXT,
ADD COLUMN     "rejectionReason" TEXT;

-- AlterTable: loans now store how many times they were renewed and when they were last renewed
ALTER TABLE "borrowings" ADD COLUMN     "lastRenewedAt" TIMESTAMP(3),
ADD COLUMN     "renewalCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex: renewal reporting reads loans by last renewal date
CREATE INDEX "borrowings_lastRenewedAt_idx" ON "borrowings"("lastRenewedAt");
