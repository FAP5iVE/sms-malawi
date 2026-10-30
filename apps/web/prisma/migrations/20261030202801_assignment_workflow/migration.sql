/*
  Warnings:

  - You are about to drop the column `kind` on the `library_fines` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[fileKey]` on the table `assignment_submissions` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[borrowingId]` on the table `library_fines` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "library_fines_borrowingId_idx";

-- AlterTable
ALTER TABLE "assignment_submissions" ADD COLUMN     "feedback" TEXT,
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "markedAt" TIMESTAMP(3),
ADD COLUMN     "markedByUid" TEXT,
ADD COLUMN     "marks" DOUBLE PRECISION,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "recordedByUid" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "marksEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxMarks" INTEGER,
ADD COLUMN     "requirements" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "library_fines" DROP COLUMN "kind";

-- DropEnum
DROP TYPE "FineKind";

-- CreateTable
CREATE TABLE "assignment_attachments" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL DEFAULT 'FILE',
    "uploadedByUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_views" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "firstViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "assignment_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assignment_attachments_fileKey_key" ON "assignment_attachments"("fileKey");

-- CreateIndex
CREATE INDEX "assignment_attachments_assignmentId_idx" ON "assignment_attachments"("assignmentId");

-- CreateIndex
CREATE INDEX "assignment_views_assignmentId_idx" ON "assignment_views"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_views_assignmentId_studentId_key" ON "assignment_views"("assignmentId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_submissions_fileKey_key" ON "assignment_submissions"("fileKey");

-- CreateIndex
CREATE INDEX "assignment_submissions_studentId_idx" ON "assignment_submissions"("studentId");

-- CreateIndex
CREATE INDEX "assignments_classId_dueDate_idx" ON "assignments"("classId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "library_fines_borrowingId_key" ON "library_fines"("borrowingId");

-- AddForeignKey
ALTER TABLE "assignment_attachments" ADD CONSTRAINT "assignment_attachments_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_views" ADD CONSTRAINT "assignment_views_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
