-- [CHANGE TYPE]: NEW FILE (migration)
-- [R-PHASE]: R10 — Finance II: Payroll, Forecasting & the Finance↔Library
--   Reconciliation
-- [PURPOSE]:
--   1. Extends "PayrollStatus" with the approval-workflow states
--      PayrollApprovalPanel.tsx's UI and payrollApprovalService.ts's
--      rebuilt functions require (PENDING_APPROVAL, APPROVED, LOCKED).
--      Postgres requires each new enum value added in its own statement,
--      outside the transaction that uses it — safe here since no row
--      references these values until payrollApprovalService.ts (this same
--      phase) writes them.
--   2. Adds "submittedByUid"/"approvedByUid"/"approvedAt" to
--      "payroll_runs" — the approval workflow's audit trail for those two
--      transitions. (Lock and rollback are audited via logger/auditService
--      rather than dedicated columns — see payrollApprovalService.ts.)
--   3. Makes "library_fines"."firestoreDocId" nullable — Prisma becomes
--      the sole system of record for library fines this phase (the unsafe
--      Prisma-and-Firestore dual write is removed entirely); the column
--      itself is kept, not dropped, pending R11's explicit confirmation
--      of whether the library domain still needs it for anything else.
-- [DEPENDS ON]: apps/web/prisma/schema.prisma (matching changes made in
--   the same change)

ALTER TYPE "PayrollStatus" ADD VALUE 'PENDING_APPROVAL';
ALTER TYPE "PayrollStatus" ADD VALUE 'APPROVED';
ALTER TYPE "PayrollStatus" ADD VALUE 'LOCKED';

ALTER TABLE "payroll_runs" ADD COLUMN "submittedByUid" TEXT;
ALTER TABLE "payroll_runs" ADD COLUMN "approvedByUid" TEXT;
ALTER TABLE "payroll_runs" ADD COLUMN "approvedAt" TIMESTAMP(3);

ALTER TABLE "library_fines" ALTER COLUMN "firestoreDocId" DROP NOT NULL;
