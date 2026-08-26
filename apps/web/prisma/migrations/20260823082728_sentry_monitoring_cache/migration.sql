-- CreateTable
CREATE TABLE "SentryIssueCache" (
    "id" TEXT NOT NULL,
    "sentryIssueId" TEXT NOT NULL,
    "shortId" TEXT,
    "title" TEXT NOT NULL,
    "culprit" TEXT,
    "level" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "substatus" TEXT,
    "issueCategory" TEXT,
    "isUptimeIssue" BOOLEAN NOT NULL DEFAULT false,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "userCount" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "permalink" TEXT,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SentryIssueCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentryAlertCache" (
    "id" TEXT NOT NULL,
    "sentryAlertId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SentryAlertCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentryRollupStat" (
    "id" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "windowLabel" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentryRollupStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SentryIssueCache_sentryIssueId_key" ON "SentryIssueCache"("sentryIssueId");

-- CreateIndex
CREATE INDEX "SentryIssueCache_status_level_idx" ON "SentryIssueCache"("status", "level");

-- CreateIndex
CREATE INDEX "SentryIssueCache_lastSeenAt_idx" ON "SentryIssueCache"("lastSeenAt");

-- CreateIndex
CREATE INDEX "SentryIssueCache_isUptimeIssue_idx" ON "SentryIssueCache"("isUptimeIssue");

-- CreateIndex
CREATE UNIQUE INDEX "SentryAlertCache_sentryAlertId_key" ON "SentryAlertCache"("sentryAlertId");

-- CreateIndex
CREATE UNIQUE INDEX "SentryRollupStat_metricKey_key" ON "SentryRollupStat"("metricKey");
