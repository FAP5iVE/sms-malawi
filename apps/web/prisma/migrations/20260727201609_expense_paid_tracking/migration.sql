-- AlterTable
-- [PRODUCTION FIX 2026-07-27] Vendor/company debt tracking: an APPROVED
-- expense with paid_at NULL represents money owed but not yet paid
-- (posted to ledger account 2000 Accounts Payable). See schema.prisma's
-- Expense model comment for the full flow.
ALTER TABLE "expenses" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "expenses" ADD COLUMN "paidByUid" TEXT;
