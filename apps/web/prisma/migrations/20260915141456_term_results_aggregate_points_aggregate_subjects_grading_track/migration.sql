-- AlterTable
ALTER TABLE "term_results" ADD COLUMN     "aggregatePoints" INTEGER,
ADD COLUMN     "aggregateSubjects" JSONB,
ADD COLUMN     "gradingTrack" TEXT;
