<!-- GENERATED FILE — do not edit by hand. Run `pnpm --filter web docs:security` to regenerate. -->

# Role / resource authorization matrix

Derived from `ROLE_PERMISSIONS` in `packages/shared/types/permissions.ts` — the single source the server middleware (`requirePermission*`) and the UI both read. It lists what each of the nine roles **holds**. Where a permission only grants access to *own* or *assigned* records, the service layer narrows it further (ownership / class-membership / subject-teacher checks); `endpoint-inventory.md` shows where each rule is enforced.

**Super user.** The `superUser` Firebase custom claim (strict boolean `true`, set only by the seed / ops tooling) passes every permission check (`hasPermission(role, perm, true)`). It does **not** bypass self-review blocking on approvals. A role string alone can never confer it (verified by the contract test).

**Legend.** `●` the role holds every permission in the cell · `◐ n/m` holds n of m · `·` holds none.

**Roles.** `admin`, `high_rank`, `finance`, `library`, `lower_rank`, `academic`, `hr`, `exam_officer`, `student`. Column headers use the first letters: AD admin · HR high_rank · FI finance · LI library · LR lower_rank · AC academic · HM hr · EO exam_officer · ST student.

## Overview — permissions held per role

| Resource | AD | HR | FI | LI | LR | AC | HM | EO | ST |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| announcement | 8/10 | 9/10 | 4/10 | 4/10 | 6/10 | 6/10 | 4/10 | 4/10 | 4/10 |
| application | 1/5 | ● | · | · | 2/5 | · | · | · | · |
| assets | 3/11 | 4/11 | 10/11 | 1/11 | 1/11 | 2/11 | 1/11 | 1/11 | · |
| calendar | ● | ● | 3/6 | 3/6 | 3/6 | 3/6 | 4/6 | 1/6 | 1/6 |
| class | 6/17 | 11/17 | 1/17 | 1/17 | 7/17 | 8/17 | 1/17 | 4/17 | 3/17 |
| exam | 8/24 | 19/24 | · | · | 2/24 | 10/24 | · | 20/24 | 3/24 |
| finance | 2/37 | 16/37 | 30/37 | 3/37 | 1/37 | · | 4/37 | · | 1/37 |
| guardian | ● | ● | · | · | 3/8 | · | · | · | · |
| hr | 8/27 | ● | 9/27 | 8/27 | 8/27 | 9/27 | ● | 9/27 | · |
| inventory | 1/7 | 1/7 | ● | · | · | 1/7 | · | · | · |
| library | 4/23 | 5/23 | 5/23 | 22/23 | · | 7/23 | 5/23 | 5/23 | 5/23 |
| location | 1/2 | 1/2 | ● | · | · | · | · | · | · |
| monitoring | ● | ● | 1/3 | 1/3 | 1/3 | 1/3 | 1/3 | 1/3 | 1/3 |
| placement | 5/7 | 5/7 | 2/7 | 2/7 | 3/7 | 2/7 | 2/7 | 2/7 | 3/7 |
| procurement | 1/7 | 2/7 | ● | · | · | 2/7 | 1/7 | · | · |
| report | 7/26 | 18/26 | 8/26 | 3/26 | 4/26 | 4/26 | 3/26 | 5/26 | 4/26 |
| search | ● | ● | ● | ● | · | ● | ● | · | · |
| settings | 6/18 | 9/18 | 4/18 | 3/18 | 3/18 | 3/18 | 3/18 | 6/18 | 2/18 |
| student | ● | 12/14 | 2/14 | 2/14 | 8/14 | 4/14 | 2/14 | 3/14 | 2/14 |
| timetable | 3/6 | 5/6 | 1/6 | 1/6 | 2/6 | 2/6 | 1/6 | 3/6 | 1/6 |
| userMgmt | ● | · | · | · | · | · | · | · | · |

## announcement

| Operation | AD | HR | FI | LI | LR | AC | HM | EO | ST | Permissions |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Read all | ● | ● | ● | ● | ● | ● | ● | ● | ● | `view` |
| Create | ◐ 1/3 | ◐ 2/3 | ◐ 1/3 | ◐ 1/3 | ◐ 1/3 | ◐ 1/3 | ◐ 1/3 | ◐ 1/3 | ◐ 1/3 | `create`, `createWithApproval`, `schedule` |
| Update | ● | ● | ● | ● | ● | ● | ● | ● | ● | `editOwn` |
| Approve / release | ● | ● | · | · | ◐ 2/3 | ◐ 2/3 | · | · | · | `approvePublish`, `publishDirect`, `reject` |
| Delete / void | ● | ● | ◐ 1/2 | ◐ 1/2 | ◐ 1/2 | ◐ 1/2 | ◐ 1/2 | ◐ 1/2 | ◐ 1/2 | `deleteAny`, `deleteOwn` |

<details><summary>Who holds each permission</summary>

| Permission | Operation | Roles |
|---|---|---|
| `announcement.approvePublish` | Approve / release | `admin`, `high_rank`, `lower_rank`, `academic` |
| `announcement.create` | Create | `admin`, `high_rank` |
| `announcement.createWithApproval` | Create | `finance`, `library`, `lower_rank`, `academic`, `hr`, `exam_officer`, `student` |
| `announcement.deleteAny` | Delete / void | `admin`, `high_rank` |
| `announcement.deleteOwn` | Delete / void | `admin`, `high_rank`, `finance`, `library`, `lower_rank`, `academic`, `hr`, `exam_officer`, `student` |
| `announcement.editOwn` | Update | `admin`, `high_rank`, `finance`, `library`, `lower_rank`, `academic`, `hr`, `exam_officer`, `student` |
| `announcement.publishDirect` | Approve / release | `admin`, `high_rank` |
| `announcement.reject` | Approve / release | `admin`, `high_rank`, `lower_rank`, `academic` |
| `announcement.schedule` | Create | `high_rank` |
| `announcement.view` | Read all | `admin`, `high_rank`, `finance`, `library`, `lower_rank`, `academic`, `hr`, `exam_officer`, `student` |

