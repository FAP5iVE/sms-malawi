-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "subjectsSetAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "class_subject_presets" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "createdByUid" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_subject_presets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "class_subject_presets_classId_idx" ON "class_subject_presets"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "class_subject_presets_classId_subject_key" ON "class_subject_presets"("classId", "subject");

-- AddForeignKey
ALTER TABLE "class_subject_presets" ADD CONSTRAINT "class_subject_presets_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
