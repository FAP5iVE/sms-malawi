import type { UserRole } from './roles'

// ─────────────────────────────────────────────────────────
//  PERMISSION UNION TYPE
//  Naming convention: '<domain>.<action>'
//  Domains mirror the application's module structure.
// ─────────────────────────────────────────────────────────

export type Permission =

  // ── STUDENT ──────────────────────────────────────────
  | 'student.view'                   // View any student record
  | 'student.viewOwn'                // Student views own record only
  | 'student.create'                 // Create new student record
  | 'student.edit'                   // Edit any student record
  | 'student.softDelete'             // Soft-delete (queues a pending action)
  | 'student.hardDelete'             // Hard delete — admin only, policy: never use
  | 'student.approvePendingAction'   // Approve pending changes from lower_rank
  | 'student.printProfile'           // Print student profile / ID card
  | 'student.viewFeeStatus'          // See fee status on student record
  | 'student.viewLibraryStatus'      // See library borrowing status on student record
  | 'student.viewAttendance'         // See attendance records for any student

  // ── CLASS ────────────────────────────────────────────
  | 'class.view'                     // View class data
  | 'class.create'                   // Create a new class
  | 'class.edit'                     // Edit class details
  | 'class.softDelete'               // Soft-delete (queues a pending action)
  | 'class.hardDelete'               // Hard delete — admin only
  | 'class.approvePendingAction'     // Approve pending class changes
  | 'class.assignTeacher'            // Assign class teacher
  | 'class.assignSubject'            // Assign subjects to a class
  | 'class.assignRoom'               // Assign a classroom
  | 'class.bookLab'                  // Book lab session for a class
  | 'class.makeAnnouncement'         // Post class-level announcement
  | 'class.giveAssignment'           // Create an assignment for a class
  | 'class.viewAssignments'          // View class assignments
  | 'class.submitAssignment'         // Submit an assignment (student)
  | 'class.viewAnalytics'            // View class analytics panel

  // ── APPLICATION ──────────────────────────────────────
  | 'application.view'               // View admission applications
  | 'application.review'             // Update application status / add notes
  | 'application.approve'            // Mark application APPROVED
  | 'application.deny'               // Mark application DENIED
  | 'application.convertToStudent'   // Convert approved application to Student record

  // ── ANNOUNCEMENT ─────────────────────────────────────
  | 'announcement.view'              // View all visible announcements
  | 'announcement.create'            // Create announcement (publishes directly)
  | 'announcement.createWithApproval'// Create announcement (requires approval)
  | 'announcement.editOwn'           // Edit own announcements
  | 'announcement.deleteOwn'         // Delete own announcements
  | 'announcement.deleteAny'         // Delete any announcement
  | 'announcement.approvePublish'    // Approve pending announcements from others
  | 'announcement.publishDirect'     // Publish without approval workflow
  | 'announcement.schedule'          // Schedule an announcement for future publish

  // ── CALENDAR ─────────────────────────────────────────
  | 'calendar.view'                  // View the calendar
  | 'calendar.createEvent'           // Create calendar events
  | 'calendar.editEvent'             // Edit calendar events
  | 'calendar.deleteEvent'           // Delete calendar events
  | 'calendar.manageAcademicCalendar'// Configure term dates, school year structure
  | 'calendar.viewStaffLeave'        // See staff leave overlaid on calendar

  // ── TIMETABLE ────────────────────────────────────────
  | 'timetable.view'                 // View all timetables (class, exam, lab, MANEB)
  | 'timetable.editWithApproval'     // Edit timetable — changes require approval
  | 'timetable.editDirect'           // Edit timetable — no approval required
  | 'timetable.approve'              // Approve timetable change requests
  | 'timetable.manageLabSchedule'    // Manage lab booking calendar
  | 'timetable.manageManebTimetable' // Add / edit MANEB national exam timetable entries

  // ── REPORT ───────────────────────────────────────────
  | 'report.viewSystemHealth'        // Server uptime, API times, error logs (admin)
  | 'report.viewAuditLogs'           // Full user-activity audit log trail
  | 'report.viewLoginAttempts'       // Successful / failed login attempt logs
  | 'report.viewDatabaseMetrics'     // Database performance and query stats
  | 'report.viewBackupStatus'        // Backup run history and status
  | 'report.viewSchoolPerformance'   // Overall school pass rates, averages (high_rank)
  | 'report.viewTeacherEffectiveness'// Teacher effectiveness analytics
  | 'report.viewFinanceSummary'      // High-level financial summary (high_rank)
  | 'report.viewFeeCollection'       // Fee collection reports (finance)
  | 'report.viewOutstandingBalances' // Outstanding balances per student/class
  | 'report.viewExpenseBreakdown'    // Categorised expense breakdown
  | 'report.viewPayrollSummary'      // Payroll summary and analytics
  | 'report.viewScholarshipSummary'  // Scholarship disbursement summary
  | 'report.viewLibraryUsage'        // Library borrowing usage reports
  | 'report.viewInventoryStatus'     // Library inventory health reports
  | 'report.viewHRReports'           // HR analytics — leave, loans, staffing
  | 'report.viewStudentRegistration' // Student registration and application stats
  | 'report.viewAdmissionTrends'     // Admission trend analytics
  | 'report.viewAttendanceSummary'   // Daily/weekly attendance summaries
  | 'report.viewClassPerformance'    // Class-level performance (academic / exam officer)
  | 'report.viewAssignmentCompletion'// Assignment completion rates per class
  | 'report.viewOwnPerformance'      // Own exam results and performance trend (student)
  | 'report.viewOwnAttendance'       // Own attendance record (student)
  | 'report.viewOwnFeeStatement'     // Own fee statement and payment history (student)
  | 'report.export'                  // Export any permitted report to PDF or XLSX

  // ── FINANCE ──────────────────────────────────────────
  | 'finance.viewSummary'            // View financial dashboard summary
  | 'finance.viewSystemLogs'         // Finance-related system error logs (admin)
  | 'finance.manageFeeStructures'    // Create / edit fee structures
  | 'finance.viewFeeStructures'      // View fee structure definitions
  | 'finance.generateInvoice'        // Generate a single student invoice
  | 'finance.bulkGenerateInvoices'   // Bulk generate invoices for a whole term
  | 'finance.viewInvoices'           // View student invoices
  | 'finance.editInvoice'            // Edit an existing invoice
  | 'finance.recordPayment'          // Record an incoming payment against an invoice
  | 'finance.viewPayments'           // View payment records
  | 'finance.generateReceipt'        // Generate a payment receipt PDF
  | 'finance.addInvoiceNote'         // Add sticky note / comment to an invoice
  | 'finance.createExpense'          // Create an expense record
  | 'finance.viewExpenses'           // View expense records
  | 'finance.approveExpense'         // Approve a pending expense
  | 'finance.rejectExpense'          // Reject a pending expense
  | 'finance.viewBudget'             // View budget allocations
  | 'finance.manageBudget'           // Create / edit budget allocations
  | 'finance.approveBudget'          // Approve budget plans (high_rank)
  | 'finance.viewScholarships'       // View scholarship / bursary records
  | 'finance.manageScholarships'     // Create / edit scholarships
  | 'finance.viewInstallmentPlans'   // View installment plans
  | 'finance.manageInstallmentPlans' // Create / edit installment plans
  | 'finance.viewLibraryFines'       // View library fines in finance module
  | 'finance.clearLibraryFine'       // Mark a library fine as paid
  | 'finance.viewOwnStatement'       // View own fee statement (student)
  | 'finance.runPayroll'             // Process monthly payroll run
  | 'finance.approvePayroll'         // Approve a completed payroll run (high_rank)
  | 'finance.lockPayroll'            // Lock approved payroll — prevents further edits
  | 'finance.rollbackPayroll'        // Roll back a payroll run before locking
  | 'finance.viewPayrollRuns'        // View payroll run history
  | 'finance.manageSalaryStructure'  // Set / update staff salary structures
  | 'finance.linkLoanToPayroll'      // Link an HR loan deduction to payroll
  | 'finance.viewForecast'           // View financial forecasting panel

  // ── LIBRARY ──────────────────────────────────────────
  | 'library.viewCatalog'            // Search / browse the physical book catalog
  | 'library.manageCatalog'          // Add / edit / remove books from catalog
  | 'library.registerCopies'         // Register multiple physical copies of a title
  | 'library.issueBook'              // Issue a book to a student or staff member
  | 'library.processReturn'          // Process a book return
  | 'library.applyFine'              // Apply an overdue fine to a borrower
  | 'library.clearFine'              // Mark a fine as paid
  | 'library.waiveFine'              // Waive a fine (requires finance coordination)
  | 'library.markLost'               // Mark a copy as lost
  | 'library.markDamaged'            // Mark a copy as damaged
  | 'library.viewDigitalResources'   // View / read digital library resources
  | 'library.uploadDigitalResource'  // Upload a new digital resource
  | 'library.approveDigitalResource' // Approve a pending digital resource upload
  | 'library.manageDigitalResources' // Full digital resource management
  | 'library.manageStorage'          // Manage file storage (admin system access only)
  | 'library.viewUsageReports'       // View borrowing usage reports
  | 'library.viewInventoryReports'   // View inventory health reports
  | 'library.requestBorrow'          // Request to borrow a book
  | 'library.viewOwnBorrowings'      // View own borrowing history and current loans
  | 'library.viewOwnFines'           // View own outstanding and paid fines
  | 'library.viewBorrowingHistory'   // View any borrower's full borrowing history
  | 'library.recommendResource'      // Submit resource recommendation for purchase
  | 'library.approveRecommendation'  // Approve / reject resource recommendations

  // ── HR ───────────────────────────────────────────────
  | 'hr.viewOwnProfile'              // View own staff profile
  | 'hr.editOwnLimitedFields'        // Edit own limited fields (phone, address)
  | 'hr.viewAnyProfile'              // View any staff member's full profile
  | 'hr.createStaff'                 // Create a new staff record
  | 'hr.editStaff'                   // Edit any staff member's details
  | 'hr.terminateStaff'              // Terminate a staff member's employment
  | 'hr.assignRole'                  // Assign / change a staff member's role
  | 'hr.promoteStaff'                // Promote or demote a staff member
  | 'hr.applyLeave'                  // Submit own leave request
  | 'hr.viewOwnLeaveHistory'         // View own leave history and balance
  | 'hr.viewAllLeaveRecords'         // View all staff leave records
  | 'hr.approveLeave'                // Approve or reject leave requests
  | 'hr.adjustLeaveBalance'          // Manually adjust leave day balances
  | 'hr.applyLoan'                   // Submit own loan application
  | 'hr.viewOwnLoanStatus'           // View own loan status and repayment schedule
  | 'hr.approveLoan'                 // Approve or reject staff loan applications
  | 'hr.defineLoanRepaymentTerms'    // Define repayment schedule for a loan
  | 'hr.viewOwnPayslips'             // View own monthly payslips
  | 'hr.viewAnyPayslips'             // View any staff member's payslips
  | 'hr.manageSalaryStructure'       // Create and update salary structures
  | 'hr.defineHolidays'              // Define school and public holidays
  | 'hr.viewHRCalendar'              // View leave, holiday, and school calendar
  | 'hr.viewOwnPerformanceNotes'     // View own performance notes and ratings
  | 'hr.addPerformanceNote'          // Add a performance note for a staff member
  | 'hr.viewHRReports'               // View HR analytics, leave usage, loan reports
  | 'hr.manageDiscipline'            // Manage disciplinary records

  // ── EXAM ─────────────────────────────────────────────
  | 'exam.view'                      // View exam schedules and details
  | 'exam.create'                    // Create a new exam
  | 'exam.edit'                      // Edit exam details
  | 'exam.delete'                    // Delete an exam
  | 'exam.enterOwnClassMarks'        // Enter marks for own assigned class / subject
  | 'exam.unlockMarks'               // Unlock finalized marks for re-entry (admin)
  | 'exam.finalizeMarks'             // Submit marks as final (teacher)
  | 'exam.approveResults'            // Exam officer approval stage of results release
  | 'exam.authorizeRelease'          // High-rank final authorization to release results
  | 'exam.viewReleasedResults'       // View results once officially released
  | 'exam.viewOwnResults'            // View own results (student — fee gate applies)
  | 'exam.viewAllResults'            // View all students' results (admin / high_rank / exam_officer)
  | 'exam.viewDraftMarks'            // View draft marks before finalization
  | 'exam.runPromotionEngine'        // Trigger student promotion engine at year-end
  | 'exam.manageManebRecords'        // Manage MANEB registration records
  | 'exam.generateReportCard'        // Generate PDF report cards for a class
  | 'exam.configureGradingScales'    // Configure grade boundaries per exam type
  | 'exam.configureExamWeights'      // Configure exam weight percentages
  | 'exam.viewClassAnalytics'        // View class-level exam analytics
  | 'exam.viewSchoolAnalytics'       // View school-wide exam performance analytics
  | 'exam.viewExamAuditLog'          // View who entered / changed / released marks
  | 'exam.manageManebTimetable'      // Manage MANEB national exam timetable entries

  // ── USER MANAGEMENT ──────────────────────────────────
  | 'userMgmt.createUser'            // Create a new Firebase Auth account + staff record
  | 'userMgmt.editUser'              // Edit user account details
  | 'userMgmt.changeUserRole'        // Change a user's role and Firebase custom claims
  | 'userMgmt.resetUserPassword'     // Trigger password reset email
  | 'userMgmt.suspendUser'           // Suspend a user account (disable login)
  | 'userMgmt.archiveUser'           // Archive a user account permanently
  | 'userMgmt.viewActiveSessions'    // View currently active user sessions
  | 'userMgmt.terminateSession'      // Force-terminate a user's active session
  | 'userMgmt.viewAuditLogs'         // Query the full audit log table
  | 'userMgmt.viewLoginAttempts'     // View successful and failed login events
  | 'userMgmt.viewSystemHealth'      // View server, function, and database health
  | 'userMgmt.viewErrorLogs'         // View Sentry error log summaries
  | 'userMgmt.manageIPBlocking'      // Add / remove IPs from the blocklist
  | 'userMgmt.manageBackups'         // View backup status and configure backup policy
  | 'userMgmt.viewDatabaseMetrics'   // View Neon query stats and connection pool usage
  | 'userMgmt.viewQueueJobs'         // View cron and background job execution history
  | 'userMgmt.manageAPIServices'     // View and manage external API integrations

  // ── SETTINGS ─────────────────────────────────────────
  | 'settings.viewPersonal'          // View and edit own personal settings (all roles)
  | 'settings.updateNotifPrefs'      // Update own notification preferences
  | 'settings.viewSystemConfig'      // View system-wide configuration values
  | 'settings.manageSystemConfig'    // Manage system-wide configuration (admin)
  | 'settings.manageSecurityConfig'  // Manage security settings: IP, sessions (admin)
  | 'settings.manageMonitoringConfig'// Manage Sentry / logging settings (admin)
  | 'settings.manageAcademicPolicy'  // Academic calendar, term structure (high_rank)
  | 'settings.manageReportCardConfig'// Report card template and fields (high_rank)
  | 'settings.manageExamConfig'      // Exam scheduling rules (high_rank / exam_officer)
  | 'settings.manageGradingConfig'   // Grading scale boundaries (high_rank / exam_officer)
  | 'settings.manageSchedulingRules' // Class schedule rules (high_rank / exam_officer)
  | 'settings.manageManebConfig'     // MANEB centre numbers, deadlines (high_rank / exam_officer)
  | 'settings.manageFinanceConfig'   // Finance module preferences (finance)
  | 'settings.managePayrollConfig'   // Payroll preferences (finance)
  | 'settings.manageLibraryConfig'   // Library module settings (library)
  | 'settings.manageHRConfig'        // HR module settings, leave policy (hr)
  | 'settings.manageCommunicationPrefs' // Communication workflow settings (lower_rank)
  | 'settings.manageClassroomPrefs'  // Classroom and teaching preferences (academic)

