/**
 * apps/web/test/security/accessPolicy.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: The declared access policy for every server entry point that is
 *   NOT simply "verifyAuth + a role/permission gate in the middleware chain".
 *   src/server/routes/__tests__/routeContract.test.ts fails CI when:
 *     - a new Express endpoint has no auth + gate AND is not declared here
 *       (so a developer must consciously choose public / own-data /
 *       object-checked / reference-data and write down why);
 *     - an entry here no longer matches a real endpoint (stale policy);
 *     - a new Next.js route handler is not declared in ROUTE_HANDLER_POLICY.
 *
 *   Categories
 *     public-site       no identity; read of published content or a rate-limited, validated public form
 *     public-telemetry  pre-login telemetry (caller cannot have a token yet)
 *     cron-or-admin     CRON_SECRET bearer or verified admin
 *     own-data          the subject is the verified uid; no client-supplied owner id is trusted
 *     object-checked    a client-supplied id is checked against the verified caller INSIDE the
 *                       handler/service (ownership, class membership, requester, capability)
 *     reference-data    non-sensitive data any signed-in user may read
 *
 *   Adding an endpoint here is a security decision: say WHY the middleware
 *   chain alone is not the policy, and add negative tests for it.
 */

export type PolicyCategory =
  | 'public-site'
  | 'public-telemetry'
  | 'cron-or-admin'
  | 'own-data'
  | 'object-checked'
  | 'reference-data'

export interface EndpointPolicy {
  category: PolicyCategory
  reason: string
}

