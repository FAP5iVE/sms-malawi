# SMS Malawi — Finance Hardening Plan · Part 4
## Workflows, services, transaction boundaries, jobs, API catalogue, settings

**Plan only.** Service names refer to existing files in `apps/web/src/server/services/` unless marked **(new)**. New files are kept to the minimum and each is justified in Part 6. Models, posting rules (PR-xx), state machines (SM-xx) and invariants (INV-xx) are defined in Part 3.

---

## 1. Cross-cutting patterns (apply to every workflow)

### 1.1 The financial unit of work — `runFinancialTransaction` **(new, `server/lib/financialUnitOfWork.ts`)**
Every money-moving operation runs through one helper wrapping `prisma.$transaction(async (tx) => …, { maxWait, timeout })` (the same interactive-transaction pattern `feeService.recordPayment` already uses on Neon):

1. **Idempotency claim.** Insert `IdempotencyRecord(scope, key, requestHash, IN_PROGRESS)`. On unique violation: `COMPLETED` + same hash → return the stored response (HTTP 200, header `Idempotent-Replay: true`); different hash → `422 IDEMPOTENCY_KEY_REUSED`; `IN_PROGRESS` → `409 IN_PROGRESS`.
2. **Guards** (inside the transaction): actor permission re-check, **segregation rule**, period open for the business date, account/method compatibility, evidence rules, limits.
3. **Domain write** using conditional updates (§1.3).
4. **Register + journal**: `registerService.record(tx, {type, source, eventKey, amount, financialAccountId, occurredAt, …})` then `accountingService.createJournalEntry(tx, …)` and `postEntry(tx, …)`; the register row is set `POSTED` with the journal id.
5. **Audit**: `financialAudit.record(tx, …)` (§14 of Part 3).
6. **Complete idempotency** with the response body; commit.

A failure anywhere rolls **everything** back, including the idempotency row, so the client can retry the same key. If the commit succeeded but the acknowledgement was lost (X-12), the retry hits the stored `COMPLETED` record and replays — no duplicate.

**Clients must send an `Idempotency-Key` header on every money endpoint** (server returns `400 IDEMPOTENCY_KEY_REQUIRED` otherwise). The existing `newIdempotencyKey()` helper in `lib/api-client.ts` generates one **per form submission** and keeps it until success or explicit user cancel (so a double click or reload re-sends the same key).

### 1.2 Lock order (deadlock avoidance)
Always acquire in this order: idempotency row → aggregate rows `FOR UPDATE` (invoice; budget; loan; payroll run; fine; commitment) in **ascending id** → child rows → `chart_of_accounts` rows ascending id at posting. No service takes locks in another order.

### 1.3 Claim-then-act (compare-and-set)
Template: `UPDATE <table> SET status = $new, … WHERE id = $id AND status = $expected [AND <guards>]` and **require `rowCount = 1`**, else `409 STATE_CONFLICT` with the current state. Replaces every read-then-update listed in A1-§7 (post, reverse, mark-paid, fine pay, waive, late penalty, commitment, payroll approve/lock/rollback, advance reconcile/write-off, loan approve/disburse/repay).

### 1.4 Error taxonomy
`400 VALIDATION_ERROR` · `400 IDEMPOTENCY_KEY_REQUIRED` · `403 FORBIDDEN` · `404 NOT_FOUND` · `409 STATE_CONFLICT | ALREADY_POSTED | ALREADY_REVERSED | IN_PROGRESS` · `422 SEGREGATION_VIOLATION | PERIOD_CLOSED | ACCOUNT_INCOMPATIBLE | ACCOUNT_INACTIVE | DUPLICATE_REFERENCE | EVIDENCE_REQUIRED | OVER_LIMIT | INSUFFICIENT_BUDGET | IDEMPOTENCY_KEY_REUSED | UNBALANCED` · `503 RETRYABLE`. Body: `{ error, code, details }`. The UI maps each code to a plain-language message (Doc 5 §2.6).

### 1.5 Retry policy (X-12)
`withRetry` stays for **reads and idempotent non-financial writes** only. Money transactions are **not** blindly retried server-side; retries come from the client with the same idempotency key. A dropped connection during a money transaction returns `503 RETRYABLE` and the UI re-submits with the same key.

### 1.6 Evidence upload flow
Upload first (existing `uploadFile` with `FILE_PREFIX`), receive `{fileKey, sha256, size, mime}`, then submit it with the business request; the transaction inserts the `FinancialEvidence` row. Orphan uploads (never attached) are swept after 7 days. Evidence is **never replaced in place** (superseding row, TRG-06).

### 1.7 Jobs and the distributed claim
Vercel cron currently runs one `daily-tasks` plus individual cron routes that run the same jobs (X-44). Every finance job claims its window first: `JobRun(jobName, windowKey)` unique insert (new tiny model) — a second overlapping invocation fails the insert and exits. Jobs: deferred-income release (daily), late penalties (daily), integrity monitor (nightly), posting retry (every run of daily-tasks **and** an on-demand "Retry now" action; **(verify)** whether `vercel.json` plan allows more than one cron schedule), statutory-due marking, evidence existence check.

### 1.8 Feature flags (D-28)
`SystemSettings` keys `finance.v2.ledgerEngine`, `.accountsRegistry`, `.receivables`, `.expenses`, `.payroll`, `.loans`, `.fines`, `.reconciliation`, `.reports`. A module runs v1 or v2 code paths per flag; the flip is a deliberate, audited step (Part 6 §7). v1 paths keep working until their phase's go-live gate passes.

### 1.9 Read models
Every screen/report reads either **posted ledger lines** or the **register**, or a sub-ledger that is reconciled to its control account (INV-09). `budgetPositionService` (one implementation) replaces the two divergent budget calculations (X-31).

---

## 2. Fees and invoicing (A1-F5, F14, OP-01/03/04, A2-F5; X-18..X-23; P3)

