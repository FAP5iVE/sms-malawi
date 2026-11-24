# Roadmap after phase 11 (written in phase 12, 2026-11-22)

This is the plan for the batch of requests the owner sent on 2026-11-22. **Every phase below is now built (phases 13a to 17, 2026-11-22 and 2026-11-23).**
The sections below keep the original plan; the status block that follows says what was actually done, the owner's answers, and what the owner still has to do.
Each phase below is one branch, one review pack, one gate run. Read `HANDOFF.md` (method, gotchas)
and `RULEBOOK.md` (looks rules) first. This file says WHAT is left and IN WHAT ORDER; HANDOFF item 35
says what was found while planning.

## Status (updated 2026-11-23)

Branch stack, each on top of the one before, base `origin/main` (b755a43). The owner pushes; nothing was pushed from the sandbox.

| Phase | Branch | State |
| --- | --- | --- |
| 12 | `hills/phase-12-plan` | Plan only. |
| 13a | `hills/phase-13a-fixes` | Done. "Class not recorded" fixed through `src/lib/hills/studentClass.ts`; school name in emails (`getSchoolDisplayName()` in `src/lib/email.ts`); "portal" reworded (terms and privacy pages left for the owner); stray files deleted. |
| 13b | `hills/phase-13b-identity` | Done. Student sees status, class and stream (dashboard line, muted account-menu line, profile); "My class" on the Classes page. Stream is shown only when the form has more than one class. |
| 14 | `hills/phase-14-admit-stream` | Done. `AdmitStudentDialog`; `createFromApplication` rejects a class that is not active or not the form applied for. |
| 15a | `hills/phase-15a-maneb-registration` | Done. Prisma `ManebRegistration`, `ManebListLock`, `ManebRecord.registrationId`; `manebRegistrationService`; marks entry needs a live registration. |
| 15b | `hills/phase-15b-maneb-screens` | Done. Registered candidates panel, marks entry from the registered list, student profile and identity line, registered counts on the public stats. |
| 16 | `hills/phase-16-css-clean` | Done. `globals.css` 3,464 to 3,322 lines; compiled output differs only by the removed rules; new dead-CSS ratchet in `hills:ratchets` (`tools/hills/lib/deadCss.mts`). Checked by compiling before and after with Tailwind and running `hills:contrast`, not by screenshots, as the owner asked. |
| 17 | `hills/phase-17-signatures` | Done. `UserSignature` table, `signatureService`, `/signatures` routes, "My signature" under Settings, Profile; drawn on report cards, receipts, payslips and transcripts. |

### The owner's answers (2026-11-22, Sunday)
- JCE is written at Form 2 term 3 and MSCE at Form 4 term 3. The system already stresses this (`getManebExamType`).
- "Results released" for the list lock means: after all the candidates' marks are entered. The list now closes by itself when the last registered candidate's marks are saved (`closeListWhenComplete`, phase 18). The head can also close it sooner with "Close list" (any time somebody is registered); reopening is admin or head only.
- Candidates register themselves online with MANEB. The school keeps its own record of that registration (in-house record keeping) and may help; each registration says whether it was `SELF` or `SCHOOL`.
- Marks entry: the registration holds the exam number and centre; marks entry takes them from it. Placement and graduate selection read `ManebRecord.candidateNo`, which is now filled from the registration.
- "Start and keep it easy to load, don't take screenshots, just build and test": phases 13a to 17 were first checked with unit tests, lint, type checks and the gate. On 2026-11-23 the owner asked for screenshots, so phase 18 verified them on screen (see below).
- Logic and look changes were approved for this batch; every logic change is declared in `tools/hills/logic-allowlist.json`.

### Phase 18: fixes and screen checks (2026-11-23, branch `hills/phase-18-fixes`)
From the owner's report: (1) MANEB registration looked empty; (2) students who graduated or await MANEB results had no status; (3) the admit window vanished at once; (4) verify everything with screenshots.
- Admit dialog: a click in the actions cell also opened the row's detail page. The cell now stops the click.
- MANEB screen: a failed load shows an alert with the reason and "Try again" (retries once on its own). The most likely cause for an empty screen is the migration not yet run on the real database.
- Status: the board lists students awaiting results and graduates who are registered, with their status and "Results entered" or "Results awaited". Awaiting students can be registered. A student's own screens and profile show their latest registration with results state, even with no class.
- Auto-close: the list closes by itself when every registered candidate has marks.
- Found by the screenshots: with reduced motion on, the sidebar grew to its longest label (about 360 px); fixed. On the public home page the MANEB results heading and the MSCE, JCE and University Placement card headings were dark on navy; now white.
- Screenshots taken (light and dark, 1280 and 390 wide): student dashboard (active, awaiting, graduated, JCE not registered), Classes ("You are in", "My class"), student profile, MANEB board and marks, admit dialog, Settings My signature (empty and saved), public home stats.

