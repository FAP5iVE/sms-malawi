<!-- GENERATED FILE — do not edit by hand. Run `pnpm --filter web docs:security` to regenerate. -->

# Server endpoint inventory

Every server entry point, extracted from source by `test/security/endpointInventory.ts` (the same extractor `routeContract.test.ts` uses to fail CI on an unprotected endpoint). **Auth** is enforced by `verifyAuth` (Firebase ID token, revocation checked). **Gate** is the role/permission middleware that runs *before* the handler. **Declared policy** is the explicit decision recorded in `test/security/accessPolicy.ts` for endpoints whose protection is not simply "auth + gate".

## Summary

| Measure | Count |
|---|---:|
| Express endpoints (mounted under `/api`) | 626 |
| — mutations (non-GET) | 292 |
| — with a role/permission gate | 537 (262 mutations) |
| — signed-in only, with a declared policy | 64 |
| — public (no identity) | 25 |
| — declared `cron-or-admin` | 1 |
| — declared `object-checked` | 32 |
| — declared `own-data` | 26 |
| — declared `public-site` | 23 |
| — declared `public-telemetry` | 1 |
| — declared `reference-data` | 6 |
| Next.js route handlers | 14 |
| Server Actions | 7 |
| Routers declared but never mounted | 0 |

## Next.js route handlers

| Path | Methods | Declared policy | Source |
|---|---|---|---|
| `/api/[[...slug]]` | GET, POST, PUT, PATCH, DELETE, OPTIONS | express-gateway | `src/app/api/[[...slug]]/route.ts` |
| `/api/cron/contract-alerts` | GET | cron | `src/app/api/cron/contract-alerts/route.ts` |
| `/api/cron/daily-tasks` | GET | cron | `src/app/api/cron/daily-tasks/route.ts` |
| `/api/cron/fee-reminders` | GET | cron | `src/app/api/cron/fee-reminders/route.ts` |
| `/api/cron/installment-check` | GET | cron | `src/app/api/cron/installment-check/route.ts` |
| `/api/cron/late-penalties` | GET | cron | `src/app/api/cron/late-penalties/route.ts` |
| `/api/cron/overdue-library` | GET | cron | `src/app/api/cron/overdue-library/route.ts` |
| `/api/cron/risk-detection` | GET | cron | `src/app/api/cron/risk-detection/route.ts` |
| `/api/cron/scheduled-announcements` | GET | cron | `src/app/api/cron/scheduled-announcements/route.ts` |
| `/api/cron/vercel-sync` | GET | cron | `src/app/api/cron/vercel-sync/route.ts` |
| `/api/files/[fileId]` | GET | bearer-file-proxy | `src/app/api/files/[fileId]/route.ts` |
| `/api/webhooks/resend` | POST | webhook-signature | `src/app/api/webhooks/resend/route.ts` |
| `/api/webhooks/sentry` | POST | webhook-signature | `src/app/api/webhooks/sentry/route.ts` |
| `/llms.txt` | GET | public-static | `src/app/llms.txt/route.ts` |

## Server Actions

Every exported action must authenticate (`requireCurrentUser`) before any side effect — enforced by `routeContract.test.ts`.

| Action | Source |
|---|---|
| `setMaintenanceMode` | `src/actions/settings.actions.ts` |
| `updateAcademicSettings` | `src/actions/settings.actions.ts` |
| `updateExamSettings` | `src/actions/settings.actions.ts` |
| `updateFinanceSettings` | `src/actions/settings.actions.ts` |
| `updateHRSettings` | `src/actions/settings.actions.ts` |
| `updateLibrarySettings` | `src/actions/settings.actions.ts` |
| `updateSchoolIdentity` | `src/actions/settings.actions.ts` |

Server Action files in scope: `src/actions/settings.actions.ts`.

## Self-service mutations reachable by students

A student token passes `verifyAuth`; any mutation that is reachable without a gate must be listed here with the reason it is safe (own data only). The contract test fails for any other.

| Endpoint | Why a student may call it |
|---|---|
| `DELETE /api/announcements/:id` | announcement.deleteOwn — handler returns 403 unless the caller authored it. |
| `PATCH /api/announcements/:id` | announcement.editOwn — handler returns 403 unless the caller authored it. |
| `PATCH /api/announcements/:id/draft` | Own drafts only (announcementService: "You can only edit your own drafts"). |
| `PATCH /api/announcements/:id/publish` | Submits own draft for approval; never publishes directly. |
| `POST /api/announcements` | Creates a PENDING_APPROVAL announcement (directPublish is false without announcement.publishDirect). |
| `POST /api/announcements/draft` | Matrix grants student announcement.createWithApproval (pending approval); never publishes directly. |
| `POST /api/announcements/image/upload-ticket` | Upload ticket for the announcement image prefix; no read access is granted. |
| `POST /api/assignments/:id/view` | Same handler mounted at the short path. |
| `POST /api/classes/:classId/assignments/:id/view` | Records the student's own first view; assignmentService checks enrolment in the class. |
| `POST /api/monitoring/feedback` | Report-a-problem form (monitoring.submitFeedback), open to every role by design. |
| `POST /api/placements/advisory` | Stateless advisory calculator (placement.view). |
| `POST /api/placements/advisory/explain` | Stateless AI explanation of the advisory result; rate-limited (ai-explain). |
| `POST /api/placements/me/claim` | placement.recordOwnChoice — writes only the caller's own claim. |

## Express endpoints

Columns: **Client IDs** = path params plus `body` / `query` when the handler reads them (each is untrusted input); **M** = mutation.


### algoliaAdmin

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
| ● | POST | `/api/algolia-admin/configure-indices` | `requireRole([admin])` |  | — |
| ● | POST | `/api/algolia-admin/seed-announcements` | `requireRole([admin])` |  | — |
| ● | POST | `/api/algolia-admin/seed-applications` | `requireRole([admin])` |  | — |
| ● | POST | `/api/algolia-admin/seed-assets` | `requireRole([admin])` |  | — |
| ● | POST | `/api/algolia-admin/seed-books` | `requireRole([admin])` |  | — |
| ● | POST | `/api/algolia-admin/seed-invoices` | `requireRole([admin])` |  | — |
| ● | POST | `/api/algolia-admin/seed-placements` | `requireRole([admin])` |  | — |
| ● | POST | `/api/algolia-admin/seed-staff` | `requireRole([admin])` |  | — |
| ● | POST | `/api/algolia-admin/seed-students` | `requireRole([admin])` |  | — |
| ● | POST | `/api/algolia-admin/seed-user-accounts` | `requireRole([admin])` |  | — |
|  | GET | `/api/algolia-admin/status` | `requireRole([admin])` |  | — |