</details>

## application

| Operation | AD | HR | FI | LI | LR | AC | HM | EO | ST | Permissions |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Read all | ● | ● | · | · | ● | · | · | · | · | `view` |
| Approve / release | · | ● | · | · | ◐ 1/4 | · | · | · | · | `approve`, `convertToStudent`, `deny`, `review` |

<details><summary>Who holds each permission</summary>

| Permission | Operation | Roles |
|---|---|---|
| `application.approve` | Approve / release | `high_rank` |
| `application.convertToStudent` | Approve / release | `high_rank` |
| `application.deny` | Approve / release | `high_rank` |
| `application.review` | Approve / release | `high_rank`, `lower_rank` |
| `application.view` | Read all | `admin`, `high_rank`, `lower_rank` |

</details>

## assets

| Operation | AD | HR | FI | LI | LR | AC | HM | EO | ST | Permissions |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Read assigned | · | · | ● | ● | ● | ● | ● | ● | · | `viewOwnAssigned` |
| Read all | ● | ● | ● | · | · | · | · | · | · | `viewAdvances`, `viewInventoryReports`, `viewRegister` |
| Create | · | · | ◐ 1/2 | · | · | ◐ 1/2 | · | · | · | `allocateItem`, `requestItem` |
| Update | · | · | ● | · | · | · | · | · | · | `manageAdvances`, `manageRegister`, `markCondition` |
| Approve / release | · | ● | ● | · | · | · | · | · | · | `approveRequest` |
| Delete / void | · | · | ● | · | · | · | · | · | · | `dispose` |

<details><summary>Who holds each permission</summary>

| Permission | Operation | Roles |
|---|---|---|
| `assets.allocateItem` | Create | `finance` |
| `assets.approveRequest` | Approve / release | `high_rank`, `finance` |
| `assets.dispose` | Delete / void | `finance` |
| `assets.manageAdvances` | Update | `finance` |
| `assets.manageRegister` | Update | `finance` |
| `assets.markCondition` | Update | `finance` |
| `assets.requestItem` | Create | `academic` |
| `assets.viewAdvances` | Read all | `admin`, `high_rank`, `finance` |
| `assets.viewInventoryReports` | Read all | `admin`, `high_rank`, `finance` |
| `assets.viewOwnAssigned` | Read assigned | `finance`, `library`, `lower_rank`, `academic`, `hr`, `exam_officer` |
| `assets.viewRegister` | Read all | `admin`, `high_rank`, `finance` |

</details>

## calendar

| Operation | AD | HR | FI | LI | LR | AC | HM | EO | ST | Permissions |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Read all | ● | ● | ◐ 1/2 | ◐ 1/2 | ◐ 1/2 | ◐ 1/2 | ● | ◐ 1/2 | ◐ 1/2 | `view`, `viewStaffLeave` |
| Create | ● | ● | ● | ● | ● | ● | ● | · | · | `createEvent` |
| Update | ● | ● | ◐ 1/2 | ◐ 1/2 | ◐ 1/2 | ◐ 1/2 | ◐ 1/2 | · | · | `editEvent`, `manageAcademicCalendar` |
| Delete / void | ● | ● | · | · | · | · | · | · | · | `deleteEvent` |

<details><summary>Who holds each permission</summary>

| Permission | Operation | Roles |
|---|---|---|
| `calendar.createEvent` | Create | `admin`, `high_rank`, `finance`, `library`, `lower_rank`, `academic`, `hr` |
| `calendar.deleteEvent` | Delete / void | `admin`, `high_rank` |
| `calendar.editEvent` | Update | `admin`, `high_rank`, `finance`, `library`, `lower_rank`, `academic`, `hr` |
| `calendar.manageAcademicCalendar` | Update | `admin`, `high_rank` |
| `calendar.view` | Read all | `admin`, `high_rank`, `finance`, `library`, `lower_rank`, `academic`, `hr`, `exam_officer`, `student` |
| `calendar.viewStaffLeave` | Read all | `admin`, `high_rank`, `hr` |

</details>

## class

| Operation | AD | HR | FI | LI | LR | AC | HM | EO | ST | Permissions |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Read all | ◐ 3/4 | ◐ 3/4 | ◐ 1/4 | ◐ 1/4 | ◐ 3/4 | ● | ◐ 1/4 | ◐ 3/4 | ◐ 2/4 | `view`, `viewAnalytics`, `viewAssignments`, `viewAttendance` |
| Create | ◐ 1/8 | ◐ 4/8 | · | · | ◐ 1/8 | ◐ 3/8 | · | ◐ 1/8 | ◐ 1/8 | `assignRoom`, `assignSubject`, `assignTeacher`, `bookLab`, `create`, `giveAssignment`, `makeAnnouncement`, `submitAssignment` |
| Update | ◐ 1/3 | ◐ 2/3 | · | · | ◐ 2/3 | ◐ 1/3 | · | · | · | `edit`, `manageSubjectPresets`, `markAttendance` |
| Approve / release | ● | ● | · | · | · | · | · | · | · | `approvePendingAction` |
| Delete / void | · | ● | · | · | ● | · | · | · | · | `softDelete` |

<details><summary>Who holds each permission</summary>

