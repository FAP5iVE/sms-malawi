# SMS Malawi — Finance Hardening Plan · Part 3
## Data model, Chart of Accounts, posting rules, state machines, invariants

**Plan only — no migration is created by this document.** Conceptual models must be reconciled with `schema.prisma` at implementation time (V-12). Reuse existing models; every change below is **additive** unless marked *(constraint change)*.

Conventions: Prisma `camelCase` fields, `@@map("snake_case_plural")`, operational money `Decimal(12,2)`, ledger money `Decimal(14,2)`, financial relations `onDelete: Restrict`, `version Int @default(0)` where optimistic locking is noted, no hard deletes of financial rows (TRG-08). "Legacy" columns stay and are documented, never dropped in this programme.

---

## 1. Legacy columns and how their meaning is preserved

| Column | New status |
|---|---|
| `PaymentAllocation.amount` | Legacy = *requested* allocation (may include excess). New `appliedAmount` / `excessAmount` are authoritative (C-01). |
| `Payment.reference` | Raw text as typed. `referenceNormalized` + `referenceNamespace` carry the unique key. |
| `StudentCredit.sourcePaymentId` (string) | Kept; real FK `paymentId` added and backfilled. |
| `Invoice.scholarshipId`, `InvoiceLineItem.feeStructureId` (plain strings) | Kept; become real optional relations after orphan check (A1-OR-02/03). |
| `Expense.paidAt/paidByUid` | Kept as a mirror of the latest `ExpensePayment`; authoritative data is the payment record. |
| `Expense.receiptKey`, `Payment.receiptKey` | Kept as "primary evidence" pointer; evidence of record is `FinancialEvidence`. |
| `StaffLoan.totalRepaid`, `balance` | Kept as a **cache** of Σ repayments; verified by INV-11. |
| `JournalEntry.reference` | Informational only; identity is the source key (UQ-04). |
| `LibraryFine.clearedByUid/paidAt` | Mirror of the latest `LibraryFinePayment`. |
| `PayrollRun.status = COMPLETED/LOCKED` | Retained; semantics clarified in SM-09. |
| `ChartOfAccount.balance` | Cache of Σ posted lines, verified nightly (INV-08); reports read lines. |
| `PaymentMethod.MOBILE_MONEY` | Legacy value; rejected for new payments (use AIRTEL_MONEY / TNM_MPAMBA). |

---

## 2. Money, rounding, numbering

### 2.1 Money utility (P1-01)
One module `lib/money` (new, tiny; justified because six services currently re-implement rounding) built on Prisma's runtime `Decimal`:
- `money(x)` (accepts string/number/Decimal; numbers must have ≤ 2 dp or are rejected), `add`, `sub`, `mul(x, factor)`, `round2` (**half-up**, D-11), `sum([...])`, `eq/gt/gte/lt/lte`, `isZero`.
- `allocate(total, weights[])` — **largest-remainder** allocation so Σ parts = total exactly (discount shares, payroll splits, pro-rata interest/principal).
- `toNumber` only at the API/display boundary.
- Zod helper `moneyInput({min, max})` in `packages/shared/schemas/finance.ts`: finite, ≤ 2 dp, `> 0` where a transaction amount, upper bound from settings.

All finance services use `Decimal` end-to-end (fees, payroll, budgets, loans, ledger deltas). Removes X-11, X-15, X-40.

### 2.2 Sequential numbering (P2-07)
New model `SequenceCounter {key, scope, nextValue}` with `@@unique([key, scope])`. A number is taken **inside the business transaction** with an atomic `UPDATE … SET nextValue = nextValue + 1 RETURNING` — a rollback also returns the number, so numbers are **gapless**. Contention is acceptable at school volume.

| Key | Format | Used by |
|---|---|---|
| `INV` | `INV-{openingYear}-{0000}` (existing format preserved, counter replaces "max + 1", fixes X-26) | Invoice |
| `PMT` | `PMT-{YYYY}-{000000}` | Payment |
| `RCT` | `RCT-{YYYY}-{000000}` | Receipt (shown on PDF; replaces `prefix-paymentId.slice(0,8)`, X-25) |
| `JE` | `JE-{YYYY}-{000000}` | Journal entry |
| `TXN` | `TXN-{YYYY}-{000000}` | Financial transaction |
| `VCH` | `VCH-{YYYY}-{000000}` | Expense/supplier payment voucher |
| `RFD` | `RFD-{YYYY}-{00000}` | Refund |
| `TRF` | `TRF-{YYYY}-{00000}` | Account transfer |
| `LFN` / `LFP` | `LFN-…` fine, `LFP-…` fine receipt | Library fines |
| `PD` / `REM` | payroll disbursement / statutory remittance | Payroll |
| `FA` | `FA-{000}` | Financial account display code |
| `REC` | `REC-{YYYY}-{000}` | Reconciliation |

---

## 3. Core ledger (A1-F1, F2, DEL; A2-F2, F3)

### 3.1 `JournalEntry` — new columns
| Field | Type | Purpose |
|---|---|---|
| `entryNumber` | String `@unique` | UQ-01 |
| `status` | enum `JournalStatus` DRAFT · POSTED · REVERSED | Replaces reliance on `isPosted`; CHECK keeps `isPosted ⇔ status≠DRAFT` |
| `entryKind` | enum NORMAL · REVERSAL · ADJUSTMENT · OPENING · RECLASSIFICATION · TRANSITION · BACKFILL · MANUAL | Distinguishes system, corrective and historical entries |
| `createdByUid` | String? | Fixes X-09 (nullable for legacy) |
| `sourceType` / `sourceId` | enum? / String? | Mirror of the register source (fast filtering) |
| `financialTransactionId` | String? `@unique` → `FinancialTransaction` | Real source link (A1-OR-JE, UQ-03) |
| `reversalOfId` | String? `@unique` self-relation | **Exactly one reversal per original** (UQ-02) |
| `reversedAt/ByUid`, `reversalReason` | set on the **original** in the same transaction | A1-F2, A2-F3 |
| `periodId` | → `FinancialPeriod` | Period guard (TRG-04) |
| Indexes | `(entryDate)`, `(status)`, `(sourceType, sourceId)`, `(periodId)` | |

### 3.2 `JournalLine` — new columns
`lineNumber Int`, `memo`, `financialAccountId?` (which registry account moved), `partyType?` (STUDENT · STAFF · SUPPLIER · SPONSOR · GUARDIAN · OTHER), `partyId?`, `budgetId?`, `departmentId?`. Index `(accountId, partyType, partyId)` — this is what lets **control accounts be reconciled to sub-ledgers** (INV-09). CHECK CHK-01: `debit ≥ 0 AND credit ≥ 0 AND (debit = 0 OR credit = 0) AND (debit > 0 OR credit > 0)`.

### 3.3 `ChartOfAccount` — new columns
`isSystem Boolean` (protected mapping targets), `isPostable Boolean` (false for header/grouping), `parentId?` (self), `statementSection` enum (CURRENT_ASSET · NON_CURRENT_ASSET · CURRENT_LIABILITY · NON_CURRENT_LIABILITY · EQUITY · OPERATING_REVENUE · OTHER_REVENUE · CONTRA_REVENUE · OPERATING_EXPENSE · OTHER_EXPENSE), `deactivatedAt?`. Existing free-text `category` stays. **Codes are immutable once any line exists; accounts are never deleted; deactivation requires zero balance and no pending source records.**

### 3.4 Posting algorithm (the only way a journal is posted) — `accountingService` rewritten **in place**
All three functions accept an optional transaction client `tx` and run inside the caller's transaction when given (root-cause fix of A1-F3, C-11):
1. **Create (DRAFT)**: validate lines (≥ 2, each CHK-01, accounts active **and postable**, resolved through `AccountMapping` keys not literal codes, party dims where the account is a control account), **Σ debits = Σ credits exactly (tolerance removed, X-10)**, period open for `entryDate`, `createdByUid` stored.
2. **Post (claim)**: `UPDATE journal_entries SET status='POSTED', is_posted=true, posted_at=now(), posted_by_uid=$u WHERE id=$id AND status='DRAFT'` — **row count must be 1**, otherwise `409 ALREADY_POSTED` (A1-F1). Only the winner continues.
3. **Balance update** (same transaction): deltas computed in `Decimal`; accounts processed **in ascending id order** (deadlock-free); `UPDATE chart_of_accounts SET balance = balance + $delta WHERE id=$id` (atomic increment).
4. **Reverse**: `UPDATE journal_entries SET status='REVERSED', reversed_at=now(), reversed_by_uid=$u, reversal_reason=$r WHERE id=$id AND status='POSTED'` (row count 1) → create the mirror entry (`entryKind=REVERSAL`, `reversalOfId=$id`, debit/credit swapped, **dated by the caller** — original date for error correction, current date otherwise, per period rules) → post it. A second reversal fails on the claim **and** on UQ-02.
5. Every function returns the entry; callers never write `journal_*` tables directly.