### Decisions taken while building (so nobody re-asks)
- Student identity placement: a line under the greeting, a muted line in the account menu, the full facts on the profile; nothing in the page header.
- Signature storage: bytes in the database (`user_signatures`, 200 KB at most) instead of a file store; this keeps it private and needs no storage setup. No API returns the image. If the owner prefers the file store, only `signatureService` changes.
- Signature signers: class teacher and head on report cards; the finance officer who recorded the payment on receipts and who ran payroll on payslips; the head on transcripts. The head's signature prints on every report card while the school switch is on. Report card data sent to a browser never carries a signature (`getReportCardData(..., { forPdf: true })` adds it for the PDF only).

### What the owner still has to do
1. Run `prisma migrate deploy` for `20261122180000_maneb_candidate_registration` and `20261123100000_user_signatures`, then `prisma generate`. The sandbox cannot generate the client, so the type check shows Prisma noise that is not real.
2. Set `NEXT_PUBLIC_SITE_NAME` to the school name. If Vercel has `EMAIL_FROM_NAME`, it only applies when no school name is saved.
3. The email From ADDRESS needs a verified domain (Resend's test sender only delivers to the Resend account owner).
4. `terms` and `privacy` pages still say "portal": legal wording, the owner's call.
5. The phase 11 audit branch (`hills/phase-11-audit`) is not merged into this stack.
6. The inventory baseline drifted before this batch; `hills:inventory:check` and the `securityDocs` endpoint inventory test need the baseline regenerated on the real repo.

## Ground rules that change from "looks only"

The reskin is looks only. Several items below are **not** looks only (they need server code, a Prisma
migration or a new data field). The owner asked for them, which counts as explicit approval, but each
one must still be declared:

1. List every logic change in `tools/hills/logic-allowlist.json` with a one-line reason
   (`entries`, `newFiles`, `approvedFrozen` for frozen paths such as `src/server/**`, `prisma/**`, `src/lib/email.ts`).
2. Say in the phase notes: "approved logic change, owner request 2026-11-22, item X".
3. Prisma changes: migration file only adds (new table or nullable column). No rename, no drop. Write the
   rollback line in the migration comment. Run `prisma validate` and `prisma generate`; the sandbox cannot
   download the engine, so the owner runs `prisma migrate deploy` himself and the phase notes say so.
4. Every new screen follows the RULEBOOK (sentence case, verb-first buttons, no raw enum values, status as
   text, MK money, no "portal", no border inside a surface).
5. The owner pushes branches himself. Never push.

## Order and why

| Phase | Items | Kind | Why this position |
| --- | --- | --- | --- |
| 13a | a (class bug), portal wording, delete stray files, school name in emails | small fix, 4 declared server edits | Smallest, unblocks a visible bug, no schema. |
| 13b | b (student identity), d ("My class" on Classes page) | looks plus one small read-only data addition | Shares one helper (which class and stream does this student belong to). |
| 14 | c (admission stream picker) | UI plus one read-only endpoint field (stream headcount) | Needs the stream label rules from 13b. |
| 15a | e1: Prisma model, registration server code, marks-entry restriction | logic, Prisma | Biggest item. Server first, tested, nothing visible yet. |
| 15b | e2: registration screens, student status, public stats, placement and graduate use | UI plus reads | Built on 15a. |
| 16 | f (clean `globals.css`) | looks, tool-assisted | After every UI phase, so no rule is removed and then needed again. |
| 17 | g (digital signature) | logic, Prisma, PDF code | Last, as the owner asked. It touches four PDF writers and permissions. |

Each phase ends with: gate (`hills:logic-diff`, `hills:inventory:check`, `hills:ratchets`, `hills:contrast`,
`hills:test`), lint, type check, review pack, HANDOFF item.

---

## Phase 13a: small fixes

### 13a-1 Bug: "Class not recorded" (item a)
**Why it happens.** The student detail endpoint (`studentService.ts`, detail builder) returns the class as flat
fields `className`, `classForm`, `classId`. The profile page `students/[id]/page.tsx` (about line 231) reads
`student.class?.name`, which exists only on the LIST shape. On the detail shape it is always empty, so
`FactList` prints its fallback "Not recorded". The student IS in a class; the page reads the wrong field.
**Fix (client only, no server change).** Read `student.className`, fall back to `student.class?.name`; show
"Form 3 B" using `classForm` when present. Check the same mistake in: `useStudentMe` consumers, student card
view, `StudentDashboard` (it shows a Class stat; confirm which shape it reads), transcript and report headers.
`grep -rn "\.class?\.name" src` lists every reader. **Test:** a unit test that feeds the detail shape and expects the name.
**Logic gate:** a property read changes, so declare it as a looks-adjacent data-read fix (entry, reason "reads className from the detail shape").

### 13a-2 Reword "portal" (owner: yes for guardian)
About 40 strings. Rule R4.7 bans the word. Decisions:
- Guardian screens: "Has portal account" becomes "Has guardian account"; "parent portal" becomes "guardian account"
  or "guardian access"; "Invite to the portal" becomes "Invite to the guardian account"; "Bring existing guardians into the portal"
  becomes "Invite existing guardians to sign in". Use "guardian", never "parent", in new text.
- Student and staff text: "Portal login" becomes "Sign in"; "Login Portal (Students & Staff)" becomes "Sign in (students and staff)";
  page descriptions say "sign in to the school website" or "your account".
- Keep: the code names (`guardianPortal`, `useParentPortal`, `createPortal`), and the external link "MANEB Portal" is MANEB's own name, so write "MANEB website".
- Server text (email templates `fee-reminder`, `announcement`, `placement-update`, `result-release`, `overdue-library`, `invitationEmail`,
  `guardianInvitationService` error, `notificationService` line 660, `placementService` line 231, `guardianSlip.ts`): these are
  frozen server files. Wording only, so they go in `approvedFrozen` with the reason "copy only, owner request 2026-11-22".
  "Sign in to the school portal" becomes "Sign in to your account".
- `terms/page.tsx` and `privacy/page.tsx` are legal text. Reword to "the school website and your account" but flag it to the owner, because
  legal wording is his decision. Do not change the meaning.
- Add a test: a grep-based ratchet counting the word "portal" in user-visible strings (the existing `hills:ratchets` can take one more pattern).

### 13a-3 Delete stray files (owner: yes)
Delete `src/server/__tests__/page.tsx` (unused 1151-line old copy of the HR page; first prove nothing imports it with `grep -rn "__tests__/page"`)
and the repo-root `desktop.ini`. Add both to `deletedFiles` in the allowlist. Add `desktop.ini` to `.gitignore`.

### 13a-4 School name as the email From name (owner: adopt the school)
Today `src/lib/email.ts` line 44: `FROM_NAME = process.env.EMAIL_FROM_NAME || 'SMS Malawi'`, so every email says "SMS Malawi" unless the env var is set.
The school name already lives in settings (`SETTING_KEYS.SCHOOL_NAME`, edited in Settings → School identity, read by `routes/public.ts`).
**Decision:** the From name comes from the school-name setting; `EMAIL_FROM_NAME` stays as an override; "SMS Malawi" is the last fallback only when
no school name is saved. Implementation: `sendEmail` resolves the name per send (cache it for 5 minutes, same pattern as other setting reads;
a settings read failure falls back, never blocks the email). `buildFromAddress` already exists for this.
Places to change (all found by `grep -rn "SMS Malawi" src`):
- `lib/email.ts` (From name), `userManagementService.ts` line 142, `hrService.ts` line 642, `studentService.ts` line 801 (subjects "Welcome to SMS Malawi"): use the school name.
- `routes/public.ts` lines 81, 376, 391 (default name, newsletter messages): use the saved name.
- `AuthShell.tsx` line 116 (`hills-auth__brand-name`) and the public home fallbacks (`(public)/page.tsx` 610, 1365, 1476): the signed-out
  pages cannot read settings, so they use `schoolInfo?.schoolName` where it exists and else `SITE_NAME`; set `NEXT_PUBLIC_SITE_NAME` in Vercel to the school name.
- `AuditLogViewer.tsx` 199 and `lib/reportExport.ts` 132 (`wb.creator` in Excel files): use the school name.
- `SchoolIdentitySettings.tsx` 379 placeholder: change "SMS Malawi" to an example such as "Chikangawa Secondary School".
- Comments in files that say "SMS Malawi" are left alone.
RULEBOOK R11.4 already asks for the school name; update it to say where the name comes from.
**Owner action after merge:** set `NEXT_PUBLIC_SITE_NAME` and confirm the saved school name; `EMAIL_FROM_NAME` can be removed from Vercel.
**Open question for the owner:** the From ADDRESS is still `EMAIL_FROM_ADDRESS` or Resend's test sender (which only delivers to the Resend account owner).
A verified school domain is needed before the name matters to real recipients.

---

## Phase 13b: student identity and "My class"

### Decision: where does a student see status, class and stream (item b)
Placements considered, with the verdict on each:

| Place | For | Against | Verdict |
| --- | --- | --- | --- |
| Header chip (always visible) | Seen on every page | Header is already full on phones; permanent chips become wallpaper; staff would see an empty chip | Rejected as the main place. |
| Sidebar or menu footer | Quiet, always reachable | Sidebar is hidden on phones; students rarely open it | Secondary: show one muted line under the name in the account menu. |
| Dashboard stat card ("Class") | Exists today | It is one of many numbers; the stat row has no status or stream | Replace, not add. |
| Dashboard identity line under the greeting | First screen after sign in; one line; works on phones | Only seen on the dashboard | **Chosen as the main place.** |
| Profile page ("My profile") | Complete, can hold the reason for a status | Students seldom open it | Chosen as the full record (already has status; fix 13a-1). |
| Classes page | Answers "where do I belong" in context | Only for that question | Chosen for the class marker (item d). |
| Report cards, ID card, timetable heading | Useful context | Print or other features; not discoverable | Out of scope; timetable heading may repeat the class later. |
| Toast or banner at sign in | Hard to miss | Annoying after the first time; no memory of it | Rejected. |

**Result:** (1) dashboard identity line "Form 3 B · Active" (status as text per R2, never a pill); (2) one muted line in the account menu;
(3) the profile page keeps the complete facts. Nothing is added to the header bar.

**Rules for the line.** Status words come from `statusWord` (Active, Graduated, Withdrawn, and so on; no raw enums). The stream is shown only when the
school has more than one class in that form for the year (so a one-stream school never sees "Stream A"); form 3 B reads "Form 3 B", never "Form 3, Stream B".
A student with no class shows "No class yet" (an honest state, not "Not recorded"). Graduates show "Graduated 2026" and no class.
**Data:** `useStudentMe` already returns `className` and `classForm`; stream is not in the shape. Smallest change: add `classStream` and
`classStreamCount` to the detail builder (read-only, approved server change). The client must not guess the stream by parsing the class name.

### Item d: "My class" marker on the Classes page
For a student, the page keeps the form groups but: (1) the group and card holding the student's own class opens by default and sorts first;
(2) the card shows the text "My class" (StatusText, tone info) and a brand-coloured start edge (not colour alone, R2); (3) a short line at the
top, "You are in Form 3 B", links to that card. Staff and teachers see no marker. Teachers who also teach a class may later get "You teach this class"
(not in scope; note it). Uses the student's `classId` from `useStudentMe`; no new request.

---

## Phase 14: stream choice when admitting (item c)

Today the Admit button on `applications/page.tsx` calls `convert({ id, createLoginAccount: true })` with NO class, and the server
(`createFromApplication`) takes an optional `classId`. So today an admitted student ends with no class unless it is set later (this is also
one reason students show without a class).
**Design.** Clicking Admit opens a dialog (`Modal`) titled "Admit {name}": shows the form the applicant applied for, then a list of that
form's classes for the active year, one row per stream: "Form 1 A · 38 students · 2 places left" (places left only if the class has a
capacity; otherwise just the count). The lowest-count stream is pre-selected and labelled "Fewest students"; the user can pick another; a
school with one stream skips the choice (the dialog shows a single confirmed line). Primary button "Admit student". The existing
`createLoginAccount: true` stays. If the applicant's form is unknown, show a form selector first.
**Data.** The classes list endpoint needs a student headcount per class. Check `classService.listClasses` for `_count`; if missing, add
`studentCount` (read-only). Only ACTIVE students are counted. The server must reject a `classId` whose form does not match the application
(approved server check, 400 with a clear message), so the UI is not the only guard.
**Edge cases:** archived classes are hidden; a class from another academic year is hidden; double click is blocked by the pending state;
the error text stays in the dialog; the Applications table keeps its status text.

