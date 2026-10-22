/*
  Warnings:

  - A unique constraint covering the columns `[classId,subject,academicYear,term,caSlot]` on the table `exams` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "caSlot" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "exams_classId_subject_academicYear_term_caSlot_key" ON "exams"("classId", "subject", "academicYear", "term", "caSlot");
