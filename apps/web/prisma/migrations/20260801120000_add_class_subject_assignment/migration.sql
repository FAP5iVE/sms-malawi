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

-- CreateIndex
CREATE INDEX "class_subject_assignments_teacherUid_academicYear_idx" ON "class_subject_assignments"("teacherUid", "academicYear");

-- CreateIndex
CREATE INDEX "class_subject_assignments_classId_academicYear_idx" ON "class_subject_assignments"("classId", "academicYear");

-- CreateIndex
CREATE UNIQUE INDEX "class_subject_assignments_classId_subject_academicYear_key" ON "class_subject_assignments"("classId", "subject", "academicYear");

-- AddForeignKey
ALTER TABLE "class_subject_assignments" ADD CONSTRAINT "class_subject_assignments_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

