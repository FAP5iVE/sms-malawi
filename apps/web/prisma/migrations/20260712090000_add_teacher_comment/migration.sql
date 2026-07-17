-- [CHANGE TYPE]: NEW FILE (migration)
-- [R-PHASE]: R8 — Academics IV: Report Cards, Transcripts, Promotion & Risk
--   Assessment
-- [PURPOSE]: Creates the minimal "teacher_comments" table.
--   reportCardService.ts's getReportCardData() previously queried
--   prisma.teacherComment.findFirst(...) with no TeacherComment model
--   behind it at all — every generated report card has shipped with no
--   teacher/head-teacher comment since this feature's inception. This
--   migration adds just enough shape to carry a real comment.
-- [DEPENDS ON]: apps/web/prisma/schema.prisma (TeacherComment model added
--   in the same change)

CREATE TABLE "teacher_comments" (
    "id" TEXT NOT NULL,
    "termResultId" TEXT NOT NULL,
    "authorUid" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_comments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "teacher_comments_termResultId_idx" ON "teacher_comments"("termResultId");

ALTER TABLE "teacher_comments" ADD CONSTRAINT "teacher_comments_termResultId_fkey" FOREIGN KEY ("termResultId") REFERENCES "term_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
