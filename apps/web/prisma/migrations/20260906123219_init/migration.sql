-- CreateEnum
CREATE TYPE "StudentStatus" AS ENUM ('ACTIVE', 'AWAITING_MANEB_RESULTS', 'GRADUATED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "ClassStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('SUBMITTED', 'LATE', 'MISSING');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'AWAITING_ADMISSION', 'ADMITTED');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY');

-- CreateEnum
CREATE TYPE "TimetableType" AS ENUM ('REGULAR', 'EXAM', 'MANEB', 'LAB');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('SALARIES', 'UTILITIES', 'MAINTENANCE', 'PROCUREMENT', 'LIBRARY', 'TRANSPORT', 'MISCELLANEOUS');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('PROCESSING', 'PENDING_APPROVAL', 'APPROVED', 'LOCKED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "FineStatus" AS ENUM ('PENDING', 'PAID', 'WAIVED');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "ExamType" AS ENUM ('WEEKLY_TEST', 'ASSIGNMENT', 'QUIZ', 'MIDTERM', 'END_TERM', 'MANEB_JCE', 'MANEB_MSCE');

-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'MARKS_PENDING', 'MARKS_DRAFT', 'MARKS_FINAL', 'RESULTS_APPROVED', 'RESULTS_RELEASED');

-- CreateEnum
CREATE TYPE "ManebExamType" AS ENUM ('JCE', 'MSCE');

-- CreateEnum
CREATE TYPE "ManebStatus" AS ENUM ('REGISTERED', 'SITTING', 'RESULTS_RECEIVED', 'CERTIFIED');

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('admin', 'high_rank', 'finance', 'library', 'lower_rank', 'academic', 'hr', 'exam_officer', 'student');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'TEMPORARY');

-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'STUDY', 'UNPAID', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('PENDING', 'APPROVED', 'DISBURSED', 'REPAYING', 'SETTLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "BookCategory" AS ENUM ('TEXTBOOK', 'REFERENCE', 'FICTION', 'NONFICTION', 'SCIENCE', 'MATHEMATICS', 'HUMANITIES', 'PAST_PAPER', 'OTHER');

-- CreateEnum
CREATE TYPE "BorrowerType" AS ENUM ('STUDENT', 'STAFF');

-- CreateEnum
CREATE TYPE "BorrowStatus" AS ENUM ('ACTIVE', 'RETURNED', 'OVERDUE', 'LOST');

-- CreateEnum
CREATE TYPE "BorrowCondition" AS ENUM ('GOOD', 'DAMAGED', 'LOST');

-- CreateEnum
CREATE TYPE "DigitalResType" AS ENUM ('EBOOK', 'PAST_PAPER', 'REFERENCE', 'STUDY_GUIDE');

-- CreateEnum
CREATE TYPE "PendingActionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('PREVIEW', 'COMMITTED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "StaffPromotionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'ACKNOWLEDGED');