| Permission | Operation | Roles |
|---|---|---|
| `class.approvePendingAction` | Approve / release | `admin`, `high_rank` |
| `class.assignRoom` | Create | `high_rank` |
| `class.assignSubject` | Create | `admin`, `high_rank`, `exam_officer` |
| `class.assignTeacher` | Create | `high_rank` |
| `class.bookLab` | Create | `academic` |
| `class.create` | Create | `high_rank`, `lower_rank` |
| `class.edit` | Update | `high_rank`, `lower_rank` |
| `class.giveAssignment` | Create | `academic` |
| `class.makeAnnouncement` | Create | `academic` |
| `class.manageSubjectPresets` | Update | `admin`, `high_rank`, `lower_rank` |
| `class.markAttendance` | Update | `academic` |
| `class.softDelete` | Delete / void | `high_rank`, `lower_rank` |
| `class.submitAssignment` | Create | `student` |
| `class.view` | Read all | `admin`, `high_rank`, `finance`, `library`, `lower_rank`, `academic`, `hr`, `exam_officer`, `student` |
| `class.viewAnalytics` | Read all | `admin`, `high_rank`, `lower_rank`, `academic`, `exam_officer` |
| `class.viewAssignments` | Read all | `academic`, `student` |
| `class.viewAttendance` | Read all | `admin`, `high_rank`, `lower_rank`, `academic`, `exam_officer` |

</details>

## exam

| Operation | AD | HR | FI | LI | LR | AC | HM | EO | ST | Permissions |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Read own | · | · | · | · | · | · | · | · | ● | `viewOwnResults` |
| Read all | ● | ● | · | · | ◐ 2/7 | ◐ 4/7 | · | ● | ◐ 2/7 | `view`, `viewAllResults`, `viewClassAnalytics`, `viewDraftMarks`, `viewExamAuditLog`, `viewReleasedResults`, `viewSchoolAnalytics` |
| Create | ◐ 1/2 | ● | · | · | · | ◐ 1/2 | · | ● | · | `create`, `generateReportCard` |
| Update | · | ◐ 6/8 | · | · | · | ◐ 3/8 | · | ◐ 7/8 | · | `computeResults`, `configureExamWeights`, `configureGradingScales`, `correctMarksInReview`, `edit`, `enterOwnClassMarks`, `manageManebRecords`, `manageManebTimetable` |
| Approve / release | · | ◐ 3/5 | · | · | · | ◐ 1/5 | · | ◐ 3/5 | · | `approveResults`, `authorizeRelease`, `finalizeMarks`, `runPromotionEngine`, `unlockMarks` |
| Delete / void | · | ● | · | · | · | ● | · | ● | · | `delete` |

<details><summary>Who holds each permission</summary>

| Permission | Operation | Roles |
|---|---|---|
| `exam.approveResults` | Approve / release | `exam_officer` |
| `exam.authorizeRelease` | Approve / release | `high_rank` |
| `exam.computeResults` | Update | `academic`, `exam_officer` |
| `exam.configureExamWeights` | Update | `high_rank`, `exam_officer` |
| `exam.configureGradingScales` | Update | `high_rank`, `exam_officer` |
| `exam.correctMarksInReview` | Update | `high_rank`, `exam_officer` |
| `exam.create` | Create | `high_rank`, `academic`, `exam_officer` |
| `exam.delete` | Delete / void | `high_rank`, `academic`, `exam_officer` |
| `exam.edit` | Update | `high_rank`, `academic`, `exam_officer` |
| `exam.enterOwnClassMarks` | Update | `academic` |
| `exam.finalizeMarks` | Approve / release | `academic` |
| `exam.generateReportCard` | Create | `admin`, `high_rank`, `exam_officer` |
| `exam.manageManebRecords` | Update | `high_rank`, `exam_officer` |
| `exam.manageManebTimetable` | Update | `high_rank`, `exam_officer` |
| `exam.runPromotionEngine` | Approve / release | `high_rank`, `exam_officer` |
| `exam.unlockMarks` | Approve / release | `high_rank`, `exam_officer` |
| `exam.view` | Read all | `admin`, `high_rank`, `lower_rank`, `academic`, `exam_officer`, `student` |
| `exam.viewAllResults` | Read all | `admin`, `high_rank`, `exam_officer` |
| `exam.viewClassAnalytics` | Read all | `admin`, `high_rank`, `academic`, `exam_officer` |
| `exam.viewDraftMarks` | Read all | `admin`, `high_rank`, `academic`, `exam_officer` |
| `exam.viewExamAuditLog` | Read all | `admin`, `high_rank`, `exam_officer` |
| `exam.viewOwnResults` | Read own | `student` |
| `exam.viewReleasedResults` | Read all | `admin`, `high_rank`, `lower_rank`, `academic`, `exam_officer`, `student` |
| `exam.viewSchoolAnalytics` | Read all | `admin`, `high_rank`, `exam_officer` |

</details>

## finance

| Operation | AD | HR | FI | LI | LR | AC | HM | EO | ST | Permissions |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Read own | · | · | · | · | · | · | ● | · | ● | `viewOwnStatement` |
| Read all | ◐ 2/12 | ◐ 11/12 | ◐ 11/12 | ◐ 1/12 | ◐ 1/12 | · | ◐ 1/12 | · | · | `viewBudget`, `viewExpenses`, `viewFeeStructures`, `viewForecast`, `viewInstallmentPlans`, `viewInvoices`, `viewLibraryFines`, `viewPayments`, `viewPayrollRuns`, `viewScholarships`, `viewSummary`, `viewSystemLogs` |
| Create | · | · | ● | · | · | · | ◐ 1/7 | · | · | `addInvoiceNote`, `bulkGenerateInvoices`, `createExpense`, `generateInvoice`, `generateReceipt`, `linkLoanToPayroll`, `recordPayment` |
| Update | · | ◐ 1/8 | ● | · | · | · | ◐ 1/8 | · | · | `editInvoice`, `manageBudget`, `manageBudgetCommitments`, `manageBudgetWindows`, `manageFeeStructures`, `manageInstallmentPlans`, `manageSalaryStructure`, `manageScholarships` |
| Approve / release | · | ◐ 4/6 | ◐ 2/6 | · | · | · | · | · | · | `approveBudget`, `approveExpense`, `approvePayroll`, `lockPayroll`, `rejectExpense`, `runPayroll` |
| Delete / void | · | · | ◐ 2/3 | ◐ 2/3 | · | · | · | · | · | `clearLibraryFine`, `rollbackPayroll`, `waiveFine` |

