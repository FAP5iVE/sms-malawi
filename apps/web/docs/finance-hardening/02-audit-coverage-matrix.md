# SMS Malawi — Finance Hardening Plan · Part 2
## Audit coverage matrix — every point of both audits, accounted for

**Rule:** no point in either audit is silently ignored. Each row says what the audit claimed, whether the code confirms it, what the plan does, why, and where it is implemented. IDs: `A1-…` = *Financial Data Model and Money-Traceability Audit*; `A2-…` = *Vulnerabilities to End*. References: `D#3 §x` = Part 3 section, `D#4 §x` = Part 4, `D#5 §x` = Part 5, `P#-##` = task in Part 6, `X-/C-/D-/OQ-` = Part 1.

**Check (verification against code at `5c816c0`):** **V** confirmed · **V+** confirmed and the code is worse/larger than stated · **C** corrected (see Part 1 §4) · **S** design suggestion or scope statement (no code claim) · **U** can only be settled with live data (P0-02) · **P** partly confirmed.
**Disposition:** **IN** included as stated · **MOD** included, modified (reason given) · **DEF** deferred behind a named gate (not dropped) · **DROP** not done, reason given.

---

## A. Audit 1 — model analysis (§2–§5)

| ID | Point | Chk | Disp | Reason / how | Ref |
|---|---|---|---|---|---|
| A1-M-01 | `FeeStructure` is pricing, not revenue; invoice establishes the billed amount | V | IN | Basis of the accrual design (invoice recognises receivable) | D-01; D#3 §16 PR-01 |
| A1-M-02 | `Payment` is not proof the bank/provider settled | V | IN | `verificationStatus` + reconciliation; receipts documented as "recorded" | P3-03, P7-05; D#4 §3.3 |
| A1-M-03 | `StudentCredit` is a liability, not revenue or refund | V | IN | Credit liability account 2200, PR-03/04 | D#3 §8.5; P3-03/04 |
| A1-M-04 | `Expense` can be approved paid-immediately or unpaid then mark-paid | V+ | IN | Default `paidImmediately=true` credits cash with no evidence (X-27) → approval ≠ payment (D-17) | P4-02, P4-03 |
| A1-M-05 | Payroll has no disbursement record | V | IN | `PayrollDisbursement`/`PayslipPayment` | P5-04; D#3 §10.1 |
| A1-M-06 | `StaffLoan` has no repayment model | V | IN | `StaffLoanRepayment`, `StaffLoanDisbursement` | P5-06; D#3 §10.2 |
| A1-M-07 | `Asset.acquisitionCost` not in GL; depreciation out of scope | V | DEF | Needs accountant policy (OQ-14); fully designed, gated | D-21; P8-05; D#4 §10.3 |
| A1-M-08 | `consumeCommitment()` has no caller | V (C-03) | IN | Plus `releaseCommitment` has no caller; bridge built | P4-04, P4-06, P4-07 |
| A1-M-09 | Available = allocated − committed − spent double-counts if commitment stays COMMITTED | V | IN | Partial consumption rows; INV-05 | P4-04; D#3 §9.2 |
| A1-M-10 | No DB uniqueness for active commitments | V (C-06) | IN | Partial unique indexes UQ-11/12 | P4-04; D#3 §15 |
| A1-M-11 | `ChartOfAccount.balance` is an accumulator; operational balances can diverge from ledger | V | IN | Ledger lines authoritative; cache verified (INV-08); control accounts reconciled (INV-09) | D-12; P1-13, P8-04 |
| A1-M-12 | No source model has an FK to its journal; textual references only | V+ | IN | Register link + `journalEntry.financialTransactionId`; PAY- ref is per invoice (X-13) | P1-05/06; D#3 §3–4 |
| A1-M-13 | Reference conventions `PAY-/EXP-/EXP-PAY-/LIB-/PAY-year-month` | C | MOD | Kept as informational only; identity is `(sourceType, sourceId, eventKey)` | UQ-04 |

### A1 §5 — models with no accounting-engine connection (20 rows)

