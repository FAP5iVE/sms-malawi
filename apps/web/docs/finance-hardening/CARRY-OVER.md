# Finance hardening: carry-over guide

For the chat that continues this work from **P1-07**. Written 2026-11-28 by the chat that did P1-05 and P1-06.
Read it all before touching code. `IMPLEMENTATION-LOG.md` and `DECISIONS.md` are the detailed record; if this guide and the plan
(Parts 1 to 6) disagree, the plan wins.

## 0. First message for the owner to paste into the new chat

> Continue the SMS Malawi finance hardening from P1-07.
> Repository: https://github.com/FAP5iVE/sms-malawi, branch `finance-hardening/p1-06-to-p1-13`.
> First read `apps/web/docs/finance-hardening/CARRY-OVER.md` completely, then the files it lists, and follow it.
> Implement P1-07 to P1-13 with their test files, one task and one commit at a time, then test all of P1 thoroughly at the end.
> Commit and push to that branch. Never push or merge to main. Use the connected Neon database only as the guide describes, and do not change production.

## 1. Where things stand (2026-11-28)

| Item | State |
|---|---|
| `main` (production) | `ac77473`. Latest migration applied in production: `20261126090000_journal_reversal_columns` (P1-04). |
| P1-05 | Branch `finance-hardening/p1-05-journal-immutability`, commit `0607c6e`, pushed. Not merged. |
| P1-06 | Branch `finance-hardening/p1-06-to-p1-13` (contains P1-05). Not merged. |
| Integration suite | **Never shown green for P1-02 to P1-06.** Written, not run. |
| Neon trial (rolled back) | Done for P1-05 only. |
| Independent review | Done for P1-05. **Not done for P1-06.** |
| Screens in a browser | Not tried for P1-06. |
| Preview build | Success for P1-05 and for P1-06 (`6baf467`). |

Next numbers: implementer decision **I-37**; migration folder timestamps after `20261127090000`.

## 2. The owner's instructions (standing)

- Finish every remaining P1 task (P1-07 to P1-13) with its test files first, then test each one thoroughly at the end of P1. Spending long on one sub-phase
  was too slow.
- **Only the owner pushes to `main`.** Push work branches only. Merging to `main` migrates production (`tools/migrate-deploy.mjs`), and no production deploy
  or migration is authorised (D-29).
- The owner runs the integration suite on Windows PowerShell. Give commands ready to copy; for a corrected command, no extra commentary.
- The owner has said the database content is demo seed data that may be reset. That does not remove the rule below: nothing destructive is run unless the
  owner's own message asks for it and names the target.
- `.env` and `service-account.json` may be present: never print or commit them.
- The Prisma engine download is blocked in the workspace: no Prisma client, no database through Prisma. Do not retry or work around.
- Never commit `AGENTS.md` or `CLAUDE.md` written by `next dev`.
- Keep the owner informed with short, plain progress notes during long work. Say plainly what was not run or not proven.

## 3. Read first, in this order

All in `apps/web/docs/finance-hardening/`:
1. `README.md`, then `06-implementation-phases-migration-and-testing.md` §1 to §3 (rules and task list).
2. `04-workflow-and-service-spec.md` §1 (transaction, claim, error and idempotency rules), §3, §4, §14, §15.
3. `03-data-model-and-accounting-spec.md` §4, §14, §15 and the constraint, trigger and invariant lists.
4. `05-permissions-and-ui-spec.md` §1 (needed for P1-10).
5. `IMPLEMENTATION-LOG.md` (P1-01 to P1-06), `DECISIONS.md` (I-01 to I-36), `runbooks/backup-and-freeze.md`.

The repository also has the earlier "hills" gates and rules (see §6). The owner asked for them to be remembered during implementation.

## 4. Plan rules that bind every task