### analytics

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/analytics/academic/assignment-completion` | `requirePermission(report.viewAssignmentCompletion)` |  | — |
|  | GET | `/api/analytics/academic/marks-distribution` | `requirePermission(report.viewClassPerformance)` |  | query |
|  | GET | `/api/analytics/academic/subject-performance` | `requirePermission(report.viewClassPerformance)` |  | — |
|  | GET | `/api/analytics/admin/action-breakdown` | `requirePermission(report.viewAuditLogs)` |  | query |
|  | GET | `/api/analytics/admin/activity-heatmap` | `requirePermission(report.viewAuditLogs)` |  | — |
|  | GET | `/api/analytics/admin/audit-volume` | `requirePermission(report.viewAuditLogs)` |  | query |
|  | GET | `/api/analytics/admin/entity-activity` | `requirePermission(report.viewAuditLogs)` |  | query |
|  | GET | `/api/analytics/admin/login-trend` | `requirePermission(report.viewLoginAttempts)` |  | query |
|  | GET | `/api/analytics/capabilities` | signed-in user | reference-data | — |
|  | GET | `/api/analytics/finance/budget-vs-actual` | `requirePermission(report.viewExpenseBreakdown)` |  | — |
|  | GET | `/api/analytics/finance/cash-flow` | `requirePermission(report.viewFinanceSummary)` |  | — |
|  | GET | `/api/analytics/finance/collection-by-day` | `requirePermission(report.viewFeeCollection)` |  | query |
|  | GET | `/api/analytics/finance/collection-by-month` | `requirePermission(report.viewFeeCollection)` |  | query |
|  | GET | `/api/analytics/finance/expense-breakdown` | `requirePermission(report.viewExpenseBreakdown)` |  | — |
|  | GET | `/api/analytics/finance/outstanding-by-class` | `requirePermission(report.viewOutstandingBalances)` |  | — |
|  | GET | `/api/analytics/finance/payroll-breakdown` | `requirePermission(report.viewPayrollSummary)` |  | query |
|  | GET | `/api/analytics/finance/payroll-trend` | `requirePermission(report.viewPayrollSummary)` |  | query |
|  | GET | `/api/analytics/finance/scholarship-summary` | `requirePermission(report.viewScholarshipSummary)` |  | — |
|  | GET | `/api/analytics/hr/leave-by-type` | `requirePermission(report.viewHRReports)` |  | query |
|  | GET | `/api/analytics/hr/leave-trend` | `requirePermission(report.viewHRReports)` |  | query |
|  | GET | `/api/analytics/hr/staff-by-department` | `requirePermission(report.viewHRReports)` |  | — |
|  | GET | `/api/analytics/library/borrowing-trend` | `requirePermission(report.viewLibraryUsage)` |  | query |
|  | GET | `/api/analytics/library/digital-stats` | `requirePermission(report.viewLibraryUsage)` |  | — |
|  | GET | `/api/analytics/library/inventory-health` | `requirePermission(report.viewInventoryStatus)` |  | — |
|  | GET | `/api/analytics/library/top-borrowed` | `requirePermission(report.viewLibraryUsage)` |  | query |
|  | GET | `/api/analytics/lower-rank/application-trend` | `requirePermission(report.viewAdmissionTrends)` |  | query |
|  | GET | `/api/analytics/lower-rank/applications-funnel` | `requirePermission(report.viewAdmissionTrends)` |  | — |
|  | GET | `/api/analytics/lower-rank/enrollment-by-form` | `requirePermission(report.viewStudentRegistration)` |  | — |
|  | GET | `/api/analytics/maneb/candidates` | `requirePermission(report.viewSchoolPerformance)` |  | query |
|  | GET | `/api/analytics/maneb/school-stats` | `requirePermission(report.viewSchoolPerformance)` |  | — |
|  | GET | `/api/analytics/placements` | `requirePermission(placement.viewAnalytics)` |  | — |
|  | GET | `/api/analytics/school/attendance-summary` | `requirePermission(report.viewAttendanceSummary)` |  | — |
|  | GET | `/api/analytics/school/class-comparison` | `requirePermission(report.viewClassPerformance)` |  | — |
|  | GET | `/api/analytics/school/enrollment-trend` | `requirePermission(report.viewStudentRegistration)` |  | query |
|  | GET | `/api/analytics/school/financial-summary` | `requirePermission(report.viewFinanceSummary)` |  | — |
|  | GET | `/api/analytics/school/performance-trend` | `requirePermission(report.viewSchoolPerformance)` |  | query |
|  | GET | `/api/analytics/school/subject-comparison` | `requirePermission(report.viewClassPerformance)` |  | — |
|  | GET | `/api/analytics/school/teacher-effectiveness` | `requirePermission(report.viewTeacherEffectiveness)` |  | — |
|  | GET | `/api/analytics/student/attendance` | `requireAnyPermission(OWN_ATTENDANCE)` |  | — |
|  | GET | `/api/analytics/student/fee-statement` | `requireAnyPermission(OWN_FEE_STATEMENT)` |  | — |
|  | GET | `/api/analytics/student/performance-trend` | `requireAnyPermission(OWN_PERFORMANCE)` |  | — |
|  | GET | `/api/analytics/student/subject-breakdown` | `requireAnyPermission(OWN_PERFORMANCE)` |  | — |

### announcements

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/announcements` | `requirePermission(announcement.view)` |  | query |
| ● | POST | `/api/announcements` | `requireAnyPermission([announcement.create, announcement.createWithApproval])` |  | body |
| ● | DELETE | `/api/announcements/:id` | `requireAnyPermission([announcement.deleteAny, announcement.deleteOwn])` |  | :id |
| ● | PATCH | `/api/announcements/:id` | `requirePermission(announcement.editOwn)` |  | :id, body |
| ● | PATCH | `/api/announcements/:id/approve` | `requirePermission(announcement.approvePublish)` |  | :id |
| ● | PATCH | `/api/announcements/:id/draft` | `requireAnyPermission([announcement.create, announcement.createWithApproval])` |  | :id, body |
| ● | PATCH | `/api/announcements/:id/publish` | `requireAnyPermission([announcement.create, announcement.createWithApproval])` |  | :id, body |
| ● | PATCH | `/api/announcements/:id/reject` | `requirePermission(announcement.reject)` |  | :id, body |
| ● | POST | `/api/announcements/draft` | `requireAnyPermission([announcement.create, announcement.createWithApproval])` |  | body |
|  | GET | `/api/announcements/drafts` | `requireAnyPermission([announcement.create, announcement.createWithApproval])` |  | — |
| ● | POST | `/api/announcements/image/upload-ticket` | `requireAnyPermission([announcement.create, announcement.createWithApproval])` |  | — |
|  | GET | `/api/announcements/pending` | `requirePermission(announcement.approvePublish)` |  | — |

### applications

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/applications` | `requirePermission(application.view)` |  | query |
| ● | POST | `/api/applications` | `requireRole([admin, high_rank, lower_rank])` |  | body |
|  | GET | `/api/applications/:id` | `requirePermission(application.view)` |  | :id |
| ● | POST | `/api/applications/:id/convert` | `requirePermission(application.convertToStudent)` |  | :id, body |
| ● | PATCH | `/api/applications/:id/status` | `requireAnyPermission([application.approve, application.deny])` |  | :id, body |
| ● | POST | `/api/applications/public` | **none (public)** | public-site | body |

### approvals

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/approvals` | signed-in user | object-checked | query |
|  | GET | `/api/approvals/:source/:id` | signed-in user | object-checked | :source, :id |
| ● | POST | `/api/approvals/:source/:id/decision` | signed-in user | object-checked | :source, :id, body |
|  | GET | `/api/approvals/badge` | signed-in user | object-checked | — |
| ● | POST | `/api/approvals/bulk` | signed-in user | object-checked | body |
|  | GET | `/api/approvals/summary` | signed-in user | object-checked | query |

### assets

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/assets` | `requirePermission(assets.viewRegister)` |  | query |
| ● | POST | `/api/assets` | `requirePermission(assets.manageRegister)` |  | body |
|  | GET | `/api/assets/:id` | `requirePermission(assets.viewRegister)` |  | :id |
| ● | PATCH | `/api/assets/:id` | `requirePermission(assets.manageRegister)` |  | :id, body |
| ● | POST | `/api/assets/:id/allocate` | `requirePermission(assets.allocateItem)` |  | :id, body |
|  | GET | `/api/assets/:id/assignments` | `requirePermission(assets.viewRegister)` |  | :id |
| ● | PATCH | `/api/assets/:id/condition` | `requirePermission(assets.markCondition)` |  | :id, body |
| ● | POST | `/api/assets/:id/dispose` | `requirePermission(assets.dispose)` |  | :id, body |
|  | GET | `/api/assets/advances` | `requirePermission(assets.viewAdvances)` |  | query |
| ● | PATCH | `/api/assets/advances/:id/reconcile` | `requirePermission(assets.manageAdvances)` |  | :id, body |
| ● | PATCH | `/api/assets/advances/:id/write-off` | `requirePermission(assets.manageAdvances)` |  | :id, body |
| ● | POST | `/api/assets/assignments/:assignmentId/return` | `requirePermission(assets.allocateItem)` |  | :assignmentId, body |
|  | GET | `/api/assets/my-assigned` | `requirePermission(assets.viewOwnAssigned)` |  | — |
|  | GET | `/api/assets/requests` | `requirePermission(assets.approveRequest)` |  | query |
| ● | POST | `/api/assets/requests` | `requirePermission(assets.requestItem)` |  | body |
|  | GET | `/api/assets/requests/:id/advances` | `requirePermission(assets.viewAdvances)` |  | :id |
| ● | POST | `/api/assets/requests/:id/advances` | `requirePermission(assets.manageAdvances)` |  | :id, body |
| ● | PATCH | `/api/assets/requests/:id/approve` | `requirePermission(assets.approveRequest)` |  | :id, body |
| ● | PATCH | `/api/assets/requests/:id/reject` | `requirePermission(assets.approveRequest)` |  | :id, body |
|  | GET | `/api/assets/requests/by-department` | `requirePermission(assets.approveRequest)` |  | — |
|  | GET | `/api/assets/requests/mine` | `requirePermission(assets.requestItem)` |  | — |
|  | GET | `/api/assets/rooms` | `requirePermission(assets.viewRegister)` |  | — |
|  | GET | `/api/assets/stats` | `requirePermission(assets.viewInventoryReports)` |  | — |

### assignments

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/assignments` | signed-in user | object-checked | — |
| ● | POST | `/api/assignments` | `requireRole([academic])` |  | body |
| ● | DELETE | `/api/assignments/:id` | `requireRole([academic])` |  | :id |
|  | GET | `/api/assignments/:id` | signed-in user | object-checked | :id |
| ● | PATCH | `/api/assignments/:id` | `requireRole([academic])` |  | :id, body |
|  | GET | `/api/assignments/:id/roster` | signed-in user | object-checked | :id |
| ● | PUT | `/api/assignments/:id/submissions/:studentId` | `requireRole([academic])` |  | :id, :studentId, body |
|  | GET | `/api/assignments/:id/submissions/:studentId/file` | signed-in user | object-checked | :id, :studentId |
| ● | POST | `/api/assignments/:id/submit` | signed-in user | object-checked | :id, body |
| ● | POST | `/api/assignments/:id/submit/upload-ticket` | signed-in user | object-checked | :id |
| ● | POST | `/api/assignments/:id/view` | `requireRole([student])` |  | :id |
| ● | POST | `/api/assignments/attachments/${kind}/upload-ticket` | `requireRole([academic])` |  | — |
|  | GET | `/api/classes/:classId/assignments` | signed-in user | object-checked | :classId |
| ● | POST | `/api/classes/:classId/assignments` | `requireRole([academic])` |  | :classId, body |
| ● | DELETE | `/api/classes/:classId/assignments/:id` | `requireRole([academic])` |  | :classId, :id |
|  | GET | `/api/classes/:classId/assignments/:id` | signed-in user | object-checked | :classId, :id |
| ● | PATCH | `/api/classes/:classId/assignments/:id` | `requireRole([academic])` |  | :classId, :id, body |
|  | GET | `/api/classes/:classId/assignments/:id/roster` | signed-in user | object-checked | :classId, :id |
| ● | PUT | `/api/classes/:classId/assignments/:id/submissions/:studentId` | `requireRole([academic])` |  | :classId, :id, :studentId, body |
|  | GET | `/api/classes/:classId/assignments/:id/submissions/:studentId/file` | signed-in user | object-checked | :classId, :id, :studentId |
| ● | POST | `/api/classes/:classId/assignments/:id/submit` | signed-in user | object-checked | :classId, :id, body |
| ● | POST | `/api/classes/:classId/assignments/:id/submit/upload-ticket` | signed-in user | object-checked | :classId, :id |
| ● | POST | `/api/classes/:classId/assignments/:id/view` | `requireRole([student])` |  | :classId, :id |
| ● | POST | `/api/classes/:classId/assignments/attachments/${kind}/upload-ticket` | `requireRole([academic])` |  | :classId |