| ID | Model | Chk | Disp | Reason / how | Ref |
|---|---|---|---|---|---|
| A1-GL-01 | `Invoice` — no posting on creation | V | IN | PR-01 (accrual) | P3-01 |
| A1-GL-02 | `InvoiceLineItem` — no classification | V | IN | Snapshotted `revenueMappingKey` | P3-02 |
| A1-GL-03 | `StudentCredit` — no liability | V | IN | PR-03/04, account 2200 | P3-03/04 |
| A1-GL-04 | `Scholarship` — no sponsor receivable | V | IN | `SponsorCharge`, PR-01/10 | P3-08 |
| A1-GL-05 | `InstallmentPlan` — no receivable reconciliation | V | MOD | **No separate posting**: a schedule divides an existing receivable; posting it would double count. Reconciled by allocation instead | P3-09 |
| A1-GL-06 | `Installment` — no payment link | V | IN | `InstallmentAllocation` | P3-09 |
| A1-GL-07 | `StudentFeeCommitment` — no posting | V | DROP | An optional-fee *intention*, not a financial event until invoiced; posting would create phantom receivables | — |
| A1-GL-08 | `FeeStructure` — no classification | V | IN | `revenueMappingKey`, AccountMapping | P2-02, P3-02 |
| A1-GL-09 | `Budget` — no posting | V | DROP | A control record, not an accounting event; budget reporting uses ledger dimensions (`budgetId`) and the single position service | P4-01, P8-02 |
| A1-GL-10 | `BudgetCommitment` — no posting | V | DROP | An encumbrance is memorandum, not a liability until goods/invoice; tracked in commitments and reports | P4-04 |
| A1-GL-11 | `PurchaseRequisition` — no posting | V | DROP | Same: a request, not a liability | — |
| A1-GL-12 | `PurchaseOrder` — no supplier liability | V | MOD | Liability recognised at approved **supplier invoice** (PR-11), the accrual-correct moment; PO stays a commitment | P4-06 |
| A1-GL-13 | `GoodsReceipt` — no inventory/liability | V | DEF | Goods-received-not-invoiced accrual and inventory need a costing policy (OQ-15); receipt is used as match evidence meanwhile | D-20; P4-06 |
| A1-GL-14 | `StaffLoan` — no disbursement/repayment journal | V | IN | PR-20/21/22 | P5-06 |
| A1-GL-15 | `SalaryStructure` — no posting | V | DROP | Configuration, not an event; cost posts through payroll | — |
| A1-GL-16 | `StaffAllowance` — no accounting record | V | DROP | An input to the payslip; posted through payroll (PR-16) | P5-03 |
| A1-GL-17 | `AssetAdvance` — no advance/reconciliation journal | V | IN | PR-14/15 | P4-08 |
| A1-GL-18 | `Asset` — acquisition cost for reporting only | V | DEF | See A1-M-07 | P8-05 |
| A1-GL-19 | `InventoryTransaction` — no valuation | V | DEF | See A1-GL-13 | P8-06 |
| A1-GL-20 | `InventoryVariance` — no loss/write-off | V | DEF | PR-32 gated | P8-06 |
| A1-GL-X | No models for bank accounts, statements, reconciliation, mobile-money settlement, refunds, supplier payments, payroll disbursements, loan repayments | V | IN | `FinancialAccount`; statements/reconciliation; transfers; `Refund`; `ExpensePayment`; `PayrollDisbursement`; `StaffLoanRepayment` | P2-03, P7-01..03, P3-07, P4-03, P5-04, P5-06 |

---

## B. Audit 1 — Section 6 findings (F1–F14)

| ID | Finding | Chk | Disp | Reason / how | Ref |
|---|---|---|---|---|---|
| A1-F1 | Journal entries can be posted twice (check outside the transaction) | V | IN | Conditional `UPDATE … WHERE status='DRAFT'`, exact balance, atomic increments; accepted fix + tx-aware engine (C-11) | P1-02, P1-03; D#3 §3.4; T-03 |
| A1-F2 | Same entry can be reversed repeatedly | V | IN | Claim `POSTED → REVERSED`, `reversalOfId` unique, reversal fields | P1-04; UQ-02; T-04 |
| A1-F3 | Payment can exist without a journal | V | MOD | Audit asks for `PENDING→POSTED→REVERSED` status + retry. **Plan removes the divergence at the root** (posting inside the same transaction, same DB) and keeps the statuses/recovery queue for legacy rows and bulk jobs. Reason: retaining a payment with no entry is the defect | D-08; P1-02/06/07, P3-03; D#4 §3.1, §13.2 |
| A1-F4 | Overpayment recorded as revenue | V+ (C-01) | IN | Credit liability; `appliedAmount`/`creditAmount`; accrual: payment settles AR | P3-03/04; PR-03; INV-03 |
| A1-F5 | All payments credited to tuition (4000) | V | MOD | Audit says derive from `PaymentAllocation`; **that would over-credit** (C-01). Under accrual the classification is at **invoice** time from line snapshots; payment settles AR | P2-02, P3-01/02; PR-01 |
| A1-F6 | Budget `spent` incremented on all matching budgets | V | IN | Exact `budgetId`/allocation table; no-match rejected; interim fail-closed guard in P1 | P4-01; P1-08 (interim); UQ-31 |
| A1-F7 | Commitments not consumed | V+ (C-03) | IN | Lifecycle + supplier-invoice bridge | P4-04, P4-06, P4-07 |
| A1-F8 | Expense approval, budget, journal are separate operations | V | IN | One transaction | P4-02; D#4 §5.1 |
| A1-F9 | Mark-paid can be duplicated | V | IN | Claim + `ExpensePayment` voucher | P1-08, P4-03 |
| A1-F10 | Library fines can be paid more than once | V+ (C-04, X-03) | IN | Claim now (P1); full workflow in P6; the ledger-less second route closed | P1-08/09, P6-02 |
| A1-F11 | Waiver bypasses approval workflow | V+ (C-04) | IN | Route removed; UI changed together; approval to High Rank | P1-09, P6-03 |
| A1-F12 | Loan repayments not traceable; no upper bound | V+ (X-35..X-37) | IN | Repayment model, cap, atomic, moved to lock | P5-06, P5-07, P5-01 |
| A1-F13 | Payroll deductions in one generic liability; LOCKED ≠ paid | V | IN | Classified accounts (2110/2120/2121/1150), disbursement records | P2-01, P5-03, P5-04 |
| A1-F14 | Late penalties can be applied twice | V | IN | Claim `late_penalty = 0` + job lock | P3-05, P1-08 |