1. One task at a time, one agent, no parallel agents. A task is code, screens, tests and documents.
2. No package installs beyond the lockfile. Use `exceljs`, Zod, Prisma `Decimal`, `node:crypto`, vitest.
3. Change existing files; create new ones only where the plan lists them (plus migrations and tests).
4. Expand, backfill, then enforce. Never drop a column.
5. Before a phase, re-run the V-checks (Part 1 §9) and diff the finance files against `5c816c0`.
6. `finance.v2.*` flags gate modules; the old behaviour stays until the phase's gate passes.
7. Every task ends with an `IMPLEMENTATION-LOG.md` entry: done, files, verification, decisions, what remains, questions.

## 5. How a task is done here

1. Read the task in Part 6, the matching spec sections and the earlier decisions.
2. Read the real code and every caller of what will change. Line numbers in the plan have moved; search by name.
3. Design inside the plan. Where the plan leaves a gap, take the safest default and record it as `I-xx` ("proposed, not yet confirmed").
4. Backend first, then screen changes in the same task. No visual redesign unless the task asks.
5. Money rules:
   - `src/lib/money.ts` for all arithmetic;
   - every money action runs in `runFinancialTransaction` (`server/lib/financialUnitOfWork.ts`);
   - every state change is a claim: `updateMany` with the expected status, count must be 1, else 409;
   - all state checks sit **inside** the transaction, so a replayed request gets its stored answer;
   - posting goes through `financialRegisterService` (register row and journal entry in the same transaction);
   - lock order: idempotency key, then the aggregate rows `FOR UPDATE` by ascending id, child rows, then accounts by ascending id;
   - nothing in the server retries a money write.
6. Migrations: hand-written SQL, `BEGIN`/`COMMIT`, safe to run twice (check `pg_type` / `pg_constraint` with the current schema), additive, a header comment saying
   what the previous application version does against the new schema. Update `schema.prisma` to match.
7. Tests: unit tests (mocked Prisma) plus integration cases in `src/server/__integration__/` for anything about atomicity, locking, constraints or triggers.
   A new table with a foreign key to the journal or the register must be added to the `TRUNCATE` lists in the integration tests.
8. Verify (§6), write the log, decisions and runbook notes, make **one commit per task**, push, check the remote and the preview build.
9. Report: what passed, what failed, what was not run.

## 6. Checks and how to run them

Run from `apps/web`. Keep scratch output outside the repository.

**Unit tests.** `test/setup.ts` imports a package that is not installed here, so use a throwaway config, and delete it before committing:

```js
// apps/web/vitest.tmp.config.mts  (never commit)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = path.dirname(fileURLToPath(import.meta.url))
export default { root,
  resolve: { alias: { 'server-only': path.join(root,'test/stubs/empty.ts'), '@': path.join(root,'src'), '@shared': path.join(root,'..','..','packages','shared') } },
  test: { testTimeout: 15_000, environment: 'jsdom', globals: true, include: ['src/**/*.test.ts','src/**/*.test.tsx'], exclude: ['node_modules/**','src/stories/**','e2e/**'] } }
```

`npx vitest run -c vitest.tmp.config.mts > out.txt`

The suite is not green on `main`: **33 tests fail** there and on this branch (2071 pass, 2104 total after P1-06). Compare names, not counts:
`grep -E '^ FAIL ' out.txt | sed -E 's/ [0-9]+ms$//' | sort -u`. Make the baseline list by running the same command on the branch **before** changing anything.

**Types.** `node --max-old-space-size=4096 ./node_modules/typescript/bin/tsc --noEmit --incremental false`
Baseline after P1-06: **1011 errors**, nearly all because the Prisma client is not generated. Compare the lists; every new line must be explained.

**Lint.** `npx eslint <changed files>` must be clean.

**Gates.** `pnpm hills:test`, `pnpm finance:baseline:test`, `pnpm hills:contrast` pass. `pnpm hills:inventory:check` and `pnpm hills:ratchets` already fail for
other files: compare their output before and after. `pnpm hills:logic-diff --base origin/main` reports "needs review" for finance files; do not add allowlist entries.

