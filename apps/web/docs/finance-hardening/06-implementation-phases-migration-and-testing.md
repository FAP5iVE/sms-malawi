# SMS Malawi — Finance Hardening Plan · Part 6
## Phased implementation, migrations, historical repair, tests, rollout, risks

**Plan only. Nothing here is to be started until the owner says "start", and nothing is pushed or deployed without explicit authorisation (D-29).** Each task states **Backend**, **Frontend/UI**, **Migration**, **Tests** and **Done when**, so the next person never has to guess. Task IDs (`P#-##`) are referenced by Parts 1–5 and the coverage matrix.

---

## 1. Execution rules
1. **One task at a time, one agent, no parallel agents.** Finish a task (code + UI + tests + docs) before the next.
2. **No package installs.** Use `exceljs`, Zod, Prisma `Decimal`, `node:crypto`, vitest, what already exists.
3. **Modify existing files; create new ones only where listed** (justification given).
4. **Expand → backfill → enforce → (later) contract.** Add nullable columns/tables first; backfill; only then add NOT NULL/CHECK/trigger enforcement (`NOT VALID` then `VALIDATE` where Postgres allows). Never drop a column in this programme.
5. **Every task ends with documentation**: append to `apps/web/docs/finance-hardening/IMPLEMENTATION-LOG.md` (**new file, created in P0-05**): what was done, files changed, decisions, what remains, open questions.
6. **Before each phase re-run the V-checks** (Part 1 §9) and diff the finance files against `5c816c0`.
7. **Feature flags** (`finance.v2.*`) gate each module; v1 remains until the phase's go-live gate passes (§7).
8. **Backend, frontend and UI are equal citizens**: a task is not done until its screens exist and are exercised by tests/UAT.

---

## 2. Phase overview

| Phase | Theme | Depends on | Ships independently? | Closes (main) |
|---|---|---|---|---|
| **P0** | Baseline, harness, flags | — | yes (no behaviour change) | X-45; measures real data |
| **P1** | Ledger core + immediate safeguards + permissions | P0 | yes | A1-F1/F2/F3/F9/F10/F11/F14, A2-F2/F3, X-01..X-17 |
| **P2** | Accounts registry, chart v2, mappings, periods, numbering | P1 | yes | A2-F6 (part), A2-MC-03, A2-§5 opening balances |
| **P3** | Receivables (accrual), payments v2, credits, refunds, sponsors | P2 | yes | A1-F4/F5, A2-F1/F5, X-18..X-26 |
| **P4** | Expenses, budgets, procurement, supplier invoices, advances | P2 (P3 not required) | yes | A1-F6/F7/F8, A2-F4, X-27..X-34, X-43 |
| **P5** | Payroll, statutory, loans | P2 | yes | A1-F12/F13, X-35..X-42 |
| **P6** | Library fines (students and staff) | P2 (P1 safeguards already live) | yes | A1-F10/F11, X-02..X-07 |
| **P7** | Cash control: transfers, reconciliation, cashbook | P2, P3 | yes | A1-§10F, A2-F6, A2-MC-01/02 |
| **P8** | Reporting, period close, control centre, (gated) assets/inventory | P3–P7 | yes | A2-MC-09/10/11, A2-§9 |
| **P9** | Historical repair, accrual cutover, go-live | P1–P8 | final | D-05, D-01a |

Order rationale: stop the bleeding first (P1), then give the money a place to land (P2), then correct each flow, then prove it with reconciliation and reporting, and only then repair history using the finished machinery (so repairs use the same engine and are themselves auditable). P6 may be pulled earlier if the owner wants fines fixed sooner; its safeguards (P1-08/09) are already in P1.

---

## 3. Tasks

### Phase P0 — Baseline and safety net (no behaviour change)

**P0-01 Integration-test harness (X-45, D-25)**
- Files: `vitest.config.ts` (add an `integration` project, sequential files), `src/server/__integration__/` **(new folder)** with `harness.ts` (create schema on a **Neon branch** via `TEST_DATABASE_URL`, seed minimal chart/users/periods, `runConcurrently(n, fn)` using separate Prisma clients, failure-injection hooks).
- Why new: existing finance tests mock Prisma (`accountingService.test.ts`, `approvalParity.test.ts`) and cannot prove atomicity or concurrency.
- Tests: a smoke test that two parallel transactions on one row serialise.
- Done when: CI/local command runs the integration project against a throwaway branch; teardown leaves nothing.

**P0-02 Read-only baseline reconciliation (measure the real damage)**
- Backend: a read-only script/admin job producing the **exception inventory** by class (Part 6 §5.3): payments without a matching journal, duplicate journal references, multiply-reversed entries, overpayment misposts, credit-vs-line divergence, budgets with multiple matches, fines paid via the ledger-less route, loans with repayment mismatches, orphan plain-string references, negative balances, etc. No writes.
- Output: CSV/MD report stored under `docs/finance-hardening/baseline/` (no personal data beyond ids). Run against a **copy** of production (OQ: owner provides read access/export).
- Done when: counts and amounts per class are documented; they set expectations for P9 and prioritise P1.

