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

Not passed. Still needed before P1 starts (Part 6 §2):
1. The first **real baseline report** from a production copy.
2. The integration harness run once on the Neon test branch.
3. The owner's answers in the P0-04 runbook §1.
4. Owner authorisation to start P1 (plan D-29 governs any deploy).

## Pre-existing problems found (not caused by, and not fixed in, this work)

Reported so they are not mistaken for regressions:
- The unit project's setup file (`test/setup.ts`) imports `@testing-library/jest-dom`, which is **not declared** in `package.json`, so `vitest run --project unit` fails at startup in a fresh install.
  The plan forbids installing packages, so it was not added. Tests here were run with a throwaway config that omits that setup file.
- 14 existing tests fail identically with and without this work: `settings.actions.test.ts` (7, role `parent`), `guardianSchemaMigration.test.ts` (4), `assignmentService.test.ts` (1),
  `passwordResetService.test.ts` (1), `routeContract.test.ts` (1, gateway verbs against the CORS list).
- `pnpm docs:security` points at `scripts/generate-security-docs.mts`, which does not exist in the repository.
- `tools/hills/handler-inventory.mts --check` already reports other people's files as changed or new; the new `FeatureRollout.tsx` shows as "new" in it. The inventory was left alone so it does not absorb unrelated changes.