**SQL on a real database.** A local PostgreSQL 16 was available (`pg_ctlcluster 16 main start`; create a throwaway superuser and database). Check, as done before:
1. all `prisma/migrations/*/migration.sql` apply in name order to an empty database (35 after P1-06);
2. each new migration runs twice without error and the data does not change;
3. an old-shaped database with data upgrades correctly;
4. every new constraint and trigger refuses what it should (direct SQL), including two sessions at once for locks and claims;
5. `schema.prisma` matches the database (columns, nullability, foreign keys, unique indexes, enum values).

`prisma validate` is blocked here; the earlier chat checked the schema with the parser already inside the installed Prisma package, with no download.
The earlier chat's check scripts lived in its temporary folder and are **not** in the repository.

**Preview build.** A Vercel preview runs `prisma generate` and `next build` with type errors enforced, so it is the real type check:
`gh api repos/FAP5iVE/sms-malawi/commits/<sha>/status`. (The Vercel connector answered 403 for the team.) Preview builds do not migrate.

**Integration suite (owner, PowerShell):**

```powershell
git fetch origin
git switch finance-hardening/p1-06-to-p1-13
git pull
pnpm install
pnpm --filter web exec prisma generate
$env:TEST_DATABASE_URL = "<direct connection string of the itest-harness branch>"
pnpm --filter web test:integration
```

## 7. Neon, production, Git

- Neon project `long-fire-80218178`, database `sms_db`. Production branch `br-muddy-haze-abwudmht`; test branch `itest-harness` `br-spring-wind-abzzqt6y`.
- Production is read-only for this work. Run no SQL that changes data or structure unless the owner's own message asks for it and names the target. Delete no
  branch unless asked.
- The P1-05 trial ran the migration SQL on `itest-harness` inside one transaction that was rolled back, with before and after fingerprints. History retention is 6 hours.
- The free plan allows 10 branches and each preview takes one (4 in use on 2026-11-28, after the P1-06 preview). If a preview cannot get a database, count the branches.
- Read-only facts, production: 1,013 journal entries and 2,062 lines on 2026-11-27, 0 lines violating CHK-01; accounts `1000` and `4000` active; payments
  `cmwwtsqgj0001jp07bhd9jid1` (97,900) and `cmwwuwtub0001jn07eekpslkv` (200,000) have **no journal entry** (P1-07 should list them, P9 repairs them).
- Push: `git -c push.negotiate=true push -u origin <branch>`, then confirm with `git ls-remote origin`. Never push `main`.
- End commit messages with the attribution lines your own session gives you.
- Untracked `.harnesskit/` folders are tool leftovers: do not commit them. Stage files by name, not `git add -A`.

## 8. Remaining P1 tasks

The task text in Part 6 §3 is the authority. The notes under each are the earlier chat's **design intentions, not implemented**; check them against the code.

### P1-07 Posting exceptions and recovery worker
- Migration (next part of M01): `posting_exceptions`. A partial unique index on a fingerprint while unresolved, so one problem is listed once.
- Retry worker: takes register rows in `PENDING_POSTING` / `POSTING_FAILED` that carry a `postingPlan` and posts them with `postRegistered`; idempotent by source key;
  attempts, backoff, critical after N.
- Legacy records with no journal entry are listed with automatic retry **off**: posting them is a historical repair that needs approval (P9, D-05).
- List API and a small Finance banner ("N items need attention").

### P1-08 Claims on every read-then-update
- Expense **approve** (claim, budget and journal in one transaction; `updateBudgetSpent` must accept the transaction) and **mark-paid**; library fine **pay**;
  `libraryWorkflowService.approveFineWaiver` (`PENDING → WAIVED`); `feeService.applyLatePenalties` (claim `late_penalty = 0`, lock with `job_runs`);
  `hrService` loan approve and disburse (+ `disbursedByUid`) and the `requestLoan` partial unique **UQ-16** (check the data first);
  `assetService` reconcile and write-off; `payrollApprovalService` submit, approve, lock, rollback, return (lock posts in the same transaction).
