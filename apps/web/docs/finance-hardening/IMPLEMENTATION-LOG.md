# Finance hardening: implementation log

[CHANGE TYPE]: NEW FILE (P0-05). Every task appends an entry here: what was done, files changed, decisions,
what remains, open questions. Newest entries at the bottom. Nothing in this log has been pushed or deployed
(plan D-29).

Entry template:

```
### <task id> <title>  (<date>)
Status: done | partly done | blocked
What was done:
Files:
Verification (what was run, what it showed):
Decisions (I-xx in DECISIONS.md):
Remains / open questions:
```

---

## Phase P0: Foundation (no behaviour change)

Session of 2026-11-24. Worked on a clone of `FAP5iVE/sms-malawi` at `d449520` ("docs: finance overhauling hardening plan documents").
Delivered as a zip and patch, not pushed.

### Pre-phase check V-12: repository against the audited commit  (2026-11-24)
Status: done.
The repository HEAD differs from the audited commit `5c816c0`. The finance files were diffed: the only changes are
MANEB models, email wording and other unrelated items. **No finance logic changed**, so Parts 1 to 6 still describe
the code accurately.
Also seen while here, and relevant to later phases:
- **V-01 (P1)** still true: `accountingService` posts through the global `prisma`, and `postEntry` checks `isPosted` outside its transaction.
- **V-13 (P1)** partly checked: a user with the `superUser` claim passes every `requireRole` gate. How `requirePermission` treats it
  was **not** checked and must be before P1-10. The flag routes below do not depend on this: the proposer-versus-approver check uses the real user id.

### P0-01 Integration-test harness  (2026-11-24)
Status: **done in code; not yet run against your Neon test branch.**
What was done: a real-Postgres test harness. `createTestDb()` creates a throwaway database, applies every migration with
`prisma migrate deploy`, and returns Prisma clients; `runConcurrently(n, fn)` runs `n` workers on separate connections released
together by a barrier; `failpoints` lets a test inject a failure at a named point; `teardown()` drops the database. The suites skip when
`TEST_DATABASE_URL` is not set, so plain `pnpm test` is unaffected. A new `integration` Vitest project runs `*.itest.ts` files one at a time.
Files: `src/server/__integration__/harness.ts`, `harness.itest.ts`; `vitest.config.ts` (new `integration` project); `package.json` (`test:integration`).
Run: `TEST_DATABASE_URL=postgresql://… pnpm --filter web test:integration`. Use the **direct** (non-pooled) connection string of a
throwaway branch; the role needs CREATEDB. The harness refuses to run if `TEST_DATABASE_URL` is the same database as `DATABASE_URL`.
Verification:
- Type-check and lint clean; the project loads and skips cleanly without a URL.
- Prisma's engine could not be downloaded in the working environment, so the harness itself has **not** been executed. What was proven directly
  in a local Postgres 16 instead: (1) all 30 migrations apply to a fresh database (117 tables); (2) two sessions locking one row with
  `SELECT … FOR UPDATE` ran strictly one after the other and the counter ended at 2, not 1; (3) `DROP DATABASE … WITH (FORCE)` removes it.
- Finding that shaped the design (I-06): seven migrations guard enum creation with `pg_type` lookups that ignore schemas. Applying the migrations to
  a new *schema* inside a database that already holds the app failed (`type "ResidenceType" does not exist`), so the harness creates a new *database*.
Remains: run `harness.itest.ts` once on the Neon test branch and record the result here.

