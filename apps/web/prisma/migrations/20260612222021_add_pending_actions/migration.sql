-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('PREVIEW', 'COMMITTED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "StaffPromotionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACKNOWLEDGED');

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
ALTER TABLE "digital_resources" ADD COLUMN     "approvedBy" TEXT;

-- AlterTable
ALTER TABLE "library_fines" ADD COLUMN     "waivedAt" TIMESTAMP(3),
ADD COLUMN     "waivedByUid" TEXT;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "riskLevel" TEXT DEFAULT 'NONE',
ADD COLUMN     "transcriptKey" TEXT;

-- AlterTable
ALTER TABLE "term_results" ADD COLUMN     "classPosition" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "classTotal" INTEGER NOT NULL DEFAULT 0;

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

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fine_waiver_requests" ADD CONSTRAINT "fine_waiver_requests_fineId_fkey" FOREIGN KEY ("fineId") REFERENCES "library_fines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_resource_views" ADD CONSTRAINT "digital_resource_views_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "digital_resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_review_competencies" ADD CONSTRAINT "performance_review_competencies_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "performance_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