**P0-03 Feature flags and kill switches (D-28)**
- Backend: `SystemSettings` keys `finance.v2.*` (default off) with a helper `isFinanceV2(module)` read once per request; settings route validates and audits changes.
- UI: Settings → Finance → **Feature rollout** (Finance proposes, High Rank approves; shows each module's state and last change).
- Done when: flags toggle code paths in a stub test.

**P0-04 Backup and freeze procedure**
- Doc only: snapshot/branch before each migration; maintenance window rules for P9 (no imports during repair apply). Owner confirms Neon backup/branching capability.

**P0-05 Documentation scaffold**
- Create `IMPLEMENTATION-LOG.md` and a `DECISIONS.md` mirror of D-xx/OQ-xx statuses; each later task appends here.

### Phase P1 — Ledger core, immediate safeguards, permissions

**P1-01 Money utility and Zod money validators (X-11, X-15, X-40, D-11)**
- Files: `src/lib/money.ts` **(new; replaces six ad-hoc roundings)**; `packages/shared/schemas/finance.ts` (`moneyInput`).
- Backend: `add/sub/mul/round2/allocate/sum/compare`; `RecordPaymentSchema` and others use `moneyInput` (≤ 2 dp, bounds).
- Tests: unit tests incl. largest-remainder, half-up, 0.1+0.2.
- Done when: `accountingService` and `feeService` use it (the rest migrate with their phase).

**P1-02 Transaction-aware accounting service (C-11, root cause of A1-F3)**
- Files: `accountingService.ts` (modify in place).
- Backend: `createJournalEntry(tx?, …)`, `postEntry(tx?, …)`, `voidEntry(tx?, …)` use the passed client or open their own; `getTrialBalance`/`ledger` unchanged API.
- Tests: integration — posting inside a caller transaction rolls back with it.

**P1-03 Atomic post claim, exact balancing, atomic balance updates (A1-F1, A2-F2, X-10)**
- Backend: conditional `UPDATE … WHERE id AND status='DRAFT'` (row count 1); remove 0.01 tolerance; deltas in `Decimal`; accounts locked/updated in ascending id with `increment`.
- Tests: **T-03** (concurrent post → exactly one success, balances moved once).

**P1-04 One-time reversal (A1-F2, A2-F3)**
- Migration M02 (columns + UQ-02); Backend: `voidEntry` claim `POSTED → REVERSED`, create mirror with `reversalOfId`, post; `reversalReason` mandatory.
- Tests: **T-04** (second reversal rejected by claim and by unique constraint).

**P1-05 Journal model columns, immutability triggers (A1-DEL, D-12)**
- Migration M02: `entryNumber`, `status`, `entryKind`, `createdByUid`, `sourceType/Id`, `financialTransactionId`, `periodId`; `JournalLine` dims; CHK-01; TRG-01/02/03 (raw SQL) — tested on the Neon branch first (V-03). `createJournalEntry` now stores `createdByUid` (X-09).
- Tests: direct SQL `UPDATE/DELETE` on a posted entry fails; unbalanced post fails at DB level.

**P1-06 Financial register, idempotency, unit of work (D-09, C-02, X-16)**
- Files: `src/server/lib/financialUnitOfWork.ts` **(new)**, `services/financialRegisterService.ts` **(new)**, `middleware/idempotency.ts` (kept; Redis becomes a front filter).
- Migration M01: `financial_transactions`, `idempotency_records`, `sequence_counters`, `job_runs`, `financial_evidence`; UQ-04/05/06.
- Backend: `runFinancialTransaction` per Part 4 §1.1; `registerService.record(tx, …)`.
- Tests: **T-02** (same key → one result; reused key with different body → 422; lost-ack replay).

**P1-07 Posting exceptions and recovery worker (A1-F3, A2-MC-11)**
- Migration M01: `posting_exceptions`. Backend: failed/legacy rows enter the queue; retry worker idempotent by source key; attempts/backoff; critical after N.
- UI foundation: exception list API consumed later by the Control Centre (P8-04); minimal Finance banner now ("N items need attention").

**P1-08 Atomic claims on every existing read-then-update (A1-OP-04/05/06/09/16/17/18, A1-F9/F10/F14, X-04/X-05/X-38/X-44)**
- Files and changes (each uses the §1.3 pattern, inside a transaction, and posts through P1-02/06 where it posts):
  - `routes/finances.ts` + `expenseApprovalService`: **mark-paid** claim; **approve** claim kept and wrapped so budget + journal are in the same transaction.
  - `finances.ts` fine `pay`: status/amount claim (still a stopgap until P6; routes get the claim + register + journal in one transaction now).
  - `libraryWorkflowService.approveFineWaiver`: fine claim `PENDING → WAIVED`.
  - `feeService.applyLatePenalties`: claim `late_penalty = 0`, job lock (`job_runs`).
  - `hrService` loan **approve/disburse** claims (+ `disbursedByUid`), `requestLoan` partial unique (migration with UQ-16 after data check).
  - `assetService` **reconcile/writeOff** claims.
  - `payrollApprovalService` **submit/approve/lock/rollback/return** claims; `lock` posts inside the same transaction (full PR-16 comes in P5).
  - **Interim budget guard (A2-PH1-3):** `updateBudgetSpent` stops smearing — when more than one budget matches year/category(/term), approval is blocked with `AMBIGUOUS_BUDGET`; when none matches it is blocked with `NO_BUDGET` unless a High Rank override reason is recorded. (The exact `budgetId` allocation arrives in P4-01 because it needs a schema change and UI.)
- Tests: concurrent double-submit tests for each (**T-06**, fine pay twice, mark-paid twice, penalty twice, lock twice).

**P1-09 Close fine bypasses now (A1-F11, X-03, X-05, C-04)**
- Backend: `PATCH /library/fines/:id/clear` and `/finances/library-fines/:id/waive` return `410 GONE` with guidance; `libraryService.clearFine` removed from routes (function kept for reference until P6).
- Frontend/UI **in the same change** (otherwise the UI breaks): `useLibrary.ts:415` clear action → "Send to Finance"; `LibraryFinesTab.tsx` Waive → "Request waiver" (uses `/library/fine-waivers`); Finance pay dialog placeholder keeps working with the claim from P1-08.
- Done when: no route changes a fine to PAID/WAIVED except the guarded pay route and the waiver approval.

**P1-10 Permission alignment (D-04, X-01)**
- Files: `packages/shared/types/permissions.ts` (new keys + role mapping per Part 5 §1.3), `routes/finances.ts`, `routes/payroll.ts`, `routes/hr.ts` (loan routes), `routes/library.ts` (fine routes), `finance.v2.permissions` flag.
- Backend: every route converted from `requireRole([...])`/`FINANCE_ROLES` to `requirePermission`; **route-matrix unit test** asserting no finance route lacks `requirePermission`; SoD helper generalised in `lib/selfReview.ts` (SoD-01…15).
- Frontend/UI: `app/(auth)/finances/page.tsx` replaces `isFinance = role === 'finance' || role === 'admin'` and similar with `usePermissions()`; buttons per permission; Admin sees read-only summary/audit/system-health.
- Operational prerequisite: Finance accounts exist for everyone doing finance work (Part 5 §1.5).
- Tests: Admin token denied on all finance writes; High Rank cannot record payments; Finance cannot approve own items.

**P1-11 Synchronous financial audit, append-only (X-17, A2-Phase5)**
- Migration M01: `financial_audit_log` + TRG-05; Files: `auditService.ts` gains `recordFinancial(tx, …)` (no new file); hash chain under a Postgres advisory lock.
- Tests: audit row exists iff the transaction committed; tamper attempts blocked; V-02 resolved.

**P1-12 Retry policy (X-12)**
- Files: `lib/prisma.ts`: `withRetry` documented as read/idempotent only; money services use the unit of work; client sends the same key on retry (UI keeps keys per form).
- Tests: simulated lost acknowledgement → retry replays.

**P1-13 Integrity checker v1**
- Files: `integrityMonitorService.ts` **(new)** — INV-01, 02, 06, 07, 08 first; nightly via the existing cron; writes `PostingException`.
- Done when: running it on the staging copy lists every divergence found in P0-02.

### Phase P2 — Accounts registry, chart v2, mappings, periods, numbering

**P2-01 Chart of Accounts v2 (A1-F5, F13; X-23)**
- Migration M03: columns (`isSystem`, `isPostable`, `parentId`, `statementSection`, `deactivatedAt`). Seed script (extends `seedChartOfAccounts`, idempotent upsert-by-code, never overwrites balances/names of existing accounts).
- UI: Settings → Finance → Chart of Accounts (Part 5 §4.2, list part).

**P2-02 AccountMapping (D-13)**
- Migration M04: `account_mappings`; Backend: resolver (cached per request), validation by key; replaces literal `'1000'`, `'4000'` etc. and `EXPENSE_CATEGORY_ACCOUNT`; `FeeStructure.revenueMappingKey`; initial rows map to the **existing** accounts so behaviour is unchanged until P3.
- UI: Posting Map screen with propose/approve.

**P2-03 Financial account registry — backend (D-03, D-06)**
- Files: `financialAccountService.ts` **(new)**, `routes/financeAccounts.ts` **(new; keeps `finances.ts` from growing past 1,241 lines)**, `lib/fieldCrypto.ts` **(new, `node:crypto` AES-256-GCM; V-05)**, env `FINANCE_DATA_KEY` (owner provisions; key-rotation note in docs).
- Migration M04: `financial_accounts`, `financial_providers`, `financial_account_revisions`; UQ-20/21.
- Backend: create (incl. controlled ledger creation in range), edit, lifecycle SM-18, approvals, revisions, masking, selectable endpoint with workflow/method/currency filters, duplicate fingerprint, archive blockers.
- Tests: dedupe, masking, no ledger duplication on edit, inactive/archived not selectable, history preserved.

**P2-04 Payment Accounts UI (owner's spec §3, §12)**
- Files: `components/settings/FinanceSettings.tsx` (sub-navigation) + `components/settings/finance/PaymentAccounts*.tsx` **(new, extracted to keep file size sane)**; `hooks/useFinancialAccounts.ts` **(new)**.
- UI: Part 5 §4.1 in full (list, category-adaptive form, lifecycle, history, masked/reveal, opening balance entry point).
- Done when: Finance can register bank, wallet, cash and clearing accounts **without a deployment**, High Rank approves, and the account appears in the picker.

**P2-05 Financial periods (D-19)**
- Migration M05: `financial_periods`, `account_period_balances`; TRG-04; Backend `financialPeriodService.ts` **(new)** resolves period on every post; generation from fiscal-year setting (OQ-04).
- UI: Periods screen (list and lock icons; close checklist arrives in P8-03).

**P2-06 Opening balances (A2-§5)**
- Backend: prepare/approve flow posting PR-28 per account; one opening per account.
- UI: Payment Accounts → Opening balance dialog + approvals.

**P2-07 Sequential numbering (X-25, X-26)**
- Files: `invoiceNumberService.ts` gains generic `nextNumber(tx, key, scope)` (no new file); Migration M01 `sequence_counters` already exists; invoice generation switches to the counter.
- Tests: concurrent number allocation yields unique gapless numbers; rollback returns the number.

### Phase P3 — Receivables (accrual), payments v2, credits, refunds, sponsors

**P3-01 Invoice accrual posting and deferred income (D-01, D-01b, PR-01/02)**
- Migration M06: Invoice/LineItem columns (§8.1–8.2), UQ-10. Backend: `feeService.generateInvoice` rewritten per Part 4 §2.1 (Decimal, discount shares via `allocate`, snapshots, register, PR-01); recognition job (`jobs/` extended, claimed via `job_runs`) per PR-02; term-date source resolved (V-06/OQ-08).
- UI: invoice detail recognition badge; bulk preview shows billed/discount/sponsor/credit.
- Tests: **T-01** variants; balanced entries; deferred release sums (INV-24).

**P3-02 Fee → revenue mapping (A1-F5, A2-F5, X-23)**
- Backend: line snapshots; fee catalogue `revenueMappingKey`; penalty mapping (X-22).
- UI: Fee catalogue "Revenue account" field.

**P3-03 Payment v2 (A1-F3/F4/OP-02/§10A, A2-F1/F6; C-01; X-25)**
- Migration M06: Payment/PaymentAllocation columns, UQ-07/08, TRG-07; Backend: `recordPayment` per Part 4 §3.1 (account, method compatibility, reference namespace, idempotency, applied/excess/credit, PR-03, receipt after commit); `RecordPaymentSchema` adds `financialAccountId`, `idempotency` header, bounded `paidAt`.
- UI: Record-payment dialog v2 (Part 5 §4.4), Payments list.
- Tests: **T-01, T-02, T-07 (full rollback on injected failure), T-08 (Airtel account debited)**, duplicate provider reference across invoices rejected, INV-03.

**P3-04 Student credit liability and CreditApplication (X-18, X-19)**
- Migration M07: `student_credits` columns, `credit_applications(+lines)`, CHK-07. Backend: credit claim updates, invoice semantics fix (`totalAmount = Σ lines`), PR-04, manual apply endpoint.
- Tests: two concurrent invoices cannot both consume one credit; line balances equal invoice balance.

**P3-05 Atomic add-line and late penalty (A1-OP-03/04, A1-F14; X-20/21/22)**
- Backend per Part 4 §2.3/2.4; derived OVERDUE.
- Tests: add line concurrent with payment (no lost update); penalty twice.

**P3-06 Payment reversal; invoice void; credit note (A1-§7)**
- Backend/UI per Part 4 §3.2/§2.6; approvals via the Approvals hub adapters (V-14).

**P3-07 Refunds (A2-MC-05, D-22)** — models, workflow, voucher, UI §4.5.

**P3-08 Scholarships and sponsors (A1-§10D, X-24, D-16, D-24)** — models, approval, `SponsorCharge/Payment`, UI §4.6; INV-25.

**P3-09 Installment reconciliation (A1-§10C)** — `InstallmentAllocation`, status PARTIAL, overdue job update, UI.

**P3-10 Receipts and statements v2** — `receiptService.ts`: `RCT` numbers, account display, reversal stamp; `StudentPortalStatementTab` credit/refund display.

### Phase P4 — Expenses, budgets, procurement, supplier invoices, advances

**P4-01 Budget hardening (A1-F6, A2-F4; X-28, X-31, X-33)**
- Migration M08: Budget approval fields, UQ-14, `expense_budget_allocations` (UQ-31). Backend: `budgetService.updateBudgetSpent` replaced by exact-allocation updates; `budgetPosition` (in `budgetService.ts`, no new file) single source; analytics/forecast re-pointed (X-31).
- UI: Budget tab approval status, availability columns; Forecast uses approved only.
- Tests: **T-05** (ICT expense changes only ICT budget; no-match rejected; allocations sum).

**P4-02 Expense lifecycle v2 (A1-F8, EV-A; X-08, X-27, X-32)**
- Backend: `expenseApprovalService` per Part 4 §5.1 (claim + budget lock + allocation + PR-11 in one transaction; no cash at approval); schema: SALARIES blocked; `POST /expenses` stops spreading raw input; evidence rules and immutable evidence.
- UI: Expenses tab (Part 5 §4.7) — approval panel with availability and override.
- Tests: approve twice concurrent; evidence required over threshold; receipt replacement creates superseding row.

**P4-03 Expense payment voucher (A1-F9, CT-04/05)**
- Migration M08: `expense_payments(+allocations)`; Backend: `POST /expenses/:id/payments`, approval above threshold, PR-12; `mark-paid` deprecated to `410` after UI switch.
- UI: Record payment / Approve & pay; voucher PDF.
- Tests: pay twice concurrently → one; partial payments; INV-21.

**P4-04 Commitment lifecycle (A1-F7, §3, OP-11; X-29)**
- Migration M08: UQ-11/12, `BudgetConsumption`, commitment columns. Backend: reserve/commit/consume/release with budget row locks; `releaseCommitment` wired to every cancel/reject/close path.
- Tests: concurrent reservations; PO approval without commitment refused; consume on expense approval.

**P4-05 PO guards (A1-§10B, OP-12; X-34)**
- Migration M08: `PurchaseOrder.purchaseRequisitionId` backfill from quotation→RFQ→requisition (V-08), UQ-13. Backend: single active PO per requisition; PO total re-check.

**P4-06 Supplier invoices and 3-way match (A1-F7, §9; A2-MC-08; C-03; X-46)**
- Files: `supplierInvoiceService.ts` **(new)**, routes in `routes/procurement.ts`; Migration M08 tables (+ `SupplierPaymentDetail`).
- UI: Supplier invoices sub-tab, match panel, supplier payment-details manager.
- Tests: match within/outside tolerance; duplicate invoice number rejected; approval creates the expense with traceability columns.

**P4-07 Procurement → expense bridge** — approving a matched supplier invoice creates the `Expense`, consumes the commitment, writes traceability; GRN completion shows "awaiting invoice" status in Procurement UI.

**P4-08 Asset advances v2 (A1-EV-B, OP-16/17; X-43)** — Migration M11; backend per Part 4 §10; UI reconciliation wizard; PR-14/15.

### Phase P5 — Payroll, statutory, loans

**P5-01 Payroll calculation hardening (A1-F12/F13; X-36, X-40, X-41; C-09)**
- Backend: `payrollService` Decimal + per-payslip rounding, loan deduction cap, negative-net guard, employer pension/other items from settings, component totals; payslip PDF moved out of the DB transaction (X-42). CHK-11.
- UI: Settings → Finance → **Employer costs**; run table columns.
- Tests: net equation; totals = Σ payslips; capped deduction; **T-10**.

**P5-02 Run versioning and atomic transitions (X-39; A1-OP-13/14/15)**
- Migration M09: `version`, VOIDED, UQ-18 *(constraint change)*, TRG-08 for payroll tables. Backend: void/regenerate, `discardStuckRun` → FAILED/VOIDED; claims on every transition.
- UI: version badge, Void/Generate new version.

**P5-03 Payroll posting v2 at lock (A1-F13, A2-§5)**
- Backend: PR-16 from payslip components inside the lock transaction; register event per version; rollback via register link (C-13); loan repayments and fine deductions created in the same transaction.
- UI: lock panel journal preview.
- Tests: **T-11** (lock twice concurrently → one journal); rollback reverses everything; Dr = Cr.

**P5-04 Salary disbursement and confirmation (A1-F13, CT-14; A2-§5)** — Migration M09 tables; backend/UI Part 4 §7.5; PR-18; INV-20.

**P5-05 Statutory remittances (A2-MC-07, D-02)** — `StatutoryRemittance`, due rows created at lock, PR-19, UI Remittances tab; INV-26.

**P5-06 Loan model v2 (A1-F12, OP-18, EV-C; X-37, X-38)** — Migration M09: disbursement/repayment tables, UQ-17; backend per Part 4 §8; `PATCH /hr/loans/:id/repay` → `410`; UI Debts & loans.

**P5-07 Payroll ↔ loan linkage (X-35)** — loan repayment moves from run completion to **lock**; reversed on rollback; INV-11.

**P5-08 Staff fine deduction channel (D-23, optional/off)** — consent model, cap, lock-time posting, UI consent; stays disabled until OQ-12.

### Phase P6 — Library fines (students and staff)

**P6-01 Fine model v2 (A1-F10, OP-09)** — Migration M10: columns/status values/CHK-12/relations; PR-23 at assessment (accrual); `fineNumber`.
**P6-02 Fine payment workflow (D-07; X-02, X-07)** — `LibraryFinePayment`, `POST /finances/library-fines/:id/payments`, SoD-07, account/method rules, receipt `LFP`, reversal; UI Finance dialog (Part 5 §4.9); removal of library's receive/clear permission.
**P6-03 Waiver unification (A1-F11, OP-10; X-04/X-06)** — approval moves to High Rank; transactional approval with fine claim and PR-25; cancel flow; UI waiver inbox, Library request screen.
**P6-04 Staff self-service and clearance (user request)** — `GET /library/fines/mine`, **How to pay** panel from accounts flagged `RECEIVE_FINES`, My library fines screen, HR clearance view; reports (Part 4 §9.6).
- Tests: **fine pay twice**, pay-after-waive refused, waive-after-pay refused, **staff cannot clear own fine**, library role denied receipt/waiver approval, partial payment flag, reversal, reconciliation shows fine receipts on the right account.

### Phase P7 — Cash control

**P7-01 Transfers and settlement (PR-26, OQ-13)** — Migration M12; backend/UI; in-transit; mobile-money settlement shortcut.
**P7-02 Statement import and matching (A1-§10F, A2-MC-01)** — `reconciliationService.ts` **(new)**, `routes/financeReconciliation.ts` **(new)**; `exceljs` CSV/XLSX; hashing; matching algorithm; suspense postings; UI workspace.
**P7-03 Reconciliation sign-off and lock (SM-17)** — preparer ≠ approver; PDF; period-close input.
**P7-04 Cashbook and cash counts (A2-MC-02)** — views and forms.
**P7-05 Verification propagation (A1-EV-D, A2-MC-04)** — payment `verificationStatus`, reports distinguish recorded vs verified.
- Tests: **T-12** reconcile identifies matched/unmatched; re-import blocked; difference must be explained.

### Phase P8 — Reporting, close, control (and gated items)

**P8-01 Ledger statements (A2-MC-10, §7)** — trial balance, income statement, **balance sheet** (six questions), cash flow, ageing; INV-27/28; UI §4.13.
**P8-02 Re-point operational reports (D-26, X-31)** — `financeAnalytics`, `forecastService`, `reportExportService`, dashboards read ledger/register or reconciled sub-ledgers; payroll included in expenses; parallel calculations removed.
**P8-03 Period close (A2-MC-09)** — checklist, snapshots, soft/hard close, reopen with approval; **T-13** (posting blocked, direct SQL blocked).
**P8-04 Control Centre and monitor v2 (A2-MC-11, §9)** — all INV checks, alerts, retry UI, Admin technical view; routes `routes/financeControl.ts` **(new)**.
**P8-05 Fixed assets (gated, D-21, A1-§10E)** — only after OQ-14; capitalisation, depreciation, disposal.
**P8-06 Inventory valuation/variance (gated, D-20)** — only after OQ-15.

### Phase P9 — Historical repair and go-live (see §5)

**P9-01 Scan engine** (`repairService.ts` **(new)**) and Repair console UI (dry-run only).
**P9-02 Class A backfills** (links, applied amounts, snapshots, numbers, register links, loan repayment reconstruction).
**P9-03 Class B adjusting entries** (approved batches).
**P9-04 Accrual cutover** (PR-33) after reconciliation.
**P9-05 Legacy `1000` reclassification** (PR-29) as evidence arrives.
**P9-06 Final verification, UAT sign-off, flag flips, enforcement migration** (NOT VALID → VALIDATE constraints).

---

## 4. Migration sequence (all additive; raw SQL where Prisma cannot express it)

| # | Content | Notes |
|---|---|---|
| M01 | `financial_transactions`, `idempotency_records`, `sequence_counters`, `job_runs`, `financial_evidence`, `posting_exceptions`, `financial_audit_log` + TRG-05/06 | foundation; no existing table touched |
| M02 | `journal_entries`/`journal_lines` columns, `reversal_of_id` unique, CHK-01, TRG-01/02/03 | backfill `entry_number`, `status` from `is_posted` |
| M03 | `chart_of_accounts` columns | |
| M04 | `account_mappings`, `financial_accounts`, `financial_providers`, `financial_account_revisions`, `fee_structures.revenue_mapping_key` | |
| M05 | `financial_periods`, `account_period_balances`, TRG-04 | |
| M06 | invoice/line/payment/allocation columns, UQ-07/08/10, TRG-07 | `NOT NULL`/CHK added later (M13) |
| M07 | credits, credit applications, refunds, sponsors, installment allocation, scholarship columns | |
| M08 | expense/budget/commitment/consumption/supplier-invoice/payment tables, UQ-11/12/13/14/23/24/31 | partial unique indexes via raw SQL (V-03) |
| M09 | payroll columns/tables, loan tables, UQ-16/17/18/19 | UQ-18 replaces `@@unique([month, year])` (constraint change) |
| M10 | fine columns/tables, UQ-29 | |
| M11 | advance tables | |
| M12 | transfers, statements, reconciliation, cash counts | |
| M13 | **enforcement** after repair: CHK-02..CHK-15, NOT NULL on new link columns, FK `Cascade → Restrict`, TRG-07/08 | `NOT VALID` then `VALIDATE` |
| M14 | enum **additions** (`InvoiceStatus.VOID`, `FineStatus.PARTIALLY_PAID/CANCELLED`, `PayrollStatus.VOIDED`, …) | Postgres cannot use a new enum value in the transaction that adds it → **each enum addition is its own migration, placed before the code that uses it** (so in practice M14-a…n precede the phases that need them) |

Practices: each migration is generated, then **hand-reviewed**; raw SQL for triggers/partial/expression indexes; applied first to a Neon branch; the project's existing checksum-repair script is the documented fallback; destructive operations are forbidden.

---

## 5. Historical repair runbook (D-05; owner: "complete available history, correct only the verifiable, flag the rest, audit everything")

### 5.1 Principles
1. **Read-only first.** The scan creates nothing. 2. **Deterministic**: a record is corrected only if a documented rule reproduces the answer from stored facts. 3. **Every change is an adjusting entry or an explicit link**, tagged with the repair run id; nothing is edited in place or deleted. 4. **Approval by High Rank per batch**, scanner ≠ approver (SoD-12). 5. **Reversible as a batch.** 6. **Unverifiable = manual review**, never guessed.

### 5.2 Pre-flight
Snapshot/branch; freeze imports; confirm the `5c816c0` diff; run P0-02 to obtain counts; decide OQ-02 (cutover method/date); gather bank/wallet statements and cash counts for attestation.

### 5.3 Classes
**Class A — mechanical and verifiable (auto-apply after one approval of the rule set)**
| ID | Rule | Verification |
|---|---|---|
| RA-1 | Rebuild `appliedAmount/excessAmount` by **chronological replay per line item** (payments by `paidAt`, allocations in stored order: `applied = min(requested, remaining line balance)`), then `Payment.creditAmount = amount − Σ applied` | Σ applied per line = `lineItem.paidAmount`; Σ `creditAmount` per payment = `StudentCredit.originalAmount` sourced from it; any mismatch → Class C |
| RA-2 | `StudentCredit.paymentId` from `sourcePaymentId` where the payment exists | FK resolves |
| RA-3 | Line snapshots: `feeCategory`/`revenueMappingKey` from `feeStructureId → FeeStructure.category`; penalty lines by name; missing → OTHER flagged | counts |
| RA-4 | Assign sequential numbers (`PMT/RCT/JE/TXN`) in chronological order; initialise counters | uniqueness |
| RA-5 | **Link existing journals to sources** where reference + amount + date match **exactly one** record (expense `EXP-`, settlement `EXP-PAY-`, fine `LIB-`, payroll `PAY-YYYY-M`); payments `PAY-` references are per invoice so match only when the invoice has one payment or amount/date disambiguate | exactly-one rule; else Class C |
| RA-6 | Reconstruct `StaffLoanRepayment` rows from payslips with `loanDeduction > 0` per staff in chronological order | Σ = `StaffLoan.totalRepaid`; over-deduction/clamp cases → Class C |
| RA-7 | Recompute `Budget.spent` from approved expenses with a **unique** matching budget (year/term/department/category) | unique match; else Class C |
| RA-8 | `PurchaseOrder.purchaseRequisitionId` backfill; `Scholarship/LibraryFine` relation orphan check | resolves; orphans → Class C |

**Class B — needs approval; creates adjusting entries**
| ID | Condition | Proposed correction |
|---|---|---|
| RB-1 | Payment with **no journal entry** | Post the missing entry (legacy cash-basis template, dated `paidAt`, `entryKind=BACKFILL`) so the ledger reflects what was recorded |
| RB-2 | **Duplicate posting** (same source posted more than once) | Reversal of the extra entry |
| RB-3 | **Multiply reversed** entry | Reverse the surplus reversal(s) |
| RB-4 | Legacy revenue misclassification (everything to 4000) | Reclass entries by category/period from RA-1 replay (aggregate per period) |
| RB-5 | **Payroll classification**: legacy credit to 2000 for deductions | Reclass to 2110 / 2120 / 1150 by payslip components for locked runs |
| RB-6 | **Payroll never recorded as paid** (legacy lock credits 2100/2000 but no disbursement/remittance ever posts — the ledger cash and liabilities are therefore overstated) | Finance **attests** historic disbursements and remittances with evidence (batch, dates, account); each attested batch posts Dr 2100/2110/2120 / Cr legacy `1000`; unattested remain open liabilities and are flagged |
| RB-7 | Loans **disbursed without a journal** | Attested disbursement: Dr 1150 / Cr legacy `1000` |
| RB-8 | Asset advances without journal | Attested: Dr 1160 / Cr legacy `1000` |
| RB-9 | Cutover entries | PR-33 |
| RB-10 | Legacy `1000` to registered accounts | PR-29 per account with evidence |

**Class C — manual review (never auto-corrected)**
Ambiguous payment↔journal matches; provider references duplicated across invoices; invoices whose lines and total diverge because credit was applied (**which credit?** X-19); fines marked PAID through the ledger-less `/library/fines/:id/clear` route (cash receipt unknown — Finance confirms receipt, then post, otherwise reopen the fine); loans with repayment mismatches or over-deduction; budgets with several matching candidates; expenses with no budget match; duplicate POs per requisition; stale commitments; orphan references; negative balances; any figure that cannot be tied to a bank/wallet statement.

### 5.4 Outputs of a scan
Counts and amounts per rule; per-item evidence (ids, dates, amounts, matched candidates); the **proposed entry** for Class B; control-account vs sub-ledger differences **before** repair; the unresolved Class C list with suggested owner. Stored as a report, immutable.

### 5.5 Apply and verify
Apply per batch after approval → verification report: trial balance still balanced, control accounts vs sub-ledgers **after**, residual differences all in Class C with owners, audit chain intact. A repair run can be reversed wholesale.

### 5.6 Accrual cutover (D-01a, PR-33)
Prerequisite: Class A done, Class B approved, legacy cash attested as far as evidence allows. Preview shows opening entries (open invoice balances split deferred/transition by term start, open credits, pending fines, loans), their effect on each statement, and the transition adjustment in equity. High Rank approves; apply once (`AccrualCutover` APPLIED); flags flip; after two successful month-end closes the legacy-posting code paths are scheduled for removal in a later, separately approved clean-up.

---

## 6. Test plan

### 6.1 Layers
1. **Unit** (vitest, existing style): money, `allocate`, mapping resolver, SoD helper, state machines, normalisation of references, route-matrix permission test.
2. **Integration against a real Postgres branch** (P0-01): every posting/claim path, concurrency (`runConcurrently`), failure injection, trigger enforcement (including raw SQL attempts to alter posted records).
3. **Invariant suite**: after scripted and randomised operation sequences, run INV-01…INV-30 and require zero violations.
4. **UI component tests** for the money dialogs (payment, voucher, fine payment, refund, account form) and permission-based rendering; **UAT scripts** run by Finance and High Rank on staging (§6.4).
5. **Security**: Admin denied on every finance write; IDOR (a student cannot read another's statement/credit); masked fields never serialised to unauthorised roles.

### 6.2 The audit's own test list (A2-§10), mapped and adapted
| ID | Test | Expected |
|---|---|---|
| T-01 | Record a MWK 100,000 payment | Exactly one balanced journal, one register row POSTED, INV-03 holds |
| T-02 | Submit the same payment twice (same key; and different key with same provider reference) | One payment; second returns replay / `DUPLICATE_REFERENCE` |
| T-03 | Post the same journal concurrently | One success |
| T-04 | Reverse the same journal twice | Second rejected |
| T-05 | ICT expense | Only the ICT budget changes; no-match rejected |
| T-06 | Approve an expense twice | Second rejected |
| T-07 | **Fail the accounting step during payment** | **Adapted:** no partial state — payment *and* journal both exist or neither; the client retries safely with the same key. (The audit expected "payment retained + exception"; with posting inside the same database transaction the failure domain is one, so retaining a payment with no entry is exactly the defect we remove. The `PENDING_POSTING/FAILED` recovery path is exercised for legacy rows and bulk jobs.) |
| T-08 | Mobile-money payment | The correct Airtel/TNM account ledger is debited; wrong method/account rejected |
| T-09 | Scholarship | Discount vs sponsor receivable distinct; sponsor payment separate |
| T-10 | Generate payroll | Net equation per payslip; run totals = Σ payslips; capped loan deduction |
| T-11 | Lock payroll twice (concurrent) | One journal |
| T-12 | Reconcile a statement | Matched/unmatched identified; difference explained or written off |
| T-13 | Close a period | Posting blocked, including direct SQL on posted records |
Additional mandatory tests: **fine paid twice**, pay-after-waive, waive-after-pay, staff cannot clear own fine, library role denied receipt/approval, two invoices consuming one credit, add-line vs concurrent payment, late penalty twice, duplicate commitment, second PO for a requisition, loan repayment over balance, payroll rollback reverses loan repayments, evidence replacement, period guard, idempotency lost-ack, hash-chain tamper detection, sequence uniqueness under load.

### 6.3 Automated invariants (A2-INV, extended)
INV-01 … INV-30 (Part 3 §18) run (a) in CI on the integration database after each test file, (b) nightly in production via the integrity monitor.

### 6.4 UAT scripts (staging, real roles)
1. **Counter day (Finance):** record payments by cash, bank, Airtel, TNM, POS, cheque; duplicate reference attempt; overpayment → credit; receipt reprint; reversal request.
2. **Approvals day (High Rank):** approve reversal, refund, expense, expense payment, scholarship, account activation, waiver; attempt self-approval (must fail).
3. **Procurement to payment:** requisition → PO → GRN → supplier invoice (match) → expense approval → voucher → statement line matched.
4. **Payroll month:** run → submit → approve → lock (journal preview) → disburse → remit; rollback attempt after disbursement (blocked).
5. **Library:** assess a staff and a student fine; staff pays at Finance by mobile money; librarian tries to clear (denied); waiver request approved by High Rank; staff views "My library fines".
6. **Month end:** reconcile each account, close checklist, close period, attempt a back-dated posting (blocked), reopen with approval.
7. **Audit and Admin:** Admin attempts finance writes (denied), views audit trail and system health.

### 6.5 Performance and operations checks
Posting latency under typical load; sequence-counter contention; integrity-monitor runtime on production-size data; pagination on large lists; PDF generation after commit does not block the counter.

---

## 7. Rollout and go-live gates

Per module flag `finance.v2.<module>`: **off → staging on → UAT → production on for Finance only → all**. A gate passes only when: all tests (unit, integration, invariants) green; integrity monitor clean on the staging copy; UAT signed by Finance **and** High Rank; backup/branch taken; documentation updated; the owner authorises. **Rollback:** flip the flag off (schema is additive so v1 code still runs). Caveat: entries already created under v2 rules are valid and stay; rollback is therefore for *code paths*, with reconciliation afterwards — fix-forward is preferred once v2 postings exist. The permission flip (P1-10) needs the account-hygiene prerequisite first.

---

## 8. Documentation obligations
Each task appends to `IMPLEMENTATION-LOG.md` (what, files, decisions, remaining, questions). At the end of each phase update Parts 3–5 if reality diverged (with the reason), mark OQ-xx answers, and attach the phase's UAT sign-off. User-facing help text for new screens is written with the screen. Runbooks: key management (`FINANCE_DATA_KEY`), period close, reconciliation, repair, incident response for a `CRITICAL` posting exception.

---

## 9. Risks

| ID | Risk | Mitigation |
|---|---|---|
| R-01 | Hand-written triggers/partial indexes drift with Prisma migrations | V-03 test on a branch; keep raw SQL in migration files; document the checksum-repair fallback |
| R-02 | Interactive-transaction limits on Neon/Vercel | Keep transactions short; PDFs/notifications after commit; bulk work per-item transactions (V-04) |
| R-03 | Sequence-counter contention | Per-key rows; acceptable volume; measure in P2-07 |
| R-04 | Users resist approvals/evidence | Combined "Approve & pay", thresholds as settings, training with UAT scripts |
| R-05 | Historical evidence is incomplete | Class C workflow; residual differences documented, not guessed |
| R-06 | Accountant decisions arrive late (OQ-xx) | Defaults stated; gated tasks (P8-05/06, P5-08) wait; settings-driven |
| R-07 | Admin accounts used for daily finance work | Operational prerequisite before P1-10; Finance accounts provisioned |
| R-08 | Programme size | Phases ship independently behind flags; one task at a time |
| R-09 | Data anomalies larger than expected | P0-02 sizes them early; P9 designed for classes, not counts |
| R-10 | Integrity checks slow on large tables | Set-based SQL, indexes, nightly window, period snapshots |
| R-11 | Receipt/PDF generation after commit fails | Retry and "Reprint"; never affects money |
| R-12 | Legal/statutory uncertainty (staff deductions, employer items) | Settings-driven, off by default, accountant/legal sign-off (OQ-06/12) |
| R-13 | Encryption key loss/rotation | Key held outside the database, rotation runbook, last-4 and fingerprint remain usable |
| R-14 | Reports change from numbers people are used to | Communicate cutover; restatement notes; compare old vs new for two closes |
| R-15 | Super-user/role-switch bypasses SoD | SoD checks use the real identity (V-13) |

---

## 10. Definition of done (whole programme)
- Every point of both audits is implemented, modified or deferred **as recorded in the coverage matrix**, with its tests green.
- INV-01…INV-30 hold in production for two consecutive month-end closes; the Control Centre shows no unexplained exception.
- Every registered financial account reconciles to its statement for the last closed period.
- Payment Accounts are configurable in Settings with no deployment; staff and students pay library fines through the same registered accounts; the library role cannot receive money or approve waivers.
- Admin cannot perform finance writes; Finance, High Rank and Admin each see only what their role allows; every backend capability is visible and works in the UI.
- Historical differences are corrected where verifiable and listed with owners where not, all auditable.
- Documentation (this set, the log, runbooks) is current and a new engineer can continue without guessing.
