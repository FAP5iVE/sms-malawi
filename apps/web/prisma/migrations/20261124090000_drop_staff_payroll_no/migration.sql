-- Remove StaffProfile.payrollNo.
-- It was an HR-only free-text field that no payroll, salary or finance code read;
-- payroll runs off the system's own staff and salary records. Idempotent.

ALTER TABLE "staff_profiles" DROP COLUMN IF EXISTS "payrollNo";
