# SMS Malawi — Finance Hardening Plan · Part 1
## Verification against the code, corrections to the audits, extra findings, decisions

**Status:** PLAN ONLY. No application code, schema or migration is changed by this document set.
**Verified against:** `FAP5iVE/sms-malawi` at commit `5c816c0` (the same snapshot the two audits cite), checked on 23 Nov 2026.
**Do not push or deploy anything from this plan without explicit written authorisation from the owner.**

### The document set

| File | Contents |
|---|---|
| `01-verification-and-decisions.md` (this file) | How the audits were verified, what the code really does, corrections, extra findings (X-xx), decisions (D-xx), open questions (OQ-xx) |
| `02-audit-coverage-matrix.md` | Every point of both audits → verified? → included / modified / deferred / dropped, with the reason and where it is implemented |
| `03-data-model-and-accounting-spec.md` | Every model/field/constraint/trigger change, Chart of Accounts v2, posting rules (PR-xx), state machines (SM-xx), invariants (INV-xx) |
| `04-workflow-and-service-spec.md` | How each financial workflow runs, transaction boundaries, locking, idempotency, jobs, API catalogue, settings |
| `05-permissions-and-ui-spec.md` | Permission matrix, segregation of duties, every screen, backend-to-UI parity matrix, documents, notifications |
| `06-implementation-phases-migration-and-testing.md` | Phases P0–P9 with task IDs, files, migration order, historical repair runbook, test plan, rollout, risks |

### ID legend used everywhere

`A1-…` = point in audit 1 (*Financial Data Model and Money-Traceability Audit*) · `A2-…` = point in audit 2 (*Vulnerabilities to End*) · `X-…` = extra finding discovered in the repo · `C-…` = correction to an audit statement · `D-…` = decision · `OQ-…` = open question · `PR-…` posting rule · `SM-…` state machine · `INV-…` invariant · `P#-##` implementation task.

---

## 1. Ground rules for whoever implements this