---

## C. Audit 1 — Section 7 (duplicate / reverse / delete)

| ID | Operation | Remaining concern | Chk | Disp | How | Ref |
|---|---|---|---|---|---|---|
| A1-OP-01 | Generate invoice | none (unique constraint) | V (C-10) | MOD | Keep unique; add credit-claim fix | P3-01, P3-04 |
| A1-OP-02 | Record payment | No global provider reference uniqueness | V | IN | UQ-08 namespace + idempotency | P3-03 |
| A1-OP-03 | Add invoice line | Check outside tx; no unique | V+ (X-20) | IN | Lock + UQ-10 + increments | P3-05 |
| A1-OP-04 | Late penalty | Concurrent jobs | V | IN | Claim + job lock | P3-05 |
| A1-OP-05 | Post journal | Not atomic | V | IN | See A1-F1 | P1-03 |
| A1-OP-06 | Reverse journal | Repeatable | V | IN | See A1-F2 | P1-04 |
| A1-OP-07 | Approve expense | Budget/ledger separate | V | IN | See A1-F8 | P4-02 |
| A1-OP-08 | Mark expense paid | Concurrent | V | IN | See A1-F9 | P4-03 |
| A1-OP-09 | Pay library fine | No status guard | V | IN | See A1-F10 | P1-08, P6-02 |
| A1-OP-10 | Waive library fine | Direct route bypass | V | IN | See A1-F11 | P1-09, P6-03 |
| A1-OP-11 | Reserve budget | No DB uniqueness | V | IN | UQ-11; row lock | P4-04 |
| A1-OP-12 | Create PO | Second PO overwrites commitment pointer | V | IN | UQ-12/13, one PO per requisition (D-15) | P4-05 |
| A1-OP-13 | Approve payroll | Needs atomic claims | V | IN | CAS transitions | P1-08, P5-02 |
| A1-OP-14 | Lock payroll | Concurrent lock duplicates journal | V | IN | CAS + register unique key | P1-08, P5-03; T-11 |
| A1-OP-15 | Roll back payroll | Original reversible repeatedly | V (C-13) | IN | Link-based reversal, UQ-02, blocked after disbursement | P5-03 |
| A1-OP-16 | Reconcile asset advance | Read-then-update | V | IN | Claim + itemised reconciliation | P1-08, P4-08 |
| A1-OP-17 | Write off asset advance | Same; no accounting write-off | V | IN | Claim + PR-15, High Rank | P4-08 |
| A1-OP-18 | Repay staff loan | No record/cap | V+ | IN | Repayment model/cap; manual route replaced | P5-06 |
| A1-DEL-01 | Invoice → LineItem cascade | Deleting history | V | IN | `Restrict` + TRG-08 | M13; D#3 §15 |
| A1-DEL-02 | Payment → Allocation cascade | | V | IN | same | M13 |
| A1-DEL-03 | Student/FeeStructure → StudentFeeCommitment cascade | | V | IN | `Restrict`; deactivate instead of delete | M13 |
| A1-DEL-04 | AssetRequest → AssetAdvance cascade (money handed out) | | V | IN | `Restrict` | M13, P4-08 |
| A1-DEL-05 | `discardStuckRun` hard-deletes (PROCESSING only) | | V (X-39) | MOD | Replaced by FAILED/VOIDED so nothing is deleted | P5-02 |
| A1-DEL-06 | Recommendation: prohibit hard deletion; correct by reversal | S | IN | TRG-08 + reversal engine | D-12 |

---

## D. Audit 1 — Section 8 (orphans)

