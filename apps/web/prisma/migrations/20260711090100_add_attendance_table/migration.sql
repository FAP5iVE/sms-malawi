-- [CHANGE TYPE]: NEW FILE (migration)
-- [R-PHASE]: R6 — Academics II: Classes, Assignments & the Attendance Rebuild
-- [PURPOSE]: Creates the "attendance_records" table — the Postgres system
--   of record for attendance, replacing unmediated Firestore access
--   (attendance/{classId}/records/{date} documents) per the R3 Option B
--   decision. One row per student per class per day. markedBy is a plain
--   Firebase UID string (application-level validated against
--   Class.teacherId) — no DB-level FK is possible across the
--   Firebase-UID/Postgres boundary.
-- [DEPENDS ON]: apps/web/prisma/schema.prisma (Attendance model +
--   AttendanceStatus enum added in the same change)

CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE');

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

CREATE UNIQUE INDEX "attendance_records_studentId_classId_date_key" ON "attendance_records"("studentId", "classId", "date");

CREATE INDEX "attendance_records_classId_date_idx" ON "attendance_records"("classId", "date");

CREATE INDEX "attendance_records_studentId_idx" ON "attendance_records"("studentId");

ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