### P0-02 Read-only baseline reconciliation  (2026-11-24)
Status: **done in code and verified on synthetic data; the real baseline has NOT been run** (needs a copy of production).
What was done: 46 read-only checks in 8 groups (ledger integrity, journal references, receivables, expenses and budgets, procurement,
library fines, payroll and loans, orphan references), each citing the plan finding it measures and the repair class it feeds (A, B, C, or information).
Output: a Markdown summary and a CSV of exceptions (ids and amounts only). Runs in a `REPEATABLE READ, READ ONLY` transaction and refuses to run
against `DATABASE_URL`.
Files: `tools/finance-baseline/{checks,report,run,fixture}.mts`, `tools/finance-baseline/__tests__/checks.test.mts`,
`src/server/__integration__/baseline.itest.ts`, `docs/finance-hardening/baseline/README.md`; `package.json` (`finance:baseline`, `finance:baseline:test`).
Run: `BASELINE_DATABASE_URL=postgresql://…copy… pnpm --filter web finance:baseline` (reports land in `docs/finance-hardening/baseline/`).
Verification:
- `pnpm finance:baseline:test`: 11 of 11 pass (read-only SQL only, three columns, no personal-data columns, exact cent maths, CSV quoting, fixture coverage).
- Against a local Postgres 16 with the repo's real schema: a synthetic fixture with planted defects was loaded, and **all 46 checks returned exactly the
  expected rows**; the returned records were inspected and are the intended ones. On an **empty** database all 46 return zero rows.
  In a `READ ONLY` transaction an `INSERT` is refused (`cannot execute INSERT in a read-only transaction`).
- One of my own checks was wrong at first (RC-05 would have flagged every overpaid invoice) and was corrected to subtract the credit an overpayment creates.
Remains / open:
- **Run it on a production copy** and attach the report. This is the P0 "done when" and sizes the repair work.
- A check reports; it does not decide the right figure. Several rely on matching a journal entry to its record by reference string, because the code stores
  no link (X-13). Two invoices whose ids share the same last 8 characters would be confused.
- LF-04 (several fines of the same kind on one borrowing, V-08) is only exercised for valid SQL in the fixture, not for detection, because a borrowing needs a book and a borrower to exist.

### P0-03 Feature flags and kill switches  (2026-11-24)
Status: **done in code; unit-tested; not yet exercised against a real database or in a browser.**
What was done:
- Ten flags, all **off** by default: `finance.v2.` + `ledgerEngine`, `accountsRegistry`, `receivables`, `expenses`, `payroll`, `loans`, `fines`, `reconciliation`, `reports`, `permissions`.
  (The first nine are Part 4 §1.8; `permissions` is the P1-10 flip in Part 5 §1.3.)
- `getFinanceV2Flags()` reads all ten in one cached read; `isFinanceV2(module, snapshot?)` answers from a snapshot so a request reads once. Anything other than the boolean
  `true` counts as off, so a bad value falls back to version 1.
- Settings, Finance, **Feature rollout**: shows each module ON/OFF, who changed it and when, and any change waiting for approval. **Finance proposes** (with a reason),
  **High Rank approves or rejects**, the proposer can never decide their own proposal, **Admin** sees it read-only. Approving flips the flag and clears the proposal in one
  transaction. Every step is audited (`finance.flag_proposed`, `finance.flag_approved`, `finance.flag_rejected`).
- The flags are not writable through any of the older settings routes.
- High Rank can now open Settings, Finance preferences, and sees only the Feature rollout tab (the General tab stays Admin and Finance, as before).
Files: `packages/shared/types/settings.ts`, `packages/shared/schemas/settings.ts`, `src/server/services/settingsService.ts`, `src/server/services/auditService.ts`,
`src/server/routes/settings.ts`, `src/components/settings/FinanceSettings.tsx` (now a shell with sub-navigation around the unchanged General form),
`src/components/settings/finance/FeatureRollout.tsx` (new, as Part 5 §4.1 allows), `src/app/(auth)/settings/page.tsx`,
`src/server/services/__tests__/financeV2Flags.test.ts`, `docs/security/endpoint-inventory.md` (regenerated, see below).
Verification:
- `financeV2Flags.test.ts`: 15 of 15 pass (defaults off; malformed value reads as off; snapshot avoids a second read; propose needs a reason and a known module; no-change proposals
  refused; one pending per module; proposer cannot decide; approve flips the flag, clears the proposal and records who and when; reject changes nothing; second decision refused;
  switch back off; a code path branching on the flag runs v1, then v2 after approval).
