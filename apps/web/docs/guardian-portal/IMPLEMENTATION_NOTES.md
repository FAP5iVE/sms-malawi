# Guardian Portal: implementation notes and task tracker

Source plan: `SMS-Malawi-Parent-Guardian-Portal-Plan.md`. The plan was written against
an earlier snapshot of the code. This file records where the current code differs and
what was decided, so the plan is applied to the project as it is now.

## Reconciliation with the demographics/welfare/guardians update

| Plan assumption | Current code | Decision |
|---|---|---|
| No guardian record exists; guardian data is 3 legacy columns on `Student` | `student_guardians` table (`StudentGuardian`) is now the editable guardian *contact card*. Legacy `Student.guardian*` columns mirror the primary row inside one transaction | Keep `StudentGuardian` untouched as the **directory**. It never grants access. New portal models are named `Guardian*` (`GuardianProfile`, `GuardianContact`, `GuardianLink`, ...) so nobody confuses a contact card with an access grant |
| Plan's access-grant table was `GuardianStudent` | `StudentGuardian` vs `GuardianStudent` is an easy import mix-up | Grant is `GuardianLink` (`guardian_links`). It carries a nullable FK `directoryEntryId` to `student_guardians` (SET NULL) for provenance |
| Create a relationship vocabulary | `GUARDIAN_RELATIONSHIPS` (9 values) already lives in `@shared/constants/admissions` | Reuse it. Values outside it map to `Other` and keep the original text in `relationshipNote` |
| Admission hook "in two places" | Both application conversion and staff creation go through `studentService.create` / `createFromApplication`, which now write the primary `StudentGuardian` in the same statement | One hook on the directory layer: `guardianDirectorySync`, called after `create`, `createFromApplication`, `addGuardian`, `updateGuardian`, `deleteGuardian`. Best effort, never fails the staff action, idempotent so the reconcile pass repairs misses |
| Backfill reads legacy `Student.guardian*` | Migration `20261102092000` already backfilled one primary `student_guardians` row per student | Backfill reads `student_guardians` (one item per directory entry), not the legacy columns |
| Drift rule on legacy edits | Directory edits are now first-class | Name / phone / relationship edit on an entry that has an ACTIVE link sets `reverifyRequired` on the link. Deleting the entry **suspends** the link (fail safe). Neither silently edits the guardian profile |
| New sensitive fields | `orphanStatus`, `isVulnerable`, `vulnerabilityNote`, `medicalAlert`, support needs, `exitReason/Date/Note`, `nrbNumber`, demographics | All on the parent DTO *never exposed* list. A test scans the parent DTO modules for these names |
| Student statuses | `ACTIVE`, `AWAITING_MANEB_RESULTS`, `GRADUATED`, `ARCHIVED` | Data modules open only for `ACTIVE` and `AWAITING_MANEB_RESULTS`. A linked child who has left is listed as "no longer enrolled" with no data |
| `lower_rank` guardian edits | Refused on `/students/:id/guardians` (no pending-action type for guardians) | Same rule for portal writes: lower_rank may view and *request*; approve / restrict / merge need admin or high_rank |
| Audit action naming | `student.guardian_changed` exists | Portal actions use the `guardian.*` namespace |
| PII scrubbing | `sentry-scrub.ts` already scrubs `guardianemail`, `nrbnumber`, ... | Extended with invitation/claim code, OTP, contact value keys |

Plan claims that were already wrong or partly fixed in the code (from the first review):
`checkRevoked` is already on in `getIdTokenFromRequest`; `GET /exams/results/:studentId`
already has a permission gate; admin user schemas already exclude `parent`;
`TermResult.releasedAt` is never written (do not key anything on it).

## Tasks

- [x] **T0** Diff the new zip against the old; reconcile the plan (this file)
- [x] **T1** Phase 0 hardening (security docs regeneration is deferred to T8)
  - [x] T1.1 `parent` role plumbing (roles, labels, empty permissions, page access, nav label)
  - [x] T1.2 Default-deny fence (pure module + `verifyAuth`) and role validation
  - [x] T1.3 File proxy: no default role, fail closed, no `?token=` for parents
  - [x] T1.4 Push topic fall-through, `updateUserRole` guard
  - [x] T1.5 Edge routing and login redirect by role; CSP in report-only mode
  - [x] T1.6 Positive staff checks replacing `role !== 'student'`
  - [x] T1.7 Fence-completeness test over the endpoint inventory; update role-model test
