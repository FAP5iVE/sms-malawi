-- CreateTable
CREATE TABLE "staff_allowances" (
    "id" TEXT NOT NULL,
    "staffUid" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT true,
    "paidMonth" INTEGER,
    "paidYear" INTEGER,
    "notes" TEXT,
    "createdByUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_allowances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_allowances_staffUid_idx" ON "staff_allowances"("staffUid");

-- CreateIndex
CREATE INDEX "staff_allowances_staffUid_recurring_idx" ON "staff_allowances"("staffUid", "recurring");