### 2.1 Generate invoice (single) — `feeService.generateInvoice`
Per invoice, one `runFinancialTransaction`:
1. Unique `(student, year, term)` (existing) → `409` if exists.
2. Resolve fees (existing eligibility/commitment logic). Resolve the student's **approved, active** scholarship (SM-21).
3. Compute with `Decimal`: gross per fee; `discount = min(discount, subtotal)`; **discount shares by `allocate()`** (largest remainder); line `amount = gross − share`; store `grossAmount`, `discountShare`, `kind=FEE`, `feeCategory`, **snapshot `revenueMappingKey`** (FeeStructure override → category default).
4. **Credit application is a claim**: for each open credit, oldest first, `UPDATE student_credits SET amount = amount − $x WHERE id=$id AND amount >= $x` (row count 1) — no pre-transaction read, no absolute write (X-18). Each use inserts `CreditApplication` + `CreditApplicationLine`; lines and invoice `paidAmount` rise; `totalAmount` stays `Σ lines` (X-19). Posts PR-04.
5. Invoice number from the counter (Part 3 §2.2). `recognitionDate` per D-01b. Insert invoice and lines.
6. Sponsor-funded award → create `SponsorCharge` (INV-25).
7. Register + **PR-01** (deferred if `recognitionDate` is in the future). Audit.

### 2.2 Bulk generation — `bulkInvoiceService`
Preview unchanged in behaviour but reports **billed** (not "revenue"). Execution loops students, **one transaction per invoice** (never one giant transaction), each with idempotency key `bulk:{runKey}:{studentId}`; the existing route-level `idempotent` middleware remains. Result lists created / skipped (already exists) / failed with reasons; failures never abort the run; re-running the same `runKey` is safe.

### 2.3 Add line item — `feeService.addInvoiceLineItem` (X-20, A1-OP-03)
In one transaction: `SELECT … FOR UPDATE` the invoice; duplicate fee guarded by UQ-10 (catch → `409 DUPLICATE_LINE`); totals updated with **`increment`** of `Decimal` values on the locked row (never stale absolutes); register + PR-09; `INV-02` re-checked in the same transaction.

### 2.4 Late penalty — `applyLatePenalties` (A1-F14, OP-04)
Job claim (§1.7). For each candidate: one transaction → **claim** `UPDATE invoices SET late_penalty = $p, … WHERE id=$id AND late_penalty = 0 AND balance > 0 AND status IN ('UNPAID','PARTIAL')` (row count 1; penalty computed from the *locked* balance) → insert `kind=LATE_PENALTY` line (mapping `REVENUE.PENALTY`) → PR-08. OVERDUE is derived (X-21). Two overlapping runs cannot both claim.

### 2.5 Revenue recognition job (PR-02)
Daily: for lines with `recognisedAmount < amount` and `recognitionDate ≤ today`, one register event per `(INVOICE, id, RELEASE:{lineId})`; INV-24.

### 2.6 Invoice void / credit note (A1-§7)
- **Void** (`finance.voidInvoice`, High Rank approval): allowed only if `paidAmount = 0` and no credit applications (reverse those first). PR-07; status VOID; invoice/lines kept.
- **Credit note** (`ADJUSTMENT` line, negative): reason + approval; PR-09; cannot reduce below `paidAmount` (the excess becomes student credit through a normal refund/credit path).

### 2.7 Fee catalogue
Editing a fee never alters existing invoices (lines snapshot). The catalogue form gains an optional **Revenue account** picker (`revenueMappingKey`), validated against `AccountMapping`.

---

## 3. Student payments and receipts (A1-F3/F4/F5/OP-02, §10A, EV-D; A2-F1/F5/F6; C-01; X-25)

### 3.1 `recordPayment` — algorithm (one transaction, all-or-nothing)
**Input:** `invoiceId`, `amount`, `method`, **`financialAccountId`**, `reference` (required unless CASH), `paidAt` (business date), `allocations?`, `payerName?`, `methodDetails?`, `notes?`, `evidence[]?`, header `Idempotency-Key`.

1. Idempotency claim (§1.1).
2. **Validate**: `amount > 0`, ≤ 2 dp, ≤ configured maximum; `paidAt` not in the future, within the back-dating window (`finance.payment.maxBackdateDays`; further back needs High Rank approval path), **period OPEN**; method is not legacy `MOBILE_MONEY`.
3. **Account checks**: account exists, `ACTIVE`, `RECEIVE_STUDENT_PAYMENTS ∈ allowedUses`, `currency = MWK`, `method ∈ supportedMethods`.
4. **Reference**: normalise (trim, upper-case, strip separators); compute `referenceNamespace` (Part 3 §6.3); the unique index UQ-08 rejects a reused provider reference **across all invoices** (`409 DUPLICATE_REFERENCE`, message names the existing receipt). The two-minute same-amount heuristic (A1-§10A) is replaced by this plus idempotency; a *soft* warning (same invoice, amount, method within 10 minutes, no reference) needs `confirmPossibleDuplicate = true`.
5. `SELECT … FOR UPDATE` the invoice; reject `VOID`.
6. **Allocation** (Decimal): explicit allocations validated against line balances; default allocation = oldest/fee-priority order (existing rules). For each line `applied = min(requested, line.balance)`; `excess` per line = `requested − applied`. `creditAmount = excess + unallocated remainder`. **Invariant check:** `amount = Σ applied + creditAmount` (INV-03) or abort.
7. Insert `Payment` (`paymentNumber`, `financialAccountId`, `creditAmount`, normalised reference), `PaymentAllocation` rows (legacy `amount` = requested, `appliedAmount`, `excessAmount`), update lines/invoice with increments, insert `StudentCredit` (`paymentId` FK) for `creditAmount`, update instalments (§4.5).
8. **Register + PR-03**: Dr account ledger / Cr AR.STUDENT (Σ applied) / Cr Student Credit Liability (creditAmount). Entry date = `paidAt`.
9. Evidence rows; audit; complete idempotency; commit.
10. **After commit (not part of the money transaction):** generate the receipt PDF (`RCT` number, account display name, method, masked reference, amount, balance, status), store `receiptKey`; failure here never affects the money and is retried on demand ("Reprint receipt"). Notifications (guardian) are queued.