- [x] **T2** Phase 1 data foundation (schema, additive idempotent migration, audit actions, permissions, scrub keys)
- [x] **T3** Phase 2 guardian identity (normalisation, matching, directory sync hooks)
- [x] **T4** Phase 3 staff workflows (`/guardians/*`, invitations, review, revoke/restrict, rate-limit policies). Two-person approval and the Approvals Hub adapter were **not** built; they are deferred (see Phases 3-5 decisions).
- [x] **T5** Phase 4 backfill (dry-run, apply, rollback)
- [x] **T6** Phase 5 parent account and authorization (claim, per-request pipeline, DTOs, `/parent/*`, guardian file branch)
- [x] **T7a** Staff UI: `/guardians` (review queue, student lookup, onboarding, access log), link dialogs, invitations and printable slip
- [x] **T7b** Claim form on `/login?claim=1`
- [x] **T7c** Parent portal: `(parent)` shell, `/parent` (children), `/parent/[linkId]` (results, fees, attendance)
- [ ] **T8** Regenerate security docs, full verification run, package deliverables

## Decisions made during Phase 0

- `?token=` on the file proxy is kept for staff/students (PDF preview and the digital-resource iframe use it) and refused for `parent`.
- Owner-lookup errors in the file proxy now fail closed (503). Previously they fell through to `canReadFile`, which still admitted every staff role in `READ_ROLES`.
- `canReadFile` refuses `parent` outright. Guardian file access will be decided by a separate guardian-link check, never by role or `__self`.
- The claim flow must never attach the parent role to an existing account (a student's or staff member's uid); enforced and tested in T6.
- Parents are not on `announcements_all`. They get `announcements_parents` only; unrecognised roles subscribe to nothing.
- CSP ships as `Content-Security-Policy-Report-Only`. Review console reports on `/login`, `/parent` and a staff dashboard before enforcing.
- `assignments.ts` `!== 'student'` sites are permission-gated or deny-by-default and were left alone; `finances.ts` `isStaff` is now positive.
- A staff member who is also a guardian needs a separate parent account (one role per Firebase account).

## Decisions made during Phases 1-2

- **Schema**: eight `guardian_*` tables, 11 enums, 12 FKs. The migration SQL is *generated from the schema* (see `prisma/migrations/20261104120000_guardian_portal`) and `guardianSchemaMigration.test.ts` re-parses both independently. Run `prisma migrate diff` against a real database as well.
- **`verifiedSnapshot` on `GuardianLink`**: the card values staff last verified. Drift is recomputed from it, so a missed hook can never hide an edit (the next `syncStudentDirectory` repairs it).
- **Hook policies**: create/add/update sync is best effort and post-commit (never blocks staff). Card *deletion* suspends portal access inside the delete transaction, before the delete, and fails closed (the FK nulls `directoryEntryId` as soon as the row goes).
- **A previous staff decision is never undone by an edit**: REJECTED/REVOKED links are not re-proposed.
- **Matching is only a suggestion** (`suggestedProfileId` + method); families share phones.
- **Profile merge of two live accounts is deferred**. The safe 95%: a PENDING link can be re-pointed to an existing profile (no access is at stake yet).
- Enum vocabularies live in `@shared/constants/guardianPortal` and a test pins them to `schema.prisma`.

## Decisions made during Phases 3-5

- **A child is addressed by the guardian LINK id, never the student id** (`/parent/children/:linkId/...`). The lookup is `{ id, profileId: <caller> }`, so another family's child is unaddressable (IDOR-proof by construction).
- **Every parent refusal is one frozen `NOT_FOUND`**; the real reason goes only to `guardian_access_logs`.
- **Claim endpoint is `POST /guardian-claim` (public)**, not under `/parent`, because no identity exists yet. Declared in `ENDPOINT_POLICY`.
- **Attempts are reserved atomically before the secret is checked**; the invitation is claimed *before* the account is created; failures are compensated; the account is always newly created (never an existing uid).
- **SLIP claims need the child's date of birth**; EMAIL claims must use the address the code was sent to. An EMAIL code is never returned to staff.
- **Fees/documents are held while a link awaits re-verification**; results/attendance/profile keep working.
- **Unique `directoryEntryId`** (one proposal per contact card) makes concurrent syncs and overlapping backfills race-safe.
- **Backfill is chunked and resumable** (`APPLYING`); rollback never deletes a link staff have verified, approved, re-pointed or invited.
- **Deferred**: notices (`notices` capability is reserved but no endpoint yet), guardian file/document access (`documents`), merging two *live* guardian profiles (two-person approval), Approvals Hub adapter, parent-initiated link requests (`guardian_link_requests` table exists, no flow yet).
- **Required new environment variable**: `GUARDIAN_INVITATION_PEPPER` (>= 32 random chars, e.g. `openssl rand -base64 48`). Issuing and claiming fail loudly without it. Also uses existing `NEXT_PUBLIC_APP_URL` and optional `NEXT_PUBLIC_SCHOOL_NAME`.