| ID | Record | Chk | Disp | How | Ref |
|---|---|---|---|---|---|
| A1-OR-01 | `StudentCredit.sourcePaymentId` plain string | V | IN | Real FK `paymentId`, backfill | P3-04, RA-2 |
| A1-OR-02 | `Invoice.scholarshipId` plain string | V | IN | Real relation after orphan check | P3-08, RA-8 |
| A1-OR-03 | `InvoiceLineItem.feeStructureId` plain string | V | IN | Real optional relation + snapshots | P3-01/02 |
| A1-OR-04 | `Scholarship.studentId` no relation | V | IN | Relation (Restrict) | P3-08 |
| A1-OR-05 | `LibraryFine.studentId` no relation | V | IN | Relation after check | P6-01 |
| A1-OR-06 | `LibraryFine.staffId` no relation | V | IN | Relation after check | P6-01 |
| A1-OR-07 | `SalaryStructure.staffUid` plain UID | V | MOD | Add `staffId` relation alongside UID where the profile exists (UID stays; it is the auth key) | P5-02 (Payslip), P5-01 |
| A1-OR-08 | `StaffAllowance.staffUid` plain UID | V | MOD | Same approach | P5-01 |
| A1-OR-09 | `Payslip.staffUid` no relation | V | IN | `staffId` FK | P5-02 |
| A1-OR-10 | `PayrollRun` no journal FK | V | IN | Register link | P5-03 |
| A1-OR-11 | `Payment` no journal FK | V | IN | Register link | P3-03 |
| A1-OR-12 | `Expense` no journal FK | V | IN | Register link | P4-02 |
| A1-OR-13 | `LibraryFine` no journal FK | V | IN | Register link | P6-01 |
| A1-OR-14 | `InventoryTransaction.referenceType/Id` polymorphic text | V | DEF | With inventory valuation (D-20); integrity monitor reports orphans meanwhile | P8-06, P8-04 |
| A1-OR-15 | `AssetAdvance.supplier` free text | V | IN | `supplierId` FK | P4-08 |
| A1-OR-FILE | `receiptKey` files can disappear | V | IN | Evidence table + nightly existence check | D#3 §4.5; P8-04 |
| A1-OR-JE | No source→journal relationship (biggest orphaning problem) | V | IN | Central register | D-09; P1-06 |

---

## E. Audit 1 — Section 9 (approval and evidence)

| ID | Operation | Gap | Chk | Disp | How | Ref |
|---|---|---|---|---|---|---|
| A1-CT-01 | Create budget | no approval | V | IN | Approval states | P4-01 |
| A1-CT-02 | Create scholarship | no approval/evidence | V | IN | Approval + sponsor agreement | P3-08 |
| A1-CT-03 | Record payment | no settlement verification | V | IN | Reconciliation + `verificationStatus` | P7-05 |
| A1-CT-04 | Approve expense | evidence optional | V | IN | Evidence rules/threshold | P4-02 |
| A1-CT-05 | Mark expense paid | no reference/proof | V | IN | Voucher with mandatory evidence | P4-03 |
| A1-CT-06 | Approve requisition | estimates may not prove cost | V | MOD | Cost proof arrives at quotation/PO/supplier-invoice match, not at requisition | P4-06 |
| A1-CT-07 | Approve PO | quotation can be absent (emergency) | V | MOD | Emergency flag + reason + High Rank | D#4 §5.4 |
| A1-CT-08 | Complete goods receipt | delivery reference optional | V | IN | Delivery note evidence required for matching | P4-06 |
| A1-CT-09 | Record asset advance | no proof | V | IN | Evidence mandatory | P4-08 |
| A1-CT-10 | Reconcile asset advance | status only | V | IN | Itemised reconciliation | P4-08 |
| A1-CT-11 | Write off advance | no approval/journal | V | IN | High Rank + PR-15 | P4-08 |
| A1-CT-12 | Disburse staff loan | no transfer evidence | V | IN | Account/reference/evidence | P5-06 |
| A1-CT-13 | Record loan repayment | no receipt/history | V | IN | Repayment records | P5-06 |
| A1-CT-14 | Approve payroll | no disbursement confirmation | V | IN | Disbursement + confirmation | P5-04 |
| A1-CT-15 | Pay library fine | no reference/method | V | IN | Method, account, reference | P6-02 |
| A1-CT-16 | Waive library fine | bypass | V | IN | See A1-F11 | P6-03 |
| A1-EV-A | Expense evidence fields mostly optional; approval requires none | V | IN | Rules by threshold; PO-linked needs GRN | P4-02 |
| A1-EV-B | Asset advance lacks proof/invoice/reconciliation detail | V | IN | See A1-CT-09/10 | P4-08 |
| A1-EV-C | `disburseLoan` creates no payment transaction or journal | V | IN | See A1-CT-12 | P5-06 |
| A1-EV-D | Payment reference not verified against bank/provider | V | IN | See A1-CT-03 | P7-05 |