-- CreateEnum
CREATE TYPE "PlacementStatus" AS ENUM ('PENDING_APPROVAL', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PlacementEntrySource" AS ENUM ('STAFF_OFFICIAL', 'STUDENT_CLAIM');

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "registrationNo" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "otherNames" TEXT,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "sex" "Sex" NOT NULL,
    "nationality" TEXT NOT NULL DEFAULT 'Malawian',
    "district" TEXT NOT NULL,
    "village" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "guardianName" TEXT NOT NULL,
    "guardianPhone" TEXT NOT NULL,
    "guardianRelation" TEXT NOT NULL,
    "photoKey" TEXT,
    "firebaseUid" TEXT,
    "status" "StudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "classId" TEXT,
    "transcriptKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "form" INTEGER NOT NULL,
    "stream" TEXT,
    "teacherId" TEXT,
    "room" TEXT,
    "status" "ClassStatus" NOT NULL DEFAULT 'ACTIVE',
    "academicYear" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "subject" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "createdByUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_submissions" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fileKey" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',

    CONSTRAINT "assignment_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "markedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_bookings" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "bookedByUid" TEXT NOT NULL,
    "labName" TEXT NOT NULL DEFAULT 'Science Lab',
    "date" TIMESTAMP(3) NOT NULL,
    "periodStart" TEXT NOT NULL,
    "periodEnd" TEXT NOT NULL,
    "purpose" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "otherNames" TEXT,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "sex" "Sex" NOT NULL,
    "nationality" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "village" TEXT,
    "guardianName" TEXT NOT NULL,
    "guardianPhone" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "previousSchool" TEXT,
    "reasonForTransfer" TEXT,
    "academicYear" TEXT,
    "guardianEmail" TEXT,
    "guardianAddress" TEXT,
    "guardianRelation" TEXT NOT NULL,
    "applyingForForm" INTEGER NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUid" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "notes" TEXT,
    "convertedStudentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_slots" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "day" "Weekday" NOT NULL,
    "periodStart" TEXT NOT NULL,
    "periodEnd" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "teacherUid" TEXT NOT NULL,
    "room" TEXT,
    "type" "TimetableType" NOT NULL DEFAULT 'REGULAR',
    "academicYear" TEXT NOT NULL,
    "term" INTEGER NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedByUid" TEXT,

    CONSTRAINT "timetable_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_subject_assignments" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "teacherUid" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "createdByUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_subject_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "actorUid" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structures" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "classId" TEXT,
    "academicYear" TEXT NOT NULL,
    "term" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "term" INTEGER NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "latePenalty" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(12,2) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "scholarshipId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_line_items" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "feeStructureId" TEXT,
    "feeName" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_credits" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "originalAmount" DECIMAL(12,2) NOT NULL,
    "sourcePaymentId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAppliedAt" TIMESTAMP(3),

    CONSTRAINT "student_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "receiptKey" TEXT,
    "recordedByUid" TEXT NOT NULL,
    "notes" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_notes" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "receiptKey" TEXT,
    "academicYear" TEXT NOT NULL,
    "term" INTEGER NOT NULL,
    "approvedByUid" TEXT,
    "approvedAt" TIMESTAMP(3),
    "status" "ExpenseStatus" NOT NULL DEFAULT 'PENDING',
    "recordedByUid" TEXT NOT NULL,
    "incurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "paidByUid" TEXT,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'PROCESSING',
    "totalGross" DECIMAL(12,2) NOT NULL,
    "totalNet" DECIMAL(12,2) NOT NULL,
    "runByUid" TEXT NOT NULL,
    "submittedByUid" TEXT,
    "approvedByUid" TEXT,
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" TEXT NOT NULL,
    "payrollRunId" TEXT NOT NULL,
    "staffUid" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "grossSalary" DECIMAL(12,2) NOT NULL,
    "paye" DECIMAL(12,2) NOT NULL,
    "pension" DECIMAL(12,2) NOT NULL,
    "loanDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netSalary" DECIMAL(12,2) NOT NULL,
    "payslipKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_structures" (
    "id" TEXT NOT NULL,
    "staffUid" TEXT NOT NULL,
    "baseSalary" DECIMAL(12,2) NOT NULL,
    "allowances" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "loanBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "monthlyLoanDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_structures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_allowances" (
    "id" TEXT NOT NULL,
    "staffUid" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT true,
    "paidMonth" INTEGER,
    "paidYear" INTEGER,
    "notes" TEXT,
    "createdByUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_allowances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "term" INTEGER,
    "department" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "description" TEXT,
    "allocated" DECIMAL(12,2) NOT NULL,
    "spent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdByUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scholarships" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "academicYear" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scholarships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installment_plans" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "createdByUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "installment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "installments" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "status" "InstallmentStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_fines" (
    "id" TEXT NOT NULL,
    "studentId" TEXT,
    "staffId" TEXT,
    "bookTitle" TEXT NOT NULL,
    "borrowingId" TEXT,
    "firestoreDocId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "FineStatus" NOT NULL DEFAULT 'PENDING',
    "markedByUid" TEXT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "clearedByUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "waivedAt" TIMESTAMP(3),
    "waivedByUid" TEXT,

    CONSTRAINT "library_fines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chart_of_accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "category" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "isPosted" BOOLEAN NOT NULL DEFAULT false,
    "postedAt" TIMESTAMP(3),
    "postedByUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "debit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "description" TEXT,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_recommendations" (
    "id" TEXT NOT NULL,
    "requestedByUid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "isbn" TEXT,
    "type" TEXT NOT NULL,
    "subject" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedByUid" TEXT,
    "reviewNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fine_waiver_requests" (
    "id" TEXT NOT NULL,
    "fineId" TEXT NOT NULL,
    "requestedByUid" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedByUid" TEXT,
    "reviewNotes" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fine_waiver_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" TEXT NOT NULL,
    "type" "ExamType" NOT NULL,
    "subject" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "timeStart" TEXT NOT NULL,
    "timeEnd" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "maxMark" DECIMAL(6,2) NOT NULL DEFAULT 100,
    "weightPercent" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "academicYear" TEXT NOT NULL,
    "term" INTEGER NOT NULL,
    "status" "ExamStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdByUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_marks" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "mark" DECIMAL(6,2),
    "absent" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT,
    "enteredByUid" TEXT NOT NULL,
    "isDraft" BOOLEAN NOT NULL DEFAULT true,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exam_marks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "term_results" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "term" INTEGER NOT NULL,
    "totalMark" DECIMAL(6,2) NOT NULL,
    "average" DECIMAL(5,2) NOT NULL,
    "grade" TEXT NOT NULL,
    "position" INTEGER,
    "passStatus" BOOLEAN NOT NULL,
    "subjectResults" JSONB NOT NULL,
    "attendanceDays" INTEGER NOT NULL DEFAULT 0,
    "absentDays" INTEGER NOT NULL DEFAULT 0,
    "teacherComment" TEXT,
    "headComment" TEXT,
    "reportCardKey" TEXT,
    "classPosition" INTEGER NOT NULL DEFAULT 0,
    "classTotal" INTEGER NOT NULL DEFAULT 0,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "term_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_comments" (
    "id" TEXT NOT NULL,
    "termResultId" TEXT NOT NULL,
    "authorUid" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annual_results" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "annualAverage" DECIMAL(5,2) NOT NULL,
    "finalGrade" TEXT NOT NULL,
    "annualPosition" INTEGER,
    "passStatus" BOOLEAN NOT NULL,
    "promoted" BOOLEAN NOT NULL DEFAULT false,
    "nextClassId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annual_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maneb_records" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "examType" "ManebExamType" NOT NULL,
    "candidateNo" TEXT NOT NULL,
    "centerNo" TEXT NOT NULL,
    "centerName" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "subjectGrades" JSONB NOT NULL,
    "overallGrade" TEXT,
    "aggregatePoints" INTEGER,
    "status" "ManebStatus" NOT NULL DEFAULT 'REGISTERED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maneb_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gallery_photos" (
    "id" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "caption" TEXT,
    "category" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "uploadedByUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gallery_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_profiles" (
    "id" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "employeeNo" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "role" "StaffRole" NOT NULL,
    "department" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "dateJoined" TIMESTAMP(3) NOT NULL,
    "contractExpiry" TIMESTAMP(3),
    "photoKey" TEXT,
    "salaryStructureId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "leaveType" "LeaveType" NOT NULL,
    "totalDays" INTEGER NOT NULL DEFAULT 0,
    "usedDays" INTEGER NOT NULL DEFAULT 0,
    "pendingDays" INTEGER NOT NULL DEFAULT 0,
    "year" INTEGER NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "leaveType" "LeaveType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "days" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUid" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_loans" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "monthlyDeduction" DECIMAL(10,2) NOT NULL,
    "totalRepaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'PENDING',
    "approvedByUid" TEXT,
    "approvedAt" TIMESTAMP(3),
    "disbursedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_notes" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "term" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "notes" TEXT NOT NULL,
    "authorUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "books" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "isbn" TEXT,
    "category" "BookCategory" NOT NULL,
    "publisher" TEXT,
    "publishedYear" INTEGER,
    "totalCopies" INTEGER NOT NULL DEFAULT 1,
    "availableCopies" INTEGER NOT NULL DEFAULT 1,
    "barcode" TEXT,
    "coverKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borrowings" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "borrowerType" "BorrowerType" NOT NULL,
    "issuedByUid" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "returnedAt" TIMESTAMP(3),
    "status" "BorrowStatus" NOT NULL DEFAULT 'ACTIVE',
    "condition" "BorrowCondition" NOT NULL DEFAULT 'GOOD',
    "fineAmount" DECIMAL(8,2),
    "fineId" TEXT,
    "notes" TEXT,
    "studentId" TEXT,
    "staffId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "borrowings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digital_resources" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "DigitalResType" NOT NULL,
    "subject" TEXT,
    "form" INTEGER,
    "academicYear" TEXT,
    "fileKey" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "uploadedByUid" TEXT NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvedByUid" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "digital_resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digital_resource_views" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "viewerUid" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "digital_resource_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notification_prefs" (
    "id" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "emailFeeReminder" BOOLEAN NOT NULL DEFAULT true,
    "emailLeaveUpdate" BOOLEAN NOT NULL DEFAULT true,
    "emailResultRelease" BOOLEAN NOT NULL DEFAULT true,
    "emailContractAlert" BOOLEAN NOT NULL DEFAULT true,
    "emailAnnouncement" BOOLEAN NOT NULL DEFAULT true,
    "emailPlacementUpdate" BOOLEAN NOT NULL DEFAULT true,
    "smsFeeReminder" BOOLEAN NOT NULL DEFAULT false,
    "smsResultRelease" BOOLEAN NOT NULL DEFAULT false,
    "pushAnnouncement" BOOLEAN NOT NULL DEFAULT true,
    "pushResultRelease" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_notification_prefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_actions" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requestedByUid" TEXT NOT NULL,
    "requestedByRole" TEXT NOT NULL,
    "targetState" JSONB,
    "status" "PendingActionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUid" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'system',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "updatedByUid" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "grading_scales" (
    "id" TEXT NOT NULL,
    "examType" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "minPercent" INTEGER NOT NULL,
    "maxPercent" INTEGER NOT NULL,
    "pass" BOOLEAN NOT NULL,
    "label" TEXT,
    "displayOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grading_scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_runs" (
    "id" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "status" "PromotionStatus" NOT NULL DEFAULT 'PREVIEW',
    "totalStudents" INTEGER NOT NULL DEFAULT 0,
    "promoted" INTEGER NOT NULL DEFAULT 0,
    "repeated" INTEGER NOT NULL DEFAULT 0,
    "graduated" INTEGER NOT NULL DEFAULT 0,
    "log" JSONB NOT NULL DEFAULT '[]',
    "triggeredBy" TEXT NOT NULL,
    "committedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_promotions" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "fromJobTitle" TEXT NOT NULL,
    "toJobTitle" TEXT NOT NULL,
    "fromSalaryGrade" TEXT,
    "toSalaryGrade" TEXT,
    "fromDepartment" TEXT,
    "toDepartment" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "status" "StaffPromotionStatus" NOT NULL DEFAULT 'PENDING',
    "approvedByUid" TEXT,
    "approvedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_reviews" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "reviewerUid" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "term" INTEGER,
    "overallScore" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status" "ReviewStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "performance_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_review_competencies" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "competency" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,

    CONSTRAINT "performance_review_competencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "malawi_public_holidays" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "year" INTEGER NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "malawi_public_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_subscribers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "subscribedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "token" TEXT,
    "unsubscribedAt" TIMESTAMP(3),

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "targetAudience" TEXT NOT NULL DEFAULT 'ALL',
    "eventDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "category" TEXT NOT NULL,
    "createdByUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "university_placements" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "manebRecordId" TEXT NOT NULL,
    "status" "PlacementStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "entrySource" "PlacementEntrySource" NOT NULL DEFAULT 'STUDENT_CLAIM',
    "admissionYear" TEXT NOT NULL DEFAULT '2026',
    "placedUniversityId" TEXT,
    "placedProgrammeId" TEXT,
    "placedUniversityName" TEXT,
    "placedProgrammeName" TEXT,
    "ncheBatchRef" TEXT,
    "claimProofNote" TEXT,
    "rejectionReason" TEXT,
    "recordedByUid" TEXT,
    "verifiedByUid" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "university_placements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentryIssueCache" (
    "id" TEXT NOT NULL,
    "sentryIssueId" TEXT NOT NULL,
    "shortId" TEXT,
    "title" TEXT NOT NULL,
    "culprit" TEXT,
    "level" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "substatus" TEXT,
    "issueCategory" TEXT,
    "isUptimeIssue" BOOLEAN NOT NULL DEFAULT false,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "userCount" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "permalink" TEXT,
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SentryIssueCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentryAlertCache" (
    "id" TEXT NOT NULL,
    "sentryAlertId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "raw" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SentryAlertCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentryRollupStat" (
    "id" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "windowLabel" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentryRollupStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringSyncState" (
    "syncType" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "lastError" TEXT,

    CONSTRAINT "MonitoringSyncState_pkey" PRIMARY KEY ("syncType")
);

-- CreateTable
CREATE TABLE "VercelDeploymentCache" (
    "id" TEXT NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "target" TEXT,
    "url" TEXT,
    "errorMessage" TEXT,
    "createdAtVercel" TIMESTAMP(3) NOT NULL,
    "readyAtVercel" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VercelDeploymentCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VercelRuntimeLogCache" (
    "id" TEXT NOT NULL,
    "rowId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "source" TEXT,
    "deploymentId" TEXT,
    "domain" TEXT,
    "requestMethod" TEXT,
    "requestPath" TEXT,
    "responseStatusCode" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VercelRuntimeLogCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VercelRollupStat" (
    "id" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "windowLabel" TEXT NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VercelRollupStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VercelAlertEvent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'warning',
    "message" TEXT NOT NULL,
    "deploymentId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VercelAlertEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "students_registrationNo_key" ON "students"("registrationNo");

-- CreateIndex
CREATE UNIQUE INDEX "students_firebaseUid_key" ON "students"("firebaseUid");

-- CreateIndex
CREATE INDEX "students_classId_idx" ON "students"("classId");

-- CreateIndex
CREATE INDEX "students_status_idx" ON "students"("status");

-- CreateIndex
CREATE INDEX "students_firebaseUid_idx" ON "students"("firebaseUid");

-- CreateIndex
CREATE INDEX "classes_form_idx" ON "classes"("form");

-- CreateIndex
CREATE INDEX "classes_academicYear_idx" ON "classes"("academicYear");

-- CreateIndex
CREATE INDEX "classes_status_idx" ON "classes"("status");

-- CreateIndex
CREATE INDEX "assignments_classId_idx" ON "assignments"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_submissions_assignmentId_studentId_key" ON "assignment_submissions"("assignmentId", "studentId");

-- CreateIndex
CREATE INDEX "attendance_records_classId_date_idx" ON "attendance_records"("classId", "date");

-- CreateIndex
CREATE INDEX "attendance_records_studentId_idx" ON "attendance_records"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_studentId_classId_date_key" ON "attendance_records"("studentId", "classId", "date");

-- CreateIndex
CREATE INDEX "lab_bookings_date_idx" ON "lab_bookings"("date");

-- CreateIndex
CREATE INDEX "applications_status_idx" ON "applications"("status");

-- CreateIndex
CREATE INDEX "timetable_slots_classId_day_idx" ON "timetable_slots"("classId", "day");

-- CreateIndex
CREATE INDEX "timetable_slots_academicYear_term_idx" ON "timetable_slots"("academicYear", "term");

-- CreateIndex
CREATE INDEX "class_subject_assignments_teacherUid_academicYear_idx" ON "class_subject_assignments"("teacherUid", "academicYear");

-- CreateIndex
CREATE INDEX "class_subject_assignments_classId_academicYear_idx" ON "class_subject_assignments"("classId", "academicYear");

-- CreateIndex
CREATE UNIQUE INDEX "class_subject_assignments_classId_subject_academicYear_key" ON "class_subject_assignments"("classId", "subject", "academicYear");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorUid_idx" ON "audit_logs"("actorUid");

-- CreateIndex
CREATE INDEX "fee_structures_academicYear_classId_idx" ON "fee_structures"("academicYear", "classId");

-- CreateIndex
CREATE INDEX "invoices_studentId_idx" ON "invoices"("studentId");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_academicYear_term_idx" ON "invoices"("academicYear", "term");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_studentId_academicYear_term_key" ON "invoices"("studentId", "academicYear", "term");

-- CreateIndex
CREATE INDEX "invoice_line_items_invoiceId_idx" ON "invoice_line_items"("invoiceId");

-- CreateIndex
CREATE INDEX "payment_allocations_paymentId_idx" ON "payment_allocations"("paymentId");

-- CreateIndex
CREATE INDEX "payment_allocations_lineItemId_idx" ON "payment_allocations"("lineItemId");

-- CreateIndex
CREATE INDEX "student_credits_studentId_idx" ON "student_credits"("studentId");

-- CreateIndex
CREATE INDEX "payments_invoiceId_idx" ON "payments"("invoiceId");

-- CreateIndex
CREATE INDEX "expenses_academicYear_term_idx" ON "expenses"("academicYear", "term");

-- CreateIndex
CREATE INDEX "expenses_category_idx" ON "expenses"("category");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_month_year_key" ON "payroll_runs"("month", "year");

-- CreateIndex
CREATE INDEX "payslips_staffUid_idx" ON "payslips"("staffUid");

-- CreateIndex
CREATE INDEX "payslips_payrollRunId_idx" ON "payslips"("payrollRunId");

-- CreateIndex
CREATE UNIQUE INDEX "salary_structures_staffUid_key" ON "salary_structures"("staffUid");

-- CreateIndex
CREATE INDEX "staff_allowances_staffUid_idx" ON "staff_allowances"("staffUid");

-- CreateIndex
CREATE INDEX "staff_allowances_staffUid_recurring_idx" ON "staff_allowances"("staffUid", "recurring");

-- CreateIndex
CREATE INDEX "budgets_academicYear_idx" ON "budgets"("academicYear");

-- CreateIndex
CREATE INDEX "scholarships_studentId_idx" ON "scholarships"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "installment_plans_invoiceId_key" ON "installment_plans"("invoiceId");

-- CreateIndex
CREATE INDEX "installments_planId_idx" ON "installments"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "library_fines_borrowingId_key" ON "library_fines"("borrowingId");

-- CreateIndex
CREATE UNIQUE INDEX "library_fines_firestoreDocId_key" ON "library_fines"("firestoreDocId");

-- CreateIndex
CREATE INDEX "library_fines_studentId_idx" ON "library_fines"("studentId");

-- CreateIndex
CREATE INDEX "library_fines_staffId_idx" ON "library_fines"("staffId");

-- CreateIndex
CREATE INDEX "library_fines_status_idx" ON "library_fines"("status");

-- CreateIndex
CREATE UNIQUE INDEX "chart_of_accounts_code_key" ON "chart_of_accounts"("code");

-- CreateIndex
CREATE INDEX "chart_of_accounts_type_isActive_idx" ON "chart_of_accounts"("type", "isActive");

-- CreateIndex
CREATE INDEX "journal_entries_entryDate_idx" ON "journal_entries"("entryDate");

-- CreateIndex
CREATE INDEX "journal_entries_isPosted_idx" ON "journal_entries"("isPosted");

-- CreateIndex
CREATE INDEX "journal_lines_journalEntryId_idx" ON "journal_lines"("journalEntryId");

-- CreateIndex
CREATE INDEX "journal_lines_accountId_idx" ON "journal_lines"("accountId");

-- CreateIndex
CREATE INDEX "resource_recommendations_status_idx" ON "resource_recommendations"("status");

-- CreateIndex
CREATE INDEX "fine_waiver_requests_fineId_idx" ON "fine_waiver_requests"("fineId");

-- CreateIndex
CREATE INDEX "fine_waiver_requests_status_idx" ON "fine_waiver_requests"("status");

-- CreateIndex
CREATE INDEX "exams_classId_term_idx" ON "exams"("classId", "term");

-- CreateIndex
CREATE INDEX "exams_academicYear_term_idx" ON "exams"("academicYear", "term");

-- CreateIndex
CREATE INDEX "exam_marks_studentId_idx" ON "exam_marks"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "exam_marks_examId_studentId_key" ON "exam_marks"("examId", "studentId");

-- CreateIndex
CREATE INDEX "term_results_classId_academicYear_term_idx" ON "term_results"("classId", "academicYear", "term");

-- CreateIndex
CREATE UNIQUE INDEX "term_results_studentId_academicYear_term_key" ON "term_results"("studentId", "academicYear", "term");

-- CreateIndex
CREATE INDEX "teacher_comments_termResultId_idx" ON "teacher_comments"("termResultId");

-- CreateIndex
CREATE UNIQUE INDEX "annual_results_studentId_academicYear_key" ON "annual_results"("studentId", "academicYear");

-- CreateIndex
CREATE UNIQUE INDEX "maneb_records_candidateNo_key" ON "maneb_records"("candidateNo");

-- CreateIndex
CREATE INDEX "maneb_records_studentId_idx" ON "maneb_records"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "gallery_photos_fileKey_key" ON "gallery_photos"("fileKey");

-- CreateIndex
CREATE INDEX "gallery_photos_displayOrder_idx" ON "gallery_photos"("displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_uid_key" ON "staff_profiles"("uid");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_employeeNo_key" ON "staff_profiles"("employeeNo");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_email_key" ON "staff_profiles"("email");

-- CreateIndex
CREATE INDEX "staff_profiles_department_idx" ON "staff_profiles"("department");

-- CreateIndex
CREATE INDEX "staff_profiles_contractExpiry_idx" ON "staff_profiles"("contractExpiry");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_staffId_leaveType_year_key" ON "leave_balances"("staffId", "leaveType", "year");

-- CreateIndex
CREATE INDEX "leave_requests_staffId_idx" ON "leave_requests"("staffId");

-- CreateIndex
CREATE INDEX "leave_requests_status_idx" ON "leave_requests"("status");

-- CreateIndex
CREATE INDEX "staff_loans_staffId_idx" ON "staff_loans"("staffId");

-- CreateIndex
CREATE INDEX "performance_notes_staffId_academicYear_idx" ON "performance_notes"("staffId", "academicYear");

-- CreateIndex
CREATE UNIQUE INDEX "books_isbn_key" ON "books"("isbn");

-- CreateIndex
CREATE UNIQUE INDEX "books_barcode_key" ON "books"("barcode");

-- CreateIndex
CREATE INDEX "books_category_idx" ON "books"("category");

-- CreateIndex
CREATE INDEX "books_title_idx" ON "books"("title");

-- CreateIndex
CREATE INDEX "borrowings_studentId_idx" ON "borrowings"("studentId");

-- CreateIndex
CREATE INDEX "borrowings_staffId_idx" ON "borrowings"("staffId");

-- CreateIndex
CREATE INDEX "borrowings_status_idx" ON "borrowings"("status");

-- CreateIndex
CREATE INDEX "borrowings_dueDate_idx" ON "borrowings"("dueDate");

-- CreateIndex
CREATE INDEX "digital_resources_type_approved_idx" ON "digital_resources"("type", "approved");

-- CreateIndex
CREATE INDEX "digital_resources_form_subject_idx" ON "digital_resources"("form", "subject");

-- CreateIndex
CREATE INDEX "digital_resource_views_resourceId_idx" ON "digital_resource_views"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "user_notification_prefs_uid_key" ON "user_notification_prefs"("uid");

-- CreateIndex
CREATE INDEX "pending_actions_status_idx" ON "pending_actions"("status");

-- CreateIndex
CREATE INDEX "pending_actions_entityType_entityId_idx" ON "pending_actions"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "pending_actions_requestedByUid_idx" ON "pending_actions"("requestedByUid");

-- CreateIndex
CREATE INDEX "pending_actions_createdAt_idx" ON "pending_actions"("createdAt");

-- CreateIndex
CREATE INDEX "system_settings_category_idx" ON "system_settings"("category");

-- CreateIndex
CREATE INDEX "grading_scales_examType_isActive_idx" ON "grading_scales"("examType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "grading_scales_examType_grade_key" ON "grading_scales"("examType", "grade");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_runs_academicYear_key" ON "promotion_runs"("academicYear");

-- CreateIndex
CREATE INDEX "staff_promotions_staffId_status_idx" ON "staff_promotions"("staffId", "status");

-- CreateIndex
CREATE INDEX "performance_reviews_staffId_status_idx" ON "performance_reviews"("staffId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "performance_reviews_staffId_academicYear_term_key" ON "performance_reviews"("staffId", "academicYear", "term");

-- CreateIndex
CREATE INDEX "performance_review_competencies_reviewId_idx" ON "performance_review_competencies"("reviewId");

-- CreateIndex
CREATE INDEX "malawi_public_holidays_year_idx" ON "malawi_public_holidays"("year");

-- CreateIndex
CREATE UNIQUE INDEX "malawi_public_holidays_date_key" ON "malawi_public_holidays"("date");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_email_key" ON "newsletter_subscribers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_token_key" ON "newsletter_subscribers"("token");

-- CreateIndex
CREATE INDEX "newsletter_subscribers_email_idx" ON "newsletter_subscribers"("email");

-- CreateIndex
CREATE INDEX "announcements_published_idx" ON "announcements"("published");

-- CreateIndex
CREATE INDEX "announcements_eventDate_idx" ON "announcements"("eventDate");

-- CreateIndex
CREATE INDEX "calendar_events_startDate_idx" ON "calendar_events"("startDate");

-- CreateIndex
CREATE INDEX "calendar_events_createdByUid_idx" ON "calendar_events"("createdByUid");

-- CreateIndex
CREATE UNIQUE INDEX "university_placements_manebRecordId_key" ON "university_placements"("manebRecordId");

-- CreateIndex
CREATE INDEX "university_placements_studentId_status_idx" ON "university_placements"("studentId", "status");

-- CreateIndex
CREATE INDEX "university_placements_status_entrySource_idx" ON "university_placements"("status", "entrySource");

-- CreateIndex
CREATE UNIQUE INDEX "SentryIssueCache_sentryIssueId_key" ON "SentryIssueCache"("sentryIssueId");

-- CreateIndex
CREATE INDEX "SentryIssueCache_status_level_idx" ON "SentryIssueCache"("status", "level");

-- CreateIndex
CREATE INDEX "SentryIssueCache_lastSeenAt_idx" ON "SentryIssueCache"("lastSeenAt");

-- CreateIndex
CREATE INDEX "SentryIssueCache_isUptimeIssue_idx" ON "SentryIssueCache"("isUptimeIssue");

-- CreateIndex
CREATE UNIQUE INDEX "SentryAlertCache_sentryAlertId_key" ON "SentryAlertCache"("sentryAlertId");

-- CreateIndex
CREATE UNIQUE INDEX "SentryRollupStat_metricKey_key" ON "SentryRollupStat"("metricKey");

-- CreateIndex
CREATE UNIQUE INDEX "VercelDeploymentCache_deploymentId_key" ON "VercelDeploymentCache"("deploymentId");

-- CreateIndex
CREATE INDEX "VercelDeploymentCache_state_idx" ON "VercelDeploymentCache"("state");

-- CreateIndex
CREATE UNIQUE INDEX "VercelRuntimeLogCache_rowId_key" ON "VercelRuntimeLogCache"("rowId");

-- CreateIndex
CREATE INDEX "VercelRuntimeLogCache_level_timestamp_idx" ON "VercelRuntimeLogCache"("level", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "VercelRollupStat_metricKey_key" ON "VercelRollupStat"("metricKey");

-- CreateIndex
CREATE INDEX "VercelAlertEvent_kind_acknowledged_idx" ON "VercelAlertEvent"("kind", "acknowledged");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_bookings" ADD CONSTRAINT "lab_bookings_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_slots" ADD CONSTRAINT "timetable_slots_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_subject_assignments" ADD CONSTRAINT "class_subject_assignments_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "invoice_line_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_credits" ADD CONSTRAINT "student_credits_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_notes" ADD CONSTRAINT "invoice_notes_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installments" ADD CONSTRAINT "installments_planId_fkey" FOREIGN KEY ("planId") REFERENCES "installment_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_fines" ADD CONSTRAINT "library_fines_borrowingId_fkey" FOREIGN KEY ("borrowingId") REFERENCES "borrowings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fine_waiver_requests" ADD CONSTRAINT "fine_waiver_requests_fineId_fkey" FOREIGN KEY ("fineId") REFERENCES "library_fines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_marks" ADD CONSTRAINT "exam_marks_examId_fkey" FOREIGN KEY ("examId") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_comments" ADD CONSTRAINT "teacher_comments_termResultId_fkey" FOREIGN KEY ("termResultId") REFERENCES "term_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_loans" ADD CONSTRAINT "staff_loans_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_notes" ADD CONSTRAINT "performance_notes_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borrowings" ADD CONSTRAINT "borrowings_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borrowings" ADD CONSTRAINT "borrowings_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "borrowings" ADD CONSTRAINT "borrowings_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digital_resource_views" ADD CONSTRAINT "digital_resource_views_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "digital_resources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_review_competencies" ADD CONSTRAINT "performance_review_competencies_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "performance_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "university_placements" ADD CONSTRAINT "university_placements_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "university_placements" ADD CONSTRAINT "university_placements_manebRecordId_fkey" FOREIGN KEY ("manebRecordId") REFERENCES "maneb_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