## Decisions made during Phase 6 (UI)

- **One staff page, four tabs** (`/guardians`: Review queue, Student, Onboarding, Access log). Each tab and every button is gated on the permission the server enforces on the matching route (lower_rank can view, propose and invite; admin and high_rank can do everything). The buttons offered for a link come from `GUARDIAN_LINK_ACTION_RULES`, a UI mirror of the server's `LINK_TRANSITIONS`; `guardianPortalConstants.test.ts` fails if the two drift.
- **The claim form is a mode of the login page** (`/login?claim=1`) because `getClaimUrl()` and the invitation e-mail already point there. It is an early return placed after every hook in `LoginForm`, so hook order is identical in both views. Success does not sign the guardian in: they sign in normally and the existing role-aware redirect sends them to `/parent`.
- **Claim form checks mirror the server** (`claimPasswordProblem`, `validateClaimForm` in the shared constants); a test compares them with the server's `passwordProblem` over a corpus. The server still answers every bad-code case identically and the form shows that answer as given.
- **A SLIP code is shown exactly once** (the server stores only a hash). The invite dialog cannot be closed by clicking outside after issue, and the slip is printed from a popup built by `lib/guardianSlip.ts`, which HTML-escapes every name (tested).
- **`DELETE /guardians/invitations/:id` now returns `{ ok: true }`**, not an empty 204: `apiFetch` parses every successful body, so a bodiless reply made a successful revoke look like a failure.
- **Parent shell** (`(parent)/layout.tsx`) has no staff sidebar or navigation. It reuses the idle sign-out and session heartbeat from the staff shell, and wraps the inner shell in `RoleGuard` so the parent API is never called for a non-parent.
- **A child is addressed by link id in the URL** (`/parent/[linkId]`), matching the API. The child page finds the child in the already-loaded list and offers only the sections in `capabilities` for an enrolled student (`availableSections`), because a section the server refuses is a plain 404.
- **Withheld results show no marks at all**, only that results are unavailable (wording hedged: the DTO also withholds when the fee check errors).
- **Bugs found and fixed in the Phase 5 DTO while building the UI**: `passStatus` is a boolean column but was read with a string helper, so it was always `null` (the old test used a fake `'PASS'`); a class position/size of 0 means "not computed" and is now `null` instead of "0 of 0". Regression tests added.

### Owner decisions applied after review (round 2)