A failed posting can no longer leave a payment without a journal: posting is inside step 8. The `PENDING_POSTING/FAILED` states exist only for legacy rows and for bulk/long operations (D-08).

### 3.2 Payment reversal (SM-03, PR-06; A1-§7 gap "no refunds/reversals")
1. Finance requests reversal (`finance.reversePayment`) with reason and evidence.
2. High Rank approves (`finance.approveReversal`), never the same person.
3. Executes in one transaction: CAS `RECORDED → REVERSED`; reverse allocations (lines, invoice, instalments); if the payment's credit is untouched mark it `REVERSED`, otherwise **block** with a message naming the credit applications/refunds to undo first; register `REVERSAL` event; journal reversal via the engine (second reversal impossible, UQ-02); receipt marked reversed (watermark on reprint); bounced cheque path uses the same flow.
4. UI shows the reversal chain on the payment and on the invoice timeline.

### 3.3 Verification state (A1-EV-D, A2-MC-04)
A payment starts `UNVERIFIED`. Reconciliation (§11) sets `MATCHED` when a statement line is matched; Finance can mark `DISPUTED`. Reports and the Control Centre distinguish **recorded** from **verified** money; a generated receipt is documented as "recorded", never as proof of settlement.

### 3.4 Receipts
`RCT-YYYY-000000` sequential; shows the receiving account's **display name and last four digits only**; statuses RECORDED / REVERSED; same letterhead as other documents. Receipts for reversed payments stay reprintable with a reversal stamp.

---

## 4. Credits, refunds, scholarships, sponsors, instalments (A1-F4, §10C/D, EV-D; A2-MC-05/06)

### 4.1 Student credit
Created only by PR-03 (excess). Visible to the student statement and to Finance. Applied automatically at invoicing (§2.1) or manually (`finance.applyCredit`) to an open invoice (PR-04). Never counted as revenue.

### 4.2 Refunds (D-22, SM-15)
Request (Finance) → approve (High Rank; amount ≤ credit remaining or the reversed payment) → pay (a third person where staffing allows; at minimum ≠ approver) from a registered account with reference/evidence. Posting PR-05; credit `refundedAmount` updated with a claim; INV-04. Printable refund voucher.

### 4.3 Scholarships (A1-§10D, X-24)
Draft (Finance) → submit → approve (High Rank) — **only APPROVED, active awards reach invoices**. Validation: percentage ≤ 100; one active per student/year (D-16); sponsor-funded requires `sponsorId` and an uploaded award agreement (`SPONSOR_AGREEMENT` evidence). Sponsor-funded discount creates `SponsorCharge` at invoicing; **sponsor payments** (`SponsorPayment`, PR-10) are recorded separately and allocated to charges; unmatched amounts sit in the sponsor-advance liability. A sponsor **award** and a sponsor **payment** are never conflated.

### 4.4 Sponsor register
Sponsors have a screen (balance outstanding, charges, payments, statement); statements reconcile to account 1120 (INV-09).

### 4.5 Instalments (A1-§10C)
At payment time, after line allocation, the applied amount is allocated to the earliest unpaid instalments (`InstallmentAllocation`); an instalment is `PAID` when fully allocated (sets `paidAt`), `PARTIAL` otherwise. The overdue job considers *remaining* amounts. A plan's total must equal the invoice balance at creation (INV-23).

---

## 5. Expenses, supplier invoices, supplier payments (A1-F8/F9/OP-07/08, EV-A, §9; A2-F4, MC-08; X-27..X-34)

### 5.1 Expense lifecycle (SM-05)
1. **Create** (`finance.createExpense`): category (SALARIES blocked, X-32), description, amount, `incurredAt`, term/year, department, **budgetId or budget allocations**, supplier or payee, procurement links (PO, goods receipt, supplier invoice) where applicable, evidence. Evidence rules (settings): receipt/invoice mandatory above `finance.expense.evidenceThreshold`; PO-linked expenses require a completed GRN (or an explicit emergency flag with reason).
2. **Approve** (`finance.approveExpense`, High Rank, ≠ creator; `assertNotSelfReview` generalised): one transaction → CAS `PENDING → APPROVED`; lock each budget row; verify the allocation sums to the expense amount and **availability ≥ allocation** (`INSUFFICIENT_BUDGET` unless a High Rank override reason is given, which is audited); insert `ExpenseBudgetAllocation`; update `Budget.spent` by increment on **exact budget ids** (A1-F6); if linked to a commitment → `BudgetConsumption` (partial) (A1-F7); register + **PR-11** (Dr expense / Cr AP). **No cash is credited at approval** (X-27).
3. **Reject** (High Rank, reason).
4. **Pay** (§5.2).
5. **Edits** only while `PENDING` by the creator; after approval only by reversal (PR-13, approval) and re-entry. **Evidence cannot be replaced after approval** (X-08); new evidence supersedes with history.

### 5.2 Expense/supplier payment (voucher) — replaces `PATCH /expenses/:id/mark-paid`
`POST /finances/expenses/:id/payments` (or against a supplier invoice / several expenses): `method`, `financialAccountId` (use `PAY_EXPENSES`/`PAY_SUPPLIERS`), `reference`, `paidAt`, amount (≤ outstanding), **evidence mandatory** (transfer slip / wallet SMS / cash voucher signed), idempotency key. Above `finance.expensePayment.approvalThreshold` the voucher is `PENDING_APPROVAL` until High Rank approves (≠ preparer). One transaction: CAS on the expense (`paymentStatus`, outstanding check) → insert `ExpensePayment` + allocations → register + **PR-12** → audit. Two simultaneous requests: the second fails the outstanding-amount claim (A1-F9). A combined **Approve & pay** UI action performs approval and payment as two ordered, atomic steps requiring the payment fields up front.

