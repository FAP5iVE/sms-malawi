-- CreateTable
CREATE TABLE "VercelDeploymentCache" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "target" TEXT,
    "url" TEXT,
    "errorMessage" TEXT,
    "createdAtVercel" TIMESTAMP(3) NOT NULL,
    "readyAtVercel" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VercelDeploymentCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VercelRuntimeLogCache" (
    "id" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "source" TEXT,
    "deploymentId" TEXT,
    "domain" TEXT,
    "requestMethod" TEXT,
    "requestPath" TEXT,
    "responseStatusCode" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VercelRuntimeLogCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VercelRollupStat" (
    "id" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "windowLabel" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VercelRollupStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VercelAlertEvent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "message" TEXT NOT NULL,
    "deploymentId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VercelAlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VercelDeploymentCache_deploymentId_key" ON "VercelDeploymentCache"("deploymentId");

-- CreateIndex
CREATE INDEX "VercelDeploymentCache_state_idx" ON "VercelDeploymentCache"("state");

-- CreateIndex
CREATE UNIQUE INDEX "VercelRuntimeLogCache_rowId_key" ON "VercelRuntimeLogCache"("rowId");

-- CreateIndex
CREATE INDEX "VercelRuntimeLogCache_level_timestamp_idx" ON "VercelRuntimeLogCache"("level", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "VercelRollupStat_metricKey_key" ON "VercelRollupStat"("metricKey");

-- CreateIndex
CREATE INDEX "VercelAlertEvent_kind_acknowledged_idx" ON "VercelAlertEvent"("kind", "acknowledged");