- Interim budget guard: more than one matching budget → `AMBIGUOUS_BUDGET`; none → `NO_BUDGET` unless a High Rank override reason is recorded.
- Register keys: expense `(EXPENSE, id, RECOGNITION)`, direction OUT if paid immediately else NONE; `(EXPENSE_PAYMENT, id, PAYMENT)`;
  fine `(LIBRARY_FINE, id, PAYMENT)` IN, party STUDENT; payroll `(PAYROLL_RUN, id, RECOGNITION:vN)` NONE and `REVERSAL:vN` with `reversalOfId`
  (a run locked before the register: `REVERSAL:{entryId}`). No register row when there is nothing to book. Keep the current entry dates.
- The screens that call these need the same per-action key as payments (`actionKeyFor` / `releaseActionKey` in `lib/api-client.ts`).
- Tests: concurrent double submit for each (**T-06**).

### P1-09 Close the fine bypasses
- `PATCH /library/fines/:id/clear` and `/finances/library-fines/:id/waive` answer 410 `GONE` with guidance; the clear route goes, `libraryService.clearFine` stays.
- Same change in the screens: `useLibrary.ts` clear → "Send to Finance"; `LibraryFinesTab.tsx` Waive → "Request waiver" (`/library/fine-waivers`).

### P1-10 Permission alignment
- New keys and role mapping in `packages/shared/types/permissions.ts` (Part 5 §1.3); finance, payroll, HR loan and library fine routes use `requirePermission`;
  flag `finance.v2.permissions`; route-matrix unit test; segregation-of-duties helper in `lib/selfReview.ts` (SoD-01 to SoD-15);
  `app/(auth)/finances/page.tsx` uses `usePermissions()`.
- Admin is refused finance writes; High Rank cannot record payments; Finance cannot approve its own items.
- Before it is switched on, everyone doing finance work needs a Finance account (Part 5 §1.5): tell the owner.

### P1-11 Financial audit
- `financial_audit_log`, append-only with a hash chain (**TRG-05**); `auditService.recordFinancial(tx, …)` under a Postgres advisory lock (no new file); V-02.

### P1-12 Retry policy
- Document `withRetry` (`lib/prisma.ts`) as for reads and idempotent work only; money services use the unit of work; screens reuse the same key on retry.

### P1-13 Integrity checker v1
- New `integrityMonitorService.ts`: INV-01, 02, 06, 07, 08; nightly through the existing cron (`app/api/cron/daily-tasks/route.ts`, `runTask`; the single cron is
  in the root `vercel.json`); writes posting exceptions.

## 9. What P1-06 leaves for you

- Only payment recording uses the register so far.
- Expired idempotency records are never deleted; nothing uploads financial evidence yet.
- `postEntry` computes balance changes from lines read before its claim; nothing edits draft lines today.
- Posting checks that an account exists, not that it is active (P2-01).
- Decisions I-15 to I-36 await the owner's confirmation.

## 10. Thorough testing at the end of P1

1. Everything in §6 on the final branch.
2. Integration suite green on `itest-harness` (owner runs it); record the result in the log.
3. Rolled-back trial on `itest-harness` of every unmerged migration, in order (ask the owner before running it).
4. An independent review of P1-06 onward, with findings fixed.
5. Exercise the changed screens on the preview, or give the owner a step-by-step check list.
6. Runbook merge notes for each migration. The owner decides when to merge.

## 11. After P1: running P3 and P4 at the same time

Possible. Part 6 §2: P3 depends on P2, and P4 depends on P2 only. Conditions:
- P1 is finished and tested, P2 is done, and both are in one shared base commit.
- Each chat starts from that commit on its own branch, with its own range of decision numbers and its own migration timestamps.
- Expect conflicts in `schema.prisma`, shared services and screens, the log and the decisions file.
- Only pushed work can be merged. One chat then merges both, reconciles, re-runs every check and pushes; the owner merges to `main`.
- This sets aside plan rule 1 (one agent at a time) by the owner's choice.
- All chats count toward the same usage limit.
- Each preview takes a Neon branch, so watch the limit of 10.