<details><summary>Who holds each permission</summary>

| Permission | Operation | Roles |
|---|---|---|
| `finance.addInvoiceNote` | Create | `finance` |
| `finance.approveBudget` | Approve / release | `high_rank` |
| `finance.approveExpense` | Approve / release | `high_rank` |
| `finance.approvePayroll` | Approve / release | `high_rank` |
| `finance.bulkGenerateInvoices` | Create | `finance` |
| `finance.clearLibraryFine` | Delete / void | `finance`, `library` |
| `finance.createExpense` | Create | `finance` |
| `finance.editInvoice` | Update | `finance` |
| `finance.generateInvoice` | Create | `finance` |
| `finance.generateReceipt` | Create | `finance` |
| `finance.linkLoanToPayroll` | Create | `finance`, `hr` |
| `finance.lockPayroll` | Approve / release | `finance` |
| `finance.manageBudget` | Update | `finance` |
| `finance.manageBudgetCommitments` | Update | `finance` |
| `finance.manageBudgetWindows` | Update | `high_rank`, `finance` |
| `finance.manageFeeStructures` | Update | `finance` |
| `finance.manageInstallmentPlans` | Update | `finance` |
| `finance.manageSalaryStructure` | Update | `finance`, `hr` |
| `finance.manageScholarships` | Update | `finance` |
| `finance.recordPayment` | Create | `finance` |
| `finance.rejectExpense` | Approve / release | `high_rank` |
| `finance.rollbackPayroll` | Delete / void | `finance` |
| `finance.runPayroll` | Approve / release | `finance` |
| `finance.viewBudget` | Read all | `high_rank`, `finance` |
| `finance.viewExpenses` | Read all | `high_rank`, `finance` |
| `finance.viewFeeStructures` | Read all | `high_rank`, `finance` |
| `finance.viewForecast` | Read all | `high_rank`, `finance` |
| `finance.viewInstallmentPlans` | Read all | `high_rank`, `finance` |
| `finance.viewInvoices` | Read all | `high_rank`, `finance`, `lower_rank` |
| `finance.viewLibraryFines` | Read all | `high_rank`, `finance`, `library` |
| `finance.viewOwnStatement` | Read own | `hr`, `student` |
| `finance.viewPayments` | Read all | `high_rank`, `finance` |
| `finance.viewPayrollRuns` | Read all | `high_rank`, `finance`, `hr` |
| `finance.viewScholarships` | Read all | `high_rank`, `finance` |
| `finance.viewSummary` | Read all | `admin`, `high_rank`, `finance` |
| `finance.viewSystemLogs` | Read all | `admin` |
| `finance.waiveFine` | Delete / void | `library` |

</details>

## guardian

| Operation | AD | HR | FI | LI | LR | AC | HM | EO | ST | Permissions |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Read all | ● | ● | · | · | ◐ 1/2 | · | · | · | · | `view`, `viewAccessLog` |
| Update | ● | ● | · | · | ◐ 2/5 | · | · | · | · | `backfill`, `invite`, `merge`, `propose`, `restrict` |
| Approve / release | ● | ● | · | · | · | · | · | · | · | `approve` |

<details><summary>Who holds each permission</summary>

| Permission | Operation | Roles |
|---|---|---|
| `guardian.approve` | Approve / release | `admin`, `high_rank` |
| `guardian.backfill` | Update | `admin`, `high_rank` |
| `guardian.invite` | Update | `admin`, `high_rank`, `lower_rank` |
| `guardian.merge` | Update | `admin`, `high_rank` |
| `guardian.propose` | Update | `admin`, `high_rank`, `lower_rank` |
| `guardian.restrict` | Update | `admin`, `high_rank` |
| `guardian.view` | Read all | `admin`, `high_rank`, `lower_rank` |
| `guardian.viewAccessLog` | Read all | `admin`, `high_rank` |

</details>

## hr

| Operation | AD | HR | FI | LI | LR | AC | HM | EO | ST | Permissions |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Read own | ◐ 1/5 | ● | ◐ 4/5 | ◐ 4/5 | ◐ 4/5 | ● | ● | ● | · | `viewOwnLeaveHistory`, `viewOwnLoanStatus`, `viewOwnPayslips`, `viewOwnPerformanceNotes`, `viewOwnProfile` |
| Read all | ◐ 3/6 | ● | ◐ 2/6 | ◐ 1/6 | ◐ 1/6 | ◐ 1/6 | ● | ◐ 1/6 | · | `viewAllLeaveRecords`, `viewAnyPayslips`, `viewAnyProfile`, `viewHRCalendar`, `viewHRReports`, `viewStaffSensitive` |
| Create | ◐ 2/7 | ● | ◐ 2/7 | ◐ 2/7 | ◐ 2/7 | ◐ 2/7 | ● | ◐ 2/7 | · | `addPerformanceNote`, `applyLeave`, `applyLoan`, `assignRole`, `createStaff`, `defineHolidays`, `defineLoanRepaymentTerms` |
| Update | ◐ 1/6 | ● | ◐ 1/6 | ◐ 1/6 | ◐ 1/6 | ◐ 1/6 | ● | ◐ 1/6 | · | `adjustLeaveBalance`, `editOwnLimitedFields`, `editStaff`, `manageDiscipline`, `manageSalaryStructure`, `promoteStaff` |
| Approve / release | · | ● | · | · | · | · | ● | · | · | `approveLeave`, `approveLoan` |
| Delete / void | ● | ● | · | · | · | · | ● | · | · | `terminateStaff` |