- Type-check clean; lint clean on every changed file.
- The row lock used for the proposals (`SELECT … FOR UPDATE` on `system_settings`) was proven in Postgres (P0-01 above); the service tests use an in-memory stand-in, so the lock is
  not yet exercised through Prisma.
- `docs/security/endpoint-inventory.md` is checked against the code by an existing test. It was **already out of date** before this work (that test failed on the untouched code), and the three new
  routes widen the gap. It was regenerated with the repo's own renderer. The regenerated file therefore also contains small updates for earlier,
  unrelated changes (guardian and ID-number routes).
Decisions: I-01 to I-04 (confirmed by the owner).
Remains: try it in a browser as Finance, High Rank and Admin; run on the Neon branch.

### P0-04 Backup and freeze procedure  (2026-11-24)
Status: **written; blocked on owner confirmation.**
Files: `docs/finance-hardening/runbooks/backup-and-freeze.md`.
Open: the owner must confirm the items in §1 of that runbook: branching and point-in-time restore on the current Neon plan, the retention window, any independent export, who may authorise a
restore, and **how production migrations are applied today** (the repository has no migrate script and the build does not run migrations).

### P0-05 Documentation scaffold  (2026-11-24)
Status: done.
Files: this log; `docs/finance-hardening/DECISIONS.md` (31 decisions D-01 to D-29 with D-01a and D-01b, and 18 open questions OQ-01 to OQ-18, wording copied from Part 1 by script, plus the six
implementer choices I-01 to I-06).
Remains: nothing for P0-05.

---

## Phase P0 gate