### attendance

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/attendance/class/:classId` | `requirePermission(class.viewAttendance)` |  | :classId, query |
| ● | POST | `/api/attendance/class/:classId` | `requirePermission(class.markAttendance)` |  | :classId, body |
|  | GET | `/api/attendance/student/:studentId` | signed-in user | object-checked | :studentId |

### audit

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/audit` | `requirePermission(userMgmt.viewAuditLogs)` |  | query |
|  | GET | `/api/audit/:id` | `requirePermission(userMgmt.viewAuditLogs)` |  | :id |
|  | GET | `/api/audit/actor/:uid` | `requirePermission(userMgmt.viewAuditLogs)` |  | :uid, query |
|  | GET | `/api/audit/entity/:type/:id` | `requireAnyPermission([userMgmt.viewAuditLogs, report.viewAuditLogs, exam.viewExamAuditLog])` |  | :type, :id, query |
|  | GET | `/api/audit/login-attempts` | `requirePermission(userMgmt.viewLoginAttempts)` |  | query |
|  | GET | `/api/audit/security-events` | `requireAnyPermission([userMgmt.viewAuditLogs, report.viewAuditLogs])` |  | query |
|  | GET | `/api/audit/stats` | `requireAnyPermission([userMgmt.viewAuditLogs, report.viewAuditLogs])` |  | query |

### auth

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
| ● | POST | `/api/auth/heartbeat` | signed-in user | own-data | — |
| ● | POST | `/api/auth/log-login-failed` | **none (public)** | public-telemetry | body |
| ● | POST | `/api/auth/log-login-success` | signed-in user | own-data | — |
| ● | POST | `/api/auth/log-logout` | signed-in user | own-data | — |

### calendar

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/calendar/events` | signed-in user | reference-data | query |
| ● | POST | `/api/calendar/events` | `requirePermission(calendar.createEvent)` |  | body |
| ● | DELETE | `/api/calendar/events/:id` | `requirePermission(calendar.deleteEvent)` |  | :id |
| ● | PATCH | `/api/calendar/events/:id` | `requirePermission(calendar.editEvent)` |  | :id, body |

### classes

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/classes` | `requirePermission(class.view)` |  | query |
| ● | POST | `/api/classes` | `requirePermission(class.create)` |  | body |
| ● | DELETE | `/api/classes/:id` | `requirePermission(class.softDelete)` |  | :id |
|  | GET | `/api/classes/:id` | `requirePermission(class.view)` |  | :id, query |
| ● | PATCH | `/api/classes/:id` | `requirePermission(class.edit)` |  | :id, body |
|  | GET | `/api/classes/:id/subject-assignments` | `requirePermission(class.view)` |  | :id, query |
|  | GET | `/api/classes/:id/subjects` | `requirePermission(class.view)` |  | :id |
| ● | PUT | `/api/classes/:id/subjects` | `requirePermission(class.manageSubjectPresets)` |  | :id, body |
|  | GET | `/api/classes/:id/timetable` | `requirePermission(timetable.view)` |  | :id, query |
| ● | POST | `/api/classes/:id/timetable` | `requireRole([admin, high_rank, exam_officer])` |  | :id, body |
| ● | PATCH | `/api/classes/:id/timetable/:slotId/approve` | `requirePermission(timetable.approve)` |  | :id, :slotId |
|  | GET | `/api/classes/my-timetable/today` | signed-in user | own-data | — |
| ● | POST | `/api/classes/subject-assignments` | `requirePermission(class.assignSubject)` |  | body |
| ● | DELETE | `/api/classes/subject-assignments/:assignmentId` | `requirePermission(class.assignSubject)` |  | :assignmentId |
| ● | PATCH | `/api/classes/subject-assignments/:assignmentId` | `requirePermission(class.assignSubject)` |  | :assignmentId, body |
| ● | POST | `/api/classes/subject-assignments/backfill` | `requirePermission(class.assignSubject)` |  | body |
|  | GET | `/api/classes/subject-assignments/mine` | signed-in user | own-data | query |

### exams

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/exams` | `requirePermission(exam.view)` |  | query |
| ● | POST | `/api/exams` | `requirePermission(exam.create)` |  | body |
| ● | DELETE | `/api/exams/:id` | `requirePermission(exam.delete)` |  | :id |
| ● | PATCH | `/api/exams/:id` | `requirePermission(exam.edit)` |  | :id, body |
| ● | POST | `/api/exams/:id/approve` | `requirePermission(exam.approveResults)` |  | :id |
| ● | POST | `/api/exams/:id/correct-marks` | `requirePermission(exam.correctMarksInReview)` |  | :id, body |
| ● | POST | `/api/exams/:id/finalize` | `requirePermission(exam.finalizeMarks)` |  | :id, body |
|  | GET | `/api/exams/:id/marks` | `requirePermission(exam.viewDraftMarks)` |  | :id |
| ● | POST | `/api/exams/:id/marks` | `requirePermission(exam.enterOwnClassMarks)` |  | :id, body |
| ● | POST | `/api/exams/:id/release` | `requirePermission(exam.authorizeRelease)` |  | :id |
| ● | POST | `/api/exams/:id/unlock` | `requirePermission(exam.unlockMarks)` |  | :id |
|  | GET | `/api/exams/analytics/class` | `requireRole([admin,high_rank,academic,exam_officer])` |  | query |
|  | GET | `/api/exams/analytics/top-bottom` | `requirePermission(exam.viewClassAnalytics)` |  | query |
| ● | POST | `/api/exams/compute` | `requirePermission(exam.computeResults)` |  | body |
|  | GET | `/api/exams/fee-blocked` | `requirePermission(exam.viewAllResults)` |  | query |
|  | GET | `/api/exams/maneb` | `requireRole([admin,high_rank,exam_officer])` |  | query |
| ● | POST | `/api/exams/maneb` | `requirePermission(exam.manageManebRecords)` |  | body |
| ● | POST | `/api/exams/maneb/bulk` | `requirePermission(exam.manageManebRecords)` |  | body |
| ● | POST | `/api/exams/maneb/recompute` | `requirePermission(exam.manageManebRecords)` |  | body |
|  | GET | `/api/exams/maneb/registrations` | `requireRole([...MANEB_BOARD_ROLES])` |  | query |
| ● | POST | `/api/exams/maneb/registrations` | `requirePermission(exam.manageManebRecords)` |  | body |
| ● | PATCH | `/api/exams/maneb/registrations/:id` | `requirePermission(exam.manageManebRecords)` |  | :id, body |
| ● | POST | `/api/exams/maneb/registrations/:id/withdraw` | `requirePermission(exam.manageManebRecords)` |  | :id, body |
| ● | POST | `/api/exams/maneb/registrations/bulk` | `requirePermission(exam.manageManebRecords)` |  | body |
| ● | POST | `/api/exams/maneb/registrations/lock` | `requirePermission(exam.manageManebRecords)` |  | body |
| ● | POST | `/api/exams/maneb/registrations/numbers` | `requirePermission(exam.manageManebRecords)` |  | body |
| ● | POST | `/api/exams/maneb/registrations/unlock` | `requireRole([admin, high_rank])` |  | body |
| ● | POST | `/api/exams/release-term` | `requirePermission(exam.authorizeRelease)` |  | body |
| ● | POST | `/api/exams/report-card` | `requireRole([admin, exam_officer])` |  | body |
|  | GET | `/api/exams/report-card/:studentId` | signed-in user | object-checked | :studentId, query |
|  | GET | `/api/exams/report-card/:studentId/data` | signed-in user | object-checked | :studentId, query |
| ● | POST | `/api/exams/report-card/mine` | signed-in user | own-data | body |
|  | GET | `/api/exams/report-cards/:classId/:term` | `requireRole([admin, exam_officer])` |  | :classId, :term, query |
|  | GET | `/api/exams/results/:studentId` | signed-in user | object-checked | :studentId, query |
|  | GET | `/api/exams/results/:studentId/class-standing` | signed-in user | object-checked | :studentId, query |
| ● | POST | `/api/exams/transcript` | `requireRole([admin, exam_officer])` |  | body |

### finances

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/finances/accounting/income-statement` | `requireRole([...FINANCE_ROLES])` |  | query |
|  | GET | `/api/finances/accounting/ledger/:code` | `requireRole([...FINANCE_ROLES])` |  | :code, query |
|  | GET | `/api/finances/accounting/trial-balance` | `requireRole([...FINANCE_ROLES])` |  | — |
|  | GET | `/api/finances/balance/:studentId` | `requireRole([admin, finance, high_rank, student])` |  | :studentId, query |
|  | GET | `/api/finances/budget` | `requireRole([...FINANCE_ROLES, high_rank])` |  | query |
| ● | POST | `/api/finances/budget` | `requireRole([...FINANCE_ROLES])` |  | body |
|  | GET | `/api/finances/budget-windows` | `requireAnyPermission([finance.viewBudget, procurement.createRequisition])` |  | query |
| ● | POST | `/api/finances/budget-windows` | `requirePermission(finance.manageBudgetWindows)` |  | body |
| ● | POST | `/api/finances/budget-windows/:id/close` | `requirePermission(finance.manageBudgetWindows)` |  | :id |
| ● | POST | `/api/finances/budget-windows/:id/open` | `requirePermission(finance.manageBudgetWindows)` |  | :id |
| ● | POST | `/api/finances/budget-windows/:id/status` | `requirePermission(finance.manageBudgetWindows)` |  | :id, body |
|  | GET | `/api/finances/credits/:studentId` | signed-in user | object-checked | :studentId |
|  | GET | `/api/finances/debts` | `requireRole([...FINANCE_ROLES])` |  | — |
|  | GET | `/api/finances/expenses` | `requireRole([...FINANCE_ROLES])` |  | query |
| ● | POST | `/api/finances/expenses` | `requireRole([admin, finance])` |  | body |
| ● | PATCH | `/api/finances/expenses/:id/approve` | `requireRole([admin, high_rank])` |  | :id, body |
| ● | PATCH | `/api/finances/expenses/:id/mark-paid` | `requireRole([admin, finance])` |  | :id |
|  | GET | `/api/finances/expenses/:id/receipt` | `requireRole([admin, finance])` |  | :id |
| ● | POST | `/api/finances/expenses/:id/receipt` | `requireRole([admin, finance])` |  | :id |
| ● | PATCH | `/api/finances/expenses/:id/reject` | `requirePermission(finance.rejectExpense)` |  | :id, body |
|  | GET | `/api/finances/fee-commitments` | `requireRole([...FINANCE_ROLES, high_rank])` |  | query |
| ● | POST | `/api/finances/fee-commitments` | `requireRole([admin, finance])` |  | body |
| ● | PATCH | `/api/finances/fee-commitments/:id` | `requireRole([admin, finance])` |  | :id, body |
|  | GET | `/api/finances/fee-structures` | `requireRole([...FINANCE_ROLES, high_rank, student])` |  | query |
| ● | POST | `/api/finances/fee-structures` | `requireRole([admin, finance])` |  | body |
| ● | PATCH | `/api/finances/fee-structures/:id` | `requireRole([admin, finance])` |  | :id, body |
|  | GET | `/api/finances/forecast` | `requireRole([...FINANCE_ROLES])` |  | query |
|  | GET | `/api/finances/invoices` | `requireRole([...FINANCE_ROLES])` |  | query |
|  | GET | `/api/finances/invoices/:id` | `requireRole([...FINANCE_ROLES, student])` |  | :id |
|  | GET | `/api/finances/invoices/:id/installments` | `requireRole([admin, finance, student])` |  | :id |
| ● | POST | `/api/finances/invoices/:id/installments` | `requireRole([admin, finance])` |  | :id, body |
| ● | POST | `/api/finances/invoices/:id/line-items` | `requireRole([admin, finance])` |  | :id, body |
|  | GET | `/api/finances/invoices/:id/notes` | `requireRole([admin, finance, high_rank])` |  | :id |
| ● | POST | `/api/finances/invoices/:id/notes` | `requireRole([admin, finance])` |  | :id, body |
| ● | POST | `/api/finances/invoices/bulk-generate` | `requireRole([admin, finance])` |  | body |
| ● | POST | `/api/finances/invoices/generate` | `requireRole([admin, finance])` |  | body |
|  | GET | `/api/finances/library-fines` | `requireRole([high_rank, finance, library])` |  | query |
| ● | POST | `/api/finances/library-fines` | `requireRole([admin, library])` |  | body |
| ● | PATCH | `/api/finances/library-fines/:id/pay` | `requireRole([finance, library])` |  | :id |
| ● | PATCH | `/api/finances/library-fines/:id/waive` | `requireRole([library])` |  | :id |
| ● | POST | `/api/finances/payments` | `requireRole([admin, finance])` |  | body |
|  | GET | `/api/finances/payments/:id/receipt` | `requireRole([...FINANCE_ROLES, student])` |  | :id |
|  | GET | `/api/finances/reports/data` | `requireRole([admin, finance, high_rank])` |  | query |
| ● | POST | `/api/finances/reports/export` | `requireRole([admin, finance, high_rank])` |  | body |
|  | GET | `/api/finances/scholarships` | `requireRole([...FINANCE_ROLES])` |  | — |
| ● | POST | `/api/finances/scholarships` | `requireRole([admin, finance])` |  | body |
|  | GET | `/api/finances/summary` | `requireRole([...FINANCE_ROLES])` |  | query |

