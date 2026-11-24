# SMS Malawi — Finance Hardening Plan (index)

**Status:** PLAN ONLY — no application code, schema or migration has been changed.
**Verified against:** `FAP5iVE/sms-malawi` @ `5c816c0` (the snapshot both audits cite), 23 Nov 2026.
**Rule:** nothing from this plan is pushed or deployed without the owner's explicit authorisation.

## Reading order
1. `01-verification-and-decisions.md` — what the code really does, corrections to the audits (C-xx), extra findings (X-xx), decisions (D-xx), open questions (OQ-xx), re-verification checklist (V-xx).
2. `02-audit-coverage-matrix.md` — every point of both audits → verified? → included / modified / deferred / dropped, with the reason and the task that implements it.
3. `03-data-model-and-accounting-spec.md` — models, constraints, triggers, Chart of Accounts v2, posting rules (PR), state machines (SM), invariants (INV).
4. `04-workflow-and-service-spec.md` — workflow-by-workflow behaviour (including **library fines for students and staff**), transaction boundaries, idempotency, jobs, API catalogue, settings.
5. `05-permissions-and-ui-spec.md` — permission matrix (Finance / High Rank / Admin), segregation of duties, every screen, backend-to-UI parity matrix, documents, notifications.
6. `06-implementation-phases-migration-and-testing.md` — phases P0–P9 and task IDs, migration order, historical-repair runbook, test plan, rollout gates, risks, definition of done.

## Owner decisions already recorded
Accrual architecture · employer statutory costs modelled separately · configurable Payment Accounts registry (Settings → Finance → Payment Accounts) with payment method kept separate from financial account · financial permission matrix enforced (Admin has no unrestricted finance write) · full-history repair that corrects only what is verifiable and flags the rest.

## Still open (need the owner / accountant before the named phase)
See Part 1 §7 (OQ-01 … OQ-18). Most important: the accrual **cutover method and date** (OQ-02), rounding rule (OQ-03), approval thresholds (OQ-05), employer statutory items (OQ-06), and whether staff library-fine payroll deduction is acceptable (OQ-12).

## Working rules for the implementer
One task at a time, one agent · no package installs · modify existing files, create new ones only where Part 6 lists them · additive migrations only · append every task's outcome to `IMPLEMENTATION-LOG.md` (created in task P0-05) · re-run the V-checks before each phase.