1. **Truth only.** Every behaviour described as "current" was read in the code. Where something could not be proven offline it is marked **(verify)**; the implementer must verify it before relying on it (see §9 checklist).
2. **Soundproof, do not rebuild.** The existing Finance module is kept. All schema changes are additive; legacy columns stay (documented as legacy) until a later, explicitly approved clean-up.
3. **One feature at a time, by one agent.** No parallel agents. Follow the task order in Part 6.
4. **No package installs.** The environment cannot install npm/pnpm packages. Everything here uses what is already in `package.json` (Prisma 6.19.3 + Neon adapter, `exceljs`, Zod, vitest, `node:crypto`, `decimal.js` through Prisma's runtime `Decimal`).
5. **Reuse existing files; create new files only when necessary.** New service files are justified individually in Part 6.
6. **Document as you go.** Each phase ends by updating `apps/web/docs/finance-hardening/` with what was done, decisions taken, what remains and open questions.
7. **Re-verify before each phase.** `main` may move. Re-run the §9 checklist items for that phase against the then-current code.
8. **Nothing is silently deleted or rewritten.** Corrections are made by reversal / adjusting entries with an audit trail.

---

## 2. What was verified, and the limits

**Read in full or in the relevant functions:** `schema.prisma` finance models; `accountingService`, `feeService`, `bulkInvoiceService`, `invoiceNumberService`, `installmentService`, `expenseApprovalService`, `budgetService`, `budgetWindowService`, `procurementService` (PO/commitment parts), `payrollService`, `payrollApprovalService`, `hrService` (loan functions), `assetService` (advances), `libraryService` / `libraryWorkflowService` (fines, waivers), `auditService`, `lib/prisma.ts`, `lib/idempotency-core.ts`, `middleware/idempotency.ts`, `lib/selfReview.ts`, `routes/finances.ts` (all 1,241 lines), `routes/payroll.ts`, `routes/hr.ts` (loan routes), `routes/library.ts` (fine routes), `shared/types/permissions.ts`, `shared/schemas/finance.ts`, finance analytics/forecast/report services, cron routes and jobs, `useFinances.ts`, `LibraryFinesTab.tsx`, `useLibrary.ts`, vitest config and finance tests.

**Limits:** no production database, no bank/mobile-money statements, no running application. Findings are about what the code *permits*. Anything about actual data (how many duplicates exist today) can only be answered by the P0 baseline reports, which this plan schedules first.

---

## 3. The current architecture as verified

### 3.1 Layers and runtime
- Express routers (`server/routes/*`) → services (`server/services/*`) → Prisma 6.19.3 on a **Neon serverless driver adapter** (`lib/prisma.ts`). Next.js on Vercel; one daily cron (`/api/cron/daily-tasks`, 04:00) runs fee reminders, overdue-library notices, contract alerts, installment-check, late-penalties, risk detection sequentially; the individual cron routes also exist.
- **Interactive transactions already work in this environment**: `feeService.recordPayment` uses `prisma.$transaction(async (tx) => …)` with `SELECT … FOR UPDATE` on the invoice row. This is the proven pattern the plan extends.
- `lib/prisma.ts` wraps operations in `withRetry`, whose comment says blind retry is safe because transactions are all-or-nothing. That is **not true when a commit succeeded but its acknowledgement was lost** (see X-12).

### 3.2 Ledger (verified)
- Models: `ChartOfAccount` (15 seeded accounts: 1000 Cash / Bank, 1100 Accounts Receivable, 1200 Library Inventory, 2000 Accounts Payable, 2100 Salaries Payable, 3000 Retained Surplus, 4000 Tuition, 4100 Boarding, 4200 Exam, 4300 Library Fine Revenue, 5000 Salaries, 5100 Utilities, 5200 Maintenance, 5300 Procurement, 5900 Miscellaneous), `JournalEntry {reference, description, entryDate, isPosted, postedAt, postedByUid}`, `JournalLine {accountId, debit, credit}`.
- `JournalEntry` has **no** creator, source type/id, reversal fields, number or period. `reference` is not unique and not indexed.
- `createJournalEntry` / `postEntry` / `voidEntry` use the **global** `prisma` client, not a passed transaction client. `feeService.ts`'s own header comment states this is why journal posting cannot be nested inside the payment transaction. **That is the root cause of A1-F3.**

### 3.3 What posts to the ledger today (verified)

| Workflow | Posts? | Reference used | Posting happens |
|---|---|---|---|
| Student payment | Dr 1000 / Cr 4000 for the *whole* amount | `PAY-{invoiceId last 8}` — **shared by every payment on that invoice** | After the payment transaction; failure only logged |
| Expense approval | Dr expense / Cr 1000 (if `paidImmediately`, default **true**) or Cr 2000 | `EXP-{expenseId last 8}` | After status claim; failure only logged |
| Expense mark-paid | Dr 2000 / Cr 1000 | `EXP-PAY-…` | After unconditional update |
| Library fine pay (`/finances/library-fines/:id/pay`) | Dr 1000 / Cr 4300 | `LIB-…` | After unconditional update |
| Library fine clear (`/library/fines/:id/clear`) | **Nothing** | — | — |
| Payroll lock | Dr 5000 / Cr 2100 / Cr 2000 (all deductions in one line) | `PAY-{year}-{month}` | Before an unconditional status update |
| Invoice creation, late penalty, scholarship, credit, loans, advances, PO/GRN, assets, inventory | **Nothing** | — | — |

### 3.4 Verified route → guard table (`routes/finances.ts`; `FINANCE_ROLES = admin, high_rank, finance`)

| Route | Current guard | Permission matrix says |
|---|---|---|
| `POST /payments` | `admin, finance` | `finance.recordPayment` → **finance only** |
| `POST /expenses`, `POST /expenses/:id/receipt` | `admin, finance` | `finance.createExpense` → finance only |
| `PATCH /expenses/:id/approve` | `admin, high_rank` | `finance.approveExpense` → **high_rank only** |
| `PATCH /expenses/:id/mark-paid` | `admin, finance` | no dedicated key |
| `PATCH /expenses/:id/reject` | `finance.rejectExpense` permission | high_rank |
| `POST /invoices/generate`, `/bulk-generate`, `/:id/line-items` | `admin, finance` | finance |
| `POST /scholarships` | `admin, finance` | finance |
| `POST /budget` | `FINANCE_ROLES` (admin, high_rank, finance) | `manageBudget` finance; `approveBudget` high_rank |
| `POST/PATCH /fee-structures`, `/fee-commitments`, installments, notes | `admin, finance` | finance |
| `POST /library-fines` | `admin, library` | `library.applyFine` library |
| `PATCH /library-fines/:id/pay` | `finance, library` | `finance.clearLibraryFine` finance + library |
| `PATCH /library-fines/:id/waive` | `library` | `finance.waiveFine` library |
| `PATCH /library/fines/:id/clear` | `library.clearFine` | library |
| `PATCH /hr/loans/:id/disburse`, `/repay` | `admin, finance` (disburse) / `admin, finance, hr` (repay) | — |
| Budget windows | `finance.manageBudgetWindows` | finance, high_rank |
| `POST /reports/export` | `admin, finance, high_rank` | admin has no report permission; becomes `finance.viewReports` (finance, high_rank) |

The permission matrix says **admin has no finance write permission** (only `finance.viewSummary`, `finance.viewSystemLogs`). The routes grant it anyway. That mismatch is X-01.

### 3.5 Idempotency (verified)
A Redis/in-memory `idempotent` middleware exists, but it is **fail-open** ("request allowed without idempotency protection" if the store errors), keeps keys **24 hours**, scopes them **per user**, and is applied only to bulk invoice generation, payroll run and one exams route. It is **not** on `POST /payments`, expense approve/mark-paid, fine pay/waive/clear, loan routes or payroll lock. The client helper `newIdempotencyKey()` exists in `lib/api-client.ts` and is used only for bulk invoice generation.

### 3.6 Reporting (verified)
Finance analytics, forecast, report export and several analytics services read `Invoice`, `Payment`, `Expense`, `Budget` directly. Only the "Accounting Ledger" tab reads the ledger. Payroll costs never appear in `Expense`, so "total expenses" excludes payroll while the ledger includes it.

---

## 4. Corrections to the audits (C-xx)

| ID | Audit statement | What the code shows | Effect on the plan |
|---|---|---|---|
| **C-01** | A1-F5 fix: "derive journal lines from `PaymentAllocation`". A2 invariant: *Payment = Allocated + Advance Credit* | `PaymentAllocation.amount` stores the **full requested allocation even when part of it is excess** that also becomes a `StudentCredit` (`appliedToLine = min(amount, balance)` is applied to the line, but the row stores `amount`). So allocations + credit **exceed** the payment, and deriving revenue from allocations would **over-credit**. | Add `appliedAmount` and `excessAmount` to `PaymentAllocation` and `creditAmount` to `Payment` (Doc 3 §8). INV-03 is restated on applied amounts. Historical rows are rebuilt by deterministic replay (Doc 6 §5). |
| **C-02** | A1-§10A / A2 "needs a proper idempotency key" (implies none) | A Redis idempotency layer exists, but it is fail-open, 24 h, per-user and not on money routes (§3.5). | Keep the Redis layer as a fast front line; add a **durable database idempotency record** (`IdempotencyRecord`, Doc 3 §4) that is mandatory for every money-moving endpoint. |
| **C-03** | A1-F7: "`consumeCommitment` has no caller" | True, and it is larger: **no code path creates an `Expense` from a PO or goods receipt at all**. The `Expense` traceability columns (`supplierId`, `purchaseOrderId`, `goodsReceiptId`, `supplierInvoiceNumber`, `procurementSource`, `verifiedByUid/At`) have **no writer** (only a read adapter in approvals). In my search `releaseCommitment` also has no caller. | A procurement→expense bridge (supplier invoice + 3-way match) is built, not just a one-line call (P4-06, P4-07). |
| **C-04** | A1-F10/F11 treat fine payment and waiver as two routes | There are **three** mutation paths: `PATCH /finances/library-fines/:id/pay`, `PATCH /library/fines/:id/clear` (**no journal at all**), and the waive bypass. **The UI itself uses the bypass**: `LibraryFinesTab.tsx` calls `/finances/library-fines/:id/waive`, and `useLibrary.ts:415` calls `/library/fines/:id/clear`. | UI is changed together with the routes (Doc 5 §4.9). |
| **C-05** | A1-§9: "Record payment — Finance/admin role" | The permission matrix gives it to **finance only**; routes add admin. | Enforced by D-04 (X-01). |
| **C-06** | A1-§3: no DB-level uniqueness for active commitments | True. The schema comment says Postgres cannot do it because NULLs are distinct; a **partial unique index** (raw SQL in the migration) can. **(verify)** that Prisma 6.19 `migrate dev` keeps hand-written partial indexes without reporting drift; if it does not, apply with the project's existing migration practice (`fix-migration-checksum.cjs` shows they already edit migration SQL by hand). | UQ-xx catalogue, Doc 3 §15. |
| **C-07** | A1-F4 sample posting credits "Tuition revenue / receivable settlement, as appropriate" | Under the **accrual** decision (D-01) a payment settles **Accounts Receivable**, not revenue. | PR-03 replaces the cash-basis template. |
| **C-08** | A2-F6 "one `1000 Cash / Bank` account" | Correct, but the `PaymentMethod` enum **already has** `CASH, BANK_TRANSFER, MOBILE_MONEY (legacy), CHEQUE, AIRTEL_MONEY, TNM_MPAMBA, POS_CARD`. The method is captured but ignored by posting. | The method enum is kept; the **account** is a separate registry (D-06). Legacy `MOBILE_MONEY` is rejected for new payments. |
| **C-09** | A2-test: "Generate payroll → gross = net + all deductions" | `Payslip.grossSalary` is already net of `leaveDeduction`; PAYE and pension are computed on it. The correct invariant is gross = net + PAYE + pension + loan + other deductions, **and** run totals = Σ payslips. | INV-10. |
| **C-10** | A1-§7 "Generate invoice — Good database-level duplicate protection" | True for the invoice itself (unique student/year/term), but **credit consumption races** and **credit-vs-line-item divergence** exist (X-17, X-18). | P3-04. |
| **C-11** | A1-F1 correction `updateMany where isPosted=false` | Adopted, but alone insufficient: the engine must also accept the caller's transaction (3.2) or the posting still cannot be atomic with the business write. | P1-02, P1-03. |
| **C-12** | A1-F13 "Credit 2000 Accounts Payable for deductions" | Confirmed. Also: the deductions line is omitted when `deductions ≤ 0.01`, and is **derived** as `gross − net` from run totals rather than summed from payslip components, so a component error never shows. | PR-16 posts each component separately and asserts equality. |
| **C-13** | A1-§7 "Approve payroll — concurrency needs atomic claims" | Confirmed; also payroll **rollback** finds the journal to reverse by `reference` (latest posted), not by a stored link. | P5-02, P5-03. |

---

## 5. Extra findings (X-xx) — not in either audit

Each is verified by reading the cited code. "Fix" points to the task that resolves it.

### 5.1 Security and permissions
| ID | Finding | Evidence | Fix |
|---|---|---|---|
| X-01 | **Admin has finance write access through routes** that the permission matrix withholds (payments, expenses, mark-paid, expense approval, scholarships, invoice generation, line items, budgets, fee structures, loan disburse/repay, fines create). | §3.4 | P1-10 |
| X-02 | **One role (`library`) can assess, pay and waive a fine**, and holds both `finance.clearLibraryFine` and `finance.waiveFine`. | permissions.ts; `finances.ts` | P6-02, P6-03 |
| X-03 | **`PATCH /library/fines/:id/clear` marks a fine PAID with no journal entry** and no status guard (`libraryService.clearFine`). | `routes/library.ts:114`, `libraryService.ts` | P1-09 |
| X-04 | `approveFineWaiver` updates the fine **unconditionally** (does not check it is still PENDING): a PAID fine can become WAIVED after cash was posted. | `libraryWorkflowService.ts` | P1-08, P6-03 |
| X-05 | The pay route can pay a WAIVED fine; the waive route can waive a PAID fine (no status guard on either). | `finances.ts` | P1-08 |
| X-06 | Waiver approval permission (`library.waiveFine` / `finance.waiveFine`) sits with the **library** role: the department that raises fines also approves waivers (only requester ≠ approver is checked). | `routes/library.ts:350` | P6-03 |
| X-07 | No check that the person receiving/clearing a fine is not the person who owes it (staff fines; finance officers are staff). **(verify)** no such check exists in the final code. | pay route | P6-02 |
| X-08 | Expense **receipt can be replaced after approval** (`POST /expenses/:id/receipt` has no status check). | `finances.ts` | P4-02 |

### 5.2 Ledger engine
| ID | Finding | Fix |
|---|---|---|
| X-09 | `createJournalEntry` **ignores `actorUid`** when creating (no creator column). | P1-05 |
| X-10 | Balance check allows a **0.01 imbalance tolerance**. | P1-03 |
| X-11 | Per-account deltas are computed with JavaScript `Number` before being applied to `Decimal` columns. | P1-01 |
| X-12 | **`withRetry` can double-execute money operations** (commit succeeded, acknowledgement lost). | P1-12 |
| X-13 | `reference` is not unique/indexed, and the payment reference is **per invoice, not per payment**; it can never be made unique as is, and a payment cannot be tied to its entry reliably. | P1-05, P1-06 |
| X-14 | `entryDate = new Date()` (posting time) rather than the business date (`paidAt`, `incurredAt`). | PR rules use business date |
| X-15 | Money arithmetic is JS `Number` with ad-hoc `Math.round(x*100)/100` throughout (fees, payroll, budgets). | P1-01 |
| X-16 | The Redis idempotency layer is fail-open and absent from money routes (§3.5). | P1-06 |
| X-17 | Financial audit rows are written **outside** the money transaction (queue-based `logAsync`); the `AuditLog` table is **mutable**; whether a failing audit write can surface as an error *after* money posted must be confirmed **(verify)**. | P1-11 |

### 5.3 Receivables
| ID | Finding | Fix |
|---|---|---|
| X-18 | **Student-credit double spend**: credits are read outside the transaction (`computeInvoiceCharges`) and written back as an **absolute** `remaining` value. Two invoice creations for one student can consume the same credit. | P3-04 |
| X-19 | **Credit applied at invoicing reduces `Invoice.totalAmount` but not the line items**, so `Σ lineItem.amount ≠ totalAmount`. A line can show a balance on a PAID invoice, or a payer can pay the lines in full and silently overpay the invoice. Bulk-invoice reporting derives "advance credit consumed" as `subtotal − discount − total`, confirming it. | P3-04 |
| X-20 | `addInvoiceLineItem` writes **stale absolute** `subtotal/total/balance/status` computed from a read outside any lock (lost update against a concurrent payment); duplicate-fee check also outside the transaction and unbacked by a unique index. | P3-05 |
| X-21 | A partial payment recomputes status as PARTIAL/UNPAID, **erasing OVERDUE** (observed in `recordPayment`); penalty eligibility uses stale balance. | P3-05 |
| X-22 | Penalty line has `feeStructureId = null` and a fixed name → no revenue classification possible without a mapping rule. | P2-02, P3-05 |
| X-23 | **`FeeCategory` has no EXAM value** although the chart has `4200 Exam Fee Revenue`; the chart has no accounts for transport, uniform, levy, activity, other. | P2-01, P3-02 |
| X-24 | `CreateScholarshipSchema` allows a **percentage above 100**; multiple active scholarships per student are possible and resolved by `findFirst` (arbitrary); no approval. | P3-08 |
| X-25 | Receipt number is `${prefix}-${paymentId.slice(0,8)}` — not sequential, not guaranteed unique. | P2-07, P3-10 |
| X-26 | Invoice numbers are chosen by lexicographic `max` with 4-digit padding: past 9,999 in a year ordering breaks and generation fails after 5 retries. | P2-07 |

### 5.4 Expenses, budgets, procurement
| ID | Finding | Fix |
|---|---|---|
| X-27 | **Approval = payment by default** (`paidImmediately` defaults to true): cash is credited at approval with no account, reference or proof. | P4-02, P4-03 |
| X-28 | `updateBudgetSpent` **silently does nothing when no budget matches**, ignores term, and there is **no overspend check anywhere**. | P4-01, P4-02 |
| X-29 | Reservation availability (`allocated − Σ active − spent`) is computed then written **without locking** → concurrent reservations can both pass; PO total can exceed the reserved amount without a re-check; a PO can be approved with **no commitment** (silently skipped). | P4-04, P4-05 |
| X-30 | **No procurement→expense bridge** (C-03); `releaseCommitment` has no caller. | P4-06/07 |
| X-31 | **Two budget-position calculations disagree**: `getBudgetVsActual` (uses `Budget.spent`) vs `financeAnalytics.loadBudgetPosition` (live approved expenses by category, `term ≤`). Forecast `projectExpenses` counts **all expenses regardless of status**. | P8-02 |
| X-32 | Expense category `SALARIES` maps to account 5000, so a manual expense can **double count payroll**. | P4-02 |
| X-33 | `Budget` has no uniqueness (year/term/department/category) and no approval fields; any of admin/high_rank/finance can create one. Budget-window status can move between any states. | P4-01 |
| X-34 | `PurchaseOrder` has no direct requisition link (linked only through quotation/RFQ and the commitment) **(verify)** which is why a second PO can re-point the commitment. | P4-05 |

### 5.5 Payroll and loans
| ID | Finding | Fix |
|---|---|---|
| X-35 | **Loan repayments are applied when the payroll run *completes*, before approval or lock, and are never reversed** if the run is rolled back, returned or discarded. | P5-07 |
| X-36 | **Loan deduction is not capped** to outstanding balance or to available net pay: the last month over-deducts from the employee, net pay can go negative, `totalRepaid` inflates (A1-F12 covers only the `totalRepaid` side). | P5-01, P5-06 |
| X-37 | **`PATCH /hr/loans/:id/repay`** lets admin/finance/hr record any repayment (settle a loan) with no payroll link, evidence or cap. | P5-06 |
| X-38 | `disburseLoan` records **no actor**; approve/disburse are read-then-update; `requestLoan` is check-then-create (two active loans possible). | P1-08, P5-06 |
| X-39 | **A wrong payroll cannot be regenerated**: `@@unique([month, year])` plus no recompute path; rollback returns to PENDING_APPROVAL with the same payslips. `discardStuckRun` **hard-deletes** (PROCESSING only). | P5-02 |
| X-40 | PAYE and pension are **unrounded floats**; run totals are summed from unrounded values while payslips are stored rounded → cent drift; the journal derives deductions as `gross − net` from totals. | P5-01 |
| X-41 | **No employer-side contribution** is modelled anywhere (D-02). | P5-01, P5-03, P5-05 |
| X-42 | Payslip PDFs are generated **inside** the payroll database transaction (2-minute timeout). | P5-02 |

### 5.6 Assets, operations, tests
| ID | Finding | Fix |
|---|---|---|
| X-43 | `recordAdvance` has **no cap** against the request/PO value and no limit on repeated advances; the same actor can record and reconcile/write off an advance. | P4-08 |
| X-44 | The daily-tasks cron and the individual cron routes run the **same jobs**; no distributed lock → overlapping executions are possible (late penalties). | P1-08, P8-04 |
| X-45 | Finance unit tests **mock Prisma** (`accountingService.test.ts`, `approvalParity.test.ts`); nothing tests concurrency, atomicity or invariants against a real database. | P0-01 |
| X-46 | `Supplier.bankDetails` is **free text** holding sensitive data. | P4-06 |

---

## 6. Decisions (D-xx)

Source: **User** = given by the owner in this conversation (from the financial advisor/accountant); **Planner** = recommended by this plan; **OPEN** = needs the owner/accountant before the affected phase starts.

| ID | Decision | Source | Rationale / consequence |
|---|---|---|---|
| D-01 | **Accrual architecture**: invoice-time receivables; revenue or deferred-income treatment. | User | Payments settle receivables; overpayments are liabilities. Cash-basis posting is retired (PR-03). |
| D-01a | **Transition method**: opening *cutover entries* at an accrual cutover date, rather than restating every historical entry. History before the cutover keeps its as-posted basis except verified corrections. | Planner / **OPEN** (accountant) | Avoids silently changing previously reported periods. Alternative: back-dated restatement at original dates. See OQ-02. |
| D-01b | **Revenue recognition mode** is a setting: `TERM_START` (deferred until the term start date, default) or `ON_INVOICE`. | Planner / **OPEN** | Needs a reliable term start/end date source **(verify)** (SystemSettings vs calendar). |
| D-02 | **Employer-side statutory costs** (employer pension and other applicable items) recorded separately from employee deductions. | User | Separate expense and payable accounts (PR-16, PR-19). Rates/rules are **settings**, never hardcoded; the accountant supplies the statutory items. |
| D-03 | **Financial accounts are configurable**, not hardcoded: *Settings → Finance → Payment Accounts*. Cash, bank, Airtel Money, TNM Mpamba, POS and cheque-clearing only where actually used. | User | Doc 3 §6, Doc 5 §4.1. |
| D-04 | **Enforce the financial permission matrix.** Finance creates/processes; High Rank oversees/approves; Admin administers the system and users, with no unrestricted finance write. | User | P1-10; Doc 5 §1. |
| D-05 | **Historical repair covers the complete available history**; only reliably reconstructable records are corrected; unverifiable differences go to manual review; every adjustment is auditable. | User | P9; classes A/B/C in Doc 6 §5. |
| D-06 | **Payment method (how) and financial account (where) are stored separately.** A method is never used as an account. | User | `Payment.method` + `Payment.financialAccountId`. |
| D-07 | **Staff library fines follow the same payment/account workflow**; library staff cannot receive payment or approve waivers. | User | Doc 4 §9, P6. |
| D-08 | **Atomic posting is the rule**: the business write, register row, journal entry and balance update commit together. A durable `PENDING/FAILED` posting state plus a recovery queue exists for the cases that cannot be atomic (bulk/long jobs, legacy rows, timeouts). | Planner (satisfies A1-F3, A2-F1) | Interactive transactions already work here. |
| D-09 | **Central `FinancialTransaction` register** connects domain records to journals; domain models stay. | Audit (adopted) | Doc 3 §4. |
| D-10 | **Additive schema only**; legacy columns stay and are documented. | Planner | Safe rollback; no data loss. |
| D-11 | **All finance arithmetic uses `Decimal`** (Prisma runtime), 2 decimal places; rounding **half-up**; allocations use the largest-remainder method. | Planner / **OPEN** (rounding rule, OQ-03) | Removes X-11/X-15/X-40. |
| D-12 | **Journal immutability enforced in the database** (triggers) and balances = Σ posted lines; `ChartOfAccount.balance` remains as a cache verified nightly. | Planner | A1-DEL, A2-Phase5. |
| D-13 | **Existing account codes never renumbered.** New accounts are added; posting rules use **AccountMapping keys**, not hardcoded codes. | Planner | Existing journal lines stay valid. |
| D-14 | **`1000 Cash / Bank` is kept as "Unallocated (legacy)".** Historical postings move to real accounts only through approved reclassification entries with evidence. | Planner | Satisfies "do not infer accounts" (user's registry rules §11). |
| D-15 | **One PO per requisition** initially, enforced; multi-PO needs explicit commitment allocation later. | Planner / **OPEN** (OQ-10) | A1-§10B. |
| D-16 | **One active scholarship per student per academic year**; stacked awards require an explicit later feature. Validate against existing data first. | Planner / **OPEN** | X-24. |
| D-17 | **Approval ≠ payment** for expenses; payment is a separate record with account and evidence. A combined "Approve & record payment" UI action produces both records atomically. | Planner | X-27; A1-§9. |
| D-18 | **Dual control thresholds** are settings (e.g., second approval on expense payments, refunds, transfers above amounts). Manual journals, write-offs, period re-open and historical repair **always** require High Rank approval. | Planner / **OPEN** (amounts, OQ-05) | |
| D-19 | **Monthly financial periods** with a configurable fiscal-year start. | Planner / **OPEN** (OQ-04) | |
| D-20 | **Inventory valuation postings are deferred** until a costing policy exists; large variance write-offs may post to a loss account meanwhile. | Planner / **OPEN** | A1-GL-19/20. |
| D-21 | **Fixed-asset capitalisation and depreciation are included** but gated on an accountant-approved policy. | Planner / **OPEN** | A1-W-E. |
| D-22 | **Refunds** only from an open `StudentCredit` or a reversed payment; always approved; paid from a registered account. | Planner | A2-MC-05. |
| D-23 | **Staff fine payroll deduction** is optional, **off by default**, needs written/recorded consent + HR approval + a cap; legality to be confirmed. | Planner / **OPEN** (OQ-12) | |
| D-24 | **Sponsor receivables are included** (SponsorCharge / SponsorPayment). | Audit (adopted) | A1-§10D. |
| D-25 | **Integration tests run against a real Postgres (Neon branch)**; concurrency tests are mandatory for every claim/posting path. | Planner | X-45. |
| D-26 | **Reports read the ledger or the register**; parallel module calculations are retired or reconciled. | Audit (adopted) | A1-§1, A2-§6. |
| D-27 | **Currency: MWK only.** A `currency` field exists on accounts and transactions, but multi-currency/FX posting is out of scope. | Planner | Registry spec lists currency; FX adds large scope. |
| D-28 | **Staged rollout behind feature flags** (SystemSettings keys `finance.v2.*`), module by module, each with a rollback path. | Planner | Doc 6 §7. |
| D-29 | **No deploy/push without explicit authorisation.** | User | |

---

## 7. Open questions (OQ-xx) — needed before the stated phase begins

| ID | Question | Needed before | Default if unanswered |
|---|---|---|---|
| OQ-01 | Which providers/accounts exist today (banks, wallets, POS, cheque, cash offices)? | P2-04 | Registry starts empty; legacy `1000` remains. |
| OQ-02 | Accrual transition: cutover entries (D-01a) or back-dated restatement? Cutover date? Have financial statements already been issued from the system? | P9-04 | Cutover entries at the start of the current term. |
| OQ-03 | Rounding rule (half-up vs bankers) and whether tambala (cents) are ever collected. | P1-01 | Half-up, 2 dp. |
| OQ-04 | Fiscal year start month; are terms the reporting periods? | P2-05 | Calendar year, monthly periods. |
| OQ-05 | Approval thresholds (expense payment, refund, transfer, write-off, backdating days). | P4-03 | All payments above MWK 0 need a single approver; configurable. |
| OQ-06 | Employer statutory items and their rules/rates; which remittance bodies. | P5-01 | Employer pension % setting only. |
| OQ-07 | Is VAT/withholding tax charged on supplier invoices? | P4-06 | Not modelled; amount fields only. |
| OQ-08 | Term start/end dates: where authoritative? | P3-01 | Use SystemSettings term dates if present **(verify)**. |
| OQ-09 | Should loan interest be recognised when collected or accrued? | P5-06 | When collected. |
| OQ-10 | Are split POs per requisition ever needed? | P4-05 | No (D-15). |
| OQ-11 | Credit expiry/refund policy for student credit. | P3-07 | No expiry; refund by approval. |
| OQ-12 | Is salary deduction for library fines lawful/acceptable at the school? | P5-08 | Feature stays off. |
| OQ-13 | Cheque handling: when is a cheque "received" vs "cleared"; bounced-cheque fee? | P7-01 | Receive into cheque-clearing account; reclass on clearing. |
| OQ-14 | Fixed-asset policy: capitalisation threshold, depreciation method/rates. | P8-05 | Not started. |
| OQ-15 | Inventory costing method and which stores are valued. | P8-06 | Not started. |
| OQ-16 | Record retention period for financial history and evidence files. | P8 | 7 years, no auto-purge. |
| OQ-17 | Staff payment details for payroll disbursement (bank/wallet) — captured where? **(verify)** staff profile fields. | P5-04 | Disbursement records by batch/account, not per staff account. |
| OQ-18 | Do student fines ever get added to the next invoice? | P6 | No (deferred). |

---

## 8. Principles the whole plan obeys

1. Every financial event has a **source record, a register row, a journal entry, an audit row and (where money moves) a registered financial account**.
2. **Claim, then act.** Every state transition is a conditional update inside the transaction (`WHERE id AND status = expected`); only the request that changes one row proceeds.
3. **Money moves only through the register.** No service writes a journal entry directly.
4. **Corrections are new records**, never edits or deletes of posted ones.
5. **Backend capability ⇒ visible, functional UI** for the right role (Doc 5 §3).
6. **Balances are derived from posted ledger lines**; any cached balance is verified automatically.
7. **Evidence is mandatory where money leaves the school.**
8. **The database is the last line of defence**: unique indexes, check constraints and triggers back every rule the application states.

---

## 9. Verification checklist the implementer re-runs (V-xx)

| ID | Re-verify before | Check |
|---|---|---|
| V-01 | P1 | `accountingService` still uses global `prisma`; `postEntry` check still outside the transaction. |
| V-02 | P1 | Whether a failing `auditService` write after a posted expense/payment can throw (X-17). |
| V-03 | P1 | Hand-written partial indexes and triggers survive `prisma migrate dev` / deploy in this project (C-06). |
| V-04 | P1 | `Prisma $transaction` timeout and maximum duration on the Neon adapter under Vercel limits. |
| V-05 | P2 | Existing helper for encrypting values at rest (none found in `src/lib`); the plan uses `node:crypto`. |
| V-06 | P3 | Where term start/end dates live (OQ-08). |
| V-07 | P3 | Whether `feeService` still sets line `amount` net of discount share (verified now). |
| V-08 | P4 | PO↔requisition link path (X-34); whether jobs create fines repeatedly (to decide the `(borrowingId, kind)` unique index). |
| V-09 | P5 | Staff payment-detail fields (OQ-17); where `monthlyLoanDeduction` is set. |
| V-10 | P6 | All UI callers of fine pay/clear/waive (`useLibrary.ts`, `LibraryFinesTab.tsx`, any parent/student views). |
| V-11 | P7 | `exceljs` can read CSV statements in this runtime. |
| V-12 | All | Repo commit differs from `5c816c0`? If yes, diff the finance files first. |
| V-13 | P1 | The super-user / role-switch mechanism (`SuperUserRoleSwitcher`, and any role that passes every approval gate) must **not** bypass permission checks or segregation of duties; read how it resolves identity before P1-10. |
| V-14 | P3 | How the Approvals hub adapters (`approvals/financeAdapters`) register new approval types, so new approvals (reversal, refund, expense payment, waiver, account, budget, scholarship, transfer, reconciliation, period close, journal, repair) appear in the existing inbox. |