<details><summary>Who holds each permission</summary>

| Permission | Operation | Roles |
|---|---|---|
| `hr.addPerformanceNote` | Create | `high_rank`, `hr` |
| `hr.adjustLeaveBalance` | Update | `high_rank`, `hr` |
| `hr.applyLeave` | Create | `high_rank`, `finance`, `library`, `lower_rank`, `academic`, `hr`, `exam_officer` |
| `hr.applyLoan` | Create | `high_rank`, `finance`, `library`, `lower_rank`, `academic`, `hr`, `exam_officer` |
| `hr.approveLeave` | Approve / release | `high_rank`, `hr` |
| `hr.approveLoan` | Approve / release | `high_rank`, `hr` |
| `hr.assignRole` | Create | `admin`, `high_rank`, `hr` |
| `hr.createStaff` | Create | `admin`, `high_rank`, `hr` |
| `hr.defineHolidays` | Create | `high_rank`, `hr` |
| `hr.defineLoanRepaymentTerms` | Create | `high_rank`, `hr` |
| `hr.editOwnLimitedFields` | Update | `high_rank`, `finance`, `library`, `lower_rank`, `academic`, `hr`, `exam_officer` |
| `hr.editStaff` | Update | `admin`, `high_rank`, `hr` |
| `hr.manageDiscipline` | Update | `high_rank`, `hr` |
| `hr.manageSalaryStructure` | Update | `high_rank`, `hr` |
| `hr.promoteStaff` | Update | `high_rank`, `hr` |
| `hr.terminateStaff` | Delete / void | `admin`, `high_rank`, `hr` |
| `hr.viewAllLeaveRecords` | Read all | `high_rank`, `hr` |
| `hr.viewAnyPayslips` | Read all | `high_rank`, `finance`, `hr` |
| `hr.viewAnyProfile` | Read all | `admin`, `high_rank`, `hr` |
| `hr.viewHRCalendar` | Read all | `high_rank`, `finance`, `library`, `lower_rank`, `academic`, `hr`, `exam_officer` |
| `hr.viewHRReports` | Read all | `admin`, `high_rank`, `hr` |
| `hr.viewOwnLeaveHistory` | Read own | `high_rank`, `finance`, `library`, `lower_rank`, `academic`, `hr`, `exam_officer` |
| `hr.viewOwnLoanStatus` | Read own | `high_rank`, `finance`, `library`, `lower_rank`, `academic`, `hr`, `exam_officer` |
| `hr.viewOwnPayslips` | Read own | `admin`, `high_rank`, `finance`, `library`, `lower_rank`, `academic`, `hr`, `exam_officer` |
| `hr.viewOwnPerformanceNotes` | Read own | `high_rank`, `academic`, `hr`, `exam_officer` |
| `hr.viewOwnProfile` | Read own | `high_rank`, `finance`, `library`, `lower_rank`, `academic`, `hr`, `exam_officer` |
| `hr.viewStaffSensitive` | Read all | `admin`, `high_rank`, `hr` |

</details>

## inventory

| Operation | AD | HR | FI | LI | LR | AC | HM | EO | ST | Permissions |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Read all | ● | ● | ● | · | · | ● | · | · | · | `view` |
| Create | · | · | ● | · | · | · | · | · | · | `issue`, `performStocktake`, `receive`, `transfer` |
| Update | · | · | ● | · | · | · | · | · | · | `manageItems` |
| Approve / release | · | · | ● | · | · | · | · | · | · | `resolveVariance` |

<details><summary>Who holds each permission</summary>

| Permission | Operation | Roles |
|---|---|---|
| `inventory.issue` | Create | `finance` |
| `inventory.manageItems` | Update | `finance` |
| `inventory.performStocktake` | Create | `finance` |
| `inventory.receive` | Create | `finance` |
| `inventory.resolveVariance` | Approve / release | `finance` |
| `inventory.transfer` | Create | `finance` |
| `inventory.view` | Read all | `admin`, `high_rank`, `finance`, `academic` |

</details>

## library

| Operation | AD | HR | FI | LI | LR | AC | HM | EO | ST | Permissions |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Read own | · | · | ● | ● | · | ● | ● | ● | ● | `viewOwnBorrowings`, `viewOwnFines` |
| Read all | ◐ 3/5 | ● | ◐ 2/5 | ● | · | ◐ 2/5 | ◐ 2/5 | ◐ 2/5 | ◐ 2/5 | `viewBorrowingHistory`, `viewCatalog`, `viewDigitalResources`, `viewInventoryReports`, `viewUsageReports` |
| Create | · | · | ◐ 1/6 | ● | · | ◐ 3/6 | ◐ 1/6 | ◐ 1/6 | ◐ 1/6 | `applyFine`, `issueBook`, `recommendResource`, `registerCopies`, `requestBorrow`, `uploadDigitalResource` |
| Update | ◐ 1/5 | · | · | ◐ 4/5 | · | · | · | · | · | `manageCatalog`, `manageDigitalResources`, `manageStorage`, `markDamaged`, `processReturn` |
| Approve / release | · | · | · | ● | · | · | · | · | · | `approveDigitalResource`, `approveRecommendation` |
| Delete / void | · | · | · | ● | · | · | · | · | · | `clearFine`, `markLost`, `waiveFine` |

<details><summary>Who holds each permission</summary>