---

## Phase 15: MANEB candidate registration (item e)

### What exists today (verified in code)
- `ManebRecord` (one row per student per exam) is created ONLY by `examService.createManebRecord`, from the results import or the MANEB panel.
  Nothing registers a candidate beforehand. `candidateNo` is `@unique`, `examType` is JCE or MSCE, status REGISTERED/SITTING/RESULTS_RECEIVED/CERTIFIED.
- Readers of `ManebRecord`: public stats (`routes/public.ts` ~117), placement (`placementService`, uses `candidateNo`, MSCE certified), exam panels, reports.
- Marks entry (`createManebRecord`, `bulkCreateManebRecords`) accepts ANY student id. That is the gap the owner wants closed.

### What MANEB requires from a school (research, 2026-11-22)
Confirmed from public reporting (Malawi24, Nyasa Times, Zodiak): MANEB runs a yearly registration window (for 2022: 4 January to 18 February; late
registration windows are opened at a penalty); since 2022 schools enter candidate details **online at school level** on MANEB's e-registration system so data is
captured on MANEB servers, and fees are paid digitally to MANEB (mobile money and banks). The sources do not say who issues the examination number or what
the nominal roll holds. The detail pages that would say (mabumbe.com guides) refused automated access.
**So the field list below is the best practice plus what the system already needs, and it is a proposal the owner must check against the current MANEB
e-registration form and last year's nominal roll before 15a starts.** Items marked (?) are the ones to verify.