- **Aggregate points are shown to parents.** MSCE terms carry `gradingTrack`, `aggregatePoints` (null if fewer than six subjects were graded) and `aggregateSubjects` (capped at six). The old test that forbade `aggregatePoints` was reversed on purpose; points never appear for a JCE term or a withheld one.
- **Parents see only released results.** Release is checked against the exams themselves, not inferred from a result row existing: `TermResult` rows are computed from released end-of-term exams but are **not deleted when marks are unlocked** (`unlockMarks` rewinds the exam to `MARKS_PENDING`), so a stale row could otherwise expose marks being edited. A term is shown only while every END_TERM exam of the class the result was computed for is `RESULTS_RELEASED` (all-or-nothing, matching unison release); one unlocked exam hides the term until re-released; a row with no `classId` is never shown. An individual exam is shown only while its own status is released and the mark is final (not a draft). Unreleased items are omitted entirely; "withheld" is reserved for the fee gate. Every case fails closed. Students are **not** changed: their view still relies on a row existing.
- **Results tab = full released history.** Every released term and year, newest first, each with its summary and its released exams. A term with released exams but no computed result (a mid-term test) is listed on the exams alone. An end-of-term exam opens that term's report card; any other exam opens its own detail (`examOpens`). The mark's teacher comment is never sent.
- **Report card** (`GET /parent/children/:linkId/report-card?academicYear=&term=`, under the `results` capability, logged as `reportCard`) is built by the same `reportCardService.getReportCardData` students use, only when the term is released, fees are clear and a result is computed; every other case is the generic not-found. The route test now allows exactly two query fields (`academicYear`, `term`: a period is a filter, not an identifier) and still forbids any body or other query field. `PrintableReportCard` no longer calls `/settings/grading-scales` when the payload already carries the scale (a parent is fenced from that endpoint).
- **Attendance reuses the student's own design and the student's own numbers.** The server uses `analytics.getOwnAttendanceSummary` (the function behind the student's attendance page) so parent and child can never see different figures, plus up to 400 day records for the calendar. `?academicYear=&term=` selects the term summary (default: current).
- **Flat style (the "no nested cards" rule).** Parent pages sit on the system `ModuleSurface` with the title above, flat dividers instead of boxes, and status by font colour only. Attendance deliberately copies the student page markup. A render test fails if a nested box or a coloured status block appears in the Results or Fees panels.
- **Onboarding report now names the student and the guardian** (option chosen: add names to the report API rather than resolve ids in the browser: two bounded queries per page instead of up to 100 requests, same `guardian.backfill` gate). Phones and e-mails are still never in the report. The Onboarding tab lists who is in the preview with an action filter and paging.

### Open questions for the school/owner

1. Form 2 / Form 4 national-exam (MANEB) report cards: a parent's report card needs a computed `TermResult`; national-result terms that have none are not offered yet. Say if parents should get those cards too.
2. The Guardians nav item reuses the `Users` icon (Students uses it too). Swap if a distinct icon is wanted.
3. A newly created end-of-term exam in an already-released term hides that term from parents until it is released (fail closed). Say if that should instead keep showing the earlier release.

### Verification status for Phase 6

- Run here (no `node_modules`, no installs): every guardian-related test file, the parent-fence, route-guard, security-docs and fence-completeness tests, through `tsx` with a throwaway vitest shim kept outside the project; a stub-typed `tsc` pass over all new and changed UI/server files; render smoke tests (real React, mocked hooks) of the parent panels, parent home and the staff link card, with deliberately injected faults (leaked withheld marks, a nested card) that the tests caught. Security docs were regenerated for the new route.
- **Not run here, run before release**: `pnpm test` (real vitest), `tsc` against the real types, `next build`, `proxy.test.ts` and `superUser.test.ts` (they import `next/server`; their folder-vs-`PAGE_ACCESS` assertions were reproduced by script and pass), and a browser pass at phone width covering the report-card modal, the exam detail modal and the attendance calendar.

## Guardians screens: national ID matching, search and default lists (21 Nov 2026)

**Matching.** `GuardianProfile.nationalId` (normalised: upper-case letters and digits, see `lib/guardian/nationalId.ts`)
is now a matching signal and ranks above every other one.
- `NATIONAL_ID_NAME`: same ID and a similar name. `NATIONAL_ID`: same ID but the names differ a lot. Both are "strong":
  they block approval until staff resolve them (repoint or confirm different). The second is worded as "check the name",
  because a married name, a nickname or a mistyped ID can explain it.
- Placeholders ("N/A", "00000000", "12345678") are never treated as an ID.
- Phone stays a weak hint (households share handsets); e-mail and phone behave as before.
- Two profiles that both have an ID and differ get an `idConflict` warning on the flag (two people sharing a phone or e-mail).
- The ID is copied from the card at proposal time; a sync fills a blank profile ID and never replaces one; a repoint carries it
  to the person on file when that person has none.
- The full ID is never returned to the browser: staff see the last three characters.

**The duplicate flag.** A flagged card lists every student the same person appears for: students already linked to the person
on file (`LINKED`) and other waiting entries flagged as that same person (`FLAGGED`), capped at 12 with "and N more". The person
on file shows the reverse (`alsoFlaggedOn`): which waiting entries may be them. Built at read time in
`attachSuggestionDetail`, so it is always current.

**Catch-up for existing guardians.** `POST /guardians/national-ids/backfill` (`guardian.backfill`), surfaced on the Onboarding
tab as "Match guardians by national ID". Preview by default. Fills blank IDs from contact cards (a profile whose cards show two
different IDs is left blank and counted), then flags the waiting entries of guardians that now share an ID against the oldest
active one (preferring one with a portal account). Never merges, links or approves; skips links staff already decided and
cases where a move would be refused; idempotent.

**Review queue search.** `GET /guardians/queue?search=` matches guardian name (any word order), phone (0999…, 999… or +265…),
e-mail, national ID (partial), and a student's name or registration number, inside the chosen status filter. There is now an "All" filter.

**Student tab.** `GET /guardians/students` (`guardian.view`): with no search, current students (active, awaiting MANEB results),
newest first or A to Z; with a search, every student in the school. Each row shows contact cards and link counts.

**Access log.** `GET /guardians/access-log/recent` (`guardian.viewAccessLog`): one row per student from the latest 1,000
events (index on `createdAt` added). The tab shows the search box first, the recent list below it, and a row opens that
student's full log.

Migration `20261121120000_guardian_national_id_matching`: one nullable column and two indexes, no data changed.