### gallery

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/gallery` | `requireRole([admin, high_rank, lower_rank])` |  | — |
| ● | POST | `/api/gallery` | `requireRole([admin, high_rank, lower_rank])` |  | body |
| ● | DELETE | `/api/gallery/:id` | `requireRole([admin, high_rank, lower_rank])` |  | :id |
| ● | POST | `/api/gallery/upload-ticket` | `requireRole([admin, high_rank, lower_rank])` |  | — |

### guardianClaim

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
| ● | POST | `/api/guardian-claim` | **none (public)** | public-site | body |

### guardians

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/guardians/access-log` | `requirePermission(guardian.viewAccessLog)` |  | query |
|  | GET | `/api/guardians/access-log/recent` | `requirePermission(guardian.viewAccessLog)` |  | query |
| ● | DELETE | `/api/guardians/invitations/:id` | `requirePermission(guardian.invite)` |  | :id |
| ● | POST | `/api/guardians/links/:id/approve` | `requirePermission(guardian.approve)` |  | :id, body |
| ● | PATCH | `/api/guardians/links/:id/capabilities` | `requirePermission(guardian.restrict)` |  | :id, body |
| ● | POST | `/api/guardians/links/:id/evidence` | `requirePermission(guardian.propose)` |  | :id, body |
| ● | POST | `/api/guardians/links/:id/invitations` | `requirePermission(guardian.invite)` |  | :id, body |
| ● | POST | `/api/guardians/links/:id/reinstate` | `requirePermission(guardian.approve)` |  | :id, body |
| ● | POST | `/api/guardians/links/:id/reject` | `requirePermission(guardian.approve)` |  | :id, body |
| ● | POST | `/api/guardians/links/:id/reopen` | `requirePermission(guardian.approve)` |  | :id, body |
| ● | POST | `/api/guardians/links/:id/repoint` | `requirePermission(guardian.propose)` |  | :id, body |
| ● | POST | `/api/guardians/links/:id/reverified` | `requirePermission(guardian.approve)` |  | :id |
| ● | POST | `/api/guardians/links/:id/revoke` | `requirePermission(guardian.restrict)` |  | :id, body |
| ● | POST | `/api/guardians/links/:id/suspend` | `requirePermission(guardian.restrict)` |  | :id, body |
| ● | POST | `/api/guardians/national-ids/backfill` | `requirePermission(guardian.backfill)` |  | body |
|  | GET | `/api/guardians/onboarding/:id` | `requirePermission(guardian.backfill)` |  | :id, query |
| ● | POST | `/api/guardians/onboarding/:id/apply` | `requirePermission(guardian.backfill)` |  | :id, body |
| ● | POST | `/api/guardians/onboarding/:id/rollback` | `requirePermission(guardian.backfill)` |  | :id |
| ● | POST | `/api/guardians/onboarding/dry-run` | `requirePermission(guardian.backfill)` |  | body |
| ● | POST | `/api/guardians/profiles/:id/reinstate` | `requirePermission(guardian.approve)` |  | :id |
| ● | POST | `/api/guardians/profiles/:id/suspend` | `requirePermission(guardian.restrict)` |  | :id, body |
|  | GET | `/api/guardians/queue` | `requirePermission(guardian.view)` |  | query |
|  | GET | `/api/guardians/students` | `requirePermission(guardian.view)` |  | query |
|  | GET | `/api/guardians/students/:studentId` | `requirePermission(guardian.view)` |  | :studentId |
| ● | POST | `/api/guardians/students/:studentId/sync` | `requirePermission(guardian.propose)` |  | :studentId |

### health

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/health` | `requireRole([admin])` |  | — |
|  | GET | `/api/health/ping` | **none (public)** | public-site | — |

### holidays

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/holidays` | signed-in user | reference-data | query |
| ● | POST | `/api/holidays` | `requireRole([admin])` |  | body |
| ● | DELETE | `/api/holidays/:id` | `requireRole([admin])` |  | :id |

