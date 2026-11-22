# Issue 7 — Authorization parity audit: findings and status

Scope: every Express endpoint mounted in `src/lib/api-app.ts` (reached through the `/api/[[...slug]]` gateway), every Next.js Route Handler (cron, webhooks, file proxy), every Server Action, and the Firestore rules.

Companion documents (generated from source, kept current by CI):

- [`endpoint-inventory.md`](./endpoint-inventory.md) — all 557 Express endpoints, 14 route handlers and 7 server actions, with their auth, gate, declared policy and client-supplied IDs.
- [`role-resource-matrix.md`](./role-resource-matrix.md) — read own / assigned / all, create, update, approve / release, delete / void and export, per resource, for the nine roles plus the `superUser` claim.

## 1. Result against the acceptance criteria

| Criterion | Status | How it is enforced |
|---|---|---|
| Every non-public endpoint has a server-side authentication check | Met | 534 of 557 Express endpoints run `verifyAuth`. The other 23 are public by design (marketing site, public forms, liveness probe, pre-login telemetry, one cron-or-admin endpoint), each declared with a reason in `test/security/accessPolicy.ts`. Route handlers and Server Actions are checked separately. |
| Every mutation has a UI-independent permission check | Met | 220 of 248 mutations carry a `requirePermission*` / `requireRole` gate. The rest are declared `own-data` or `object-checked` and the contract test proves a student cannot reach any undeclared staff mutation. |
| Resource IDs cannot be swapped | Met for everything reviewed; see §4 for what was trusted rather than re-tested | Object-level checks for IDs are declared per endpoint, and the HTTP negative tests exercise the swap on exam results and pending actions. |
| Sensitive exports and downloads enforce permission at download time | Met | `/api/files/[fileId]` verifies the token (revocation checked), then `canReadFile`, then streams. Payslip download uses `canReadFile` with the payslip owner. Contract test pins the order. |
| Tests cover allowed and denied cases per endpoint group | Met | Contract test runs the real middleware for all 9 roles + unauthenticated + super user; 34 HTTP-level negative tests; 22 service-level approval-parity tests. |
| New endpoints fail CI if they lack a declared access policy or tests | Met | `routeContract.test.ts` fails on an endpoint with no auth + gate and no declared policy, on a stale policy entry, on an undeclared route handler, and on an unmounted router. `securityDocs.test.ts` fails when the generated docs are stale. |

"Declared policy" means a developer must write down *why* the middleware chain alone is not the policy and which category applies. There is no way to add an unprotected endpoint without that being visible in review.

## 2. Findings that were fixed

| # | Severity | Finding | Fix | Tests |
|---|---|---|---|---|
| F1 | High | `GET /exams/results/:studentId` and `/class-standing` only checked ownership for students. Any signed-in **staff** role (library, hr, finance, lower_rank, academic) could read any student's results by ID. | `assertResultsAccess` in `routes/exams.ts`: students need `exam.viewOwnResults` and must own the ID; staff need `exam.viewAllResults` (admin, high_rank, exam_officer). `academicYear` / `term` validated before any query. | `authzNegative.test.ts` |
| F2 | High | Separation of duties bypass. The Approvals Hub blocks reviewing your own request, but the original per-module endpoints (leave review, loan approve / reject, expense approve / reject, payroll approve / return, library fine-waiver approve / reject, asset request approve / reject) were independently callable, so a requester could approve their own item there. | Shared `assertNotSelfReview` (`server/lib/selfReview.ts`) called from each service, so every entry point enforces the Hub's rule. Applies to the super user too, as the Hub already does. | `approvalParity.test.ts` |
| F3 | High | `disburseLoan` was read-then-write, so two concurrent calls could both disburse. `recordLoanRepayment` accepted negative / non-finite amounts and loans in any status. | Atomic `updateMany({ where: { id, status: 'APPROVED' } })` with 404 / 409; repayment requires a finite positive amount and status `DISBURSED` / `REPAYING`. The payroll caller is compatible. | `approvalParity.test.ts` |
| F4 | Medium | `GET /pending-actions/entity/:type/:id` returned every user's pending changes, including `targetState`, to any signed-in user. `POST /pending-actions` had no body validation. | Non-reviewers are filtered to their own `requestedByUid`. Zod schema bounds field lengths, `targetState` size / shape and `expiresAt`. | `authzNegative.test.ts` |
| F5 | Medium | Cron authentication was hand-rolled in nine routes with a plain string compare. Two routes echoed `err.message`. | `guardCron()` / `isValidCronAuthorization` (SHA-256 + `timingSafeEqual`; fails closed if `CRON_SECRET` is unset). Error echo removed. `pending-actions/expire-stale` uses the same check. | `cronAuth.test.ts`, `routeContract.test.ts` |
| F6 | Medium | `firestore.rules`: `calendar_events` let every staff role read all events and create / edit / delete directly with the public Web API key, bypassing the API's permission checks and audience filtering. Nothing in the app uses that path. | Deny all client access (`allow read, write: if false`). The Admin SDK is unaffected. **Needs a rules deploy.** | Manual (rules are not unit-tested here) |
| F7 | Medium | `sendError` returned raw `err.message` for 5xx and infrastructure errors (Prisma, Firebase, Appwrite, Resend), which can contain table / column names and provider response bodies. | `clientMessageFor`: deliberate 4xx messages are kept; everything else returns a fixed message outside local development. The real error still goes to Sentry and the log. | `sendError.test.ts`, `authzNegative.test.ts` |
| F8 | Low–Medium | `getIdTokenFromRequest` (used by the file proxy) called `verifyIdToken(token)` without the revocation check, so a revoked session kept download access. | `verifyIdToken(token, true)`. | `routeContract.test.ts` |
| F9 | Low | Resend webhook accepted a non-finite timestamp and logged recipient addresses. | Non-finite timestamps rejected; logs a recipient count only. | `routeContract.test.ts` |
| F10 | Low | Input validation gaps: `PATCH /users/:uid/disable` treated the string `"false"` as truthy; notification feed ID unbounded; student list filters unvalidated; calendar window unbounded; `PATCH /settings/notifications` accepted unknown keys. | Strict Zod schemas / bounded parsing on each. | `authzNegative.test.ts` for users and pending actions |