| Permission | Operation | Roles |
|---|---|---|
| `library.applyFine` | Create | `library` |
| `library.approveDigitalResource` | Approve / release | `library` |
| `library.approveRecommendation` | Approve / release | `library` |
| `library.clearFine` | Delete / void | `library` |
| `library.issueBook` | Create | `library` |
| `library.manageCatalog` | Update | `library` |
| `library.manageDigitalResources` | Update | `library` |
| `library.manageStorage` | Update | `admin` |
| `library.markDamaged` | Update | `library` |
| `library.markLost` | Delete / void | `library` |
| `library.processReturn` | Update | `library` |
| `library.recommendResource` | Create | `library`, `academic` |
| `library.registerCopies` | Create | `library` |
| `library.requestBorrow` | Create | `finance`, `library`, `academic`, `hr`, `exam_officer`, `student` |
| `library.uploadDigitalResource` | Create | `library`, `academic` |
| `library.viewBorrowingHistory` | Read all | `high_rank`, `library` |
| `library.viewCatalog` | Read all | `admin`, `high_rank`, `finance`, `library`, `academic`, `hr`, `exam_officer`, `student` |
| `library.viewDigitalResources` | Read all | `high_rank`, `finance`, `library`, `academic`, `hr`, `exam_officer`, `student` |
| `library.viewInventoryReports` | Read all | `admin`, `high_rank`, `library` |
| `library.viewOwnBorrowings` | Read own | `finance`, `library`, `academic`, `hr`, `exam_officer`, `student` |
| `library.viewOwnFines` | Read own | `finance`, `library`, `academic`, `hr`, `exam_officer`, `student` |
| `library.viewUsageReports` | Read all | `admin`, `high_rank`, `library` |
| `library.waiveFine` | Delete / void | `library` |

</details>

## location

| Operation | AD | HR | FI | LI | LR | AC | HM | EO | ST | Permissions |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Read all | ● | ● | ● | · | · | · | · | · | · | `view` |
| Update | · | · | ● | · | · | · | · | · | · | `manage` |

<details><summary>Who holds each permission</summary>

| Permission | Operation | Roles |
|---|---|---|
| `location.manage` | Update | `finance` |
| `location.view` | Read all | `admin`, `high_rank`, `finance` |

</details>

## monitoring

| Operation | AD | HR | FI | LI | LR | AC | HM | EO | ST | Permissions |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Read all | ● | ● | · | · | · | · | · | · | · | `view` |
| Create | ● | ● | ● | ● | ● | ● | ● | ● | ● | `submitFeedback` |
| Update | ● | ● | · | · | · | · | · | · | · | `manage` |

<details><summary>Who holds each permission</summary>

| Permission | Operation | Roles |
|---|---|---|
| `monitoring.manage` | Update | `admin`, `high_rank` |
| `monitoring.submitFeedback` | Create | `admin`, `high_rank`, `finance`, `library`, `lower_rank`, `academic`, `hr`, `exam_officer`, `student` |
| `monitoring.view` | Read all | `admin`, `high_rank` |

</details>

## placement

| Operation | AD | HR | FI | LI | LR | AC | HM | EO | ST | Permissions |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Read own | · | · | · | · | · | · | · | · | ● | `recordOwnChoice`, `viewOwn` |
| Read all | ● | ● | ● | ● | ● | ● | ● | ● | ◐ 1/2 | `view`, `viewAnalytics` |
| Create | ● | ● | · | · | ● | · | · | · | · | `recordOutcome` |
| Update | ● | ● | · | · | · | · | · | · | · | `manage` |
| Approve / release | ● | ● | · | · | · | · | · | · | · | `verifyOutcome` |

<details><summary>Who holds each permission</summary>

| Permission | Operation | Roles |
|---|---|---|
| `placement.manage` | Update | `admin`, `high_rank` |
| `placement.recordOutcome` | Create | `admin`, `high_rank`, `lower_rank` |
| `placement.recordOwnChoice` | Read own | `student` |
| `placement.verifyOutcome` | Approve / release | `admin`, `high_rank` |
| `placement.view` | Read all | `admin`, `high_rank`, `finance`, `library`, `lower_rank`, `academic`, `hr`, `exam_officer`, `student` |
| `placement.viewAnalytics` | Read all | `admin`, `high_rank`, `finance`, `library`, `lower_rank`, `academic`, `hr`, `exam_officer` |
| `placement.viewOwn` | Read own | `student` |

</details>

## procurement

| Operation | AD | HR | FI | LI | LR | AC | HM | EO | ST | Permissions |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Read all | ● | ● | ● | · | · | ● | · | · | · | `viewRequisitions` |
| Create | · | · | ● | · | · | ◐ 1/2 | ◐ 1/2 | · | · | `createRequisition`, `receiveGoods` |
| Update | · | · | ● | · | · | · | · | · | · | `managePurchaseOrders`, `manageRFQ`, `manageSuppliers` |
| Approve / release | · | ● | ● | · | · | · | · | · | · | `reviewRequisition` |

<details><summary>Who holds each permission</summary>

| Permission | Operation | Roles |
|---|---|---|
| `procurement.createRequisition` | Create | `finance`, `academic`, `hr` |
| `procurement.managePurchaseOrders` | Update | `finance` |
| `procurement.manageRFQ` | Update | `finance` |
| `procurement.manageSuppliers` | Update | `finance` |
| `procurement.receiveGoods` | Create | `finance` |
| `procurement.reviewRequisition` | Approve / release | `high_rank`, `finance` |
| `procurement.viewRequisitions` | Read all | `admin`, `high_rank`, `finance`, `academic` |

</details>

## report