/** Keyed `METHOD /api/path` exactly as the inventory prints it. */
export const ENDPOINT_POLICY: Readonly<Record<string, EndpointPolicy>> = {
  "GET /api/classes/subject-assignments/mine": { category: 'own-data', reason: "Subject is the verified uid from the token; no client-supplied owner id is trusted." },
  "GET /api/classes/my-timetable/today": { category: 'own-data', reason: "Subject is the verified uid from the token; no client-supplied owner id is trusted." },
  "GET /api/classes/:classId/assignments": { category: 'object-checked', reason: "assignmentService enforces class membership / subject-teacher relationship for every id (see assignmentIsolation tests)." },
  "GET /api/classes/:classId/assignments/:id": { category: 'object-checked', reason: "assignmentService enforces class membership / subject-teacher relationship for every id (see assignmentIsolation tests)." },
  "GET /api/classes/:classId/assignments/:id/roster": { category: 'object-checked', reason: "assignmentService enforces class membership / subject-teacher relationship for every id (see assignmentIsolation tests)." },
  "GET /api/classes/:classId/assignments/:id/submissions/:studentId/file": { category: 'object-checked', reason: "assignmentService enforces class membership / subject-teacher relationship for every id (see assignmentIsolation tests)." },
  "POST /api/classes/:classId/assignments/:id/submit/upload-ticket": { category: 'object-checked', reason: "assignmentService enforces class membership / subject-teacher relationship for every id (see assignmentIsolation tests)." },
  "POST /api/classes/:classId/assignments/:id/submit": { category: 'object-checked', reason: "assignmentService enforces class membership / subject-teacher relationship for every id (see assignmentIsolation tests)." },
  "POST /api/applications/public": { category: 'public-site', reason: "Public admission form; rate-limited (public-application), body validated by Zod in the handler." },
  "GET /api/assignments": { category: 'object-checked', reason: "assignmentService enforces class membership / subject-teacher relationship for every id (see assignmentIsolation tests)." },
  "GET /api/assignments/:id": { category: 'object-checked', reason: "assignmentService enforces class membership / subject-teacher relationship for every id (see assignmentIsolation tests)." },
  "GET /api/assignments/:id/roster": { category: 'object-checked', reason: "assignmentService enforces class membership / subject-teacher relationship for every id (see assignmentIsolation tests)." },
  "GET /api/assignments/:id/submissions/:studentId/file": { category: 'object-checked', reason: "assignmentService enforces class membership / subject-teacher relationship for every id (see assignmentIsolation tests)." },
  "POST /api/assignments/:id/submit/upload-ticket": { category: 'object-checked', reason: "assignmentService enforces class membership / subject-teacher relationship for every id (see assignmentIsolation tests)." },
  "POST /api/assignments/:id/submit": { category: 'object-checked', reason: "assignmentService enforces class membership / subject-teacher relationship for every id (see assignmentIsolation tests)." },
  "GET /api/attendance/student/:studentId": { category: 'object-checked', reason: "Staff need an attendance permission; a student must own the studentId (firebaseUid match)." },
  "GET /api/finances/credits/:studentId": { category: 'object-checked', reason: "Student ownership via assertStudentOwnership; staff limited to FINANCE_ROLES." },
  "GET /api/payroll/my-payslips": { category: 'own-data', reason: "Subject is the verified uid from the token; no client-supplied owner id is trusted." },
  "GET /api/payroll/my-salary": { category: 'own-data', reason: "Subject is the verified uid from the token; no client-supplied owner id is trusted." },
  "GET /api/payroll/payslips/:id/download": { category: 'object-checked', reason: "canReadFile(payslip) with ownerUid = payslip.staffUid." },
  "GET /api/exams/results/:studentId": { category: 'object-checked', reason: "Permission gate (exam.viewAllResults / viewOwnResults) plus student ownership resolved from firebaseUid; fee gate in service." },
  "GET /api/exams/results/:studentId/class-standing": { category: 'object-checked', reason: "Permission gate (exam.viewAllResults / viewOwnResults) plus student ownership resolved from firebaseUid; fee gate in service." },
  "GET /api/exams/report-card/:studentId": { category: 'object-checked', reason: "Permission gate (exam.viewAllResults / viewOwnResults) plus student ownership resolved from firebaseUid; fee gate in service." },
  "GET /api/exams/report-card/:studentId/data": { category: 'object-checked', reason: "Permission gate (exam.viewAllResults / viewOwnResults) plus student ownership resolved from firebaseUid; fee gate in service." },
  "POST /api/exams/report-card/mine": { category: 'own-data', reason: "Subject is the verified uid from the token; no client-supplied owner id is trusted." },
  "GET /api/users/me/sex": { category: 'own-data', reason: "Subject is the verified uid from the token; no client-supplied owner id is trusted." },
  "GET /api/users/me/notification-prefs": { category: 'own-data', reason: "Subject is the verified uid from the token; no client-supplied owner id is trusted." },
  "PATCH /api/users/me/notification-prefs": { category: 'own-data', reason: "Subject is the verified uid from the token; no client-supplied owner id is trusted." },
  "POST /api/users/me/clear-password-change-flag": { category: 'own-data', reason: "Subject is the verified uid from the token; no client-supplied owner id is trusted." },
  "GET /api/health/ping": { category: 'public-site', reason: "Liveness probe; returns a constant, touches no data." },
  "GET /api/settings/exam/ca-config": { category: 'reference-data', reason: "Non-sensitive reference data (public settings / grading scale / holidays / capability flags) readable by any signed-in user." },
  "GET /api/settings/grading-scales": { category: 'reference-data', reason: "Non-sensitive reference data (public settings / grading scale / holidays / capability flags) readable by any signed-in user." },
  "GET /api/settings/notifications": { category: 'own-data', reason: "Subject is the verified uid from the token; no client-supplied owner id is trusted." },
  "PATCH /api/settings/notifications": { category: 'own-data', reason: "Subject is the verified uid from the token; no client-supplied owner id is trusted." },
  "GET /api/settings/public": { category: 'reference-data', reason: "Non-sensitive reference data (public settings / grading scale / holidays / capability flags) readable by any signed-in user." },
  "GET /api/settings/:key": { category: 'object-checked', reason: "Only declared keys; non-public keys need admin/high_rank (handler)." },
  "POST /api/pending-actions/expire-stale": { category: 'cron-or-admin', reason: "Constant-time CRON_SECRET bearer OR verified admin (verifyCronOrAdmin)." },
  "GET /api/pending-actions": { category: 'own-data', reason: "Reviewers see all; every other role is scoped to requestedByUid = caller (handler)." },
  "GET /api/pending-actions/entity/:type/:id": { category: 'object-checked', reason: "Reviewers see all; everyone else is filtered to their own requests (Issue 7 fix)." },
  "GET /api/pending-actions/:id": { category: 'object-checked', reason: "Non-reviewers may only read a row they requested (handler 403)." },
  "POST /api/pending-actions": { category: 'object-checked', reason: "Handler requires the permission for the underlying operation (REQUEST_PERMISSION) and Zod-validates the body." },
  "PATCH /api/pending-actions/:id/cancel": { category: 'object-checked', reason: "pendingActionService.cancel: requester or reviewer only." },
  "GET /api/approvals": { category: 'object-checked', reason: "Approvals Hub: every read/decision is evaluated per item by computeCapabilities (module permission + self-review block)." },
  "GET /api/approvals/summary": { category: 'object-checked', reason: "Approvals Hub: every read/decision is evaluated per item by computeCapabilities (module permission + self-review block)." },
  "GET /api/approvals/badge": { category: 'object-checked', reason: "Approvals Hub: every read/decision is evaluated per item by computeCapabilities (module permission + self-review block)." },
  "POST /api/approvals/bulk": { category: 'object-checked', reason: "Approvals Hub: every read/decision is evaluated per item by computeCapabilities (module permission + self-review block)." },
  "GET /api/approvals/:source/:id": { category: 'object-checked', reason: "Approvals Hub: every read/decision is evaluated per item by computeCapabilities (module permission + self-review block)." },
  "POST /api/approvals/:source/:id/decision": { category: 'object-checked', reason: "Approvals Hub: every read/decision is evaluated per item by computeCapabilities (module permission + self-review block)." },
  "GET /api/notifications/feed": { category: 'own-data', reason: "Subject is the verified uid from the token; no client-supplied owner id is trusted." },
  "PATCH /api/notifications/feed/read-all": { category: 'own-data', reason: "Subject is the verified uid from the token; no client-supplied owner id is trusted." },
  "PATCH /api/notifications/feed/:id/read": { category: 'own-data', reason: "Subject is the verified uid from the token; no client-supplied owner id is trusted." },
  "POST /api/notifications/register-token": { category: 'own-data', reason: "Subject is the verified uid from the token; no client-supplied owner id is trusted." },
  "DELETE /api/notifications/unregister-token": { category: 'own-data', reason: "Subject is the verified uid from the token; no client-supplied owner id is trusted." },
  "GET /api/notifications/token-status": { category: 'own-data', reason: "Subject is the verified uid from the token; no client-supplied owner id is trusted." },
  "POST /api/hr/leave/apply": { category: 'own-data', reason: "Subject is the verified uid from the token; no client-supplied owner id is trusted." },
  "PATCH /api/hr/leave/requests/:id/cancel": { category: 'object-checked', reason: "hrService.cancelLeave compares the request owner with the verified uid (403 otherwise)." },
  "GET /api/hr/loans/mine": { category: 'own-data', reason: "Subject is the verified uid from the token; no client-supplied owner id is trusted." },
  "POST /api/hr/loans/request": { category: 'own-data', reason: "Subject is the verified uid from the token; no client-supplied owner id is trusted." },
  "POST /api/library/fine-waivers": { category: 'object-checked', reason: "Caller must hold waiveFine or own the fine (libService.fineBelongsTo)." },
  "POST /api/auth/log-login-success": { category: 'own-data', reason: "Subject is the verified uid from the token; no client-supplied owner id is trusted." },
  "POST /api/auth/heartbeat": { category: 'own-data', reason: "Subject is the verified uid from the token; no client-supplied owner id is trusted." },
  "POST /api/auth/log-logout": { category: 'own-data', reason: "Subject is the verified uid from the token; no client-supplied owner id is trusted." },
  "POST /api/auth/log-login-failed": { category: 'public-telemetry', reason: "Pre-login failed-attempt telemetry (the caller has no token yet); rate-limited, email validated by Zod, writes only a counter/audit row." },
  "GET /api/analytics/capabilities": { category: 'reference-data', reason: "Non-sensitive reference data (public settings / grading scale / holidays / capability flags) readable by any signed-in user." },
  "GET /api/calendar/events": { category: 'reference-data', reason: "Aggregated calendar is filtered per role/uid inside the handler; window validated (Issue 7)." },
  "GET /api/public/school-info": { category: 'public-site', reason: "Public marketing-site read; returns only content explicitly published for the public (no personal data)." },
  "GET /api/public/maneb-stats": { category: 'public-site', reason: "Public marketing-site read; returns only content explicitly published for the public (no personal data)." },
  "GET /api/public/announcements": { category: 'public-site', reason: "Public marketing-site read; returns only content explicitly published for the public (no personal data)." },
  "GET /api/public/announcements/:id": { category: 'public-site', reason: "Public marketing-site read; returns only content explicitly published for the public (no personal data)." },
  "GET /api/public/news": { category: 'public-site', reason: "Public marketing-site read; returns only content explicitly published for the public (no personal data)." },
  "GET /api/public/news/:id": { category: 'public-site', reason: "Public marketing-site read; returns only content explicitly published for the public (no personal data)." },
  "GET /api/public/academic-advertisements": { category: 'public-site', reason: "Public marketing-site read; returns only content explicitly published for the public (no personal data)." },
  "GET /api/public/academic-advertisements/:id": { category: 'public-site', reason: "Public marketing-site read; returns only content explicitly published for the public (no personal data)." },
  "GET /api/public/events": { category: 'public-site', reason: "Public marketing-site read; returns only content explicitly published for the public (no personal data)." },
  "GET /api/public/events/:id": { category: 'public-site', reason: "Public marketing-site read; returns only content explicitly published for the public (no personal data)." },
  "POST /api/public/newsletter/subscribe": { category: 'public-site', reason: "Public form (newsletter / contact); per-identifier rate limit, Zod-validated, no data returned beyond an acknowledgement." },
  "GET /api/public/newsletter/confirm": { category: 'public-site', reason: "Public marketing-site read; returns only content explicitly published for the public (no personal data)." },
  "GET /api/public/newsletter/unsubscribe": { category: 'public-site', reason: "Public marketing-site read; returns only content explicitly published for the public (no personal data)." },
  "POST /api/public/contact": { category: 'public-site', reason: "Public form (newsletter / contact); per-identifier rate limit, Zod-validated, no data returned beyond an acknowledgement." },
  "GET /api/public/placements": { category: 'public-site', reason: "Public marketing-site read; returns only content explicitly published for the public (no personal data)." },
  "GET /api/public/placement-stats": { category: 'public-site', reason: "Public marketing-site read; returns only content explicitly published for the public (no personal data)." },
  "GET /api/public/gallery": { category: 'public-site', reason: "Public marketing-site read; returns only content explicitly published for the public (no personal data)." },
  "GET /api/public/leadership": { category: 'public-site', reason: "Public marketing-site read; returns only content explicitly published for the public (no personal data)." },
  "GET /api/public/fee-structure": { category: 'public-site', reason: "Public marketing-site read; returns only content explicitly published for the public (no personal data)." },
  "GET /api/holidays": { category: 'reference-data', reason: "Non-sensitive reference data (public settings / grading scale / holidays / capability flags) readable by any signed-in user." },
}