Fields the school records per candidate (proposal):
- From the student record we already hold: full legal name as on the birth certificate or ID (surname first), sex, date of birth, nationality, home district,
  guardian name and phone, photo (?), special-needs or access arrangements (?).
- Entered at registration: exam type (JCE for Form 2, MSCE for Form 4; see open question 1), academic year, subjects entered (from the class subject list),
  centre number (school-level setting, one value), centre name (existing school name), fee amount and fee reference (?), previous candidate number for
  repeaters or private candidates (?), registered by and date.
- Issued by MANEB, entered when received: **examination (candidate) number**. The system must allow the number to be empty at first (registered, number pending) and
  filled later, singly or by paste or file import of the nominal roll.

### Data model (additive migration)
New table `ManebRegistration`: `id`, `studentId` (FK Student), `academicYear`, `examType` (reuse enum), `status` (`REGISTERED` | `WITHDRAWN`),
`examNumber String?` (unique together with `examType` and `academicYear` when set), `centreNo String?`, `subjects Json` (array of subject ids),
`feeReference String?`, `notes String?`, `registeredById`, `registeredAt`, `withdrawnAt?`, `withdrawnReason?`.
Unique `(studentId, academicYear, examType)`. `ManebRecord` stays as the RESULTS row; add nullable `registrationId` so a result links to its registration
(back-fill by studentId+year+type for existing rows; existing rows without a match are listed for the owner, never deleted).
Student status shown to people: **Registered** or **Not registered** (derived: a non-withdrawn registration exists for the student's current exam year);
never stored on Student, so it can never go stale.
Permissions: new `maneb.register` (head, deputy, exam officer) and `maneb.viewRegistered` (teachers read). Audit every create, change, withdraw.

### Behaviour rules
1. Only Form 2 (JCE) and Form 4 (MSCE) students of the active year can be registered; the form is checked on the server.
2. Marks entry (single, bulk, import) is allowed only for students with a non-withdrawn registration for that exam, year and type. Bulk import reports each row it
   refused as "not on the registered list" without stopping the rest. The check is on the server; the UI hides unregistered students from the picker.
3. The list is **closed once results are released**: after results are released for that exam and year, no registration can be added; withdrawals are allowed
   only with a reason and are audited. Before release the list can be edited freely (it is the nominal roll).
   Definition of "released" must be agreed (open question 3); proposal: the first `ManebRecord` of that year and type moved to RESULTS_RECEIVED, or a
   "results released" switch on the year's registration page, whichever the owner prefers.
4. A candidate's `ManebRecord.candidateNo` is copied from `examNumber`; a result cannot be saved for a registration without an exam number
   (the form says "Enter the examination number first").
5. Placement and graduate selection read the exam number from the registration (single source), so Form 4 students who passed are matched by the number MANEB issued.
6. Public stats: "candidates registered" comes from `ManebRegistration` (non-withdrawn), results percentages from `ManebRecord`. The public endpoint returns counts only.

### Screens (15b)
- Exams → MANEB → **Registration** tab: year selector (uses the header period), Form 2 and Form 4 sections; table of students with Registered or Not registered
  text status, exam number, subjects count; actions "Register" (dialog: subjects, centre, fee reference), "Enter exam number", "Withdraw" (confirm with reason);
  bulk "Register whole class"; "Paste exam numbers" for the nominal roll; export the list for MANEB as CSV (reuse `reportExport`).
- Student profile and the dashboard line (13b): a "MANEB: Registered 2026 (MSCE)" fact.
- MANEB marks entry: picker lists registered students only, with an empty state "No registered candidates yet. Register candidates first." and a link.
- Public stats and placement read the new source (13b-style small reads).

### Open questions for the owner (needed before 15a) (answered, see Status)
1. Is JCE still sat in your school at Form 2? MANEB's national JCE was changed in recent years; the schema keeps JCE, but confirm the exam you register Form 2 for.
2. Who issues the examination number and when (at registration or after)? Does your MANEB form include a photo, fee reference, access arrangements?
3. What marks "results released" for the lock: first results entered, or a switch the head presses?
4. Who may register candidates (head, deputy, exam officer)?

---

## Phase 16: clean `globals.css` (item f)

3,464 lines. Method (so the next worker can repeat it):
1. Run it LAST among UI work, after 13 to 15, otherwise new screens need rules that were deleted.
2. Extract every custom property and class selector with a script; search `src/**`, `public/**`, `.storybook/**`, `tools/**` for each (also string-built
   names: search for the prefix, e.g. `hills-` and `app-`, `text-status-`, and template literals).
3. Candidates = defined but never referenced. Review the list by hand; keep anything referenced from JS strings, `data-*` hooks, third-party classes, `@theme` tokens
   used by Tailwind utilities (a token is used if the matching utility such as `text-status-success` appears), print or email CSS, and keyframes named by the used rules.
4. Remove in small batches; after each batch run the build, `hills:contrast` (pair count must not drop for a pair that is still in use), and the capture gallery diff
   (before and after at 390 and 1280, light and dark): zero pixel change is the pass bar.
5. Record: lines before and after, a list of removed selectors in the review pack, and an "unused token" ratchet so dead tokens cannot return.
No behaviour changes; the allowlist needs no entry since CSS is not logic.

---

## Phase 17: digital signature (item g), last

**Is it possible? Yes, and it should be an uploaded image, not drawing on screen.** Design:
- A person (teacher, head, accountant, registrar) uploads their signature ONCE on their own profile ("My signature"): PNG or JPG, background removed or
  white, cropped to a fixed ratio, max 200 KB. A preview shows it exactly as it will print. They can replace or remove it.
- Storage: a private file store (same pattern as other private uploads; never a public URL) plus `UserSignature { userId unique, fileKey, mime, updatedAt }`.
  Only the owner can write; reading is by the server when it builds a document.
- Use: the PDF writers already have empty signature blocks: `reportCardService` (~586 to 609, class teacher and head), `receiptService` (~137, received by),
  `pdfBranding` (~629, shared block), `transcriptService` (~64, registrar). Each looks up the signature of the specific person on the document: the class teacher
  of that class, the head of school, the cashier who took the payment, the registrar who issued. If the person has none, the line stays blank as today.
- Safety rules: a signature is only drawn for the user who actually produced or approved the document (not whoever downloads it); documents record who signed (audit);
  signature images are never sent to the browser by an API (only embedded in the PDF); removing a signature does not change PDFs already issued; a head can
  switch "use signatures on documents" off in settings. Draft or preview PDFs carry no signature.
- Legal: this is a scanned-signature image, not a legal e-signature. Say so in the settings help text.
**Open questions:** who counts as signer for each document, and whether the head's signature should print on every report card. (Answered by decision in Status: see "Decisions taken while building"; the owner can change them.)

---

## Checklist for the next worker (copy into each phase)

- [ ] Branch off the previous phase branch, not `main`, unless the owner says merged.
- [ ] Read the allowlist; add entries for every logic or frozen file touched, with reasons.
- [ ] Prisma: migration file, `prisma validate`, tell the owner to run the migration.
- [ ] Gate five commands, lint, types, tests; capture gallery 390/1280 light/dark for any screen touched.
- [ ] HANDOFF item with what, why, constants, and what you did NOT do.
- [ ] Update this file: change the phase row to done and note the branch name.