### hr

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/hr` | `requireRole([...REVIEWERS])` |  | query |
| ● | POST | `/api/hr` | `requireRole([...HR_ADMIN])` |  | body |
|  | GET | `/api/hr/:id` | `requireRole([...REVIEWERS])` |  | :id |
| ● | PATCH | `/api/hr/:id` | `requirePermission(hr.editStaff)` |  | :id, body |
|  | GET | `/api/hr/:id/allowances` | `requireAnyPermission([hr.manageSalaryStructure, finance.manageSalaryStructure])` |  | :id |
| ● | POST | `/api/hr/:id/allowances` | `requireAnyPermission([hr.manageSalaryStructure, finance.manageSalaryStructure])` |  | :id, body |
| ● | POST | `/api/hr/:id/photo` | `requireRole([...HR_ADMIN])` |  | :id, body |
| ● | POST | `/api/hr/:id/photo/upload-ticket` | `requireRole([...HR_ADMIN])` |  | :id |
| ● | POST | `/api/hr/:id/responsibilities` | `requirePermission(hr.editStaff)` |  | :id, body |
| ● | DELETE | `/api/hr/:id/responsibilities/:responsibilityId` | `requirePermission(hr.editStaff)` |  | :id, :responsibilityId |
| ● | PATCH | `/api/hr/:id/responsibilities/:responsibilityId` | `requirePermission(hr.editStaff)` |  | :id, :responsibilityId, body |
|  | GET | `/api/hr/:id/salary` | `requireAnyPermission([hr.manageSalaryStructure, finance.manageSalaryStructure])` |  | :id |
| ● | PUT | `/api/hr/:id/salary` | `requireAnyPermission([hr.manageSalaryStructure, finance.manageSalaryStructure])` |  | :id, body |
| ● | POST | `/api/hr/:id/terminate` | `requirePermission(hr.terminateStaff)` |  | :id, body |
|  | GET | `/api/hr/alerts/contracts` | `requireRole([...HR_ADMIN])` |  | query |
|  | GET | `/api/hr/alerts/contracts-upcoming` | `requireRole([...HR_ADMIN])` |  | query |
| ● | DELETE | `/api/hr/allowances/:allowanceId` | `requireAnyPermission([hr.manageSalaryStructure, finance.manageSalaryStructure])` |  | :allowanceId |
| ● | POST | `/api/hr/leave/apply` | signed-in user | own-data | body |
|  | GET | `/api/hr/leave/mine` | signed-in user | own-data | — |
|  | GET | `/api/hr/leave/on-leave` | `requireRole([...REVIEWERS])` |  | — |
|  | GET | `/api/hr/leave/options` | signed-in user | own-data | — |
|  | GET | `/api/hr/leave/requests` | `requireRole([...REVIEWERS])` |  | query |
| ● | PATCH | `/api/hr/leave/requests/:id/cancel` | signed-in user | object-checked | :id |
| ● | PATCH | `/api/hr/leave/requests/:id/review` | `requireRole([...REVIEWERS])` |  | :id, body |
|  | GET | `/api/hr/loans` | `requireRole([admin, hr, finance, high_rank])` |  | query |
| ● | PATCH | `/api/hr/loans/:id/approve` | `requirePermission(hr.approveLoan)` |  | :id |
| ● | PATCH | `/api/hr/loans/:id/disburse` | `requireRole([admin,finance])` |  | :id |
| ● | PATCH | `/api/hr/loans/:id/reject` | `requirePermission(hr.approveLoan)` |  | :id, body |
| ● | PATCH | `/api/hr/loans/:id/repay` | `requireRole([admin,finance,hr])` |  | :id, body |
|  | GET | `/api/hr/loans/mine` | signed-in user | own-data | — |
| ● | POST | `/api/hr/loans/request` | signed-in user | own-data | body |
|  | GET | `/api/hr/me/details` | `requirePermission(hr.editOwnLimitedFields)` |  | — |
| ● | PATCH | `/api/hr/me/details` | `requirePermission(hr.editOwnLimitedFields)` |  | body |
| ● | POST | `/api/hr/performance` | `requireRole([...REVIEWERS])` |  | body |
|  | GET | `/api/hr/salary-roster` | `requireAnyPermission([hr.manageSalaryStructure, finance.manageSalaryStructure, hr.viewAnyPayslips])` |  | — |
|  | GET | `/api/hr/staff-picker` | `requireAnyPermission([assets.allocateItem, hr.viewAnyProfile])` |  | — |
|  | GET | `/api/hr/teacher-roster` | `requireAnyPermission([class.assignTeacher, class.assignSubject, timetable.editDirect, timetable.editWithApproval])` |  | — |

### inventory

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/inventory/items` | `requirePermission(inventory.view)` |  | query |
| ● | POST | `/api/inventory/items` | `requirePermission(inventory.manageItems)` |  | body |
| ● | PATCH | `/api/inventory/items/:id` | `requirePermission(inventory.manageItems)` |  | :id, body |
|  | GET | `/api/inventory/items/:id/balance` | `requirePermission(inventory.view)` |  | :id |
|  | GET | `/api/inventory/transactions` | `requirePermission(inventory.view)` |  | query |
| ● | POST | `/api/inventory/transactions/adjust` | `requirePermission(inventory.manageItems)` |  | body |
| ● | POST | `/api/inventory/transactions/issue` | `requirePermission(inventory.issue)` |  | body |
| ● | POST | `/api/inventory/transactions/receipt` | `requirePermission(inventory.receive)` |  | body |
| ● | POST | `/api/inventory/transactions/transfer` | `requirePermission(inventory.transfer)` |  | body |

### library

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/library` | `requirePermission(library.viewCatalog)` |  | query |
| ● | POST | `/api/library` | `requirePermission(library.manageCatalog)` |  | body |
| ● | DELETE | `/api/library/:id` | `requirePermission(library.manageCatalog)` |  | :id |
|  | GET | `/api/library/:id` | `requirePermission(library.viewCatalog)` |  | :id |
| ● | PATCH | `/api/library/:id` | `requirePermission(library.manageCatalog)` |  | :id, body |
| ● | PATCH | `/api/library/:id/condition` | `requireAnyPermission([library.markDamaged, library.markLost])` |  | :id, body |
|  | GET | `/api/library/barcode/:barcode` | `requireRole([...LIB_STAFF])` |  | :barcode |
| ● | PATCH | `/api/library/borrowings/:id/renew` | `requirePermission(library.issueBook)` |  | :id |
| ● | PATCH | `/api/library/borrowings/:id/return` | `requirePermission(library.processReturn)` |  | :id, body |
| ● | POST | `/api/library/borrowings/issue` | `requirePermission(library.issueBook)` |  | body |
|  | GET | `/api/library/borrowings/list` | `requireRole([...LIB_STAFF, high_rank])` |  | query |
|  | GET | `/api/library/digital` | `requirePermission(library.viewDigitalResources)` |  | query |
| ● | PATCH | `/api/library/digital/:id/approve` | `requirePermission(library.approveDigitalResource)` |  | :id |
| ● | PATCH | `/api/library/digital/:id/reject` | `requirePermission(library.approveDigitalResource)` |  | :id, body |
|  | GET | `/api/library/digital/:id/view` | `requirePermission(library.viewDigitalResources)` |  | :id |
| ● | POST | `/api/library/digital/upload` | `requirePermission(library.uploadDigitalResource)` |  | body |
| ● | POST | `/api/library/digital/upload-ticket` | `requirePermission(library.uploadDigitalResource)` |  | — |
|  | GET | `/api/library/fine-waivers` | `requireAnyPermission([library.waiveFine, finance.waiveFine])` |  | query |
| ● | POST | `/api/library/fine-waivers` | signed-in user | object-checked | body |
| ● | PATCH | `/api/library/fine-waivers/:id/approve` | `requireAnyPermission([library.waiveFine, finance.waiveFine])` |  | :id |
| ● | PATCH | `/api/library/fine-waivers/:id/reject` | `requireAnyPermission([library.waiveFine, finance.waiveFine])` |  | :id, body |
|  | GET | `/api/library/fines` | `requireAnyPermission([library.viewInventoryReports, library.clearFine])` |  | query |
| ● | PATCH | `/api/library/fines/:id/clear` | `requirePermission(library.clearFine)` |  | :id |
|  | GET | `/api/library/my/borrowings` | `requirePermission(library.viewOwnBorrowings)` |  | — |
|  | GET | `/api/library/my/fines` | `requirePermission(library.viewOwnFines)` |  | — |
|  | GET | `/api/library/recommendations` | `requirePermission(library.recommendResource)` |  | query |
| ● | POST | `/api/library/recommendations` | `requirePermission(library.recommendResource)` |  | body |
| ● | PATCH | `/api/library/recommendations/:id/approve` | `requirePermission(library.approveRecommendation)` |  | :id, body |
| ● | PATCH | `/api/library/recommendations/:id/reject` | `requirePermission(library.approveRecommendation)` |  | :id, body |
|  | GET | `/api/library/reports/catalog` | `requireRole([...LIB_STAFF, high_rank])` |  | — |
|  | GET | `/api/library/reports/conditions` | `requireRole([...LIB_STAFF, high_rank])` |  | — |
|  | GET | `/api/library/reports/overdue-by-class` | `requireRole([...LIB_STAFF, high_rank])` |  | — |
|  | GET | `/api/library/stats` | `requireRole([...LIB_STAFF, high_rank])` |  | — |

### locations

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/locations/buildings` | `requirePermission(location.view)` |  | query |
| ● | POST | `/api/locations/buildings` | `requirePermission(location.manage)` |  | body |
| ● | PATCH | `/api/locations/buildings/:id` | `requirePermission(location.manage)` |  | :id, body |
|  | GET | `/api/locations/departments` | `requirePermission(location.view)` |  | query |
| ● | POST | `/api/locations/departments` | `requirePermission(location.manage)` |  | body |
| ● | PATCH | `/api/locations/departments/:id` | `requirePermission(location.manage)` |  | :id, body |
|  | GET | `/api/locations/mappings` | `requirePermission(location.manage)` |  | query |
| ● | POST | `/api/locations/mappings/:id/approve` | `requirePermission(location.manage)` |  | :id, body |
| ● | POST | `/api/locations/mappings/:id/reject` | `requirePermission(location.manage)` |  | :id, body |
| ● | POST | `/api/locations/mappings/apply` | `requirePermission(location.manage)` |  | — |
| ● | POST | `/api/locations/mappings/propose-departments` | `requirePermission(location.manage)` |  | — |
| ● | POST | `/api/locations/mappings/propose-locations` | `requirePermission(location.manage)` |  | — |
|  | GET | `/api/locations/rooms` | `requirePermission(location.view)` |  | query |
| ● | POST | `/api/locations/rooms` | `requirePermission(location.manage)` |  | body |
| ● | PATCH | `/api/locations/rooms/:id` | `requirePermission(location.manage)` |  | :id, body |

