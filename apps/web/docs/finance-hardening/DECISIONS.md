# Decisions and open questions: status

[CHANGE TYPE]: NEW FILE (P0-05). A mirror of the D-xx decisions and OQ-xx open questions in
`01-verification-and-decisions.md` §6 and §7, with their **current status**. The wording of each decision
and question is copied from Part 1, which stays the source of truth: if the two ever disagree, Part 1 wins and
this file is corrected.

Update the **Status** column (never the wording) when the owner or accountant answers, and add a line to
`IMPLEMENTATION-LOG.md` saying what changed and when.

Last reviewed: 2026-11-25 (P0 gate re-checked; P1-01 to P1-03 done; I-07 to I-09 confirmed; I-10 to I-12 proposed).

## 1. Decisions (D-xx)

| ID | Decision | Source (Part 1) | Status |
|---|---|---|---|
| D-01 | **Accrual architecture**: invoice-time receivables; revenue or deferred-income treatment. | User | Decided by the owner |
| D-01a | **Transition method**: opening *cutover entries* at an accrual cutover date, rather than restating every historical entry. History before the cutover keeps its as-posted basis except verified corrections. | Planner / **OPEN** (accountant) | OPEN: needs owner or accountant before the affected phase |
| D-01b | **Revenue recognition mode** is a setting: `TERM_START` (deferred until the term start date, default) or `ON_INVOICE`. | Planner / **OPEN** | OPEN: needs owner or accountant before the affected phase |
| D-02 | **Employer-side statutory costs** (employer pension and other applicable items) recorded separately from employee deductions. | User | Decided by the owner |
| D-03 | **Financial accounts are configurable**, not hardcoded: *Settings → Finance → Payment Accounts*. Cash, bank, Airtel Money, TNM Mpamba, POS and cheque-clearing only where actually used. | User | Decided by the owner |
| D-04 | **Enforce the financial permission matrix.** Finance creates/processes; High Rank oversees/approves; Admin administers the system and users, with no unrestricted finance write. | User | Decided by the owner |
| D-05 | **Historical repair covers the complete available history**; only reliably reconstructable records are corrected; unverifiable differences go to manual review; every adjustment is auditable. | User | Decided by the owner |
| D-06 | **Payment method (how) and financial account (where) are stored separately.** A method is never used as an account. | User | Decided by the owner |
| D-07 | **Staff library fines follow the same payment/account workflow**; library staff cannot receive payment or approve waivers. | User | Decided by the owner |
| D-08 | **Atomic posting is the rule**: the business write, register row, journal entry and balance update commit together. A durable `PENDING/FAILED` posting state plus a recovery queue exists for the cases that cannot be atomic (bulk/long jobs, legacy rows, timeouts). | Planner (satisfies A1-F3, A2-F1) | Planner decision, in force unless the owner objects |
| D-09 | **Central `FinancialTransaction` register** connects domain records to journals; domain models stay. | Audit (adopted) | Adopted from the audits |
| D-10 | **Additive schema only**; legacy columns stay and are documented. | Planner | Planner decision, in force unless the owner objects |
| D-11 | **All finance arithmetic uses `Decimal`** (Prisma runtime), 2 decimal places; rounding **half-up**; allocations use the largest-remainder method. | Planner / **OPEN** (rounding rule, OQ-03) | OPEN: needs owner or accountant before the affected phase |
| D-12 | **Journal immutability enforced in the database** (triggers) and balances = Σ posted lines; `ChartOfAccount.balance` remains as a cache verified nightly. | Planner | Planner decision, in force unless the owner objects |
| D-13 | **Existing account codes never renumbered.** New accounts are added; posting rules use **AccountMapping keys**, not hardcoded codes. | Planner | Planner decision, in force unless the owner objects |
| D-14 | **`1000 Cash / Bank` is kept as "Unallocated (legacy)".** Historical postings move to real accounts only through approved reclassification entries with evidence. | Planner | Planner decision, in force unless the owner objects |
| D-15 | **One PO per requisition** initially, enforced; multi-PO needs explicit commitment allocation later. | Planner / **OPEN** (OQ-10) | OPEN: needs owner or accountant before the affected phase |
| D-16 | **One active scholarship per student per academic year**; stacked awards require an explicit later feature. Validate against existing data first. | Planner / **OPEN** | OPEN: needs owner or accountant before the affected phase |
| D-17 | **Approval ≠ payment** for expenses; payment is a separate record with account and evidence. A combined "Approve & record payment" UI action produces both records atomically. | Planner | Planner decision, in force unless the owner objects |
| D-18 | **Dual control thresholds** are settings (e.g., second approval on expense payments, refunds, transfers above amounts). Manual journals, write-offs, period re-open and historical repair **always** require High Rank approval. | Planner / **OPEN** (amounts, OQ-05) | OPEN: needs owner or accountant before the affected phase |
| D-19 | **Monthly financial periods** with a configurable fiscal-year start. | Planner / **OPEN** (OQ-04) | OPEN: needs owner or accountant before the affected phase |
| D-20 | **Inventory valuation postings are deferred** until a costing policy exists; large variance write-offs may post to a loss account meanwhile. | Planner / **OPEN** | OPEN: needs owner or accountant before the affected phase |
| D-21 | **Fixed-asset capitalisation and depreciation are included** but gated on an accountant-approved policy. | Planner / **OPEN** | OPEN: needs owner or accountant before the affected phase |
| D-22 | **Refunds** only from an open `StudentCredit` or a reversed payment; always approved; paid from a registered account. | Planner | Planner decision, in force unless the owner objects |
| D-23 | **Staff fine payroll deduction** is optional, **off by default**, needs written/recorded consent + HR approval + a cap; legality to be confirmed. | Planner / **OPEN** (OQ-12) | OPEN: needs owner or accountant before the affected phase |
| D-24 | **Sponsor receivables are included** (SponsorCharge / SponsorPayment). | Audit (adopted) | Adopted from the audits |
| D-25 | **Integration tests run against a real Postgres (Neon branch)**; concurrency tests are mandatory for every claim/posting path. | Planner | Planner decision, in force unless the owner objects |
| D-26 | **Reports read the ledger or the register**; parallel module calculations are retired or reconciled. | Audit (adopted) | Adopted from the audits |
| D-27 | **Currency: MWK only.** A `currency` field exists on accounts and transactions, but multi-currency/FX posting is out of scope. | Planner | Planner decision, in force unless the owner objects |
| D-28 | **Staged rollout behind feature flags** (SystemSettings keys `finance.v2.*`), module by module, each with a rollback path. | Planner | Planner decision, in force unless the owner objects |
| D-29 | **No deploy/push without explicit authorisation.** | User | Decided by the owner |

