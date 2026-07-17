# MASTER_ROADMAP.md — SMS-Malawi Implementation Roadmap

This document supersedes all prior architecture-planning documents (`SMS_Malawi_University_Intelligence_Architecture.md` and the per-university requirement files remain as reference material for R-University-Placement phases only; they are not planning documents in their own right). It is synthesized from every file in `/audit/`: `phase1A.md` through `phase11.md`, `CROSS_integration.md`, `CROSS_redundancy.md`, `CROSS_hardcoded.md`, `CROSS_a11y.md`, `CROSS_constants_and_charts.md`, `PERMISSIONS_MAP.md`, and `MANIFEST.md`. `STATUS.md` was checked before this synthesis began: all sub-phases 1A–11 are checked complete; only Phase 12 (this document) was open.

**Path shorthands** (per `CONSTRAINTS.md`): `W/` = `apps/web/src/` · `P/` = `apps/web/prisma/` · `S/` = `packages/shared/`. Root-level files are referenced as-is. `fs.tsx` (`apps/web/src/app/(auth)/students/fs.tsx`) remains excluded from all scope, per its standing exclusion.

**Sequencing.** R1–R3 are critical integration fixes: gateway/access-control correctness, auth session lifecycle, and the plumbing every later hook and route depends on. Nothing in R4+ should be built on top of the current broken plumbing. R4 onward groups feature-gap remediation by domain (auth/security, academics, finance, HR, library, announcements/timetable, analytics, UI/UX). Two dedicated architecture phases — constants centralization (resolving `CROSS_hardcoded.md`, per the Phase 10B plan) and charting architecture (resolving `CROSS_constants_and_charts.md`'s chart placeholders, per the Phase 10C plan) — are sequenced once the domains they serve are stable. The University Placement track (Phase 11 blueprint) is a self-contained sequence near the end, after the schema, analytics, and MANEB work it depends on. The final phase covers accessibility completion, Storybook gaps, E2E coverage gaps, and production hardening.

**How to read a change-type tag:** `NEW FILE` = does not exist today, must be created. `MAJOR REWRITE` = file exists, its core logic is replaced. `TARGETED EDIT` = file exists, a specific function/section changes, the rest is untouched. `DELETE` = file is removed outright. `RENAME` = file moves path, imports update.

---

## R1 — API Client & Query-Key Singleton Consolidation

### 1. OBJECTIVE

Thirteen independent, hand-rolled copies of the same authenticated-fetch wrapper exist across the hook and component layer — `useAdmin.ts`, `HolidaysManager.tsx`, `useApplications.ts`, `useStudents.ts`, `useClasses.ts`, the Assignments tab of `classes/[id]/page.tsx`, `useExams.ts`, `InvoiceNotes.tsx`, `ScholarshipTab.tsx`, `PayrollTab.tsx`, `useFinances.ts`, `LibraryFinesTab.tsx`, and `useReports.ts` — each reimplementing Firebase ID-token attachment, 401 handling, and error-body parsing with subtly different (and in several cases strictly worse) correctness than the canonical `W/lib/api-client.ts`, which the audit (Phase 8A) confirmed is itself already correct, complete, and includes a `queryKeys` factory that already defines cache keys for nearly every domain in the system. This phase does no new backend or UI work: it deletes the thirteen duplicates and repoints every consumer at the one correct implementation. It is sequenced before every other phase, including the other two "critical fix" phases, because R4 onward adds new hooks and mutations in every domain, and every one of those must be written against the canonical client from the first line of new code — fixing this after other phases begin would mean re-touching every domain's hook file a second time.

### 2. CHANGE LIST

- **`W/lib/api-client.ts`** — TARGETED EDIT. No behavioral change to `apiFetch`/`ApiError` (confirmed correct as-is). Add one missing entry to the `queryKeys.students` object: a `photo(id: string)` key (`['students', id, 'photo'] as const`), the only cache key used by any of the 13 files below that has no equivalent already in the factory.
- **`W/hooks/useAdmin.ts`** — TARGETED EDIT. Delete the local `apiFetch()` function declaration in its entirety. Add `import { apiFetch, queryKeys } from '@/lib/api-client'` (adjust the named imports to whatever subset the file needs). Replace any locally-declared admin query-key literals with `queryKeys.admin.users(...)`, `.userDetail(...)`, `.notifPrefs()`, `.systemHealth()`, `.pendingActions(...)` as appropriate to each call site.
- **`W/app/(auth)/settings/_components/HolidaysManager.tsx`** — TARGETED EDIT. Delete the inline manual `fetch()` + `token()` helper. Import `apiFetch` from `@/lib/api-client` and call it in place of the manual helper at every call site.
- **`W/hooks/useApplications.ts`** — TARGETED EDIT. Delete the local `apiFetch()` function. Import `apiFetch, queryKeys` from `@/lib/api-client`. Replace local key literals with `queryKeys.applications.all()` / `.list(filters)` / `.detail(id)`.
- **`W/hooks/useStudents.ts`** — TARGETED EDIT. Delete the local `apiFetch<T>()` function (current lines 6–21) and the local `studentKeys` object (current lines 23–27) in their entirety. Import `apiFetch, queryKeys` from `@/lib/api-client`. Replace every `studentKeys.all()/.list()/.detail()` reference with `queryKeys.students.all()/.list()/.detail()`. In `useStudentPhotoUrl`, replace the ad-hoc `['student-photo', studentId]` array with `queryKeys.students.photo(studentId)` (the new key added to `api-client.ts` above).
- **`W/hooks/useClasses.ts`** — TARGETED EDIT. Delete the local `apiFetch()` function. Import `apiFetch, queryKeys` from `@/lib/api-client`. Replace local key literals with `queryKeys.classes.all()/.list()/.detail()/.timetable()/.assignments()/.analytics()/.labBookings()` as each call site requires.
- **`W/app/(auth)/classes/[id]/page.tsx`** — TARGETED EDIT. Remove the raw `useEffect` + manual `fetch()` powering the Assignments tab (duplicates data already returned by `classService.getClass()`'s Prisma `include: { assignments: ... }`). Preferred fix: read assignments off the class-detail query already loaded for the page (via `useClass(id)`, itself migrated in this same edit to use `queryKeys.classes.detail(id)`) instead of issuing a second request. Fallback, only if the tab is later split from the parent query's lifecycle: a dedicated `useQuery` using `apiFetch` and `queryKeys.classes.assignments(id)` (already defined in the factory).
- **`W/hooks/useExams.ts`** — TARGETED EDIT. Delete the local `apiFetch()` function (the best-built of the thirteen, but still a duplicate). Import `apiFetch, queryKeys` from `@/lib/api-client`. Replace local key literals with `queryKeys.exams.all()/.list()/.detail()/.marks()/.termResults()/.annualResults()/.manebRecords()/.analytics.class()/.analytics.school()`.
- **`W/components/finances/InvoiceNotes.tsx`** — TARGETED EDIT. Delete the local `apiFetch()` function. Import `apiFetch, queryKeys` from `@/lib/api-client`. Use `queryKeys.finances.invoiceNotes(invoiceId)`.
- **`W/components/finances/ScholarshipTab.tsx`** — TARGETED EDIT. Delete the local `apiFetch()` function. Import `apiFetch, queryKeys` from `@/lib/api-client`. Use `queryKeys.finances.scholarships(filters)`.
- **`W/components/finances/PayrollTab.tsx`** — TARGETED EDIT. Delete the local `apiFetch()` function (this one already correctly checks `res.ok`, but is still a duplicate implementation). Import `apiFetch, queryKeys` from `@/lib/api-client`. Use `queryKeys.finances.payroll.all()/.list()/.detail()/.payslips()/.myPayslips()`.
- **`W/hooks/useFinances.ts`** — TARGETED EDIT. Delete the local `apiFetch()` function. Delete the leftover developer/AI-assistant instruction-fragment comment at the top of the file ("This is the ORIGINAL correct file. Replace yours with this exactly." / "Do NOT add type annotations to the apiFetch generic calls…") — conversational text that leaked into production source. Import `apiFetch, queryKeys` from `@/lib/api-client`. Replace local key literals with the full `queryKeys.finances.*` tree.
- **`W/components/finances/LibraryFinesTab.tsx`** — TARGETED EDIT. Delete the local `apiFetch()` function. Import `apiFetch, queryKeys` from `@/lib/api-client`. Use `queryKeys.finances.libraryFines(filters)`.
- **`W/hooks/useReports.ts`** — TARGETED EDIT. Delete the local `apiFetch()` function. Import `apiFetch, queryKeys` from `@/lib/api-client`. Use the full `queryKeys.reports.*` tree.

### 3. CODE STRUCTURE FRAMEWORK

Not a NEW FILE or MAJOR REWRITE — `api-client.ts` itself keeps its existing shape (`apiFetch<T>(path, options)` → `Promise<T>`; `class ApiError extends Error { status }`; `export const queryKeys = { ... } as const`). Binding pattern that all thirteen TARGETED EDITs must converge on:

```
// Required end-state shape for every one of the 13 files
import { apiFetch, queryKeys } from '@/lib/api-client'
// (import only the queryKeys sub-branch(es) the file actually uses;
//  do not import ApiError unless the file catches it by type)

// NO local function apiFetch(...) { ... } may remain in the file.
// NO local const xKeys = { ... } object may remain in the file.
// Every useQuery/useMutation queryKey: must resolve to a queryKeys.<domain>.<fn>(...) call.
```

### 4. DEPENDENCIES

None. R1 is the first phase; it depends on no prior work.

### 5. ACCEPTANCE CRITERIA

- `grep -rn "function apiFetch" apps/web/src` returns exactly one match, in `W/lib/api-client.ts`.
- `grep -rn "async function apiFetch\|const apiFetch = async" apps/web/src` returns zero matches outside `W/lib/api-client.ts`.
- None of the 13 files above contain a locally-declared query-key object or array literal used as a `queryKey:` value; every `queryKey:` in these files resolves to a `queryKeys.*` call.
- `queryKeys.students.photo` exists in `W/lib/api-client.ts` and is the value used by `useStudentPhotoUrl`'s `queryKey`.
- The leftover instructional comment block is no longer present anywhere in `W/hooks/useFinances.ts`.
- `classes/[id]/page.tsx`'s Assignments tab no longer contains a raw `useEffect` + `fetch()` pair; it sources assignment data from a TanStack Query hook.
- Project typecheck script (`pnpm -F web typecheck` or equivalent `tsc --noEmit`) passes with no new errors in any of the 14 touched files.
- Manual smoke test covering one list view and one mutation in each of the seven affected domains (admin, settings/holidays, applications, students, classes, exams, finances) shows no regression: data loads, mutations succeed, 401-refresh-and-retry still works for an expired token.

---

## R2 — Auth Session & Login Flow Correctness

### 1. OBJECTIVE

The login, password-change, and logout paths share one root cause across five files: each reimplements a slice of cookie-setting, claim-clearing, or FCM-cleanup logic that `AuthProvider.tsx`'s `onIdTokenChanged` listener already owns correctly, and one server-side claim (`requiresPasswordChange`) is set at account creation with no code path anywhere that ever clears it. Net effect, all confirmed by the audit: every new account is permanently locked out of the app after its first password change (the change-password page's own comment — "Force token refresh so requiresPasswordChange claim is cleared" — describes something `getIdToken(true)` does not do); every login briefly redirect-loops on `/dashboard` because the role cookie is set asynchronously after the redirect already fired; the `?from=` deep-link parameter proxy.ts already attaches to the login redirect is never read back; every logout leaves a stale FCM token registered server-side because the unregister call fires after Firebase has already cleared the current user; and two of the three sign-out call sites leave a stale role cookie or land the user on the wrong page. This phase is sequenced immediately after R1 because its one new client-side API call is written against the R1-consolidated `apiFetch`.

### 2. CHANGE LIST

- **`W/app/(public)/login/page.tsx`** — TARGETED EDIT. In `handleLogin`: delete the line `document.cookie = 'sms_session=1; path=/; max-age=18000; SameSite=Strict'` (sets a bogus literal `"1"` rather than the real UID, and races `AuthProvider`'s own cookie-setting). Delete the immediately-following `router.push('/dashboard')`. Add a `useSearchParams()` read of `from` at component top, validated as an internal path (must start with `/` and not `//`, i.e. reject protocol-relative/external targets) — call the validated result `safeFrom`. Add a new `useEffect` (new import: `useAuthStore` from `@/store/authStore`) that watches `{ role, initialized }` from the store and, once both are truthy, calls `router.replace(safeFrom ?? '/dashboard')` exactly once (guard with a ref or a `hasRedirected` flag to prevent re-firing on subsequent store updates, e.g. a role change pushed from elsewhere).
- **`W/components/providers/AuthProvider.tsx`** — MAJOR REWRITE of the logout-related surface only (the `onIdTokenChanged` subscription's sign-in branch is unchanged). Replace the component-local `fcmTokenRef` (a `useRef` invisible outside the component) with a module-level `let currentFcmToken: string | null = null`, updated at the same two points the ref is updated today (set after successful `registerFcmToken()`, cleared in the signed-out branch). Add a new export, `export async function logout(): Promise<void>`, callable from any file, that: (a) reads `getAuth().currentUser` and, if present, awaits `getIdToken()` for a still-valid token; (b) if `currentFcmToken` is set, calls the unregister-token endpoint using that captured token explicitly (via the `api-client.ts` addition below) rather than relying on `apiFetch`'s internal `getAuth().currentUser` lookup; (c) only then calls Firebase `signOut(auth)`. The existing `onIdTokenChanged` signed-out branch keeps its `clearAuth()`/`clearAuthCookies()`/`removeFcmToken()` calls as the single remaining place cookies and store state are cleared — `logout()` itself does not touch cookies directly, it only reorders the FCM-unregister call ahead of the sign-out that triggers that branch.
- **`W/lib/api-client.ts`** — TARGETED EDIT. Add a narrow escape hatch for the one caller (the new `logout()`) that must supply a token explicitly rather than let `apiFetch` resolve it from `getAuth().currentUser`: either an optional third parameter `apiFetch<T>(path, options, tokenOverride?: string)` that skips the internal `getAuth().currentUser` lookup when provided, or a small sibling export `apiFetchWithToken<T>(path, token, options)` sharing the same header-building/error-handling internals via a shared private function. Either shape is acceptable; the constraint is that the 401-refresh-and-retry logic in the normal path must not change for any of the 13 R1-migrated callers.
- **`W/app/(auth)/layout.tsx`** — TARGETED EDIT. `InactivityManager`'s `handleLogout`: delete the manual `document.cookie = 'sms_session=...; max-age=0'` line and the direct `await signOut(auth)` call; replace both with `await logout()` (new import from `@/components/providers/AuthProvider`), then keep `router.replace('/login')`. Remove the now-unused `signOut`/`auth` imports from this file if nothing else in it references them.
- **`W/components/shared/PageHeader.tsx`** — TARGETED EDIT. `handleSignOut`: delete the manual `document.cookie = 'sms_session=...; max-age=0'` line and the direct `await signOut(auth)` call; replace both with `await logout()` (new import from `@/components/providers/AuthProvider`). Change the redirect from `router.push('/')` to `router.push('/login')` to match every other sign-out destination. Remove now-unused `signOut`/`auth` imports if nothing else in the file references them.
- **`W/server/services/userManagementService.ts`** — TARGETED EDIT, two changes. (1) New export `clearPasswordChangeRequirement(uid: string): Promise<void>` — reads the user's current custom claims via `getAuth().getUser(uid)`, then calls `getAuth().setCustomUserClaims(uid, { ...existingClaims, requiresPasswordChange: false })` (a merge, not a bare `{ requiresPasswordChange: false }`, since `setCustomUserClaims` replaces the whole claims object and a bare call would silently wipe the user's `role`); logs via the file's existing `logger.info({ event: ..., uid, ... })` convention. (2) `toggleUserDisabled(uid, disabled, actorUid)`: when `disabled === true`, add a call to `clearTokensForUser(uid)` (new import from `@/lib/push`) after `getAuth().updateUser(uid, { disabled })` succeeds.
- **`W/server/routes/users.ts`** — TARGETED EDIT. Add one route following the file's existing `/me/notification-prefs` self-service convention: `usersRouter.post('/me/clear-password-change-flag', verifyAuth, async (req, res) => { ... })`, calling `userService.clearPasswordChangeRequirement(req.user!.uid)` and responding `{ ok: true }`. No `requireRole` — any authenticated user may clear only their own flag, which is a strict narrowing of ability (removes a restriction, grants nothing), so self-service with no role gate is the correct posture.
- **`W/app/(public)/change-password/page.tsx`** — TARGETED EDIT. In `handleSubmit`, after `await updatePassword(user, password)` succeeds and before `await user.getIdToken(true)`, insert `await apiFetch('/users/me/clear-password-change-flag', { method: 'POST' })` (new import: `apiFetch` from `@/lib/api-client`). Correct the comment above the `getIdToken(true)` call — the refresh does not clear the claim by itself; it now correctly reflects the claim the new API call just cleared server-side.

### 3. CODE STRUCTURE FRAMEWORK

`AuthProvider.tsx` new export (module-level state promoted out of the component so `logout()` can read it from anywhere):
```
// module scope, outside the AuthProvider component function
let currentFcmToken: string | null = null

export async function logout(): Promise<void> {
  // 1. capture a still-valid token from the CURRENT (not-yet-signed-out) user
  // 2. if currentFcmToken is set, unregister it server-side using that
  //    captured token explicitly (api-client.ts's token-override path)
  // 3. only then: await signOut(auth)
  // NOTE: does not clear cookies/store itself — the onIdTokenChanged
  // signed-out branch (unchanged) remains the single place that happens
}
```

`userManagementService.ts` new export (matches the file's existing `getAuth()`-helper / `logger.info` conventions exactly, see `createUser`/`toggleUserDisabled` above it):
```
export async function clearPasswordChangeRequirement(uid: string): Promise<void> {
  // read existing user record via getAuth().getUser(uid)
  // merge: { ...existingRecord.customClaims, requiresPasswordChange: false }
  // getAuth().setCustomUserClaims(uid, mergedClaims)
  // logger.info({ event: 'user.passwordChangeCleared', uid })
}
```

`users.ts` new route (matches the file's existing `/me/notification-prefs` shape):
```
usersRouter.post('/me/clear-password-change-flag', verifyAuth, async (req, res) => {
  // await userService.clearPasswordChangeRequirement(req.user!.uid)
  // res.json({ ok: true })
})
```

### 4. DEPENDENCIES

Depends on **R1** — the new `/users/me/clear-password-change-flag` call in `change-password/page.tsx` and the token-override addition to `apiFetch` are both written against the R1-consolidated `W/lib/api-client.ts`; doing this phase before R1 would mean writing against a client about to be restructured.

### 5. ACCEPTANCE CRITERIA

- Logging in with valid credentials lands on `/dashboard` on the first navigation, with no visible intermediate redirect back through `/dashboard`.
- `/login?from=/exams` redirects to `/exams` after authentication (tested with a role permitted to view `/exams`); `/login?from=https://evil.example` or `/login?from=//evil.example` does **not** honor the external target — the post-login destination stays internal.
- A freshly created account can change its password exactly once at `/change-password` and lands on `/dashboard` afterward, with no bounce back to `/change-password`.
- `GET /users` (via `listUsers()`) reports `requiresPasswordChange: false` for that uid immediately after the above.
- Signing out from all three call sites (inactivity timeout, `PageHeader` menu, and any other future call site that uses `logout()`) produces an identical end state: `sms_session` and `sms_role` cookies both cleared, Zustand auth store cleared, browser at `/login`.
- The `DELETE /notifications/unregister-token` network call made during a normal (non-expired-session) sign-out returns 200, not 401.
- `PATCH /users/:uid/disable` with `disabled: true` results in `getTokensForUser(uid)` returning an empty array immediately after.
- `grep -rn "document.cookie = 'sms_session\|document.cookie = 'sms_role" apps/web/src` returns zero matches outside `W/components/providers/AuthProvider.tsx`.
- Typecheck passes with no new errors in the nine touched files.

---

## R3 — Gateway Hardening: Route Guards, CORS, Cron Auth, Error Hygiene & the Attendance System-of-Record Decision

### 1. OBJECTIVE

This phase closes out the remaining critical, build-blocking items from the audit's R1–R3 mandate that R1 (API client consolidation) and R2 (auth session/login correctness) do not touch: the two live `PAGE_ROLES` gaps and dead-entry cleanup in `proxy.ts`; a hardcoded, unscoped CORS allowlist and — found in the same file — the complete absence of a mount line for `/promotion`, meaning that entire feature has been unreachable in production regardless of any other defect in it; the assignments router's total lack of role or ownership enforcement beyond `verifyAuth`; a fail-open `CRON_SECRET` check shared identically across all five cron routes, plus a sixth cron-adjacent route that rejects the cron caller entirely; a data-hygiene tightening on what the global error handler writes to server logs; and — the one entry in this phase that is a decision rather than a fix — ratifying or replacing Firestore as the attendance feature's system of record. Every item here is either a live access-control hole or a completely unreachable feature; none of it is safe to build additional functionality on top of, which is why it closes out the critical-fix mandate before any domain-feature work (R4 onward) begins.

### 2. CHANGE LIST

- **`W/proxy.ts`** — TARGETED EDIT. `PAGE_ROLES['/finances']`: add `'hr'` (HR staff hold `finance.viewOwnStatement` and `hr.viewOwnPayslips` per `PERMISSIONS_MAP.md` and are currently locked out). `PAGE_ROLES['/reports']`: add `'student'` (students hold `report.viewOwnPerformance`/`viewOwnAttendance`/`viewOwnFeeStatement` but cannot reach the page). `PUBLIC_PATHS`: remove `/explore` (no route exists at this path; also referenced by the Phase 8E finding that a homepage anchor pointing at `/explore` resolves nowhere). `BYPASS_PREFIXES`: remove `/fonts/` and `/images/` (already excluded by `config.matcher`'s negative lookahead; harmless but confusing double-exclusion).
- **`W/lib/api-app.ts`** — TARGETED EDIT, three independent changes in this one file. (1) **Router mounting, highest severity in this phase:** add `import promotionRouter from '@/server/routes/promotion'` and `app.use('/promotion', requireRole(['admin', 'exam_officer', 'high_rank']), promotionRouter)` — `promotionRouter` is currently imported nowhere in this file and `/promotion` falls straight through to the catch-all 404 handler under any auth posture; `promotionService.ts`'s independently-broken `subjectPasses` logic and `PromotionEngine.tsx`'s orphaned-component status (both tracked separately, R5) are joined by this third, gateway-level reason the Promotion feature has never worked. (2) CORS: wrap `buildCorsMiddleware()`'s `'http://localhost:3000'` / `'http://127.0.0.1:3000'` allowlist entries in an explicit `process.env.NODE_ENV !== 'production'` conditional so they are never present in a production build's allowlist; the env-driven production URL entry stays unconditional. (3) Add a one-line code comment above the `Access-Control-Allow-Methods` string cross-referencing `route.ts`'s exported-handler list as the other hand-maintained copy of the same method set — full extraction to a shared constant is deferred to R11 (Constants Centralization), which is the correct home for this class of fix; noted here rather than silently dropped because it is a real, if low-severity, `CROSS_hardcoded.md`/sync-hazard item.
- **`W/server/routes/assignments.ts`** — TARGETED EDIT. `GET /` and `GET /:id`: replace the current `verifyAuth`-only gate with a check that the requester is either staff holding a school-wide or class-level academic-view permission, or a student actually enrolled in the target class — not, as today, any authenticated user of any role. `POST /`: add an ownership check comparing `req.user.uid` against the target `Class.teacherId` (with an admin/high_rank override), rejecting creation attempts from a teacher not assigned to that class. The separate, larger gap that no route exists at all for a student to submit an assignment (`class.submitAssignment` has zero implementation) is a feature gap, not an access-control hole — deferred to R5 (Academics domain) and documented there, not silently dropped here.
- **`W/server/routes/pendingActions.ts`** — TARGETED EDIT. `/expire-stale` currently sits behind this router's own top-level `verifyAuth` (a Firebase-ID-token check), which unconditionally rejects Vercel's `CRON_SECRET`-bearing scheduler request before the handler's own (dead) `isCron` branch ever runs. Move this specific route above/outside the router-level `verifyAuth` mount, or add an explicit early-exit branch ahead of it, so a valid `CRON_SECRET` bearer token can reach the handler; pending actions currently never expire in production as a direct result of this ordering.
- **`W/app/api/cron/fee-reminders/route.ts`, `W/app/api/cron/installment-check/route.ts`, `W/app/api/cron/late-penalties/route.ts`, `W/app/api/cron/contract-alerts/route.ts`, `W/app/api/cron/overdue-library/route.ts`** (the five real, built cron route files per Phase 8B's cron inventory) — TARGETED EDIT, identical one-line fix repeated in each. Replace the direct comparison `req.headers.get('Authorization') !== \`Bearer ${process.env.CRON_SECRET}\`` with an explicit fail-closed sequence: first `if (!process.env.CRON_SECRET) return res.status(500).json({ error: 'Server misconfigured.' })`, then the existing comparison. As written today, an unset `CRON_SECRET` makes the check compare against the literal string `"Bearer undefined"`, which a request literally sending `Authorization: Bearer undefined` would pass.
- **`W/server/middleware/inputSanitise.ts`** — TARGETED EDIT, two changes to `globalErrorHandler`. (1) In the branch that calls `logger.error({ err, status: err.status }, ...)`, stop passing the raw error object's `meta` field wholesale — replace it with `err.meta ? Object.keys(err.meta) : undefined` so column/field names remain visible for debugging but literal offending values (e.g. the actual duplicate registration number or email that triggered a P2002) no longer land unredacted in server-side log storage. This does not change the client-facing response, which the audit confirmed is already correctly scrubbed. (2) In the `PRISMA_ERROR_MAP` fallback path, add a secondary branch so `PrismaClientKnownRequestError` codes outside the mapped 13 (which include infrastructure-class failures such as connection-pool timeouts, not just constraint violations) return a `503`-class "temporarily unavailable" message rather than being mislabelled as a `400` "Database constraint error".
- **`W/components/attendance/AttendanceSheet.tsx`** — TARGETED EDIT (stopgap, required under either strategic option below). Replace both non-null-asserted `db!` usages — the `onSnapshot` listener and the `setDoc` write — with an explicit guard that renders a clear error state instead of crashing when `db` is unavailable.
- **DECISION (recorded here; no file changes beyond the stopgap above until the decision is made):** no `Attendance` model exists anywhere in `P/schema.prisma`, despite `MANIFEST.md`'s own Phase Map scoping "Class/Attendance models" to Phase 2C — the entire attendance feature operates exclusively in Firestore (`attendance/{classId}/records/{date}`), outside the project's declared Postgres/Prisma system of record, with no service layer, no Express route, no audit logging, and no formal `Permission` entry anywhere backing it.
  - **Option A — Ratify Firestore.** Wrap the existing collection in a proper server-mediated service layer (`attendanceService.ts` using the Firestore Admin SDK, not today's client-SDK direct writes), add an Express route with `requirePermission` gating, add `auditService` calls, and add a `class.markAttendance`-equivalent entry to `S/types/permissions.ts` and `PERMISSIONS_MAP.md`. Lower migration cost; leaves a second database inside the trust boundary for an academically and financially consequential record type (attendance feeds risk scoring and, in some school policies, fee/discipline decisions).
  - **Option B — Migrate to Prisma/Postgres.** Add an `Attendance` model to `P/schema.prisma` (at minimum: `id`, `studentId`, `classId`, `date`, `status`, `markedBy`, `createdAt`), a standard `attendanceService.ts` + Express router matching the codebase's established pattern, and a one-time backfill script importing existing Firestore documents into Postgres rows. Higher migration cost; brings attendance under the same PITR backup, audit-logging, and permission-matrix guarantees as every other academic record, and removes a cross-database join at the point where attendance data meets risk scoring and reporting.
  - This roadmap recommends **Option B** on consistency grounds — attendance already needs to join against Postgres-resident `Student`/`Class`/risk data, and cross-database joins are the same class of defect responsible for the Firebase/Prisma ID-mismatch bugs documented elsewhere in this audit (R6) — but records both options because the final choice depends on migration-window tolerance the audit itself cannot determine. **R5 (Academics domain) is written assuming Option B is chosen; if Option A is chosen instead, R5's attendance-related change list must be substituted with the Option A file list above before that phase's implementation begins.**
  - **DECISION RATIFIED (R3 implementation session): Option B.** Attendance migrates to Prisma/Postgres. Rationale as stated above — attendance already needs to join against Postgres-resident Student/Class/risk-scoring data, and keeping it in Firestore perpetuates the same cross-database-join defect class as the confirmed Firebase-UID/Prisma-student-ID mismatch bugs (R6). R5's implementation proceeds on the Option B file list: an `Attendance` model added to `P/schema.prisma` (`id`, `studentId`, `classId`, `date`, `status`, `markedBy`, `createdAt`), a standard `attendanceService.ts` + Express router matching this codebase's established pattern, and a one-time backfill script importing existing Firestore documents into Postgres rows. `AttendanceSheet.tsx`'s Firestore-based real-time listener (given its R3 stopgap fix above) remains in place only until R5 replaces it with the Postgres-backed implementation — it is not touched further in this phase beyond the `db!` stopgap.

### 3. CODE STRUCTURE FRAMEWORK

No NEW FILE in this phase (the HTTP-methods shared constant is intentionally deferred to R11). No MAJOR REWRITE. Binding shapes for the modified logic:

```
// W/lib/api-app.ts — new mount, alongside the other 22 app.use() calls
import promotionRouter from '@/server/routes/promotion'
// ...
app.use('/promotion', requireRole(['admin', 'exam_officer', 'high_rank']), promotionRouter)

// W/lib/api-app.ts — buildCorsMiddleware(), production-gated dev origins
const allowedOrigins = new Set([
  process.env.NEXT_PUBLIC_APP_URL,
  ...(process.env.NODE_ENV !== 'production'
    ? ['http://localhost:3000', 'http://127.0.0.1:3000']
    : []),
])

// Shared fail-closed pattern applied identically across all five cron route files
if (!process.env.CRON_SECRET) {
  return res.status(500).json({ error: 'Server misconfigured.' })
}
if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
  return res.status(401).json({ error: 'Unauthorized.' })
}

// W/server/middleware/inputSanitise.ts — globalErrorHandler generic-fallback branch
logger.error({
  err: {
    message: err.message,
    code: err.code,
    status: err.status,
    metaKeys: err.meta ? Object.keys(err.meta) : undefined,
  },
}, 'Unhandled error')
```

### 4. DEPENDENCIES

None at the file level. R3 touches `proxy.ts`, `api-app.ts`, `assignments.ts`, `pending-actions.ts`, the five cron route files, `inputSanitise.ts`, and `AttendanceSheet.tsx` — an entirely disjoint file set from R1 (`api-client.ts` + 13 hook/component files) and R2 (`login.tsx`, `AuthProvider.tsx`, `layout.tsx`, `PageHeader.tsx`, `userManagementService.ts`, `users.ts`, `change-password/page.tsx`). R1, R2, and R3 are sequenced together only because the audit's sequencing rule groups all ten named items as a single "nothing else can be built safely until these are fixed" mandate — the three phases could, in principle, be implemented in parallel by three engineers with no merge conflicts between them.

### 5. ACCEPTANCE CRITERIA

- `proxy.ts`'s `PAGE_ROLES['/finances']` includes `'hr'`; `PAGE_ROLES['/reports']` includes `'student'`
- `/explore` no longer appears in `PUBLIC_PATHS`; `/fonts/` and `/images/` no longer appear in `BYPASS_PREFIXES`
- `GET /api/promotion/:year` returns a real response (200 or a role-appropriate 403) for every role, never the generic `404 { error: 'Route not found.' }`
- `api-app.ts`'s CORS `allowedOrigins` set contains no `localhost`/`127.0.0.1` entries when `NODE_ENV=production`
- `GET /classes/:classId/assignments` returns `403` for an authenticated user with no enrollment or teaching relationship to that class
- `POST /classes/:classId/assignments` returns `403` when the requesting teacher's uid does not match `Class.teacherId`, and succeeds for admin/high_rank
- `POST /api/cron/expire-stale-actions` (or equivalent path) succeeds with only a `CRON_SECRET` bearer token and no Firebase ID token
- Every cron route rejects a request whose `Authorization` header is the literal string `Bearer undefined` when `CRON_SECRET` is unset in the test environment
- Server-side logs for a deliberately triggered `P2002` show field names but not the literal offending value
- `AttendanceSheet.tsx` contains zero `db!` non-null assertions
- A written decision (Option A or Option B) is committed to this section of the roadmap before R5 implementation begins
- No TypeScript errors in any touched file

---

## R4 — Auth/Security Domain: Permission Architecture, Zero-RBAC Search, Rate-Limit Identity & Audit-Log Consolidation

### 1. OBJECTIVE

Phase 8A's headline finding is the root-cause explanation for the audit's single most recurring defect category: `requireRole([...])`, a hand-maintained allowlist with no structural link to `PERMISSIONS_MAP.md`'s 218-permission matrix, is the enforcement mechanism on 19 of 23 route files, while the fine-grained `requirePermission`/`requireAnyPermission`/`requireAllPermissions` family — built specifically to derive its checks from the single-source-of-truth `S/types/permissions.ts` registry — is used on only 3. Phase 10A independently confirmed `S/types/permissions.ts`'s `ROLE_PERMISSIONS` admin block is a deliberately curated, correct subset, not a blanket grant — meaning every one of the ten-plus confirmed "admin shown but lacks permission" instances across this audit originates at an enforcement call site, never at the canonical matrix. This phase does three things: establishes the fine-grained-permission convention as the standard every subsequent domain phase (R5–R10) must apply to its own routes; fixes the auth-adjacent findings that belong to no single domain (a completely unguarded school-wide search endpoint, a rate limiter that cannot distinguish any two clients from each other, and a globally-mounted audit-logging system with a latent actor-identity bug that the real, working audit calls bypass entirely); and closes out the three Phase 1A `AuthProvider.tsx`/`userManagementService.ts` findings deliberately deferred out of R1–R3 for being robustness gaps rather than outages. It is sequenced immediately after the R1–R3 critical-fix mandate and before any domain-feature phase begins, because R5 onward each apply this phase's permission convention to their own files.

### 2. CHANGE LIST

- **`S/types/permissions.ts`** — TARGETED EDIT. Add a new permission constant `search.globalSearch` to the permission-type union and to `ROLE_PERMISSIONS` for every staff role with a legitimate school-wide lookup need — `admin`, `headteacher`, `deputy_headteacher`, `teacher`, `hr`, `finance`, `librarian` — following the exact enum-member/object-key pattern already used for every other domain in this file. `student` and `parent` are deliberately not granted this permission; their existing record-scoped routes (student's own profile, parent's own children) remain the correct path for their use case, and Phase 7B did not confirm any legitimate need for either role to run an unscoped school-wide search.
- **`W/server/routes/search.ts`** — TARGETED EDIT. `GET /search/fallback`: replace the current `verifyAuth`-only gate with `requirePermission('search.globalSearch')`. This closes the confirmed zero-RBAC surface that let any of the 9 roles retrieve any student's full name, registration number, and class, or any staff member's full name, role, and department, school-wide, with no scoping.
- **`W/lib/api-app.ts`** — TARGETED EDIT (a third and fourth edit to this file, applied on top of R3's promotion-mount and CORS changes). (1) Add `app.set('trust proxy', 1)` (Vercel's edge is a single trusted hop) immediately after the Express app is instantiated and before any middleware is registered — without this, `express-rate-limit`'s `keyGenerator` cannot use the real client IP even after the next item is fixed. (2) Remove the global `app.use(injectAuditLogger)` mount — see the `auditLog.ts` deletion below.
- **`W/app/api/[[...slug]]/route.ts`** — TARGETED EDIT. Replace the hardcoded `socket: { remoteAddress: '127.0.0.1' }` in the `mockReq` construction with a value derived from `request.headers.get('x-forwarded-for')` (split on comma, take the first entry — the original client, per standard `x-forwarded-for` chain convention), falling back to `'127.0.0.1'` only when the header is absent (local dev). Combined with the `trust proxy` setting above, this makes `req.ip` inside every one of the 23 domain routers resolve to the real client IP for the first time, which is the actual fix for the rate-limiter's current inability to distinguish any two clients.
- **`W/server/middleware/auditLog.ts`** — DELETE. Confirmation of no remaining consumers after this phase: exhaustive grep (Phase 8A) already confirms `req.auditLog`, `auditPost`, `auditPatch`, and `auditDelete` have zero callers anywhere in the 23-router system today; `injectAuditLogger`'s only mount point is removed in the same phase (above); the three files that perform real audit logging (`server/routes/audit.ts`, `pendingActionService.ts`, `studentService.ts`) already call `auditService.log()`/`.logAsync()` directly and do not import anything from this file.
- **`W/server/express.d.ts`** — TARGETED EDIT. Remove the `req.auditLog` / `req.auditLog.critical` type-augmentation declarations that exist solely to support the deleted file.
- **`W/components/providers/AuthProvider.tsx`** — TARGETED EDIT (a further edit on top of R2's logout-ordering change). In the `!role` branch: replace the current "warn and return, leaving `initialized` false forever" behavior with a bounded retry (re-check the claim on the next one or two token-refresh cycles) and, if the role claim still hasn't appeared after a short timeout, set `initialized = true` with an explicit error/support-contact state rather than leaving every `PermissionGuard` in an indefinite loading skeleton. In the FCM-registration effect: track the token's registration timestamp and re-run `registerFcmToken()` if more than ~50 days have elapsed since the last registration, rather than only registering once per browser session (FCM tokens expire after roughly two months; a long-lived session currently never refreshes).
- **`W/server/services/userManagementService.ts`** — TARGETED EDIT (a further edit on top of R1/R2's changes to this file). `createUser`: set the `subtitle` custom claim from the `CreateUserInput`'s staff-title field at creation time, matching every other claim this function already sets — `AuthProvider.tsx` has read `idTokenResult.claims.subtitle` since Phase 1A with no code path that ever populates it.

### 3. CODE STRUCTURE FRAMEWORK

No NEW FILE. No MAJOR REWRITE (the DELETE above removes a file rather than rewriting one). Binding shapes:

```
// S/types/permissions.ts — new permission, same shape as every existing entry
'search.globalSearch': {
  // description, domain: 'search' (new domain, first entry)
}
// ROLE_PERMISSIONS additions: admin, headteacher, deputy_headteacher,
// teacher, hr, finance, librarian each gain 'search.globalSearch'.
// student and parent/lower_rank do NOT gain it.

// W/server/routes/search.ts (edit)
searchRouter.get('/fallback', verifyAuth, requirePermission('search.globalSearch'), async (req, res) => { ... })

// W/lib/api-app.ts (additions, applied after R3's edits to this same file)
const app = express()
app.set('trust proxy', 1)
// ... helmet, express.json, buildCorsMiddleware(), createRateLimiter('standard') ...
// (injectAuditLogger mount removed — no longer present anywhere in this file)

// W/app/api/[[...slug]]/route.ts (edit, inside the mockReq builder)
const forwardedFor = request.headers.get('x-forwarded-for')
const remoteAddress = forwardedFor ? forwardedFor.split(',')[0].trim() : '127.0.0.1'
// ... socket: { remoteAddress }
```

**Standing convention for R5–R10:** every domain phase from this point forward must, as part of its own change list, replace that domain's `requireRole([...])`-only route guards with `requirePermission`/`requireAnyPermission`/`requireAllPermissions` calls against `S/types/permissions.ts`, correcting that domain's specific over-grant/under-grant instances confirmed in `CROSS_integration.md` (Students/2B, Classes/2C, Exams/3A, Promotion/3C, Timetable+Assignments/3D, Finance's library-fine route/4E, Library/6A, Analytics+Reports/7A, Announcements/7D) in the same pass as that domain's other fixes, rather than as a separate cross-cutting sweep — each of those files is already being opened for other reasons in its domain phase, and touching it twice for two unrelated-looking reasons is avoidable.

### 4. DEPENDENCIES

Depends on **R3** — `api-app.ts` and `AuthProvider.tsx` are both edited again here on top of R3's (for `api-app.ts`) and R2's (for `AuthProvider.tsx`) prior changes to the same files; implementation must apply these edits to the already-modified versions, not the pre-R1 originals.

### 5. ACCEPTANCE CRITERIA

- `GET /search/fallback` returns `403` for `student` and `parent`/`lower_rank` roles, `200` for the seven staff roles listed above
- `S/types/permissions.ts` contains a `search.globalSearch` entry and `PERMISSIONS_MAP` regenerated/derived documentation (if any build step produces one) reflects it
- `api-app.ts` calls `app.set('trust proxy', 1)` before any middleware registration
- A request sent with a distinct `x-forwarded-for` value resolves to that value, not `127.0.0.1`, when logged or rate-limited
- Two simulated clients with different `x-forwarded-for` values are tracked in separate rate-limit buckets (verified by exceeding `standard`'s 300/15min limit on one and confirming the other is unaffected)
- `W/server/middleware/auditLog.ts` no longer exists in the repository; `grep -rn "injectAuditLogger\|auditPost\|auditPatch\|auditDelete" apps/web/src` returns zero matches
- `req.auditLog` no longer appears in `express.d.ts`'s type augmentation
- A test account with no role claim for longer than the bounded retry window reaches an explicit error state, not an indefinite loading skeleton
- A decoded ID token for a newly created staff account includes a non-null `subtitle` claim matching the title supplied at creation
- No TypeScript errors in any touched file

---

## R5 — Academics I: Admissions & Student Records

### 1. OBJECTIVE

This phase fixes the admissions pipeline (public application intake through conversion to an enrolled student) and the Student record CRUD surface, which the audit found in a more broken state than any other single module: the Add/Edit Student form cannot be submitted at all in its current state (a field-value mismatch blocks every attempt), there is no code path anywhere that can update an existing student despite the backend fully supporting it, and a public landing page ships entirely fake content in front of three working backend endpoints. It is sequenced as the first domain phase after the critical-fix mandate (R1–R4) because Student is the root entity nearly every other domain (Finance's invoices, Library's borrowings, HR indirectly via class-teacher assignment, Analytics' every report) joins against, and R7 onward assumes a working, correctly-validated Student create/edit path.

### 2. CHANGE LIST

- **`S/schemas/student.ts`** — MAJOR REWRITE of the application-schema portion only (`CreateStudentSchema` and its sibling student-domain schemas are unaffected). Replace the two independently-maintained, differently-named schemas — `CreateApplicationSchema` (`lastName`, `guardianRelation`, `applyingForForm: number`) and `PublicApplicationSchema` (`surname`, `guardianRelationship`, `classApplying: string` e.g. `'Form 2'`) — with one canonical schema using one field-naming convention throughout. Also add the missing `status` field to `CreateStudentSchema`'s companion service-input type so a validated status value is not silently dropped (see `studentService.ts` below).
- **`W/app/(public)/apply/page.tsx`** — TARGETED EDIT. Import the unified schema from `@shared/schemas/student` in place of the local `ApplicationSchema` definition. No change to the 5-step form UI structure itself.
- **`W/server/services/applicationService.ts`** — TARGETED EDIT. Remove the `parseInt(classApplying.replace('Form ',''))` bridging logic and the nine dead `as PublicApplicationInput & {...}` inline casts, both now unnecessary once the schema is unified. Remove the dead `countryCode`/`guardianCountryCode` concatenation branch (these fields never existed on the schema the service actually receives). Add `auditService.log(...)` calls to `updateApplicationStatus()` and `convertToStudent()`, matching the calling convention already used correctly in `studentService.ts`. Remove `convertToStudent()` itself and repoint its one caller (the applications route's admit handler) at `studentService.createFromApplication()` instead — the richer, audit-logged, optional-Firebase-account implementation that already exists behind `POST /students/from-application/:applicationId` with zero current frontend caller; consolidating onto one conversion path removes the two-parallel-implementations redundancy the audit flagged.
- **`W/server/routes/applications.ts`** — TARGETED EDIT. `PATCH /:id/status`: replace whatever role check currently permits `lower_rank` to reach Approve/Deny with `requirePermission('application.approve')` / `requirePermission('application.deny')` as appropriate per action — `PERMISSIONS_MAP.md` grants both to `admin`/`high_rank` only; `lower_rank` holds `application.review` alone. This is a server-side authorization bypass being closed, not a UI-only change. `POST /public`: apply `createRateLimiter('auth')` (the existing 10-req/1-min tier) to this unauthenticated public endpoint; extend duplicate-application detection to also match on guardian phone/email as a secondary signal alongside the existing firstName+lastName+dateOfBirth check. Replace the inline `['APPROVED','DENIED','AWAITING_ADMISSION']` literal with a reference to the shared `ApplicationStatusSchema` enum.
- **`W/app/(auth)/applications/page.tsx`** — TARGETED EDIT. Replace the local `STATUSES` array with a derivation from `ApplicationStatusSchema`. Replace the bespoke raw `<table>` with `DataTable.tsx` and the bespoke status-pill buttons with `ModuleTabs.tsx` (both already exist per Phase 1D-ii), consistent with every other list view in the app.
- **`W/app/(public)/page.tsx`** — MAJOR REWRITE of the data layer only (visual layout/design is not in scope for this phase). Replace the hardcoded announcements array, hero stats, MANEB stats/subject cards, contact details, and founding year with live data fetched from the three existing, unused endpoints: `GET /public/school-info`, `GET /public/maneb-stats`, `GET /public/announcements`. Wire the newsletter form's `onSubmit` to the existing `POST /public/newsletter/subscribe` endpoint (currently fully built server-side with zero UI entry point). Remove developer placeholder text and broken image references (`"Place your hero SVG illustration here"`, `"School photo here"`, `g2.jpg`–`g7.jpg`) — replace with real assets or a graceful conditional fallback if assets are not yet available. Replace the local `useTheme` hook's `'sms-theme'` localStorage key with the same `next-themes`/`'sms-malawi-theme'` mechanism the authenticated app uses, so the two halves of the same domain do not maintain independent, conflicting theme state.
- **`W/app/(public)/layout.tsx`, `.../privacy/page.tsx` (NEW FILE), `.../terms/page.tsx` (NEW FILE)** — the footer's `href="#"` links (Privacy Policy, Terms of Use, How to Apply, Entry Requirements, Fees Structure, Scholarships, FAQs) are dead. "How to Apply"/"Entry Requirements"/"Fees Structure"/"Scholarships" should point at real, already-existing sections of `apply/page.tsx` or `(public)/page.tsx`; "Privacy Policy" and "Terms of Use" need actual destination pages. **NEW FILE** `W/app/(public)/privacy/page.tsx` and `W/app/(public)/terms/page.tsx`: minimal static pages following the existing `(public)/forgot-password/page.tsx` layout convention (shared header/footer, single content column) — this phase creates the route and layout only; populating final legal text is a content task outside this audit's scope, tracked here so the links have a real, non-broken destination rather than staying `href="#"`.
- **`W/server/routes/public.ts`** — TARGETED EDIT. `/school-info`: replace the direct `prisma.systemSettings` query with a call to `settingsService.getPublicSettings()` (Phase 1B, already cached); fix the two settings keys (`school_founded`, `school_values`) that don't exist in `SETTING_KEYS` — either add them to the typed settings registry or map to the keys that already exist there. Unify the `confirmUrl` fallback domain with `userManagementService.ts`'s fallback so both derive from `process.env.NEXT_PUBLIC_APP_URL` with one shared literal fallback, not two different hardcoded domains.
- **`W/server/templates/emails/*`** — TARGETED EDIT. Convert `applicationService.ts`'s and `public.ts`'s newsletter-related inline raw-HTML email bodies to use `renderBase()` from `W/server/templates/emails/base.ts`, matching the established pattern from Phase 1C/8D.
- **`W/components/students/StudentFormSections.tsx`** — MAJOR REWRITE of the three field definitions responsible for the form's total non-functionality. Sex `<select>`: options become `'MALE'` / `'FEMALE'` (matching `SexSchema`). Academic Status `<select>`: options become `'ACTIVE'` / `'AWAITING_MANEB_RESULTS'` / `'GRADUATED'` / `'ARCHIVED'` (matching `StudentStatusSchema`; the previous `'active'`/`'inactive'`/`'suspended'` options match neither the schema nor any real status the backend recognizes). Form/Class `<select>`: replace the free-standing `'Form 1'`–`'Form 4'` literal options with a real dropdown populated by a `useClasses()` call, submitting the selected `Class.id` (a cuid) as `classId`, not a Form-level string.
- **`W/components/students/StudentForm.tsx`** — MAJOR REWRITE of the edit-mode data flow. When `studentId` is supplied: call `useStudent(studentId)` and populate the form via `reset()`/`setValue()` once data resolves. `onSubmit`: branch on `isEdit` — call the new `useUpdateStudent()` mutation (below) when editing, `useCreateStudent()` only when creating. Today this component always calls `useCreateStudent()` regardless of mode, meaning "editing" a student silently creates a new record.
- **`W/hooks/useStudents.ts`** — TARGETED EDIT (on top of R1's consolidation of this file onto the shared `apiFetch`/`queryKeys`). Add a new exported `useUpdateStudent()` mutation hook calling `PATCH /students/:id`, matching the file's existing `useCreateStudent()` shape and invalidating `queryKeys.students.detail(id)` and `queryKeys.students.lists()` on success — the backend endpoint and `studentService.update()` are already fully implemented and audit-logged; only the hook was missing.
- **`W/server/services/studentService.ts`** — TARGETED EDIT, four changes. (1) Add `status` to the `CreateStudentInput` interface and pass it through in `create()` instead of hardcoding `status: 'ACTIVE'` unconditionally. (2) `generateRegistrationNo()`: wrap the read-then-write sequence in a Prisma `$transaction` (or add a bounded retry-on-`P2002` loop) so concurrent creations cannot generate duplicate registration numbers. (3) Remove the module-local `getAdminApp()` Firebase Admin singleton initializer; import the canonical one already established in `verifyAuth.ts` (Phase 1A). (4) `computeRiskLevel()`'s `termAverage` parameter remains unsupplied until R7 (Exams/Grading) makes a real term-average value available to `list()`/`getById()` — tracked as a forward dependency, not fixed in this phase.
- **`P/schema.prisma`** — TARGETED EDIT. Remove the persisted `Student.riskLevel` column (a Prisma migration). It is never written by any code path, is always stuck at its default, and shares a name with — but is a completely different value from — the API-served `riskLevel` field that `computeRiskLevel()` calculates fresh per request. Keeping a permanently-stale column with the same name as a live computed field is a data-integrity trap for any future direct-database consumer.
- **`W/server/routes/students.ts`** — TARGETED EDIT. `PATCH /:id/status`: remove the `requireRole(['admin','high_rank','exam_officer'])` check entirely and rely solely on `requirePermission('student.edit')` (Phase 10A confirmed the permission matrix itself is correct — `student.edit` is correctly scoped to `high_rank`/`lower_rank`; the route's own `requireRole` list was the incorrect, over-granting half of the contradiction, not the permission check). Replace the inline `VALID_STATUSES` array with a derivation from `StudentStatusSchema`.
- **`W/app/(auth)/students/page.tsx`, `.../students/[id]/page.tsx`** — TARGETED EDIT. Remove `'admin'` from the `RoleGuard`/`usePermissions`-driven visibility of Add/Edit/Archive controls (admin correctly lacks `student.create`/`student.edit`/`student.softDelete` per the confirmed-correct permission matrix). `mobileActions` on the list page: gate Edit/Archive per-row on an actual `usePermissions()` check rather than unconditionally for all 8 roles allowed on the page, and add error handling (toast/inline message) for the 403 case rather than the current silent failure. Detail page: replace the hardcoded "Fee balance visible after Finance module is complete" placeholder with the real `feeBalance`/`riskLevel` values already present on the `ApiStudentDetail` object this page already fetches — no new backend call needed, this is a wiring-only fix.

### 3. CODE STRUCTURE FRAMEWORK

**`S/schemas/student.ts`** (unified application schema — replaces two divergent ones):
```
export const ApplicationSchema = z.object({
  firstName: z.string(), surname: z.string(), otherNames: z.string().optional(),
  dateOfBirth: z.string(), sex: SexSchema,
  classApplying: z.enum(['Form 1','Form 2','Form 3','Form 4']),
  guardianName: z.string(), guardianRelationship: z.string(),
  guardianPhone: z.string(), guardianEmail: z.string().email().optional(),
  // ... remaining fields, one name per concept, no lastName/surname or
  // guardianRelation/guardianRelationship duplication
})
export type ApplicationInput = z.infer<typeof ApplicationSchema>
// applicationService.ts derives the target Form-level filter directly from
// classApplying's enum value — no parseInt/string-replace bridging required
```

**`W/components/students/StudentFormSections.tsx`** (binding option values only — component structure unchanged):
```
// Sex: <option value="MALE">Male</option> / <option value="FEMALE">Female</option>
// Academic Status: options exactly = StudentStatusSchema.options
//   ['ACTIVE','AWAITING_MANEB_RESULTS','GRADUATED','ARCHIVED']
// Form/Class: const { data: classes } = useClasses()
//   <select {...register('classId')}>
//     {classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
//   </select>
```

**`W/components/students/StudentForm.tsx`** (edit-mode data flow):
```
export default function StudentForm({ studentId }: { studentId?: string }) {
  const isEdit = Boolean(studentId)
  const { data: existing } = useStudent(studentId ?? '', { enabled: isEdit })
  const form = useForm<StudentFormValues>(...)
  useEffect(() => { if (existing) form.reset(mapStudentToFormValues(existing)) }, [existing])
  const createMutation = useCreateStudent()
  const updateMutation = useUpdateStudent()
  function onSubmit(values: StudentFormValues) {
    if (isEdit) updateMutation.mutate({ id: studentId!, ...values })
    else createMutation.mutate(values)
  }
  // ... rest of form JSX unchanged
}
```

**`W/hooks/useStudents.ts`** (new export, same file already migrated onto `api-client.ts` in R1):
```
export function useUpdateStudent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string } & UpdateStudentInput) =>
      apiFetch(`/students/${input.id}`, { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.students.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.students.lists() })
    },
  })
}
```

### 4. DEPENDENCIES

Depends on **R1** — `useStudents.ts` and `useApplications.ts` are edited here on top of R1's `apiFetch`/`queryKeys` consolidation; the new `useUpdateStudent()` hook is written directly against the canonical client. Depends on **R4** — the `students.ts`/`applications.ts` permission corrections in this phase apply R4's "converge on `requirePermission`" convention to this domain's specific over-grant instances.

### 5. ACCEPTANCE CRITERIA

- Submitting the Add Student form with a valid Sex, Academic Status, and Form/Class selection succeeds end-to-end (no client-side validation error, no server-side `P2003`)
- Opening an existing student in edit mode pre-populates every field with that student's current data
- Submitting an edit updates the existing record (confirmed by unchanged `id` and updated `updatedAt`), never creates a new one
- `admin` no longer sees Add/Edit/Archive controls on the Students pages; `high_rank` and `lower_rank` (per their actual `PERMISSIONS_MAP` grants) do
- `PATCH /students/:id/status` succeeds for `high_rank`/`lower_rank` and returns `403` for `admin`/`exam_officer`
- The Student detail page's Fee Status card shows a real balance/risk value, not the hardcoded placeholder string
- `lower_rank` receives `403` on `PATCH /applications/:id/status` for approve/deny actions
- The public landing page's hero stats, MANEB stats, and announcements match live data from `/public/school-info`, `/public/maneb-stats`, `/public/announcements` — changing a value via the admin settings panel or seeding a new announcement is reflected on the landing page without a code change
- Submitting the newsletter form on the landing page results in a new row via `POST /public/newsletter/subscribe`
- All seven footer links resolve to a real page or in-page section; none remain `href="#"`
- `grep -rn "getAdminApp" apps/web/src/server/services/studentService.ts` returns zero matches
- `P/schema.prisma` no longer defines `Student.riskLevel` as a persisted column
- No TypeScript errors in any touched file

---

## R6 — Academics II: Classes, Assignments & the Attendance Rebuild

### 1. OBJECTIVE

This phase completes the Class entity's CRUD surface (today classes can be created but never edited or archived through any audited code path, despite both permissions and UI buttons implying otherwise), builds the entirely-missing student-facing half of the Assignments feature, retires the dead-on-arrival duplicate `timetable.ts` router in favor of the one implementation the frontend actually uses, and executes the Attendance rebuild decided in R3 (Option B: migrate from unmediated Firestore access to a proper Postgres-backed, permission-gated, audit-logged feature). It is sequenced immediately after R5 because `AssignmentForm.tsx` and the attendance rework both depend on the Class entity being fully CRUD-capable, and because R3 explicitly scoped this phase's attendance work to assume the Option B decision.

### 2. CHANGE LIST

- **`W/server/routes/timetable.ts`** — DELETE. Confirmation of no remaining consumers: `timetable/page.tsx`, the only frontend consumer of timetable data anywhere in the audited codebase, calls the Phase 2C nested route (`classes.ts`'s `/:id/timetable` → `classService.createTimetableSlot()`), not this file; this file's `POST /` additionally bypasses the room-double-booking conflict check the Phase 2C path correctly performs, so deleting it also removes a live correctness hazard rather than only dead code.
- **`W/lib/api-app.ts`** — TARGETED EDIT (a further edit to this file, on top of R3's and R4's changes). Remove the `timetableRouter` import and its `app.use('/timetable', ...)` mount. Add the new `attendanceRouter` import and `app.use('/attendance', requireAuth-equivalent chain, attendanceRouter)` mount (see new file below).
- **`W/server/routes/classes.ts`** — TARGETED EDIT. `POST /`: change `requireRole(['admin','high_rank'])` to `requireRole(['high_rank'])` plus a `lower_rank` pending-action diversion matching `students.ts`'s existing correct pattern (`class.create` is held by `high_rank`/`lower_rank` only; `admin` is over-granted and `lower_rank` is wrongly excluded with no fallback today). Add **`PATCH /:id`** and **`DELETE /:id`** (soft-delete), gated by `requirePermission('class.edit')`/`requirePermission('class.softDelete')` respectively — no route exists today despite both permissions being defined. `POST /:id/timetable`: `exam_officer` holds `timetable.editWithApproval` only, but this route performs a direct creation with no approval step for that role — restrict `exam_officer`'s calls through this route to create a pending, unapproved slot (writing `approvedAt: null`) rather than an immediately-live one; `admin`/`high_rank` continue to create directly. `GET /:id/timetable`: replace the hardcoded `academicYear = '2025/2026'` default with a lookup against the current-academic-year settings value (the same source R14's constants work will centralize; this phase wires the call, R14 centralizes the underlying value).
- **`W/server/services/classService.ts`** — TARGETED EDIT. Add `import 'server-only'`. Add `updateClass()` and `archiveClass()` exports matching `createClass()`'s existing shape. Add `auditService.log(...)` calls to all five exports (`createClass`, `updateClass`, `archiveClass`, `createTimetableSlot`, and the timetable-approval write). In `createClass()`/`updateClass()`: add an application-level existence check confirming `teacherId` resolves to a real staff user via `verifyAuth`'s Admin SDK lookup before persisting (no database-level FK is possible across the Firebase-UID/Postgres boundary, so this must be an explicit service-layer check).
- **`W/hooks/useClasses.ts`** — TARGETED EDIT (further edit on top of R1's consolidation). Add `useUpdateClass()` and `useArchiveClass()` mutations matching the existing `useCreateClass()` shape, now that their backend routes exist.
- **`W/app/(auth)/classes/page.tsx`** — TARGETED EDIT. Add an "Add Class" entry point (button + dialog/form) wired to `useCreateClass()` — the hook and backend route are already correctly built but have had zero UI caller. Add Edit/Archive actions per row wired to the two new hooks above, gated by `usePermissions()`. Add a real academic-year selector in place of the hardcoded `useClasses('2025/2026')` call, with a clear empty state ("No classes found for {year}") instead of a silent blank list for any other year. Replace the local `[1,2,3,4]` Form-number literal with the same source `StudentFormSections.tsx` (R5) now uses.
- **`W/app/(auth)/classes/[id]/page.tsx`** — MAJOR REWRITE of the Assignments tab's data-fetching and the Roster/Timetable tabs' table markup; the page's overall layout and tab structure are unaffected. Assignments tab: remove the raw `useEffect` + manual `fetch()`; source assignment data from the class-detail query's existing Prisma `include: { assignments: ... }` (or a dedicated `useQuery` keyed on `queryKeys.classes.assignments(id)`, already defined in `api-client.ts` per R1). Wire the "+ New Assignment" button's previously-empty `onClick` to open the new `AssignmentForm` (below). Roster and Timetable tabs: replace bespoke raw `<table>` markup with `DataTable.tsx`; replace the bespoke tab-switcher with `ModuleTabs.tsx`. Add a term selector to the Timetable tab (`useClassTimetable(id, term)` in place of the hardcoded `useClassTimetable(id, 1)`). Roster tab's "Profile" link to `/students/:id`: render conditionally based on whether the current viewer's role can actually access that page (per R5's `RoleGuard` on the Students detail page), instead of unconditionally producing a dead end for student-role viewers.
- **`W/components/classes/AssignmentForm.tsx`** — NEW FILE. Teacher-facing assignment-creation form (title, description, due date), rendered from the Class detail page's Assignments tab. Structural pattern: matches `StudentForm.tsx`'s responsive dialog/bottom-sheet convention (Phase 1D-ii) — mobile bottom sheet, desktop dialog, shared form-state hook.
- **`W/server/routes/assignments.ts`** — TARGETED EDIT (a further edit on top of R3's ownership/role-gating fix). Add **`POST /:classId/assignments/:id/submit`** — gated to students actually enrolled in `:classId` (the same enrollment check R3 added to `GET /`), accepting a file reference obtained via the existing Appwrite upload flow (`lib/storage.ts`) and creating an `AssignmentSubmission` row. Narrow `POST /`'s role check to `academic` only, removing the `admin`/`high_rank` over-grant on top of R3's already-added ownership check (teacher-matches-`Class.teacherId`).
- **`W/server/services/assignmentService.ts`** — NEW FILE (this logic is inline in the route today per Phase 3D's inventory; extracting it matches the established `studentService.ts`/`classService.ts` service-layer convention). Exports `createAssignment()`, `submitAssignment()`, `listForClass()`, each following the file-level pattern: `import 'server-only'`, Prisma singleton import, named exports, `auditService.log(...)` on every mutation.
- **`P/schema.prisma`** — TARGETED EDIT, two changes. (1) `AssignmentSubmission.fileKey`: correct the comment from "R2 object key for uploaded file" (Cloudflare R2 — the only such reference anywhere in the codebase, contradicting the project's single-Appwrite-bucket storage constraint) to reference Appwrite. (2) `TimetableSlot.approvedAt`/`approvedByUid`: no schema change needed — these columns now get a real write path from `classes.ts`'s new approval branch (above), resolving the "dead column" finding by giving it a genuine consumer rather than removing it.
- **`P/schema.prisma`** — NEW MODEL. Add `Attendance` (fields: `id`, `studentId` → `Student`, `classId` → `Class`, `date`, `status` (present/absent/late enum), `markedBy` (Firebase UID string, application-level validated as R3/R6's `Class.teacherId` pattern establishes — no DB-level FK across the Firebase/Postgres boundary), `createdAt`), per the R3 Option B decision.
- **`W/server/services/attendanceService.ts`** — NEW FILE. Exports `markAttendance()`, `getForClass()`, `getForStudent()`, matching the established service-file pattern (`import 'server-only'`, Prisma singleton, `auditService.log()` on `markAttendance()`).
- **`W/server/routes/attendance.ts`** — NEW FILE. Express router matching `W/server/routes/students.ts`'s structure (`Router()`, `verifyAuth` first, thin handlers delegating to `* as attendanceService`). Routes: `GET /class/:classId` (list a day/range), `POST /class/:classId` (mark attendance, one or many students), `GET /student/:studentId` (a student's/parent's own history). Gated by a new `class.markAttendance` permission (below).
- **`S/types/permissions.ts`** — TARGETED EDIT. Add `class.markAttendance` (granted to `academic`/teacher role, matching who actually stands in front of the class) and `student.viewOwnAttendance` if not already covered by an existing `report.viewOwnAttendance`-style permission (confirm against R5's permission audit; do not create a duplicate if one already exists).
- **`W/components/attendance/AttendanceSheet.tsx`** — MAJOR REWRITE. Replace the direct Firestore `onSnapshot` listener and `setDoc` write (including the `db!` force-unwraps stopgap-fixed in R3) with TanStack Query hooks (`useClassAttendance`/`useMarkAttendance`, below) calling the new Express route. The realtime "live update while marking" UX Firestore provided is replaced with a standard mutate-then-invalidate pattern; if true realtime multi-teacher-marking-the-same-class-simultaneously is a real scenario for this school, a short polling interval (e.g. `refetchInterval`) on `useClassAttendance` is the pragmatic substitute rather than reintroducing a second realtime channel.
- **`W/hooks/useAttendance.ts`** — NEW FILE. TanStack Query hooks (`useClassAttendance(classId, date)`, `useMarkAttendance()`, `useStudentAttendance(studentId)`) matching the file-level pattern established in `useStudents.ts`/`useClasses.ts` — imports `apiFetch`/`queryKeys` from `@/lib/api-client` directly (no local reimplementation, per R1's now-established standard).
- **`apps/web/scripts/backfill-attendance.ts`** — NEW FILE. One-time, manually-run Node script (not part of the Next.js app runtime) reading every existing Firestore `attendance/{classId}/records/{date}` document and inserting a corresponding `Attendance` row via Prisma, run once during cutover; logs a summary count and any documents it could not map (e.g. a `classId` with no matching `Class` row) rather than silently dropping them.

### 3. CODE STRUCTURE FRAMEWORK

**`W/server/routes/attendance.ts`** (new — matches `students.ts`'s router convention exactly):
```
import 'server-only'
import { Router, type Request, type Response } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requirePermission } from '@/server/middleware/verifyPermission'
import * as attendanceService from '@/server/services/attendanceService'

const attendanceRouter = Router()
attendanceRouter.use(verifyAuth)

attendanceRouter.get('/class/:classId', requirePermission('class.markAttendance'), async (req, res) => { ... })
attendanceRouter.post('/class/:classId', requirePermission('class.markAttendance'), async (req, res) => { ... })
attendanceRouter.get('/student/:studentId', async (req, res) => { /* self/parent/staff scoping inside handler */ })

export default attendanceRouter
```

**`W/server/services/attendanceService.ts`** (new — matches `studentService.ts`'s convention):
```
import 'server-only'
import { prisma } from '@/lib/prisma'
import * as auditService from '@/server/services/auditService'

export async function markAttendance(classId: string, date: string, entries: AttendanceEntryInput[], markedBy: string): Promise<void>
export async function getForClass(classId: string, date: string): Promise<AttendanceRecord[]>
export async function getForStudent(studentId: string): Promise<AttendanceRecord[]>
```

**`W/hooks/useAttendance.ts`** (new — matches `useStudents.ts`'s post-R1 convention):
```
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch, queryKeys } from '@/lib/api-client'

export function useClassAttendance(classId: string, date: string) { /* useQuery */ }
export function useMarkAttendance() { /* useMutation, invalidates the above */ }
export function useStudentAttendance(studentId: string) { /* useQuery */ }
```

**`W/components/classes/AssignmentForm.tsx`** (new — matches `StudentForm.tsx`'s responsive dialog pattern):
```
export default function AssignmentForm({ classId, onClose }: { classId: string; onClose: () => void }) {
  // useForm<AssignmentFormValues>(...)
  // const createMutation = useCreateAssignment()
  // mobile: bottom sheet; desktop: dialog (Phase 1D-ii shared pattern)
}
```

### 4. DEPENDENCIES

Depends on **R3** — `AttendanceSheet.tsx`'s `db!` null-guard stopgap and the Option B decision recorded there are both prerequisites for this phase's full rebuild; this phase supersedes the stopgap with a real migration rather than layering on top of it. Depends on **R5** — `AssignmentForm.tsx` and the Class CRUD additions assume Students/Classes' own data (student enrollment, class roster) is correctly shaped per R5's fixes. Depends on **R1** — every new hook in this phase is written directly against the R1-consolidated `api-client.ts`.

### 5. ACCEPTANCE CRITERIA

- `W/server/routes/timetable.ts` no longer exists; `grep -rn "timetableRouter" apps/web/src` returns zero matches
- Creating a class via the new "Add Class" UI succeeds and the class appears in the list without a manual API call
- Editing and archiving a class both succeed through the UI and persist
- `lower_rank` creating a class produces a pending action (visible in the Pending Actions panel), not an immediate class record
- A student can successfully submit an assignment via `POST /:classId/assignments/:id/submit`; a student not enrolled in that class receives `403`
- `POST /classes/:classId/assignments` succeeds only for the class's own assigned teacher (or admin/high_rank), matching R3's ownership check, and only for the `academic` role otherwise
- Marking attendance for a class writes a row to the Postgres `Attendance` table, retrievable via `GET /attendance/class/:classId`
- `AttendanceSheet.tsx` contains no Firestore imports or calls
- The backfill script, run against a snapshot of the existing Firestore attendance data, produces a Postgres row count matching the source document count (minus any explicitly logged unmapped documents)
- Timetable slots created by `exam_officer` via `classes.ts` have `approvedAt: null` until an `admin`/`high_rank` approval action sets it; slots created by `admin`/`high_rank` directly are immediately approved
- No TypeScript errors in any touched file

---

## R7 — Academics III: Exam Pipeline Repair & Grading Engine Unification

### 1. OBJECTIVE

The exam results pipeline — create exam, enter marks, approve results, release to students — is confirmed non-functional at its two final steps for every school and every user: `exams.ts` has duplicate route registrations for both `POST /:id/approve` and `POST /:id/release`, and Express's first-match routing means the live handlers are the ones missing `verifyAuth`, so `requireRole` always rejects with `403` before the correctly-built duplicate definitions (which do have `verifyAuth`) can ever run. Independently, the entire admin-configurable grading system (`gradeService.ts`, wired correctly to its own Settings UI) has zero effect on any actual computed grade, because `examService.ts` computes every real result through its own private, hardcoded, pre-`gradeService` `calcGrade()` — meaning the Phase 1B grading-settings admin panel is decorative. This phase fixes both defects, closes an unauthenticated route that serves any visitor a signed URL to any student's report card PDF, and removes examService.ts's duplicate report-card/promotion/MANEB logic (confirmed to overlap with Phases 3B/3C's dedicated service files) so the "which implementation is authoritative" question Phase 3A left open is answered here rather than carried forward. It is sequenced after R5/R6 because it depends on Students and Classes being in a correct, editable state, and it must precede R8 (Report Cards, Transcripts, Promotion & Risk) because R8 assumes examService.ts's duplicate logic has already been stripped out.

### 2. CHANGE LIST

- **`W/server/routes/exams.ts`** — MAJOR REWRITE of the route-registration portion (individual handler bodies for unaffected routes are unchanged). Remove the first-registered, `verifyAuth`-missing definitions of `POST /:id/approve` and `POST /:id/release`; keep only the correctly-structured, `verifyAuth`-bearing duplicates, renumbered so they are Express's first (and only) match. `exam.approveResults`: narrow to `requirePermission`/`requireRole(['exam_officer'])` only (removing the `admin`+`high_rank` over-grant). `exam.authorizeRelease`: narrow to `high_rank` only (removing the `admin` over-grant). `exam.create`: narrow to `academic` (removing the `admin` over-grant, which also wrongly excluded `academic`, the role that should hold it). `exam.enterOwnClassMarks`: narrow to `academic` only (removing the `exam_officer`+`admin` over-grant). Delete `GET /report-cards/student/:studentId` (plural, confirmed unauthenticated) entirely — the correctly-secured singular sibling `GET /report-card/:studentId` already serves the same purpose; consolidating onto one name and one security posture removes both the vulnerability and the naming collision in the same change. Add `PATCH /:id` and `DELETE /:id`, gated by `requirePermission('exam.edit')`/`requirePermission('exam.delete')` (both permissions already defined with no route implementation today). Add a permission-gate to `POST /exams/compute` (no `PERMISSIONS_MAP` entry exists for this action today — add `exam.computeResults`, granted to `academic`/`exam_officer`, to `S/types/permissions.ts`). Delete `POST /exams/report-card` (the single-report generation route backed by `examService.ts`'s soon-to-be-removed `generateReportCard`); repoint any caller to a to-be-confirmed single-student entry point on `reportCardService.ts` (R8's responsibility to expose one if `batchGenerateReportCards` cannot already be called with a one-element class roster).
- **`W/server/services/examService.ts`** — MAJOR REWRITE of four areas within the file (unrelated exports such as exam CRUD basics are unaffected). (1) Remove the private `calcGrade()` function and the `MSCE_GRADES`/`JCE_GRADES` constants entirely; `computeTermResults()` now imports and calls `gradeService.ts`'s exported, async, database-backed `calcGrade()` — this is the single change that makes the Phase 1B grading-settings admin UI finally affect real results. (2) `enterMarks()`: update `Exam.status` through `IN_PROGRESS` → `MARKS_DRAFT` as marks are entered, not only `ExamMark.isDraft` — the two enum values exist in the schema and the frontend's status-badge logic already expects them as reachable states. (3) `finalizeMarks()`: validate mark *validity*, not merely row *existence* — reject finalization if any `ExamMark` row has `mark: null && absent: false`; this closes the validation-bypass path where an uninitialized client-side entry (`undefined`, which the current `mark === null` check does not catch) can reach Approved/Released state with no actual mark. (4) Remove `generateReportCard`/`buildReportCardHtml` and `runPromotion` entirely — both are confirmed duplicate/overlapping implementations of logic that belongs solely to `reportCardService.ts` (Phase 3B) and `promotionService.ts` (Phase 3C) respectively; leaving both implementations live is the direct cause of the two-independent-PDF-pipelines conflict Phase 3A flagged. `createManebRecord`/`listManebRecords` are **not** duplicates and are **not** removed — they are this file's correct, sole implementation of MANEB record management, which `ManebPanel.tsx` should be consuming (R8 wires that connection). Add `import 'server-only'`; remove the leftover `// ← WAS '../lib/prisma'`-style refactor-artifact comments on every import line.
- **`W/app/(auth)/exams/page.tsx`** — TARGETED EDIT. "Compute Results" button: replace the local `apiPost('/exams/compute')` call (sent with no request body, guaranteed to `400` today) with a call through the R1-consolidated `apiFetch`, supplying the required `classId`/`academicYear`/`term`, and surface the result/error to the user (today the return value is discarded and no error is shown regardless of outcome) — remove the local `apiPost()` helper entirely, consistent with R1's established one-client standard. "All classes…" filter: change `enabled: !!classId` so selecting "All classes" runs an aggregated query across classes instead of disabling the query outright and showing a misleading "No exams scheduled yet" empty state. Replace the hardcoded `CURRENT_YEAR = '2025/2026'` and the inline `['SCHEDULED','IN_PROGRESS','MARKS_PENDING','MARKS_DRAFT']` status array with the same current-year source and `ExamStatus`-enum derivation established elsewhere in this roadmap (full constants centralization in R15; the immediate correctness fix happens here since the file is already open for the button fix).
- **`W/components/exams/MarksEntrySheet.tsx`** — MAJOR REWRITE of the local marks-state initialization and data-loading only (the entry-grid UI itself is unaffected). Fix the `useState(initialMarks)` vs. async student-list race so a not-yet-loaded student's mark state is never silently treated as valid: use a value that the existing finalize-time check (moved server-side per the `finalizeMarks()` fix above, but the client should mirror it to give real-time feedback) can distinguish from "explicitly entered." Add a query that loads previously-saved draft marks for the exam when the sheet opens, instead of always resetting to blank — teachers currently lose visible progress every time the sheet is closed and reopened even though the data persists correctly server-side. Replace the hardcoded `max={100}` on the mark input with the specific exam's actual `maxMark` (already present on the exam object, configurable 1–1000 via `ExamForm.tsx`).
- **`W/components/exams/ExamForm.tsx`** — TARGETED EDIT. `EXAM_TYPES` centralization deferred to R15; not touched in this phase beyond what the a11y-deferred items note (R18).

### 3. CODE STRUCTURE FRAMEWORK

No NEW FILE in this phase. Binding shape for the grading-engine unification (the phase's most structurally significant change):

```
// W/server/services/examService.ts — computeTermResults() (edit)
import { calcGrade } from '@/server/services/gradeService'
// ...
export async function computeTermResults(...): Promise<TermResult> {
  // for each subject score:
  const grade = await calcGrade(score, examType) // was: calcGrade() private/sync/hardcoded
  // ... persist grade exactly as returned by gradeService, no local override
}
// MSCE_GRADES / JCE_GRADES constants and the private calcGrade() function
// are removed from this file entirely — gradeService.ts is now the only
// grade-boundary authority anywhere in the codebase.

// W/server/routes/exams.ts — approve/release, single surviving registration each
examsRouter.post('/:id/approve', verifyAuth, requireRole(['exam_officer']), async (req, res) => { ... })
examsRouter.post('/:id/release', verifyAuth, requireRole(['high_rank']), async (req, res) => { ... })
// (no second, verifyAuth-less registration of either path exists anywhere
// else in this file after this edit)
```

### 4. DEPENDENCIES

Depends on **R5/R6** — the exam pipeline joins against Student and Class records; both must already be in the corrected, fully-CRUD-capable state those phases establish. Depends on **R1** — `exams/page.tsx`'s rewritten "Compute Results" handler and the removal of its local `apiPost()` are written against the R1-consolidated `apiFetch`. **R8 depends on this phase** — Report Cards/Transcripts/Promotion cannot be finalized until `examService.ts`'s duplicate implementations of that logic are removed, which this phase does.

### 5. ACCEPTANCE CRITERIA

- `POST /exams/:id/approve` succeeds for `exam_officer` and returns `403` for `admin`/`high_rank`; `POST /exams/:id/release` succeeds for `high_rank` and returns `403` for `admin`
- `grep -c "post('/:id/approve'" apps/web/src/server/routes/exams.ts` and the equivalent for `/:id/release` each return `1`, not `2`
- `GET /exams/report-cards/student/:studentId` (plural) no longer exists as a route; `GET /exams/report-card/:studentId` (singular) remains the sole, authenticated path
- A grade computed by `computeTermResults()` and a grade recomputed by `reportCardService.ts` for the same score are identical (today they can differ because the two systems use different grade boundaries)
- Finalizing a marks entry with at least one student's mark left blank/uninitialized is rejected server-side, not merely client-side
- Reopening `MarksEntrySheet.tsx` after closing it shows previously-entered draft marks, not a blank sheet
- The mark input's maximum matches the specific exam's configured `maxMark`, not a fixed `100`
- Clicking "Compute Results" with a class, year, and term selected succeeds and shows a success or error state — never a silent no-op
- Selecting "All classes" on the exams list shows an aggregated result set, not a misleading empty state
- `grep -rn "generateReportCard\|buildReportCardHtml\|runPromotion" apps/web/src/server/services/examService.ts` returns zero matches; `createManebRecord`/`listManebRecords` remain present and unchanged
- No TypeScript errors in any touched file

---

## R8 — Academics IV: Report Cards, Transcripts, Promotion & Risk Assessment

### 1. OBJECTIVE

Three independent, high-severity failures converge in this phase: a confirmed syntax error in `reportCardService.ts` that the audit flagged as potentially build-breaking for the entire project; a promotion-decision function that passes the wrong data type to its own pass-count logic, making every Form 1–3 student's promotion outcome permanently `REPEATED` regardless of actual performance; and a risk-assessment pipeline that fails at four independent, simultaneous points (wrong route name in its own docs, a different wrong path in `vercel.json`, zero callers of its core function, and an unconditional crash in the function itself). All three, plus five confirmed-orphaned "Phase D" UI components that exist and mostly work but are never rendered anywhere, are fixed together because they share the same root dependency this phase newly satisfies: R6's new Postgres `Attendance` model gives `reportCardService.ts`, `transcriptService.ts`, and `riskService.ts` — all three of which crash today referencing a Prisma model that did not exist — a real data source to query instead. This phase depends on R7 having already removed `examService.ts`'s competing report-card and promotion implementations, and on R6 for the `Attendance` model.

### 2. CHANGE LIST

- **`W/server/services/reportCardService.ts`** — MAJOR REWRITE of the PDF-generation and data-gathering functions (the Appwrite upload/URL helpers are edited separately, below). **Highest-priority single fix in this phase:** correct the invalid nested-ternary syntax in `generateReportCardPDF()` (`setFill(idx % 2 === 0 ? 255 : 249 : 255, 255, 255)`) to valid syntax — if implementation discovers this is already blocking builds when work reaches this phase, it must be hotfixed immediately regardless of roadmap sequencing, not deferred to this phase's scheduled slot. Repoint both `prisma.attendance.aggregate(...)` calls at the real `Attendance` model R6 introduced, replacing the assumed-shape query with one matching that model's actual fields. Wrap the `prisma.teacherComment.findFirst(...)` call's target in a minimal new `TeacherComment` model (below) rather than leaving it permanently null — every generated report card has shipped with no teacher/head-teacher comment since this feature's inception. Replace the hardcoded fallback identity strings (`'SMS Malawi Secondary School'`, `'P.O. Box 1, Blantyre, Malawi'`, `'+265 111 000 000'`) with `settingsService.getIdentitySettings()`, matching the pattern R5 already applied to `public.ts`. Either wire `URL_EXPIRY_SECS=3600` into an actual expiring-URL call or remove the constant and correct the documentation to state plainly that `getReportCardUrl()` returns a permanent URL — whichever matches the real access-control decision made for the Appwrite permissions fix below. Set Appwrite file permissions on generated report cards to authenticated-owner-and-staff-only (matching the file's own un-actioned inline TODO), replacing the current `[read("any")]` public-read grant. Expose a single-student generation entry point (`generateSingleReportCard(studentId, ...)` or an equivalent single-roster call into the existing `batchGenerateReportCards`) so R7's `POST /exams/report-card` route has a real, non-`examService`-owned implementation to call.
- **`P/schema.prisma`** — NEW MODEL. Add a minimal `TeacherComment` model (`id`, `termResultId` → `TermResult`, `authorUid`, `comment`, `createdAt`) so report cards can carry a real comment instead of a permanently-`null` lookup.
- **`W/server/services/transcriptService.ts`** — TARGETED EDIT. Repoint its own `prisma.attendance.aggregate(...)` call at the real `Attendance` model (same fix as `reportCardService.ts`). Fix `getTranscriptData()`'s speculative `(tr as {className?:string}).className` cast — `TermResult` has no `className` field, only `classId`; join through `Class` to get the real name instead of a permanent placeholder dash. Add the same Appwrite permissions treatment applied to `reportCardService.uploadReportCard()` — today `uploadTranscript()` omits the explicit permissions array entirely, an unexplained inconsistency between two equally sensitive document types. Replace hardcoded identity-string fallbacks with `settingsService.getIdentitySettings()`, matching `reportCardService.ts`.
- **`W/components/shared/PrintableReportCard.tsx`** — TARGETED EDIT (wiring this orphaned-but-functional component in as an in-browser print-preview feature, distinct from the downloadable-PDF path `reportCardService.ts` owns). Replace the standalone `GRADE_SCALE` 5-tier taxonomy with a call into `gradeService.calcGrade()` — the third independent grading taxonomy in the codebase is retired here, leaving `gradeService.ts` as the sole authority everywhere. Add a `schoolLogoUrl` field to the `ReportCardData` interface (sourced from `settingsService.getIdentitySettings()`) and render it via a real `<img>`, replacing the hardcoded `"CREST"` text placeholder — if no logo has been uploaded yet, fall back to the school's initials rather than a literal placeholder word. Add an entry point from the Student detail page (`students/[id]/page.tsx`, R5) and/or the Report Card Generator UI (below) so this component finally has a real importer; its retained `ReportCardData`/`SubjectGrade` types (already reused as type-only imports in `reportCardService.ts`) do not change shape.
- **`W/components/exams/ReportCardGenerator.tsx`** — TARGETED EDIT. Wire this component into the Exams module as the real UI entry point for `reportCardService.batchGenerateReportCards` (its target pipeline was already correct; only the missing importer/route is fixed here — add it to `exams/page.tsx` as a new tab or action). Replace the hardcoded `academicYear` default with the current-year source established elsewhere in this roadmap.
- **`W/server/services/promotionService.ts`** — MAJOR REWRITE of the pass-count and threshold-reading logic (the overall `runPromotion()` orchestration/looping structure is unaffected). **Critical fatal-bug fix:** `countSubjectPasses(annualResult.passStatus)` currently passes a `Boolean` field to a function expecting an array — `AnnualResult` has no `subjectResults` field at all. Replace this call with a real computation: derive each student's per-subject pass/fail for the academic year from their `TermResult`/`ExamMark` records (comparing each subject's final score against `gradeService.getPassMarkThreshold()`), assemble that into the array `countSubjectPasses()` actually expects, and pass the real array. This is the fix that makes promotion decisions reflect real academic performance instead of unconditionally marking every Form 1–3 student `REPEATED`. Fix `getPromotionThresholds()` to read from the typed `SETTING_KEYS` registry instead of the unregistered raw string keys `'promotion_min_average'`/`'promotion_required_passes'` — this requires the companion fix to `ExamGradingSettings.tsx` below so both sides of the settings read/write agree on one key system. Remove the dead `getPassMarkThreshold` import if `runPromotion()`'s own `minimumAverage` default is deliberately kept independent, or actually call it as the default (preferred, for consistency with the exam module's pass-mark logic) — either way, an imported-but-uncalled function must not remain.
- **`W/components/settings/ExamGradingSettings.tsx`** — TARGETED EDIT. Repoint the promotion-threshold fields (`promotion_min_average`, `promotion_required_passes`) from the older raw-route settings system to the typed `SETTING_KEYS` registry `promotionService.ts` now reads from — both sides of this admin-configuration path must agree on the same key system for the settings panel to have any real effect, closing the third confirmed instance of "Settings UI has zero effect on business logic."
- **`W/components/exams/PromotionEngine.tsx`** — TARGETED EDIT. Wire this orphaned component into the Exams module (new tab or a dedicated `/promotion` page reachable from the app's navigation — today nothing links to it). Replace the raw `fetch()` + `dynamic import('@/lib/firebase')` token-retrieval pattern with the R1-consolidated `apiFetch`. Add the missing `?? ''` fallback on the `NEXT_PUBLIC_API_URL` template literal (every other call site in the codebase already has this).
- **`W/components/exams/ResultsReleaseWorkflow.tsx`** — TARGETED EDIT. Wire this component in as the real Approve/Release UI on the Exams page, replacing whatever inline ad-hoc workflow `exams/page.tsx` uses today (R7 fixed the backend this component needs; this phase gives it a real frontend home so the more polished, purpose-built UI is not permanently dead code sitting next to a worse inline reimplementation). Fix its `ExamSummary` type mismatch by extending `examService.listExams()` to return `feeBlockedCount`/`totalStudents`/`marksEntered`/`className` — data the underlying query can already join for with modest additions, per this component's actual needs.
- **`W/server/services/riskService.ts`** — MAJOR REWRITE of `assessStudentRisk()`'s data-gathering only (the risk-scoring thresholds/logic are unaffected in this pass). Repoint the unconditionally-crashing `prisma.attendance.aggregate(...)` call at the real `Attendance` model from R6, with proper error handling (today there is none) so a genuinely missing record degrades gracefully rather than throwing. `getPassMarkThreshold()` (already correctly imported and called here — the only confirmed live caller in the audit) is unaffected.
- **`W/app/api/cron/risk-detection/route.ts`** — NEW FILE (path chosen to match what `vercel.json` already schedules, rather than changing infra config to match either of the two other, equally-nonexistent paths referenced in `riskJob.ts`'s own documentation and the job's original intended route). Thin Next.js cron-route wrapper following the same shape as the five R3-hardened cron routes: verifies `CRON_SECRET` using R3's fail-closed pattern, then calls `runRiskAssessmentJob()`.
- **`W/server/services/riskJob.ts`** — TARGETED EDIT. Correct the file's own header documentation to reference the real route above instead of the nonexistent `/api/cron/risk-assessment`. No change to `runRiskAssessmentJob()`'s internal logic beyond what its call into the now-fixed `riskService.ts` naturally resolves.
- **`W/components/shared/StudentRiskBadge.tsx`** — TARGETED EDIT. Wire this component into the four locations its own header comment already (falsely) claims it is used: the Students list `DataTable` cells, the Student profile header (`students/[id]/page.tsx`, R5), class dashboard cards (`classes/[id]/page.tsx`, R6), and the academic-staff dashboard. Correct the header comment only after the four integrations are real.
- **`W/server/services/settingsService.ts`** — TARGETED EDIT (small addition, following the exact pattern of the existing Grading/Promotion settings sections). Add a `risk_thresholds`-family entry to `SETTING_KEYS` (`FEE_DEBT_HIGH`, `FEE_DEBT_MEDIUM`, `ABSENCE_HIGH`, `ABSENCE_MEDIUM`, `SUBJECT_FAILS_HIGH`, `SUBJECT_FAILS_MEDIUM`) and a corresponding small settings-panel section (new component or an addition to an existing settings page, mirroring `ExamGradingSettings.tsx`'s structure) so `riskService.ts`'s thresholds — the one hardcoded-threshold set in this domain with no planned admin-configuration mechanism at all — finally has one, consistent with grading and promotion.
- **`W/server/services/examService.test.ts`, `promotionService.test.ts`, `riskService.test.ts`** — not fixed in this phase; all three are confirmed broken (wrong function names/signatures, mismatched mocks) and are deferred to R18, which owns all unit/E2E/Storybook remediation as a single, complete pass rather than fixing test files piecemeal as each service they cover is touched.

### 3. CODE STRUCTURE FRAMEWORK

No new component-level structural pattern beyond what's already established. Binding shape for the promotion fatal-bug fix (the phase's most consequential change):

```
// W/server/services/promotionService.ts — replaces the broken call
async function getSubjectPassArray(studentId: string, academicYear: string): Promise<boolean[]> {
  // fetch the student's TermResult/ExamMark rows for the year
  // for each subject: compare final score against gradeService.getPassMarkThreshold()
  // return one boolean per subject (true = passed)
}
// in runPromotion()'s per-student loop:
const subjectResults = await getSubjectPassArray(student.id, academicYear)
const subjectPasses = countSubjectPasses(subjectResults) // was: (annualResult.passStatus), a Boolean
```

### 4. DEPENDENCIES

Depends on **R7** — `examService.ts`'s competing `generateReportCard`/`runPromotion` implementations must already be removed before this phase's implementations become the sole authority. Depends on **R6** — `reportCardService.ts`, `transcriptService.ts`, and `riskService.ts` all repoint their broken Attendance queries at the model R6 introduces. Depends on **R3** — the new `risk-detection` cron route applies R3's fail-closed `CRON_SECRET` pattern.

### 5. ACCEPTANCE CRITERIA

- `reportCardService.ts` compiles with no syntax errors (`tsc --noEmit` passes on this file specifically, as a targeted check given the audit's own uncertainty about current build status)
- Generating a report card for a student with attendance records produces a real attendance figure, not a crash
- A generated report card includes a teacher comment when one has been entered, and a graceful "no comment" state when none exists — never a silent permanent absence
- Report card and transcript PDFs are retrievable only by an authenticated request with a legitimate reason to view that student's record (owner, parent, or authorized staff) — not by an unauthenticated request with only the file path
- Running promotion for a Form 1–3 cohort with mixed real performance produces a mix of `PROMOTED`/`REPEATED` outcomes correlated with actual grades — never a 100% `REPEATED` result
- Changing the promotion minimum average in `ExamGradingSettings.tsx` changes the actual outcome of the next promotion run
- `GET /api/cron/risk-detection` (matching `vercel.json`'s existing schedule entry) successfully triggers `runRiskAssessmentJob()` and updates at least one student's risk data without throwing
- `PrintableReportCard.tsx`, `ReportCardGenerator.tsx`, `PromotionEngine.tsx`, `ResultsReleaseWorkflow.tsx`, and `StudentRiskBadge.tsx` each have at least one real importer in the live application (`grep -rn` for each component name outside its own file returns at least one match)
- `StudentRiskBadge.tsx`'s header comment accurately reflects its real usage sites
- No TypeScript errors in any touched file

---

## R9 — Finance I: Invoicing, Fees & the Accounting Ledger Reconnection

### 1. OBJECTIVE

This phase fixes the third confirmed build-breaking TypeScript error in the codebase (`bulkInvoiceService.ts` referencing a nonexistent Prisma field, producing `NaN` discounts for every scholarship-holding student's bulk invoice if the build somehow proceeds), a fee-reminder job that has been sending 100% of its emails to a fabricated, non-functional address since inception, and three confirmed cross-student data-exposure gaps in payment receipts and installment plans. Its headline item is reconnecting `accountingService.ts` — independently confirmed to be some of the most rigorously correct code in the entire audit — to `feeService.recordPayment()`, the actual live payment-recording path; today the two never call each other, so the double-entry ledger every `AccountingLedgerTab.tsx` view depends on shows near-zero revenue regardless of how much tuition has actually been collected. It is sequenced after the Academics phases because fee-gating and invoicing logic joins against Student records R5 already corrected.

### 2. CHANGE LIST

- **`W/server/services/bulkInvoiceService.ts`** — TARGETED EDIT. **Build-breaking fix, highest priority in this phase:** correct `scholarship.discountValue` to `scholarship.value` (the real Prisma field name, already used correctly by `feeService.generateInvoice()` in the same phase) everywhere it appears. Add `import 'server-only'`.
- **`W/server/jobs/feeReminderJob.ts`** — MAJOR REWRITE of the send path only (the job's scheduling/query logic for which invoices are overdue is unaffected). Delete the inline `buildReminderEmail()` function and its construction of `${student.guardianPhone}@sms.gateway` (a fabricated domain guaranteeing 100% delivery failure — Resend is an email API, not an SMS gateway, and no such domain resolves to anything). Replace with a call to the already-correctly-built `notificationService.sendFeeReminder()` (which uses the real guardian email and the `fee-reminder.ts` template with proper design-token styling) — this is the sixth confirmed instance in the audit of a correct implementation sitting unused beside a broken one actually running in production, and this phase is where that pattern is broken for this specific pipeline. Replace the hardcoded `'fees@school.edu.mw'` sender with `settingsService.getIdentitySettings()`'s configured contact email.
- **`W/server/routes/finances.ts`** — TARGETED EDIT, five independent fixes. (1) `GET /payments/:id/receipt`: add an explicit ownership check (the requesting student's Prisma ID must match the payment's `studentId`) alongside the existing role list — today any student-role user can fetch any other student's receipt by iterating payment IDs. (2) `GET /invoices/:id/installments`: add the same ownership-check pattern. (3) `POST /invoices/:id/installments`: replace the raw type-assertion-only body handling with real Zod schema validation (a `frequency` enum and a `count` minimum of 1), closing both the silent-misinterpretation-as-`TERM_WISE` bug and the `count: 0` → `Infinity` baseAmount bug. (4) `PATCH /library-fines`-adjacent items are out of scope for this phase — tracked in R10. (5) Add `import 'server-only'` if not already present (confirm against Phase 4A's inventory).
- **`W/hooks/useFinances.ts`** — no further change in this phase beyond R1's consolidation (the local `apiFetch` and leaked instruction-comment removal are already handled there).
- **`W/components/finances/InvoicesTab.tsx`** — TARGETED EDIT, three fixes. (1) Student self-service invoice viewing: call `GET /finances/balance/:studentId` (the correctly-secured, ownership-checked endpoint that already exists in the same router) instead of `GET /finances/invoices` (whose role list excludes `student` entirely) — this also requires the Firebase-UID-to-Prisma-ID resolution fix below, since `Invoice.studentId` is a Prisma FK, not a Firebase UID. (2) "Student" column: replace `inv.studentId.slice(-8)` with the invoice's joined student name (see service-layer fix below). (3) "Pay" button: gate on `usePermissions().has('finance.recordPayment')` instead of the current `role !== 'student'` check, which incorrectly shows the button to seven staff roles that do not hold this permission.
- **`W/server/services/feeService.ts`** — TARGETED EDIT, two fixes. (1) `checkBalanceGate()`: resolve the incoming identifier through `studentService.resolveStudentFromUid()` before querying — today a Firebase UID passed through the confirmed `examService.getStudentResults()` caller chain causes this function to fail *open* (report no outstanding balance) rather than correctly evaluating the real balance, meaning genuinely-indebted students are not blocked via this path. (2) Every list/detail function returning invoices to a UI (`getInvoices()` or equivalent): add a joined student name (`include: { student: { select: { firstName: true, surname: true } } }`, or the service's existing equivalent pattern) so the frontend never needs to resolve a raw ID to a name itself — this is the general fix `InvoicesTab.tsx`'s "Student" column, `InvoiceNotes.tsx`'s author display, and R10's `ScholarshipTab.tsx`/`payrollService.ts`/`LibraryFinesTab.tsx` fixes all consume the same way.
- **`W/components/finances/InvoiceNotes.tsx`** — TARGETED EDIT. Replace `note.authorUid.slice(0,8)` with the note's joined author name, sourced the same way as the `InvoicesTab.tsx` fix above.
- **`W/server/services/accountingService.ts`** — TARGETED EDIT (this phase's headline fix). No change to the ledger logic itself (already confirmed correct); the fix is entirely at the call site below.
- **`W/server/services/feeService.ts`** — TARGETED EDIT (third fix to this file in this phase, listed separately for emphasis). `recordPayment()`: add a call to `accountingService.recordPaymentEntry()` immediately after the payment row is persisted, wrapped in the same transaction as the payment write where the underlying Prisma client supports it (or immediately after, with compensating-log-on-failure if not) — this is the single call that reconnects real tuition revenue to the accounting ledger for the first time.
- **`W/components/finances/ExpensesTab.tsx`** — MAJOR REWRITE of the read-only list into a full three-state workflow view. Add Create (expense submission), Approve, and Reject actions, matching the `PENDING`/`APPROVED`/`REJECTED` states the data model already supports. Approve action calls `accountingService`'s expense-posting path (mirroring the payment-posting fix above, so approved expenses also reach the ledger — Phase 4B confirmed no money-movement operation reaches `accountingService` today, not just payments).
- **`S/types/permissions.ts`** — TARGETED EDIT. `finance.rejectExpense` is currently granted to no role in the entire matrix (confirmed dead permission) — assign it to `finance` (and `high_rank`, matching the approve-side grant, if `finance.approveExpense`'s role list includes `high_rank` — mirror whatever that permission's grant is, since approve and reject are the same workflow's two outcomes and should share an authorization boundary).
- **`W/server/services/budgetService.ts`** — TARGETED EDIT. `updateBudgetSpent()`'s writes to `Budget.spent` are never read by `getBudgetVsActual()` (which recomputes "spent" live via direct `Expense` aggregation) — remove the dead write entirely rather than maintaining two disconnected representations of the same number; if `Budget.spent` has any other confirmed reader, keep the column but repoint `getBudgetVsActual()` to read it instead of re-aggregating (whichever is confirmed to be the single live consumer). Add `import 'server-only'`.
- **`P/schema.prisma`** — TARGETED EDIT. Correct `Expense.receiptKey`'s comment from "R2 object key for scanned receipt" (Cloudflare R2, contradicting the single-Appwrite-bucket constraint — the second such reference after R6's `AssignmentSubmission.fileKey` fix) to reference Appwrite; wire an actual upload/view UI for expense receipts in `ExpensesTab.tsx`'s new Create flow (above), since none exists today despite the field.
- **`W/components/finances/ScholarshipTab.tsx`** — TARGETED EDIT. Replace `studentId.slice(-8)` display with the joined student name (same service-layer pattern as `InvoicesTab.tsx`). Replace the free-text "Full student Neon ID" input with a searchable student picker (autocomplete against `GET /students?search=`, already supported per R5's Students module), removing the requirement that staff already know a student's raw database ID to award a scholarship.
- **`W/server/services/accountingService.test.ts`** — not fixed in this phase; confirmed broken (nonexistent `postJournalEntry` function, wrong model names) and deferred to R18 with every other broken test file.

### 3. CODE STRUCTURE FRAMEWORK

No NEW FILE in this phase. Binding shape for the ledger reconnection (the phase's most consequential change):

```
// W/server/services/feeService.ts — recordPayment() (edit)
import * as accountingService from '@/server/services/accountingService'

export async function recordPayment(input: RecordPaymentInput): Promise<Payment> {
  const payment = await prisma.payment.create({ data: { ... } })
  await accountingService.recordPaymentEntry({
    amount: payment.amount,
    invoiceId: payment.invoiceId,
    paidAt: payment.paidAt,
    // ... fields accountingService.recordPaymentEntry() already declares
    // in its own (currently uncalled) signature
  })
  return payment
}
```

General "joined name, not raw ID" pattern applied at every affected service in this and the following phase:
```
// any list()/getById() currently returning a bare studentId/staffUid/authorUid
prisma.invoice.findMany({
  include: { student: { select: { firstName: true, surname: true } } },
  // ...
})
// frontend renders `${student.firstName} ${student.surname}`, never a raw ID
```

### 4. DEPENDENCIES

Depends on **R5** — fee-gating and invoice ownership checks resolve through the Student record shape R5 corrects. Depends on **R1** — `InvoicesTab.tsx`/`InvoiceNotes.tsx`/`ScholarshipTab.tsx` are edited here on top of R1's `apiFetch` consolidation of these same files.

### 5. ACCEPTANCE CRITERIA

- `bulkInvoiceService.ts` compiles with no TypeScript errors; a bulk invoice run for a scholarship-holding student produces a real, non-`NaN` discount and total
- A fee reminder sent by `feeReminderJob.ts` arrives at the guardian's real email address, not `*@sms.gateway`
- A student cannot fetch another student's payment receipt or installment plan (`403`/`404` as appropriate on a non-owned ID)
- `POST /invoices/:id/installments` rejects an invalid `frequency` value and a `count` of `0`, rather than silently misinterpreting either
- The Invoices tab and Invoice Notes both display real names, not truncated raw IDs
- The "Pay" button is visible only to roles holding `finance.recordPayment`
- Recording a tuition payment produces a corresponding posting visible in `AccountingLedgerTab.tsx`'s Income Statement/Trial Balance within the same request cycle
- The Expenses tab supports creating, approving, and rejecting an expense; an approved expense is reflected in the accounting ledger
- `finance.rejectExpense` is held by at least one real role in `S/types/permissions.ts`
- Awarding a scholarship no longer requires typing a raw database ID — a name-search picker is used instead
- No TypeScript errors in any touched file

---

## R10 — Finance II: Payroll, Forecasting & the Finance↔Library Reconciliation

### 1. OBJECTIVE

This phase resolves the most completely disconnected feature in the entire audit — `payrollApprovalService.ts` is registered in no route file anywhere, and even if mounted, every one of its 8 exported functions references a `PayrollRun` shape (field names and a six-state status enum) that shares nothing with the real Prisma model — alongside the fourth confirmed build-breaking TypeScript error (`forecastService.ts`), a forecasting endpoint the frontend calls that does not exist on the backend at all, and an unsafe Prisma/Firestore dual-write in the Finance↔Library fine-settlement path with no transaction or compensating action. It also closes three more permission-matrix violations and reconnects two more revenue categories (payroll, library fines) to the accounting ledger R9 just reconnected for tuition payments — fully resolving Phase 4B's headline finding that no money-movement operation anywhere in Finance reaches the accounting engine. Sequenced immediately after R9 since both phases touch the same ledger-reconnection pattern and the Finance module is more coherently delivered as one continuous unit of work.

### 2. CHANGE LIST

- **`P/schema.prisma`** — TARGETED EDIT. Extend `PayrollStatus` from `PROCESSING`/`COMPLETED`/`FAILED` to include the approval-workflow states the feature's own name and UI (`PayrollApprovalPanel.tsx`) require: add `PENDING_APPROVAL`, `APPROVED`, `LOCKED`. (`DRAFT` and `ROLLED_BACK` from `payrollApprovalService.ts`'s fictional enum are not added — `PROCESSING` already serves the draft/in-progress role, and rollback is modeled as a transition back to `PENDING_APPROVAL` with an audit trail entry rather than a distinct terminal status.) Add `submittedByUid`/`approvedByUid`/`approvedAt` fields to `PayrollRun` to support the workflow.
- **`W/server/services/payrollApprovalService.ts`** — MAJOR REWRITE. Rebuild all 8 exported functions against the real (now-extended) `PayrollRun` model and the real field names (`totalGross`/`totalNet`/`month`/`year`/`runByUid`) instead of the fictional `grossTotal`/`netTotal`/`period`/`totalStaff`/`submittedByUid` shape — this is a rewrite, not a patch, because every function's Prisma calls target fields that do not exist. Preserve the one part of this file already confirmed correct: its `accountingService` integration (posting a journal entry on lock, voiding on rollback) — this becomes the second live caller of the ledger, after R9's payment-recording fix.
- **`W/server/routes/payroll.ts`** — TARGETED EDIT. Mount the (now-rebuilt) `payrollApprovalService` behind new routes — `POST /runs/:id/submit-for-approval`, `POST /runs/:id/approve`, `POST /runs/:id/lock`, `POST /runs/:id/rollback` — matching the paths `PayrollApprovalPanel.tsx` already calls, none of which exist in any route file today. `GET /`: correct the role list to `['finance','hr','high_rank']` (removing `admin`, who does not hold `finance.viewPayrollRuns`, and adding `high_rank`, who does but was excluded).
- **`W/components/finances/PayrollApprovalPanel.tsx`** — TARGETED EDIT. `canRollback = role === 'admin'` is inverted relative to the permission matrix — `admin` does not hold `finance.rollbackPayroll` and `finance` (the only role that does) was completely excluded; replace with `usePermissions().has('finance.rollbackPayroll')`.
- **`W/server/services/payrollService.ts`** — TARGETED EDIT, three fixes. (1) Replace the hardcoded PAYE tax brackets (`100_000`/`350_000`/`2_000_000` thresholds, `0.15`/`0.3`/`0.35` rates) and `PENSION_RATE=0.05` with reads from `SETTING_KEYS.FINANCE_PAYE_BRACKETS`/`FINANCE_PENSION_PERCENT` (Phase 1B; already built and simply uncalled — this is the fourth confirmed instance of a Settings panel with zero effect on real computation, after grading/3A, promotion/3C, and this one). (2) `processMonthlyPayroll()`: wrap the `PayrollRun` create → per-staff `Payslip` create → PDF generation → status-update sequence in a single Prisma `$transaction` so a mid-run crash cannot leave a run permanently stuck at `PROCESSING` against the `@@unique([month,year])` constraint. (3) `staffName: sal.staffUid`: join the real staff name the same way R9 established for student names, resolving the fifth confirmed "raw ID instead of name" instance.
- **`W/server/jobs/contractExpiryJob.ts`** — TARGETED EDIT. Delete the inline raw-HTML email builder; call `notificationService.sendContractAlert()`/`contract-alert.ts`'s `renderContractAlert()` instead (already correctly built, zero callers today — the third confirmed instance of this exact pattern in the audit). Replace the hardcoded `'hr@school.edu.mw'` sender with the same `settingsService.getIdentitySettings()` source used elsewhere in this roadmap.
- **`W/server/services/forecastService.ts`** — MAJOR REWRITE of `projectExpenses()` and `projectFeeRevenue()` (the file's overall forecasting orchestration shape is unaffected). **Build-breaking fix, highest priority in this phase:** `projectExpenses()` selects a Prisma `Expense` field named `date`, which does not exist — correct to `incurredAt` (the real field, already used correctly by `reportExportService.buildExpenseSheet()` in the same phase). `projectFeeRevenue()`: fix the scope-blindness bug where the sum of *all* active fee structures is multiplied by the *total* active student count school-wide — a Form-4-only fee is currently applied as if charged to every student in every form. Rewrite to scope each fee structure's contribution to only the students in its actual applicable form/class/term before summing.
- **`W/server/routes/finances.ts`** — TARGETED EDIT (further edit on top of R9's changes to this file). Add `GET /forecast`, calling `forecastService.getCashFlowForecast()` — `ForecastPanel.tsx` has been calling this exact path since its own phase with no matching route anywhere in the Express app; this is the second confirmed "well-built UI, zero route" finding in the audit, after `payrollApprovalService.ts` above.
- **`W/server/services/reportExportService.ts`** — TARGETED EDIT. Correct the bucket used for Fee Collection and Expense Breakdown report uploads — currently all four report types upload under `STORAGE_BUCKETS.PAYSLIPS`, a semantically incorrect (though not functionally broken) choice; use a general reports bucket or the correct per-type bucket if one exists. Add `import 'server-only'`.
- **`W/server/services/receiptService.ts`** — TARGETED EDIT. `buildPayslipHtml()`'s hardcoded `"Pension (5%)"` label: derive the percentage shown from the same `SETTING_KEYS.FINANCE_PENSION_PERCENT` value `payrollService.ts` now reads (above), so the two can never silently disagree if the rate is ever changed.
- **`W/server/routes/finances.ts`** — MAJOR REWRITE of the Finance↔Library fine-settlement routes only (`PATCH /library-fines/:id/pay`, `PATCH /library-fines/:id/waive`, `POST /library-fines`). Remove the unsafe Prisma-and-Firestore dual write entirely; make Prisma the sole system of record for library fines (consistent with R6's Attendance decision — Firestore usage in this codebase has now been confirmed unsafe or incomplete everywhere it appears: attendance before R6, and library fines here, where `POST /library-fines` never even creates the Firestore document its own sibling routes assume exists). `PATCH .../pay`: correct the role list to `['finance','library']` (removing `admin`, who lacks `finance.clearLibraryFine`) and add the `accountingService` posting call that connects to the already-seeded "4300 Library Fine Revenue" account (the third confirmed revenue category, after tuition/R9 and payroll/above, that the chart of accounts anticipated but nothing ever posted to). `PATCH .../waive`: correct the role list to `['library']` only (`finance.waiveFine` is held exclusively by `library`; neither `admin` nor `high_rank` holds it at all). `GET /library-fines`: correct the role list to `['high_rank','finance','library']` (removing `admin`, adding `high_rank`).
- **`P/schema.prisma`** — TARGETED EDIT. Remove `LibraryFine.firestoreDocId` (no longer meaningful once Prisma is the sole system of record) or repurpose it only if R11 (Library domain) confirms an independent, still-needed Firestore reference elsewhere in the library workflow — R11 must explicitly confirm or refute this before the column is finalized as dead.
- **`W/server/services/libraryService.ts`** — TARGETED EDIT. `returnBook()`: remove the `LibraryFine.firestoreDocId = borrowingId` assignment now that Firestore is no longer part of this workflow.
- **`W/components/finances/LibraryFinesTab.tsx`** — TARGETED EDIT. Add the fine's associated student name to the display — today `studentId` exists on the interface but is never rendered in any form, the most severe variant of the "raw ID instead of name" defect family confirmed in this audit (absent entirely, not merely truncated).
- **`W/server/services/forecastService.test.ts`** — not fixed in this phase; deferred to R18 with every other broken test file.

### 3. CODE STRUCTURE FRAMEWORK

**`P/schema.prisma`** (extended enum, additive only):
```
enum PayrollStatus {
  PROCESSING
  PENDING_APPROVAL
  APPROVED
  LOCKED
  COMPLETED
  FAILED
}
```

**`W/server/services/payrollApprovalService.ts`** (rewritten signatures, real field names):
```
export async function submitForApproval(runId: string, submittedByUid: string): Promise<PayrollRun>
export async function approve(runId: string, approvedByUid: string): Promise<PayrollRun>
export async function lock(runId: string): Promise<PayrollRun>
  // on success: accountingService.postJournalEntry(...) for the payroll run total
export async function rollback(runId: string, reason: string): Promise<PayrollRun>
  // on success: accountingService's corresponding void/reversal entry
// all four operate on PayrollRun.totalGross / .totalNet / .month / .year / .runByUid —
// the real schema fields, not the fictional grossTotal/netTotal/period/totalStaff shape
```

### 4. DEPENDENCIES

Depends on **R9** — both phases apply the same `accountingService` reconnection pattern; `payrollApprovalService.ts`'s ledger call and the library-fines ledger call follow the shape R9 established for tuition payments. Depends on **R6** — the decision to remove Firestore from the library-fines workflow follows the same system-of-record reasoning R3/R6 applied to Attendance.

### 5. ACCEPTANCE CRITERIA

- `forecastService.ts` compiles with no TypeScript errors
- `GET /finances/forecast` returns real data; `ForecastPanel.tsx` no longer calls a nonexistent route
- A forecast for a school with a Form-4-only fee structure does not apply that fee to non-Form-4 students in its projection
- `POST /finances/payroll/runs/:id/submit-for-approval`, `.../approve`, `.../lock`, `.../rollback` all resolve to real, working routes
- Locking a payroll run produces a corresponding posting in the accounting ledger; rolling one back produces a corresponding reversal
- `PayrollApprovalPanel.tsx`'s rollback action is visible to `finance` and not to `admin`
- `payroll.ts`'s `GET /` succeeds for `high_rank` and returns `403` for `admin`
- A monthly payroll run interrupted mid-way (simulated failure) does not leave a permanently stuck `PROCESSING` record blocking retry
- Changing the PAYE brackets or pension percentage in Settings changes the next payroll run's actual computed deductions
- Marking a library fine paid succeeds without a Firestore call of any kind, and produces a ledger posting under the "4300 Library Fine Revenue" account
- `library` role can mark a fine paid or waived; `admin` alone (without also holding `finance`/`library`) cannot
- `LibraryFinesTab.tsx` displays a real student name for every fine
- No TypeScript errors in any touched file

---

## R11 — HR Domain: Loans UI, Leave-Conflict Wiring & Directory Access Correction

### 1. OBJECTIVE

HR is the one module in this audit where the underlying engineering is confirmed uniformly correct — zero schema field-name mismatches, and Firebase-UID handling that deliberately avoids the ID-mismatch bug affecting Student-facing features elsewhere — but three well-built capabilities never reach a user because their final connection is missing. Staff loan management is fully functional at the service, route, and hook layers, yet the UI actively tells users "Staff loan management will be available in Phase 6." A well-engineered, multi-factor leave-conflict detection engine and its purpose-built warning component both exist and have zero callers. And a genuine bug causes staff whose contracts expire soon to receive up to three duplicate alert emails per day. This phase makes the connections and fixes the bug; it does not need to touch the underlying business logic, which the audit confirmed is already sound.

### 2. CHANGE LIST

- **`W/app/(auth)/hr/page.tsx`** — MAJOR REWRITE of the Loans tab only (Directory, Leave Requests, and other tabs are edited separately below for unrelated reasons). Remove the "Staff loan management will be available in Phase 6" placeholder text. Build the admin-facing loan request/approve/disburse form using the already-correctly-built `useHR.ts` hooks (`useRequestLoan()` and its approve/disburse siblings, confirmed implemented but callerless) against the already-correct backend (`hrService.requestLoan()`/`approveLoan()`/`disburseLoan()`/`recordLoanRepayment()` and their route counterparts) — no backend or hook work is needed, only the missing form UI.
- **`W/server/services/hrService.ts`** — TARGETED EDIT, two fixes. (1) `reviewLeave()`: call `leaveConflictService.checkLeaveConflicts()` before persisting an `APPROVED` status transition, matching that function's own header comment describing exactly this intended call site — today a fully-built, multi-factor conflict engine (date overlap, team-coverage threshold, critical-role coverage) runs for no one. (2) `reviewLeave()`: call `notificationService.sendLeaveUpdate()` after a status change is persisted, so staff are actually emailed when their leave is approved or rejected — the fourth confirmed instance in this audit of a correctly-wired notification pipeline with zero business-logic caller. (3) `getContractExpiryAlert(daysAhead)`: replace the overlapping-range query (`gte: today, lte: today + daysAhead`) with exact-day matching, or de-duplicate by staff member across the three sequential `daysAhead=7,30,60` calls `contractExpiryJob.ts` makes in a single run — today any staff member expiring within 7 days matches all three windows and receives up to three duplicate emails every day until expiry. Add `import 'server-only'`.
- **`W/components/hr/LeaveConflictWarning.tsx`** — TARGETED EDIT. Wire this component into the leave-approval UI (`hr/page.tsx`'s Leave Requests tab) so `checkLeaveConflicts()`'s output — once the call above exists — is actually shown to the approving manager before they confirm. No change to the component itself; the audit confirmed it is already a model implementation (correct `role="alert"`/`role="status"` usage, `aria-hidden` on decorative icons) with the sole defect being that nothing ever renders it.
- **`W/server/routes/hr.ts`** and **`W/app/(auth)/hr/page.tsx`** — TARGETED EDIT. `GET /hr` (staff directory) and the Directory tab's visibility: restrict to `admin`/`high_rank`/`hr` per `hr.viewAnyProfile`'s actual grant — today all 8 non-student roles see the full staff directory (names, job titles, departments, employment status) with five of those roles (`finance`, `academic`, `library`, `lower_rank`, `exam_officer`) holding no formal permission for it at all.
- **`S/schemas/hr.ts`** — TARGETED EDIT. `CreateStaffSchema.role`: replace the unconstrained `z.string()` with `z.enum([...])` against the real 9-role union already used elsewhere in the codebase (`S/types/roles.ts` or equivalent), so an invalid role string is rejected at the API boundary rather than silently persisting.
- **`P/schema.prisma`** — TARGETED EDIT. `StaffProfile.role`: the column comment already documents the intended 9-role constraint; convert it to a real Prisma enum (matching the Zod fix above) rather than leaving both layers unenforced.
- **`W/app/(auth)/hr/page.tsx`** — TARGETED EDIT. `useContractAlerts(60)`: add a UI control (dropdown or similar) to adjust the alert window rather than a fixed, uneditable 60-day value — small addition, bundled here since the file is already open for the Loans/Directory work above.

### 3. CODE STRUCTURE FRAMEWORK

No NEW FILE in this phase; no MAJOR REWRITE beyond the Loans tab noted above. Binding shape for the two notification/conflict wiring fixes:

```
// W/server/services/hrService.ts — reviewLeave() (edit)
import { checkLeaveConflicts } from '@/server/services/leaveConflictService'
import * as notificationService from '@/server/services/notificationService'

export async function reviewLeave(leaveId: string, decision: 'APPROVED' | 'REJECTED', reviewerUid: string) {
  if (decision === 'APPROVED') {
    const conflicts = await checkLeaveConflicts(leaveId)
    // conflicts surfaced to caller/route response for LeaveConflictWarning.tsx to render;
    // this phase does not make conflicts blocking — they are a warning, not a hard stop,
    // consistent with the component's own "warning" framing
  }
  const updated = await prisma.leaveRequest.update({ where: { id: leaveId }, data: { status: decision, reviewerUid } })
  await notificationService.sendLeaveUpdate(updated)
  return updated
}
```

### 4. DEPENDENCIES

None at the file level against R1–R10 — HR's files (`hrService.ts`, `hr.ts`, `leaveConflictService.ts`, `hr/page.tsx`, `S/schemas/hr.ts`) are untouched by any prior phase. Sequenced here per the domain ordering in this roadmap's sequencing rules, not because of a code dependency.

### 5. ACCEPTANCE CRITERIA

- The Loans tab shows a real request/approve/disburse form, not a "coming in Phase 6" placeholder
- Submitting a loan request through the new UI succeeds end-to-end using the existing backend
- Approving a leave request that conflicts with team coverage shows `LeaveConflictWarning.tsx`'s output to the approving manager
- Approving or rejecting a leave request sends the staff member a real email
- A staff member whose contract expires in 5 days receives exactly one alert email per job run, not up to three
- `GET /hr` returns `403` for `finance`/`academic`/`library`/`lower_rank`/`exam_officer`; succeeds for `admin`/`high_rank`/`hr`
- Submitting an invalid role string to `POST /hr/staff` is rejected with a validation error, not silently persisted
- No TypeScript errors in any touched file

---

## R12 — Library Domain & the Storage API Contract Fix

### 1. OBJECTIVE

Phase 8C's direct `tsc --strict` compilation confirmed the single largest concentration of build-breaking errors found by any one file's audit in this engagement: seven files across five different domains call `W/lib/storage.ts`'s `uploadFile()` with a storage-bucket constant where the function requires a file-category prefix, and three files import a function named `getViewUrl` that does not exist in that module at all (the real, intended function is `getSignedViewUrl`). `libraryService.ts` alone accounts for two of the seven, and Library is otherwise the most defect-dense remaining domain in the audit — a redundant, irreparably schema-mismatched duplicate of its own live digital-resource functions, a second orphaned-but-well-built "Phase D" component pair, a permission constant that bakes an admin over-grant into five permissions simultaneously, and a confirmed vestigial Firestore field that finally closes the loop R10 left open pending this phase's direct confirmation. This phase fixes the storage-contract bug everywhere it appears — including in `examService.ts`, `hrService.ts`, `receiptService.ts`, `reportExportService.ts`, `exams.ts`, and `hr.ts`, all primarily addressed in earlier phases — because the bug is a single, mechanical, low-risk fix better done consistently in one phase than fragmented across five.

### 2. CHANGE LIST

- **`W/server/services/libraryService.ts`** — MAJOR REWRITE of the digital-resource and fine-lifecycle functions (borrowing/return core logic is otherwise correct and unaffected). Fix `uploadFile()`'s call to pass a real `FilePrefix` category (e.g. `'digital_resource'`) instead of the `STORAGE_BUCKETS.*` bucket constant it passes today. Fix `getDigitalResourceViewUrl()`'s import from the nonexistent `getViewUrl` to `getSignedViewUrl` — the correct choice per that function's own doc comment ("All sensitive file access must go through this"), not `getPublicViewUrl` (explicitly documented as forbidden for protected categories). `returnBook()`: remove the `borrowing.borrowerType === 'STUDENT'` gate on `LibraryFine` creation — staff borrowers currently accrue a computed `fineAmount` on the `Borrowing` row with no corresponding `LibraryFine` row ever created, meaning no finance-module consequence reaches them regardless of how overdue a book is; create the fine row for staff the same way it already does for students. Remove the `firestoreDocId = borrowingId` assignment (Phase 6A's own direct investigation confirmed this field has never corresponded to any real Firestore document anywhere in the codebase — it is a vestigial misnomer, not a live parallel system; this closes the open question R10 deferred to this phase). Add real handling for `markDamaged`/`markLost`: persist a real condition flag for `DAMAGED` (today it collapses to the identical `RETURNED` status as a clean return, with the condition silently dropped), and decrement `totalCopies` (not only `availableCopies`) on `LOST`, so `getLibraryStats().totalBooks` stops permanently overstating the collection by every unreplaced lost copy. Add `import 'server-only'`.
- **`W/server/services/reportExportService.ts`, `W/server/services/hrService.ts`, `W/server/services/receiptService.ts`, `W/server/services/examService.ts`** — TARGETED EDIT (a further edit to each, on top of R10's, R11's, R10's, and R7's respective changes to these same files). Fix each file's `uploadFile()` call(s) — `receiptService.ts` has two — to pass the correct `FilePrefix` category (`'report_export'`, `'staff_document'`, `'payslip'`/`'receipt'`, and `'report_card'` respectively) instead of a `STORAGE_BUCKETS.*` bucket constant.
- **`W/server/routes/exams.ts`, `W/server/routes/hr.ts`** — TARGETED EDIT (a further edit to each, on top of R7's and R11's respective changes). Fix each file's import of the nonexistent `getViewUrl` from `@/lib/storage` to `getSignedViewUrl`.
- **`W/app/api/files/[fileId]/route.ts`** — no code change required once the above call sites pass correct prefixes; noted here because this route's `__self` ownership-lookup branches (`fileId.startsWith('payslip_')`/`'report_card_'`) only start working as a direct, automatic consequence of the fixes above — every real `fileId` in production has been of the form `school_files_<id>` instead of `<category>_<id>` purely because of the bucket-vs-prefix bug, which silently defeated this route's per-category ownership checks and `canReadFile()`'s role-based defaults for every file, of every category, without exception.
- **`W/server/services/digitalResourceService.ts`** — DELETE. Confirmation of no remaining consumers: confirmed zero importers anywhere in the codebase at any layer (route, hook, or component); its five exports (`getResourceViewSession`, `uploadDigitalResource`, `approveDigitalResource`, `listDigitalResources`, `getTopViewedResources`) duplicate functionality `libraryService.ts` already implements live, under a field contract (`type: 'PDF'`, `year`/`examType`/`fileId`/`uploadedBy`) that does not match the real `DigitalResource` Prisma model at all.
- **`W/components/library/DigitalResourceViewer.tsx`** — TARGETED EDIT. Repoint this component — confirmed a model implementation (signed-URL TTL refresh, sandboxed iframe, anti-right-click overlay, full accessibility support) with its only defect being zero real importers — from the deleted `digitalResourceService.ts` to `libraryService.ts`'s live, now-fixed `getDigitalResourceViewUrl()`. Add a real entry point from the Library page's digital-resources list (below).
- **`P/schema.prisma`** — TARGETED EDIT. Remove `DigitalResource.approvedBy` (written only by the now-deleted `digitalResourceService.ts`); `approvedByUid` (written by the live `libraryService.ts`) becomes the sole field for this concept.
- **`W/server/services/libraryWorkflowService.ts`** — MAJOR REWRITE. This file's two workflows — `ResourceRecommendation` (create/approve/reject/list) and `FineWaiverRequest` (create/approve/reject/list) — are confirmed dead code with zero callers at any layer, and reference two fields that do not exist on `LibraryFine` (`balance`, and a `borrowing` relation). Rather than deleting a fully-designed, complete-cycle pair of workflows with genuine standalone value (a student/parent requesting a fine waiver, and a student recommending a new acquisition, are both real school-library needs not implemented anywhere else), this phase fixes the schema mismatch and wires the feature in: add the missing `borrowing` relation to `LibraryFine` (it already has a `borrowingId`-shaped foreign key concept per the audit; formalize it as a real Prisma relation) and compute `balance` as `amount - amountPaid` (or the equivalent real fields) rather than referencing a nonexistent stored column.
- **`W/server/routes/library.ts`** — TARGETED EDIT (route/permission corrections; the eBook-upload `multer` configuration is unaffected here, see R16). Add routes for the two now-repaired `libraryWorkflowService.ts` workflows (`POST/PATCH /recommendations`, `POST/PATCH /fine-waivers`), permission-gated appropriately (student-initiated create, staff-approved review). Correct the shared `LIB_STAFF = ['admin', 'library']` constant's use on `manageCatalog`/`issueBook`/`processReturn`/`uploadDigitalResource`/`approveDigitalResource` — all five are held by `library` alone per `PERMISSIONS_MAP.md`; this one shared constant currently bakes the admin over-grant into five permissions simultaneously, the sixth confirmed module exhibiting this exact pattern. Remove the redundant explicit re-listing of `'admin'` in `GET /stats`'s `requireRole([...LIB_STAFF, 'admin', 'high_rank'])` (`LIB_STAFF` already contains it). Add real role/permission gating to `GET /`, `GET /:id`, `GET /digital`, and `GET /digital/:id/view` — today none of the four has any restriction at all, meaning every role including `lower_rank` (explicitly excluded from `library.viewCatalog` per the permission matrix) can call them freely.
- **`W/app/(auth)/library/page.tsx`** — MAJOR REWRITE of the action-wiring and RoleGuard configuration (the catalog/search layout itself is unaffected). `RoleGuard.allowed`: add `finance` and `hr` (both hold `library.viewCatalog`/`viewDigitalResources`/`viewOwnBorrowings`/`viewOwnFines` per the permission matrix but are currently fully blocked from the page) and remove `lower_rank` (explicitly `–` for `library.viewCatalog` in the same table, but currently included). Wire the declared-but-unused `useIssueBorrowing()`/`useReturnBook()` instances' `.mutate` to real Issue/Return button click handlers — both hooks are correctly built and reach a fully live backend, but nothing in this file currently calls them. Add real `onSuccess` handling to `scanBarcode.mutate()` (today its result is fired and discarded, a dead end from the user's perspective — show the matched book and proceed into the issue flow). Add a real entry point (button/link per resource row) into `DigitalResourceViewer.tsx` (above). Add `<label>`/`aria-label` associations to the search and barcode inputs — deferred detail in R19, but the entry-point wiring above already requires touching this markup, so the minimal label fix is bundled here rather than reopening the file a second time (a targeted exception to this roadmap's general "a11y fixes wait for R19" rule, justified because the same lines are already being edited for a functional reason).
- **`W/server/services/settingsService.ts`, `W/components/settings/LibrarySettings.tsx`** — TARGETED EDIT. Add `SETTING_KEYS.LIBRARY_FINE_PER_DAY` and expose it in the existing `LibrarySettings.tsx` panel (which exists today but does not expose this value); `libraryService.ts`'s `FINE_PER_DAY_MWK = 50` constant is replaced with a read from this setting.
- **`W/server/jobs/overdueLibraryJob.ts`** — MAJOR REWRITE. Today this job calls only `markOverdueBorrowings()`, a bulk status flip with no per-borrower data assembly. Add the aggregation step that builds the `OverdueLibraryData` shape `notificationService.sendOverdueLibraryWarning()` requires (already correctly built and templated via `overdue-library.ts`'s `renderOverdueLibrary()`, for both pre-due-reminder and overdue-notice modes, with zero callers today), then call it per affected borrower — this is the fifth confirmed instance in the audit of a correctly-built notification pipeline never triggered, and uniquely required new aggregation logic rather than a one-line wiring fix.

### 3. CODE STRUCTURE FRAMEWORK

No NEW FILE in this phase. Binding shape for the storage-contract fix (applied identically at all seven call sites):

```
// Before, at every affected call site (libraryService.ts, reportExportService.ts,
// hrService.ts, receiptService.ts ×2, examService.ts):
await uploadFile(STORAGE_BUCKETS.PAYSLIPS /* or similar bucket constant */, fileBuffer, ...)

// After — a FilePrefix category, not a bucket constant:
await uploadFile('payslip' /* or 'report_card' | 'digital_resource' | 'report_export' | 'staff_document' */, fileBuffer, ...)

// Before, at all three affected import sites (libraryService.ts, exams.ts, hr.ts):
import { getViewUrl } from '@/lib/storage' // does not exist — TS2305

// After:
import { getSignedViewUrl } from '@/lib/storage'
```

### 4. DEPENDENCIES

Depends on **R7, R10, R11** — this phase makes a further, narrowly-scoped edit to `examService.ts` (R7), `reportExportService.ts`/`receiptService.ts` (R10), and `hrService.ts`/`hr.ts` (R11), all previously opened for unrelated reasons; implementation applies this phase's storage-contract fix on top of those already-modified files, not the pre-R7/R10/R11 originals. Depends on **R10** — this phase's confirmation that `LibraryFine.firestoreDocId` is vestigial is the direct resolution R10 flagged as pending.

### 5. ACCEPTANCE CRITERIA

- `libraryService.ts`, `reportExportService.ts`, `hrService.ts`, `receiptService.ts`, `examService.ts` all compile with no `TS2345` errors on any `uploadFile()` call
- `libraryService.ts`, `exams.ts`, `hr.ts` all compile with no `TS2305` error on any storage import
- A newly uploaded payslip/report-card/digital-resource file's `fileId` begins with its real category prefix, not `school_files_`
- A student or staff member can access their own report card/payslip through `W/app/api/files/[fileId]/route.ts`'s ownership branch, not only via an admin-only fallback
- `digitalResourceService.ts` no longer exists in the repository
- Viewing a digital library resource through the UI opens `DigitalResourceViewer.tsx` and succeeds
- A staff member with an overdue book accrues a real `LibraryFine` row, the same as a student would
- Marking a book `LOST` decrements `totalCopies`; `getLibraryStats().totalBooks` reflects the reduced count
- `finance` and `hr` roles can access the Library page; `lower_rank` cannot
- `GET /library/digital/:id/view` returns `403` for a role lacking `library.viewDigitalResources`
- Submitting a fine-waiver request or a resource recommendation through the UI succeeds end-to-end
- Scanning a barcode in the Library UI shows the matched book and allows proceeding to issue it
- An overdue borrower receives a real email with their specific overdue-item details, not a silent status-only update
- No TypeScript errors in any touched file

---

## R13 — Announcements, Timetable & Calendar Domain

### 1. OBJECTIVE

The entire announcement-creation pipeline has been silently non-functional since inception because of a single character-case mismatch: `AnnouncementForm.tsx` writes to the Firestore collection `'ANNOUNCEMENTS'` while every reader in the codebase queries the lowercase `COLLECTIONS.ANNOUNCEMENTS`, and the submitter's dialog closes as if the submission succeeded. Independently, `calendar.ts` calls `prisma.announcement.findMany()` against a Prisma model that does not exist at all — Announcements are genuinely Firestore-native — making this the tenth confirmed build-breaking TypeScript instance in the audit. This phase fixes both, consolidates Announcements onto a server-mediated write path so the five currently-unimplemented announcement permissions (create, createWithApproval, editOwn, publishDirect, schedule) can be properly enforced, closes the matching four-permission gap for a generic calendar-event capability that has never had any model/route/service/UI despite being granted to seven roles, and finishes the surviving half of Phase 3D's Timetable fixes that R6 did not reach (R6 deleted the orphaned duplicate `timetable.ts` router; this phase fixes the live `classes.ts`-nested route's remaining role-exclusion bug and the frontend page's unhandled-fetch defect).

### 2. CHANGE LIST

- **`W/components/announcements/AnnouncementForm.tsx`** — TARGETED EDIT. **Highest-priority single-line fix in this phase:** change the Firestore collection reference from the literal string `'ANNOUNCEMENTS'` to `COLLECTIONS.ANNOUNCEMENTS` (the shared constant every reader already uses). This one-character-case bug has made every announcement ever submitted through this form disappear into a collection nothing reads, with the submitter shown a false success state.
- **`W/server/routes/calendar.ts`** — MAJOR REWRITE of the announcement-source portion only (the other seven event-category sources are confirmed correct and unaffected). Replace `prisma.announcement.findMany(...)` (a build-breaking reference to a Prisma model that does not exist) with a Firestore query against `COLLECTIONS.ANNOUNCEMENTS`, matching the fix above and the reality that Announcements are Firestore-native, not Prisma-backed. Add the missing `'assignment'` event source — query `Assignment.dueDate` (with its `classId`/`class` relation) via Prisma, joining `W/server/routes/assignments.ts`'s domain (R6) — the `'assignment'` category already has a defined color and a rendered filter chip on the frontend with no backing data today. Add `import 'server-only'`.
- **`W/server/services/announcementService.ts`** — MAJOR REWRITE. This file's functions (`createAnnouncement`, `publishAnnouncement`, `listAnnouncements`) are correctly designed but currently dead — the live system bypasses them entirely via direct client-side Firestore reads/writes in `AnnouncementForm.tsx`/`useAnnouncements.ts`. This phase makes these functions the real, server-mediated write path instead, which is required to properly enforce the five currently-unimplemented permissions below (a client-side Firestore write has no way to enforce `createWithApproval` vs. `publishDirect` role distinctions without duplicating that logic into Firestore security rules, which this project does not otherwise rely on). Remove the hardcoded `limit(50)` in `listAnnouncements()` in favor of real cursor-based pagination now that this function has a live caller. Add `import 'server-only'`.
- **`W/server/routes/announcements.ts`** — MAJOR REWRITE. Add `POST /` (create), gated so `high_rank` reaches `announcement.create`/`publishDirect` directly while the other seven roles holding `announcement.createWithApproval` create a `PENDING` announcement instead — implementing the previously-entirely-unimplemented permission cluster (`create`, `createWithApproval`, `editOwn`, `publishDirect`, `schedule`; only `approve` and admin/high_rank-only `delete-any` existed before this phase). Add `PATCH /:id` for `editOwn`, ownership-scoped to the announcement's own author. `PATCH /:id/approve`: add `academic` to the role list (`['admin','high_rank']` today, excluding `academic` despite it formally holding `announcement.approvePublish` per the permission matrix — the third confirmed instance in this audit of a role excluded from a route despite holding the permission). Repoint `/:id/approve`'s inline reimplementation of publish logic to call `announcementService.publishAnnouncement()` instead, now that the service is the live path. Add a `scheduledFor` field/handling for `announcement.schedule` (`high_rank` only) — a straightforward "don't publish until" timestamp check, consistent with the complexity of every other fix in this phase.
- **`W/components/announcements/AnnouncementForm.tsx`** — TARGETED EDIT (a second, independent fix to this file, on top of the collection-name fix above). `canPublishDirectly`: remove `admin` (zero formal basis — holds none of `announcement.create`/`createWithApproval`/`publishDirect`) and add `student` (formally holds `announcement.createWithApproval` but is currently excluded from the create button entirely).
- **`W/app/(auth)/announcements/page.tsx`** — MAJOR REWRITE of the `canCreate` gate and list-query scope (the page's overall layout is unaffected). `canCreate`: apply the same admin-removal/student-addition fix as `AnnouncementForm.tsx` above. Add a "Pending Approval" tab/view for `admin`/`high_rank`/`academic` (the three roles holding `announcement.approvePublish`) — today `useAnnouncements.ts`'s only query filters to `status === 'PUBLISHED'`, so no approver has any UI surface to discover what is awaiting their action, independent of and in addition to the collection-name bug above.
- **`S/schemas/announcement.ts`** — NEW FILE (renamed/relocated). `AnnouncementSchema` is currently misfiled inside `@shared/schemas/student.ts`; move it to its own file. In the same change, reconcile the three currently non-reconciled audience/targeting vocabularies (`announcementService.ts`'s `targetAll`/`targetRoles`/`targetClassId`, the misfiled schema's `targetAll`/`targetRoles`/`targetClass`, and `announcement.ts`'s `AnnouncementAudience` enum `ALL`/`STAFF`/`STUDENTS`/`ACADEMIC`/`FINANCE`/`LIBRARY`/`HR`) into one shared type this file exports, consumed by all three call sites.
- **`W/server/templates/emails/announcement.ts`** — TARGETED EDIT. Use `base.ts`'s existing, exported, zero-caller `divider()` helper instead of the inline `<hr>`-row HTML reimplementation this template (and `overdue-library.ts`, R12) currently duplicates.
- **`W/server/services/hrService.ts` or `announcementService.ts`** (wiring only) — TARGETED EDIT. Call `notificationService.sendAnnouncementNotification()` from `publishAnnouncement()` once an announcement transitions to `PUBLISHED` — the sixth confirmed instance in this audit of a correctly-built, fully-templated notification pipeline with zero business-logic caller.
- **`P/schema.prisma`** — NEW MODEL. Add `CalendarEvent` (`id`, `title`, `description`, `startDate`, `endDate`, `category`, `createdByUid`, `createdAt`) — no generic calendar-event model exists anywhere despite `calendar.createEvent`/`editEvent`/`deleteEvent`/`manageAcademicCalendar` being formally granted to seven and two roles respectively per the permission matrix.
- **`W/server/services/calendarEventService.ts`** — NEW FILE. Exports `createEvent()`, `updateEvent()`, `deleteEvent()`, `listEvents()`, following the established service-file pattern (`import 'server-only'`, Prisma singleton, `auditService.log()` on mutations).
- **`W/server/routes/calendar.ts`** — TARGETED EDIT (a further edit to this file, on top of the announcement-source rewrite above). Add `POST /events`, `PATCH /events/:id`, `DELETE /events/:id`, gated by `requirePermission('calendar.createEvent')`/`'calendar.editEvent'`/`'calendar.deleteEvent'` respectively (`manageAcademicCalendar`, `admin`/`high_rank` only, governs term-date and academic-calendar-wide settings, distinct from individual event CRUD). Fix `WEEKDAY_TO_ISO`'s silent failure for any `TimetableSlot.day` value outside Monday–Friday — log a warning and surface the event with a best-effort date rather than silently dropping it, since Malawian secondary schools are not guaranteed to have zero Saturday classes.
- **`W/app/(auth)/calendar/page.tsx`** — TARGETED EDIT. Add a simple create/edit/delete dialog for calendar events, calling the new routes above. Fix `useCalendarEvents.ts` to distinguish a genuine fetch failure from an empty result set (today both collapse to an empty array with no error state); read and surface `isError` in this page. Add `aria-label` to the `EventDetailPanel` close button and `aria-pressed` to `CategoryChip` filter buttons — bundled here as a small addition since this file is already open for the create/edit/delete UI, rather than reopening it a second time for R19.
- **`W/server/services/settingsService.ts`** — TARGETED EDIT. Add a `SETTING_KEYS.TERM_DATES` entry (admin-configurable start/end dates per term) so `calendar.ts`'s `TERM_PERIODS` — the only source of term-date information for the school calendar itself, currently six hardcoded 2025/2026 literals — has a real configuration mechanism, consistent with the Grading/Promotion/Risk/Library-fine settings pattern established in R8/R12.
- **`W/server/routes/classes.ts`** — TARGETED EDIT (a further edit to this file, on top of R6's changes). `GET /:id/timetable`: add `finance`, `library`, `hr` to the role list — all three hold `timetable.view`'s universal grant per the permission matrix but are excluded from the one surviving timetable route (R6 already deleted the redundant, duplicate `timetable.ts` that exhibited the identical exclusion pattern).
- **`W/app/(auth)/timetable/page.tsx`** — TARGETED EDIT. Replace the raw `fetch()` call (zero error handling — a non-2xx response's error body is consumed as if it were valid data) with the R1-consolidated `apiFetch` and a proper `useQuery`-based hook. Add the missing `?? ''` fallback on the `NEXT_PUBLIC_API_URL` template literal (every other correctly-built call site in the codebase already has this).
- **`W/app/api/cron/*` and `W/server/routes/holidays.ts`** — cross-reference only, not a change in this phase: `holidays.ts`'s `hr.defineHolidays` role-exclusion gap (Phase 1B) remains tracked there; this phase's new `CalendarEvent` capability is a distinct, additive surface, not a replacement for the holidays endpoint.

### 3. CODE STRUCTURE FRAMEWORK

**`W/server/services/calendarEventService.ts`** (new — matches the established service pattern):
```
import 'server-only'
import { prisma } from '@/lib/prisma'
import * as auditService from '@/server/services/auditService'

export async function createEvent(input: CreateCalendarEventInput, createdByUid: string): Promise<CalendarEvent>
export async function updateEvent(id: string, input: UpdateCalendarEventInput): Promise<CalendarEvent>
export async function deleteEvent(id: string): Promise<void>
export async function listEvents(range: { start: string; end: string }): Promise<CalendarEvent[]>
```

**`S/schemas/announcement.ts`** (new — the single reconciled audience type):
```
export const AnnouncementAudienceSchema = z.enum(['ALL','STAFF','STUDENTS','ACADEMIC','FINANCE','LIBRARY','HR'])
export const AnnouncementSchema = z.object({
  title: z.string(), body: z.string(),
  audience: AnnouncementAudienceSchema,
  targetClassId: z.string().optional(),
  scheduledFor: z.string().datetime().optional(),
  // one shape, consumed by announcementService.ts, announcements.ts, and the form
})
```

### 4. DEPENDENCIES

Depends on **R6** — the new `'assignment'` calendar event source queries `Assignment.dueDate`, which R6 established, and the `classes.ts` timetable role-list fix is a further edit on top of R6's changes to the same file. Depends on **R1** — `timetable/page.tsx`'s rewritten fetch logic uses the R1-consolidated `apiFetch`.

### 5. ACCEPTANCE CRITERIA

- An announcement submitted through `AnnouncementForm.tsx` appears in the live announcements list within the same session — no vanishing submissions
- `calendar.ts` compiles with no reference to a nonexistent `prisma.announcement` model
- The school calendar shows assignment due dates as a distinct event category
- `student` sees the announcement create button; `admin` (absent any other qualifying role) does not
- `academic` can approve a pending announcement
- A "Pending Approval" view shows announcements awaiting action to `admin`/`high_rank`/`academic`
- Publishing an announcement sends a real notification to its target audience
- Creating, editing, and deleting a calendar event succeeds through a real UI, backed by a real model and route
- `finance`, `library`, `hr` can view a class's timetable
- `timetable/page.tsx` shows a real error state on a failed fetch instead of attempting to render an error payload as timetable data
- No TypeScript errors in any touched file

---

## R14 — Analytics & Reports Domain

### 1. OBJECTIVE

This phase fixes the single most severe defect confirmed anywhere in this audit: `hooks/useAnalytics.ts`'s entire content is the literal 34-character string `"apps/web/src/hooks/useAnalytics.ts"` — its own file path — not valid JavaScript or TypeScript at all. `reports/page.tsx` imports 34 named hooks from this file across nine import statements, so the entire 1,548-line Reports & Analytics page, used by all nine roles, fails to load in its entirety. This is also the cleanest fix in the audit: `analyticsService.ts` (1,446 lines, 30 functions) and `analytics.ts` (30 role-gated routes) are both confirmed fully correct against the real schema, so this page becomes fully functional the moment this one file is rewritten. Once it loads, this phase also fixes the largest single-phase concentration of the admin-over-grant pattern found anywhere in the audit (27 of 30 routes in `analytics.ts`, 6 of 9 in `reports.ts`), a universal permission (`report.export`, granted to all nine roles) with zero implementation at any layer, and several confirmed calculation bugs that silently show wrong numbers to real users. Sequenced last among the domain phases because several of its fixes — the attendance-percentage repoint and the library-inventory calculation — depend on data models R6 and R12 corrected.

### 2. CHANGE LIST

- **`W/hooks/useAnalytics.ts`** — MAJOR REWRITE (this file is currently not valid source code at all, so "rewrite" here means writing it from scratch against its confirmed-correct backend). Implement all 34 named hooks `reports/page.tsx` imports, each a thin TanStack Query wrapper over the corresponding `analytics.ts` route, following the exact pattern established in `useStudents.ts`/`useClasses.ts` post-R1 (imports `apiFetch`/`queryKeys` from `@/lib/api-client`, no local reimplementation).
- **`W/server/routes/analytics.ts`** — TARGETED EDIT, a full role-list correction sweep. Narrow the 27 of 30 routes that over-grant `'admin'` relative to `PERMISSIONS_MAP.md`'s report domain to their correct role lists. On `/school/performance-trend` and `/school/class-comparison`: add `exam_officer` (excluded on both despite formally holding the permission) and `academic` (also excluded on `/school/class-comparison`). `/student/*` routes: today `admin`/`high_rank`(/`finance` for the fee-statement variant) can pass an arbitrary `studentId` and retrieve any student's data, with no permission in the matrix formally covering that capability for those roles — add a new permission, `report.viewAnyStudentPerformance` (below), rather than removing oversight capability the school plausibly needs; gate these routes on it explicitly instead of leaving the capability unaccounted for.
- **`W/server/routes/reports.ts`** — TARGETED EDIT, the matching sweep for this file. Narrow the 6 of 9 over-granting routes. `GET /audit`: add `high_rank` (excluded today despite `PERMISSIONS_MAP.md` granting `report.viewAuditLogs` to both `admin` and `high_rank` — the reverse-direction violation in this file, distinct from its own admin-over-grant pattern elsewhere). `GET /exam-officer`: add `high_rank` (the one route in either file that excludes a role included on every comparable sibling route). `/student/*`: same `report.viewAnyStudentPerformance` fix as `analytics.ts` above.
- **`S/types/permissions.ts`** — TARGETED EDIT. Add `report.viewAnyStudentPerformance`, granted to `admin`/`high_rank`/`finance` (the roles the routes above already serve in practice) — formalizing a capability the school plausibly needs rather than removing it outright, since arbitrary-student-lookup-by-staff is a standard oversight function, unlike the over-grant instances elsewhere in this audit where the correct fix was narrowing enforcement to match a deliberately-curated matrix.
- **`W/server/services/analyticsService.ts`** — MAJOR REWRITE of five specific functions (the file's other 25 functions are confirmed correct and unaffected). `getHighRankFinancialSummary()`: replace the hardcoded `payroll: 0` with the same real `PayrollRun.totalNet` query `getFinanceCashFlow()` already performs correctly for the identical metric, and include it in the net calculation — today `high_rank`, the more senior role, sees a silently wrong number for the same business question `finance` sees correctly. `getLibraryInventoryHealth()`: fix `borrowedCopies = totalCopies − availableCopies − overdueCount` — `overdueCount` is a subset of currently-borrowed copies, not a separate additive category, so subtracting it under-counts genuinely-borrowed books; also net out `lostCopies` (queried but never subtracted), compounding R12's `totalCopies`-decrement fix. `getFinanceBudgetVsActual()`: resolve the join-key mismatch between `Budget`'s free-text category field (unconstrained per `CreateBudgetSchema`) and the `ExpenseCategory` enum `Expense` actually uses — constrain `Budget.category` to the same enum (schema fix, below) so this function stops silently falling back to the stale cached `Budget.spent` value on virtually every real budget. `getStudentPerformanceTrend()`: repoint `attendancePct`'s computation from the dead `TermResult.attendanceDays`/`absentDays` columns (confirmed to have no write path anywhere, guaranteed always `0`) to the real `Attendance` model R6 introduced. `getTeacherEffectivenessMatrix()`: compute `subjectCount` for real instead of the hardcoded `0`. Add `import 'server-only'`.
- **`P/schema.prisma`** — TARGETED EDIT. Constrain `Budget.category` to the `ExpenseCategory` enum (currently free text with no enforced relationship), resolving the join-key mismatch above at its source.
- **`W/server/services/reportService.ts`** — TARGETED EDIT. `getAcademicReport(teacherUid, academicYear)`: add the missing `teacherId: teacherUid` constraint to its `prisma.class.findMany()` call — despite the function's own comment stating "Teacher sees their own classes' performance," it currently returns the entire school's class performance to any `academic`-role caller, inconsistent with `analyticsService.ts`'s correctly-scoped `getAcademicClassSubjectPerformance()`/`getAcademicAssignmentCompletion()` for the identical framing. `getHRReport()`: replace the hardcoded 60-day contract-expiry lookahead with the same admin-configurable source R11 established for `useContractAlerts(60)`, so the two independent hardcodings of the same window cannot silently drift apart.
- **`W/app/(auth)/reports/page.tsx`** — MAJOR REWRITE of the tab-wiring and export-affordance only (the page's overall structure/layout is unaffected). Wire the seven currently-orphaned `useReports.ts` hooks (`useSchoolReport`, `useFinanceReport`, `useLibraryReport`, `useHRReport`, `useAcademicReport`, `useExamOfficerReport`, `useStudentReport`) into real tabs for their respective roles — only `useAdminReport` and `useAuditLog` are consumed today, despite `ROLE_TABS` already defining a tab set for every role. Implement the `Download` icon's export action (`report.export`, the only permission in the entire report domain granted to all nine roles, with zero implementation anywhere before this phase) — a CSV export of the currently-viewed report's tabular data is sufficient to satisfy the permission's grant; a full PDF-per-report-type pipeline is not required for this phase. Wire `analyticsService.getAcademicMarksDistribution()`/`getManebCandidateList()` (fully built, role-gated, zero frontend consumer) into the `academic`/`exam_officer` tabs respectively.
- **`W/server/routes/analytics.ts`, `reports.ts`** — TARGETED EDIT. Add endpoints for `report.viewScholarshipSummary` (`high_rank`+`finance`) and `report.viewAttendanceSummary`/`viewOwnAttendance` (5 roles + `student`) — both formally granted in the permission matrix with no implementation found anywhere in this module.

### 3. CODE STRUCTURE FRAMEWORK

**`W/hooks/useAnalytics.ts`** (full rewrite — representative pattern, repeated across all 34 hooks):
```
import { useQuery } from '@tanstack/react-query'
import { apiFetch, queryKeys } from '@/lib/api-client'

export function useSchoolPerformanceTrend(params: { academicYear: string }) {
  return useQuery({
    queryKey: queryKeys.analytics.schoolPerformanceTrend(params),
    queryFn: () => apiFetch(`/analytics/school/performance-trend?academicYear=${params.academicYear}`),
  })
}
// ... remaining 33 hooks, one per analytics.ts/reports.ts endpoint this file
// is confirmed to need, each following this exact shape — no local apiFetch,
// no local token handling, matching R1's established convention exactly.
```

### 4. DEPENDENCIES

Depends on **R1** — every rewritten hook in `useAnalytics.ts` is written directly against the R1-consolidated `api-client.ts`. Depends on **R6** — `getStudentPerformanceTrend()`'s attendance repoint requires the `Attendance` model R6 introduced. Depends on **R12** — `getLibraryInventoryHealth()`'s fix builds on R12's `totalCopies`/`LOST` handling. Depends on **R9** — `getHighRankFinancialSummary()`'s payroll figure and `getFinanceBudgetVsActual()`'s expense join both assume the ledger/expense data R9's accounting reconnection makes trustworthy.

### 5. ACCEPTANCE CRITERIA

- `reports/page.tsx` loads successfully for all nine roles with no import-resolution error
- `useAnalytics.ts` is valid, compiling TypeScript exporting exactly the 34 hooks `reports/page.tsx` imports
- `admin` receives `403` on the 27 (`analytics.ts`)/6 (`reports.ts`) routes it no longer formally qualifies for; `exam_officer` and `academic` succeed on the routes that previously excluded them
- `GET /reports/audit` succeeds for `high_rank`
- The `high_rank` Finance tab and the `finance` Cash Flow tab show the same net figure for the same period
- A library inventory health report's borrowed-copy count does not double-subtract overdue books
- A budget-vs-actual report reflects live expense data, not a stale cached value, for a budget using a real `ExpenseCategory` value
- A student performance trend report shows a real, non-zero attendance percentage for a student with recorded `Attendance` rows
- `GET /reports/academic` for a specific teacher returns only that teacher's classes
- Every role's dedicated report tab renders real data via its own hook, not only the admin/audit-log tabs
- Clicking the export/download action on any report produces a real CSV file
- No TypeScript errors in any touched file

---

## R15 — UI/UX Polish: Shared Components, Dashboards, Confirmation Dialogs & Data-Display Consistency

### 1. OBJECTIVE

This phase fixes the shared UI-kit layer every other phase's frontend work sits on top of (`DataTable.tsx`, `ModuleTabs.tsx`, `MotionBottomSheet.tsx`, `PageHeader.tsx`), rebuilds the role-specific dashboards — currently an empty shell with zero backend wiring for eight of nine roles, littered with dead sub-route links — and closes a cross-cutting gap this roadmap has deliberately deferred from every earlier domain phase: no destructive or financially-consequential action anywhere in the app (deleting a holiday, bulk-archiving students, finalizing exam marks, generating invoices, running payroll, waiving a library fine) has a real confirmation step. It is sequenced after every domain phase because it deliberately touches files across all of them one more time, applying one consistent shared component rather than fragmenting the fix into each domain phase individually.

### 2. CHANGE LIST

- **`W/components/shared/DataTable.tsx`** — MAJOR REWRITE of the sorting and filter-chip subsystems only (row rendering, column configuration, and pagination-prop plumbing are unaffected). Add a real `onSort` callback to `DataTableProps` so server-paginated datasets can request a server-side sort instead of the current client-side `useMemo` over only the currently-visible page (today, sorting a 100+ row server-paginated table sorts only the page in view) — every domain phase's list view that supplies more than one page of data (Students, Invoices, Payroll, Library catalog) passes this new callback through to its existing list query's sort parameter. Either wire `activeChips` to a real external filter API or remove it and its associated dead render block entirely — it is currently local state with no setter any consumer can reach. Move `TBODY_STAGGER`/`TR_VARIANTS` into `W/lib/motion.ts` as named exports, consistent with every other shared motion constant.
- **`W/components/shared/ModuleTabs.tsx`** — TARGETED EDIT. Extract the identical scroll-container CSS string, currently duplicated between the underline and pill variant return blocks, into one shared constant or a small wrapper component.
- **`W/components/shared/MotionBottomSheet.tsx`** — TARGETED EDIT. Implement the `inert` attribute application the component's own JSDoc already documents for its `trapFocus` prop but never applies — today a keyboard user can Tab out of an open sheet despite the documented intent. Extract the two nearly-identical titled/untitled close-button `motion.button` elements into one shared `CloseButton` sub-component.
- **`W/store/themeStore.ts`, `W/components/shared/ModeToggle.tsx`** — TARGETED EDIT. `ModeToggle.tsx`'s `setTheme()` call only ever updates `next-themes`, never `themeStore.setMode()`, so `themeStore.mode` permanently drifts from the actually-applied theme after the first user change. Remove `themeStore`'s `mode` field and `setMode` action entirely — `next-themes` is already the sole authoritative theme source in this codebase, and maintaining a second, structurally-unreachable copy in Zustand only invites exactly this class of drift.
- **`W/components/shared/PageHeader.tsx`** — MAJOR REWRITE of the notification-display and search-overlay portions (the overall header layout/navigation structure is unaffected). Replace `MOCK_NOTIFICATIONS` (3 hardcoded fake entries) and the hardcoded `unreadCount=2` with a real query against the notification system every other phase in this roadmap has been reconnecting (FCM/Resend pipelines from R11–R13) — the header bell should reflect real unread notifications, not a permanent fake count shown to every user in production. Replace the hardcoded `CURRENT_TERM = 'Term 1 — 2025/2026'` badge with `SETTING_KEYS.CURRENT_ACADEMIC_YEAR` (already exists, simply unread here). Fix `handleSignOut`'s redirect target from `router.push('/')` to `router.push('/login')`, matching every other sign-out path in the codebase. Fix `MobileSearchOverlay`'s reduced-motion bug — it passes `reducedMotionVariants`/`reducedMotionTransition` as function references where Framer Motion expects resolved objects, silently breaking the reduced-motion path entirely. Replace the fourth independent `ROLE_LABELS` map declaration (also present in `Sidebar.tsx`, `MobileBottomNav.tsx`, `S/types/roles.ts`) with an import from the shared source. De-duplicate the nearly-identical `panelVariants`/`backdropVariants`/`panelTransition`/`backdropTransition` blocks defined twice in this file. Remove the dead `query` state in `MobileSearchOverlay` (set and reset but never read).
- **`W/components/dashboards/*.tsx`** (all nine role dashboards) — MAJOR REWRITE of the stat-card data-wiring and quick-action link targets only (each dashboard's overall visual layout is unaffected). Wire every stat card's permanently-`"—"` placeholder value to the real, already-built analytics/domain endpoint for that figure — `FinanceDashboard.tsx` already does this correctly and is the pattern to replicate for the remaining eight. `FinanceDashboard.tsx`'s own `useFinanceSummary` hardcoded `'2025/2026'`/term `1`: replace with `SETTING_KEYS.CURRENT_ACADEMIC_YEAR`. Fix every dead quick-action `href` confirmed in this audit: `HRDashboard`'s `/hr/leave` and `/hr/staff/new` (HR is tab-based at `/hr` only), `LibraryDashboard`'s `/library/issue`/`/library/return`, `AcademicDashboard`/`ExamOfficerDashboard`'s `/exams/marks`/`/exams/results`/`/exams/maneb` (Exams is tab-based at `/exams`), and `AdminDashboard`'s `/user-management/new` (creation is in-page at `/user-management`) — each corrected to the real in-page tab/anchor it should have pointed to all along. `StudentDashboard.tsx`: remove the always-visible fee-gate notice banner in favor of the real balance check R9 established; resolve the `studentId={user.uid}` Firebase-UID pass-through the same way R7/R8 fixed it for `StudentResultsView.tsx`; remove the unused destructured `role` variable. `AdminDashboard.tsx`: move the `PlaceholderWidget` component it currently defines and exports (imported by all eight other dashboards from this file) to `W/components/shared/PlaceholderWidget.tsx`; de-duplicate the "System Health" and "Users" quick actions, which currently both link to `/user-management`. `HighRankDashboard`/`LowerRankDashboard`: use distinct icons for the adjacent "Total Students"/"Total Staff" stat cards (both currently render the identical `Users` icon). `AcademicDashboard.tsx`: stop misusing `StatCardGrid` as a generic page wrapper around `QuickActions`/`PlaceholderWidget` children, which unintentionally applies the grid's stagger animation to non-grid content. `dashboard/page.tsx`: replace the relative (`../../../`) import paths for all nine dashboards with the `@/` alias used everywhere else in the codebase.
- **`W/components/shared/ConfirmDialog.tsx`** — NEW FILE. A single, accessible, reusable confirmation dialog (real focus trap, `Escape`-to-cancel, default focus on the non-destructive action) to replace both the ad-hoc `window.confirm()` call in `ExamGradingSettings.tsx`'s `handleReset()` (a blocking, non-accessible browser dialog) and the complete absence of any confirmation step on every other destructive/financial action identified in this audit. Applied to: `HolidaysManager.tsx`'s delete action (a misclick currently permanently deletes a holiday with no step in between), the Students list's bulk-archive action (fires immediately on trigger), `MarksEntrySheet.tsx`'s "Finalize Marks" action (a one-way, exam-locking operation), `BulkInvoiceGenerator.tsx`'s "Generate Invoices" action (a potentially large bulk-write), `PayrollTab.tsx`'s "Run Payroll" action (a significant, financially-consequential bulk action), and `LibraryFinesTab.tsx`'s "Waive Fine" action (financially consequential and irreversible, and — per R12 — currently has no `onError` handler either; add one in the same change).
- **`W/app/(auth)/applications/page.tsx`** — TARGETED EDIT (further edit on top of R5's changes). Add real pagination to the applications list — today `listApplications` returns every application matching the status filter in one unbounded query, and an empty result set renders a bare table with headers and no empty-state message.

### 3. CODE STRUCTURE FRAMEWORK

**`W/components/shared/ConfirmDialog.tsx`** (new — single shared implementation for every destructive action listed above):
```
export interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string  // default "Confirm"
  destructive?: boolean  // styles the confirm button as destructive when true
  onConfirm: () => void
  onCancel: () => void
}
export default function ConfirmDialog(props: ConfirmDialogProps) {
  // real focus trap (the same `inert`-based approach MotionBottomSheet.tsx
  // gains in this phase), Escape → onCancel, default focus on Cancel
  // (never on the destructive action), aria-describedby linking title/description
}
```

**`W/components/shared/DataTable.tsx`** (added prop, additive to the existing interface):
```
interface DataTableProps<T> {
  // ...existing props unchanged
  onSort?: (column: string, direction: 'asc' | 'desc') => void
  // when supplied, header-click dispatches here instead of the local
  // useMemo-based client-side sort; callers pass this through to their
  // existing list query's own sort parameter
}
```

### 4. DEPENDENCIES

Depends on **every prior domain phase (R5–R14)** — the `ConfirmDialog` component is applied to specific actions each of those phases built or fixed, and the dashboard rewrite wires each stat card to the specific analytics/domain endpoints those phases corrected. Depends on **R1** — every dashboard query is written against the R1-consolidated `api-client.ts`.

### 5. ACCEPTANCE CRITERIA

- Sorting a server-paginated `DataTable` instance re-queries the server, not only the current page's visible rows
- Deleting a holiday, bulk-archiving students, finalizing marks, generating invoices, running payroll, and waiving a library fine each require an explicit confirmation step before the action executes
- Toggling theme no longer leaves `themeStore.mode` in a stale state (the field no longer exists)
- The header notification bell reflects a real unread count, not a permanent hardcoded `2`
- Signing out from the header lands on `/login`
- Every dashboard's stat cards show real data, not a permanent `"—"` placeholder, for at least one role beyond Finance
- None of the previously-dead quick-action links across any dashboard produce a `404`
- The Applications list shows a real empty state when no applications match the filter, and paginates rather than returning an unbounded result set
- No TypeScript errors in any touched file

---

## R16 — Constants Centralization (Phase 10B Plan)

### 1. OBJECTIVE

This phase executes Phase 10B's constants-centralization plan in full: it resolves every item in `CROSS_hardcoded.md` not already fixed as a direct correctness bug earlier in this roadmap, restructures `S/constants/malawi.ts` into a focused multi-file directory, and creates eleven new shared-constant files. It is sequenced after every domain phase (R5–R15) rather than before, deliberately — most of its target files were already opened once by an earlier phase for a functional bug fix, and this phase's edits are additive (import-path changes and new shared exports) rather than further behavioral changes, so doing it last avoids merge friction against phases that are still landing real logic changes. Three value families are the highest-priority items: the school-identity fallback strings (ten files independently hardcode a different name/address/phone/founding-year for the same school, with two directly conflicting founding years and two conflicting addresses already confirmed), the per-page role-access lists (`navigation.ts` and `proxy.ts` independently hand-maintain the same role-per-page mapping, one level up the stack from this audit's #1 systemic over-grant finding), and the PAYE/pension figures (three independent copies of the same tax data).

### 2. CHANGE LIST

- **`S/constants/malawi/`** — RENAME (directory restructure). `S/constants/malawi.ts` → `S/constants/malawi/index.ts` (barrel re-export preserving the flat `@shared/constants/malawi` import surface) plus eight new focused files: `districts.ts` (`MALAWI_DISTRICTS`, `MalawiDistrict`, `MALAWI_REGIONS`, unchanged), `holidays.ts` (redesigned, below), `academic.ts` (new helpers, below), `currency.ts` (`formatMWK` unchanged, plus new `CURRENCY_CODE`/`CURRENCY_SYMBOL`), `subjects.ts` (`MALAWI_SUBJECTS`, unchanged), `finance.ts` (new, below), `identity.ts` (new, below), `registration.ts` (`generateRegistrationNo`, unchanged). `COLLECTIONS`/`SCHOOL_BUCKET_ID`/`STORAGE_BUCKET_IDS` relocate out to the new `S/constants/storage.ts` (below) — these are Firestore/Appwrite infrastructure naming, not Malawi-regional data. A codebase-wide import-path sweep updates every consumer of `@shared/constants/malawi`'s relocated exports.
- **`S/constants/malawi/holidays.ts`** — NEW FILE (replacing the flat, year-pinned `MALAWI_PUBLIC_HOLIDAYS_2026`). Fixed-date holidays (New Year's Day, John Chilembwe Day, Martyrs' Day, Labour Day, Kamuzu Day, Freedom Day, Independence Day, Mother's Day, Christmas Day, Boxing Day) as month/day templates, matching the existing `ACADEMIC_TERMS` convention; movable holidays (Good Friday, Easter Monday) computed via a standard Easter-date (Computus) algorithm rather than re-typed annually. Exports `getPublicHolidaysForYear(year: number)`, the single function every consumer calls, replacing the flat array entirely.
- **`S/constants/malawi/academic.ts`** — NEW FILE. Pure, year-agnostic calculation logic only — never itself stores "the current academic year" (that value lives solely in `SETTING_KEYS.CURRENT_ACADEMIC_YEAR`, fetched at runtime). Exports `ACADEMIC_TERMS` (retained), `getTermDatesForYear(academicYear)` (replaces `calendar.ts`'s `TERM_PERIODS` and `calendar/page.tsx`'s hardcoded `dateRange` initial state — both from R13), `getCurrentTerm(date, academicYear)` (replaces `PageHeader.tsx`'s `CURRENT_TERM` literal from R15 and informs `classes/[id]/page.tsx`'s term selector from R6), `getAcademicYearOptions(currentYear, opts?)` (replaces every hardcoded year-array: `HolidaysManager.tsx`'s `[2025,2026,2027,2028]`, `apply/page.tsx`'s `['2026','2027','2028']`, `reports/page.tsx`'s `PREV_YEARS`), `FORM_LEVELS` (replaces every hardcoded `[1,2,3,4]`/`['Form 1'..'Form 4']` array across `apply/page.tsx`, `StudentFormSections.tsx` (R5), `classes/page.tsx` (R6), folding in `classes/page.tsx`'s separately-hardcoded `FORM_COLORS`), and `getMaxPublishedYear()` (replaces `S/schemas/library.ts:9`'s hardcoded `2030` bound).
- **`S/constants/malawi/finance.ts`** — NEW FILE. `DEFAULT_PAYE_BRACKETS` (single source resolving three independent copies: `S/types/settings.ts`, `payrollService.ts`'s inline brackets from R10, and this file), versioned with `source`/`effectiveFrom`/`lastVerified` fields (an explicit staleness marker absent from every current copy); `PENSION_RATE = 0.05`; `LATE_PAYMENT_PENALTY_DEFAULT = 0.05` (resolving the `0.05`-vs-`'5'` decimal/percent-string unit mismatch between `latePenaltiesJob.ts`/`feeService.ts` and `FinanceSettings.tsx`'s setting default).
- **`S/constants/malawi/identity.ts`** — NEW FILE. `DEFAULT_SCHOOL_IDENTITY` (`name`/`address`/`phone`/`email`/`foundedYear`) as an explicit last-resort fallback only — the authoritative values always come from `settingsService.getIdentitySettings()`/`getSchoolBranding()` at runtime. Resolves ten independently-hardcoded, mutually-inconsistent copies of the same school-identity data across `userManagementService.ts`, `notificationService.ts`, `public.ts` (R5), `reportCardService.ts`/`transcriptService.ts` (R8), `examService.ts`, `AuditLogViewer.tsx`, `email.ts`, `app/layout.tsx`, and `firebase-messaging-sw.js` — including two directly conflicting founding years (`1979` vs. `1990`) and two conflicting addresses (`P.O. Box 1` vs. `P.O. Box 123`).
- **`S/constants/storage.ts`** — NEW FILE (relocated from `malawi.ts`). `COLLECTIONS`, `SCHOOL_BUCKET_ID`, `STORAGE_BUCKET_IDS` (Firestore/Appwrite infrastructure naming). Fixes `payroll.ts:43`'s orphaned `'sms-payslips'` bucket-name literal (matches no real constant) and the independently-duplicated `VIEW_TTL_SECS`/`VIEW_URL_TTL_SECS` in `DigitalResourceViewer.tsx`/the deleted `digitalResourceService.ts` (R12) into one `VIEW_URL_TTL_SECS` export.
- **`S/constants/countries.ts`** — NEW FILE. `Country` interface (`code`, `name`, `callingCode?`); `COUNTRIES` (full ~195-entry ISO 3166-1 list, alphabetical, replacing `apply/page.tsx`'s 24-entry and `StudentFormSections.tsx`'s 13-entry independent lists — the latter a strict subset, so this is a UX completeness upgrade, not only a refactor); `DEFAULT_COUNTRY_CODE = 'MW'`; `getCountriesForForm(defaultCode?)` (Malawi pinned first, then alphabetical); `COUNTRY_CALLING_CODES` (derived from `COUNTRIES` at module load, replacing `apply/page.tsx`'s separately-maintained 10-entry `COUNTRY_CODES`).
- **`S/constants/admissions.ts`** — NEW FILE. `GUARDIAN_RELATIONSHIPS` (9 entries, moved from `apply/page.tsx`) — kept separate from `malawi/` since guardian-relationship categories are admissions-domain data, not a Malawi-regional fact.
- **`S/constants/exams.ts`** — NEW FILE, grading-boundary values explicitly excluded (see below). `EXAM_TYPE_LABELS` (moved from `ExamGradingSettings.tsx`); `EXAM_TYPES` (moved from `ExamForm.tsx`, the third independent encoding of the same seven exam-type strings, keyed the same way as `EXAM_TYPE_LABELS`). **Explicitly not included in this phase:** `PrintableReportCard.tsx`'s `GRADE_SCALE`, `examService.ts`'s `MSCE_GRADES`/`JCE_GRADES` (both already retired in R7/R8), and `gradeService.ts`'s `GradingScale` are the grading-boundary reconciliation R7/R8 already completed by making `gradeService.ts` the sole authority — this phase does not re-litigate that decision, it only centralizes the exam-type labels/list that were never part of it.
- **`S/constants/notifications.ts`** — NEW FILE. `NOTIFICATION_EVENT_TYPES` (replacing `NotificationSettings.tsx`'s inline `ALL_PREFS`); `ROLE_NOTIFICATION_PREFS` (replacing its inline `ROLE_PREFS`); `FCM_TOPICS` including a `classTopicId(classId)` builder (replacing `push.ts`'s inline topic-name strings). In the same change, reconcile the count mismatch this centralization surfaces: `S/schemas/admin.ts`'s `NotificationPrefSchema` has nine boolean fields while `NotificationSettings.tsx`'s `ALL_PREFS` has only eight — `NOTIFICATION_EVENT_TYPES` becomes the single list both derive from, forcing resolution of the missing/extra entry.
- **`S/constants/audit.ts`** — NEW FILE. `AUDIT_ENTITY_TYPES` (28 Prisma model names, moved from `AuditLogViewer.tsx`); `AUDIT_SEVERITY_CONFIG`; `AUDIT_DEFAULT_PAGE_SIZE = 25`, `AUDIT_MAX_PAGE_SIZE = 100` (moved from `auditService.ts`).
- **`S/constants/pendingActions.ts`** — NEW FILE. `PENDING_ACTION_LABELS`, `PENDING_ACTION_STATUS_CONFIG` (both moved from `PendingActionsPanel.tsx`); `PENDING_ACTION_REVIEWER_ROLES` (moved from `pendingActionService.ts`'s inline `REVIEWER_ROLES`).
- **`S/constants/breakpoints.ts`** — NEW FILE. `LG_BREAKPOINT = 1024` (moved from `Sidebar.tsx`); `MOBILE_BREAKPOINT = 768` (moved from `use-mobile.ts`).
- **`S/constants/thresholds.ts`** — NEW FILE. Consolidates the "fixed business threshold with no admin-configuration mechanism" family: `RISK_THRESHOLDS` (moved from `riskService.ts`, R8) and `RISK_LEVEL_CONFIG` (moved from `StudentRiskBadge.tsx`, kept together since a risk badge's colour and its numeric boundary are one cohesive concept); `LEAVE_CONFLICT_THRESHOLDS` (moved from `leaveConflictService.ts`, R11); `LIBRARY_FINE_PER_DAY_MWK` (moved from `libraryService.ts`, R12 — also resolves a flagged inconsistency where `LibrarySettings.tsx`'s admin-facing default for the same concept was a completely different, independently-hardcoded value); `CONTRACT_EXPIRY_LOOKAHEAD_DAYS` (single constant resolving both `hr/page.tsx`'s and `reportService.ts`'s independent 60-day windows, R11/R14); `SEARCH_RESULT_LIMIT_PER_ENTITY` (moved from `search.ts`, R4); `ANNOUNCEMENT_PAGE_LIMIT` (moved from `announcementService.ts`, R13); `RATE_LIMIT_TIERS` (moved from `ratelimit.ts`, R4).
- **`S/constants/pageAccess.ts`** — NEW FILE, high priority. `PAGE_ACCESS: Record<pagePath, UserRole[]>` — the single source both `navigation.ts` and `proxy.ts`'s `PAGE_ROLES` (R1/R3) import from, rather than two independently hand-maintained per-page role lists one level up the stack from this audit's central admin-over-grant finding.
- **`W/lib/motion.ts`** — TARGETED EDIT (existing file, web-app-local, not `packages/shared`). Add missing named entries to the established `SPRING`/`DURATION` pattern: `SPRING.tabIndicator` (from `ModuleTabs.tsx`), `SPRING.filterPanel`/`SPRING.mobileSheet` (from `DataTable.tsx`, R15), `DURATION.tableRowStagger` (from `DataTable.tsx`'s `TBODY_STAGGER`, R15), `SPRING.closeButton` (from `MotionBottomSheet.tsx`, R15 — also resolves `MobileBottomNav.tsx`'s duplicate `SHEET_SPRING`), `DURATION.countdownRing` (from `InactivityWarningDialog.tsx`'s inline `0.9s` SVG transition).
- **Design-token system additions** — TARGETED EDIT to the codebase's existing CSS-variable design-token file (exact path to be confirmed at implementation time; referenced by name in multiple findings but not directly read by Phase 10B). Add entries replacing every raw-hex-color instance catalogued in this audit: `StatCard.tsx`'s hover shadow, `InactivityWarningDialog.tsx`'s ring colors, `AnalyticsPanel.tsx`'s medal-tier bars, `BudgetTab.tsx`'s chart colors, `reports/page.tsx`'s `BRAND_COLORS` (largest blast radius — every panel in the ~20-panel Reports & Analytics module, R14 — first priority within this bucket), `receiptService.ts`'s and `examService.ts`'s PDF/HTML template colors, `reportExportService.ts`'s ARGB spreadsheet fill (needs either a hex-to-ARGB conversion helper or a parallel Excel-format export deriving from the same source values), `feeReminderJob.ts`'s/`contractExpiryJob.ts`'s inline email colors, `announcement.ts`'s `CATEGORY_COLORS`. Explicitly excluded: `base.ts`'s `TOKEN` raw hex colors, which are the correct implementation choice for HTML email clients, not a violation of this pattern.
- **Nine import-path-only fixes (no new constant)** — TARGETED EDIT, one line each. `S/schemas/admin.ts`'s duplicated 9-member role array → import `USER_ROLES` from `S/types/roles.ts`; `Sidebar.tsx`/`MobileBottomNav.tsx`/`PageHeader.tsx`'s three further `ROLE_LABELS` duplicates → import from `S/types/roles.ts` (R15 already fixes the `PageHeader.tsx` instance; this phase confirms the other two); `settings.ts`'s hardcoded `SYSTEM_KEYS`/`ACADEMIC_KEYS`/etc. arrays → import `SETTING_KEYS` from `S/types/settings.ts`; `students.ts`'s `VALID_STATUSES` → import `StudentStatusSchema` (R5 already fixes this); `applications/page.tsx`'s `STATUSES` and `applications.ts`'s inline array → import `ApplicationStatusSchema` (R5 already fixes both); `layout.tsx`'s/`login.tsx`'s cookie-clear strings → import `SESSION_COOKIE`/`COOKIE_MAX_AGE` from `proxy.ts`/`AuthProvider` (R1 already fixes the `login.tsx` instance); `PendingActionsPanel.tsx`'s hardcoded `href="/user-management"` → the existing `navigation.ts` route constant; `useInactivityTimer.ts`'s hardcoded `TIMEOUTS` → `SETTING_KEYS`-backed values via `settingsService`.
- **Settings-service / env-var fixes (not constants-file items)** — TARGETED EDIT across the files Phase 10B's own §1.15 enumerates: `userManagementService.ts`'s and `public.ts`'s (R5) conflicting hardcoded confirm-URL domains both resolve to `NEXT_PUBLIC_APP_URL`; `SystemConfigSettings.tsx`, `ExamGradingSettings.tsx` (R8), `FinanceSettings.tsx`, `LibrarySettings.tsx` (R12), `ClassroomSettings.tsx` component-local defaults all read from `SETTING_META` instead; `latePenaltiesJob.ts`/`feeService.ts`'s hardcoded `0.05` wires to the existing `late_payment_penalty_pct` admin setting; `email.ts`'s `FROM_ADDRESS`/`FROM_NAME` fallbacks call `getSchoolBranding()`; `feeReminderJob.ts`'s/`contractExpiryJob.ts`'s (R9/R10) sender addresses resolve to a `MAIL_FROM` env var; the Sentry DSN hardcoded in `sentry.edge.config.ts`/`instrumentation-client.ts` moves to `NEXT_PUBLIC_SENTRY_DSN`, matching the two config files that already do this correctly.
- **Explicitly excluded from this phase (recorded for completeness, not silently dropped):** real-shaped secrets in `.env.example` (a credential-rotation and git-history-scrubbing task, tracked in R19); stub/bug fixes where the correct remediation is real logic rather than a named constant (`getStorageUsage()`'s hardcoded `0`, `analyticsService.ts`'s hardcoded computed values — both already fixed in R14 where applicable; `MarksEntrySheet.tsx`'s hardcoded `max={100}`, already fixed in R7; the rate-limiter's hardcoded `remoteAddress`, already fixed in R4); dead code to retire rather than relocate (already handled in R7/R8); content bugs requiring real data wiring rather than a constant (login page decorative stats and public-homepage placeholders, already fixed in R5; `PageHeader.tsx`'s `MOCK_NOTIFICATIONS`, already fixed in R15; `hr/page.tsx`'s Loans placeholder copy, already fixed in R11); documentation-only stale comments with no functional consequence; and the `S/schemas/exam.ts` `z.input`-vs-`z.infer` type-convention question, a schema-layer consistency issue rather than a hardcoded value.

### 3. CODE STRUCTURE FRAMEWORK

**`S/constants/malawi/finance.ts`** (representative shape — versioned, sourced data rather than a bare literal):
```
export interface PayeBracket { threshold: number; rate: number }
export const DEFAULT_PAYE_BRACKETS: {
  brackets: PayeBracket[]
  source: string          // 'Malawi Revenue Authority'
  effectiveFrom: string     // ISO date
  lastVerified: string        // ISO date — explicit staleness marker
}
export const PENSION_RATE = 0.05
export const LATE_PAYMENT_PENALTY_DEFAULT = 0.05
```

**`S/constants/malawi/holidays.ts`** (representative shape — function-based, not a flat year-pinned array):
```
interface HolidayTemplate { month: number; day: number; name: string }
const FIXED_DATE_HOLIDAYS: HolidayTemplate[] = [ /* 10 entries */ ]
function computeEasterSunday(year: number): Date /* Computus algorithm */
export function getPublicHolidaysForYear(year: number): { date: string; name: string }[]
```

**`S/constants/countries.ts`** (representative shape):
```
export interface Country { code: string; name: string; callingCode?: string }
export const COUNTRIES: Country[]
export const DEFAULT_COUNTRY_CODE = 'MW'
export function getCountriesForForm(defaultCode?: string): Country[]
export const COUNTRY_CALLING_CODES: Pick<Country, 'code' | 'name' | 'callingCode'>[]
```

### 4. DEPENDENCIES

Depends on **R1–R15** — nearly every file this phase touches was already opened by an earlier phase for a functional fix; this phase's edits are additive import-path/constant-extraction changes layered on top of those already-modified files, not against the pre-R1 originals. Depends on **R7/R8** specifically for the grading-boundary reconciliation this phase deliberately does not re-open.

### 5. ACCEPTANCE CRITERIA

- `S/constants/malawi.ts` no longer exists as a single flat file; `@shared/constants/malawi` still resolves via the new barrel `index.ts` with no consumer import changes required
- `getPublicHolidaysForYear(2027)` returns correct dates with no code change from the 2026 behavior, including a correctly-computed Easter date
- Changing `SETTING_KEYS.CURRENT_ACADEMIC_YEAR` changes the year shown across the calendar, header badge, and every year-dependent dropdown simultaneously
- `navigation.ts` and `proxy.ts` import the same `PAGE_ACCESS` object; a role-access change in one file is impossible to make without it appearing in both
- `payrollService.ts`, `S/types/settings.ts`, and any other PAYE consumer all reference the same `DEFAULT_PAYE_BRACKETS` export
- The ten previously-conflicting school-identity fallback strings now resolve to one shared default, with `settingsService.getIdentitySettings()` as the live authoritative source
- No raw hex color literal remains in `reports/page.tsx`'s `BRAND_COLORS` blast radius
- `grep -rn "COUNTRIES = \[" apps/web/src` returns zero matches (both inline arrays removed in favor of the shared export)
- No TypeScript errors in any touched file

---

## R17 — Unified Charting Architecture (Phase 10C Plan)

### 1. OBJECTIVE

`W/components/shared/Chart.tsx` — the file every future chart in this codebase should logically import from — is confirmed completely empty (0 bytes), while a separate, fully-built shadcn/ui primitives file (`W/components/ui/chart.tsx`, 374 lines) already provides real Recharts theming/tooltip/legend infrastructure with no consumer-facing chart-type wrapper on top of it, and `BudgetTab.tsx` uses ApexCharts as a second, completely unintegrated charting library. This phase builds the master `Chart` module the empty file's name already promises — at zero migration risk, since nothing imports the empty file today — reusing `ui/chart.tsx` as its Recharts foundation rather than duplicating it, and formalizing the Recharts-vs-ApexCharts choice the codebase has already organically made correctly in its two existing chart implementations. It is sequenced after every domain and constants phase because several of the charts this module enables — attendance breakdowns, grading/performance trends — were blocked on data-model and grading-reconciliation work R6/R7/R8/R16 have already completed by this point in the sequence, and the highest-migration-priority target (`reports/page.tsx`'s ~20 panels) needed R14's `useAnalytics.ts` rewrite to land first so the data feeding those panels is trustworthy before migration effort is spent on presentation.

### 2. CHANGE LIST

- **`W/components/shared/Chart.tsx`** — DELETE, replaced by a directory. Confirmation of no remaining consumers: confirmed 0 bytes with no exports; nothing in the codebase could import a real symbol from this path today.
- **`W/components/shared/chart/types.ts`** — NEW FILE. Exports `ChartLibrary` (`'recharts' | 'apexcharts'`), `ChartType` (`'bar' | 'stackedBar' | 'line' | 'area' | 'pie' | 'donut' | 'radial' | 'combo' | 'timeSeries'`), `ChartDataPoint`, `ChartSeriesConfig` (with `color?` defaulting to the R16 design-token palette by index when omitted), and `ChartProps` — including a **required** `ariaLabel` field, resolving the missing screen-reader text-alternative `CROSS_a11y.md` flagged for every existing chart instance in the codebase, and an `emptyStateMessage` field replacing the `"—"` placeholder pattern R15 already fixed for dashboard stat cards.
- **`W/components/shared/chart/RechartsRenderer.tsx`** — NEW FILE. Composes `ui/chart.tsx`'s existing `ChartContainer`/`ChartTooltip`/`ChartTooltipContent`/`ChartLegend`/`ChartLegendContent` around the `RechartsPrimitive` chart type selected by `props.type` — reuses `ui/chart.tsx` unmodified rather than forking its theming logic.
- **`W/components/shared/chart/ApexChartRenderer.tsx`** — NEW FILE. Wraps `react-apexcharts`'s `<ReactApexChart>`, translating `ChartProps` into an `ApexOptions` object; implements `zoomable` (`chart.zoom.enabled`), `exportable` (built-in PNG/CSV/print toolbar), and the `radial`/`combo` types Recharts covers less cleanly. Draws colors from the same R16 design-token palette `RechartsRenderer.tsx` uses, so a dashboard mixing both libraries stays visually consistent.
- **`W/components/shared/chart/index.tsx`** — NEW FILE. Exports `Chart(props: ChartProps)`, which resolves `props.library ?? getRecommendedLibrary(props.type, props)` and delegates to whichever renderer is selected, and `getRecommendedLibrary()`, formalizing the decision rule: `zoomable`/`exportable`/`radial`/`combo`/large-point-count `timeSeries` → ApexCharts; everything else (`bar`/`stackedBar`/`line`/`area`/`pie`/`donut` with a small, fixed dataset) → Recharts. This confirms rather than overturns the codebase's own existing choices — `AnalyticsPanel.tsx` and `reports/page.tsx` (both small/fixed Recharts usage) and `BudgetTab.tsx` (ApexCharts, financial) are not migrated to a different library by this rule; it governs only what is newly built from here forward.
- **`W/components/dashboards/AdminDashboard.tsx`** — TARGETED EDIT (further edit on top of R15's rewrite). Add a login-trends `line` chart. Requires a new login-event aggregation capability — no such service exists in any phase of this audit — scoped as new backend work in this change, not merely frontend wiring.
- **`W/server/services/analyticsService.ts`, `W/server/routes/analytics.ts`** — TARGETED EDIT (further edit on top of R14's rewrite). Add the login-event aggregation function/endpoint the Admin dashboard chart above consumes.
- **`W/components/dashboards/FinanceDashboard.tsx`, `HighRankDashboard.tsx`** — TARGETED EDIT (further edit on top of R15's rewrite). Wire the Fee Collection % widget as a `radial` `Chart` instance (ApexCharts) consuming the already-called `useFinanceSummary(academicYear, term)` hook — matching the dashboard's own placeholder comment ("ApexCharts radial bar — wired in Phase 4") which independently anticipated this exact rule. `HighRankDashboard.tsx` reuses this same component for its Finance-summary widget rather than building a second bespoke one. Add a Monthly Income/Expense `combo` chart (ApexCharts) — requires a new or extended reporting endpoint, since the existing summary endpoint returns a single term total, not a monthly time series.
- **`W/server/services/reportService.ts` or `analyticsService.ts`** — TARGETED EDIT. Add the monthly income/expense time-series endpoint the chart above requires.
- **`W/components/dashboards/LibraryDashboard.tsx`** — TARGETED EDIT (further edit on top of R15's rewrite). Add a Borrow Trends `line`/`bar` chart, now unblocked by R12's issue/return UI fix — requires a new borrowings-over-time aggregation endpoint.
- **`W/server/services/libraryService.ts`, `W/server/routes/library.ts`** — TARGETED EDIT (further edit on top of R12's changes). Add the borrowings-over-time aggregation endpoint the chart above requires.
- **`W/app/(public)/page.tsx`** — TARGETED EDIT (further edit on top of R5's rewrite). Add a MANEB subject-comparison `bar` chart (Recharts) to the public homepage, consuming `GET /public/maneb-stats` — confirm at implementation time whether this endpoint already returns a per-subject array (per-subject data was not confirmed either way within this plan's read-scope) and extend it if not.
- **`W/components/students/StudentDashboard.tsx` or `students/[id]/page.tsx`** — TARGETED EDIT (further edit on top of R15/R5's changes). Add a Student performance `line`/`bar` chart — now unblocked, since R7/R8 already completed the grading-system reconciliation (`gradeService.ts` as sole grade-boundary authority) that this chart was originally blocked on.
- **`W/components/attendance/*`, `W/components/classes/[id]/page.tsx`, `students/[id]/page.tsx`** — TARGETED EDIT (further edit on top of R6's changes). Add a `donut` (present/absent/late snapshot) or `line` (present-rate trend) attendance chart on the class-detail and student-profile pages — now unblocked by R6's Postgres `Attendance` model.
- **`W/components/exams/AnalyticsPanel.tsx`, `W/app/(auth)/reports/page.tsx`** — TARGETED EDIT (further edit on top of R14's rewrite; opportunistic migration, not urgent since both already work). Migrate onto the new `Chart` module — `reports/page.tsx` is the highest migration priority once the module exists (largest color-token cleanup, largest accessibility gap, already on the "right" library per the decision rule, and its data is now trustworthy following R14's `useAnalytics.ts` rewrite).
- **`W/lib/chartUtils.ts`** — NEW FILE. `renderStaticChartSVG(data, type, width, height)` — a fixed-pixel-dimension, non-responsive SVG-string renderer for contexts with no real browser viewport. Called by both `PrintableReportCard.tsx`'s React screen-preview path and `examService.ts`'s server-side `buildReportCardHtml()`-equivalent (R7/R8) string-building path, if either ever gains a chart — ensuring the two currently-independent report-card renderers produce visually identical output rather than drifting further apart, consistent with R8's broader consolidation of report-card generation onto one canonical pipeline.
- **`W/server/services/reportExportService.ts`** — TARGETED EDIT (further edit on top of R10/R12's changes). Reports-module Excel export defaults to the underlying data table only, with no embedded chart object; if a visual is explicitly requested in an export, rasterize the on-screen `Chart` component to a PNG before handing it to this service to embed as a static image, never a "live" chart object.

### 3. CODE STRUCTURE FRAMEWORK

**`W/components/shared/chart/index.tsx`** (new — the module's public API):
```
export function Chart(props: ChartProps): JSX.Element {
  const library = props.library ?? getRecommendedLibrary(props.type, props)
  return library === 'apexcharts' ? <ApexChartRenderer {...props} /> : <RechartsRenderer {...props} />
}
export function getRecommendedLibrary(type: ChartType, opts?: { zoomable?: boolean; exportable?: boolean }): ChartLibrary {
  if (opts?.zoomable || opts?.exportable) return 'apexcharts'
  if (type === 'radial' || type === 'combo' || type === 'timeSeries') return 'apexcharts'
  return 'recharts'
}
```

**`W/components/shared/chart/types.ts`** (new — the shared contract both renderers implement):
```
export type ChartLibrary = 'recharts' | 'apexcharts'
export type ChartType = 'bar' | 'stackedBar' | 'line' | 'area' | 'pie' | 'donut' | 'radial' | 'combo' | 'timeSeries'
export interface ChartDataPoint { x: string | number; [seriesKey: string]: string | number }
export interface ChartSeriesConfig { key: string; label: string; color?: string }
export interface ChartProps {
  type: ChartType; data: ChartDataPoint[]; series: ChartSeriesConfig[]
  library?: ChartLibrary; height?: number; title?: string; subtitle?: string
  zoomable?: boolean; exportable?: boolean
  emptyStateMessage?: string
  ariaLabel: string  // required, not optional
}
```

### 4. DEPENDENCIES

Depends on **R14** — `reports/page.tsx`'s migration priority explicitly requires `useAnalytics.ts`'s rewrite to have already landed. Depends on **R6** — attendance charts require the Postgres `Attendance` model. Depends on **R7/R8** — the student performance chart requires the grading-system reconciliation those phases completed. Depends on **R12** — the Library borrow-trends chart requires the issue/return UI fix. Depends on **R16** — both renderers draw colors from the design-token palette R16 establishes.

### 5. ACCEPTANCE CRITERIA

- `W/components/shared/Chart.tsx` no longer exists as a file; `W/components/shared/chart/` exports `Chart` and `getRecommendedLibrary`
- Every chart rendered via the new module has a non-empty `ariaLabel`
- A `radial` or `exportable` chart request renders via ApexCharts; a small fixed `bar`/`line` chart renders via Recharts, with no explicit `library` override needed
- The Admin dashboard shows a real login-trends chart backed by a real aggregation endpoint
- The Finance and HighRank dashboards' fee-collection widgets both render from the same shared component
- A student's performance chart renders using `gradeService.ts`-sourced grade data
- A class or student profile shows a real attendance breakdown chart
- `reports/page.tsx`'s panels render through the new `Chart` module with no raw hex colors remaining
- Exporting a report to Excel produces a data table by default, with no embedded live chart object
- No TypeScript errors in any touched file

---

## R18 — University Placement Module (Phase 11 Blueprint)

### 1. OBJECTIVE

This phase builds the University Placement feature as a self-contained track, implementing Phase 11's blueprint in full: an advisory, record-keeping module (explicitly not an authoritative allocation system, and explicitly not connected to any external UNIMA/MUST system) that computes MSCE-eligibility against a git-versioned university/programme catalog, lets students self-report and staff verify placement outcomes, and surfaces cohort-wide analytics. It is sequenced last among the feature tracks because it depends on the MANEB/exam infrastructure (R7/R8), the analytics infrastructure (R14), the notification-pipeline pattern (R11/R13), and the Firebase-UID/Prisma-ID resolution fix (R9) all already being in place — this module is designed from the outset to extend each of those rather than fork a parallel implementation, and doing so before they existed would have meant building against infrastructure this roadmap was simultaneously still fixing.

### 2. CHANGE LIST

- **`P/schema.prisma`** — NEW MODELS. Add `PlacementStatus` enum (`NOT_STARTED`, `ELIGIBILITY_COMPUTED`, `CHOICES_RECORDED`, `PLACED`, `CONFIRMED`, `DECLINED`, `NOT_PLACED`). Add `UniversityPlacement` (keyed off `Student.id` and a unique `ManebRecord.id` — never `firebaseUid` — carrying `status`, `recordedByUid`, `verifiedByUid`, `verifiedAt`, matching the self-report/staff-verify shape already established for other domains in this codebase). Add `PlacementChoice` (rank-ordered university/programme choices referencing the constants-file catalog by string id rather than a foreign key into a database table this design deliberately does not create, carrying `isEligible`/`score`/`missingSubjects`/`isVerified` — a computed recommendation and a recorded choice are the same row, not two parallel concepts). Add additive back-relations only to `Student` and `ManebRecord`; `Application` is deliberately not touched (placements are a post-enrollment concern, unrelated to the admissions pipeline R5 covers).
- **`W/server/services/studentService.ts`** — no further change required in this phase; this module's single highest-leverage integration point is calling the `resolveStudentFromUid()` function R9 already established and fixed the known callers of — this phase's own new route (below) must be a *third*, correct caller, not a third instance of the bug.
- **`S/constants/universities.ts`** — TARGETED EDIT, building on R16's reserved shape (`University`/`UniversityProgram` interfaces, empty `UNIVERSITIES` array). Populate real data for Malawi's public universities and their programmes (structured `minimumRequirements` per programme, drawn from the uploaded `MUST_Programs_Requirements.md` as a worked reference, not the architecture document's own illustrative sample data, which is independently confirmed incomplete against that same source). Add `MSCE_CREDIT_MAX_GRADE = 6` (which MANEB-issued grade digit counts as a credit — a separate, independent constant, deliberately not entangled with the still-separately-tracked MSCE/JCE grade-boundary reconciliation R7/R8 already resolved for report cards and promotion; this constant answers "which grade counts as a credit," not "how a raw score converts to a grade," a different question). Add `cutOffPoints`-shaped eligibility data per programme where available. Add lookup helpers `findUniversity(id)`, `findProgram(universityId, programId)`, `getAllPrograms()` — the part of this file R16 explicitly deferred to this phase. Private/foreign universities are handled via free text on `PlacementChoice` rather than curated catalog entries, per the blueprint's explicit decision not to build an exhaustive private/foreign registry.
- **`W/server/services/placementService.ts`** — NEW FILE. CRUD/workflow exports (`createPlacement`, `recordChoice`, `recordOutcome`, `verifyOutcome`, `getForStudent`, `getCohort`), following the established service-file pattern. Calls `auditService.log()` directly on every mutation — the correct convention per R4's audit-log consolidation, never the deleted `injectAuditLogger` middleware.
- **`W/server/services/placementMatchingService.ts`** — NEW FILE. Pure functions: `isManebRecordPlacementReady(record): boolean` (checks `examType === 'MSCE'` — never `'JCE'`, per the domain note below — plus a `RESULTS_RECEIVED`/`CERTIFIED` status and a non-empty parsed `subjectGrades` map), `computeEligibility()`, `generateRecommendations()` — eligibility-first-then-score, a subject-match breakdown, and a plain-language narrative, deliberately excluding any internal-exam ("Form 1–4 trend bonus") scoring component, since that data path runs directly into the still-separately-tracked grading-system reconciliation and MSCE-only scoring has no such dependency (MANEB grades are direct board-issued values).
- **`W/server/services/examService.ts`** — TARGETED EDIT (further edit on top of R7's changes). Add `bulkCreateManebRecords()` — a thin loop over the existing, already-correct `createManebRecord()` — not a new staging/import subsystem. The matching key for resolving a bulk-entry row to a `Student` (likely `Student.admissionNo`) must be confirmed against any existing tooling before implementation.
- **`W/server/routes/placements.ts`** — NEW FILE. Express router matching the `students.ts` convention: `GET /me` (student self-service; **must** call `studentService.resolveStudentFromUid()` before any `studentId`-keyed query — this is the single highest-leverage correctness requirement in this entire phase, since skipping it reproduces the exact confirmed-broken pattern already found twice elsewhere in this audit), `POST /:studentId/choices`, `POST /:id/outcome`, `PATCH /:id/verify`, `GET /cohort`, `POST /batch-generate` (an on-demand, `exam_officer`-triggered endpoint, deliberately not a new cron job, so this module does not inherit the cron-reliability problem tracked separately in R19). Every cohort-eligibility query in this router gates explicitly on `Class.form === 4 AND ManebRecord.examType === 'MSCE'` — never on `Student.status` alone, since `AWAITING_MANEB_RESULTS` cannot by itself distinguish a Form 2 student awaiting JCE from a Form 4 student awaiting MSCE.
- **`W/lib/api-app.ts`** — TARGETED EDIT (a further edit to this file, on top of R3/R4/R6/R13's changes). Mount the new `placementsRouter` — explicitly called out because an unmounted-but-otherwise-correct router (`/promotion`, fixed in R3) is the single most common way a correct new router has shipped unreachable in this exact codebase; this phase's router must not become a second instance of that pattern.
- **`W/server/services/analyticsService.ts`, `W/server/routes/analytics.ts`** — TARGETED EDIT (further edit on top of R14's rewrite). Add `getPlacementAnalytics()` / `GET /api/analytics/placements`, extending the existing analytics stack rather than forking a second one, and consuming the already-built, previously-zero-consumer `getManebCandidateList()` (R14) as its cohort source rather than writing a second query against `ManebRecord`.
- **`W/components/exams/ManebPanel.tsx`** — TARGETED EDIT (further edit on top of R7/R8's changes). Add a "Bulk Entry" action to this existing MANEB area, calling `bulkCreateManebRecords()` above — not a new placements-specific page, since bulk MANEB entry is a MANEB-domain capability this module extends rather than owns.
- **`W/app/(auth)/my-placement/page.tsx`** — NEW FILE. Student self-service page: eligibility status, recommendation cards, choice-recording form. Calls `GET /placements/me`.
- **`W/app/(auth)/placements/page.tsx`** — NEW FILE. Staff cohort-management page: eligibility list (surfacing "results not yet ready" for students `isManebRecordPlacementReady()` rejects), outcome recording, verification.
- **`W/components/placements/PlacementRecommendationCard.tsx`** — NEW FILE. Rank, score, eligibility badge, subject-match chips, narrative text — the recommendation-card UX shape the blueprint adopts from its source material.
- **`W/components/placements/PlacementCohortTable.tsx`** — NEW FILE. Built on `DataTable.tsx` — its real, current prop contract must be confirmed directly from source at implementation time (not assumed from its pre-R15 buggy behavior, now fixed) before this component is built against it.
- **`W/components/placements/PlacementOutcomeForm.tsx`** — NEW FILE. Self-report (student) and staff record-on-behalf/verify form, sharing the `isVerified`/`recordedByUid`/`verifiedByUid`/`verifiedAt` pattern.
- **`W/app/(auth)/reports/page.tsx`** — TARGETED EDIT (further edit on top of R14's rewrite). Add a Placements tab/panel consuming `getPlacementAnalytics()`.
- **`W/config/navigation.ts`, `S/constants/pageAccess.ts`** — TARGETED EDIT (further edit on top of R16's changes). Add navigation entries and `PAGE_ACCESS` grants for `/my-placement` (student) and `/placements` (staff), keeping `navigation.ts` and `proxy.ts`'s role lists in sync through the single shared source R16 established.
- **`S/types/permissions.ts`** — TARGETED EDIT. Add a new `placement` domain, seven permissions: `placement.viewOwn`/`recordOwnChoice` (student only, mirroring `exam.viewOwnResults` and the existing light student self-service actions `library.requestBorrow`/`class.submitAssignment`); `placement.view`/`viewAnalytics` (**all nine roles**, including `student` — a deliberate, explicitly-sourced departure from the `exam.viewAllResults`-style restrictive default used everywhere else in this audit, because placement outcomes carry a real-world tradition of public posting in Malawian school culture, unlike individual exam scores; this is scoped narrowly to this one domain and is not a precedent for loosening view rights elsewhere); `placement.manage`/`recordOutcome` (`high_rank` + `exam_officer`, **`admin` explicitly excluded** — mirroring `exam.manageManebRecords`/`manageManebTimetable`, and directly correcting the architecture document's own over-permissive matrix, which is precisely the admin-over-grant pattern this audit exists to catch); `placement.verifyOutcome` (`high_rank` only, mirroring `exam.authorizeRelease`'s exclusivity, consistent with `S/types/permissions.ts`'s own existing comment that final authorization is `high_rank`, not `exam_officer`).
- **`P/schema.prisma`, `W/server/services/notificationService.ts`, `W/server/templates/emails/placement-update.ts`** — TARGETED EDIT / NEW FILE. Add a "placement confirmed" notification following the exact structural pattern of `sendResultRelease()` (correctly built, R7/R8 wired it — a near-exact match for reuse here), triggered from `recordOutcome()`. Add a new boolean field to the existing `UserNotificationPref` model (e.g. `emailPlacementUpdate`, matching the existing per-type-preference convention alongside `emailFeeReminder`/`emailLeaveUpdate`/etc.) — an additive change to an existing model for a different feature's established convention, not new placement-domain schema.
- **`W/components/shared/AuditLogViewer.tsx`** — TARGETED EDIT (further edit on top of R16's `AUDIT_ENTITY_TYPES` extraction). Add the new entity-type string this module's mutations log under.

### 3. CODE STRUCTURE FRAMEWORK

**`P/schema.prisma`** (new models — core fields; exact full field list confirmed at implementation time against the live schema):
```
enum PlacementStatus { NOT_STARTED ELIGIBILITY_COMPUTED CHOICES_RECORDED PLACED CONFIRMED DECLINED NOT_PLACED }

model UniversityPlacement {
  id            String   @id @default(cuid())
  studentId     String
  student       Student  @relation(fields: [studentId], references: [id], onDelete: Cascade)
  manebRecordId String   @unique
  manebRecord   ManebRecord @relation(fields: [manebRecordId], references: [id])
  status        PlacementStatus @default(NOT_STARTED)
  recordedByUid String?
  verifiedByUid String?
  verifiedAt    DateTime?
  choices       PlacementChoice[]
}

model PlacementChoice {
  id              String  @id @default(cuid())
  placementId     String
  placement       UniversityPlacement @relation(fields: [placementId], references: [id])
  rank            Int
  universityId    String   // string id into S/constants/universities.ts, not a DB foreign key
  programmeId     String
  isEligible      Boolean
  score           Float?
  missingSubjects String[]
  isVerified      Boolean  @default(false)
}
```

**`W/server/routes/placements.ts`** (new — matches `students.ts`'s router convention):
```
import 'server-only'
import { Router } from 'express'
import { verifyAuth } from '@/lib/verifyAuth'
import { requirePermission } from '@/server/middleware/verifyPermission'
import * as placementService from '@/server/services/placementService'
import { resolveStudentFromUid } from '@/server/services/studentService'

const placementsRouter = Router()
placementsRouter.use(verifyAuth)

placementsRouter.get('/me', async (req, res) => {
  const student = await resolveStudentFromUid(req.user.uid) // NOT req.user.uid used directly
  // ... fetch and return this student's placement/choices
})
placementsRouter.post('/:studentId/choices', requirePermission('placement.recordOwnChoice'), async (req, res) => { ... })
placementsRouter.post('/:id/outcome', requirePermission('placement.recordOutcome'), async (req, res) => { ... })
placementsRouter.patch('/:id/verify', requirePermission('placement.verifyOutcome'), async (req, res) => { ... })
placementsRouter.get('/cohort', requirePermission('placement.view'), async (req, res) => { ... })
placementsRouter.post('/batch-generate', requirePermission('placement.manage'), async (req, res) => { ... })

export default placementsRouter
```

### 4. DEPENDENCIES

Depends on **R9** — `GET /placements/me` is the third caller of `resolveStudentFromUid()`, and must not repeat the bug R9 fixed for the first two. Depends on **R7/R8** — `ManebRecord`/`examService.createManebRecord()`/`listManebRecords()` are this module's sole data source, and the MSCE/JCE distinction relies on `examType` being reliably set. Depends on **R14** — the analytics extension consumes `getManebCandidateList()` and mounts alongside the rewritten `useAnalytics.ts`/`reports/page.tsx`. Depends on **R16** — the constants file builds directly on the reserved `S/constants/universities.ts` shape and the shared `PAGE_ACCESS` source. Depends on **R3/R4** — the new router must be mounted correctly (the `/promotion` lesson) and gated via `requirePermission`, never a fresh `requireRole` allowlist.

### 5. ACCEPTANCE CRITERIA

- `GET /placements/me` returns the correct student's data when called with a Firebase-UID-bearing session — confirmed via `resolveStudentFromUid()`, not a raw UID-as-Prisma-ID lookup
- A Form 4 student with a certified MSCE `ManebRecord` sees real eligibility/recommendation data; a Form 2 student with a JCE record sees "not applicable," never a JCE-based eligibility computation
- `placement.view`/`viewAnalytics` succeed for all nine roles, including `student`
- `placement.manage`/`recordOutcome` succeed for `high_rank`/`exam_officer` and return `403` for `admin`
- `placement.verifyOutcome` succeeds only for `high_rank`
- `placementsRouter` is confirmed mounted and reachable (`GET /api/placements/cohort` does not 404 for an authorized role)
- Bulk MANEB entry via `ManebPanel.tsx`'s new action creates real `ManebRecord` rows through the existing `createManebRecord()` path, not a new parallel table
- Confirming a placement outcome sends a real notification, following the `sendResultRelease()` pattern
- The Reports & Analytics page shows a Placements panel backed by `getPlacementAnalytics()`
- No TypeScript errors in any touched file

---

## R19 — Final Hardening: Accessibility, Testing, Observability & Production Readiness

### 1. OBJECTIVE

This final phase closes every remaining item this roadmap has deliberately deferred throughout — accessibility fixes noted but not yet applied, every broken test file across all three test suites, and the observability/deployment-configuration findings from Phases 8B/8D/8E — plus the single most severe finding in the entire audit: `apps/web/.env.example` contains fully-formed, real, production-grade secrets (a live-shaped Neon connection string, a complete Firebase Admin RSA private key, a populated Appwrite API key, Resend credentials, Twilio credentials, an Algolia admin key, a Sentry auth token, and a working `CRON_SECRET`) committed under a filename whose entire convention is "safe to commit." This is treated as this phase's highest-priority item regardless of where it falls in the roadmap's sequence, since a credential-rotation task's urgency is independent of implementation ordering. Sequenced last because most other items here are genuinely orthogonal cleanup (test files, accessibility labels, deployment config) best done in one consolidated pass once the application logic they're testing/describing has stopped changing.

### 2. CHANGE LIST

**A. Credential rotation & secrets hygiene (highest priority in this phase, independent of sequencing)**

- **`apps/web/.env.example`** — MAJOR REWRITE. Replace every real-shaped secret (Neon connection string, Firebase Admin RSA key, Appwrite key, Resend API key/webhook secret, Twilio SID/token/phone, Algolia admin key, Sentry auth token, reCAPTCHA key, `CRON_SECRET`) with an obviously-fake placeholder (e.g. `postgres://user:password@host/db`, `<FIREBASE_ADMIN_PRIVATE_KEY>`). Fix `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`'s malformed value (stray leading `p`, truncated `.ap` suffix). Remove the duplicated `ALGOLIA_APP_ID`/`ALGOLIA_ADMIN_KEY` lines. This is a file-content change only; the actual remediation is external to this repository — full credential rotation across all seven implicated services (Neon, Firebase, Appwrite, Resend, Twilio, Algolia, Sentry) and git-history scrubbing to remove the exposed values from every prior commit, which this roadmap records as a required action but cannot itself perform.

**B. Sentry & observability**

- **`W/lib/api-app.ts`** — TARGETED EDIT (a further edit to this frequently-touched file). Add `Sentry.setupExpressErrorHandler(app)`, the dedicated official Sentry-for-Express integration — today Sentry has zero visibility into any of the 23 Express domain routers' errors, because `globalErrorHandler` (Phase 8A) catches and responds to every thrown error before it ever reaches the Next.js Route Handler boundary where `instrumentation.ts`'s `onRequestError` hook could observe it. Without this, every student-record, finance, exam, HR, library, and attendance error in the entire core business-logic API surface is invisible to Sentry, including every error class `sentry.server.config.ts`'s own `beforeSend` was specifically written to tag as critical.
- **`W/instrumentation-client.ts`, `apps/web/sentry.client.config.ts`** — MAJOR REWRITE / DELETE. Both files independently call `Sentry.init()` for the browser with materially different, contradictory settings; per this project's confirmed Next.js/Sentry SDK versions, `instrumentation-client.ts` is the file Next.js actually auto-loads, making `sentry.client.config.ts`'s carefully-tuned GDPR-conscious settings (masked session replay, conservative sampling, production-only gating) likely dead code — meaning the application has probably been sending unmasked session replay with full PII at 100% trace sampling in every environment, including local development, for a system handling student records, financial data, and HR/payroll information. Consolidate onto one file: merge `sentry.client.config.ts`'s safer settings into `instrumentation-client.ts` and delete `sentry.client.config.ts`.
- **`apps/web/sentry.edge.config.ts`, `W/instrumentation-client.ts`** — TARGETED EDIT. Replace the hardcoded literal Sentry DSN string with `NEXT_PUBLIC_SENTRY_DSN`, matching how `sentry.client.config.ts`/`sentry.server.config.ts` already correctly read it (cross-referenced from R16's settings/env-var bucket; finalized here as part of this phase's Sentry consolidation).
- **`W/app/api/sentry-example-api/route.ts`, `W/app/sentry-example-page/page.tsx`** — DELETE. Confirmation of no remaining consumers: unmodified Sentry setup-wizard scaffold files serving no application function; the latter also hardcodes a direct link to the real Sentry organization's dashboard and bypasses the design-token system with inline Sentry-brand hex colors, neither of which is worth preserving in a deleted file.

**C. CSP hardening**

- **`vercel.json`** — TARGETED EDIT. The platform-level CSP (which does exist and is enforced — correcting Phase 1A's and Phase 8A's independent "no CSP anywhere" conclusions, each reasonable given its own narrower scope) currently includes `'unsafe-inline'` and `'unsafe-eval'` in `script-src`, substantially weakening its own XSS mitigation, and allowlists Algolia domains in `connect-src` that the browser never needs given Phase 7B's confirmed server-side-only Algolia integration. Remove the unnecessary Algolia `connect-src` entries. Move toward a nonce-based or `strict-dynamic` strategy for `script-src` in place of `'unsafe-inline'`/`'unsafe-eval'` — a larger change than a one-line fix, scoped here as a required direction rather than a single edit, since it depends on how the Next.js build emits inline scripts today.
- **`vercel.json`** — TARGETED EDIT (second, independent fix to this file). Remove the `/explore` redirect entry (`source: "/explore", destination: "/#explore"`) — R3 already removed `/explore` from `proxy.ts`'s `PUBLIC_PATHS` as a dead entry with no corresponding route; this redirect pointed at a homepage anchor (`id="explore"`) that was never implemented either, and removing it here is consistent with R3's decision rather than building a scroll target for a path this roadmap has already retired.

**D. Cron / `vercel.json` reconciliation**

- **`vercel.json`** — TARGETED EDIT (third, independent fix to this file). Add the three real, fully-built cron routes missing from the `crons` array entirely: `contract-alerts`, `installment-check`, `late-penalties`. Fix the `overdue-library` entry's path mismatch — it currently schedules the nonexistent `/api/cron/overdue-library-fines`; correct it to the real `/api/cron/overdue-library`. Remove the `risk-detection` phantom entry's old nonexistent path and repoint it at the real route R8 built (`/api/cron/risk-detection`) — R8 already resolved the underlying route-naming confusion (three different undocumented names for the same never-built feature); this phase's job is only to make sure `vercel.json` now points at R8's real route rather than the old phantom path. Remove the `payroll-trigger` entry entirely — no corresponding route or job file exists anywhere, and R10 only built a manual "Run Payroll" trigger, not an automatic scheduled one; if an automatic monthly run is genuinely wanted, that is new scope for a future phase, not a configuration fix to make here.
- **`W/server/jobs/latePenaltiesJob.ts`, `W/server/services/feeService.ts`** — TARGETED EDIT. Wire both independent hardcoded `0.05` late-payment-penalty-rate call sites to the existing `late_payment_penalty_pct` admin setting (Phase 1B, `FinanceSettings.tsx`) — today this setting is fully exposed in the admin UI and appears functional but has zero effect on the actual rate ever applied, a confirmed settings-bypass rather than merely an unconfigurable constant.
- **`W/server/services/hrService.ts`** — no further change; R11 already fixed `getContractExpiryAlert()`'s overlapping-range duplicate-alert bug this phase's evidence base independently re-confirms from a different angle (over-firing, not the originally-speculated silent-skip).

**E. Email/push health & injection**

- **`W/server/services/systemHealthService.ts`** — TARGETED EDIT. `getSystemHealth()` currently checks Neon/Appwrite/Firestore only; add calls to `lib/email.ts`'s `getEmailHealthStatus()` and `lib/push.ts`'s `getPushHealthStatus()` — both fully implemented specifically to be called from here per their own doc comments, with zero callers today, meaning the admin-facing System Health view has no way to surface whether email or push — the actual delivery mechanism for every notification pipeline this roadmap has reconnected — are even configured. `checkAppwrite()`: replace its duplicated, unchecked-assertion Appwrite client construction with `lib/storage.ts`'s existing client builder (exporting it if it is not already exported) rather than a second, independently-maintained copy.
- **`W/app/api/webhooks/resend/route.ts`** — NEW FILE. Receives Resend delivery-status webhooks and verifies them via `lib/email.ts`'s already fully-implemented, zero-caller `verifyResendWebhook()` (HMAC-SHA256 Svix signature verification with replay protection) — no route exists to receive what this function is built to verify.
- **`W/server/services/applicationService.ts`, `W/server/routes/public.ts`** — no further change beyond R5's fix; R5 already converted both files' inline raw-HTML email construction to `renderBase()`, which inherits `base.ts`'s confirmed-correct HTML escaping — this phase's evidence base independently re-confirms the injection risk R5 already closed, rather than identifying a new one.
- **`W/lib/env.ts`** — TARGETED EDIT. Rename `serverSchema`'s `ALGOLIA_API_KEY` to `ALGOLIA_ADMIN_KEY`, matching the real environment variable name every actual reader (`algoliaService.ts`, `.env.example`) already uses.
- **`.github/workflows/ci.yml`** — TARGETED EDIT. Remove the dead `APPWRITE_BUCKET_ID: dummy` build-job variable — no corresponding `lib/env.ts` schema field and zero references anywhere in `apps/web/src`.

**F. Unit test suite repair (Phase 9A)**

- **`vitest.config.ts`** — TARGETED EDIT. Add a real project/`include` glob matching `__tests__/*.test.ts` files — today the sole configured project is scoped exclusively to the Storybook-story Vitest addon, so no plain unit test file is discoverable by any repository command, and CI's `unit-tests` job has been reporting a false-positive green status for the entire lifetime of the current configuration.
- **`apps/web/package.json`** — TARGETED EDIT. Add a `"test"` script (none exists today).
- **`W/server/services/examService.test.ts`** — TARGETED EDIT. Import `beforeEach` from `vitest` (currently missing, would throw `ReferenceError` at suite-collection time before any other issue is reached). Replace the call to non-exported, module-private `calcGrade` with the real, exported, async `gradeService.calcGrade()` — the same unification R7 already applied to `examService.ts` itself. Remove the `vi.mock('@/lib/prisma', { gradingScale: { findMany } })` mock apparatus and `MSCE_SCALES` fixture entirely — they exercise a DB-backed configurable-grading-scale code path the real function has never had.
- **`W/server/services/riskService.test.ts`** — TARGETED EDIT. Replace the call to nonexistent `risk.detectAtRiskStudents` with the real exports `assessStudentRisk`/`assessClassRisk`/`getSchoolRiskSummary`.
- **`W/server/services/promotionService.test.ts`** — TARGETED EDIT. Replace the call to nonexistent `svc.previewPromotion` with the real `runPromotion` (its third boolean parameter already covers "preview" mode). Remove the `prisma.class.findFirst`/`prisma.$transaction` mocks, which are exclusively relevant to `commitPromotion`, a separate export this file does not otherwise test.
- **`W/server/services/accountingService.test.ts`** — TARGETED EDIT. Replace the call to nonexistent `accounting.postJournalEntry` with the real, split `createJournalEntry`/`postEntry` pair.
- **`W/server/services/forecastService.test.ts`** — MAJOR REWRITE. Replace the call to nonexistent `forecast.generateForecast` with the real `getCashFlowForecast`, and rewrite every assertion against the function's real return shape (`feeRevenue`/`expenses`/`netCashFlow` time-series plus `totalActualRev`/`totalForecastRev`/`totalActualExp`/`totalForecastExp` aggregates) — unlike the other five files, a function-name fix alone is insufficient here, since the asserted shape (`projectedRevenue`/`projectedExpenses`/`projectedNet`) does not exist anywhere on the real type.
- **`W/components/shared/DataTable.test.ts`** — TARGETED EDIT. Replace the `rows` prop used in all five `it` blocks with the real `data` prop, matching `DataTableProps<T>`'s actual interface.

**G. E2E test suite repair (Phase 9B)**

- **`e2e/student.spec.ts`, `scripts/create-test-accounts.mjs`** — TARGETED EDIT. Reconcile the admin credentials that never agree across the two files — `student.spec.ts`'s fallback (`admin@smsmalawi.edu.mw`/`Test@1234`) does not match the provisioning script's real output (`admin@sms.test`/`Admin@1234!`); pick the provisioning script's real output as canonical (it is the actual source of truth for what account exists) and update the spec's fallback and any CI secret documentation to match — nine of this file's sixteen tests share a `beforeEach` that fails at the login step whenever this mismatch is live.
- **`e2e/student.spec.ts`** — TARGETED EDIT (further, independent fixes to this file). Apply-form test: replace the `/personal information/i` text assertion with `/personal details/i`, matching the real Step 0 heading (already correctly matched in this same file's separate add-student-form test, which is how the inconsistency was caught). Duplicate-application test: actually trigger the fill/submit action before asserting on the `page.route()` interceptor's effect — today the mock is dead code within the test itself, and the assertion times out regardless of the real, independently-confirmed-correct server-side `409`/`DUPLICATE` response ever being exercised. Replace the `/exams/marks` navigation with `/exams` — no `marks/` subdirectory exists anywhere in the App Router tree.
- **`W/app/(auth)/exams/page.tsx`** — TARGETED EDIT (further edit on top of R7's rewrite). Add a real `<h1>`/`PageHeader` element — confirmed absent via direct search, unlike every sibling module page (Students/Finances/Library), and the direct cause of `student.spec.ts`'s heading-role assertion timing out independent of the routing fix above.
- **`W/app/(auth)/students/page.tsx`** — TARGETED EDIT (further edit on top of R5's changes). Add a real search input — confirmed absent via direct search (no placeholder containing "search" anywhere on this page) despite `useStudents.ts`/`students.ts` already supporting server-side filtering parameters; this is a UI wiring gap onto an already-correct backend, the same shape as several other findings this roadmap has fixed elsewhere.
- **`e2e/auth.spec.ts`** — TARGETED EDIT. De-duplicate its two tests against `student.spec.ts`'s near-identical Authentication describe-block tests — extract a shared helper both files call, or remove one file's redundant coverage, rather than maintaining two independent copies of the same two assertions.

**H. Storybook repair (Phase 9C)**

- **`W/components/shared/DataTable.stories.tsx`** — TARGETED EDIT. Fix the same `rows`-vs-`data` prop mismatch as `DataTable.test.ts` above — this one is confirmed **live**, not merely structurally unreachable: the Storybook-scoped Vitest project genuinely renders these stories in headless Chromium on every CI run, and `DataTable.tsx`'s sorted `useMemo` unconditionally spreading `data` throws a runtime `TypeError` when `data` is `undefined`, meaning this defect has very likely been failing the `unit-tests` CI job on every run since this file was added. Also fix the `isLoading`/`quickFilters` id-vs-value shape mismatch flagged for this file.
- **`W/components/shared/MobileBottomNav.stories.tsx`** — TARGETED EDIT. Remove the `role` arg passed to `MobileBottomNav.tsx` (a component that takes zero props and resolves role internally via `useAuthStore()`) — all four stories currently render identically, none demonstrating the role-differentiated navigation the file's own docs claim to show; restructure the stories to mock `useAuthStore()`'s return value per story instead.
- **`W/components/shared/StatCard.stories.tsx`** — TARGETED EDIT. Replace the string-literal `icon` args (`'users'`/`'alert'`/`'book'`/`'graduation'`) with real Lucide icon component references, matching `StatCardProps.icon`'s actual `React.ElementType` type — today React renders these as literal unrecognized `<users>`/`<alert>`/etc. DOM elements instead of icons.
- **`.storybook/main.ts`** — TARGETED EDIT. Fix `staticDirs`'s Windows-style backslash path (`"..\\public"`) to a POSIX-style forward-slash path — this codebase's actual CI runner is `ubuntu-latest`, which cannot resolve the backslash as a directory separator, so Storybook builds/tests in CI cannot correctly load fonts, logo, or favicon static assets.
- **`apps/web/tsconfig.json`** — TARGETED EDIT. Remove the `src/stories` exclusion from the `exclude` array (or, at minimum, document why it remains excluded) — every TypeScript error in the story files fixed above was invisible to the typecheck CI job specifically because of this exclusion, leaving the Storybook-scoped Vitest render as the only mechanism in this codebase's entire CI pipeline capable of surfacing any of these defects.
- **`src/stories/`** — DELETE the unmodified 25-file Storybook onboarding scaffold (`Button`/`Header`/`Page` components, stories, CSS, `Configure.mdx`, `assets/`). Confirmation of no remaining consumers: self-contained, confirmed zero application imports, contributing no documentation or coverage value while consuming real CI render time on every run.

**I. Accessibility completion sweep (Phase 1A–9C, `CROSS_a11y.md`, every item not already resolved as part of a functional fix in R1–R18)**

Applying the following four recurring patterns to every remaining file `CROSS_a11y.md` flags, beyond what R1/R5/R6/R7/R8/R12/R13/R14/R15/R17 already fixed inline while those files were open for functional reasons:
- **Icon-only buttons** (close buttons, delete/edit action icons across `AnnouncementForm.tsx`, `EventDetailPanel`, and every other icon-only trigger not already fixed) — add `aria-label` describing the action, not the icon.
- **Bespoke `<table>` markup not yet migrated to `DataTable.tsx`** (`hr/page.tsx`'s Directory and Leave Requests tables) — add `scope="col"` to header cells and a `<caption>`/`aria-label` identifying the table's purpose, or complete the `DataTable.tsx` migration if the table's data volume warrants it.
- **Form inputs relying on placeholder text alone** (`change-password/page.tsx`'s two password inputs, deferred explicitly from R1; `AnnouncementForm.tsx`'s title/body inputs, deferred from R13) — add real, associated `<label>` elements.
- **Status/validation messages with no `role="alert"`/`aria-live`** (`AnnouncementForm.tsx`'s form-level error message; the Library page's overdue-borrowings banner) — add the appropriate live-region role so a screen-reader user is proactively notified, not only a sighted user relying on visual placement.
- **`W/app/(auth)/reports/page.tsx`'s `RoleTabs`** — TARGETED EDIT (further edit on top of R14's rewrite). Add `role="tab"`/`role="tablist"`/`aria-selected` semantics — currently plain buttons with a visual-only active-state class, giving a screen-reader user no indication of which tab is active or that the group functions as tabs.

**J. Upstash Redis wiring**

- **`W/server/services/settingsService.ts`** — TARGETED EDIT. Replace the module-level in-memory `Map` cache with an Upstash Redis-backed cache — the existing code's own comment already defers this, but a cold Vercel Lambda instance starts with an empty cache (fetching from Neon on every request until warmed) and a multi-instance deployment can serve stale data from one instance while another serves fresh data after a write; this is a production-correctness issue, not a nice-to-have, and had no tracking ticket prior to this roadmap.
- **`W/server/services/auditService.ts`** — TARGETED EDIT. Back `logAsync`'s fire-and-forget writes with an Upstash Redis-backed queue — Lambda recycling after response completion can silently drop a MEDIUM/LOW-severity audit entry today, documented in the function's own JSDoc but never mitigated.
- **`W/lib/ratelimit.ts`** — no change. This file's own header comment makes an explicit, reasoned case for staying in-memory rather than Redis-backed (every authenticated route is already gated by Firebase token verification first, the user base is bounded, and the limiter exists to catch runaway loops rather than repel distributed attacks) — this roadmap respects that reasoning as a deliberate, sound decision rather than a gap to close.

**K. Operational readiness checklist (not code changes — infrastructure/DNS/provider configuration to verify before production launch)**

- **Resend sending-domain DKIM/SPF records**: confirm the school's actual sending domain has valid DKIM and SPF DNS records configured in Resend's dashboard — without them, a meaningful share of outbound mail (fee reminders, contract alerts, result releases, announcements — every pipeline this roadmap has spent multiple phases reconnecting) risks landing in spam or being rejected outright by recipient mail servers, regardless of how correct the application-layer code is.
- **Neon PostgreSQL Point-in-Time Recovery (PITR)**: confirm PITR/continuous backup is enabled on the production Neon project with a retention window appropriate to the school's operational needs — this is a provider-dashboard setting, not a code change, and this audit cannot confirm its current status from static source analysis alone.

### 3. CODE STRUCTURE FRAMEWORK

No NEW FILE beyond the Resend webhook route. Binding shape for the Sentry/Express integration (this phase's most structurally significant change):

```
// W/lib/api-app.ts (addition, before the domain routers are mounted but after core middleware)
import * as Sentry from '@sentry/node'
// ...
Sentry.setupExpressErrorHandler(app)
// mounted after all 23 domain routers, before globalErrorHandler, per Sentry's own
// documented Express integration convention — this is the piece that makes
// business-logic errors visible to Sentry for the first time

// W/app/api/webhooks/resend/route.ts (new)
import { verifyResendWebhook } from '@/lib/email'
export async function POST(request: Request) {
  // read raw body + svix headers, call verifyResendWebhook(), 401 on failure
  // on success: update delivery-status tracking as appropriate (new, minimal scope)
}
```

### 4. DEPENDENCIES

Depends on **every prior phase (R1–R18)** — this phase's test fixes assert against the real, corrected function signatures and return shapes those phases established (`gradeService.calcGrade()` from R7, `runPromotion`/`getCashFlowForecast`'s real shapes from R8/R10, `DataTable`'s real `data` prop from R15), and its accessibility sweep explicitly targets files left open by earlier phases' deferred a11y notes.

### 5. ACCEPTANCE CRITERIA

- `apps/web/.env.example` contains no real-shaped secret; a rotation ticket/record exists for all seven implicated external services
- An error thrown inside any of the 23 Express domain routers is visible in Sentry
- Only one client-side Sentry initialization file exists; session replay is masked and sampling is conservative in every environment
- `vercel.json`'s CSP no longer allowlists Algolia in `connect-src`
- All five real cron routes have a correctly-pathed, non-duplicate entry in `vercel.json`'s `crons` array; no phantom entries remain
- Changing the late-payment-penalty admin setting changes the actual rate the next penalty run applies
- The admin System Health view reports real email/push configuration status
- `npx vitest run` discovers and passes all six previously-broken unit test files
- `apps/web/package.json` has a working `"test"` script
- The full `student.spec.ts` E2E suite passes against a freshly-provisioned test environment using `create-test-accounts.mjs`'s real output
- Every Storybook story renders without a runtime `TypeError`, in CI (Ubuntu) as well as locally
- `change-password/page.tsx`'s and `AnnouncementForm.tsx`'s inputs have real associated labels; `hr/page.tsx`'s tables have `scope="col"` headers; `reports/page.tsx`'s `RoleTabs` exposes real tab semantics
- `settingsService.ts`'s cache is confirmed consistent across two simulated concurrent Lambda instances
- No TypeScript errors anywhere in the repository (`tsc --noEmit` passes with zero errors project-wide — the final, cumulative confirmation that every build-breaking instance this audit found across ten independent files has been resolved)

---

## Implementation Session Guide

Maps every Rn phase to the `/audit/` source file(s) containing its findings, so each implementation session can attach exactly the right audit file(s) with no re-explanation needed.

| Phase | Title | Source audit file(s) |
|---|---|---|
| R1 | API Client & Query-Key Singleton Consolidation | `CROSS_redundancy.md` (apiFetch/queryKeys duplication tally), `CROSS_integration.md` |
| R2 | Auth Session & Login Flow Correctness | `phase1A.md`, `CROSS_integration.md` |
| R3 | Gateway Hardening: Route Guards, CORS, Cron Auth, Error Hygiene & Attendance Decision | `phase1A.md`, `phase8A.md`, `phase8B.md`, `phase3D.md`, `CROSS_integration.md` |
| R4 | Auth/Security Domain: Permission Architecture, Zero-RBAC Search, Rate-Limit Identity, Audit-Log Consolidation | `phase8A.md`, `phase7B.md`, `phase10A.md`, `CROSS_integration.md` |
| R5 | Academics I: Admissions & Student Records | `phase2A.md`, `phase2B.md`, `CROSS_integration.md`, `CROSS_redundancy.md`, `CROSS_hardcoded.md` |
| R6 | Academics II: Classes, Assignments & the Attendance Rebuild | `phase2C.md`, `phase3D.md`, `phase1D_i.md`, `CROSS_integration.md`, `CROSS_redundancy.md` |
| R7 | Academics III: Exam Pipeline Repair & Grading Engine Unification | `phase3A.md`, `CROSS_integration.md`, `CROSS_redundancy.md`, `CROSS_hardcoded.md`, `CROSS_a11y.md` |
| R8 | Academics IV: Report Cards, Transcripts, Promotion & Risk Assessment | `phase3B.md`, `phase3C.md`, `CROSS_integration.md`, `CROSS_redundancy.md`, `CROSS_hardcoded.md` |
| R9 | Finance I: Invoicing, Fees & the Accounting Ledger Reconnection | `phase4A.md`, `phase4B.md`, `CROSS_integration.md`, `CROSS_redundancy.md`, `CROSS_hardcoded.md` |
| R10 | Finance II: Payroll, Forecasting & the Finance↔Library Reconciliation | `phase4C.md`, `phase4D.md`, `phase4E.md`, `CROSS_integration.md`, `CROSS_redundancy.md`, `CROSS_hardcoded.md` |
| R11 | HR Domain: Loans UI, Leave-Conflict Wiring & Directory Access Correction | `phase5A.md`, `CROSS_integration.md`, `CROSS_redundancy.md`, `CROSS_hardcoded.md`, `CROSS_a11y.md` |
| R12 | Library Domain & the Storage API Contract Fix | `phase6A.md`, `phase8C.md`, `CROSS_integration.md`, `CROSS_redundancy.md`, `CROSS_hardcoded.md`, `CROSS_a11y.md` |
| R13 | Announcements, Timetable & Calendar Domain | `phase7C.md`, `phase7D.md`, `phase3D.md`, `CROSS_integration.md`, `CROSS_redundancy.md`, `CROSS_hardcoded.md`, `CROSS_a11y.md` |
| R14 | Analytics & Reports Domain | `phase7A.md`, `CROSS_integration.md`, `CROSS_redundancy.md`, `CROSS_hardcoded.md`, `CROSS_a11y.md` |
| R15 | UI/UX Polish: Shared Components, Dashboards, Confirmation Dialogs & Data-Display Consistency | `phase1D_ii.md`, `phase1D_iii.md`, plus GAPS sections of `phase2A.md`, `phase3A.md`, `phase4A.md`, `phase4C.md`, `phase4E.md`, `phase1B.md` (confirmation-dialog/pagination/empty-state instances) |
| R16 | Constants Centralization | `phase10B.md` (primary source, full plan), `CROSS_hardcoded.md`, `CROSS_constants_and_charts.md`, `phase10A.md` |
| R17 | Unified Charting Architecture | `phase10C.md` (primary source, full plan), `CROSS_constants_and_charts.md` |
| R18 | University Placement Module | `phase11.md` (primary source, full blueprint) |
| R19 | Final Hardening: Accessibility, Testing, Observability & Production Readiness | `CROSS_a11y.md` (primary source), `phase8B.md`, `phase8D.md`, `phase8E.md`, `phase9A.md`, `phase9B.md`, `phase9C.md`, `CROSS_redundancy.md`, `CROSS_hardcoded.md` |

Supporting reference for every phase, not re-listed per row: `MANIFEST.md` (file-tree/phase-tag cross-check), `PERMISSIONS_MAP.md` (the 218-permission ground truth every role-list correction in this roadmap is checked against), `CONSTRAINTS.md` and `README.md` (methodology and path shorthands).