| Operation | AD | HR | FI | LI | LR | AC | HM | EO | ST | Permissions |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Read own | · | · | · | · | · | · | · | · | ● | `viewOwnAttendance`, `viewOwnFeeStatement`, `viewOwnPerformance` |
| Read all | ◐ 6/22 | ◐ 17/22 | ◐ 7/22 | ◐ 2/22 | ◐ 3/22 | ◐ 3/22 | ◐ 2/22 | ◐ 4/22 | · | `viewAdmissionTrends`, `viewAnyStudentPerformance`, `viewAssignmentCompletion`, `viewAttendanceSummary`, `viewAuditLogs`, `viewBackupStatus`, `viewClassPerformance`, `viewDatabaseMetrics`, `viewExpenseBreakdown`, `viewFeeCollection`, `viewFinanceSummary`, `viewHRReports`, `viewInventoryStatus`, `viewLibraryUsage`, `viewLoginAttempts`, `viewOutstandingBalances`, `viewPayrollSummary`, `viewScholarshipSummary`, `viewSchoolPerformance`, `viewStudentRegistration`, `viewSystemHealth`, `viewTeacherEffectiveness` |
| Export | ● | ● | ● | ● | ● | ● | ● | ● | ● | `export` |

<details><summary>Who holds each permission</summary>

| Permission | Operation | Roles |
|---|---|---|
| `report.export` | Export | `admin`, `high_rank`, `finance`, `library`, `lower_rank`, `academic`, `hr`, `exam_officer`, `student` |
| `report.viewAdmissionTrends` | Read all | `high_rank`, `lower_rank` |
| `report.viewAnyStudentPerformance` | Read all | `admin`, `high_rank`, `finance` |
| `report.viewAssignmentCompletion` | Read all | `academic` |
| `report.viewAttendanceSummary` | Read all | `high_rank`, `lower_rank`, `academic`, `hr`, `exam_officer` |
| `report.viewAuditLogs` | Read all | `admin`, `high_rank` |
| `report.viewBackupStatus` | Read all | `admin` |
| `report.viewClassPerformance` | Read all | `high_rank`, `academic`, `exam_officer` |
| `report.viewDatabaseMetrics` | Read all | `admin` |
| `report.viewExpenseBreakdown` | Read all | `high_rank`, `finance` |
| `report.viewFeeCollection` | Read all | `high_rank`, `finance` |
| `report.viewFinanceSummary` | Read all | `high_rank`, `finance` |
| `report.viewHRReports` | Read all | `high_rank`, `hr` |
| `report.viewInventoryStatus` | Read all | `high_rank`, `library` |
| `report.viewLibraryUsage` | Read all | `high_rank`, `library` |
| `report.viewLoginAttempts` | Read all | `admin` |
| `report.viewOutstandingBalances` | Read all | `high_rank`, `finance` |
| `report.viewOwnAttendance` | Read own | `student` |
| `report.viewOwnFeeStatement` | Read own | `student` |
| `report.viewOwnPerformance` | Read own | `student` |
| `report.viewPayrollSummary` | Read all | `high_rank`, `finance` |
| `report.viewScholarshipSummary` | Read all | `high_rank`, `finance` |
| `report.viewSchoolPerformance` | Read all | `high_rank`, `exam_officer` |
| `report.viewStudentRegistration` | Read all | `high_rank`, `lower_rank` |
| `report.viewSystemHealth` | Read all | `admin` |
| `report.viewTeacherEffectiveness` | Read all | `high_rank`, `exam_officer` |

</details>

## search

| Operation | AD | HR | FI | LI | LR | AC | HM | EO | ST | Permissions |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Read all | ● | ● | ● | ● | · | ● | ● | · | · | `globalSearch` |

<details><summary>Who holds each permission</summary>

| Permission | Operation | Roles |
|---|---|---|
| `search.globalSearch` | Read all | `admin`, `high_rank`, `finance`, `library`, `academic`, `hr` |

</details>

## settings

| Operation | AD | HR | FI | LI | LR | AC | HM | EO | ST | Permissions |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Read own | ● | ● | ● | ● | ● | ● | ● | ● | ● | `viewPersonal` |
| Read all | ● | ● | · | · | · | · | · | · | · | `viewSystemConfig` |
| Update | ◐ 4/16 | ◐ 7/16 | ◐ 3/16 | ◐ 2/16 | ◐ 2/16 | ◐ 2/16 | ◐ 2/16 | ◐ 5/16 | ◐ 1/16 | `manageAcademicPolicy`, `manageClassroomPrefs`, `manageCommunicationPrefs`, `manageExamConfig`, `manageFinanceConfig`, `manageGradingConfig`, `manageHRConfig`, `manageLibraryConfig`, `manageManebConfig`, `manageMonitoringConfig`, `managePayrollConfig`, `manageReportCardConfig`, `manageSchedulingRules`, `manageSecurityConfig`, `manageSystemConfig`, `updateNotifPrefs` |

<details><summary>Who holds each permission</summary>

| Permission | Operation | Roles |
|---|---|---|
| `settings.manageAcademicPolicy` | Update | `high_rank` |
| `settings.manageClassroomPrefs` | Update | `academic` |
| `settings.manageCommunicationPrefs` | Update | `lower_rank` |
| `settings.manageExamConfig` | Update | `high_rank`, `exam_officer` |
| `settings.manageFinanceConfig` | Update | `finance` |
| `settings.manageGradingConfig` | Update | `high_rank`, `exam_officer` |
| `settings.manageHRConfig` | Update | `hr` |
| `settings.manageLibraryConfig` | Update | `library` |
| `settings.manageManebConfig` | Update | `high_rank`, `exam_officer` |
| `settings.manageMonitoringConfig` | Update | `admin` |
| `settings.managePayrollConfig` | Update | `finance` |
| `settings.manageReportCardConfig` | Update | `high_rank` |
| `settings.manageSchedulingRules` | Update | `high_rank`, `exam_officer` |
| `settings.manageSecurityConfig` | Update | `admin` |
| `settings.manageSystemConfig` | Update | `admin` |
| `settings.updateNotifPrefs` | Update | `admin`, `high_rank`, `finance`, `library`, `lower_rank`, `academic`, `hr`, `exam_officer`, `student` |
| `settings.viewPersonal` | Read own | `admin`, `high_rank`, `finance`, `library`, `lower_rank`, `academic`, `hr`, `exam_officer`, `student` |
| `settings.viewSystemConfig` | Read all | `admin`, `high_rank` |