## 2. Open questions (OQ-xx)

None of the 18 has been answered yet. Until one is, the **default** in the last column applies and the
named phase must not start without the owner knowing which default it is running on.

| ID | Question | Needed before | Default if unanswered | Status |
|---|---|---|---|---|
| OQ-01 | Which providers/accounts exist today (banks, wallets, POS, cheque, cash offices)? | P2-04 | Registry starts empty; legacy `1000` remains. | OPEN (default applies) |
| OQ-02 | Accrual transition: cutover entries (D-01a) or back-dated restatement? Cutover date? Have financial statements already been issued from the system? | P9-04 | Cutover entries at the start of the current term. | OPEN (default applies) |
| OQ-03 | Rounding rule (half-up vs bankers) and whether tambala (cents) are ever collected. | P1-01 | Half-up, 2 dp. | OPEN (default applies). 2026-11-25: owner accepted half-up at 2 dp as the working default; still open for the accountant. It lives in one constant, `ROUNDING` in `src/lib/money.ts`. |
| OQ-04 | Fiscal year start month; are terms the reporting periods? | P2-05 | Calendar year, monthly periods. | OPEN (default applies) |
| OQ-05 | Approval thresholds (expense payment, refund, transfer, write-off, backdating days). | P4-03 | All payments above MWK 0 need a single approver; configurable. | OPEN (default applies) |
| OQ-06 | Employer statutory items and their rules/rates; which remittance bodies. | P5-01 | Employer pension % setting only. | OPEN (default applies) |
| OQ-07 | Is VAT/withholding tax charged on supplier invoices? | P4-06 | Not modelled; amount fields only. | OPEN (default applies) |
| OQ-08 | Term start/end dates: where authoritative? | P3-01 | Use SystemSettings term dates if present **(verify)**. | OPEN (default applies) |
| OQ-09 | Should loan interest be recognised when collected or accrued? | P5-06 | When collected. | OPEN (default applies) |
| OQ-10 | Are split POs per requisition ever needed? | P4-05 | No (D-15). | OPEN (default applies) |
| OQ-11 | Credit expiry/refund policy for student credit. | P3-07 | No expiry; refund by approval. | OPEN (default applies) |
| OQ-12 | Is salary deduction for library fines lawful/acceptable at the school? | P5-08 | Feature stays off. | OPEN (default applies) |
| OQ-13 | Cheque handling: when is a cheque "received" vs "cleared"; bounced-cheque fee? | P7-01 | Receive into cheque-clearing account; reclass on clearing. | OPEN (default applies) |
| OQ-14 | Fixed-asset policy: capitalisation threshold, depreciation method/rates. | P8-05 | Not started. | OPEN (default applies) |
| OQ-15 | Inventory costing method and which stores are valued. | P8-06 | Not started. | OPEN (default applies) |
| OQ-16 | Record retention period for financial history and evidence files. | P8 | 7 years, no auto-purge. | OPEN (default applies) |
| OQ-17 | Staff payment details for payroll disbursement (bank/wallet) — captured where? **(verify)** staff profile fields. | P5-04 | Disbursement records by batch/account, not per staff account. | OPEN (default applies) |
| OQ-18 | Do student fines ever get added to the next invoice? | P6 | No (deferred). | OPEN (default applies) |