---

## F. Audit 1 — Section 10 (additional weaknesses)

| ID | Point | Chk | Disp | How | Ref |
|---|---|---|---|---|---|
| A1-W-A | Provider reference not unique across invoices; 2-minute heuristic rejects legitimate payments | V | IN | Namespace-unique reference + idempotency; heuristic becomes a soft warning | P3-03; UQ-08 |
| A1-W-B | Two POs against one requisition overwrite commitment | V (X-34) | IN | See A1-OP-12 | P4-05 |
| A1-W-C | Installments never reconciled to payments | V | IN | See A1-GL-06 | P3-09 |
| A1-W-D | Scholarships create no sponsor receivable | V | IN | See A1-GL-04 | P3-08 |
| A1-W-E | Asset valuation outside the engine | V | DEF | See A1-M-07 | P8-05 |
| A1-W-F | No bank reconciliation architecture (7-step workflow) | V | IN | Import → match → investigate → adjust → approve → lock | P7-01..04 |

---

## G. Audit 1 — Sections 11–14

| ID | Point | Chk | Disp | How | Ref |
|---|---|---|---|---|---|
| A1-§11 | Traceability summary table | S | IN | Used as the checklist; every "No" in the GL column is a row above | A1-GL-*, A1-M-* |
| A1-PH1-1 | Atomic, idempotent posting | V | IN | | P1-02/03/06 |
| A1-PH1-2 | Prevent multiple reversals | V | IN | | P1-04 |
| A1-PH1-3 | Source transaction IDs and unique posting references | V | IN | | P1-05/06 |
| A1-PH1-4 | Durable posting status and failed-posting recovery | V | MOD | See A1-F3 | P1-06/07 |
| A1-PH1-5 | Reconcile existing payments/expenses/fines against journals | U | IN | Baseline then repair | P0-02, P9-01..03 |
| A1-PH2-1 | Separate revenue by category | V | IN | | P2-01, P3-02 |
| A1-PH2-2 | Credits as liabilities | V | IN | | P3-03/04 |
| A1-PH2-3 | Sponsor receivables | V | IN | | P3-08 |
| A1-PH2-4 | Separate PAYE, pension, loan deductions | V | IN | | P5-03 |
| A1-PH2-5 | Loan disbursement/repayment accounting | V | IN | | P5-06 |
| A1-PH3-1 | Update expenditure by exact budget ID | V | IN | | P4-01 |
| A1-PH3-2 | Connect commitments to expenses | V | IN | | P4-04/06/07 |
| A1-PH3-3 | Implement commitment consumption | V | IN | | P4-04 |
| A1-PH3-4 | Stop PO creation overwriting commitments | V | IN | | P4-05 |
| A1-PH3-5 | Reconcile GRN, supplier invoices, expenses | V | IN | | P4-06/07 |
| A1-PH4-1 | Evidence before approving appropriate expenses | V | IN | | P4-02 |
| A1-PH4-2 | Payment references and supporting documents | V | IN | | P3-03, P4-03 |
| A1-PH4-3 | Fine payment and waiver safeguards | V | IN | | P1-08/09, P6 |
| A1-PH4-4 | Evidence-backed advance reconciliation | V | IN | | P4-08 |
| A1-PH4-5 | Payroll disbursement confirmation | V | IN | | P5-04 |
| A1-PH5-1 | Bank and mobile-money reconciliation | V | IN | | P7 |
| A1-PH5-2 | Payment refunds and reversals | V | IN | | P3-06/07 |
| A1-PH5-3 | Supplier payment tracking | V | IN | | P4-03/06 |
| A1-PH5-4 | Financial period closing/locking | V | IN | | P2-05, P8-03 |
| A1-PH5-5 | Reconcile income statement, balance sheet, cash flow | V | IN | | P8-01 |
| A1-ARCH-1 | Central financial transaction register | S | IN | Adopted (D-09) | P1-06 |
| A1-ARCH-2 | Keep domain models; register only connects | S | IN | D-10 | |
| A1-ARCH-3 | Chain: Payment → register → journal → bank reconciliation | S | IN | | D#3 §4, §13 |
| A1-§14 | Final assessment; preserve the Finance module; next deliverable = remediation spec | S | IN | This document set is that deliverable; architecture preserved | D-10 |

---

## H. Audit 2 — findings and tables