### monitoring

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/monitoring/alerts` | `requirePermission(monitoring.view)` |  | — |
| ● | PATCH | `/api/monitoring/alerts/:id/toggle` | `requirePermission(monitoring.manage)` |  | :id, body |
|  | GET | `/api/monitoring/feedback` | `requirePermission(monitoring.view)` |  | — |
| ● | POST | `/api/monitoring/feedback` | `requirePermission(monitoring.submitFeedback)` |  | body |
|  | GET | `/api/monitoring/issues` | `requirePermission(monitoring.view)` |  | query |
|  | GET | `/api/monitoring/logs` | `requirePermission(monitoring.view)` |  | query |
|  | GET | `/api/monitoring/releases` | `requirePermission(monitoring.view)` |  | query |
|  | GET | `/api/monitoring/replays` | `requirePermission(monitoring.view)` |  | query |
|  | GET | `/api/monitoring/summary` | `requirePermission(monitoring.view)` |  | — |

### monitoring-vercel

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/monitoring/vercel/alerts` | `requirePermission(monitoring.view)` |  | — |
| ● | PATCH | `/api/monitoring/vercel/alerts/:id/acknowledge` | `requirePermission(monitoring.manage)` |  | :id |
|  | GET | `/api/monitoring/vercel/deployments` | `requirePermission(monitoring.view)` |  | query |
|  | GET | `/api/monitoring/vercel/errors` | `requirePermission(monitoring.view)` |  | query |
|  | GET | `/api/monitoring/vercel/summary` | `requirePermission(monitoring.view)` |  | — |

### notifications

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/notifications/feed` | signed-in user | own-data | — |
| ● | PATCH | `/api/notifications/feed/:id/read` | signed-in user | own-data | :id |
| ● | PATCH | `/api/notifications/feed/read-all` | signed-in user | own-data | — |
| ● | POST | `/api/notifications/register-token` | signed-in user | own-data | body |
|  | GET | `/api/notifications/token-status` | signed-in user | own-data | — |
| ● | DELETE | `/api/notifications/unregister-token` | signed-in user | own-data | body |

### parent

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/parent/children` | `requireRole([parent])` |  | — |
|  | GET | `/api/parent/children/:linkId` | `requireRole([parent])` |  | :linkId |
|  | GET | `/api/parent/children/:linkId/attendance` | `requireRole([parent])` |  | :linkId |
|  | GET | `/api/parent/children/:linkId/fees` | `requireRole([parent])` |  | :linkId |
|  | GET | `/api/parent/children/:linkId/report-card` | `requireRole([parent])` |  | :linkId |
|  | GET | `/api/parent/children/:linkId/results` | `requireRole([parent])` |  | :linkId |
|  | GET | `/api/parent/me` | `requireRole([parent])` |  | — |

### payroll

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/payroll` | `requirePermission(finance.viewPayrollRuns)` |  | query |
|  | GET | `/api/payroll/:id` | `requirePermission(finance.viewPayrollRuns)` |  | :id |
|  | GET | `/api/payroll/my-payslips` | signed-in user | own-data | — |
|  | GET | `/api/payroll/my-salary` | signed-in user | own-data | — |
|  | GET | `/api/payroll/payslips/:id/download` | signed-in user | object-checked | :id |
| ● | POST | `/api/payroll/run` | `requirePermission(finance.runPayroll)` |  | body |
|  | GET | `/api/payroll/run-window` | `requirePermission(finance.viewPayrollRuns)` |  | query |
| ● | POST | `/api/payroll/runs/:id/approve` | `requirePermission(finance.approvePayroll)` |  | :id |
| ● | POST | `/api/payroll/runs/:id/discard` | `requirePermission(finance.runPayroll)` |  | :id |
| ● | POST | `/api/payroll/runs/:id/lock` | `requirePermission(finance.lockPayroll)` |  | :id |
| ● | POST | `/api/payroll/runs/:id/return` | `requirePermission(finance.approvePayroll)` |  | :id, body |
| ● | POST | `/api/payroll/runs/:id/rollback` | `requirePermission(finance.rollbackPayroll)` |  | :id, body |
| ● | POST | `/api/payroll/runs/:id/submit-for-approval` | `requirePermission(finance.runPayroll)` |  | :id |

### pendingActions

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/pending-actions` | signed-in user | own-data | query |
| ● | POST | `/api/pending-actions` | signed-in user | object-checked | body |
|  | GET | `/api/pending-actions/:id` | signed-in user | object-checked | :id |
| ● | PATCH | `/api/pending-actions/:id/approve` | `requireAnyPermission([student.approvePendingAction, class.approvePendingAction])` |  | :id, body |
| ● | PATCH | `/api/pending-actions/:id/cancel` | signed-in user | object-checked | :id |
| ● | PATCH | `/api/pending-actions/:id/reject` | `requireAnyPermission([student.approvePendingAction, class.approvePendingAction])` |  | :id, body |
|  | GET | `/api/pending-actions/counts` | `requireAnyPermission([student.approvePendingAction, class.approvePendingAction])` |  | — |
|  | GET | `/api/pending-actions/entity/:type/:id` | signed-in user | object-checked | :type, :id |
| ● | POST | `/api/pending-actions/expire-stale` | **none (public)** | cron-or-admin | — |

### placements

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
| ● | PATCH | `/api/placements/:id/approve` | `requirePermission(placement.verifyOutcome)` |  | :id |
| ● | PATCH | `/api/placements/:id/reject` | `requirePermission(placement.verifyOutcome)` |  | :id, body |
| ● | POST | `/api/placements/advisory` | `requirePermission(placement.view)` |  | body |
| ● | POST | `/api/placements/advisory/explain` | `requirePermission(placement.view)` |  | body |
|  | GET | `/api/placements/catalogue` | `requireAnyPermission([placement.view, placement.viewOwn])` |  | — |
|  | GET | `/api/placements/eligible` | `requireAnyPermission([placement.manage, placement.recordOutcome])` |  | query |
|  | GET | `/api/placements/me` | `requirePermission(placement.viewOwn)` |  | — |
| ● | POST | `/api/placements/me/claim` | `requirePermission(placement.recordOwnChoice)` |  | body |
|  | GET | `/api/placements/queue` | `requirePermission(placement.verifyOutcome)` |  | query |
|  | GET | `/api/placements/registry` | `requirePermission(placement.viewAnalytics)` |  | query |
| ● | POST | `/api/placements/staff-entry` | `requireAnyPermission([placement.manage, placement.recordOutcome])` |  | body |

### procurement

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/procurement/goods-receipts` | `requirePermission(procurement.receiveGoods)` |  | query |
| ● | POST | `/api/procurement/goods-receipts` | `requirePermission(procurement.receiveGoods)` |  | body |
| ● | POST | `/api/procurement/goods-receipts/:id/complete` | `requirePermission(procurement.receiveGoods)` |  | :id |
|  | GET | `/api/procurement/purchase-orders` | `requirePermission(procurement.managePurchaseOrders)` |  | query |
| ● | POST | `/api/procurement/purchase-orders` | `requirePermission(procurement.managePurchaseOrders)` |  | body |
| ● | POST | `/api/procurement/purchase-orders/:id/approve` | `requirePermission(procurement.managePurchaseOrders)` |  | :id |
| ● | POST | `/api/procurement/purchase-orders/:id/cancel` | `requirePermission(procurement.managePurchaseOrders)` |  | :id |
| ● | POST | `/api/procurement/purchase-orders/:id/send` | `requirePermission(procurement.managePurchaseOrders)` |  | :id |
|  | GET | `/api/procurement/quotations` | `requirePermission(procurement.manageRFQ)` |  | query |
| ● | POST | `/api/procurement/quotations` | `requirePermission(procurement.manageRFQ)` |  | body |
| ● | POST | `/api/procurement/quotations/:id/reject` | `requirePermission(procurement.manageRFQ)` |  | :id |
| ● | POST | `/api/procurement/quotations/:id/select` | `requirePermission(procurement.manageRFQ)` |  | :id |
|  | GET | `/api/procurement/requisitions` | `requirePermission(procurement.viewRequisitions)` |  | query |
| ● | POST | `/api/procurement/requisitions` | `requirePermission(procurement.createRequisition)` |  | body |
| ● | POST | `/api/procurement/requisitions/:id/approve` | `requirePermission(procurement.reviewRequisition)` |  | :id, body |
| ● | POST | `/api/procurement/requisitions/:id/cancel` | `requirePermission(procurement.createRequisition)` |  | :id |
| ● | POST | `/api/procurement/requisitions/:id/reject` | `requirePermission(procurement.reviewRequisition)` |  | :id, body |
| ● | POST | `/api/procurement/requisitions/:id/return` | `requirePermission(procurement.reviewRequisition)` |  | :id, body |
| ● | POST | `/api/procurement/requisitions/:id/submit` | `requirePermission(procurement.createRequisition)` |  | :id |
|  | GET | `/api/procurement/rfqs` | `requirePermission(procurement.manageRFQ)` |  | query |
| ● | POST | `/api/procurement/rfqs` | `requirePermission(procurement.manageRFQ)` |  | body |
| ● | POST | `/api/procurement/rfqs/:id/close` | `requirePermission(procurement.manageRFQ)` |  | :id |
|  | GET | `/api/procurement/suppliers` | `requirePermission(procurement.manageSuppliers)` |  | — |
| ● | POST | `/api/procurement/suppliers` | `requirePermission(procurement.manageSuppliers)` |  | body |

### promotion

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/promotion/:year` | `requireRole([admin, exam_officer, high_rank])` |  | :year |
| ● | POST | `/api/promotion/:year/commit` | `requireRole([admin, exam_officer, high_rank])` + `requirePermission(exam.runPromotionEngine)` |  | :year |
|  | GET | `/api/promotion/:year/eligibility` | `requireRole([admin, exam_officer, high_rank])` |  | :year |
| ● | POST | `/api/promotion/:year/preview` | `requireRole([admin, exam_officer, high_rank])` + `requireRole([admin, exam_officer, high_rank])` |  | :year |

