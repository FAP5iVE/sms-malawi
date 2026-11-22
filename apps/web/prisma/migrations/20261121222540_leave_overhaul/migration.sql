/*
  Warnings:

  - The values [GOVERNMENT_POSTED] on the enum `EmploymentCategory` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "EmploymentCategory_new" AS ENUM ('SCHOOL_EMPLOYED', 'COMMUNITY_PAID', 'VOLUNTEER', 'OTHER');
ALTER TABLE "staff_profiles" ALTER COLUMN "employmentCategory" TYPE "EmploymentCategory_new" USING ("employmentCategory"::text::"EmploymentCategory_new");
ALTER TYPE "EmploymentCategory" RENAME TO "EmploymentCategory_old";
ALTER TYPE "EmploymentCategory_new" RENAME TO "EmploymentCategory";
DROP TYPE "public"."EmploymentCategory_old";
COMMIT;

-- AlterTable
ALTER TABLE "leave_requests" ADD COLUMN     "fullPayDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "halfPayDays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unpaidDays" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "payslips" ADD COLUMN     "leaveDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0;