## 3. Behaviour changes to be aware of

- **Self-review is now blocked on the per-module endpoints.** A person who raised a leave request, loan, expense, payroll run, fine waiver or asset request gets `403` if they try to approve or reject it. If a small team needs one person to do both, that is a policy decision to make explicitly; do not remove the guard.
- **Staff roles other than admin, high_rank and exam_officer lose access to another student's exam results.** The UI only calls these endpoints for the signed-in student, so no screen should change. Teachers continue to use the class-level exam endpoints.
- **5xx responses now carry a generic message** (`An internal server error occurred.`). Clients that displayed the raw server text will show that instead. Local development (`NODE_ENV=development`) still shows the real text.
- **Disbursing a loan twice** now returns `409` for the second caller.
- **Calendar events can no longer be read or written directly from the browser.** The API path is unchanged.

## 4. Open items and things deliberately not changed

| Item | Why it matters | Recommendation |
|---|---|---|
| The gateway exports only `GET`, `POST`, `PATCH`, `DELETE`, `OPTIONS`, but the client calls `PUT` for `/classes/:id/subjects`, `/hr/:id/salary` and assignment marks. | These calls may not reach Express on a production build. Not an authorization gap, but it affects whether the gated endpoints are reachable. | Confirm in a deployed environment; add `PUT` to the gateway if those calls fail. Not changed because it widens the surface and needs a decision. |
| `service-account.json` (a Firebase Admin private key) is present in the zip. It is gitignored. | Anyone with the zip has full Admin SDK access, which bypasses every Firestore rule. | Rotate the key if the archive was shared outside the team. |
| `getIdTokenFromRequest` still accepts `?token=` in the query string. | Tokens in URLs end up in logs and referrers. It is needed for `<img>` / download links. | Prefer a short-lived signed URL for downloads, then drop the query-string path. |
| Student announcement targeting is not limited to the student's own class. | Product decision, not a clear defect. | Decide whether students should see only their class and school-wide announcements. |
| Digital-resource self-approval (`libraryService.approveDigitalResource`) is not blocked. | The Hub rule list does not include it; changing it alters workflow. | Add to the Hub's `blockSelfReview` set and the service if wanted. |
| `/exams/analytics/class` lets `academic` read any `classId`. | Reviewed lightly. May be intended (heads of department). | Confirm intent; if not, restrict to the teacher's own classes. |
| Teacher marks ownership (who may enter marks for which class) is enforced in the service layer. | Trusted from the existing assignment tests; not re-tested here. | Add an HTTP-level negative test when marks entry is next changed. |
| Firestore rules are not covered by an automated test. | A rules regression would not fail CI. | Add the Firebase emulator rules-unit-testing suite. |

## 5. Method, mapped to the ten audit steps

| Step | Done | Where |
|---|---|---|
| 1. Endpoint inventory | Yes | `test/security/endpointInventory.ts`; `docs/security/endpoint-inventory.md` |
| 2. Authentication at the boundary | Yes | Contract test; `verifyAuth` revocation fix (F8) |
| 3. Object-level authorization | Yes | F1, F4; declared `object-checked` set |
| 4. Server-side body / query validation | Yes, for the endpoints reviewed | F4, F10 |
| 5. Authorization before side effects | Yes | Server-action ordering and cron / webhook ordering pinned by the contract test; F3 makes the state check atomic |
| 6. Least-privilege response DTOs | Partly | F4 stops `targetState` leaking; no blanket DTO rewrite was made. Worth a follow-up pass on list endpoints that return full Prisma rows. |
| 7. Direct DB access / Firestore and Storage rules | Yes | F6; other collections were already server-only |
| 8. Error and log behaviour | Yes | F7, F5, F9 |
| 9. Negative tests first | Yes | `authzNegative.test.ts`, `approvalParity.test.ts`, `routeContract.test.ts` |
| 10. Automated route-contract tests | Yes | `routeContract.test.ts`, `securityDocs.test.ts` (both run in the existing CI `vitest` step) |

## 6. How to add an endpoint without breaking CI

1. Put `verifyAuth` and a `requirePermission*` / `requireRole` gate on the route. That alone satisfies the contract test.
2. If the route is genuinely public, own-data, object-checked or reference-data, add an entry to `ENDPOINT_POLICY` in `test/security/accessPolicy.ts` and say why. Add negative tests.
3. Run `pnpm --filter web docs:security` and commit the regenerated docs.
4. A new Route Handler needs an entry in `ROUTE_HANDLER_POLICY` and must follow its pattern (cron → `guardCron()` first; webhook → verify the signature before parsing).