### 3.5 Immutability triggers (D-12; A1-DEL) — see §15 TRG-01…TRG-04

### 3.6 Balances and opening balances
Account balance for any date = Σ posted lines (+ `AccountPeriodBalance` snapshot of the last closed period as a starting point for speed). `ChartOfAccount.balance` remains a cache; INV-08 compares it to the sum nightly and raises a `PostingException` on mismatch. Opening balances are **only** introduced by approved `entryKind=OPENING` entries (§7.3), never by editing a balance (A2-§5 opening balances).

---

## 4. Central register (D-09; A1-§13, A2-§6)

### 4.1 `FinancialTransaction`
| Field | Notes |
|---|---|
| `id`, `transactionNumber` `@unique` | `TXN-…` |
| `type` | enum `FinancialTransactionType` (see §4.4) |
| `sourceType`, `sourceId`, `eventKey` | **`@@unique([sourceType, sourceId, eventKey])` (UQ-04)** — the master duplicate guard. Examples: `(PAYMENT, <id>, RECEIPT)`, `(PAYMENT, <id>, REVERSAL)`, `(EXPENSE, <id>, RECOGNITION)`, `(EXPENSE_PAYMENT, <id>, PAYMENT)`, `(PAYROLL_RUN, <id>, RECOGNITION:v1)`, `(LIBRARY_FINE, <id>, ASSESSMENT)`. |
| `direction` | IN · OUT · INTERNAL · NONE |
| `amount`, `currency` (`MWK`) | primary amount |
| `financialAccountId?` | registry account affected (money in/out) |
| `partyType?`, `partyId?` | counterparty |
| `occurredAt` | **business date** (paidAt, incurredAt…) → journal `entryDate` (fixes X-14) |
| `recordedAt` | system time |
| `status` | PENDING_POSTING · POSTED · POSTING_FAILED · REVERSED (SM-02) |
| `journalEntryId?` | `@unique`; CHK-17: `status='POSTED' ⇒ journalEntryId NOT NULL` |
| `reversalOfId?` | `@unique` self |
| `idempotencyKey?`, `requestFingerprint?` | link to `IdempotencyRecord` |
| `actorUid`, `actorRole`, `approvedByUid?` | who |
| `postingAttempts`, `lastError`, `nextRetryAt`, `postedAt` | recovery (A1-F3, A2-F1) |

### 4.2 `IdempotencyRecord` (C-02, X-16)
`scope`, `key`, `actorUid`, `requestHash`, `status` IN_PROGRESS · COMPLETED · FAILED, `responseStatus`, `responseBody Json?`, `financialTransactionId?`, `createdAt`, `completedAt`, `expiresAt`. `@@unique([scope, key])` (UQ-06). **Durable, fail-closed**, retained ≥ 90 days. Same key + same hash → return the stored response; same key + different hash → `422 IDEMPOTENCY_KEY_REUSED`; concurrent duplicate → `409 IN_PROGRESS`. The Redis layer stays as a cheap first filter but is never relied on.

### 4.3 `PostingException` (financial exception management, A2-MC-11)
`kind` enum: MISSING_JOURNAL · POSTING_FAILED · UNBALANCED_ENTRY · DUPLICATE_SOURCE · ORPHAN_SOURCE · LEDGER_CACHE_MISMATCH · SUBLEDGER_MISMATCH · INVARIANT_VIOLATION · STALE_COMMITMENT · UNMATCHED_RECEIPT · EVIDENCE_MISSING · PERIOD_BLOCKED · JOB_FAILURE. Fields: `severity` (INFO · WARNING · ERROR · CRITICAL), `sourceType/sourceId`, `detail Json`, `fingerprint` (partial unique while OPEN, prevents duplicates), `status` OPEN · ACKNOWLEDGED · RESOLVED · ACCEPTED, `detectedAt`, `resolvedByUid/At`, `resolutionNote`, `autoRetry Boolean`. Written by the integrity monitor and by any failed posting.

### 4.4 `FinancialTransactionType` values
STUDENT_INVOICE_RECOGNITION · DEFERRED_INCOME_RELEASE · LATE_PENALTY · INVOICE_ADJUSTMENT · INVOICE_VOID · STUDENT_PAYMENT · STUDENT_PAYMENT_REVERSAL · CREDIT_APPLICATION · STUDENT_REFUND · SPONSOR_PAYMENT · EXPENSE_RECOGNITION · EXPENSE_PAYMENT · EXPENSE_REVERSAL · ADVANCE_PAYMENT · ADVANCE_RECONCILIATION · ADVANCE_RETURN · ADVANCE_WRITE_OFF · PAYROLL_RECOGNITION · PAYROLL_REVERSAL · PAYROLL_DISBURSEMENT · STATUTORY_REMITTANCE · LOAN_DISBURSEMENT · LOAN_REPAYMENT · LOAN_WRITE_OFF · LIBRARY_FINE_ASSESSMENT · LIBRARY_FINE_PAYMENT · LIBRARY_FINE_WAIVER · LIBRARY_FINE_CANCEL · ACCOUNT_TRANSFER · RECONCILIATION_ADJUSTMENT · OPENING_BALANCE · RECLASSIFICATION · MANUAL_JOURNAL · ACCRUAL_TRANSITION · ASSET_CAPITALISATION · ASSET_DEPRECIATION · ASSET_DISPOSAL · INVENTORY_ADJUSTMENT · HISTORICAL_CORRECTION.

### 4.5 `FinancialEvidence` (append-only; X-08, A1-OR-FILE, A1-EV-*)
`ownerType`, `ownerId`, `kind` (RECEIPT · BANK_SLIP · MOBILE_MONEY_SMS · SUPPLIER_INVOICE · DELIVERY_NOTE · APPROVAL_DOC · SPONSOR_AGREEMENT · STATEMENT · OTHER), `fileKey`, `fileName`, `mimeType`, `sizeBytes`, `sha256`, `uploadedByUid`, `uploadedAt`, `supersededById?` (self). **Replacing evidence = new row superseding the old; nothing is overwritten or deleted** (TRG-06). A nightly job confirms each `fileKey` still exists in storage and raises `EVIDENCE_MISSING`.

---

## 5. Chart of Accounts v2 and the AccountMapping (D-13; A1-F5, F13, A2-F5)

