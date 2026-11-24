# Baseline reconciliation reports

[CHANGE TYPE]: NEW FILE. **Plan task P0-02.**

This folder holds the output of the read-only baseline reconciliation: the size of the existing problems **before**
any hardening code changes behaviour. Reports are named `<date>-baseline.md` with a matching
`<date>-baseline-exceptions.csv`. They contain record ids and amounts only: no names, emails or phone numbers.

## How to run it

Point it at a **copy** of production (a Neon branch), never at the live database:

```
cd apps/web
BASELINE_DATABASE_URL="postgresql://…copy…" pnpm finance:baseline
```

It refuses to run if `BASELINE_DATABASE_URL` is the same database as `DATABASE_URL`. Every query runs in one
`REPEATABLE READ, READ ONLY` transaction, so the database itself rejects any write and all checks see one snapshot.
`pnpm finance:baseline -- --list` prints the 46 checks. `--only RC-01,LG-01` runs a few.

## What the checks are

`tools/finance-baseline/checks.mts`: one read-only `SELECT` per check, grouped as Ledger integrity, Journal references,
Receivables, Expenses and budgets, Procurement, Library fines, Payroll and loans, Orphan references. Each says which
plan finding it comes from and which repair class (A mechanical, B adjusting entry, C manual review; Part 6 §5.3) it feeds.

## How the checks were verified

`tools/finance-baseline/fixture.mts` holds a small synthetic data set with a known number of planted defects per check.
`src/server/__integration__/baseline.itest.ts` loads it into a throwaway database and requires every check to report
exactly the planted rows and nothing for the clean records. **That fixture is for a throwaway database only.**

## The first real baseline

**Not yet run.** It needs a copy of the production database (see the open item in `IMPLEMENTATION-LOG.md`).
Do not commit a report generated from the synthetic fixture here.