### public

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/public/academic-advertisements` | **none (public)** | public-site | query |
|  | GET | `/api/public/academic-advertisements/:id` | **none (public)** | public-site | :id |
|  | GET | `/api/public/announcements` | **none (public)** | public-site | query |
|  | GET | `/api/public/announcements/:id` | **none (public)** | public-site | :id |
| ● | POST | `/api/public/contact` | **none (public)** | public-site | body |
|  | GET | `/api/public/events` | **none (public)** | public-site | query |
|  | GET | `/api/public/events/:id` | **none (public)** | public-site | :id |
|  | GET | `/api/public/fee-structure` | **none (public)** | public-site | query |
|  | GET | `/api/public/gallery` | **none (public)** | public-site | query |
|  | GET | `/api/public/leadership` | **none (public)** | public-site | — |
|  | GET | `/api/public/maneb-stats` | **none (public)** | public-site | query |
|  | GET | `/api/public/news` | **none (public)** | public-site | query |
|  | GET | `/api/public/news/:id` | **none (public)** | public-site | :id |
|  | GET | `/api/public/newsletter/confirm` | **none (public)** | public-site | query |
| ● | POST | `/api/public/newsletter/subscribe` | **none (public)** | public-site | body |
|  | GET | `/api/public/newsletter/unsubscribe` | **none (public)** | public-site | query |
| ● | POST | `/api/public/password-reset` | **none (public)** | public-site | body |
|  | GET | `/api/public/placement-stats` | **none (public)** | public-site | query |
|  | GET | `/api/public/placements` | **none (public)** | public-site | query |
|  | GET | `/api/public/school-info` | **none (public)** | public-site | — |

### reporting/academic

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/reporting/academic/assignments` | `requirePermission(report.viewClassPerformance)` |  | — |
|  | GET | `/api/reporting/academic/attention` | `requirePermission(report.viewClassPerformance)` |  | — |
|  | GET | `/api/reporting/academic/overview` | `requirePermission(report.viewClassPerformance)` |  | — |
|  | GET | `/api/reporting/academic/readiness` | `requirePermission(report.viewClassPerformance)` |  | — |
|  | GET | `/api/reporting/academic/students` | `requirePermission(report.viewClassPerformance)` |  | — |
|  | GET | `/api/reporting/academic/teaching` | `requirePermission(report.viewClassPerformance)` |  | — |

### reporting/admin

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/reporting/admin/adoption` | `requirePermission(userMgmt.viewActiveSessions)` |  | — |
|  | GET | `/api/reporting/admin/attention` | `requireAllPermissions([report.viewLoginAttempts, userMgmt.viewActiveSessions])` |  | — |
|  | GET | `/api/reporting/admin/governance` | `requirePermission(report.viewAuditLogs)` |  | query |
|  | GET | `/api/reporting/admin/operations` | `requireAnyPermission([report.viewSystemHealth, monitoring.view])` |  | — |
|  | GET | `/api/reporting/admin/overview` | `requireAllPermissions([report.viewLoginAttempts, userMgmt.viewActiveSessions])` |  | — |
|  | GET | `/api/reporting/admin/security` | `requirePermission(report.viewLoginAttempts)` |  | query |
|  | GET | `/api/reporting/admin/sessions` | `requirePermission(userMgmt.viewActiveSessions)` |  | query |

### reporting/admissions

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/reporting/admissions/attention` | `requireAllPermissions([report.viewAdmissionTrends, report.viewStudentRegistration])` |  | — |
|  | GET | `/api/reporting/admissions/enrollment` | `requirePermission(report.viewStudentRegistration)` |  | — |
|  | GET | `/api/reporting/admissions/overview` | `requireAllPermissions([report.viewAdmissionTrends, report.viewStudentRegistration])` |  | — |
|  | GET | `/api/reporting/admissions/pipeline` | `requirePermission(report.viewAdmissionTrends)` |  | query |

### reporting/attendance

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/reporting/attendance/attention` | `requireAnyPermission([report.viewAttendanceSummary, class.markAttendance])` |  | — |
|  | GET | `/api/reporting/attendance/overview` | `requireAnyPermission([report.viewAttendanceSummary, class.markAttendance])` |  | — |
|  | GET | `/api/reporting/attendance/report` | `requireAnyPermission([report.viewAttendanceSummary, class.markAttendance])` |  | — |

### reporting/exams

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/reporting/exams/attention` | `requireAnyPermission([exam.viewSchoolAnalytics, exam.viewClassAnalytics])` |  | — |
|  | GET | `/api/reporting/exams/maneb-status` | `requirePermission(report.viewSchoolPerformance)` |  | — |
|  | GET | `/api/reporting/exams/mark-completion` | `requireAnyPermission([exam.viewSchoolAnalytics, exam.viewClassAnalytics])` |  | — |
|  | GET | `/api/reporting/exams/overview` | `requireAnyPermission([exam.viewSchoolAnalytics, exam.viewClassAnalytics])` |  | — |
|  | GET | `/api/reporting/exams/pipeline` | `requireAnyPermission([exam.viewSchoolAnalytics, exam.viewClassAnalytics])` |  | — |
|  | GET | `/api/reporting/exams/workflow` | `requireAnyPermission([exam.viewSchoolAnalytics, exam.viewClassAnalytics])` |  | query |

### reporting/executive

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/reporting/executive/attention` | `requireAllPermissions([report.viewSchoolPerformance, report.viewFinanceSummary])` |  | — |
|  | GET | `/api/reporting/executive/overview` | `requireAllPermissions([report.viewSchoolPerformance, report.viewFinanceSummary])` |  | — |
|  | GET | `/api/reporting/executive/retention` | `requireAllPermissions([report.viewSchoolPerformance, report.viewFinanceSummary])` |  | — |

### reporting/finance

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/reporting/finance/aging` | `requirePermission(report.viewOutstandingBalances)` |  | — |
|  | GET | `/api/reporting/finance/attention` | `requirePermission(report.viewFinanceSummary)` |  | — |
|  | GET | `/api/reporting/finance/overview` | `requirePermission(report.viewFinanceSummary)` |  | — |
|  | GET | `/api/reporting/finance/payment-mix` | `requirePermission(report.viewFeeCollection)` |  | — |

### reporting/hr

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/reporting/hr/attention` | `requirePermission(report.viewHRReports)` |  | — |
|  | GET | `/api/reporting/hr/contracts` | `requirePermission(report.viewHRReports)` |  | — |
|  | GET | `/api/reporting/hr/leave` | `requirePermission(report.viewHRReports)` |  | query |
|  | GET | `/api/reporting/hr/loans` | `requirePermission(report.viewHRReports)` |  | — |
|  | GET | `/api/reporting/hr/overview` | `requirePermission(report.viewHRReports)` |  | — |
|  | GET | `/api/reporting/hr/promotions` | `requirePermission(report.viewHRReports)` |  | — |
|  | GET | `/api/reporting/hr/reviews` | `requirePermission(report.viewHRReports)` |  | — |
|  | GET | `/api/reporting/hr/teaching` | `requirePermission(report.viewHRReports)` |  | — |
|  | GET | `/api/reporting/hr/workforce` | `requirePermission(report.viewHRReports)` |  | — |

### reporting/library

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/reporting/library/attention` | `requirePermission(report.viewLibraryUsage)` |  | — |
|  | GET | `/api/reporting/library/circulation` | `requirePermission(report.viewLibraryUsage)` |  | query |
|  | GET | `/api/reporting/library/digital` | `requirePermission(report.viewLibraryUsage)` |  | query |
|  | GET | `/api/reporting/library/fines` | `requirePermission(report.viewLibraryUsage)` |  | query |
|  | GET | `/api/reporting/library/overview` | `requirePermission(report.viewLibraryUsage)` |  | — |
|  | GET | `/api/reporting/library/stock` | `requirePermission(report.viewLibraryUsage)` |  | query |

### reporting/operations

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/reporting/operations/assets` | `requirePermission(assets.viewInventoryReports)` |  | query |
|  | GET | `/api/reporting/operations/inventory` | `requirePermission(inventory.view)` |  | query |
|  | GET | `/api/reporting/operations/procurement-pipeline` | `requirePermission(procurement.reviewRequisition)` |  | query |
|  | GET | `/api/reporting/operations/procurement-value` | `requirePermission(procurement.reviewRequisition)` |  | query |
|  | GET | `/api/reporting/operations/stocktake-variance` | `requireAnyPermission([inventory.performStocktake, inventory.resolveVariance, procurement.reviewRequisition])` |  | — |
|  | GET | `/api/reporting/operations/stocktakes` | `requireAnyPermission([inventory.performStocktake, inventory.resolveVariance, procurement.reviewRequisition])` |  | query |

### reporting/student

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/reporting/student/assignments` | `requirePermission(report.viewOwnPerformance)` |  | — |
|  | GET | `/api/reporting/student/attendance` | `requirePermission(report.viewOwnAttendance)` |  | — |
|  | GET | `/api/reporting/student/attention` | `requirePermission(report.viewOwnPerformance)` |  | — |
|  | GET | `/api/reporting/student/fees` | `requirePermission(report.viewOwnFeeStatement)` |  | — |
|  | GET | `/api/reporting/student/library` | `requirePermission(report.viewOwnPerformance)` |  | — |
|  | GET | `/api/reporting/student/overview` | `requirePermission(report.viewOwnPerformance)` |  | — |
|  | GET | `/api/reporting/student/placement` | `requirePermission(placement.viewOwn)` |  | — |
|  | GET | `/api/reporting/student/progress` | `requirePermission(report.viewOwnPerformance)` |  | — |

