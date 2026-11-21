-- AlterTable
ALTER TABLE "guardian_profiles" ADD COLUMN     "nationalId" TEXT;

-- CreateIndex
CREATE INDEX "guardian_access_logs_createdAt_idx" ON "guardian_access_logs"("createdAt");

-- CreateIndex
CREATE INDEX "guardian_profiles_nationalId_idx" ON "guardian_profiles"("nationalId");
