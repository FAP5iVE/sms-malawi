# Backup and freeze procedure

[CHANGE TYPE]: NEW FILE. **Plan task P0-04** (documentation only; no code).
Source: Part 6 §3 (P0-04), §4 (migration order), §5 (historical repair), §7 (rollout gates).

Nothing in this document has been run. It is the procedure to follow, and it is **blocked on one owner
confirmation**: see §1.

## 1. What the owner must confirm first

The plan assumes the database host can take a **point-in-time snapshot or branch** before every change. This
has not been confirmed for the school's account. Please confirm, and write the answers into
`IMPLEMENTATION-LOG.md`:

1. Can a **branch** (copy of production at a moment in time) be created on the current Neon plan, and who can create one?
2. How far back can the database be **restored to a point in time** (the retention window)? This depends on the plan.
3. Is a **separate, periodic export** (for example a nightly `pg_dump` kept outside Neon) in place? If not, who will own that?
4. Who is the named person allowed to authorise a restore?
5. How are migrations applied to production today? (Answered 2026-11-25 from the repository: by the production build on merge to `main`, see §2 step 4; the owner should confirm that is intended.)

Until 1 and 2 are answered, no migration from P1 onward and no historical repair (P9) should be applied to production.

## 2. Before every migration (P1 onward)

Every phase adds migrations. All of them are **additive** (plan D-10): nothing is dropped, renamed or rewritten, so
the previous version of the code keeps working. Even so, before each one:

1. Confirm the work was done on a branch copy first and the phase's tests (unit, integration, invariants) are green.
2. Create a **named branch or snapshot** of production. Name it `pre-<task id>-<yyyy-mm-dd>` (for example `pre-P1-06-2026-12-01`).
3. Record in `IMPLEMENTATION-LOG.md`: the branch name, the time, who took it, and the migration folder about to be applied.
4. Apply the migration. **Production migrations are applied by the production build:** `package.json` runs
   `node tools/migrate-deploy.mjs` between `prisma generate` and `next build`, and that script runs `prisma migrate deploy` against
   `DIRECT_URL` when `VERCEL_ENV=production` (added 2026-11-25; if `DIRECT_URL` is missing it only warns and skips; `SKIP_DB_MIGRATE=1`
   turns it off; a failed migration fails the build so the previous deployment keeps serving). Preview and local builds skip it.
   **So merging a branch to `main` is the moment its migrations reach production.** Take the §2 step 2 branch BEFORE that merge.
   Do not hand-edit a migration that has already been applied (`fix-migration-checksum.cjs` exists for the case where that already happened).
5. Run the baseline report (`pnpm finance:baseline`) against the **branch copy of the result** and compare it with the previous baseline: counts must not increase.
6. Keep the branch until the phase gate (§4 below) has passed and at least one full week has run cleanly, then ask the owner before deleting it.

## 3. Rolling a migration back

Because migrations are additive, the first response to a problem is **to switch the module's flag off**
(Settings, Finance, Feature rollout: Finance proposes, High Rank approves). Version 1 code then runs again
against the same database.

Restoring the database from the branch or snapshot is a last resort and loses everything written after it was
taken. Only the person named in §1 (4) may authorise it, and only after the owner has been told what would be lost.

Entries already posted under the new rules remain valid after a flag is switched off. They are not undone; they are
reconciled afterwards (plan Part 6 §7). Once version 2 postings exist, fixing forward is preferred to rolling back.

## 4. Freeze rules for the historical repair (P9)

The repair (plan D-05, classes A, B, C) must run against data that is not moving underneath it.

1. **Announce a maintenance window** to Finance, High Rank and the Library in advance. The owner picks the date.
2. During the window **no money is recorded**: no payments, expenses, payroll runs, loan or fine changes, no bulk imports.
   Reading and reporting stay available.
3. **Take a branch** (§2, step 2) at the start of the window, named `pre-P9-<step>-<date>`.
4. Run the repair in **dry-run first**: the report of what would change is reviewed and signed by Finance and approved by High Rank.
5. Apply only the approved steps. Every adjustment is a new, auditable record; nothing posted is edited or deleted.
6. Run the baseline report again. Every class A item should be gone, every class B item should have its approved adjusting entry,
   and class C items should be listed for manual review with an owner.
7. Reopen the system only when High Rank has signed the window as closed.

## 5. Evidence to gather before the accrual cutover (P9-04 and OQ-02)

Collected by Finance, not by the system: bank and mobile-wallet statements and a cash count dated at the cutover date,
so opening balances can be attested rather than assumed.

## 6. Who does what

| Step | Does it | Approves |
|---|---|---|
| Create the branch or snapshot | Whoever the owner names in §1 (4) | n/a |
| Apply a migration | The implementer, after the branch exists | The owner authorises the deploy (plan D-29) |
| Switch a flag | Finance proposes | High Rank approves (never the proposer) |
| Restore from a branch | The person named in §1 (4) | The owner |
| Open or close the repair window | High Rank | The owner |