**Not passed.** Re-checked 2026-11-25 against the committed code (`ed714f9`). P0 is **complete as code and documents**
(P0-01, P0-02, P0-03, P0-05 done; P0-04 written) but its "done when" conditions still need things only the owner can supply
(Part 6 §2):
1. The first **real baseline report** from a production copy. **Open.** The report supplied on 2026-11-24 is
   `SYNTHETIC-demo-baseline-report.md`, generated from the planted-defect fixture, not from school data. It proves the 46 checks
   fire (45 report rows, LF-04 is clean as documented) and shows the report format. It sizes nothing and must not be filed in
   `baseline/` (see that folder's README).
2. The integration harness run once on the Neon test branch. **Open.**
3. The owner's answers in the P0-04 runbook §1. **Open.**
4. Owner authorisation to start P1 (plan D-29 governs any deploy). **Given 2026-11-24** ("start the next phase"), taken as
   authorisation to write P1 **code and tests only**. Nothing is applied to production: runbook §1 (1) and (2) must be
   answered before any P1 migration touches the production database.

## Pre-existing problems found (not caused by, and not fixed in, this work)

Reported so they are not mistaken for regressions:
- The unit project's setup file (`test/setup.ts`) imports `@testing-library/jest-dom`, which is **not declared** in `package.json`, so `vitest run --project unit` fails at startup in a fresh install.
  The plan forbids installing packages, so it was not added. Tests here were run with a throwaway config that omits that setup file.
- 14 existing tests fail identically with and without this work: `settings.actions.test.ts` (7, role `parent`), `guardianSchemaMigration.test.ts` (4), `assignmentService.test.ts` (1),
  `passwordResetService.test.ts` (1), `routeContract.test.ts` (1, gateway verbs against the CORS list).
- `pnpm docs:security` points at `scripts/generate-security-docs.mts`, which does not exist in the repository.
- `tools/hills/handler-inventory.mts --check` already reports other people's files as changed or new; the new `FeatureRollout.tsx` shows as "new" in it. The inventory was left alone so it does not absorb unrelated changes.

---

## Phase P1: Ledger core, immediate safeguards, permissions

Session of 2026-11-25. Worked on a clone of `FAP5iVE/sms-malawi` at `ed714f9` (the P0 commit). Not committed, not pushed.
Order of work follows Part 6 §3 (one task at a time).
Pushed 2026-11-25 on branch `finance-hardening/p1-01-money-utility`, applied on `main` at `9499ae6` (PR #2, Sentry fixes). That PR changed
`feeService.ts` only to build the Algolia search record (`toAlgoliaInvoice`) and let bulk generation defer indexing; it has no money arithmetic, so
it does not interact with P1-01. The new and related tests were re-run on the merged tree (28 files, 428 tests, all passing).

### Pre-phase check V-12: repository against the audited commit  (2026-11-25)
Status: done.
HEAD is `ed714f9`; the audited commit is `5c816c0`. Diffed the finance files (`accountingService`, `feeService`, `payroll*`,
`expenseApprovalService`, `budgetService`, `hrService`, `library*`, `bulkInvoiceService`, `routes/{finances,payroll,hr,library}`,
`schema.prisma`, shared finance schemas and permissions). **No posting, claim or permission logic changed.** What did change:
- `feeService.listStudentBillingStanding()` and `GET /finances/billing-standing`: a new **read-only** list (2026-11-24). It reads
  invoice balances with `Number(...)`; it moves no money and is left for the P3 receivables rewrite.
- `StaffProfile.payrollNo` removed from the schema and the HR routes (relevant to V-09 / OQ-17: staff payment-detail fields).
- Everything else is unrelated (MANEB, signatures, report cards, settings, student service).
Parts 1 to 6 still describe the code accurately.

### P1-01 Money utility and Zod money validators  (2026-11-25)
Status: **done in code; unit-tested; not run against a real database** (no schema change in this task).
What was done:
- `src/lib/money.ts` (new, justified in the file header): `money` (strict gate for outside values: at most 2 dp),
  `round2` (**half-up**), `add`, `sub`, `mul`, `percentOf`, `sum`, `min`, `max`, `nonNegative`, `compare`, `eq/gt/gte/lt/lte`,
  `isZero`, `allocate` (**largest remainder**, done in BigInt so the shares are exact), `toNumber`, `MONEY_MAX`, `MoneyError`.
  Comparisons have **no tolerance**.
- `packages/shared/schemas/finance.ts`: `moneyInput({min, max, allowZero, label})` and `hasAtMostTwoDecimals`. Now used by
  `RecordPaymentSchema.amount`, `PaymentAllocationSchema.amount`, `CreateExpenseSchema.amount`, `CreateLibraryFineSchema.amount`,
  `CreateFeeStructureSchema.amount`, `UpdateFeeStructureSchema.amount`. Existing wording ("Amount must be positive") is kept.
- `accountingService.ts`: line amounts rounded half-up to the cent before the balance test and before storing; balance deltas,
  the income statement, trial balance and ledger running balance are exact Decimals (converted to numbers once, at the end).
- `feeService.ts`: `computeInvoiceCharges` (subtotal, scholarship share, manual discount, credit), `recordPayment` (duplicate guard,
  allocation total, overpayment, line and invoice balances), `applyLatePenalties`, `repairMissingLatePenaltyLineItems`,
  `addInvoiceLineItem` and the billing-standing rounding helper now use the utility. Every `Math.round(n * 100) / 100` in the file is gone.
Files: `src/lib/money.ts`, `src/lib/__tests__/money.test.ts`, `src/lib/__tests__/moneyInput.test.ts`,
`src/server/services/accountingService.ts`, `src/server/services/feeService.ts`,
`src/server/services/__tests__/{feeService.money,accountingService.money}.test.ts`, `packages/shared/schemas/finance.ts`.
Verification:
- New tests: 63 (money 26, moneyInput 11, feeService 17, accountingService 9). All pass.
- Full unit suite (run with a config that omits `test/setup.ts`, see the pre-existing problems below): **1924 pass, 17 fail**; before this task
  1861 pass, 17 fail. The failing test names are **identical** before and after, so nothing regressed.
- The `feeService` tests were also run against the original `feeService.ts`: 8 of 17 fail there (one cent over an overpayment, 1.005 rounding,
  exact allocation limit, duplicate window by cent, rounded penalty, and others), so they do detect the old behaviour. Some of those 8 fail only
  because the old code hands Prisma a number where the new code hands a Decimal.
- `tsc`: no error in any file added or changed by this task. The 1,000-odd existing errors come from the Prisma client not being generated
  here (engine download blocked) and are unchanged in kind; two old implicit-`any` errors in these files disappeared.
- eslint: no error and no new warning on the changed files.
Decisions (I-07 to I-09 in DECISIONS.md, **confirmed by the owner 2026-11-25**): upper bound defaults to the column maximum; the 0.01 balancing tolerance is **kept** until P1-03;
exact comparisons now replace the money tolerances in `feeService`. Owner also accepted half-up at 2 dp as the working default for OQ-03 (still open for the accountant).
Behaviour changes a reviewer should know about (all follow from "no tolerance, exact cents"):
1. A payment that is **one cent over** a fee line's balance is now an overpayment (confirmation and a 0.01 credit). Before, up to 0.01 was ignored.
2. Allocations may not exceed the payment by even one cent. Before, 0.01 over was allowed.
3. The duplicate-payment guard treats amounts as the same only when equal to the cent (before: within 0.01).
4. A percentage scholarship is rounded to the cent first, so the line shares and the invoice total always agree. Before, the total used the unrounded figure.
5. A late penalty is rounded to the cent. Before it was an unrounded float written to three columns.
6. API clients that send an amount with more than 2 decimal places (or a float artefact such as `0.1 + 0.2`) are now refused with a clear message on the six fields above.
Remains / open questions:
- **OQ-03** (half-up versus bankers rounding, whether tambala are collected) is still open; half-up at 2 dp is the stated default and lives in one constant (`ROUNDING` in `money.ts`).
- The maximum per amount should come from settings (Part 3 §2.1); a shared schema cannot read settings, so callers with a lower business limit pass `max`. Wiring that is for the phase that adds the threshold settings (OQ-05).
- Other services still use float arithmetic and migrate with their phase, as the plan says: payroll, budgets, loans, library fines, `bulkInvoiceService`, `reportService`.
  `listStudentBillingStanding` still accumulates `Number(...)` totals before its final rounding.
- Not yet exercised in a browser: the client forms were not changed, but a form that sends more than 2 decimals will now see the validation message.

### P1-02 Transaction-aware accounting service  (2026-11-25)
Status: **code done; wiring unit-tested; the real-database proof is written but NOT yet run.** Branch
`finance-hardening/p1-02-transaction-aware-accounting`, stacked on the P1-01 branch.
What was done (`accountingService.ts`, modified in place; no new file):
- `createJournalEntry`, `postEntry`, `voidEntry` and `recordPaymentEntry` take an optional trailing `tx` (the client of the caller's open
  transaction, type `LedgerTx = Prisma.TransactionClient`). With `tx`, every read and write goes through it and no transaction is opened
  here, so the entry commits or rolls back with the caller's own writes. This removes the root cause of A1-F3 ("payment saved, journal lost")
  for callers that adopt it; the callers themselves are converted in P1-06/P1-08 (unchanged here: `feeService`, `payrollApprovalService`,
  `expenseApprovalService`, `routes/finances.ts`).
- Without `tx`, existing callers behave as before, except `postEntry`, `voidEntry` and `recordPaymentEntry` now run in **one transaction of their
  own** (an interactive transaction replaces the array form), so a failure partway no longer leaves an orphan draft (check LG-03) or a reversal
  that was created but not posted. `createJournalEntry` alone opens none (one nested create is already atomic).
- Reports (`getTrialBalance`, ledger, income statement) are untouched.
Tests:
- `src/server/services/__tests__/accountingService.tx.test.ts` (11, Prisma mocked): which client each call uses, that a caller's `tx` is the only client
  touched, that no transaction is opened when one is passed, and that the own-transaction path runs create and post inside one. Against the
  **old** service 8 of the 11 fail, so they detect the change. They prove wiring, not rollback.
- `src/server/__integration__/accountingService.itest.ts` (7, real Postgres, **not run**): commit with the caller; rollback undoes the entry, the balances AND a
  business write together; the entry is invisible to other connections until commit; void inside a caller transaction rolls back and commits with it;
  without a caller transaction, create+post commit together, and a posting failure (balance overflow on `Decimal(14,2)`) leaves no orphan draft.
  The test replaces the app's global Prisma client with one bound to the throwaway database and **throws if it is used outside it**.
- Full unit suite: 1937 pass, 17 fail; the 17 are the same pre-existing failures (identical names).
- `tsc` and eslint: nothing new beyond the untyped-Prisma noise (the client cannot be generated here). One genuine type error in the P1-01
  `feeService.money.test.ts` (a mock cast) was found and fixed in this branch.
Decision I-10 (DECISIONS.md): `tx` is the last parameter, not the first as the plan writes it.
Still open by design:
- The "already posted" check is not yet an atomic claim, and the 0.01 tolerance is still there: **P1-03**. Reversal is not yet once-only: **P1-04**.
- Balance updates still run in line order, not a fixed account order: P1-03 (deadlock avoidance).
- **Run the itest before relying on this** (`TEST_DATABASE_URL=… pnpm --filter web test:integration`) and record the result here.

### Neon facts observed through the connector (2026-11-25), runbook §1 partly answered
Read from the Neon API and one read-only query on a preview branch. **These are observations, not owner confirmations.**
- Project `sms-malawi` (`long-fire-80218178`), organisation on the **free plan**, Postgres 16, region aws-eu-west-2.
- §1 (1) Branches: **yes**. Vercel already creates a `preview/<git branch>` branch per pushed branch (including both P1 branches), each a copy of production data. Who may create one by hand: not checked.
- §1 (2) Point-in-time restore window: **history_retention_seconds = 21600, i.e. 6 hours**. A mistake found later than that cannot be restored from Neon itself. This makes a named pre-migration branch (§2 step 2) and a separate export (§1 (3)) more important, not optional.
- The `production` branch is flagged `protected: false` (it cannot be deleted because Vercel uses it).
- §1 (3) separate export, (4) restore authoriser, (5) how production migrations are applied: **still unanswered; owner to confirm.**
- Schema check on the P1-02 preview branch: `chart_of_accounts.balance`, `journal_lines.debit` and `credit` are `numeric(14,2)`, which is the premise of the overflow test in `accountingService.itest.ts`; accounts `1000` (ASSET) and `4000` (REVENUE) exist.
- The integration harness still has **not** been run: this build environment cannot reach the Prisma engine download or the Neon Postgres host. It needs a machine that can (your computer, or CI). Nothing was written to any Neon branch.

### P1-03 Atomic post claim, exact balancing, ordered balance updates  (2026-11-25)
Status: **code done; unit-tested; the real-database proof (T-03) is written but NOT yet run.** Branch
`finance-hardening/p1-03-atomic-posting`, stacked on the P1-02 branch.
What was done (`accountingService.ts`):
- **Atomic claim (A1-F1, A2-F2).** `postEntry` claims the entry with one conditional write,
  `updateMany where id AND isPosted = false`, and requires a row count of exactly 1. A second concurrent post waits on the
  first one's row lock, re-checks the condition when it commits, finds 0 rows and gets `ALREADY_POSTED` (409). Before, both read
  "not posted", both passed, and every balance moved twice. The claim uses `isPosted` because the `status` column arrives with P1-05.
- **Exact balancing (X-10).** The 0.01 tolerance is gone from `createJournalEntry`, and `postEntry` re-checks the stored lines
  exactly, so an old draft that is a cent out cannot be posted. Both fail as `UNBALANCED` (422). Amounts are still rounded
  half-up to the cent first (P1-01).
- **Ordered, atomic balance updates.** One write per account (net signed delta, exact `Decimal`, `increment`), accounts in
  ascending id, so two postings that touch the same accounts always lock in the same order and cannot deadlock.
- **Order inside `postEntry`:** read and validate, then claim, then move balances. Nothing after the claim can fail in JavaScript,
  so a caller that catches an error and keeps its own transaction cannot be left with a claimed entry whose balances never moved.
- `LedgerError` (`code`, `status`: `ALREADY_POSTED` 409, `UNBALANCED` 422, `NOT_FOUND` 404). The messages are the old texts.
  An uncaught posting error now carries a 4xx instead of a generic 500 (visible today only on payroll `lock`; the expense,
  mark-paid and library-fine routes catch posting errors and log them, unchanged).
Companion change (needed by the rule above): `payrollApprovalService.lock` computed deductions as `gross - net` in floats and
skipped the line when it was `<= 0.01`. At exactly 0.01 that left a 0.01 imbalance which only the old tolerance hid. Deductions
are now exact (`sub`) and the line is skipped only when there is nothing to book (decision I-11). Every other caller already
balanced by construction (same amount on both sides, or the mirror image in `voidEntry`).
Tests:
- `accountingService.post.test.ts` (13, Prisma mocked): the claim's condition, claim before any balance write, the loser gets 409 and moves
  nothing, ascending id order for any line order, one write per account with the exact net delta, one-cent imbalance refused on create and on
  post (before claiming), unknown entry 404.
- `payrollApprovalService.lockBalance.test.ts` (4): 0.01 deductions booked, float-unfriendly amounts exact, no deductions, net above gross refused.
  The 0.01 case fails against the old payroll code.
- Existing tests changed on purpose: the test that pinned the 0.01 tolerance (I-08) now pins that a cent imbalance is rejected;
  `postEntry` mocks read via `findUnique` and claim via `updateMany`; the per-line update expectation became per-account.
- `accountingService.itest.ts` (+4, real Postgres, **not run**): **T-03** six simultaneous posts of one draft, five rounds, exactly one
  success each, balances moved once; a deterministic version (A holds its transaction open after claiming, B must stay blocked, then loses with
  `ALREADY_POSTED`); 24 postings listing the same two accounts in opposite orders, none deadlock; a one-cent imbalance refused with nothing written.
- Full unit suite: 17 failed, 1954 passed. The 17 failures are the same pre-existing ones (same 9 files, none finance); 17 new tests pass.
  eslint clean; `tsc` adds only the untyped-Prisma noise.
Data check (read-only, on the P1-02 preview branch, a copy of production taken 2026-11-25 07:45 UTC): 1,012 journal entries,
**0 unbalanced** (1,011 posted, 1 balanced draft). Removing the tolerance blocks nothing that exists today.
Not done by design: reversal is not yet once-only (**P1-04**); callers still post outside their own transactions (P1-06, P1-08);
no migration was needed or written.
**Run before relying on it:** `TEST_DATABASE_URL=… pnpm --filter web test:integration`, then record the result here.
T-03 is the whole point of this task and mocks cannot prove it.

### First integration-harness run (2026-11-25, run by the owner on Windows)  -  FAILED, cause found and fixed
Result: `harness.itest.ts` 2 passed, 2 failed; `baseline.itest.ts` and `accountingService.itest.ts` (all 11 tests, including T-03) **skipped**
because their `beforeAll` failed. So **P1-02 and P1-03 are still not proven on a real database.**
Cause: `prisma/schema.prisma` declares `directUrl = env("DIRECT_URL")` and `prisma migrate deploy` prefers it. The harness overrode only
`DATABASE_URL`, so the migrations went to whatever `DIRECT_URL` points at and the throwaway `it_…` database stayed empty
("table public.chart_of_accounts does not exist"). Fix (this commit): the harness now sets `DIRECT_URL` as well, refuses to run when
`TEST_DATABASE_URL` equals `DIRECT_URL`, and checks that the schema really exists in the new database before any test runs.
What the run touched (checked through the Neon connector): the run used the **production branch's** endpoint. That is allowed by design (the harness
creates and drops its own database) and teardown left no `it_…` database behind. Production's latest applied migration is still
`20261123100000_user_signatures` (24 Nov), so **this run applied no migration to production**; whether `DIRECT_URL` pointed at production
could not be confirmed from here. Two `prisma_migrate_shadow_db_*` databases from earlier local `migrate dev` runs exist on the production branch;
they are harmless but can be dropped.
Going forward: use the dedicated Neon branch `itest-harness` (a copy of production taken 2026-11-25 19:46 UTC) for all harness runs.
Owner note 2026-11-25: all current data is demo seed data and may be reset freely; this removes the "do not touch existing data" worry for the
migrations and repairs in later tasks (the production-safety gates in the runbook still apply to a real go-live).

### Second integration-harness run (2026-11-25, owner, Neon branch `itest-harness`)  -  harness proven, accounting suites still unrun
Result: `harness.itest.ts` **4 of 4 passed**, so the DIRECT_URL fix works: migrations apply into the throwaway database, seeding works, two parallel
transactions serialise, teardown drops the database. `accountingService.itest.ts` failed in `beforeAll` ("Can't reach database server") and
`baseline.itest.ts` hit the 180 s hook limit, so **neither ran a test; P1-02 and P1-03 are still not proven on a real database.**
Causes (checked: the branch was healthy, 11 connections, no leftover `it_` database): (1) the branch compute had suspended and a Neon cold start
outlasts Prisma's 5 s default connect timeout; (2) `prisma migrate deploy` of 32 migrations over the network from a laptop takes well over 100 s
for every test file.
Fix (harness only): connections get `connect_timeout=30`; `createTestDb` first waits for the server to answer; the migrations now run ONCE per set of
migrations into a template database `it_tpl_<hash of the migration files>` (kept between runs, marked ready with a database comment, rebuilt if a build was
interrupted), and every test database is a server-side `CREATE DATABASE … TEMPLATE` copy of it; integration `hookTimeout` is 600 s for the one-off template build.
Template cloning was checked on Neon with a probe. The new code itself could not be run in the build environment; the next owner run is its first.
Housekeeping on `itest-harness`: two empty probe databases (`it_tpl_probe`, `it_clone_probe`) and two old `prisma_migrate_shadow_db_*` databases can be dropped.

### Next in order
<<<<<<< HEAD
P1-03 Atomic post claim, exact balancing, atomic balance updates (A1-F1, A2-F2, X-10; test **T-03**, concurrent post: exactly one success).
Before P1-03 is called proven the harness must have run once on a real database, because T-03 is a concurrency test and cannot be proved with mocks.

### Type-check fix: accountingService.money.test.ts  (2026-11-25)
Status: **done**. `pnpm --filter web exec tsc --noEmit` reported TS7006 (implicit `any`) twice in `postEntry > moves each balance by an exact Decimal delta`.
Cause: `h.prisma` is deliberately `any` (a mock), so `mock.calls.map((c) => ...)` had an untyped parameter and returned `any`, which left the next `.map((u) => ...)` untyped too.
Fix: a local `BalanceUpdate` type, `(c: unknown[])` on the first callback, and the result annotated as `BalanceUpdate[]`. Test logic and assertions are unchanged.
File: `src/server/services/__tests__/accountingService.money.test.ts`.
=======
P1-04 One-time reversal (A1-F2, A2-F3; test **T-04**). It needs migration M02 (reversal columns and a unique constraint), so it must not be applied anywhere until the runbook §1 answers are in and the harness has run.
>>>>>>> origin/finance-hardening/p1-03-atomic-posting