</details>

## student

| Operation | AD | HR | FI | LI | LR | AC | HM | EO | ST | Permissions |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Read own | ● | · | · | · | · | · | · | · | ● | `viewOwn` |
| Read all | ● | ● | ◐ 2/6 | ◐ 2/6 | ◐ 4/6 | ◐ 3/6 | ◐ 2/6 | ◐ 3/6 | · | `view`, `viewAttendance`, `viewFeeStatus`, `viewLibraryStatus`, `viewRiskStatus`, `viewWelfare` |
| Create | ● | ● | · | · | ● | · | · | · | · | `create` |
| Update | ● | ● | · | · | ◐ 1/2 | · | · | · | · | `edit`, `editWelfare` |
| Approve / release | ● | ● | · | · | · | · | · | · | · | `approvePendingAction` |
| Delete / void | ● | ◐ 1/2 | · | · | ◐ 1/2 | · | · | · | · | `hardDelete`, `softDelete` |
| Export | ● | ● | · | · | ● | ● | · | · | ● | `printProfile` |

<details><summary>Who holds each permission</summary>

| Permission | Operation | Roles |
|---|---|---|
| `student.approvePendingAction` | Approve / release | `admin`, `high_rank` |
| `student.create` | Create | `admin`, `high_rank`, `lower_rank` |
| `student.edit` | Update | `admin`, `high_rank`, `lower_rank` |
| `student.editWelfare` | Update | `admin`, `high_rank` |
| `student.hardDelete` | Delete / void | `admin` |
| `student.printProfile` | Export | `admin`, `high_rank`, `lower_rank`, `academic`, `student` |
| `student.softDelete` | Delete / void | `admin`, `high_rank`, `lower_rank` |
| `student.view` | Read all | `admin`, `high_rank`, `finance`, `library`, `lower_rank`, `academic`, `hr`, `exam_officer` |
| `student.viewAttendance` | Read all | `admin`, `high_rank`, `lower_rank`, `academic`, `exam_officer` |
| `student.viewFeeStatus` | Read all | `admin`, `high_rank`, `finance`, `lower_rank` |
| `student.viewLibraryStatus` | Read all | `admin`, `high_rank`, `library`, `lower_rank` |
| `student.viewOwn` | Read own | `admin`, `student` |
| `student.viewRiskStatus` | Read all | `admin`, `high_rank`, `academic`, `exam_officer` |
| `student.viewWelfare` | Read all | `admin`, `high_rank`, `hr` |

</details>

## timetable

| Operation | AD | HR | FI | LI | LR | AC | HM | EO | ST | Permissions |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Read all | ● | ● | ● | ● | ● | ● | ● | ● | ● | `view` |
| Create | · | · | · | · | ● | ● | · | ● | · | `editWithApproval` |
| Update | ◐ 1/3 | ● | · | · | · | · | · | ◐ 1/3 | · | `editDirect`, `manageLabSchedule`, `manageManebTimetable` |
| Approve / release | ● | ● | · | · | · | · | · | · | · | `approve` |

<details><summary>Who holds each permission</summary>

| Permission | Operation | Roles |
|---|---|---|
| `timetable.approve` | Approve / release | `admin`, `high_rank` |
| `timetable.editDirect` | Update | `high_rank` |
| `timetable.editWithApproval` | Create | `lower_rank`, `academic`, `exam_officer` |
| `timetable.manageLabSchedule` | Update | `admin`, `high_rank` |
| `timetable.manageManebTimetable` | Update | `high_rank`, `exam_officer` |
| `timetable.view` | Read all | `admin`, `high_rank`, `finance`, `library`, `lower_rank`, `academic`, `hr`, `exam_officer`, `student` |

</details>

## userMgmt

| Operation | AD | HR | FI | LI | LR | AC | HM | EO | ST | Permissions |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Read all | ● | · | · | · | · | · | · | · | · | `viewActiveSessions`, `viewAuditLogs`, `viewDatabaseMetrics`, `viewErrorLogs`, `viewLoginAttempts`, `viewQueueJobs`, `viewSystemHealth` |
| Create | ● | · | · | · | · | · | · | · | · | `createUser` |
| Update | ● | · | · | · | · | · | · | · | · | `changeUserRole`, `editUser`, `manageAPIServices`, `manageBackups`, `manageIPBlocking`, `resetUserPassword`, `suspendUser` |
| Delete / void | ● | · | · | · | · | · | · | · | · | `archiveUser`, `terminateSession` |

<details><summary>Who holds each permission</summary>

| Permission | Operation | Roles |
|---|---|---|
| `userMgmt.archiveUser` | Delete / void | `admin` |
| `userMgmt.changeUserRole` | Update | `admin` |
| `userMgmt.createUser` | Create | `admin` |
| `userMgmt.editUser` | Update | `admin` |
| `userMgmt.manageAPIServices` | Update | `admin` |
| `userMgmt.manageBackups` | Update | `admin` |
| `userMgmt.manageIPBlocking` | Update | `admin` |
| `userMgmt.resetUserPassword` | Update | `admin` |
| `userMgmt.suspendUser` | Update | `admin` |
| `userMgmt.terminateSession` | Delete / void | `admin` |
| `userMgmt.viewActiveSessions` | Read all | `admin` |
| `userMgmt.viewAuditLogs` | Read all | `admin` |
| `userMgmt.viewDatabaseMetrics` | Read all | `admin` |
| `userMgmt.viewErrorLogs` | Read all | `admin` |
| `userMgmt.viewLoginAttempts` | Read all | `admin` |
| `userMgmt.viewQueueJobs` | Read all | `admin` |
| `userMgmt.viewSystemHealth` | Read all | `admin` |

</details>