### 5.3 Supplier invoices and 3-way match (A1-F7 fix, §9, §10B; A2-MC-08)
`SupplierInvoice` registered against a PO and goods receipt → **match**: per PO line, accepted GRN quantity vs invoiced quantity and agreed price vs invoiced price within tolerances (`procurement.match.qtyTolerancePercent`, `.priceTolerancePercent`). Result `MATCHED` (auto) or `DISPUTED` (needs explicit High Rank acceptance with reason; INV-22). Approving a matched invoice **creates the Expense** (writes the traceability columns that today have no writer, C-03) with `supplierInvoiceId`, `purchaseOrderId`, `goodsReceiptId`, `supplierInvoiceNumber`, then follows §5.1. Duplicate supplier invoices are rejected by UQ-23. Supplier payment details are managed in `SupplierPaymentDetail` (encrypted, approved) — not free text (X-46). **AP ageing** from the sub-ledger reconciles to account 2000.

### 5.4 Emergency/no-PO purchases
Allowed with an explicit `emergency` flag, reason and High Rank approval; no quotation or PO required; still needs evidence and a budget allocation.

---

## 6. Budgets, commitments, procurement (A1-F6/F7, §3, OP-11/12, §10B; A2-F4; X-28..X-34)

### 6.1 Budget lifecycle (SM-22)
Finance drafts → submits → High Rank approves (`finance.approveBudget`). Only APPROVED budgets accept spending/commitments. UQ-14 prevents duplicates. Budget windows get an explicit transition table (DRAFT → OPEN → CLOSED → ARCHIVED, no free any→any, X-33).

### 6.2 Reservation, commitment, consumption, release (SM-08)
All inside transactions with the **budget row locked**:
- **Reserve** (requisition approval): `available = allocated − Σ active commitment remaining − spent ≥ amount`, else `INSUFFICIENT_BUDGET`. UQ-11 makes a second active reservation for the requisition impossible.
- **Commit** (PO approval): **must find the reservation** — no silent skip (X-29). If `PO.total > reserved`, the extra amount requires availability and High Rank approval; UQ-12 + UQ-13 stop a second PO re-pointing the commitment.
- **Consume** (expense approval linked to the PO): partial `BudgetConsumption` rows; commitment is `CONSUMED` when remaining = 0 (A1-F7).
- **Release**: on requisition rejection/cancel, PO cancel, or PO `CLOSED(_WITH_VARIANCE)` the remaining amount is released with a reason. The never-called `releaseCommitment` is wired into every one of these paths.
INV-05 is checked nightly.

### 6.3 Single budget position
`budgetPositionService` computes allocated / committed / spent / available by budget id (and rolls up by department/category/term). The Budget tab, analytics, forecast and reports all call it (X-31); the forecast counts only APPROVED expenses.

---

## 7. Payroll, disbursement, statutory remittances (A1-F12/F13, OP-13..15, §9; A2-§5, MC-07; X-35..X-42; D-02)

### 7.1 Calculation (`payrollService`) — SM-09
- All arithmetic in `Decimal`; **PAYE, pension, employer pension and other employer items rounded per payslip** (`round2`), then totals are **sums of rounded payslip values** (X-40). `roundingAdjustment` recorded if the accountant's rule requires.
- **Loan deduction** = `min(monthlyLoanDeduction, loan.balance, net available)`; never negative net (X-36); the amount is **planned** on the payslip but **not applied** to the loan until lock (X-35).
- **Employer contributions** from settings (`payroll.employerPensionPercent`, `payroll.otherEmployerItems`) stored on the payslip.
- Fine deduction (optional channel, §9.7) appears as `fineDeduction`.
- Rule: `net = gross − PAYE − pension − loan − other − fine ≥ 0` (CHK-11).
- Run creation computes and persists payslips in **one short transaction without PDFs**; payslip PDFs are generated afterwards in a retryable step (X-42).
- Runs are **versioned**: a wrong run is `VOIDED` (never deleted) and a new `version` can be generated for the same month (X-39). `discardStuckRun` marks FAILED/VOIDED.

### 7.2 Approval chain (existing roles, atomic transitions)
Finance submits → High Rank approves (≠ submitter) → Finance **locks**. Every transition is a CAS (§1.3); `returnToFinance` returns to COMPLETED. Concurrent lock requests cannot both pass.

### 7.3 Lock = accounting recognition, in one transaction (A1-OP-14)
CAS `APPROVED → LOCKED`; post **PR-16** from payslip components; create `StaffLoanRepayment` rows (UQ-17) and apply loan balances (§8); create fine payments (if enabled); create `StatutoryRemittance` rows (`DUE`) for PAYE, employee pension, employer pension and other items; register event `(PAYROLL_RUN, id, RECOGNITION:v{version})`; audit. Re-entry is impossible: the second request fails the CAS and the register unique key.

### 7.4 Rollback (A1-OP-15)
High Rank-approved, **only before any disbursement or remittance**: CAS `LOCKED → PENDING_APPROVAL`; reverse the stored journal (found by the register link, not by reference text, C-13); reverse loan repayments and fine deductions; mark remittance rows cancelled. A second rollback fails (UQ-02). After disbursement starts, correction is a new adjusting entry/approved void, not a rollback.

### 7.5 Disbursement (A1-F13, A2-§5)
Finance creates a `PayrollDisbursement` for a LOCKED run: account (use `PAY_PAYROLL`), method, reference/batch number, amount per payslip (`PayslipPayment`), evidence (bank batch file/confirmation). Confirmation per payslip: PAID / FAILED / RETURNED. Posting **PR-18** per confirmed batch (Dr Salaries Payable / Cr account). INV-20. The run shows "Net pay: disbursed X / outstanding Y".