| ID | Point | Chk | Disp | Reason / how | Ref |
|---|---|---|---|---|---|
| A2-F1 | Payment can exist without accounting entry; add `PENDING_POSTING/POSTED/POSTING_FAILED/REVERSED`, durable journal link, background retry, same for expenses and payroll | V | MOD | Statuses kept (`FinancialTransactionStatus`), link added, retry worker added, applied to expenses/payroll; **primary fix is atomic posting** so the gap cannot arise | P1-06/07, P3-03, P4-02, P5-03 |
| A2-F2 | Concurrent double-posting; conditional update; row-count check; conflict response; "locking or serializable where necessary" | V | MOD | Conditional claim + `409`, row locks and ordered account updates adopted. **Serializable isolation not used**: claims + unique keys make it unnecessary and it adds retry complexity on the Neon adapter | P1-03 |
| A2-F3 | Journal reversible more than once; add `reversedAt/By/reversalJournalEntryId/reversalReason`; unique relation | V | IN | Fields + UQ-02 | P1-04 |
| A2-F4 | Budget expenditure on wrong budgets; exact `budgetId` or allocation table summing to expense | V | IN | `ExpenseBudgetAllocation` | P4-01 |
| A2-F5 | Revenue classification (4000–4300 and categories incl. transport/uniform/levy) | V | IN | New accounts + snapshots; multiple credit lines | P2-01, P3-01/02 |
| A2-F6 | No bank reconciliation; one `1000` account; needs financial accounts, opening/closing balances, statement import, matching, unmatched investigation, approval, locked period | V (C-08) | IN | Registry + reconciliation + periods; configurable per owner's spec | P2-03/04, P7, P8-03 |

### A2 §5 — "other weaknesses" table (13 rows) and observations

| ID | Area / finding | Chk | Disp | How | Ref |
|---|---|---|---|---|---|
| A2-T-01 | Payment and ledger posting separate, no recovery | V | MOD | See A2-F1 | P3-03 |
| A2-T-02 | Concurrent journal posting duplicates | V | IN | | P1-03 |
| A2-T-03 | Repeated reversal | V | IN | | P1-04 |
| A2-T-04 | Budget update ignores department/term | V | IN | | P4-01 |
| A2-T-05 | All payments credited to tuition | V | IN | | P3-02 |
| A2-T-06 | No bank/MM reconciliation workflow | V | IN | | P7 |
| A2-T-07 | PAYE/pension/loan not separately classified | V | IN | | P5-03 |
| A2-T-08 | Payslip generation vs actual disbursement need separate verification | V | IN | | P5-04 |
| A2-T-09 | Scholarship sponsor commitments vs receipts | V | IN | | P3-08 |
| A2-T-10 | Expense approval, budget, ledger not atomic | V | IN | | P4-02 |
| A2-T-11 | Failed posting logged but no durable exception workflow | V | IN | `PostingException` + Control Centre | P1-07, P8-04 |
| A2-T-12 | Opening balances/historical balances need controlled migration | V | IN | Approved opening entries + cutover | P2-06, P9-04 |
| A2-T-13 | External payment verification and duplicate provider transaction detection | V | IN | | P3-03, P7-05 |
| A2-OBS-1 | Expense approval not atomic | V | IN | | P4-02 |
| A2-OBS-2 | Student credit needs liability accounting | V | IN | | P3-03/04 |
| A2-OBS-3 | Payroll needs settlement workflow (net pay and statutory deductions paid) | V | IN | | P5-04, P5-05 |
| A2-OBS-4 | Stored balance vs trial balance from lines; opening-balance journal needed | V | IN | | D#3 §3.6, §7.3 |

### A2 §6 — architecture and §7 missing capabilities

| ID | Point | Chk | Disp | How | Ref |
|---|---|---|---|---|---|
| A2-ARCH-1 | Principle: every event has traceable source, verified destination, accounting entry, audit trail | S | IN | Part 1 §8 principle 1 | all |
| A2-ARCH-2 | Money in: sponsor payments, donations, other income, loans received | S | MOD | Student fees, sponsors, fines included. **Donations/other income/loans received are not modelled as new workflows** (no such module exists today); the register and manual-journal path accept them, a dedicated module is added only if the school needs it | P7, D#3 §16 |
| A2-ARCH-3 | Transaction verification (references, bank/MM confirmation, receipt evidence) | S | IN | | P3-03, P7-05 |
| A2-ARCH-4 | Central register; accounting engine authoritative for balances | S | IN | | D-09, D-26 |
| A2-ARCH-5 | Outgoing workflows: procurement, expenses, payroll, loans | S | IN | | P4, P5 |
| A2-ARCH-6 | Reconciliation and reporting layer | S | IN | | P7, P8 |
| A2-MC-01 | Bank reconciliation | V | IN | | P7-02/03 |
| A2-MC-02 | Cashbook | V | IN | | P7-04 |
| A2-MC-03 | Multiple financial accounts | V | IN | Configurable registry | P2-03/04 |
| A2-MC-04 | Payment verification | V | IN | | P7-05 |
| A2-MC-05 | Refund management | V | IN | | P3-07 |
| A2-MC-06 | Sponsor receivables | V | IN | | P3-08 |
| A2-MC-07 | Supplier payment management | V | IN | | P4-03/06 |
| A2-MC-08 | Statutory remittances | V | IN | | P5-05 |
| A2-MC-09 | Financial period closing | V | IN | | P2-05, P8-03 |
| A2-MC-10 | Balance sheet (only IS, TB, ledger exposed today) | V | IN | | P8-01 |
| A2-MC-11 | Financial exception management | V | IN | | P1-07, P8-04 |
| A2-MC-12 | Transaction reconciliation (payments/expenses/payroll/procurement ↔ entries) | V | IN | Integrity monitor INV-06/09 | P1-13, P8-04 |
| A2-BS-1..6 | Balance sheet must answer: what school owns / owed to school / owes suppliers / owes employees / student advance credit / accumulated surplus | S | IN | Six headline tiles | D#4 §12.1; D#5 §4.13 |

