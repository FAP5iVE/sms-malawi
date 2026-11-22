-- ═══════════════════════════════════════════════════════════════════════════
-- Repair migration: bring ANY database up to what schema.prisma expects for the
-- library, assignment and report-related tables.
--
-- WHY THIS EXISTS
--   The library migrations were overwritten while migration conflicts were being
--   resolved, so the live database and the migration history stopped agreeing.
--   Prisma selects EVERY column of a model, so a single column that the schema
--   knows about and the database does not (e.g. library_fines.kind) makes every
--   query on that table fail — which is what turned the student Dashboard
--   ("My term at a glance", "For you to look at"), Reports → Overview / Library
--   and the Library → Fine Waiver Portal into "This section could not be loaded".
--
-- HOW IT IS SAFE
--   * Nothing already applied is edited, so no migration checksum changes.
--   * Every statement is idempotent (IF NOT EXISTS / guarded DO blocks): on a
--     database that is already correct it changes nothing; on one that is missing
--     pieces it adds exactly those pieces, in the same shape the original
--     migrations used.
--   * Nothing is dropped except the obsolete UNIQUE index on
--     library_fines.borrowingId (which the schema no longer has — a loan can carry
--     several fines), and only if it still exists.
--   * No rows are updated, deleted or rewritten.
--
-- Covers: library_new_fields, term_results aggregate columns, book_condition_log,
--         class_subject_presets, user_sessions, staff_sex, ca_exams (caSlot),
--         report_a_problem, library_fine_kind, assignment_workflow,
--         digital_rejection_and_loan_renewals.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Library: books / recommendations (20260915102345_library_new_fields) ───
ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "shelf" TEXT;

ALTER TABLE "resource_recommendations" ADD COLUMN IF NOT EXISTS "requesterClass" TEXT,
ADD COLUMN IF NOT EXISTS "requesterName" TEXT,
ADD COLUMN IF NOT EXISTS "requesterRole" TEXT;

-- ─── Results: aggregate columns (20260915141456_term_results_aggregate_…) ───
ALTER TABLE "term_results" ADD COLUMN IF NOT EXISTS "aggregatePoints" INTEGER,
ADD COLUMN IF NOT EXISTS "aggregateSubjects" JSONB,
ADD COLUMN IF NOT EXISTS "gradingTrack" TEXT;

-- ─── Library: shelf-copy condition log (20260915200623_book_condition_log) ──
CREATE TABLE IF NOT EXISTS "book_condition_logs" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "recordedByUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_condition_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "book_condition_logs_bookId_idx" ON "book_condition_logs"("bookId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'book_condition_logs_bookId_fkey'
      AND conrelid = 'book_condition_logs'::regclass
  ) THEN
    ALTER TABLE "book_condition_logs" ADD CONSTRAINT "book_condition_logs_bookId_fkey"
      FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── Classes: subject presets (20260916211502_class_subject_presets) ────────
ALTER TABLE "classes" ADD COLUMN IF NOT EXISTS "subjectsSetAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "class_subject_presets" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "createdByUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_subject_presets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "class_subject_presets_classId_idx" ON "class_subject_presets"("classId");

CREATE UNIQUE INDEX IF NOT EXISTS "class_subject_presets_classId_subject_key" ON "class_subject_presets"("classId", "subject");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'class_subject_presets_classId_fkey'
      AND conrelid = 'class_subject_presets'::regclass
  ) THEN
    ALTER TABLE "class_subject_presets" ADD CONSTRAINT "class_subject_presets_classId_fkey"
      FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── Sessions (20260919164933_user_sessions) ────────────────────────────────