### 7.6 Statutory remittances
Finance records a remittance against the due rows (PAYE to MRA, pension contributions, other): amount, account, reference, date, evidence → **PR-19**. Overdue marking by job; statutory payable accounts reconcile (INV-26).

---

## 8. Staff loans (A1-F12, OP-18, EV-C; X-35..X-38)

1. **Request** (HR or staff): single active loan enforced by UQ-16 (replaces check-then-create).
2. **Approve** (`hr.approveLoan`: HR or High Rank; ≠ requester) — CAS `PENDING → APPROVED`.
3. **Disburse** (`finance.disburseLoan`, **≠ approver**): CAS `APPROVED → DISBURSED`; requires account, method, reference, evidence; stores `disbursedByUid`; inserts `StaffLoanDisbursement`; **PR-20**; sets the salary deduction. (`disburseLoan` now takes the actor, X-38.)
4. **Repayment via payroll** at **lock** (§7.3): `StaffLoanRepayment(source=PAYROLL, payslipId)`, amount ≤ outstanding, **interest/principal split by `allocate()`** pro-rata (OQ-09: interest recognised as collected), `balanceAfter`, status → REPAYING/SETTLED, `totalRepaid` incremented once. Reversed with rollback.
5. **Manual repayment** (cash/bank/wallet; `finance.recordLoanRepayment`): replaces `PATCH /hr/loans/:id/repay`; needs account, reference, evidence; PR-21; cannot exceed outstanding.
6. **Write-off/forgiveness** (`finance.writeOffLoan`, High Rank, reason): PR-22.
7. Loan statement shows every repayment with payslip/run/reference (A1-F12 "no individual repayment record").

---

## 9. Library fines — students **and staff** (A1-F10/F11, OP-09/10, CT-15/16; X-02..X-07; D-07)

### 9.1 Roles (no single role can complete a fine end to end)
| Step | Who | Permission | Notes |
|---|---|---|---|
| Assess a fine | Library | `library.applyFine` | creates `PENDING` fine + PR-23 |
| Receive payment | **Finance** | `finance.receiveLibraryFine` | library staff **cannot** receive/clear |
| Request waiver | the payer or Library on their behalf | `library.requestFineWaiver` | existing self-service rule: only on a fine charged to you |
| Approve waiver | **High Rank** | `finance.approveFineWaiver` | requester ≠ approver ≠ assessor |
| Cancel an erroneous fine | Library requests, High Rank approves | | PR-25 (cancel) |
| Reverse a fine payment | Finance requests, High Rank approves | `finance.reversePayment` | |

### 9.2 Assessment (SM-12)
Fine created with `fineNumber`, `kind`, amount, reason, borrower (student **or** staff — exactly one, CHK-12). Posting **PR-23** (accrual). The borrower is notified with the amount and **how to pay** (instruction text from Settings, §9.4).

### 9.3 Payment at the Finance counter — students and staff alike
`POST /finances/library-fines/:id/payments` (idempotency key required):
1. Idempotency claim; permission `finance.receiveLibraryFine`.
2. **Segregation:** the receiving user's linked staff profile must **not** be the fine's `staffId` (a finance officer or librarian with an unpaid fine cannot clear their own; another finance user processes it) — `422 SEGREGATION_VIOLATION`.
3. Lock the fine row; CAS-eligible states: `PENDING` or (if `library.fines.allowPartialPayment = true`) `PARTIALLY_PAID`. A `WAIVED`, `CANCELLED` or `PAID` fine is refused (X-05).
4. Fields: amount (default = outstanding; must equal it unless partial payments are enabled), `method`, **`financialAccountId`** (use `RECEIVE_FINES` or general receipt accounts, method-compatible), `reference` (required unless cash; UQ-29), `paidAt`, optional evidence.
5. Insert `LibraryFinePayment` (`LFP` number), update `amountPaid` by increment and status (`PAID` when `amountPaid = amount`), register + **PR-24** (Dr account / Cr Receivable — Library Fines), audit, receipt PDF after commit.
6. Two simultaneous submissions: the second fails the status/amount claim and the idempotency/ reference uniqueness (A1-F10).

### 9.4 How staff pay (the owner's question) — the supported channels
1. **At the Finance office** (default, always available): a staff borrower pays **cash, bank transfer, Airtel Money, TNM Mpamba, POS or cheque** into the *same registered accounts* students use; Finance records it exactly as §9.3, so the money lands in the correct account ledger and reconciles. Staff see **"My library fines"** (read-only: amount, status, receipts) and a **How to pay** panel. The panel lists the **active accounts flagged `RECEIVE_FINES`** (display name, provider, masked number, instructions text) — never full numbers unless the viewer is authorised. Because the library role cannot receive money, the librarian's screen says "Send the borrower to Finance".
2. **Payroll deduction** (optional, **off by default**, D-23, OQ-12): enabled by `library.fines.staffPayrollDeduction.enabled`. Needs, per fine, a recorded **staff consent** (`FineDeductionConsent` with evidence) and **HR approval**, capped by `library.fines.maxDeductionPercentOfNet`. At payroll **lock**, the deduction becomes a `LibraryFinePayment(source=PAYROLL_DEDUCTION)` and settles the receivable in PR-16 (Cr `AR.FINE`), not touching cash. Reversed automatically on payroll rollback. Until the legal/HR question is answered this channel stays disabled.
3. **Exit clearance**: `GET /finances/library-fines/staff-clearance/:staffId` returns unpaid fines so HR's exit/contract-end process can show outstanding fines. It informs; it does not auto-deduct.
4. **Student fines** use channel 1 only; adding fines to the next invoice is deferred (OQ-18).