### reports

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/reports/academic` | `requirePermission(report.viewClassPerformance)` |  | — |
|  | GET | `/api/reports/admin` | `requirePermission(report.viewSystemHealth)` |  | — |
|  | GET | `/api/reports/audit` | `requirePermission(report.viewAuditLogs)` |  | query |
|  | GET | `/api/reports/exam-officer` | `requirePermission(report.viewSchoolPerformance)` |  | — |
|  | GET | `/api/reports/finance` | `requirePermission(report.viewFeeCollection)` |  | — |
|  | GET | `/api/reports/hr` | `requirePermission(report.viewHRReports)` |  | — |
|  | GET | `/api/reports/library` | `requirePermission(report.viewLibraryUsage)` |  | — |
|  | GET | `/api/reports/school` | `requirePermission(report.viewSchoolPerformance)` |  | — |
|  | GET | `/api/reports/student` | `requireAnyPermission(OWN_PERFORMANCE)` |  | — |

### search

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/search/fallback` | `requirePermission(search.globalSearch)` |  | query |

### sessions

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/sessions` | `requirePermission(userMgmt.viewActiveSessions)` |  | query |
|  | GET | `/api/sessions/:id/activity` | `requirePermission(userMgmt.viewActiveSessions)` |  | :id, query |
| ● | POST | `/api/sessions/:uid/force-logout` | `requirePermission(userMgmt.terminateSession)` |  | :uid |
|  | GET | `/api/sessions/summary` | `requirePermission(userMgmt.viewActiveSessions)` |  | — |

### settings

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/settings/:key` | signed-in user | object-checked | :key |
|  | GET | `/api/settings/academic-policy` | `requireRole([admin, high_rank])` |  | — |
| ● | PATCH | `/api/settings/academic-policy` | `requireRole([admin, high_rank])` |  | body |
|  | GET | `/api/settings/classroom` | `requireRole([academic, admin])` |  | — |
| ● | PATCH | `/api/settings/classroom` | `requireRole([academic, admin])` |  | body |
| ● | POST | `/api/settings/discover-photo/upload-ticket` | `requireRole([admin, hr, high_rank])` |  | — |
|  | GET | `/api/settings/exam` | `requireRole([admin, high_rank, exam_officer])` |  | — |
| ● | PATCH | `/api/settings/exam` | `requireRole([admin, high_rank])` |  | body |
|  | GET | `/api/settings/exam/ca-config` | signed-in user | reference-data | — |
|  | GET | `/api/settings/finance` | `requireRole([admin, finance])` |  | — |
| ● | PATCH | `/api/settings/finance` | `requireRole([admin, finance])` |  | body |
|  | GET | `/api/settings/finance/rollout` | `requireRole([admin, finance, high_rank])` |  | — |
| ● | POST | `/api/settings/finance/rollout/:module/decision` | `requireRole([high_rank])` |  | :module, body |
| ● | POST | `/api/settings/finance/rollout/propose` | `requireRole([finance])` |  | body |
|  | GET | `/api/settings/grading-scales` | signed-in user | reference-data | — |
| ● | PATCH | `/api/settings/grading-scales/:id` | `requireRole([admin, high_rank])` |  | :id, body |
| ● | POST | `/api/settings/grading-scales/reset` | `requireRole([admin])` |  | — |
|  | GET | `/api/settings/hr` | `requireRole([admin, hr, high_rank])` |  | — |
| ● | PATCH | `/api/settings/hr` | `requireRole([admin, hr, high_rank])` |  | body |
|  | GET | `/api/settings/id-numbers` | `requireRole([admin, hr, high_rank])` |  | — |
| ● | PATCH | `/api/settings/id-numbers` | `requireRole([admin, hr, high_rank])` |  | body |
| ● | POST | `/api/settings/leadership-photo/upload-ticket` | `requireRole([admin, hr, high_rank])` |  | — |
|  | GET | `/api/settings/library` | `requireRole([admin, library])` |  | — |
| ● | PATCH | `/api/settings/library` | `requireRole([admin, library])` |  | body |
|  | GET | `/api/settings/notifications` | signed-in user | own-data | — |
| ● | PATCH | `/api/settings/notifications` | signed-in user | own-data | body |
|  | GET | `/api/settings/public` | signed-in user | reference-data | — |
|  | GET | `/api/settings/school` | `requireRole([admin, hr, high_rank])` |  | — |
| ● | PATCH | `/api/settings/school` | `requireRole([admin, hr, high_rank])` |  | body |
|  | GET | `/api/settings/system` | `requireRole([admin])` |  | — |
| ● | PATCH | `/api/settings/system` | `requireRole([admin])` |  | body |

### stocktakes

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/stocktakes` | `requirePermission(inventory.performStocktake)` |  | query |
| ● | POST | `/api/stocktakes` | `requirePermission(inventory.performStocktake)` |  | body |
|  | GET | `/api/stocktakes/:id` | `requirePermission(inventory.performStocktake)` |  | :id |
| ● | POST | `/api/stocktakes/:id/complete` | `requirePermission(inventory.performStocktake)` |  | :id |
| ● | POST | `/api/stocktakes/:id/lines` | `requirePermission(inventory.performStocktake)` |  | :id, body |
| ● | POST | `/api/stocktakes/:id/start` | `requirePermission(inventory.performStocktake)` |  | :id |
| ● | POST | `/api/stocktakes/:id/variances/:varianceId/resolve` | `requirePermission(inventory.resolveVariance)` |  | :id, :varianceId, body |

### students

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/students` | `requirePermission(student.view)` |  | query |
| ● | POST | `/api/students` | `requirePermission(student.create)` |  | body |
| ● | DELETE | `/api/students/:id` | `requirePermission(student.softDelete)` |  | :id, body |
|  | GET | `/api/students/:id` | `requireAnyPermission([student.view, student.viewOwn])` |  | :id |
| ● | PATCH | `/api/students/:id` | `requirePermission(student.edit)` |  | :id, body |
|  | GET | `/api/students/:id/fee-gate` | `requireAnyPermission([student.viewFeeStatus, student.viewOwn])` |  | :id, query |
|  | GET | `/api/students/:id/guardians` | `requirePermission(student.view)` |  | :id |
| ● | POST | `/api/students/:id/guardians` | `requirePermission(student.edit)` |  | :id, body |
| ● | DELETE | `/api/students/:id/guardians/:guardianId` | `requirePermission(student.edit)` |  | :id, :guardianId |
| ● | PATCH | `/api/students/:id/guardians/:guardianId` | `requirePermission(student.edit)` |  | :id, :guardianId, body |
| ● | POST | `/api/students/:id/link-firebase-uid` | `requireRole([admin])` |  | :id, body |
| ● | POST | `/api/students/:id/photo` | `requirePermission(student.edit)` |  | :id, body |
| ● | POST | `/api/students/:id/photo/upload-ticket` | `requirePermission(student.edit)` |  | :id |
| ● | PATCH | `/api/students/:id/status` | `requirePermission(student.edit)` |  | :id, body |
| ● | POST | `/api/students/:id/support-needs` | `requirePermission(student.editWelfare)` |  | :id, body |
| ● | DELETE | `/api/students/:id/support-needs/:needId` | `requirePermission(student.editWelfare)` |  | :id, :needId |
| ● | PATCH | `/api/students/:id/support-needs/:needId` | `requirePermission(student.editWelfare)` |  | :id, :needId, body |
|  | GET | `/api/students/:id/welfare` | `requirePermission(student.viewWelfare)` |  | :id |
| ● | PATCH | `/api/students/:id/welfare` | `requirePermission(student.editWelfare)` |  | :id, body |
|  | GET | `/api/students/at-risk` | `requirePermission(student.viewRiskStatus)` |  | query |
| ● | POST | `/api/students/from-application/:applicationId` | `requirePermission(application.convertToStudent)` |  | :applicationId, body |
|  | GET | `/api/students/me` | `requirePermission(student.viewOwn)` |  | — |
|  | GET | `/api/students/risk-summary` | `requirePermission(student.viewRiskStatus)` + `requireRole([admin, high_rank])` |  | — |
|  | GET | `/api/students/welfare-summary` | `requirePermission(student.viewWelfare)` |  | — |

### users

| M | Method | Path | Access | Declared policy | Client IDs |
|:-:|---|---|---|---|---|
|  | GET | `/api/users` | `requireRole([admin])` |  | query |
| ● | POST | `/api/users` | `requireRole([admin])` |  | body |
| ● | PATCH | `/api/users/:uid/disable` | `requireRole([admin])` |  | :uid, body |
| ● | POST | `/api/users/:uid/reset-password` | `requireRole([admin])` |  | :uid |
| ● | POST | `/api/users/me/clear-password-change-flag` | signed-in user | own-data | — |
|  | GET | `/api/users/me/notification-prefs` | signed-in user | own-data | — |
| ● | PATCH | `/api/users/me/notification-prefs` | signed-in user | own-data | body |
|  | GET | `/api/users/me/sex` | signed-in user | own-data | — |
| ● | PATCH | `/api/users/role` | `requireRole([admin])` |  | body |