CREATE TABLE IF NOT EXISTS "user_sessions" (
    "id" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "loginAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loggedOutAt" TIMESTAMP(3),
    "endReason" TEXT,
    "forcedByUid" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "user_sessions_uid_idx" ON "user_sessions"("uid");

CREATE INDEX IF NOT EXISTS "user_sessions_lastSeenAt_idx" ON "user_sessions"("lastSeenAt");

CREATE INDEX IF NOT EXISTS "user_sessions_uid_loggedOutAt_idx" ON "user_sessions"("uid", "loggedOutAt");

-- ─── Staff (20261004102612_staff_sex) ───────────────────────────────────────
ALTER TABLE "staff_profiles" ADD COLUMN IF NOT EXISTS "sex" "Sex";

-- ─── Exams: CA slot (20261022101531_ca_exams_and_asignments) ────────────────
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "caSlot" INTEGER;

-- A unique index can only fail here if duplicate (class, subject, year, term, caSlot)
-- rows already exist; in that case warn instead of failing the whole repair.
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "exams_classId_subject_academicYear_term_caSlot_key"
    ON "exams"("classId", "subject", "academicYear", "term", "caSlot");
EXCEPTION WHEN unique_violation THEN
  RAISE WARNING 'Skipped exams_classId_subject_academicYear_term_caSlot_key: duplicate CA exams exist. Remove the duplicates, then create the index.';
END $$;

-- ─── Problem reports (20261022114449_report_a_problem) ──────────────────────
CREATE TABLE IF NOT EXISTS "problem_reports" (
    "id" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "reporterName" TEXT NOT NULL,
    "reporterIdNumber" TEXT NOT NULL,
    "reporterIdType" TEXT NOT NULL,
    "idMatchesAccount" BOOLEAN,
    "message" TEXT NOT NULL,
    "pageUrl" TEXT,
    "associatedIssueId" TEXT,
    "sentryEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "problem_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "problem_reports_createdAt_idx" ON "problem_reports"("createdAt");

CREATE INDEX IF NOT EXISTS "problem_reports_uid_idx" ON "problem_reports"("uid");

-- ─── Library: typed fines (20261026184632_library_fine_kind) ────────────────
-- THIS is the one the student screens depend on: every read of library_fines
-- (the Fine Waiver Portal, Reports → Library, the dashboard overview and
-- "For you to look at") selects "kind".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'FineKind' AND n.nspname = current_schema()
  ) THEN
    CREATE TYPE "FineKind" AS ENUM ('LATE', 'DAMAGED', 'LOST', 'OTHER');
  END IF;
END $$;

-- One loan can carry several fines (LATE + DAMAGED/LOST), so borrowingId is no longer unique.
DROP INDEX IF EXISTS "library_fines_borrowingId_key";

ALTER TABLE "library_fines" ADD COLUMN IF NOT EXISTS "kind" "FineKind" NOT NULL DEFAULT 'OTHER';

CREATE INDEX IF NOT EXISTS "library_fines_borrowingId_idx" ON "library_fines"("borrowingId");

-- ─── Assignments: marking, attachments, views (20261030202801_assignment_workflow) ─
ALTER TABLE "assignment_submissions" ADD COLUMN IF NOT EXISTS "feedback" TEXT,
ADD COLUMN IF NOT EXISTS "fileName" TEXT,
ADD COLUMN IF NOT EXISTS "markedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "markedByUid" TEXT,
ADD COLUMN IF NOT EXISTS "marks" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "note" TEXT,
ADD COLUMN IF NOT EXISTS "recordedByUid" TEXT,
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "assignments" ADD COLUMN IF NOT EXISTS "marksEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "maxMarks" INTEGER,
ADD COLUMN IF NOT EXISTS "requirements" TEXT,
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "assignment_attachments" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "fileKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "kind" TEXT NOT NULL DEFAULT 'FILE',
    "uploadedByUid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignment_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "assignment_views" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "firstViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "assignment_views_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "assignment_attachments_fileKey_key" ON "assignment_attachments"("fileKey");
EXCEPTION WHEN unique_violation THEN
  RAISE WARNING 'Skipped assignment_attachments_fileKey_key: duplicate fileKey values exist.';
END $$;

CREATE INDEX IF NOT EXISTS "assignment_attachments_assignmentId_idx" ON "assignment_attachments"("assignmentId");

CREATE INDEX IF NOT EXISTS "assignment_views_assignmentId_idx" ON "assignment_views"("assignmentId");

CREATE UNIQUE INDEX IF NOT EXISTS "assignment_views_assignmentId_studentId_key" ON "assignment_views"("assignmentId", "studentId");

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "assignment_submissions_fileKey_key" ON "assignment_submissions"("fileKey");
EXCEPTION WHEN unique_violation THEN
  RAISE WARNING 'Skipped assignment_submissions_fileKey_key: duplicate fileKey values exist.';
END $$;

CREATE INDEX IF NOT EXISTS "assignment_submissions_studentId_idx" ON "assignment_submissions"("studentId");

CREATE INDEX IF NOT EXISTS "assignments_classId_dueDate_idx" ON "assignments"("classId", "dueDate");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assignment_attachments_assignmentId_fkey'
      AND conrelid = 'assignment_attachments'::regclass
  ) THEN
    ALTER TABLE "assignment_attachments" ADD CONSTRAINT "assignment_attachments_assignmentId_fkey"
      FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assignment_views_assignmentId_fkey'
      AND conrelid = 'assignment_views'::regclass
  ) THEN
    ALTER TABLE "assignment_views" ADD CONSTRAINT "assignment_views_assignmentId_fkey"
      FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- ─── Library: digital rejection + loan renewals (20261031120000_digital_rejection_and_loan_renewals) ─
ALTER TABLE "digital_resources" ADD COLUMN IF NOT EXISTS "rejectedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "rejectedByUid" TEXT,
ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;

ALTER TABLE "borrowings" ADD COLUMN IF NOT EXISTS "lastRenewedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "renewalCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "borrowings_lastRenewedAt_idx" ON "borrowings"("lastRenewedAt");