### A2 §8 — priorities

| ID | Item | Disp | Ref |
|---|---|---|---|
| A2-PH1-1 | Fix concurrent journal posting | IN | P1-03 |
| A2-PH1-2 | Prevent repeated reversals | IN | P1-04 |
| A2-PH1-3 | Correct budget expenditure allocation | MOD — **interim fail-closed guard in P1-08** (reject when several budgets match); full fix needs `budgetId` on expenses + UI (schema/UI work), so P4-01 | P1-08, P4-01 |
| A2-PH1-4 | Payment-to-ledger recoverable | IN | P1-06, P3-03 |
| A2-PH1-5 | Expense approval and posting recoverable | IN | P4-02 |
| A2-PH1-6 | Transaction references and posting statuses | IN | P1-06 |
| A2-PH2-1 | Separate revenue accounts | IN | P2-01 |
| A2-PH2-2 | Separate PAYE and pension liabilities | IN | P2-01, P5-03 |
| A2-PH2-3 | Staff loan receivable | IN | P5-06 |
| A2-PH2-4 | Student advance credit liability | IN | P3-03 |
| A2-PH2-5 | Opening balances | IN | P2-06 |
| A2-PH2-6 | Balance sheet | IN | P8-01 |
| A2-PH3-1 | Multiple bank and cash accounts | IN | P2-03/04 |
| A2-PH3-2 | Airtel Money and TNM Mpamba settlement accounts | IN | P2-03, P7-01 |
| A2-PH3-3 | Cashbook | IN | P7-04 |
| A2-PH3-4 | Bank statement import | IN | P7-02 |
| A2-PH3-5 | Bank reconciliation | IN | P7-03 |
| A2-PH3-6 | Unmatched transaction investigation | IN | P7-02 |
| A2-PH3-7 | Refund and reversal workflows | IN | P3-06/07 |
| A2-PH4-1 | Supplier invoice management | IN | P4-06 |
| A2-PH4-2 | PO and goods-receipt reconciliation | IN | P4-06/07 |
| A2-PH4-3 | Payment authorisation and disbursement | IN | P4-03 |
| A2-PH4-4 | Payroll disbursement confirmation | IN | P5-04 |
| A2-PH4-5 | PAYE and pension remittance tracking | IN | P5-05 |
| A2-PH4-6 | Loan disbursement and repayment reconciliation | IN | P5-06 |
| A2-PH5-1 | Financial period locking | IN | P2-05, P8-03 |
| A2-PH5-2 | Immutable financial audit history | IN | P1-11, TRG-05 |
| A2-PH5-3 | Daily reconciliation reports | IN | P7-03, P8-04 |
| A2-PH5-4 | Monthly financial closing | IN | P8-03 |
| A2-PH5-5 | Exception monitoring dashboard | IN | P8-04 |
| A2-PH5-6 | Role-based financial control testing | IN | P1-10; Part 6 §6 |

### A2 §9 — Finance dashboard and alerts

| ID | Point | Disp | How | Ref |
|---|---|---|---|---|
| A2-DASH-1 | Finance officer sees a complete position (money received, outstanding fees, approved expenditure, available budget) | IN | Control Centre + dashboard cards from ledger/sub-ledgers (example figures in the audit are illustrative only and not requirements) | P8-04, P8-02 |
| A2-DASH-2 | Alerts: payments awaiting ledger posting, unmatched bank transactions, expenses awaiting approval, unpaid supplier invoices, unreconciled payroll liabilities | IN | All listed plus more | D#5 §4.14 |

### A2 §10 — tests and invariants