## 3. Implementer choices made inside the plan's gaps

These are choices the plan does not specify. They were put to the owner, who **confirmed all four** on 2026-11-24
(reply: "yes i confirm"). They apply to P0-03 and are recorded so a later phase can see why the code is shaped this way.

| ID | Choice | Where it applies |
|---|---|---|
| I-01 | Pending flag-change proposals are stored in `SystemSettings` (key `finance.v2.proposals`, one proposal per module, row locked `FOR UPDATE` while it changes). No new table, because P0 allows no schema change (additive migrations start in P1). | `settingsService.ts` |
| I-02 | Only the **Finance** role can propose a flag change and only **High Rank** can approve or reject it; **Admin** can read the screen but not change anything. The proposer can never decide their own proposal. | `routes/settings.ts`, `settingsService.ts` |
| I-03 | A written reason is required on every proposal, 1 to 500 characters. | `settingsService.ts`, `FeatureRollout.tsx` |
| I-04 | The audit row for a flag change is written straight after the change commits, not inside the same transaction. It moves inside the transaction when P1-11 makes financial audit transactional. | `settingsService.ts` |
| I-05 | The baseline checks compare **journal references**, because the code stores no link between a journal entry and the record that caused it (plan X-13). A reversal is matched by `VOID-<reference>`. | `tools/finance-baseline/checks.mts` |
| I-06 | The integration harness creates a throwaway **database** per run (not a schema), because seven existing migrations check for enum types with `pg_type` lookups that ignore schemas and would fail inside a database that already holds the app. | `src/server/__integration__/harness.ts` |

## 4. Implementer choices made during P1

Not specified by the plan. **I-07 to I-09 confirmed by the owner on 2026-11-25** ("I agree with them"); each states the default taken so it can be reversed.

| ID | Choice | Where it applies |
|---|---|---|
| I-07 | `moneyInput` caps an amount at `MONEY_MAX` = 9,999,999,999.99 (the largest value a `Decimal(12,2)` column holds) unless the caller passes a lower `max`. The plan wants the bound to come from settings; a shared schema cannot read settings, so this is the safe default until the threshold settings exist (OQ-05). `moneyInput` was applied to six fields: payment amount, payment allocation amount, expense amount, library-fine amount, fee-structure create and update. | `packages/shared/schemas/finance.ts` |
| I-08 | `createJournalEntry` keeps its **0.01 balancing tolerance** after P1-01. Exact balancing is task P1-03 (A2-F2, X-10) and a test pins the tolerance so it cannot change by accident. Line amounts are now rounded half-up to the cent first, as the database column would store them. | `accountingService.ts` |
| I-09 | In `feeService`, the money tolerances (`+ 0.01`, `> 0.01`) are replaced by exact comparison, because the tolerance existed only to absorb float error. Result: one cent over a fee's balance is an overpayment. See the behaviour-change list in the log. | `feeService.ts` |
| I-10 | The optional `tx` is the **last** parameter of `createJournalEntry`, `postEntry`, `voidEntry` and `recordPaymentEntry`; the plan writes it first (`fn(tx?, …)`). Trailing keeps every existing call site compiling unchanged; the behaviour is what the plan specifies (use the passed client or open its own). | `accountingService.ts` |
| I-11 | With the balancing tolerance removed (I-08 is **superseded**: the 0.01 tolerance ended in P1-03), `payrollApprovalService.lock` computes deductions exactly (`totalGross - totalNet` with the money utility) and skips the deductions line only when it is zero. Before, it skipped it at `<= 0.01`, which only the tolerance hid. No other caller needed a change. | `payrollApprovalService.ts` |
| I-12 | `accountingService` signals ledger rule breaks with `LedgerError` (`ALREADY_POSTED` 409, `UNBALANCED` 422, `NOT_FOUND` 404) so routes can answer with the plan's codes; messages are unchanged. The claim uses `isPosted` until P1-05 adds `status`. | `accountingService.ts` |