export type RouteHandlerPolicy =
  | 'express-gateway'   // /api/[[...slug]] — delegates to the Express app (policies above)
  | 'cron'              // must call guardCron() before any work
  | 'webhook-signature' // must verify a provider signature before reading the payload
  | 'bearer-file-proxy' // must verify a Firebase ID token AND canReadFile() before streaming
  | 'public-static'     // serves static public text

/** Keyed by URL path (as the inventory prints it). */
export const ROUTE_HANDLER_POLICY: Readonly<Record<string, RouteHandlerPolicy>> = {
  '/api/[[...slug]]': 'express-gateway',
  '/api/cron/contract-alerts': 'cron',
  '/api/cron/daily-tasks': 'cron',
  '/api/cron/fee-reminders': 'cron',
  '/api/cron/installment-check': 'cron',
  '/api/cron/late-penalties': 'cron',
  '/api/cron/overdue-library': 'cron',
  '/api/cron/risk-detection': 'cron',
  '/api/cron/scheduled-announcements': 'cron',
  '/api/cron/vercel-sync': 'cron',
  '/api/files/[fileId]': 'bearer-file-proxy',
  '/api/webhooks/resend': 'webhook-signature',
  '/api/webhooks/sentry': 'webhook-signature',
  '/llms.txt': 'public-static',
}

