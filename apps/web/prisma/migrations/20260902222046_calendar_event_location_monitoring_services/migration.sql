-- AlterTable
ALTER TABLE "calendar_events" ADD COLUMN     "location" TEXT;

-- CreateTable
CREATE TABLE "MonitoringSyncState" (
    "syncType" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "lastError" TEXT,

    CONSTRAINT "MonitoringSyncState_pkey" PRIMARY KEY ("syncType")
);