### 5.1 Accounts (existing codes unchanged; new codes added)
| Code | Name | Type | Notes |
|---|---|---|---|
| 1000 | Cash / Bank — Unallocated (legacy) | ASSET | existing; **no new postings** except reclassification/legacy backfill (D-14) |
| 1010–1049 | Cash on hand accounts | ASSET | created by the registry (CASH) |
| 1050–1099 | Bank accounts | ASSET | registry (BANK) |
| 1100 | Accounts Receivable — Student Fees | ASSET | existing "Accounts Receivable" |
| 1110 | Receivable — Library Fines | ASSET | new |
| 1120 | Receivable — Sponsors | ASSET | new |
| 1150 | Staff Loans Receivable | ASSET | new |
| 1160 | Advances & Prepayments | ASSET | new (asset advances) |
| 1200 | Library Inventory | ASSET | existing |
| 1300–1339 | Mobile-money wallets | ASSET | registry (MOBILE_MONEY) |
| 1340–1379 | Clearing accounts (POS, cheques, settlement) | ASSET | registry (CLEARING) |
| 1390 | Transfers In Transit | ASSET | new, system |
| 1400 / 1410 | Fixed Assets — Cost / Accumulated Depreciation | ASSET | gated (P8-05) |
| 2000 | Accounts Payable — Suppliers | LIABILITY | existing; **suppliers only** from now on |
| 2100 | Salaries Payable (net pay) | LIABILITY | existing |
| 2110 | PAYE Payable | LIABILITY | new |
| 2120 | Pension Payable — Employee | LIABILITY | new |
| 2121 | Pension Payable — Employer | LIABILITY | new (D-02) |
| 2130 | Other Statutory Payables — Employer | LIABILITY | new placeholder (D-02, OQ-06) |
| 2200 | Student Credit Liability | LIABILITY | new |
| 2210 | Deferred Fee Income | LIABILITY | new |
| 2250 | Refunds Payable | LIABILITY | new |
| 2300 | Sponsor Funds Received in Advance | LIABILITY | new |
| 2900 | Suspense — Unidentified Receipts | LIABILITY | new |
| 3000 | Retained Surplus | EQUITY | existing |
| 3100 | Opening Balance Equity | EQUITY | new |
| 3200 | Accrual Transition Adjustment | EQUITY | new (PR-33) |
| 4000 / 4100 / 4200 | Tuition / Boarding / Exam Fee Revenue | REVENUE | existing |
| 4300 | Library Fine Revenue | REVENUE | existing |
| 4310 | Late Payment Penalty Revenue | REVENUE | new |
| 4350 | Staff Loan Interest Income | REVENUE | new |
| 4400 / 4500 / 4600 / 4700 / 4800 | Transport / Uniform / Levy / Activity / Other Fee Revenue | REVENUE | new (X-23) |
| 4900 | Scholarships & Discounts Allowed | CONTRA_REVENUE | new |
| 4910 | Library Fine Waivers | CONTRA_REVENUE | new |
| 5000 | Staff Salaries Expense | EXPENSE | existing |
| 5010 | Employer Pension Contribution | EXPENSE | new |
| 5020 | Other Employer Statutory Costs | EXPENSE | new |
| 5100 / 5200 / 5300 / 5900 | Utilities / Maintenance / Procurement / Miscellaneous | EXPENSE | existing |
| 5400 | Bank & Mobile-Money Charges | EXPENSE | new |
| 5500 | Depreciation | EXPENSE | gated |
| 5910 | Bad Debts & Write-offs | EXPENSE | new |
| 5920 | Asset Advance Write-offs | EXPENSE | new |
| 5930 | Inventory Losses | EXPENSE | gated (D-20) |
| 5990 | Reconciliation Differences | EXPENSE | new |

The seed (`seedChartOfAccounts`) becomes an idempotent **upsert-by-code** that only adds missing accounts; existing names/balances are never overwritten. Account names marked "existing" may be re-labelled for clarity (name only).

### 5.2 `AccountMapping` — posting rules reference *keys*, not codes
Model: `id`, `key`, `ledgerAccountId`, `effectiveFrom`, `supersededAt?`, `createdByUid`, `approvedByUid`, `approvedAt`. `UQ-22`: one **current** mapping per key. A change inserts a new row and supersedes the old; **High Rank approval is required**; the resolver validates the account **type, postable, active** for the key. Keys:

`REVENUE.FEE.{TUITION|BOARDING|EXAM|TRANSPORT|UNIFORM|LEVY|ACTIVITY|OTHER}` · `REVENUE.PENALTY` · `REVENUE.LIBRARY_FINE` · `REVENUE.LOAN_INTEREST` · `CONTRA.SCHOLARSHIP` · `CONTRA.FINE_WAIVER` · `AR.STUDENT` · `AR.FINE` · `AR.SPONSOR` · `ASSET.LOAN_RECEIVABLE` · `ASSET.ADVANCES` · `ASSET.IN_TRANSIT` · `ASSET.LEGACY_CASH` · `LIAB.AP` · `LIAB.SALARIES` · `LIAB.PAYE` · `LIAB.PENSION_EE` · `LIAB.PENSION_ER` · `LIAB.STATUTORY_OTHER` · `LIAB.STUDENT_CREDIT` · `LIAB.DEFERRED_INCOME` · `LIAB.REFUNDS_PAYABLE` · `LIAB.SPONSOR_ADVANCE` · `LIAB.SUSPENSE` · `EQUITY.OPENING` · `EQUITY.TRANSITION` · `EQUITY.RETAINED` · `EXPENSE.PAYROLL` · `EXPENSE.EMPLOYER_PENSION` · `EXPENSE.EMPLOYER_OTHER` · `EXPENSE.BANK_CHARGES` · `EXPENSE.BAD_DEBT` · `EXPENSE.ADVANCE_WRITEOFF` · `EXPENSE.RECON_DIFF` · `EXPENSE.CATEGORY.{UTILITIES|MAINTENANCE|PROCUREMENT|LIBRARY|TRANSPORT|MISCELLANEOUS}`.

`EXPENSE.CATEGORY.SALARIES` is **intentionally absent**: manual expenses in category SALARIES are blocked (setting `finance.expense.allowSalariesCategory=false`) to stop double-counting payroll (X-32). The existing hard-coded `EXPENSE_CATEGORY_ACCOUNT` map in `expenseApprovalService` becomes mapping lookups.

**Fee → revenue**: `FeeStructure.revenueMappingKey?` overrides the category default (so *Exam* fees map to `REVENUE.FEE.EXAM` although `FeeCategory` has no EXAM value, X-23). The key is **snapshotted onto `InvoiceLineItem`** at creation so later mapping/catalogue edits never change historical classification (A1-F5, A1-OR-03).

---

## 6. Payment Accounts Registry (D-03, D-06 — the owner's specification)

### 6.1 Models
**`FinancialAccount`**
| Field | Notes |
|---|---|
| `id`, `accountCode` (`FA-001`, sequential, `@unique`) | |
| `category` enum `FinancialAccountCategory` | BANK · MOBILE_MONEY · CASH · CLEARING |
| `displayName` | e.g. "FDH Bank — School Fees" |
| `providerName`, `providerId?` | free text; `providerId` links to a suggestion row when picked |
| `registeredName` | bank/wallet account name |
| `accountNumberEnc`, `accountNumberLast4`, `accountFingerprint` | number **encrypted at rest** (`node:crypto` AES-256-GCM, key from env `FINANCE_DATA_KEY`; V-05), last-4 for masked display, **HMAC fingerprint** for duplicate detection without decrypting. Mobile numbers use the same fields. |
| `branch?`, `custodianStaffId?`, `location?` | cash office custodian/location |
| `currency` (`MWK`) | D-27 |
| `purpose` / `description` | |
| `supportedMethods PaymentMethod[]` | which methods may be received/paid through this account (Airtel account → `[AIRTEL_MONEY]`; bank → `[BANK_TRANSFER, CHEQUE?]`; cash → `[CASH]`; POS clearing → `[POS_CARD]`; cheque clearing → `[CHEQUE]`) |
| `allowedUses AccountUse[]` | RECEIVE_STUDENT_PAYMENTS · RECEIVE_FINES · RECEIVE_SPONSOR_FUNDS · PAY_EXPENSES · PAY_SUPPLIERS · PAY_PAYROLL · PAY_STATUTORY · DISBURSE_LOANS · TRANSFERS · REFUNDS |
| `ledgerAccountId` | → `ChartOfAccount`, **`@unique` (UQ-20)** — one ledger account per financial account, so balances are exact |
| `settlementAccountId?`, `settlementDelayDays?`, `expectedFeeRule Json?` | mobile-money/POS settlement into a bank account (§13) |
| `requiresReconciliation Boolean` | false for petty cash |
| `status` | DRAFT · ACTIVE · INACTIVE · ARCHIVED (SM-18) |
| `openingBalanceDate?`, `openingEntryId?` | opening via journal only (§7.3) |
| `createdByUid`, `approvedByUid/At`, `deactivatedAt/By/Reason`, `version` | |