/** Files that contain 'use server' actions. Every exported action must authenticate (checked by the contract test). */
export const SERVER_ACTION_FILES: readonly string[] = ['src/actions/settings.actions.ts']

/**
 * Staff-only mutations that a student-role token must NEVER reach. Anything a
 * student CAN reach through the middleware chain alone must be listed here
 * with the reason it is self-service; everything else fails the contract test.
 */
export const STUDENT_REACHABLE_MUTATIONS: Readonly<Record<string, string>> = {
  'POST /api/classes/:classId/assignments/:id/view': 'Records the student\'s own first view; assignmentService checks enrolment in the class.',
  'POST /api/assignments/:id/view': 'Same handler mounted at the short path.',
  'POST /api/announcements/draft': 'Matrix grants student announcement.createWithApproval (pending approval); never publishes directly.',
  'PATCH /api/announcements/:id/draft': 'Own drafts only (announcementService: "You can only edit your own drafts").',
  'PATCH /api/announcements/:id/publish': 'Submits own draft for approval; never publishes directly.',
  'POST /api/announcements/image/upload-ticket': 'Upload ticket for the announcement image prefix; no read access is granted.',
  'POST /api/announcements': 'Creates a PENDING_APPROVAL announcement (directPublish is false without announcement.publishDirect).',
  'PATCH /api/announcements/:id': 'announcement.editOwn — handler returns 403 unless the caller authored it.',
  'DELETE /api/announcements/:id': 'announcement.deleteOwn — handler returns 403 unless the caller authored it.',
  'POST /api/placements/me/claim': 'placement.recordOwnChoice — writes only the caller\'s own claim.',
  'POST /api/placements/advisory': 'Stateless advisory calculator (placement.view).',
  'POST /api/placements/advisory/explain': 'Stateless AI explanation of the advisory result; rate-limited (ai-explain).',
  'POST /api/monitoring/feedback': 'Report-a-problem form (monitoring.submitFeedback), open to every role by design.',
}
