# SMS Malawi — Finance Hardening Plan · Part 5
## Permissions, segregation of duties, and the complete UI specification

**Plan only.** Principle (owner's rule): **every backend capability in Parts 3–4 must be visible and functional in the UI for the right role, and every UI action must be backed by a real, guarded backend rule.** Backend, frontend and UI receive equal weight in each phase task (Part 6).

---

## 1. Roles and permissions (D-04)

### 1.1 The rule (from the school's financial advisor/accountant)
| Role | Financial access |
|---|---|
| **Finance** | Create and process permitted financial transactions |
| **High Rank** | Financial oversight, review and approval according to authority |
| **Admin** | System administration and user/technical management — **no unrestricted Finance write access** |

Other roles keep their narrow functions: **HR** (loan requests/approval together with High Rank, salary structure inputs, payroll view), **Library** (assess fines, request waivers, view status), **Procurement requesters** (academic/hr/finance create requisitions), **Students/guardians/staff** (view their own statements, receipts, fines).

### 1.2 What is wrong today (verified, X-01)
The matrix already withholds finance writes from admin (admin has `finance.viewSummary` and `finance.viewSystemLogs` only), but ~20 routes use `requireRole(['admin','finance'])` or `FINANCE_ROLES` (admin, high_rank, finance), and the Finance page itself computes `isFinance = role === 'finance' || role === 'admin'` to decide which tabs and buttons appear. **Both the routes and the UI are changed**; either alone leaves the gap open.

### 1.3 Permission matrix (target). ✔ = holds the permission; "—" = does not.
Existing keys keep their names; **NEW** keys follow the same `finance.<verbNoun>` style. Roles not listed hold nothing.

**Registry, ledger, periods**
| Permission | Finance | High Rank | Admin | Notes |
|---|---|---|---|---|
| `finance.viewFinancialAccounts` NEW | ✔ | ✔ | — | masked |
| `finance.viewFinancialAccountDetails` NEW | ✔ | ✔ | — | unmask, audited |
| `finance.manageFinancialAccounts` NEW | ✔ | — | — | draft/edit |
| `finance.approveFinancialAccounts` NEW | — | ✔ | — | activate/sensitive edits |
| `finance.manageAccountMappings` / `approveAccountMappings` NEW | ✔ / — | — / ✔ | — | |
| `finance.manageChartOfAccounts` NEW | ✔ | — | — | non-system accounts |
| `finance.viewLedger` NEW | ✔ | ✔ | — | |
| `finance.postManualJournal` / `approveManualJournal` / `reverseJournal` NEW | ✔ / — / — | — / ✔ / ✔ | — | manual entries always need approval |
| `finance.prepareOpeningBalance` / `approveOpeningBalance` NEW | ✔ / — | — / ✔ | — | |
| `finance.closePeriod` / `reopenPeriod` NEW | — | ✔ | — | |
| `finance.viewControlCentre` NEW | ✔ | ✔ | ✔ (technical health only) | |
| `finance.resolveExceptions` NEW | ✔ | ✔ | — | |
| `finance.viewAuditTrail` NEW | ✔ | ✔ | ✔ read-only | extends `finance.viewSystemLogs` |
| `finance.viewSummary` (existing) | ✔ | ✔ | ✔ | |
| `finance.viewSystemLogs` (existing) | — | — | ✔ | |

**Receivables**
| Permission | Finance | High Rank | Admin |
|---|---|---|---|
| `finance.recordPayment` (existing) | ✔ | — | — |
| `finance.reversePayment` NEW | ✔ (request) | ✔ | — |
| `finance.approveReversal` NEW | — | ✔ | — |
| `finance.generateInvoice`, `bulkGenerateInvoices`, `editInvoice`, `addInvoiceNote`, `generateReceipt` (existing) | ✔ | — | — |
| `finance.voidInvoice` NEW | ✔ (request) | ✔ (approve) | — |
| `finance.applyCredit` NEW | ✔ | — | — |
| `finance.manageRefunds` / `approveRefund` / `payRefund` NEW | ✔ / — / ✔ | — / ✔ / — | — |
| `finance.manageScholarships` (existing) / `approveScholarship` NEW | ✔ / — | — / ✔ | — |
| `finance.manageSponsors` NEW | ✔ | — | — |
| `finance.manageFeeStructures`, `manageInstallmentPlans` (existing) | ✔ | — | — |
| `finance.viewInvoices`, `viewPayments`, `viewScholarships`, `viewFeeStructures`, `viewInstallmentPlans`, `viewForecast` (existing) | ✔ | ✔ | — |

**Spending, budgets, procurement**
| Permission | Finance | High Rank | Admin |
|---|---|---|---|
| `finance.createExpense` (existing) | ✔ | — | — |
| `finance.approveExpense`, `rejectExpense` (existing) | — | ✔ | — |
| `finance.recordExpensePayment` NEW | ✔ | — | — |
| `finance.approveExpensePayment` NEW | — | ✔ | — |
| `finance.manageSupplierInvoices` / `approveSupplierInvoices` NEW | ✔ / — | — / ✔ | — |
| `finance.manageBudget` (existing) / `approveBudget` (existing) | ✔ / — | — / ✔ | — |
| `finance.manageBudgetCommitments`, `finance.manageBudgetWindows` (existing) | ✔ | windows ✔ | — |
| `procurement.*` (existing) | unchanged | review ✔ | view only |
| `assets.manageAdvances` (existing) | ✔ | — | — |
| `finance.approveAdvanceWriteOff` NEW | — | ✔ | — |

**Payroll, statutory, loans**
| Permission | Finance | High Rank | Admin | HR |
|---|---|---|---|---|
| `finance.runPayroll`, `lockPayroll` (existing) | ✔ | — | — | — |
| `finance.approvePayroll` (existing) | — | ✔ | — | — |
| `finance.rollbackPayroll` (existing: request) / `finance.approveRollback` NEW | ✔ / — | — / ✔ | — | — |
| `finance.disbursePayroll` / `confirmDisbursement` NEW | ✔ | confirm ✔ | — | — |
| `finance.manageStatutory` NEW | ✔ | — | — | — |
| `finance.viewPayrollRuns` (existing) | ✔ | ✔ | — | ✔ |
| `finance.manageSalaryStructure`, `linkLoanToPayroll` (existing) | ✔ | — | — | ✔ |
| `hr.approveLoan` (existing) | — | ✔ | — | ✔ |
| `finance.disburseLoan` / `recordLoanRepayment` NEW | ✔ | — | — | — |
| `finance.writeOffLoan` NEW | — | ✔ | — | — |

**Library fines**
| Permission | Finance | High Rank | Admin | Library |
|---|---|---|---|---|
| `library.applyFine` (existing) | — | — | — | ✔ |
| `finance.receiveLibraryFine` NEW (replaces `finance.clearLibraryFine` for finance; **removed from library**) | ✔ | — | — | **—** |
| `library.requestFineWaiver` NEW | — | — | — | ✔ |
| `finance.approveFineWaiver` NEW (replaces library-held `waiveFine`) | — | ✔ | — | **—** |
| `finance.viewLibraryFines` (existing) | ✔ | ✔ | — | status only |
| `library.viewOwnFines` (existing) | staff/student self-service | | | |

**Cash control, reports, repair**
| Permission | Finance | High Rank | Admin |
|---|---|---|---|
| `finance.manageTransfers` / `approveTransfers` NEW | ✔ / — | — / ✔ | — |
| `finance.importStatements`, `finance.reconcile` NEW | ✔ | — | — |
| `finance.approveReconciliation` NEW | — | ✔ | — |
| `finance.viewReports` NEW | ✔ | ✔ | — |
| `finance.runHistoricalRepair` / `approveHistoricalRepair` NEW | ✔ (dry-run, class A) / — | — / ✔ | — |

**Admin keeps**: user and role management, system settings that are technical (cron, integrations, school identity), `finance.viewSummary`, `finance.viewSystemLogs`, `finance.viewAuditTrail` (read), technical Control Centre health (job failures, queue depth) **without** the power to resolve, approve, post or pay anything.

### 1.4 Segregation of duties (SoD) — enforced **server-side inside the transaction** (`assertNotSelfReview` generalised in `lib/selfReview.ts`; comparison by staff profile **and** uid)
| ID | Rule | Error |
|---|---|---|
| SoD-01 | Creator ≠ approver for expenses, budgets, scholarships, supplier invoices, financial accounts, mappings, manual journals, opening balances | `SEGREGATION_VIOLATION` |
| SoD-02 | Recorder of a payment ≠ approver of its reversal | |
| SoD-03 | Refund: requester ≠ approver; approver ≠ payer | |
| SoD-04 | Expense payment: preparer ≠ approver (above threshold) | |
| SoD-05 | Loan: requester ≠ approver ≠ disburser | |
| SoD-06 | Payroll: submitter ≠ approver; locker ≠ approver; rollback requester ≠ approver | |
| SoD-07 | Fine: assessor ≠ waiver approver; **receiver ≠ the person who owes the fine** | |
| SoD-08 | Advance: recorder ≠ reconciler ≠ write-off approver | |
| SoD-09 | Reconciliation: preparer ≠ approver | |
| SoD-10 | Transfer: initiator ≠ approver (above threshold) | |
| SoD-11 | Period close/reopen: not the person who prepared the last open reconciliation or manual journal in that period (warning + override reason) | |
| SoD-12 | Historical repair: scanner ≠ approver | |
| SoD-13 | Account mapping change: proposer ≠ approver | |
| SoD-14 | A user cannot approve anything in which their own staff profile is the beneficiary (staff loan, staff fine waiver, own expense claim) | |
| SoD-15 | Super-user/role-switch accounts do **not** bypass SoD (V-13) | |

### 1.5 Transition plan for permissions
1. Add the new keys and role mapping (Part 6 P1-10).
2. **Operational prerequisite:** anyone presently doing finance work through an *admin* login receives a proper Finance (or High Rank) account first; otherwise the flip would block real work.
3. Convert routes from `requireRole([...])` to `requirePermission(...)` module by module behind `finance.v2.permissions`; add a route-matrix unit test that fails if any finance route lacks `requirePermission` (so a future edit cannot reintroduce `requireRole` lists).
4. Convert the UI to `usePermissions()` / `PermissionGuard`, deleting `isFinance = role === 'finance' || role === 'admin'` style checks; Admin sees the finance workspace **read-only** where appropriate (summary, audit trail, system health).
5. `FINANCE_ROLES` constant is retired.

---

## 2. UI architecture rules

Reuse what exists: grouped tabs via `ModuleTabs` in `app/(auth)/finances/page.tsx`, `ModuleSurface`, `DataTable`, `Modal`, `ConfirmDialog`, `StatCard`, `StatusText`, `PrintLetterhead`, `AuditLogViewer`, `SearchableSelect`, `usePermissions`, `PermissionGuard`, `apiFetch`, hooks in `hooks/useFinances.ts` (extended; a new hooks file only for a genuinely new domain such as `useFinancialAccounts.ts`), the Approvals hub adapters (`financeAdapters`, V-14).

1. **Permission-driven.** Tabs/buttons appear by `usePermissions()`; never by role names.
2. **One idempotency key per form submission** (`newIdempotencyKey()`), reused on retry, discarded on success/cancel.
3. **No optimistic updates for money.** Buttons show a spinner, disable while pending; the UI confirms from the server response and shows the document number (e.g. `RCT-2026-000123`).
4. **Irreversible actions use `ConfirmDialog`** that restates amount, account and counterparty.
5. **Money display**: `MWK 1,250,000.00`, tabular numerals, right-aligned; one `<Money>` helper; negative amounts and reversals visibly marked.
6. **Masked data**: `MaskedAccountNumber` component (`•••• 1234`); reveal button visible only with the unmask permission; each reveal calls the audited details endpoint.
7. **Status chips** use one shared vocabulary (RECORDED, VERIFIED/MATCHED, REVERSED, POSTED, FAILED, PENDING APPROVAL…); each chip has a tooltip explaining the state.
8. **Loading / empty / error states** exist on every list and dialog (skeletons for lists, guidance text for empty states that says what to do next, retry on error); server `code`s map to messages (§2.6).
9. **Timelines**: invoices, payments, expenses, loans, fines, payroll runs, financial accounts show an **audit/event timeline** (who, what, when) from the register/audit trail.
10. **Responsive**: tables collapse to cards on narrow screens following the existing mobile patterns; dialogs become bottom sheets (`MotionBottomSheet`) on mobile.
11. **Printing/PDF** via `PrintLetterhead` conventions; all documents carry document number, date, preparer, and "RECORDED / REVERSED" state.
12. **Role visibility honesty**: if a user lacks permission, the control is hidden (not just disabled), except where a disabled control with an explanation helps ("Requires High Rank approval").

### 2.6 Error code → plain message
`STATE_CONFLICT` "This record was just changed by someone else. Refresh to see the latest." · `ALREADY_POSTED/ALREADY_REVERSED` "This has already been processed." · `IN_PROGRESS` "This is already being processed." · `IDEMPOTENCY_KEY_REUSED` "This request was already submitted with different details." · `SEGREGATION_VIOLATION` "You cannot approve or process your own record. Ask another authorised user." · `PERIOD_CLOSED` "This date falls in a closed financial period." · `ACCOUNT_INCOMPATIBLE` "This account cannot receive this payment method." · `ACCOUNT_INACTIVE` · `DUPLICATE_REFERENCE` "This transaction reference was already used (receipt …)." · `EVIDENCE_REQUIRED` "Attach proof of payment." · `OVER_LIMIT` · `INSUFFICIENT_BUDGET` "This exceeds the available budget (…)" · `RETRYABLE` "Connection problem — tap retry; nothing was duplicated."

---

## 3. Backend → UI parity matrix (nothing is backend-only)

| # | Backend capability (Part 3/4) | UI surface | Who sees/acts |
|---|---|---|---|
| 1 | Payment Accounts Registry CRUD + lifecycle + revisions | Settings → Finance → **Payment Accounts** (§4.1) | Finance prepares; High Rank approves; Admin none |
| 2 | Selectable-accounts API | Account picker in every payment/expense/transfer/payroll/fine/refund dialog | per workflow |
| 3 | Account mappings & chart of accounts | Settings → Finance → **Chart of Accounts & Posting Map** (§4.2) | Finance/High Rank |
| 4 | Financial periods, close/reopen | Finance → Control → **Periods** (§4.3) | High Rank closes; Finance views |
| 5 | Opening balances | Payment Accounts → account → **Opening balance** (§4.1) | Finance prepares, High Rank approves |
| 6 | Payment v2 (account, reference uniqueness, idempotency) | Invoices → **Record payment** dialog (§4.4) | Finance |
| 7 | Payment reversal request/approval | Payment row → **Request reversal**; Approvals inbox | Finance / High Rank |
| 8 | Receipts (sequential, reversal stamp, reprint) | Payment row → Receipt; student portal | Finance; student |
| 9 | Invoice void / credit note / apply credit | Invoice actions menu (§4.4) | Finance request; High Rank approve |
| 10 | Late penalty, recognition status | Invoice detail shows recognition (Posted/Deferred until date) and penalty line | Finance |
| 11 | Student credit & refunds | Student statement + Finance → Billing → **Credits & refunds** (§4.5) | Finance/High Rank |
| 12 | Scholarship approval, sponsor model | Billing → Scholarships (§4.6) + **Sponsors** | Finance/High Rank |
| 13 | Installment allocation | Installment plan shows paid/partial/overdue per instalment | Finance, student |
| 14 | Expense v2 (budget allocation, evidence, accrual) | Spending → Expenses (§4.7) | Finance; High Rank approves |
| 15 | Expense payment voucher | Expense → **Record payment**; voucher PDF | Finance; High Rank approves above threshold |
| 16 | Supplier invoices & 3-way match | Spending → **Supplier invoices** (§4.7) | Finance; High Rank |
| 17 | Budget approval, exact allocation, availability | Budget → Allocations (§4.8) | Finance/High Rank |
| 18 | Commitments lifecycle & release | Budget → **Commitments** panel; Procurement PO view | Finance/High Rank |
| 19 | Single budget position | Budget tab, Forecast, Reports use it; same numbers everywhere | all finance viewers |
| 20 | Asset advances v2 | Assets → Advances (extended dialogs, §4.7) | Finance; High Rank write-off |
| 21 | Fine payment/receipt/reversal | Finance → Library fines (§4.9) | Finance |
| 22 | Waiver request/approval | Library → Fine waivers; **Approvals inbox** for High Rank | Library requests; High Rank |
| 23 | Staff "How to pay" + my fines | Staff portal → **My library fines** (§4.9, §4.17) | staff |
| 24 | Staff clearance query | HR → staff profile → **Library clearance** | HR/Finance |
| 25 | Payroll v2 (versions, rounding, employer costs) | Payroll → Runs (version badge, employer cost columns) (§4.10) | Finance/High Rank |
| 26 | Payroll disbursement & confirmation | Payroll → **Disbursements** | Finance; High Rank confirms |
| 27 | Statutory remittances | Payroll → **Remittances** | Finance |
| 28 | Loans v2 (disburse, repayments, interest split, write-off) | Spending → Debts & loans (§4.11) | Finance/HR/High Rank |
| 29 | Transfers & settlement | Cash & banks → **Transfers** (§4.12) | Finance; High Rank approves |
| 30 | Statement import & matching | Cash & banks → **Reconciliation** workspace | Finance |
| 31 | Reconciliation sign-off & lock | Reconciliation → Review/Approve | High Rank |
| 32 | Cashbook, cash counts | Cash & banks → **Cashbook** | Finance/High Rank |
| 33 | Ledger statements (TB, IS, **Balance Sheet**, Cash flow) | Accounting → Statements (§4.13) | Finance/High Rank |
| 34 | Journals & register | Accounting → Journals / Transactions | Finance/High Rank |
| 35 | Manual journal & reversal | Accounting → New journal (approval flow) | Finance / High Rank |
| 36 | Integrity monitor & PostingException | Control → **Control Centre** (§4.14) | Finance/High Rank; Admin technical |
| 37 | Posting retry | Control Centre → Retry now | Finance/High Rank |
| 38 | Financial audit trail | Control → **Audit trail** (`AuditLogViewer` extended) | Finance/High Rank/Admin read |
| 39 | Historical repair | Control → **Repair console** (§4.16) | Finance scans; High Rank approves |
| 40 | Accrual cutover | Repair console → Cutover wizard | High Rank |
| 41 | Settings catalogue (thresholds, flags, rates) | Settings → Finance (sub-sections) | Finance edits; High Rank approves financial keys |
| 42 | Evidence store | Every record: Evidence panel (view, add, superseded history) | per record |
| 43 | Notifications | §6 | per event |
| 44 | Reports (collections by account, ageing, statutory…) | Reports tab extended | Finance/High Rank |

---

## 4. Screen specifications

Each screen lists: purpose · actors · content/fields · validation · actions · states · backend dependency.

### 4.1 Settings → Finance → **Payment Accounts** (owner's spec §3, §12)
Location: `components/settings/FinanceSettings.tsx` gains an internal sub-navigation: **General** (existing: late penalty, PAYE brackets, pension, loan interest), **Payment Accounts**, **Chart of Accounts & Posting Map**, **Approval limits**, **Employer costs**, **Library fines**, **Feature rollout**. (If the file grows too large, extract each sub-section into `components/settings/finance/*.tsx`.)

**List view** — grouped by category (Bank · Mobile money · Cash · Clearing). Columns: display name, provider, masked number, linked ledger account (code — name), status chip, **ledger balance** (derived), last reconciled date. Filters: category, provider, status; search. Active vs inactive/archived visibly distinct. Buttons: **Add account** (Finance), row menu: View, Edit, Activate/Deactivate, Archive, History, Opening balance.
**Add/Edit form** adapts to category:
- Bank: provider/bank (suggestions + free text), registered account name, account number, branch (optional), currency, purpose, ledger link (**Create new ledger account** or **Select existing compatible**), supported methods, allowed uses, opening-balance date (optional).
- Mobile money: provider, registered name, mobile number, currency, purpose, ledger link, settlement account + delay + expected fee rule.
- Cash: display name, office/location/custodian (staff picker), currency, purpose, ledger link; reconciliation not required toggle.
- Clearing: name and purpose, related channel/provider, currency, ledger link, settlement configuration.
Validation: required fields per category; duplicate warning from the fingerprint; ledger account must be active, postable, type-compatible and unlinked; method list must be consistent with category; mobile numbers normalised (+265…).
**Lifecycle UI**: DRAFT shows "Submit for approval"; High Rank sees it in the Approvals inbox with the full diff; ACTIVE ⇄ INACTIVE with reason; ARCHIVED only when balance is zero, no unmatched lines, no pending settlements (the dialog lists blockers).
**Detail drawer**: details (masked, reveal for authorised), ledger link, balance, recent transactions, reconciliation status, **history** (revisions with who/when/what changed), evidence.
**Opening balance**: form (as-of date, amount, evidence upload) → submits for High Rank approval; shows resulting journal once approved.
**States**: empty ("No payment accounts yet — add the school's real bank, wallet and cash accounts. Payments cannot be recorded until at least one active account exists for the method used."), loading skeleton, error with retry. Admin sees the section read-only or not at all (permission driven).

### 4.2 Settings → Finance → **Chart of Accounts & Posting Map**
Account list (code, name, type, section, system badge, active, balance), add non-system account, rename, activate/deactivate (blocked with reasons). **Posting map** table: key → account, effective-from, status; **Propose change** (Finance) → High Rank approves; shows impact notice ("affects new postings only"). Fee catalogue link: "Revenue account" per fee shown here as a summary.

### 4.3 Finance → Control → **Periods**
Calendar of periods with status; **Close checklist** panel (reconciliations done, no blocking exceptions, deferred release run, payroll status, integrity clean) with each item linking to its screen; actions Soft close / Close / Reopen (reason + approval). Closed periods show a lock icon everywhere a date is chosen, and date pickers disable closed dates.

### 4.4 Finance → Billing → **Invoices** (extended)
- **Record payment dialog (v2)**: amount; method; **Receiving account** picker (only active, compatible); reference (required unless cash; helper text per method; shows the duplicate-reference error with a link to the earlier receipt); paid-on date (bounded); payer name; allocation table (default auto, editable; shows **Applied vs Excess** per line and the resulting **credit**); evidence upload (optional/required by setting); live check "Allocated + credit = amount". Submit → spinner → success panel with receipt number, print, new balance.
- **Invoice detail**: lines with category, gross, discount share, paid, balance; **recognition** badge (Posted / Deferred until DD MMM); sponsor charge link; credit applications; instalments with PAID/PARTIAL/OVERDUE; payments list with account, method, reference (masked as required), verification chip, reversal chain; notes; timeline.
- **Actions menu**: Add line (race-safe), Void (request/approve), Credit note, Apply credit, Create instalment plan, Print statement.
- **Payments list** (new sub-tab): filter by account, method, status, verification, date; export.
- **Reversal request** dialog (reason, evidence) → Approvals inbox → on approval the invoice, receipt and timeline update.
- OVERDUE shown as a derived badge, not overwritten by partial payments.

### 4.5 Billing → **Credits & refunds**
Student search → credit balance, credit history (source payment, applications, refunds); actions: Apply to invoice, Request refund. Refund dialog: amount (≤ remaining), method, paying account, reason; workflow chips (Requested → Approved → Paid); refund voucher PDF.

### 4.6 Billing → **Scholarships** and **Sponsors**
Scholarship form: type, value (percentage ≤ 100 enforced), year, funding (School/Sponsor), sponsor picker, agreement upload (required for sponsor-funded), notes; status (Draft/Pending/Approved/Rejected) with approval inbox. Duplicate active award per student/year is blocked with an explanatory message. **Sponsors** screen: sponsors list, outstanding, charges, **Record sponsor payment** (account, reference, allocation to charges), statement; ties to account 1120.

### 4.7 Spending
**Expenses** (existing tab extended): create dialog (category with SALARIES blocked, budget picker showing **available balance**, or split allocation editor with live sum check, payee/supplier, PO/GRN link pickers, incurred date, **evidence** required by threshold); status chips; High Rank approval panel showing budget availability and evidence, **override with reason** if over budget; **Approve** no longer says "paid"; row action **Record payment** opens the voucher dialog (account, method, reference, date, amount ≤ outstanding, evidence, "approval needed" notice above threshold) and **Approve & pay** convenience button (two ordered steps with all fields up front). Evidence panel with version history; receipts cannot be replaced after approval. Payment voucher PDF.
**Supplier invoices** (new sub-tab): register invoice (supplier, number, dates, lines linked to PO/GRN), **match result panel** (ordered vs received vs invoiced, variance, tolerance), Dispute/Approve with reasons, creates the expense; AP ageing table; supplier payment-details manager (encrypted, approval).
**Asset advances** (existing Assets screen extended): record dialog (account, method, reference, evidence mandatory, cap indicator); **reconciliation wizard** (expenditure lines, returned cash, write-off with reason); progress bar `amount = spent + returned + written-off + outstanding`.

### 4.8 Budget
Allocations table with approval status; submit/approve; new-budget form blocks duplicates; every row shows Allocated · Committed · Spent · Available from the single position endpoint; drill-down to commitments (RESERVED/COMMITTED/CONSUMED/RELEASED with source requisition/PO/expense) and to allocated expenses; Windows panel enforces the allowed transitions; **Forecast** uses approved expenses only.

### 4.9 Library fines (the owner's staff-payment question)
**Finance → Billing → Library fines** (`LibraryFinesTab`): filters (payer type Student/Staff, status, kind, date, account); table with fine number, borrower, book, kind, amount, paid, status, assessor.
- **Receive payment** dialog (Finance only): borrower summary, amount (locked to outstanding unless partial payments are enabled), method, **receiving account** picker (accounts allowed for fines), reference, date, evidence; **self-fine guard** message if the receiver owns the fine; success → receipt `LFP-…`.
- **Reverse payment** (request → High Rank).
- **Waiver inbox** (High Rank): pending `FineWaiverRequest`s with reason, borrower, assessor, amount; Approve/Reject with comment; shows that approval waives only the remaining amount.
- **Direct "Waive" button is removed** (it called the bypass route).
**Library → Fines** (library staff): assess fine; request waiver on behalf of a borrower; read-only status (PENDING/PAID/WAIVED) and a **"Send to Finance"** hint; the old **Clear fine** action (`useLibrary.ts:415`) is removed.
**Staff: My library fines** (staff portal): each fine with status, amount, book, date; **How to pay** panel — Finance office hours and the active accounts flagged for fines (display name, provider, masked number, instructions), reference format guidance per method; receipts for paid fines; **Request waiver** button (self-service, existing rule); if payroll deduction is enabled: **Consent to deduct** (records consent evidence) with the cap shown.
**HR → staff profile → Library clearance**: outstanding fines for exit processing.

### 4.10 Payroll workspace (existing `PayrollTab` + `payroll/`)
Run list with **version** badge and status chip (COMPLETED = calculated, PENDING_APPROVAL, APPROVED, LOCKED, VOIDED); run detail table: gross, PAYE, employee pension, **employer pension**, other employer, loan deduction (capped), fine deduction, leave deduction, net, with a footing check "Σ payslips = run totals"; Void run (approval), Generate new version; lock panel shows the journal preview (each component line) before locking; rollback request/approval with warning if disbursement exists (blocked). **Disbursements** sub-tab: create batch (account, method, reference, per-payslip lines, evidence), confirm per payslip (Paid/Failed/Returned), progress "Disbursed X of Y — outstanding Z". **Remittances** sub-tab: due items per month and kind (PAYE, pension, other) with due/overdue chips; record remittance (account, reference, evidence). Payslip PDFs generate after the run with a visible "generating…/retry" state (X-42).

### 4.11 Spending → **Debts and loans** (existing `DebtsLoansTab`)
Loan list with status; actions per permission: Approve/Reject (HR/High Rank), **Disburse** dialog (account, method, reference, evidence; disabled for the approver with an explanation), **Record repayment** (manual: account, reference, evidence; cap = outstanding), **Write off** (High Rank, reason). Loan detail: principal, interest, **repayment ledger** (date, amount, principal/interest split, source Payroll/Manual, payslip/run link, balance after, reversed flag), statement PDF. Replaces the free "repay" call.

### 4.12 **Cash & banks** (new group)
- **Accounts overview**: cards per account with ledger balance, reconciled balance, unreconciled difference, last reconciliation, pending settlements.
- **Transfers**: create (from/to account pickers with category icons, amount, fee, references), approval status, in-transit badge, complete/receive; mobile-money settlement shortcut ("Settle Airtel Money to bank").
- **Reconciliation workspace**: pick account + period → import statement (file, column mapping saved per account, file-hash duplicate warning) → two-pane view (statement lines vs system transactions) with auto-match, suggestions, manual match/split/exclude, adjustment actions (bank charge, unidentified receipt → suspense) → summary box (statement balance, outstanding items, ledger balance, difference) → submit; High Rank approves; locked state read-only; PDF report.
- **Cashbook**: per account chronological listing with running balance and export; **cash count** form (counted vs ledger, variance, witness).

### 4.13 Accounting (existing `AccountingLedgerTab`, extended)
Sub-tabs: **Trial balance** (period/as-of, Σ debit = Σ credit shown), **Income statement**, **Balance sheet** (new; sections and the six owner questions rendered as headline tiles: School owns / Owed to school / Owed to suppliers / Owed to staff & statutory / Student advance credit / Accumulated surplus), **Cash flow**, **Account ledger** (drill-down by account with party filter), **Journals** (search, status, source link both ways), **Transactions** (register with posting status), **Mappings**, **New manual journal** (always routed to approval). Each statement has a period selector (month/term/year), export (XLSX/PDF), and a "reconciles to sub-ledger" indicator for control accounts.

### 4.14 Control → **Control Centre**
Headline cards (each count links to a filtered list): payments/expenses/payroll **awaiting ledger posting**; **failed postings**; **unmatched bank/wallet lines**; unreconciled accounts; expenses awaiting approval; supplier invoices unpaid; refunds/reversals/waivers awaiting approval; statutory remittances due/overdue; payroll awaiting disbursement; integrity breaches (by INV id); evidence missing; period close blockers. Exception table (severity, kind, source link, first detected, status, last retry) with Acknowledge / Resolve (note) / **Retry posting**. Admin sees technical health (job runs, queue depth) read-only.

### 4.15 Control → **Audit trail**
Extends `AuditLogViewer`: filter by entity, actor, action, date, document number; before/after diff (masked sensitive fields); chain verification status banner ("Audit chain intact as of …"); export.

### 4.16 Control → **Repair console** (D-05; Part 6 §5)
Steps: **Scan** (read-only, classes A/B/C) → results grouped by class with counts, per-item evidence and proposed entry → **Review** (select items, add notes) → **Approve** (High Rank) → **Apply** (creates adjusting entries/links, each tagged `BACKFILL`/`HISTORICAL_CORRECTION`) → **Verification report** (before/after control-account differences). Class C items stay as a manual-review list with assign/resolve. Cutover wizard sits here (preview of opening entries, approvals, apply).

### 4.17 Student, guardian and staff views
Student/guardian statement (`StudentPortalStatementTab`): invoices with recognition not shown to families; payments with **receipt number and receiving method**, reversed payments marked, **credit balance** and refunds, instalment status. Staff self-service: payslips (with employer costs hidden unless policy says otherwise), **My loans** (repayment history), **My library fines** (§4.9).

### 4.18 Documents
| Document | Number series | Contents (all on `PrintLetterhead`) |
|---|---|---|
| Fee receipt | `RCT-YYYY-000000` | student, invoice, amounts applied per fee, credit created, method, account display name + last 4, reference, status RECORDED/REVERSED, recorded by |
| Fine receipt | `LFP-…` | borrower (student/staff), fine, amount, account, reference |
| Payment voucher | `VCH-…` | payee, expenses settled, account, reference, preparer, approver |
| Refund voucher | `RFD-…` | student, source credit/payment, amount, account, approvals |
| Transfer advice | `TRF-…` | from/to accounts, amount, fee, references |
| Payslip | existing | adds employer-cost disclosure only if configured |
| Remittance advice | `REM-…` | kind, period, amount, payee, account, reference |
| Reconciliation report | `REC-…` | statement vs ledger, matches, adjustments, approvals |
| Period close report | — | checklist results, statements, approvers |
| Student statement | — | invoices, payments, credits, refunds |

### 4.19 Fee setup extensions
Fee catalogue: optional **Revenue account** picker per fee (validated); student fee structure unchanged. Bulk generator: preview shows **billed**, discounts, sponsor-funded portion, credit consumed; run report lists created/skipped/failed with reasons.

---

## 5. Navigation (permission-driven groups on `/finances`)
Billing (Invoices · Payments · Bulk generator · Scholarships & sponsors · Credits & refunds · Library fines) · Fee setup (unchanged) · Spending (Expenses · Supplier invoices · Debts & loans) · Budget (Allocations · Commitments · Windows · Forecast) · Procurement (unchanged) · Payroll (Runs · Disbursements · Remittances · Settings) · **Cash & banks** (Accounts · Transfers · Reconciliation · Cashbook) · Accounting (Statements · Journals · Transactions) · **Control** (Control Centre · Periods · Audit trail · Repair). Deep links keep working (`?tab=` values preserved; new values added; unknown/forbidden values fall back as today). Settings → Finance holds configuration.

---

## 6. Notifications (use the existing notifications and pending-actions infrastructure)
| Event | Recipients |
|---|---|
| Payment recorded / reversed | guardian/student (existing channel), Finance |
| Fine assessed | borrower (student/guardian or staff) with how-to-pay |
| Waiver requested / decided | High Rank / requester |
| Expense, expense payment, budget, scholarship, supplier invoice, refund, reversal, transfer, financial account, manual journal, opening balance, rollback, reconciliation, period close, repair awaiting approval | **Approvals hub** (extend `financeAdapters` — no separate inboxes) to High Rank |
| Payroll submitted / approved / locked / disbursed | Finance, High Rank; staff payslip-available notice on disbursement confirmation |
| Statutory remittance due soon / overdue | Finance |
| Posting failed / integrity breach / evidence missing | Finance + High Rank (Admin: technical alerts only) |
| Reconciliation overdue / period close reminder | Finance, High Rank |

---

## 7. Cross-cutting UX requirements
Accessibility (labels, keyboard operation for dialogs and tables, colour not the only status signal), mobile layouts for the Library and staff views (librarians and staff use phones), performance (server-side pagination and filters on payments, journals, register, statement lines; no unbounded lists), and copy that states consequences before an irreversible action. No screen shows a number that is not reproducible from the ledger or a reconciled sub-ledger (D-26).