| ID | Audit test | Disp | Mapped to |
|---|---|---|---|
| A2-TEST-01 | MK 100,000 payment → exactly one entry | IN | T-01 |
| A2-TEST-02 | Same payment request twice → no duplicate | IN | T-02 |
| A2-TEST-03 | Post same journal concurrently → one succeeds | IN | T-03 |
| A2-TEST-04 | Reverse twice → second rejected | IN | T-04 |
| A2-TEST-05 | ICT expense → only ICT budget | IN | T-05 |
| A2-TEST-06 | Approve expense twice → second rejected | IN | T-06 |
| A2-TEST-07 | Fail accounting during payment → payment retained + recoverable exception | MOD | T-07 adapted: no partial state, safe retry (see A1-F3); recovery path tested for legacy/bulk |
| A2-TEST-08 | Mobile-money payment debits correct account | IN | T-08 |
| A2-TEST-09 | Scholarship: discount vs sponsor receivable distinct | IN | T-09 |
| A2-TEST-10 | Payroll: gross = net + all deductions | MOD | T-10 uses the corrected equation (C-09) |
| A2-TEST-11 | Lock payroll twice → no duplicate | IN | T-11 |
| A2-TEST-12 | Reconcile statement → matched/unmatched identifiable | IN | T-12 |
| A2-TEST-13 | Close period → ordinary users cannot alter history | IN | T-13 |
| A2-INV-1 | Σ debits = Σ credits | IN | INV-01 |
| A2-INV-2 | Invoice balance = total − paid | IN | INV-02 (+ line sums) |
| A2-INV-3 | Payment = allocated + advance credit | MOD | INV-03 restated on **applied** amounts (C-01) |
| A2-INV-4 | Budget available = allocated − committed − spent | IN | INV-05 |
| A2-INV-AUTO | Invariants tested automatically, not just displayed | IN | CI + nightly monitor, Part 6 §6.3 |

### A2 §11–§12 — verdict and next deliverable

| ID | Point | Disp | Where addressed |
|---|---|---|---|
| A2-V-01 | Component assessment table (fee mgmt good; accounting needs hardening; budgets need correction; bank reconciliation major gap; audit/recovery needs strengthening; etc.) | IN | Each "needs/gap" row has tasks above; "good foundation" rows are preserved (D-10) |
| A2-V-02 | Source-code audit only; production not accessed | IN | Same limit stated; P0-02 supplies the live-data check |
| A2-NEXT-1 | Deeper audit of ten model questions | IN | Done by Audit 1; verified here |
| A2-NEXT-2 | Spec content: current architecture and data flow | IN | Part 1 §3 |
| A2-NEXT-3 | DB relationship diagram | MOD | Relationship table form in Part 3 (no graphics) — diagrams can be produced from the final Prisma schema at P0 |
| A2-NEXT-4 | Financial workflow diagrams | MOD | Step-by-step workflow specs and state machines in Parts 3–4 (text); diagrams can be generated later |
| A2-NEXT-5 | Accounting corrections | IN | Part 3 §5, §16 |
| A2-NEXT-6 | Security and fraud-risk findings | IN | Part 1 §5; SoD in Part 5 §1.4 |
| A2-NEXT-7 | Missing models and relationships | IN | Part 3 |
| A2-NEXT-8 | API and service recommendations | IN | Part 4 |
| A2-NEXT-9 | Permission matrix for Finance, High Rank, Admin | IN | Part 5 §1 |
| A2-NEXT-10 | Automated financial-integrity test plan; prioritised roadmap | IN | Part 6 §3, §6 |
| A2-NEXT-11 | Do not replace the Finance module or build a second accounting system | IN | D-10; `accountingService` strengthened in place |

---

## I. Summary of what was *not* done, and why

| Item | Disposition | Reason |
|---|---|---|
| Posting for `StudentFeeCommitment`, `Budget`, `BudgetCommitment`, `PurchaseRequisition`, `SalaryStructure`, `StaffAllowance` (A1-GL-07/09/10/11/15/16) | DROP | Not financial events (intentions, controls, configuration or inputs posted elsewhere) |
| Separate posting for `InstallmentPlan` | MOD (reconcile, don't post) | Would double count an existing receivable |
| PO-time supplier liability | MOD | Liability at approved supplier invoice |
| Serializable isolation (A2-F2) | MOD | Conditional claims + unique keys suffice |
| Retained payment with no journal after accounting failure (A2-TEST-07, A2-F1 literal) | MOD | Removing that state is the fix |
| Fixed assets, inventory valuation, GRN accrual | DEF | Need accountant policy (OQ-14/15); designed and gated |
| Donations / other-income / loans-received modules | MOD | No such module exists; manual journals cover them until needed |
| Audit's diagrams | MOD | Textual specification now; diagrams generated from the final schema |
