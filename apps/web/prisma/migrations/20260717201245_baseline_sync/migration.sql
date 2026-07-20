/*
  Warnings:

  - A unique constraint covering the columns `[borrowingId]` on the table `library_fines` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `category` on the `budgets` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `role` on the `staff_profiles` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "ClassStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('admin', 'high_rank', 'finance', 'library', 'lower_rank', 'academic', 'hr', 'exam_officer', 'student');

-- CreateEnum
CREATE TYPE "BorrowCondition" AS ENUM ('GOOD', 'DAMAGED', 'LOST');

-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('PREVIEW', 'COMMITTED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "StaffPromotionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "PlacementStatus" AS ENUM ('NOT_STARTED', 'ELIGIBILITY_COMPUTED', 'CHOICES_RECORDED', 'PLACED', 'CONFIRMED', 'DECLINED', 'NOT_PLACED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PayrollStatus" ADD VALUE 'PENDING_APPROVAL';
ALTER TYPE "PayrollStatus" ADD VALUE 'APPROVED';
ALTER TYPE "PayrollStatus" ADD VALUE 'LOCKED';

-- AlterTable
ALTER TABLE "applications" ADD COLUMN     "academicYear" TEXT,
ADD COLUMN     "address" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "guardianAddress" TEXT,
ADD COLUMN     "guardianEmail" TEXT,
ADD COLUMN     "otherNames" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "previousSchool" TEXT,
ADD COLUMN     "reasonForTransfer" TEXT;

-- AlterTable
ALTER TABLE "borrowings" ADD COLUMN     "condition" "BorrowCondition" NOT NULL DEFAULT 'GOOD';

-- AlterTable
ALTER TABLE "budgets" DROP COLUMN "category",
ADD COLUMN     "category" "ExpenseCategory" NOT NULL;

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "status" "ClassStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "library_fines" ADD COLUMN     "borrowingId" TEXT,
ADD COLUMN     "staffId" TEXT,
ADD COLUMN     "waivedAt" TIMESTAMP(3),
ADD COLUMN     "waivedByUid" TEXT,
ALTER COLUMN "studentId" DROP NOT NULL,
ALTER COLUMN "firestoreDocId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "payroll_runs" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedByUid" TEXT,
ADD COLUMN     "submittedByUid" TEXT;

-- AlterTable
ALTER TABLE "staff_profiles" DROP COLUMN "role",
ADD COLUMN     "role" "StaffRole" NOT NULL;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "email" TEXT,
ADD COLUMN     "otherNames" TEXT,
ADD COLUMN     "transcriptKey" TEXT;

-- AlterTable
ALTER TABLE "term_results" ADD COLUMN     "classPosition" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "classTotal" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "user_notification_prefs" ADD COLUMN     "emailPlacementUpdate" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "markedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chart_of_accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "isPosted" BOOLEAN NOT NULL DEFAULT false,
    "postedAt" TIMESTAMP(3),
    "postedByUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "description" TEXT,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_recommendations" (
    "id" TEXT NOT NULL,
    "requestedByUid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "isbn" TEXT,
    "type" TEXT NOT NULL,
    "subject" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedByUid" TEXT,
    "reviewNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fine_waiver_requests" (
    "id" TEXT NOT NULL,
    "fineId" TEXT NOT NULL,
    "requestedByUid" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedByUid" TEXT,
    "reviewNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fine_waiver_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_comments" (
    "id" TEXT NOT NULL,
    "termResultId" TEXT NOT NULL,
    "authorUid" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digital_resource_views" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "viewerUid" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "digital_resource_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grading_scales" (
    "id" TEXT NOT NULL,
    "examType" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "minPercent" INTEGER NOT NULL,
    "maxPercent" INTEGER NOT NULL,
    "pass" BOOLEAN NOT NULL,
    "label" TEXT,
    "displayOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grading_scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_runs" (
    "id" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "status" "PromotionStatus" NOT NULL DEFAULT 'PREVIEW',
    "totalStudents" INTEGER NOT NULL DEFAULT 0,
    "promoted" INTEGER NOT NULL DEFAULT 0,
    "repeated" INTEGER NOT NULL DEFAULT 0,
    "graduated" INTEGER NOT NULL DEFAULT 0,
    "log" JSONB NOT NULL DEFAULT '[]',
    "triggeredBy" TEXT NOT NULL,
    "committedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_promotions" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "fromJobTitle" TEXT NOT NULL,
    "toJobTitle" TEXT NOT NULL,
    "fromSalaryGrade" TEXT,
    "toSalaryGrade" TEXT,
    "fromDepartment" TEXT,
    "toDepartment" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "status" "StaffPromotionStatus" NOT NULL DEFAULT 'PENDING',
    "approvedByUid" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_reviews" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "reviewerUid" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "term" INTEGER,
    "overallScore" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status" "ReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_review_competencies" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "competency" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,

    CONSTRAINT "performance_review_competencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "malawi_public_holidays" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "year" INTEGER NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "malawi_public_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_subscribers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "token" TEXT,
    "unsubscribedAt" TIMESTAMP(3),

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "targetAudience" TEXT NOT NULL DEFAULT 'ALL',
    "eventDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "category" TEXT NOT NULL,
    "createdByUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "university_placements" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "manebRecordId" TEXT NOT NULL,
    "status" "PlacementStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "eligibilityComputedAt" TIMESTAMP(3),
    "placedUniversityId" TEXT,
    "placedProgrammeId" TEXT,
    "placedUniversityName" TEXT,
    "placedProgrammeName" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "recordedByUid" TEXT,
    "verifiedByUid" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "university_placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placement_choices" (
    "id" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "universityId" TEXT,
    "programmeId" TEXT,
    "universityNameFreeText" TEXT,
    "programmeNameFreeText" TEXT,
    "isEligible" BOOLEAN NOT NULL DEFAULT false,
    "score" DOUBLE PRECISION,
    "missingSubjects" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "placement_choices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_records_classId_date_idx" ON "attendance_records"("classId", "date");

-- CreateIndex
CREATE INDEX "attendance_records_studentId_idx" ON "attendance_records"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_studentId_classId_date_key" ON "attendance_records"("studentId", "classId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "chart_of_accounts_code_key" ON "chart_of_accounts"("code");

-- CreateIndex
CREATE INDEX "chart_of_accounts_type_isActive_idx" ON "chart_of_accounts"("type", "isActive");

-- CreateIndex
CREATE INDEX "journal_entries_entryDate_idx" ON "journal_entries"("entryDate");

-- CreateIndex
CREATE INDEX "journal_entries_isPosted_idx" ON "journal_entries"("isPosted");

-- CreateIndex
CREATE INDEX "journal_lines_journalEntryId_idx" ON "journal_lines"("journalEntryId");

-- CreateIndex
CREATE INDEX "journal_lines_accountId_idx" ON "journal_lines"("accountId");

-- CreateIndex
CREATE INDEX "resource_recommendations_status_idx" ON "resource_recommendations"("status");

-- CreateIndex
CREATE INDEX "fine_waiver_requests_fineId_idx" ON "fine_waiver_requests"("fineId");

-- CreateIndex
CREATE INDEX "fine_waiver_requests_status_idx" ON "fine_waiver_requests"("status");

-- CreateIndex
CREATE INDEX "teacher_comments_termResultId_idx" ON "teacher_comments"("termResultId");

-- CreateIndex
CREATE INDEX "digital_resource_views_resourceId_idx" ON "digital_resource_views"("resourceId");

-- CreateIndex
CREATE INDEX "grading_scales_examType_isActive_idx" ON "grading_scales"("examType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "grading_scales_examType_grade_key" ON "grading_scales"("examType", "grade");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_runs_academicYear_key" ON "promotion_runs"("academicYear");

-- CreateIndex
CREATE INDEX "staff_promotions_staffId_status_idx" ON "staff_promotions"("staffId", "status");

-- CreateIndex
CREATE INDEX "performance_reviews_staffId_status_idx" ON "performance_reviews"("staffId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "performance_reviews_staffId_academicYear_term_key" ON "performance_reviews"("staffId", "academicYear", "term");

-- CreateIndex
CREATE INDEX "performance_review_competencies_reviewId_idx" ON "performance_review_competencies"("reviewId");

-- CreateIndex
CREATE INDEX "malawi_public_holidays_year_idx" ON "malawi_public_holidays"("year");

-- CreateIndex
CREATE UNIQUE INDEX "malawi_public_holidays_date_key" ON "malawi_public_holidays"("date");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_email_key" ON "newsletter_subscribers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_token_key" ON "newsletter_subscribers"("token");

-- CreateIndex
CREATE INDEX "newsletter_subscribers_email_idx" ON "newsletter_subscribers"("email");

-- CreateIndex
CREATE INDEX "announcements_published_idx" ON "announcements"("published");

-- CreateIndex
CREATE INDEX "announcements_eventDate_idx" ON "announcements"("eventDate");

-- CreateIndex
CREATE INDEX "calendar_events_startDate_idx" ON "calendar_events"("startDate");

-- CreateIndex
CREATE INDEX "calendar_events_createdByUid_idx" ON "calendar_events"("createdByUid");

-- CreateIndex
CREATE UNIQUE INDEX "university_placements_manebRecordId_key" ON "university_placements"("manebRecordId");

-- CreateIndex
CREATE INDEX "university_placements_studentId_status_idx" ON "university_placements"("studentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "placement_choices_placementId_rank_key" ON "placement_choices"("placementId", "rank");

-- CreateIndex
CREATE INDEX "classes_status_idx" ON "classes"("status");

-- CreateIndex
CREATE UNIQUE INDEX "library_fines_borrowingId_key" ON "library_fines"("borrowingId");

-- CreateIndex
CREATE INDEX "library_fines_staffId_idx" ON "library_fines"("staffId");

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_fines" ADD CONSTRAINT "library_fines_borrowingId_fkey" FOREIGN KEY ("borrowingId") REFERENCES "borrowings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fine_waiver_requests" ADD CONSTRAINT "fine_waiver_requests_fineId_fkey" FOREIGN KEY ("fineId") REFERENCES "library_fines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_comments" ADD CONSTRAINT "teacher_comments_termResultId_fkey" FOREIGN KEY ("termResultId") REFERENCES "term_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_resource_views" ADD CONSTRAINT "digital_resource_views_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "digital_resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_review_competencies" ADD CONSTRAINT "performance_review_competencies_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "performance_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "university_placements" ADD CONSTRAINT "university_placements_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "university_placements" ADD CONSTRAINT "university_placements_manebRecordId_fkey" FOREIGN KEY ("manebRecordId") REFERENCES "maneb_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_choices" ADD CONSTRAINT "placement_choices_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "university_placements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