**`FinancialProvider`** (suggestions only): `name`, `category`, `isActive`, `isSuggested`. Users may type a provider not listed.
**`FinancialAccountRevision`**: `accountId`, `version`, `changedFields Json` (masked), `changedByUid`, `reason`, `createdAt` — the "creation and modification history" (§3.1 of the owner's spec).

### 6.2 Rules
1. **No hardcoded providers, accounts or enums**; adding an account needs no deployment.
2. **Method ≠ account** (D-06): a payment stores `method` *and* `financialAccountId`. The service rejects a pair where `method ∉ account.supportedMethods`.
3. **Ledger link**: at creation Finance either (a) lets the service **create** the next free ledger code in the category's range inside the same transaction, or (b) **selects an existing, active, postable, unlinked, type-compatible** ledger account. Editing an account never creates ledger accounts. Changing the ledger link is allowed **only** while the account has no posted lines, and needs High Rank approval; otherwise use a reclassification entry (PR-29).
4. **Lifecycle (SM-18)**: DRAFT (incomplete/awaiting approval) → ACTIVE (selectable for new transactions) → INACTIVE (not selectable; history intact) → ARCHIVED (read-only; requires zero ledger balance, no unmatched statement lines, no pending settlements). **Never hard-deleted** (TRG-08).
5. **Duplicates**: `accountFingerprint` is unique among non-archived accounts (UQ-21); the form warns before saving.
6. **Approval**: creating, changing sensitive details (number, ledger link, supported methods, uses) and activating/deactivating go through the approval policy (Finance prepares → High Rank approves; the same person cannot do both).
7. **Masking**: lists show `•••• 1234`; full details only to holders of `finance.viewFinancialAccountDetails`, every reveal is audited.
8. **Selectable accounts API** returns only ACTIVE accounts compatible with the **currency, workflow use and payment method** (Doc 4 §14).
9. **Transaction references** use `financialAccountId` (a stable id), never copied bank names; a masked snapshot (`accountDisplayName`, `last4`) is stored on receipts/vouchers for printing.
10. **Balance** shown in the UI is **derived from posted ledger lines**; there is no editable balance field.

### 6.3 Method × account compatibility (default; overridable per account via `supportedMethods`)
| Method | Allowed account categories | Reference rule |
|---|---|---|
| CASH | CASH | none; cash-office receipt number |
| BANK_TRANSFER | BANK | bank reference/slip no., unique per bank account |
| CHEQUE | CLEARING (cheque clearing) | cheque no. + drawer bank, unique per drawer bank |
| AIRTEL_MONEY | MOBILE_MONEY (provider Airtel) | provider transaction ID, unique per provider |
| TNM_MPAMBA | MOBILE_MONEY (provider TNM) | provider transaction ID, unique per provider |
| POS_CARD | CLEARING (POS) | terminal RRN/approval code |
| MOBILE_MONEY (legacy) | — rejected for new records | — |

---

## 7. Financial periods, opening balances, accrual cutover (D-19, D-01a)

### 7.1 `FinancialPeriod`
`startDate` (unique), `endDate`, `fiscalYear`, `status` OPEN · SOFT_CLOSED · CLOSED (SM-19), `closedByUid/At`, `reopenedByUid/At`, `reopenReason`, `closeChecklist Json`. Monthly periods generated from a fiscal-year-start setting (OQ-04). Entries are resolved to a period by `entryDate`; TRG-04 rejects posting into CLOSED periods; SOFT_CLOSED needs a High Rank override recorded on the entry.

`AccountPeriodBalance` (snapshot at close): `accountId`, `periodId`, `openingBalance`, `debits`, `credits`, `closingBalance`.

### 7.2 Close prerequisites (enforced by the close service)
All registered accounts with `requiresReconciliation` reconciled to the period end; no OPEN `PostingException` of severity ≥ ERROR; deferred-income release job completed for the period; payroll runs of the period locked and either disbursed or explicitly accepted as unpaid; integrity checker clean (INV-01…30 for the period).

### 7.3 Opening balances (A2-§5)
Per **financial account**: Finance enters the balance **as of a date with evidence** (bank/wallet statement, cash count); High Rank approves; posting `entryKind=OPENING`: Dr account ledger / Cr `EQUITY.OPENING` (reverse for overdrafts). One opening per account (`openingEntryId` unique). Receivable/payable openings are **never typed**: they come from the sub-ledgers through the accrual cutover.

### 7.4 `AccrualCutover`
`cutoverDate`, `status` DRAFT · PREVIEWED · APPROVED · APPLIED, `previewReport Json`, `approvedByUid/At`, `appliedAt`, `entryIds`. Runs only through the repair runbook (Doc 6 §5). Posting rule PR-33.

---

## 8. Receivables models (A1-F3/F4/F5/F14, A1-OP-01..04, A1-§10A/C/D, X-18..X-26)

### 8.1 `Invoice`
Add: `status` value **VOID** *(enum value added)*; `voidedAt/By/Reason`; `recognitionDate`; `recognitionStatus` NOT_POSTED · POSTED · DEFERRED; `creditApplied`; `version`; real relation `scholarshipId → Scholarship`. **Semantics fix (X-19):** `totalAmount = Σ lineItem.amount` always; credit is a **settlement** (`CreditApplication`) that raises `paidAmount`/line `paidAmount`, never a silent reduction of `totalAmount`. OVERDUE becomes **derived** (due date passed and balance > 0) so a partial payment can no longer erase it (X-21); the stored status keeps UNPAID/PARTIAL/PAID/VOID, and `OVERDUE` remains for legacy compatibility until the UI is migrated.
CHK-02/03: `0 ≤ paidAmount ≤ totalAmount`, `balance = totalAmount − paidAmount`.

### 8.2 `InvoiceLineItem`
Add: `kind` FEE · LATE_PENALTY · ADJUSTMENT; `feeCategory?`; `revenueMappingKey` (**snapshot**); `grossAmount`, `discountShare` (so revenue can be recognised gross for sponsor-funded awards, §16 PR-01); `recognisedAmount`; `recognitionDate`; `version`. UQ-10: `(invoiceId, feeStructureId)` partial for `kind='FEE'`. Real optional relation to `FeeStructure` (Restrict). Cascade from `Invoice` changes to **Restrict** *(constraint change)*. CHK-04.

### 8.3 `Payment`
Add: `paymentNumber` (UQ), **`financialAccountId`** (FK `FinancialAccount`; nullable only for legacy rows), `creditAmount`, `referenceNormalized`, `referenceNamespace` (UQ-08, partial, excludes reversed), `methodDetails Json?` (drawer bank, cheque no., payer phone), `payerName`, `status` RECORDED · REVERSED, `verificationStatus` UNVERIFIED · MATCHED · DISPUTED, `recordedAt` (system) vs `paidAt` (business date, validated: not in the future, not in a closed period, back-dating window from settings), `reversedAt/By/Reason`, `reversalApprovedByUid`, `idempotencyKey`. TRG-07 freezes money fields after insert.

### 8.4 `PaymentAllocation` (C-01)
Add `appliedAmount`, `excessAmount` (`amount` = legacy requested). CHK-05. **INV-03:** `Payment.amount = Σ appliedAmount + Payment.creditAmount`. Cascade from `Payment` → **Restrict**.

### 8.5 `StudentCredit`, `CreditApplication`
`StudentCredit` add `paymentId` FK, `status` OPEN · EXHAUSTED · REFUNDED · REVERSED, `refundedAmount`, `version`; CHK-07 `0 ≤ amount ≤ originalAmount`. **`CreditApplication`** `{creditId, invoiceId, amount, appliedByUid?, appliedAt, reversedAt?}` with `CreditApplicationLine {creditApplicationId, lineItemId, amount}`. Applying credit is a **claim**: `UPDATE student_credits SET amount = amount - $x WHERE id=$id AND amount >= $x` inside the invoice transaction (fixes X-18).

### 8.6 `Refund`
`refundNumber`, `studentId`, `source` CREDIT · PAYMENT_REVERSAL, `studentCreditId?`, `paymentId?`, `amount`, `method`, `financialAccountId`, `reference`, `status` REQUESTED → APPROVED → PAID · REJECTED · CANCELLED (SM-15), `requestedBy/approvedBy/paidBy` (all different people), `evidence`, `reason`.

### 8.7 Installments (A1-§10C)
`Installment` add `paidAmount`, status value `PARTIAL`; new `InstallmentAllocation {installmentId, paymentId, amount}`. Payments auto-allocate to the earliest unpaid instalments after line allocation; INV-23.

### 8.8 Scholarships & sponsors (A1-§10D, X-24)
`Scholarship` add `fundingType` SCHOOL · SPONSOR, `sponsorId?`, `approvalStatus` DRAFT · PENDING · APPROVED · REJECTED, `approvedByUid/At`, `endsAt?`, real relation to `Student`; CHK-13 `PERCENTAGE ⇒ value ≤ 100`; UQ-15 one active per student/year (D-16, validate data first).
New: **`Sponsor`** `{name, type SponsorType, contact…}`; **`SponsorCharge`** `{sponsorId, scholarshipId, invoiceId, amount, paidAmount, status}` created when a sponsor-funded award is applied to an invoice; **`SponsorPayment`** `{sponsorId, amount, method, financialAccountId, reference, paidAt}` with `SponsorPaymentAllocation`. A sponsor **award** and a sponsor **payment** are different events (A1-§10D).

### 8.9 `FeeStructure`
Add `revenueMappingKey?`. (Edits never change existing invoices — lines snapshot.)

---

## 9. Expenses, budgets, procurement (A1-F6/F7/F8/F9, §10B, X-27..X-34)

### 9.1 `Expense`
Add: `expenseNumber`, `budgetAllocations` relation, `paymentStatus` UNPAID · PARTIALLY_PAID · PAID, `payeeName`, `supplierInvoiceId? @unique`, `recognisedAt`, `version`. Existing procurement columns (`supplierId`, `purchaseOrderId`, `goodsReceiptId`, `supplierInvoiceNumber`, `verifiedBy/At`) become **written** by the bridge (P4-06/07). Status stays PENDING · APPROVED · REJECTED; **payment is a separate record**.
**`ExpenseBudgetAllocation`** `{expenseId, budgetId, amount}`, UQ-31, **Σ = expense amount at approval** (A1-F6, A2-F4).
**`ExpensePayment`** (voucher): `voucherNumber`, `supplierId?`, `payeeName`, `amount`, `method`, `financialAccountId`, `reference` (+ normalised/namespace UQ-24), `paidAt`, `paidByUid`, `approvedByUid`, `status` RECORDED · REVERSED, `evidence`, reversal fields; with `ExpensePaymentAllocation {expensePaymentId, expenseId | supplierInvoiceId, amount}`. INV-21.

### 9.2 `Budget`, `BudgetCommitment`, `BudgetConsumption`
`Budget` add `approvalStatus` DRAFT · SUBMITTED · APPROVED · REJECTED, `approvedByUid/At`, `version`; UQ-14 `(academicYear, term, department, category)`; `spent` becomes a **cache** of Σ approved `ExpenseBudgetAllocation` (INV-05).
`BudgetCommitment` add `consumedAmount`, `releasedAmount`, `releasedReason`, `version`; UQ-11/12 partial unique (one **active** commitment per requisition and per PO). **`BudgetConsumption`** `{commitmentId, expenseId, amount}` so deliveries/invoices consume partially. Commitments move RESERVED → COMMITTED → CONSUMED/RELEASED (SM-08). Availability = `allocated − Σ active commitment remaining − spent`, computed **under `SELECT … FOR UPDATE` on the budget row** (X-29).

### 9.3 Procurement
`PurchaseOrder` add `purchaseRequisitionId?` (backfilled; UQ-13 partial, one non-cancelled PO per requisition — D-15, X-34). **`SupplierInvoice`** `{supplierId, invoiceNumber, invoiceNumberNormalized, invoiceDate, dueDate, purchaseOrderId?, goodsReceiptId?, subtotal, tax, total, status RECEIVED · MATCHED · DISPUTED · APPROVED · PAID · VOID, matchResult Json, expenseId?}` with `SupplierInvoiceLine {poLineId?, description, quantity, unitPrice, lineTotal}`; UQ-23 `(supplierId, invoiceNumberNormalized)`. 3-way match = PO lines × GRN accepted quantities × invoice lines within configured tolerances (qty %, price %).
`Supplier.bankDetails` (free text) is superseded by **`SupplierPaymentDetail`** `{supplierId, method, providerName, accountName, accountNumberEnc, last4, fingerprint, approvedByUid, status}` (X-46). The legacy text is retained read-only and migrated manually.

---

## 10. Payroll, statutory costs, loans (A1-F12/F13, A2-§5, X-35..X-42, D-02)

### 10.1 Payroll
`PayrollRun` add `version` (UQ-18 replaces `@@unique([month, year])` with `(month, year, version)` + partial unique on non-VOIDED), status value **VOIDED**, `lockedAt/By`, `rollbackCount`, component totals (`totalPaye`, `totalPensionEmployee`, `totalPensionEmployer`, `totalLoanDeduction`, `totalOtherDeductions`, `totalLeaveDeduction`, `totalEmployerOther`). `discardStuckRun` stops hard-deleting: stuck runs become FAILED/VOIDED (TRG-08).
`Payslip` add `staffId` FK (alongside `staffUid`, A1-OR-09), `employerPension`, `employerOther`, `otherDeduction`, `fineDeduction`, `roundingAdjustment`, `loanRepaymentId?`; UQ-19 `(payrollRunId, staffUid)`; **CHK-11** `netSalary = grossSalary − paye − pension − loanDeduction − otherDeduction − fineDeduction AND netSalary ≥ 0` (gross already net of leave deduction, C-09).
**`PayrollDisbursement`** `{disbursementNumber, payrollRunId, financialAccountId, method, reference, totalAmount, status PENDING · PARTIAL · DISBURSED · FAILED, disbursedAt, confirmedByUid}` with **`PayslipPayment`** `{payslipId, amount, status PAID · FAILED · RETURNED, reference, paidAt}` (A1-F13, A2-§5). INV-20.
**`StatutoryRemittance`** `{remittanceNumber, kind PAYE · PENSION_EMPLOYEE · PENSION_EMPLOYER · OTHER, periodMonth/year, payeeName, amountDue, amountPaid, financialAccountId, reference, paidAt, evidence, status DUE · PAID · PARTIAL · OVERDUE}` (A2-MC-07). INV-26.
Settings (`SystemSettings`, never hardcoded): `payroll.employerPensionPercent`, `payroll.otherEmployerItems` (JSON list of `{name, basis, rate/amount, accountKey}`), plus the existing PAYE/pension keys.

### 10.2 Loans
`StaffLoan` add `interestAmount` (derived from the existing `balance = amount + amount × rate`), `disbursedByUid`, `settledAt?`, `version`; UQ-16 one active loan per staff (partial). **`StaffLoanDisbursement`** `{loanId, amount, method, financialAccountId, reference, paidAt, paidByUid, evidence}` (1:1). **`StaffLoanRepayment`** `{loanId, amount, principalPortion, interestPortion, source PAYROLL · MANUAL · SETTLEMENT · WRITE_OFF, payslipId?, payrollRunId?, financialAccountId?, reference?, recordedByUid, repaidAt, balanceAfter, reversedAt?/By/Reason}`; **UQ-17** one repayment per `(loanId, payslipId)`; CHK enforces `amount ≤ outstanding` at insert (service + trigger). INV-11.

---

## 11. Library fines — students and staff (A1-F10/F11, X-02..X-07, D-07)

`LibraryFine` add: `fineNumber`, `payerType` STUDENT · STAFF (derived from `studentId`/`staffId`, CHK exactly one), `amountPaid`, `status` values **PARTIALLY_PAID, CANCELLED** added (PENDING · PARTIALLY_PAID · PAID · WAIVED · CANCELLED, SM-12), `waiverRequestId?`, `cancelledAt/By/Reason`, `version`; real relations to `Student` / `StaffProfile` (Restrict, A1-OR-05/06) once orphan check passes; CHK-12 `0 ≤ amountPaid ≤ amount`; UQ `(borrowingId, kind)` partial **only if V-08 confirms** one fine per kind per loan.
**`LibraryFinePayment`** `{paymentNumber (LFP), fineId, amount, method, financialAccountId, reference (+normalised/namespace UQ-29), paidAt, receivedByUid, source COUNTER · PAYROLL_DEDUCTION, payslipId?, receiptKey, status RECORDED · REVERSED, reversal fields, idempotencyKey}`.
`FineWaiverRequest` keeps its table; add `decidedByUid`, `decisionReason`, `approvedAmount`, status values REQUESTED · APPROVED · REJECTED · WITHDRAWN. Approval permission moves to **High Rank** (X-06).
Optional (D-23, off by default): **`FineDeductionConsent`** `{fineId, staffId, consentedAt, consentEvidenceKey, maxAmount, approvedByHrUid, status}`.
The full workflow is Doc 4 §9.

---

## 12. Assets and advances (A1-§10E, A1-EV-B, A1-OP-16/17, X-43)

`AssetAdvance` add: `financialAccountId`, `method`, `paymentReference`, `evidence` (required), `supplierId?` FK (replacing free-text `supplier` as authority), `status` stays PENDING/RECONCILED/WRITTEN_OFF + `PARTIALLY_RECONCILED`, `version`. **`AssetAdvanceReconciliation`** `{advanceId, actualExpenditure, returnedAmount, returnAccountId?, writtenOffAmount, expenseId?, notes, preparedByUid, approvedByUid, evidence}`. INV-18: `amount = actualExpenditure + returned + writtenOff (+ outstanding)`. Cap: `Σ advances ≤ request/PO value` (setting `assets.advance.maxPercentOfRequest`). `AssetRequest → AssetAdvance` cascade becomes **Restrict**.
`Asset`: capitalisation and depreciation are **gated** (D-21). When enabled: `Asset.capitalisedEntryId?`, `DepreciationRun {periodId, status}`, `DepreciationLine {assetId, amount}`.

---

## 13. Transfers and reconciliation (A1-§10F, A2-F6, A2-MC-01/02)

- **`AccountTransfer`** `{transferNumber, kind SETTLEMENT · CASH_DEPOSIT · CASH_WITHDRAWAL · FUNDING · CHEQUE_CLEARING, fromAccountId, toAccountId, amountSent, feeAmount, amountReceived, sentReference, receivedReference, valueDate, status DRAFT · PENDING_APPROVAL · APPROVED · IN_TRANSIT · COMPLETED · REJECTED · REVERSED, initiatedBy/approvedBy/completedBy}`. CHK-16 `from ≠ to`; INV-19 `amountSent = amountReceived + feeAmount`.
- **`StatementImport`** `{financialAccountId, periodStart/End, openingBalance, closingBalance, sourceFileKey, fileHash (UQ-25), format, importedByUid, status}`; **`StatementLine`** `{importId, lineDate, description, reference, referenceNormalized, debit, credit, runningBalance, lineHash (UQ-26), matchStatus UNMATCHED · SUGGESTED · MATCHED · EXCLUDED · ADJUSTED}`; **`ReconciliationMatch`** `{statementLineId, financialTransactionId, amount, matchedByUid, method AUTO · MANUAL}`.
- **`Reconciliation`** `{reconciliationNumber, financialAccountId, periodEnd, statementClosingBalance, ledgerBalance, outstandingReceipts, outstandingPayments, adjustedDifference, status DRAFT · IN_REVIEW · APPROVED · LOCKED · REJECTED, preparedBy, reviewedBy, lockedAt}`; UQ-27. Adjustments (bank charges, unknown credits) become `ReconciliationAdjustment` rows that post through the register (PR-27/PR-30/PR-32).
- **`CashCount`** (cash accounts): `{financialAccountId, countedAt, countedAmount, ledgerBalance, variance, countedByUid, witnessUid, approvedByUid}`.
- Mobile-money collections and bank deposits are **different accounts**; a wallet receipt is never assumed to be a bank deposit; settlement is an `AccountTransfer` (§9 of the owner's spec).

---

## 14. Financial audit trail (A2-Phase5, X-17)

New append-only **`FinancialAuditLog`** `{seq (unique, monotonic), occurredAt, actorUid, actorRole, action, entityType, entityId, financialTransactionId?, before Json?, after Json?, reason, requestId, ipAddress?, prevHash, hash}` where `hash = sha256(prevHash ‖ canonical(row))`. Written **inside the same transaction** as the change by `financialAudit.record(tx, …)`; sensitive fields are masked before storage; TRG-05 blocks UPDATE/DELETE and verifies chain linkage; a verifier job (INV-29) re-walks the chain. The general `AuditLog`/`auditService` remains for non-financial modules; finance code stops using the async queue for money events.

---

## 15. Constraints, indexes, triggers catalogue

| ID | Object | Rule | Closes |
|---|---|---|---|
| UQ-01 | `journal_entries.entry_number` | unique | A1-F1 |
| UQ-02 | `journal_entries.reversal_of_id` | unique | A1-F2, A2-F3 |
| UQ-03 | `journal_entries.financial_transaction_id` | unique | A1-OR-JE |
| UQ-04 | `financial_transactions (source_type, source_id, event_key)` | unique | A1-F1/F3/F9/F10, A1-OP-05/14 |
| UQ-05 | `financial_transactions.transaction_number` | unique | |
| UQ-06 | `idempotency_records (scope, key)` | unique | A1-§10A, C-02 |
| UQ-07 | `payments.payment_number` | unique | X-25 |
| UQ-08 | `payments (reference_namespace, reference_normalized)` | partial: reference not null AND status≠REVERSED | A1-§10A |
| UQ-10 | `invoice_line_items (invoice_id, fee_structure_id)` | partial: kind='FEE' | A1-OP-03 |
| UQ-11/12 | `budget_commitments (purchase_requisition_id)` / `(purchase_order_id)` | partial: status IN (RESERVED, COMMITTED) | A1-§3, A1-OP-11 |
| UQ-13 | `purchase_orders (purchase_requisition_id)` | partial: status≠CANCELLED | A1-§10B, A1-OP-12 |
| UQ-14 | `budgets (academic_year, term, department, category)` | expression index with COALESCE for nulls | X-33 |
| UQ-15 | `scholarships (student_id, academic_year)` | partial: is_active | X-24 |
| UQ-16 | `staff_loans (staff_id)` | partial: status IN (APPROVED, DISBURSED, REPAYING) | X-38 |
| UQ-17 | `staff_loan_repayments (loan_id, payslip_id)` | partial: payslip not null, not reversed | A1-F12 |
| UQ-18 | `payroll_runs (month, year, version)` + partial `(month, year)` WHERE status≠VOIDED | *(constraint change)* | X-39 |
| UQ-19 | `payslips (payroll_run_id, staff_uid)` | unique | |
| UQ-20 | `financial_accounts.ledger_account_id` | unique | registry §6 |
| UQ-21 | `financial_accounts.account_fingerprint` | partial: status≠ARCHIVED | registry §8 |
| UQ-22 | `account_mappings (key)` | partial: superseded_at IS NULL | |
| UQ-23 | `supplier_invoices (supplier_id, invoice_number_normalized)` | unique | |
| UQ-24 / UQ-29 | `expense_payments` / `library_fine_payments` `(reference_namespace, reference_normalized)` | partial, not reversed | |
| UQ-25 / UQ-26 | `statement_imports (account, file_hash)` / `statement_lines (import, line_hash)` | unique | |
| UQ-27 | `reconciliations (account, period_end)` | partial: status≠REJECTED | |
| UQ-28 | `financial_periods.start_date` | unique | |
| UQ-31 | `expense_budget_allocations (expense_id, budget_id)` | unique | A1-F6 |
| CHK-01 | `journal_lines` | debit/credit exclusive and non-negative | |
| CHK-02/03 | `invoices` | `0 ≤ paid ≤ total`; `balance = total − paid` | INV-02 |
| CHK-04 | `invoice_line_items` | `paid ≤ amount`; `balance = amount − paid` | |
| CHK-05 | `payment_allocations` | `applied ≥ 0`, `excess ≥ 0` | C-01 |
| CHK-07 | `student_credits` | `0 ≤ amount ≤ original_amount` | X-18 |
| CHK-08/09 | `budgets`, `budget_commitments` | non-negative amounts | |
| CHK-11 | `payslips` | net equation and `net ≥ 0` | X-36, X-40 |
| CHK-12 | `library_fines` | `0 ≤ amount_paid ≤ amount`; exactly one of `student_id`/`staff_id` | |
| CHK-13 | `scholarships` | percentage ≤ 100 | X-24 |
| CHK-14/15 | `expenses`, `payments` | amount > 0 | |
| CHK-16 | `account_transfers` | `from ≠ to` | |
| CHK-17 | `financial_transactions` | `status='POSTED' ⇒ journal_entry_id NOT NULL` | A1-F3 |
| TRG-01 | `journal_entries` | UPDATE of a POSTED/REVERSED row allowed only for `reversed_*`, `status POSTED→REVERSED`; DELETE forbidden unless DRAFT | A1-DEL |
| TRG-02 | `journal_lines` | no INSERT/UPDATE/DELETE when parent not DRAFT | |
| TRG-03 | `journal_entries` DRAFT→POSTED | enforces exact Σdebit = Σcredit, ≥ 2 lines | A2-INV-1 |
| TRG-04 | `journal_entries` | reject post when `entry_date` falls in a CLOSED period | A2-MC-09 |
| TRG-05 | `financial_audit_log` | append-only + hash-chain check | A2-Phase5 |
| TRG-06 | `financial_evidence` | append-only | X-08 |
| TRG-07 | `payments` | money fields (`amount`, `invoice_id`, `method`, `financial_account_id`, `paid_at`) immutable after insert | |
| TRG-08 | financial tables (`invoices`, `invoice_line_items`, `payments`, `payment_allocations`, `expenses`, `expense_payments`, `journal_*`, `payroll_runs`, `payslips`, `staff_loans`, `staff_loan_repayments`, `library_fines`, `library_fine_payments`, `student_credits`, `refunds`, `account_transfers`, `financial_accounts`, `financial_transactions`) | **DELETE forbidden** | A1-DEL |
| FK | `Invoice→LineItems`, `Payment→Allocations`, `AssetRequest→AssetAdvance`, `Student/FeeStructure→StudentFeeCommitment` | `Cascade` → **`Restrict`** *(constraint change)* | A1-DEL |

Triggers/partial indexes/expression indexes are written as **raw SQL inside the Prisma migration** and tested on a Neon branch before use (V-03). Deferred sum-checks across rows (INV-03 etc.) are enforced by the service **and** verified by the integrity monitor; they are not DB constraints.

---

## 16. Posting rules (PR-xx)

Notation: **Dr/Cr** lines; *party* = `partyType/partyId` dimension; accounts are **mapping keys**. `FA` = the ledger account linked to the chosen `FinancialAccount`. Date = business date. Each rule is executed through the register (UQ-04) in the **same transaction** as its source write.

| ID | Event | Journal | Notes |
|---|---|---|---|
| PR-01 | **Invoice recognition** (accrual; D-01) | Dr `AR.STUDENT` Σ line.amount (party student) · Dr `AR.SPONSOR` Σ sponsor-funded discount (party sponsor) · Cr revenue per line `grossAmount − (school-funded discountShare)` using the line's snapshotted `revenueMappingKey` — **or Cr `LIAB.DEFERRED_INCOME`** when recognition date is after posting (D-01b) | Balanced: school-funded → `Σgross − discount`; sponsor-funded → `Σgross`. |
| PR-02 | **Deferred release** (daily job) | Dr `LIAB.DEFERRED_INCOME` / Cr revenue (per line mapping) on `recognitionDate` | Idempotent per `(INVOICE, id, RELEASE:line)`; INV-24. |
| PR-03 | **Student payment** | Dr `FA` amount · Cr `AR.STUDENT` Σ appliedAmount · Cr `LIAB.STUDENT_CREDIT` creditAmount | No revenue at payment (A1-F4/F5 fixed). Account must support the method (D-06). |
| PR-04 | **Credit application** | Dr `LIAB.STUDENT_CREDIT` / Cr `AR.STUDENT` | Settles invoice lines (X-19). |
| PR-05 | **Refund approved** → **paid** | approve: Dr `LIAB.STUDENT_CREDIT` / Cr `LIAB.REFUNDS_PAYABLE`; pay: Dr `LIAB.REFUNDS_PAYABLE` / Cr `FA` | Three different people (request/approve/pay). |
| PR-06 | **Payment reversal** | exact mirror of PR-03 via the reversal engine (+ credit reversed) | High Rank approval; blocked while its credit has been applied/refunded. |
| PR-07 | **Invoice void** | mirror of PR-01 (and of PR-02 if released) | Only when `paidAmount = 0` and no credit applications. |
| PR-08 | **Late penalty** | Dr `AR.STUDENT` / Cr `REVENUE.PENALTY` | Recognised immediately; line `kind=LATE_PENALTY`. |
| PR-09 | **Add line / credit note** | add: PR-01 for the new line · credit note (ADJUSTMENT, negative): Dr revenue or `LIAB.DEFERRED_INCOME` / Cr `AR.STUDENT` | Credit notes need High Rank + reason. |
| PR-10 | **Sponsor payment** | Dr `FA` / Cr `AR.SPONSOR` (up to charges) · excess Cr `LIAB.SPONSOR_ADVANCE` | |
| PR-11 | **Expense recognition** (approval) | Dr `EXPENSE.CATEGORY.*` (or asset) / Cr `LIAB.AP` (party supplier/payee); line dims `budgetId`, `departmentId` | **Approval no longer credits cash** (X-27). |
| PR-12 | **Expense / supplier payment** | Dr `LIAB.AP` / Cr `FA` | Voucher with evidence; may settle several expenses. |
| PR-13 | **Expense reversal** | mirror of PR-11 (and PR-12 if paid) | Needs approval. |
| PR-14 | **Asset advance paid** | Dr `ASSET.ADVANCES` / Cr `FA` | |
| PR-15 | **Advance reconciled / returned / written off** | reconciled: Dr expense or asset / Cr `ASSET.ADVANCES`; returned: Dr `FA` / Cr `ASSET.ADVANCES`; write-off: Dr `EXPENSE.ADVANCE_WRITEOFF` / Cr `ASSET.ADVANCES` | Write-off needs High Rank. |
| PR-16 | **Payroll recognition (lock)** | Dr `EXPENSE.PAYROLL` Σ gross · Dr `EXPENSE.EMPLOYER_PENSION` Σ employer pension · Dr `EXPENSE.EMPLOYER_OTHER` Σ other employer · Cr `LIAB.SALARIES` Σ net · Cr `LIAB.PAYE` Σ PAYE · Cr `LIAB.PENSION_EE` Σ employee pension · Cr `LIAB.PENSION_ER` · Cr `LIAB.STATUTORY_OTHER` · Cr `ASSET.LOAN_RECEIVABLE` Σ loan principal · Cr `REVENUE.LOAN_INTEREST` Σ loan interest · Cr `AR.FINE` Σ fine deductions | **Each component from payslips, never `gross − net`**; assert Dr = Cr and run totals = Σ payslips (INV-10). Loan repayments are created in the same transaction (UQ-17). |
| PR-17 | **Payroll rollback** | mirror of PR-16 + reversal of loan repayments and fine deductions | Blocked after any disbursement/remittance; High Rank approval. |
| PR-18 | **Salary disbursement** | Dr `LIAB.SALARIES` / Cr `FA` | Per `PayrollDisbursement`; confirmation recorded. |
| PR-19 | **Statutory remittance** | Dr `LIAB.PAYE` / `PENSION_EE` / `PENSION_ER` / `STATUTORY_OTHER` / Cr `FA` | |
| PR-20 | **Loan disbursement** | Dr `ASSET.LOAN_RECEIVABLE` principal (+ interest per OQ-09) / Cr `FA` | Evidence + account required (A1-EV-C). |
| PR-21 | **Loan manual repayment** | Dr `FA` / Cr `ASSET.LOAN_RECEIVABLE` (+ `REVENUE.LOAN_INTEREST`) | Replaces the free `PATCH /hr/loans/:id/repay` (X-37). |
| PR-22 | **Loan write-off / forgiveness** | Dr `EXPENSE.BAD_DEBT` / Cr `ASSET.LOAN_RECEIVABLE` | High Rank. |
| PR-23 | **Library fine assessed** | Dr `AR.FINE` / Cr `REVENUE.LIBRARY_FINE` | accrual (D-01). |
| PR-24 | **Library fine payment** | Dr `FA` / Cr `AR.FINE` | Student or staff; Doc 4 §9. |
| PR-25 | **Library fine waiver / cancel** | Dr `CONTRA.FINE_WAIVER` (cancel: Dr `REVENUE.LIBRARY_FINE`) / Cr `AR.FINE` | Approved waiver only. |
| PR-26 | **Account transfer / settlement** | direct: Dr destination `FA` (received) · Dr `EXPENSE.BANK_CHARGES` (fee) / Cr source `FA` · in-transit: send Dr `ASSET.IN_TRANSIT` / Cr source; receive Dr destination / Dr charges / Cr `ASSET.IN_TRANSIT` | Mobile-money → bank settlement. |
| PR-27 | **Reconciliation: bank/wallet charge** | Dr `EXPENSE.BANK_CHARGES` / Cr `FA` | |
| PR-28 | **Opening balance** | Dr `FA` / Cr `EQUITY.OPENING` (reverse for overdraft) | Approved only. |
| PR-29 | **Reclassification** (legacy `1000` → registered account) | Dr new `FA` / Cr `ASSET.LEGACY_CASH` | Evidence + High Rank. |
| PR-30 | **Unidentified receipt / difference** | receipt: Dr `FA` / Cr `LIAB.SUSPENSE`; difference: Dr or Cr `EXPENSE.RECON_DIFF` | Cleared when matched. |
| PR-31 | **Fixed assets** (gated) | capitalise Dr `1400` / Cr AP or `FA`; depreciate Dr `5500` / Cr `1410`; dispose per policy | OQ-14. |
| PR-32 | **Inventory loss** (gated) | Dr `5930` / Cr `1200` | D-20. |
| PR-33 | **Accrual transition** | at the cutover date: Dr `AR.STUDENT` open invoice balances / Cr `LIAB.DEFERRED_INCOME` (terms not yet started) and Cr `EQUITY.TRANSITION` (remainder); Dr `EQUITY.TRANSITION` / Cr `LIAB.STUDENT_CREDIT` open credits; Dr `AR.FINE` pending fines / Cr `EQUITY.TRANSITION`; loan receivables per P9 | Details and approvals in Doc 6 §5. |
| PR-34 | **Cheque** | receipt: Dr cheque-clearing `FA` / Cr `AR.STUDENT`; cleared: PR-26 clearing → bank; bounced: PR-06 | OQ-13. |

---

## 17. State machines (SM-xx)

| ID | Entity | States and permitted transitions (each is a **conditional update**) |
|---|---|---|
| SM-01 | JournalEntry | DRAFT → POSTED → REVERSED (once) |
| SM-02 | FinancialTransaction | PENDING_POSTING → POSTED · POSTING_FAILED → (retry) POSTED; POSTED → REVERSED |
| SM-03 | Payment | RECORDED → REVERSED (approved); `verificationStatus` UNVERIFIED → MATCHED/DISPUTED |
| SM-04 | Invoice | UNPAID ⇄ PARTIAL → PAID; UNPAID → VOID; OVERDUE derived |
| SM-05 | Expense | PENDING → APPROVED · REJECTED; `paymentStatus` UNPAID → PARTIALLY_PAID → PAID |
| SM-06 | ExpensePayment | RECORDED → REVERSED |
| SM-07 | SupplierInvoice | RECEIVED → MATCHED · DISPUTED → APPROVED → PAID · VOID |
| SM-08 | BudgetCommitment | RESERVED → COMMITTED → CONSUMED (partial allowed) · RELEASED |
| SM-09 | PayrollRun | PROCESSING → **COMPLETED (= calculated; editable, may be returned here)** → PENDING_APPROVAL → APPROVED → **LOCKED (= accounting recognised)**; PENDING_APPROVAL/APPROVED → COMPLETED (returned to Finance); LOCKED → PENDING_APPROVAL (approved rollback, only before any disbursement/remittance); COMPLETED/PENDING_APPROVAL/APPROVED → VOIDED (then a new `version` may be run); PROCESSING → FAILED. Disbursement progress lives in `PayrollDisbursement` (SM-10), not in this status. |
| SM-10 | PayrollDisbursement | PENDING → PARTIAL → DISBURSED · FAILED |
| SM-11 | StaffLoan | PENDING → APPROVED → DISBURSED → REPAYING → SETTLED · REJECTED |
| SM-12 | LibraryFine | PENDING → PARTIALLY_PAID → PAID; PENDING/PARTIALLY_PAID → WAIVED (approved request) · CANCELLED |
| SM-13 | FineWaiverRequest | REQUESTED → APPROVED · REJECTED · WITHDRAWN |
| SM-14 | AssetAdvance | PENDING → PARTIALLY_RECONCILED → RECONCILED · WRITTEN_OFF |
| SM-15 | Refund | REQUESTED → APPROVED → PAID · REJECTED · CANCELLED |
| SM-16 | AccountTransfer | DRAFT → PENDING_APPROVAL → APPROVED → IN_TRANSIT → COMPLETED · REJECTED · REVERSED |
| SM-17 | Reconciliation | DRAFT → IN_REVIEW → APPROVED → LOCKED · REJECTED |
| SM-18 | FinancialAccount | DRAFT → ACTIVE ⇄ INACTIVE → ARCHIVED |
| SM-19 | FinancialPeriod | OPEN → SOFT_CLOSED → CLOSED → (approved reopen) OPEN |
| SM-20 | StatementLine | UNMATCHED → SUGGESTED → MATCHED · EXCLUDED · ADJUSTED |
| SM-21 | Scholarship | DRAFT → PENDING → APPROVED · REJECTED |
| SM-22 | Budget | DRAFT → SUBMITTED → APPROVED · REJECTED |
| SM-23 | StatutoryRemittance | DUE → PARTIAL → PAID · OVERDUE |

---

## 18. Invariants (INV-xx) — enforced by service + DB where possible, **verified automatically**

| ID | Invariant | Source |
|---|---|---|
| INV-01 | Every posted journal: Σ debits = Σ credits (exact) | A2-INV-1 |
| INV-02 | Invoice: `balance = total − paid`; `Σ line.amount = total`; `Σ line.paid = paid`; `Σ line.balance = balance` | A2-INV-2, X-19 |
| INV-03 | Payment: `amount = Σ appliedAmount + creditAmount` | A2-INV-3 (restated, C-01) |
| INV-04 | Credit: `remaining = original − Σ applications − Σ refunds`; Σ credit originals = Σ payment `creditAmount` (non-reversed) | |
| INV-05 | Budget: `available = allocated − Σ active commitment remaining − spent`; `spent = Σ approved allocations`; no double count | A2-INV-4 |
| INV-06 | Every POSTED register row has exactly one POSTED journal; every journal has a register row; `(source, event)` unique | A1-OR-JE |
| INV-07 | Each posted journal reversed at most once; reversal = exact negation | A1-F2 |
| INV-08 | `ChartOfAccount.balance` = Σ posted lines (normal side) | |
| INV-09 | Control accounts equal sub-ledgers: `1100` = Σ open invoice balances; `1110` = Σ open fines; `1120` = Σ open sponsor charges; `1150` = Σ loan outstanding; `2000` = Σ unpaid expenses/supplier invoices; `2100` = Σ undisbursed net pay; `2110/2120/2121` = accrued − remitted; `2200` = Σ open credit; `2210` = Σ unreleased deferred income; `2250` = Σ approved unpaid refunds; `1160` = Σ outstanding advances | A2-§7 |
| INV-10 | Payslip net equation; run totals = Σ payslips; loan deduction ≤ min(monthly deduction, balance); net ≥ 0 | A2-TEST, C-09 |
| INV-11 | Loan: `balance = principal + interest − Σ non-reversed repayments`; `totalRepaid = Σ repayments`; status consistent | A1-F12 |
| INV-12 | Fine: `amountPaid = Σ non-reversed payments ≤ amount`; PAID ⇒ fully paid; WAIVED ⇒ approved waiver; PENDING has no paid amount | A1-F10/F11 |
| INV-13 | Financial account ledger balance = opening + Σ movements; reconciled difference fully explained | A2-F6 |
| INV-14 | No entry created or changed in a CLOSED period | A2-MC-09 |
| INV-15 | Provider reference unique per namespace among non-reversed receipts | A1-§10A |
| INV-16 | New postings only to ACTIVE, postable accounts | |
| INV-17 | One idempotency key ⇒ one result | |
| INV-18 | Advance: `amount = expenditure + returned + written-off + outstanding` | A1-EV-B |
| INV-19 | Transfer: `amountSent = amountReceived + fee`; both legs posted | |
| INV-20 | Payroll: Σ disbursed + outstanding = Σ net pay | |
| INV-21 | Σ expense-payment allocations ≤ expense amount; PAID ⇔ equal | |
| INV-22 | Supplier invoice within match tolerance or explicitly approved | |
| INV-23 | Σ installments = plan total; allocations ≤ instalment amount | A1-§10C |
| INV-24 | Σ deferred releases = deferred amount | |
| INV-25 | Sponsor charge = sponsor-funded discount of the invoice | |
| INV-26 | Statutory payable = accrued − remitted | |
| INV-27 | Trial balance: Σ debit balances = Σ credit balances | |
| INV-28 | Assets = Liabilities + Equity + (Revenue − Expenses) | A2-§7 |
| INV-29 | Financial audit hash chain unbroken | |
| INV-30 | Every financial mutation has an audit row in the same transaction | |
