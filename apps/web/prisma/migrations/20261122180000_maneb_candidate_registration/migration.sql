-- MANEB candidate registration (in-house record). Additive only: two new tables, two new enums
-- and one nullable column. Nothing is renamed or dropped, existing rows are untouched.
-- Rollback: DROP TABLE "maneb_list_locks"; DROP TABLE "maneb_registrations";
--           ALTER TABLE "maneb_records" DROP COLUMN "registrationId";
--           DROP TYPE "ManebRegistrationSource"; DROP TYPE "ManebRegistrationStatus";

-- CreateEnum
CREATE TYPE "ManebRegistrationStatus" AS ENUM ('REGISTERED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ManebRegistrationSource" AS ENUM ('SELF', 'SCHOOL');

-- AlterTable
ALTER TABLE "maneb_records" ADD COLUMN     "registrationId" TEXT;

-- CreateTable
CREATE TABLE "maneb_registrations" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "examType" "ManebExamType" NOT NULL,
    "status" "ManebRegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "registeredVia" "ManebRegistrationSource" NOT NULL DEFAULT 'SCHOOL',
    "candidateNo" TEXT,
    "centerNo" TEXT,
    "invoiceNo" TEXT,
    "feePaidAt" TIMESTAMP(3),
    "subjects" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawnReason" TEXT,

    CONSTRAINT "maneb_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maneb_list_locks" (
    "id" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "examType" "ManebExamType" NOT NULL,
    "lockedById" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maneb_list_locks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maneb_registrations_academicYear_examType_idx" ON "maneb_registrations"("academicYear", "examType");

-- CreateIndex
CREATE UNIQUE INDEX "maneb_registrations_studentId_academicYear_examType_key" ON "maneb_registrations"("studentId", "academicYear", "examType");

-- CreateIndex
CREATE UNIQUE INDEX "maneb_registrations_examType_academicYear_candidateNo_key" ON "maneb_registrations"("examType", "academicYear", "candidateNo");

-- CreateIndex
CREATE UNIQUE INDEX "maneb_list_locks_academicYear_examType_key" ON "maneb_list_locks"("academicYear", "examType");

-- AddForeignKey
ALTER TABLE "maneb_registrations" ADD CONSTRAINT "maneb_registrations_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
