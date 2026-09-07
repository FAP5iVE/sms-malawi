/*
  Warnings:

  - A unique constraint covering the columns `[academicYear,code]` on the table `fee_structures` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[invoiceNumber]` on the table `invoices` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `code` to the `fee_structures` table without a default value. This is not possible if the table is not empty.
  - Added the required column `invoiceNumber` to the `invoices` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "FeeCategory" AS ENUM ('TUITION', 'TRANSPORT', 'UNIFORM', 'BOARDING', 'LEVY', 'ACTIVITY', 'OTHER');

-- CreateEnum
CREATE TYPE "FeeSchedule" AS ENUM ('PER_TERM', 'ANNUAL', 'ONE_TIME');

-- CreateEnum
CREATE TYPE "FeeCommitmentStatus" AS ENUM ('COMMITTED', 'WAIVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'AIRTEL_MONEY';
ALTER TYPE "PaymentMethod" ADD VALUE 'TNM_MPAMBA';
ALTER TYPE "PaymentMethod" ADD VALUE 'POS_CARD';

-- AlterTable
ALTER TABLE "fee_structures" ADD COLUMN     "category" "FeeCategory" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "mandatory" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "schedule" "FeeSchedule" NOT NULL DEFAULT 'PER_TERM';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "invoiceNumber" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "student_fee_commitments" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "feeStructureId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "status" "FeeCommitmentStatus" NOT NULL DEFAULT 'COMMITTED',
    "notes" TEXT,
    "createdByUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_fee_commitments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_fee_commitments_studentId_idx" ON "student_fee_commitments"("studentId");

-- CreateIndex
CREATE INDEX "student_fee_commitments_academicYear_idx" ON "student_fee_commitments"("academicYear");

-- CreateIndex
CREATE UNIQUE INDEX "student_fee_commitments_studentId_feeStructureId_academicYe_key" ON "student_fee_commitments"("studentId", "feeStructureId", "academicYear");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structures_academicYear_code_key" ON "fee_structures"("academicYear", "code");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceNumber_key" ON "invoices"("invoiceNumber");

-- AddForeignKey
ALTER TABLE "student_fee_commitments" ADD CONSTRAINT "student_fee_commitments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_commitments" ADD CONSTRAINT "student_fee_commitments_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "fee_structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;
