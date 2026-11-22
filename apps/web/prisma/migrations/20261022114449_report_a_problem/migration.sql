-- CreateTable
CREATE TABLE "problem_reports" (
    "id" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "reporterName" TEXT NOT NULL,
    "reporterIdNumber" TEXT NOT NULL,
    "reporterIdType" TEXT NOT NULL,
    "idMatchesAccount" BOOLEAN,
    "message" TEXT NOT NULL,
    "pageUrl" TEXT,
    "associatedIssueId" TEXT,
    "sentryEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "problem_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "problem_reports_createdAt_idx" ON "problem_reports"("createdAt");

-- CreateIndex
CREATE INDEX "problem_reports_uid_idx" ON "problem_reports"("uid");