// ─────────────────────────────────────────────────────────
//  ROLE → PERMISSION MAP
//  Each role gets a ReadonlySet<Permission> for O(1) has() checks.
//  Constructed once at module load — never mutated at runtime.
// ─────────────────────────────────────────────────────────

export const ROLE_PERMISSIONS: Readonly<Record<UserRole, ReadonlySet<Permission>>> = {

  // ── ADMIN ─────────────────────────────────────────────
  // System / IT administrator. Full control of user accounts, security,
  // system configuration, and audit visibility.
  // Does NOT perform business operations (entering marks, recording
  // payments, issuing books) — those belong to domain roles.
  // Exception: admin.unlockMarks (technical maintenance for exam module).
  admin: new Set<Permission>([
    // Students — oversight only
    'student.view',
    'student.approvePendingAction',
    'student.hardDelete',           // The one destructive permission; policy says never use
    'student.viewFeeStatus',
    'student.viewLibraryStatus',
    'student.viewAttendance',

    // Classes — oversight only
    'class.view',
    'class.approvePendingAction',
    'class.viewAnalytics',

    // Applications — oversight
    'application.view',

    // Announcements — moderation
    'announcement.view',
    'announcement.approvePublish',
    'announcement.deleteAny',

    // Calendar — full
    'calendar.view',
    'calendar.createEvent',
    'calendar.editEvent',
    'calendar.deleteEvent',
    'calendar.manageAcademicCalendar',
    'calendar.viewStaffLeave',

    // Timetable — approval authority and oversight
    'timetable.view',
    'timetable.approve',
    'timetable.manageLabSchedule',

    // Reports — system-level only
    'report.viewSystemHealth',
    'report.viewAuditLogs',
    'report.viewLoginAttempts',
    'report.viewDatabaseMetrics',
    'report.viewBackupStatus',
    'report.export',

    // Finance — system log visibility only (no write operations)
    'finance.viewSummary',
    'finance.viewSystemLogs',

    // Library — storage management only (no business logic)
    'library.manageStorage',
    'library.viewCatalog',
    'library.viewUsageReports',
    'library.viewInventoryReports',

    // HR — system account management only (no HR data logic)
    'hr.viewAnyProfile',
    'hr.viewHRReports',

    // Exams — technical maintenance and audit visibility only
    'exam.unlockMarks',
    'exam.viewAllResults',
    'exam.viewExamAuditLog',
    'exam.viewClassAnalytics',
    'exam.viewSchoolAnalytics',

    // User management — all
    'userMgmt.createUser',
    'userMgmt.editUser',
    'userMgmt.changeUserRole',
    'userMgmt.resetUserPassword',
    'userMgmt.suspendUser',
    'userMgmt.archiveUser',
    'userMgmt.viewActiveSessions',
    'userMgmt.terminateSession',
    'userMgmt.viewAuditLogs',
    'userMgmt.viewLoginAttempts',
    'userMgmt.viewSystemHealth',
    'userMgmt.viewErrorLogs',
    'userMgmt.manageIPBlocking',
    'userMgmt.manageBackups',
    'userMgmt.viewDatabaseMetrics',
    'userMgmt.viewQueueJobs',
    'userMgmt.manageAPIServices',

    // Settings — all system-level
    'settings.viewPersonal',
    'settings.updateNotifPrefs',
    'settings.viewSystemConfig',
    'settings.manageSystemConfig',
    'settings.manageSecurityConfig',
    'settings.manageMonitoringConfig',
  ]),

  // ── HIGH_RANK ─────────────────────────────────────────
  // Headteacher, deputy headteacher, principal.
  // Business super-users — approve most operations across all modules.
  // Cannot do: record payments, enter marks (business operations that
  // belong strictly to the accountable domain role).
  high_rank: new Set<Permission>([
    // Students — full management + approvals
    'student.view',
    'student.create',
    'student.edit',
    'student.softDelete',
    'student.approvePendingAction',
    'student.printProfile',
    'student.viewFeeStatus',
    'student.viewLibraryStatus',
    'student.viewAttendance',

    // Classes — full management
    'class.view',
    'class.create',
    'class.edit',
    'class.softDelete',
    'class.approvePendingAction',
    'class.assignTeacher',
    'class.assignSubject',
    'class.assignRoom',
    'class.viewAnalytics',

    // Applications — full access
    'application.view',
    'application.review',
    'application.approve',
    'application.deny',
    'application.convertToStudent',

    // Announcements — full management
    'announcement.view',
    'announcement.create',
    'announcement.editOwn',
    'announcement.deleteOwn',
    'announcement.deleteAny',
    'announcement.approvePublish',
    'announcement.publishDirect',
    'announcement.schedule',

    // Calendar — full
    'calendar.view',
    'calendar.createEvent',
    'calendar.editEvent',
    'calendar.deleteEvent',
    'calendar.manageAcademicCalendar',
    'calendar.viewStaffLeave',

    // Timetable — full management
    'timetable.view',
    'timetable.editDirect',
    'timetable.approve',
    'timetable.manageLabSchedule',
    'timetable.manageManebTimetable',

    // Reports — executive-level
    'report.viewSchoolPerformance',
    'report.viewTeacherEffectiveness',
    'report.viewFinanceSummary',
    'report.viewFeeCollection',
    'report.viewOutstandingBalances',
    'report.viewExpenseBreakdown',
    'report.viewPayrollSummary',
    'report.viewScholarshipSummary',
    'report.viewLibraryUsage',
    'report.viewInventoryStatus',
    'report.viewHRReports',
    'report.viewStudentRegistration',
    'report.viewAdmissionTrends',
    'report.viewAttendanceSummary',
    'report.viewClassPerformance',
    'report.viewAuditLogs',
    'report.export',

    // Finance — view and approve only (no write / transaction rights)
    'finance.viewSummary',
    'finance.viewFeeStructures',
    'finance.viewInvoices',
    'finance.viewPayments',
    'finance.viewExpenses',
    'finance.approveExpense',
    'finance.viewBudget',
    'finance.approveBudget',
    'finance.viewScholarships',
    'finance.viewInstallmentPlans',
    'finance.viewLibraryFines',
    'finance.viewPayrollRuns',
    'finance.approvePayroll',
    'finance.viewForecast',

    // Library — view and reports
    'library.viewCatalog',
    'library.viewDigitalResources',
    'library.viewUsageReports',
    'library.viewInventoryReports',
    'library.viewBorrowingHistory',

    // HR — full management authority
    'hr.viewOwnProfile',
    'hr.editOwnLimitedFields',
    'hr.viewAnyProfile',
    'hr.createStaff',
    'hr.editStaff',
    'hr.terminateStaff',
    'hr.assignRole',
    'hr.promoteStaff',
    'hr.applyLeave',
    'hr.viewOwnLeaveHistory',
    'hr.viewAllLeaveRecords',
    'hr.approveLeave',
    'hr.adjustLeaveBalance',
    'hr.applyLoan',
    'hr.viewOwnLoanStatus',
    'hr.approveLoan',
    'hr.defineLoanRepaymentTerms',
    'hr.viewOwnPayslips',
    'hr.viewAnyPayslips',
    'hr.manageSalaryStructure',
    'hr.defineHolidays',
    'hr.viewHRCalendar',
    'hr.viewOwnPerformanceNotes',
    'hr.addPerformanceNote',
    'hr.viewHRReports',
    'hr.manageDiscipline',

    // Exams — full management including result release authorization
    'exam.view',
    'exam.create',
    'exam.edit',
    'exam.authorizeRelease',
    'exam.viewReleasedResults',
    'exam.viewAllResults',
    'exam.viewDraftMarks',
    'exam.runPromotionEngine',
    'exam.manageManebRecords',
    'exam.generateReportCard',
    'exam.configureGradingScales',
    'exam.configureExamWeights',
    'exam.viewClassAnalytics',
    'exam.viewSchoolAnalytics',
    'exam.viewExamAuditLog',
    'exam.manageManebTimetable',

    // Settings — institutional and academic policy
    'settings.viewPersonal',
    'settings.updateNotifPrefs',
    'settings.viewSystemConfig',
    'settings.manageAcademicPolicy',
    'settings.manageReportCardConfig',
    'settings.manageExamConfig',
    'settings.manageGradingConfig',
    'settings.manageSchedulingRules',
    'settings.manageManebConfig',
  ]),

  // ── FINANCE ───────────────────────────────────────────
  // Accountants, finance officers. Full financial operations.
  // Has own HR self-service (leave, loans, payslips).
  finance: new Set<Permission>([
    // Students — view and fee status only
    'student.view',
    'student.viewFeeStatus',

    // Classes — view only (for class-based fee analysis)
    'class.view',

    // Announcements — own only
    'announcement.view',
    'announcement.createWithApproval',
    'announcement.editOwn',
    'announcement.deleteOwn',

    // Calendar
    'calendar.view',
    'calendar.createEvent',
    'calendar.editEvent',

    // Timetable — view only
    'timetable.view',

    // Reports — finance-specific
    'report.viewFeeCollection',
    'report.viewOutstandingBalances',
    'report.viewExpenseBreakdown',
    'report.viewPayrollSummary',
    'report.viewScholarshipSummary',
    'report.export',

    // Finance — full business operations
    'finance.viewSummary',
    'finance.manageFeeStructures',
    'finance.viewFeeStructures',
    'finance.generateInvoice',
    'finance.bulkGenerateInvoices',
    'finance.viewInvoices',
    'finance.editInvoice',
    'finance.recordPayment',
    'finance.viewPayments',
    'finance.generateReceipt',
    'finance.addInvoiceNote',
    'finance.createExpense',
    'finance.viewExpenses',
    'finance.viewBudget',
    'finance.manageBudget',
    'finance.viewScholarships',
    'finance.manageScholarships',
    'finance.viewInstallmentPlans',
    'finance.manageInstallmentPlans',
    'finance.viewLibraryFines',
    'finance.clearLibraryFine',
    'finance.runPayroll',
    'finance.lockPayroll',
    'finance.rollbackPayroll',
    'finance.viewPayrollRuns',
    'finance.manageSalaryStructure',
    'finance.linkLoanToPayroll',
    'finance.viewForecast',

    // Library — fines access only (§3.14.1.3)
    'library.viewCatalog',
    'library.viewDigitalResources',
    'library.requestBorrow',
    'library.viewOwnBorrowings',
    'library.viewOwnFines',

    // HR — self-service only
    'hr.viewOwnProfile',
    'hr.editOwnLimitedFields',
    'hr.applyLeave',
    'hr.viewOwnLeaveHistory',
    'hr.applyLoan',
    'hr.viewOwnLoanStatus',
    'hr.viewOwnPayslips',
    'hr.viewHRCalendar',

    // Exams — no access
    // User management — no access

    // Settings — finance module only
    'settings.viewPersonal',
    'settings.updateNotifPrefs',
    'settings.manageFinanceConfig',
    'settings.managePayrollConfig',
  ]),

  // ── LIBRARY ───────────────────────────────────────────
  // Librarians. Full physical and digital library operations.
  // Has own HR self-service.
  library: new Set<Permission>([
    // Students — view and library status only
    'student.view',
    'student.viewLibraryStatus',

    // Classes — view only
    'class.view',

    // Announcements — own only
    'announcement.view',
    'announcement.createWithApproval',
    'announcement.editOwn',
    'announcement.deleteOwn',

    // Calendar
    'calendar.view',
    'calendar.createEvent',
    'calendar.editEvent',

    // Timetable — view only
    'timetable.view',

    // Reports — library-specific
    'report.viewLibraryUsage',
    'report.viewInventoryStatus',
    'report.export',

    // Finance — fines coordination only
    'finance.viewLibraryFines',
    'finance.clearLibraryFine',
    'finance.waiveFine',

    // Library — full operations
    'library.viewCatalog',
    'library.manageCatalog',
    'library.registerCopies',
    'library.issueBook',
    'library.processReturn',
    'library.applyFine',
    'library.clearFine',
    'library.waiveFine',
    'library.markLost',
    'library.markDamaged',
    'library.viewDigitalResources',
    'library.uploadDigitalResource',
    'library.approveDigitalResource',
    'library.manageDigitalResources',
    'library.viewUsageReports',
    'library.viewInventoryReports',
    'library.requestBorrow',
    'library.viewOwnBorrowings',
    'library.viewOwnFines',
    'library.viewBorrowingHistory',
    'library.recommendResource',
    'library.approveRecommendation',

    // HR — self-service only
    'hr.viewOwnProfile',
    'hr.editOwnLimitedFields',
    'hr.applyLeave',
    'hr.viewOwnLeaveHistory',
    'hr.applyLoan',
    'hr.viewOwnLoanStatus',
    'hr.viewOwnPayslips',
    'hr.viewHRCalendar',

    // Exams — no access
    // User management — no access

    // Settings — library module only
    'settings.viewPersonal',
    'settings.updateNotifPrefs',
    'settings.manageLibraryConfig',
  ]),

  // ── LOWER_RANK ────────────────────────────────────────
  // Secretaries, registrars, administrative assistants.
  // Can initiate many actions but most require approval from
  // admin or high_rank before taking effect.
  lower_rank: new Set<Permission>([
    // Students — create/edit/soft-delete with approval required
    'student.view',
    'student.create',
    'student.edit',
    'student.softDelete',
    'student.viewFeeStatus',
    'student.viewLibraryStatus',
    'student.viewAttendance',
    'student.printProfile',

    // Classes — create/edit/soft-delete with approval required
    'class.view',
    'class.create',
    'class.edit',
    'class.softDelete',
    'class.viewAnalytics',

    // Applications — partial access with approval limits
    'application.view',
    'application.review',

    // Announcements — own only, pending approval
    'announcement.view',
    'announcement.createWithApproval',
    'announcement.editOwn',
    'announcement.deleteOwn',

    // Calendar
    'calendar.view',
    'calendar.createEvent',
    'calendar.editEvent',

    // Timetable — edit with approval required
    'timetable.view',
    'timetable.editWithApproval',

    // Reports — registration and administrative focus
    'report.viewStudentRegistration',
    'report.viewAdmissionTrends',
    'report.viewAttendanceSummary',
    'report.export',

    // Finance — view student fee status only (§3.13.1.5)
    'finance.viewInvoices',

    // Library — no access (§3.14.1.5)

    // HR — self-service only
    'hr.viewOwnProfile',
    'hr.editOwnLimitedFields',
    'hr.applyLeave',
    'hr.viewOwnLeaveHistory',
    'hr.applyLoan',
    'hr.viewOwnLoanStatus',
    'hr.viewOwnPayslips',
    'hr.viewHRCalendar',

    // Exams — view and released results only
    'exam.view',
    'exam.viewReleasedResults',

    // User management — no access
    // Settings — communication and registration preferences
    'settings.viewPersonal',
    'settings.updateNotifPrefs',
    'settings.manageCommunicationPrefs',
  ]),

  // ── ACADEMIC ──────────────────────────────────────────
  // Teachers. Manage their own classes, enter marks for their
  // own subjects, library self-service.
  academic: new Set<Permission>([
    // Students — view only (no editing)
    'student.view',
    'student.viewAttendance',
    'student.printProfile',

    // Classes — teaching-specific operations
    'class.view',
    'class.bookLab',
    'class.makeAnnouncement',
    'class.giveAssignment',
    'class.viewAssignments',
    'class.viewAnalytics',

    // Applications — no access (§3.8.1.6)

    // Announcements — own plus class approval authority
    'announcement.view',
    'announcement.createWithApproval',
    'announcement.editOwn',
    'announcement.deleteOwn',
    'announcement.approvePublish',  // Can approve/deny student announcements to their class

    // Calendar
    'calendar.view',
    'calendar.createEvent',
    'calendar.editEvent',

    // Timetable — edit with approval required
    'timetable.view',
    'timetable.editWithApproval',

    // Reports — class and academic focus
    'report.viewClassPerformance',
    'report.viewAssignmentCompletion',
    'report.viewAttendanceSummary',
    'report.export',

    // Finance — no access (§3.13.1.6)

    // Library — full staff borrowing + resource upload / recommend
    'library.viewCatalog',
    'library.requestBorrow',
    'library.viewOwnBorrowings',
    'library.viewOwnFines',
    'library.viewDigitalResources',
    'library.uploadDigitalResource',
    'library.recommendResource',

    // HR — self-service only
    'hr.viewOwnProfile',
    'hr.editOwnLimitedFields',
    'hr.applyLeave',
    'hr.viewOwnLeaveHistory',
    'hr.applyLoan',
    'hr.viewOwnLoanStatus',
    'hr.viewOwnPayslips',
    'hr.viewHRCalendar',
    'hr.viewOwnPerformanceNotes',

    // Exams — own classes only; cannot see other teachers' draft marks
    'exam.view',
    'exam.create',
    'exam.edit',
    'exam.enterOwnClassMarks',
    'exam.finalizeMarks',
    'exam.viewReleasedResults',
    'exam.viewDraftMarks',      // Own draft marks only — enforced at service layer
    'exam.viewClassAnalytics',

    // User management — no access
    // Settings — classroom preferences only
    'settings.viewPersonal',
    'settings.updateNotifPrefs',
    'settings.manageClassroomPrefs',
  ]),

  // ── HR ────────────────────────────────────────────────
  // HR officers. Full HR module management. Self-service for
  // personal records, leave, loans.
  hr: new Set<Permission>([
    // Students — view only
    'student.view',

    // Classes — view only
    'class.view',

    // Announcements — own only, pending approval
    'announcement.view',
    'announcement.createWithApproval',
    'announcement.editOwn',
    'announcement.deleteOwn',

    // Calendar
    'calendar.view',
    'calendar.createEvent',
    'calendar.editEvent',
    'calendar.viewStaffLeave',

    // Timetable — view only
    'timetable.view',

    // Reports — HR focus
    'report.viewHRReports',
    'report.viewAttendanceSummary',
    'report.export',

    // Finance — salary coordination only
    'finance.viewPayrollRuns',
    'finance.manageSalaryStructure',
    'finance.linkLoanToPayroll',
    'finance.viewOwnStatement',   // HR staff are also employees

    // Library — staff self-service
    'library.viewCatalog',
    'library.requestBorrow',
    'library.viewOwnBorrowings',
    'library.viewOwnFines',
    'library.viewDigitalResources',

    // HR — full management
    'hr.viewOwnProfile',
    'hr.editOwnLimitedFields',
    'hr.viewAnyProfile',
    'hr.createStaff',
    'hr.editStaff',
    'hr.terminateStaff',
    'hr.assignRole',
    'hr.promoteStaff',
    'hr.applyLeave',
    'hr.viewOwnLeaveHistory',
    'hr.viewAllLeaveRecords',
    'hr.approveLeave',
    'hr.adjustLeaveBalance',
    'hr.applyLoan',
    'hr.viewOwnLoanStatus',
    'hr.approveLoan',
    'hr.defineLoanRepaymentTerms',
    'hr.viewOwnPayslips',
    'hr.viewAnyPayslips',
    'hr.manageSalaryStructure',
    'hr.defineHolidays',
    'hr.viewHRCalendar',
    'hr.viewOwnPerformanceNotes',
    'hr.addPerformanceNote',
    'hr.viewHRReports',
    'hr.manageDiscipline',

    // Exams — no access (§3.16)
    // User management — no access

    // Settings — HR module only
    'settings.viewPersonal',
    'settings.updateNotifPrefs',
    'settings.manageHRConfig',
  ]),

  // ── EXAM_OFFICER ──────────────────────────────────────
  // Dedicated exam management role. Controls full exam lifecycle
  // from scheduling through to the approval stage of results release.
  // Final release authorization is high_rank — not exam_officer.
  exam_officer: new Set<Permission>([
    // Students — view only (for mark entry context)
    'student.view',
    'student.viewAttendance',

    // Classes — view and analytics
    'class.view',
    'class.viewAnalytics',

    // Announcements — own only, pending approval
    'announcement.view',
    'announcement.createWithApproval',
    'announcement.editOwn',
    'announcement.deleteOwn',

    // Calendar — view only
    'calendar.view',

    // Timetable — manage exam timetable
    'timetable.view',
    'timetable.editWithApproval',
    'timetable.manageManebTimetable',

    // Reports — academic performance focus
    'report.viewClassPerformance',
    'report.viewSchoolPerformance',
    'report.viewTeacherEffectiveness',
    'report.viewAttendanceSummary',
    'report.export',

    // Finance — no access (§3.13)

    // Library — staff self-service
    'library.viewCatalog',
    'library.requestBorrow',
    'library.viewOwnBorrowings',
    'library.viewOwnFines',
    'library.viewDigitalResources',

    // HR — self-service only
    'hr.viewOwnProfile',
    'hr.editOwnLimitedFields',
    'hr.applyLeave',
    'hr.viewOwnLeaveHistory',
    'hr.applyLoan',
    'hr.viewOwnLoanStatus',
    'hr.viewOwnPayslips',
    'hr.viewHRCalendar',
    'hr.viewOwnPerformanceNotes',

    // Exams — full exam officer operations
    'exam.view',
    'exam.create',
    'exam.edit',
    'exam.delete',
    'exam.viewDraftMarks',
    'exam.approveResults',
    'exam.viewReleasedResults',
    'exam.viewAllResults',
    'exam.runPromotionEngine',
    'exam.manageManebRecords',
    'exam.generateReportCard',
    'exam.configureGradingScales',
    'exam.configureExamWeights',
    'exam.viewClassAnalytics',
    'exam.viewSchoolAnalytics',
    'exam.viewExamAuditLog',
    'exam.manageManebTimetable',

    // User management — no access

    // Settings — exam configuration
    'settings.viewPersonal',
    'settings.updateNotifPrefs',
    'settings.manageExamConfig',
    'settings.manageGradingConfig',
    'settings.manageSchedulingRules',
    'settings.manageManebConfig',
  ]),

  // ── STUDENT ───────────────────────────────────────────
  // Enrolled students. Read-only access to their own data.
  // Results visibility is subject to the fee-balance gate enforced
  // at the service layer — this permission map does not capture that;
  // it only defines what the student is structurally allowed to request.
  student: new Set<Permission>([
    // Students — own record only
    'student.viewOwn',
    'student.printProfile',

    // Classes — view and assignment interaction
    'class.view',
    'class.viewAssignments',
    'class.submitAssignment',

    // Announcements — view all, create for own class (pending teacher approval)
    'announcement.view',
    'announcement.createWithApproval',
    'announcement.editOwn',

    // Calendar — view only
    'calendar.view',

    // Timetable — view only
    'timetable.view',

    // Reports — own data only
    'report.viewOwnPerformance',
    'report.viewOwnAttendance',
    'report.viewOwnFeeStatement',
    'report.export',

    // Finance — own statement only
    'finance.viewOwnStatement',

    // Library — catalog, borrowing, digital resources
    'library.viewCatalog',
    'library.requestBorrow',
    'library.viewOwnBorrowings',
    'library.viewOwnFines',
    'library.viewDigitalResources',

    // HR — no access (§3.15.1.7)
    // Exams — own released results only (fee gate enforced at service layer)
    'exam.view',
    'exam.viewOwnResults',
    'exam.viewReleasedResults',

    // User management — no access
    // Settings — personal profile and notification preferences only
    'settings.viewPersonal',
    'settings.updateNotifPrefs',
  ]),
} as const

