-- CreateEnum
CREATE TYPE "PendingActionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "pending_actions" (
    "id"              TEXT NOT NULL,
    "entityType"      TEXT NOT NULL,
    "entityId"        TEXT NOT NULL,
    "action"          TEXT NOT NULL,
    "description"     TEXT NOT NULL,
    "requestedByUid"  TEXT NOT NULL,
    "requestedByRole" TEXT NOT NULL,
    "targetState"     JSONB,
    "status"          "PendingActionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUid"   TEXT,
    "reviewedAt"      TIMESTAMP(3),
    "reviewNotes"     TEXT,
    "expiresAt"       TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX "pending_actions_status_idx"           ON "pending_actions"("status");
CREATE INDEX "pending_actions_entityType_entityId_idx" ON "pending_actions"("entityType","entityId");
CREATE INDEX "pending_actions_requestedByUid_idx"   ON "pending_actions"("requestedByUid");
CREATE INDEX "pending_actions_createdAt_idx"        ON "pending_actions"("createdAt");