### 9.5 Waiver (replaces the bypass; A1-F11)
- `PATCH /finances/library-fines/:id/waive` and `PATCH /library/fines/:id/clear` are **removed** (during the migration window they return `410 GONE` with a message naming the new action; the UI is changed in the same release, C-04).
- Waiver is **only** through `FineWaiverRequest`: request (reason, optionally evidence) → High Rank **approve/reject** (≠ requester, ≠ assessor). Approval runs one transaction: CAS the request `REQUESTED → APPROVED`, CAS the fine `PENDING|PARTIALLY_PAID → WAIVED` (waives the **remaining** amount only; the fine's `amountPaid` is kept), **PR-25** (Dr Fine Waivers contra / Cr Receivable), audit. A PAID fine cannot be waived; if cash was received in error, use reversal (X-04).

### 9.6 Reporting
Fines receivable ageing (ties to account 1110), collected by account/method/payer type, waived amount and approver, outstanding by staff for HR clearance, assessor vs collector vs approver listing for oversight.

### 9.7 Library UI/permissions consequences
The Library screen keeps *assessing* and *requesting waivers* and shows read-only paid/unpaid status; its "Clear fine" action (`useLibrary.ts:415`) is replaced by "Send to Finance". `LibraryFinesTab` (Finance) gains the payment dialog (account picker, reference, evidence), partial-payment display, receipt, reversal request, and the waiver *approval inbox* for High Rank (Doc 5 §4.9).

---

## 10. Assets and advances (A1-§10E, EV-B, OP-16/17; X-43)

### 10.1 Advances
Record (`finance.manageAdvances`): amount (≤ cap vs request/PO), supplier (FK), account, method, reference, **evidence mandatory**; PR-14. Multiple advances allowed but `Σ ≤ cap`. Recording is by Finance; **reconcile/write-off cannot be done by the person who recorded it** (SM-14; X-43).
### 10.2 Reconciliation
Itemised: actual expenditure (links to expenses/supplier invoices), returned cash (account + reference), write-off (High Rank + reason). CAS `PENDING → PARTIALLY_RECONCILED → RECONCILED`; PR-15; INV-18. Write-off posts the loss (A1-OP-17 "no accounting write-off entry" fixed).
### 10.3 Asset capitalisation and depreciation (gated, D-21)
When the accountant approves the policy: capitalise on purchase approval (PR-31), monthly depreciation run per period, disposal workflow; asset register totals reconcile to accounts 1400/1410.
### 10.4 Inventory (D-20, deferred)
Variance write-offs above a threshold may post PR-32; valuation postings wait for a costing policy.

---

## 11. Transfers, settlement, reconciliation, cashbook (A1-§10F; A2-F6, MC-01/02/03; owner's registry §9)

### 11.1 Transfers
Create (Finance) → approve above threshold (High Rank) → send/receive. Direct or **in-transit** (PR-26). Mobile-money → bank settlement is a transfer with an optional fee; the settlement shows expected vs received; a wallet receipt is **never** treated as a bank deposit.
### 11.2 Statement import
Upload a CSV/XLSX statement for one account and period (`exceljs`, V-11); the importer maps columns (saved per account), normalises references, hashes the file (UQ-25) and each line (UQ-26) so re-imports cannot duplicate. Opening/closing balances captured.
### 11.3 Matching
Order: (1) exact normalised reference to a register row; (2) amount + date window (±N days, setting) + account; (3) suggestions ranked; manual match/split/exclude with reason. Many-to-one and one-to-many allowed (batch deposits, wallet settlements). Matching a receipt sets payment `verificationStatus = MATCHED`. Unmatched statement credits can post to **Suspense** (PR-30) until identified; bank charges post PR-27.
### 11.4 Reconciliation sign-off (SM-17)
`statement closing balance` ± outstanding receipts/payments = `ledger balance` ± explained adjustments; the difference must be **zero** or explicitly written off with approval (PR-30). Finance prepares, High Rank approves; **approved reconciliations lock** the matched items and feed the period-close checklist.
### 11.5 Cashbook and cash counts
Per-account listing with running balance from the ledger; for CASH accounts, periodic `CashCount` with variance review.

---

## 12. Reporting engine and period close (A2-MC-09/10, §7; D-26)

### 12.1 Statements (all from posted lines; period-aware)
- **Trial balance** (as-of or period; Σ debit = Σ credit, INV-27).
- **Income statement**: revenue by account (net of contra accounts) less expenses, for a period/term/year.
- **Balance sheet** (assets, liabilities, equity; INV-28) answering the six owner questions: what the school owns (asset accounts, by financial account), what is owed **to** the school (1100/1110/1120/1150/1160), what it owes suppliers (2000), what it owes employees and statutory bodies (2100/2110/2120/2121/2130), **student advance credit** (2200 + deferred 2210) and accumulated surplus (3000 + current result).
- **Cash flow** (direct method from the register: receipts/payments by account and type; indirect view optional).
- **Cashbook**, **receivables ageing** (student, sponsor, fines, loans), **payables ageing**, **collections by account/method/provider**, **budget vs actual** (via `budgetPositionService`), **statutory position**, **payroll disbursement status**.
Operational screens (invoice list, budget tab) may still show sub-ledger numbers but each carries a reconciliation check to its control account.

### 12.2 Period close (SM-19)
Checklist (Part 3 §7.2) → `SOFT_CLOSED` (warn) → `CLOSED` by High Rank; snapshots `AccountPeriodBalance`; TRG-04 blocks postings; **reopen** requires High Rank approval with reason and audit.

---

## 13. Integrity monitor, exception recovery, control centre (A1-F3, A2-§5/§9/§10)

### 13.1 Nightly monitor (`integrityMonitorService`, new)
Runs INV-01…INV-30 as set-based SQL (cheap) and writes `PostingException` rows (deduplicated by fingerprint): missing/unposted journals; duplicate source keys; balance cache mismatch; control-vs-sub-ledger differences; invoice/line/payment/credit/budget/loan/payroll invariant breaks; stale commitments; evidence files missing; unmatched receipts older than N days; hash-chain breaks; closed-period violations.
### 13.2 Posting recovery (A1-F3, A2-F1)
Any register row `PENDING_POSTING` or `POSTING_FAILED` is retried idempotently (the source key guarantees one journal), with attempt count, error and next-retry time; after the maximum attempts it becomes a `CRITICAL` exception. The Control Centre shows the queue with **Retry now**.
### 13.3 Control Centre (Doc 5 §4.12)
Alerts: payments/expenses/payroll awaiting posting; failed postings; unmatched bank/wallet lines; unreconciled accounts at period end; expenses awaiting approval; unpaid supplier invoices; refunds awaiting approval; statutory remittances due/overdue; payroll awaiting disbursement; invariant breaks; open period issues.

---

## 14. API catalogue

`Perm` = permission key (Doc 5 §1). `Idem` = idempotency key required. All routes use `requirePermission`, never `requireRole` lists (D-04). *Existing* = path exists today and is hardened; **NEW** = added.

### 14.1 Registry, ledger, periods
| Method · Path | Perm | Idem | Notes |
|---|---|---|---|
| GET `/finances/financial-accounts` | `finance.viewFinancialAccounts` | | masked list, filters (category, provider, status), balances from ledger |
| GET `/finances/financial-accounts/:id` | same | | |
| GET `/finances/financial-accounts/:id/details` | `finance.viewFinancialAccountDetails` | | unmasked; **audited** |
| POST `/finances/financial-accounts` | `finance.manageFinancialAccounts` | ✔ | NEW; creates DRAFT (+ ledger link/creation) |
| PATCH `/finances/financial-accounts/:id` | `finance.manageFinancialAccounts` | ✔ | sensitive fields go to approval |
| POST `/finances/financial-accounts/:id/{submit,approve,reject,activate,deactivate,archive}` | manage / `finance.approveFinancialAccounts` | ✔ | SM-18 |
| GET `/finances/financial-accounts/:id/revisions` | `finance.viewFinancialAccounts` | | history |
| GET `/finances/financial-accounts/selectable?workflow&method&currency` | any finance workflow perm | | active, compatible only |
| GET/POST `/finances/financial-providers` | view / manage | ✔ | suggestions |
| GET `/finances/account-mappings` · POST (propose) · POST `/:id/approve` | `finance.viewLedger` / `finance.manageAccountMappings` / `finance.approveAccountMappings` | ✔ | |
| GET `/finances/accounting/accounts` · POST · PATCH | `finance.viewLedger` / `finance.manageChartOfAccounts` | ✔ | non-system only |
| GET `/finances/periods` · POST `/:id/{soft-close,close,reopen}` | `finance.viewLedger` / `finance.closePeriod` / `finance.reopenPeriod` | ✔ | checklist result in response |
| POST `/finances/opening-balances` · POST `/:id/approve` | `finance.prepareOpeningBalance` / `finance.approveOpeningBalance` | ✔ | |
| GET `/finances/accounting/journals`, `/:id` | `finance.viewLedger` | | |
| POST `/finances/accounting/journals` (manual) · POST `/:id/approve` · POST `/:id/reverse` | `finance.postManualJournal` / `finance.approveManualJournal` / `finance.reverseJournal` | ✔ | manual always approved |
| GET `/finances/transactions`, `/:id` | `finance.viewLedger` | | the register |
| GET `/finances/exceptions` · POST `/:id/{acknowledge,resolve}` · POST `/transactions/:id/retry-posting` | `finance.viewControlCentre` / `finance.resolveExceptions` | ✔ | |

### 14.2 Receivables
| Method · Path | Perm | Idem |
|---|---|---|
| POST `/finances/payments` (*existing*) | `finance.recordPayment` | ✔ required |
| GET `/finances/payments` NEW (filter by account/status/verification) | `finance.viewPayments` | |
| POST `/finances/payments/:id/reversal-requests` · POST `/finances/payment-reversals/:id/approve` | `finance.reversePayment` / `finance.approveReversal` | ✔ |
| GET `/finances/payments/:id/receipt` (*existing*) | `finance.generateReceipt` or owner | |
| POST `/finances/invoices/generate`, `/bulk-generate`, `/:id/line-items` (*existing*) | `finance.generateInvoice` / `finance.bulkGenerateInvoices` / `finance.editInvoice` | ✔ |
| POST `/finances/invoices/:id/void` · `/:id/credit-notes` NEW | `finance.voidInvoice` (High Rank approval step) | ✔ |
| POST `/finances/invoices/:id/apply-credit` NEW | `finance.applyCredit` | ✔ |
| GET `/finances/credits/:studentId` (*existing*) | finance roles / owner | |
| POST `/finances/refunds` · `/:id/{approve,reject,pay}` NEW | `finance.manageRefunds` / `finance.approveRefund` / `finance.payRefund` | ✔ |
| POST `/finances/scholarships` · `/:id/{submit,approve,reject}` | `finance.manageScholarships` / `finance.approveScholarship` | ✔ |
| GET/POST `/finances/sponsors`, `/sponsors/:id/payments`, `/sponsor-charges` NEW | `finance.manageSponsors` | ✔ |
| POST `/finances/invoices/:id/installments` (*existing*) | `finance.manageInstallmentPlans` | ✔ |

### 14.3 Expenses, budgets, procurement
| Method · Path | Perm | Idem |
|---|---|---|
| POST `/finances/expenses` (*existing*) · POST `/:id/evidence` | `finance.createExpense` | ✔ |
| PATCH `/finances/expenses/:id/approve` · `/reject` (*existing*) | `finance.approveExpense` / `finance.rejectExpense` | ✔ |
| POST `/finances/expenses/:id/payments` NEW (replaces mark-paid) · POST `/expense-payments/:id/{approve,reverse}` | `finance.recordExpensePayment` / `finance.approveExpensePayment` | ✔ |
| PATCH `/finances/expenses/:id/mark-paid` (*existing*) | deprecated → `410` after migration | |
| GET/POST `/procurement/supplier-invoices`, `/:id/{match,approve,dispute}` NEW | `finance.manageSupplierInvoices` / `finance.approveSupplierInvoices` | ✔ |
| Supplier payment details CRUD + approve NEW | `procurement.manageSuppliers` / `finance.approveSupplierDetails` | ✔ |
| POST `/finances/budget` · `/:id/{submit,approve,reject}` | `finance.manageBudget` / `finance.approveBudget` | ✔ |
| Commitments (reserve/commit/consume/release), budget windows (*existing*) | `finance.manageBudgetCommitments`, `finance.manageBudgetWindows` | ✔ |
| GET `/finances/budget/position` NEW (single source) | `finance.viewBudget` | |

### 14.4 Payroll and loans
| Method · Path | Perm | Idem |
|---|---|---|
| POST `/payroll/run`, `/runs/:id/{submit,approve,lock,rollback,return}` (*existing*, atomic) | `finance.runPayroll` / `finance.approvePayroll` / `finance.lockPayroll` / `finance.rollbackPayroll` (rollback approval by High Rank) | ✔ |
| POST `/payroll/runs/:id/void` NEW | `finance.runPayroll` + High Rank approval | ✔ |
| POST `/payroll/runs/:id/disbursements` · `/disbursements/:id/confirm` NEW | `finance.disbursePayroll` / `finance.confirmDisbursement` | ✔ |
| GET `/payroll/remittances` · POST `/remittances/:id/pay` NEW | `finance.manageStatutory` | ✔ |
| POST `/hr/loans` (request) · `/:id/approve|reject` (*existing*) | HR / `hr.approveLoan` | ✔ |
| POST `/hr/loans/:id/disburse` (*existing*, hardened) | `finance.disburseLoan` | ✔ |
| POST `/hr/loans/:id/repayments` NEW · PATCH `/hr/loans/:id/repay` (*existing*) → `410` | `finance.recordLoanRepayment` | ✔ |
| POST `/hr/loans/:id/write-off` NEW | `finance.writeOffLoan` | ✔ |

### 14.5 Library fines
| Method · Path | Perm | Idem |
|---|---|---|
| POST `/finances/library-fines` (*existing*, assess) | `library.applyFine` | ✔ |
| POST `/finances/library-fines/:id/payments` NEW | `finance.receiveLibraryFine` | ✔ |
| POST `/finances/library-fines/payments/:id/reversal-requests` | `finance.reversePayment` | ✔ |
| POST `/library/fine-waivers` (*existing*) · PATCH `/library/fine-waivers/:id/approve|reject` | `library.requestFineWaiver` / `finance.approveFineWaiver` | ✔ |
| POST `/finances/library-fines/:id/cancel-requests` · approve | `library.applyFine` / `finance.approveFineWaiver` | ✔ |
| PATCH `/finances/library-fines/:id/{pay,waive}`, `/library/fines/:id/clear` (*existing*) | **removed → `410 GONE`** | |
| GET `/library/fines/mine` NEW · GET `/finances/library-fines/staff-clearance/:staffId` NEW | `library.viewOwnFines` / `finance.viewLibraryFines` or HR | |

### 14.6 Cash control and reports
| Method · Path | Perm | Idem |
|---|---|---|
| Transfers: POST `/finances/transfers` · `/:id/{approve,send,receive,reverse}` | `finance.manageTransfers` / `finance.approveTransfers` | ✔ |
| POST `/finances/reconciliation/imports` · GET `/imports/:id/lines` · POST `/lines/:id/{match,split,exclude}` | `finance.importStatements` / `finance.reconcile` | ✔ |
| POST `/finances/reconciliations` · `/:id/{submit,approve,lock,reject}` | `finance.reconcile` / `finance.approveReconciliation` | ✔ |
| GET `/finances/cashbook/:accountId` · POST `/finances/cash-counts` | `finance.viewLedger` / `finance.reconcile` | ✔ |
| GET `/finances/reports/{trial-balance,income-statement,balance-sheet,cash-flow,receivables-ageing,payables-ageing,collections,budget-vs-actual,statutory,payroll-status}` | `finance.viewReports` (High Rank/Finance); Admin gets none | |
| Repair: POST `/finances/repair/scans` · GET `/scans/:id` · POST `/scans/:id/{approve,apply}` | `finance.runHistoricalRepair` / `finance.approveHistoricalRepair` | ✔ |
| GET `/finances/audit-trail` | `finance.viewAuditTrail` (Admin read-only included) | |

---

## 15. Settings catalogue (`SystemSettings`; all validated, audited, changes to financial keys need High Rank approval)

`finance.revenueRecognition.mode` (`TERM_START`/`ON_INVOICE`) · `finance.cutoverDate` · `finance.fiscalYearStartMonth` · `finance.payment.maxBackdateDays` · `finance.payment.maxAmount` · `finance.expense.evidenceThreshold` · `finance.expense.allowSalariesCategory` · `finance.expensePayment.approvalThreshold` · `finance.refund.approvalThreshold` · `finance.transfer.approvalThreshold` · `finance.writeOff.alwaysApprove` (fixed true) · `procurement.match.qtyTolerancePercent/priceTolerancePercent` · `assets.advance.maxPercentOfRequest` · `payroll.employerPensionPercent` · `payroll.otherEmployerItems` · existing PAYE/pension keys · `library.fines.allowPartialPayment` · `library.fines.staffPayrollDeduction.enabled` · `library.fines.maxDeductionPercentOfNet` · `library.fines.payInstructions` · `reconciliation.matchDateWindowDays` · `finance.v2.*` flags (§1.8).