// ─────────────────────────────────────────────────────────
//  HELPER UTILITIES
// ─────────────────────────────────────────────────────────

/**
 * Check whether a given role has a specific permission.
 * O(1) — uses Set.prototype.has() internally.
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] as ReadonlySet<Permission>).has(permission)
}

/**
 * Check whether a given role has ALL of the provided permissions.
 * Short-circuits on the first missing permission.
 */
export function hasAllPermissions(
  role: UserRole,
  permissions: readonly Permission[]
): boolean {
  const set = ROLE_PERMISSIONS[role] as ReadonlySet<Permission>
  return permissions.every((p) => set.has(p))
}

/**
 * Check whether a given role has AT LEAST ONE of the provided permissions.
 * Short-circuits on the first matching permission.
 */
export function hasAnyPermission(
  role: UserRole,
  permissions: readonly Permission[]
): boolean {
  const set = ROLE_PERMISSIONS[role] as ReadonlySet<Permission>
  return permissions.some((p) => set.has(p))
}

/**
 * Return the full permission set for a role as a plain array.
 * Useful for debugging and audit log enrichment — not for runtime checks
 * (use hasPermission / hasAllPermissions / hasAnyPermission instead).
 */
export function getPermissionsForRole(role: UserRole): Permission[] {
  return Array.from(ROLE_PERMISSIONS[role] as ReadonlySet<Permission>)
}