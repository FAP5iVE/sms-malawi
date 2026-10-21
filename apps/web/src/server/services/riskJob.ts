/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/server/services/riskJob.ts — Phase D7
 * [R-PHASE]: R5 — Academics I: Admissions & Student Records; further
 *   edited in R8 — Academics IV: Report Cards, Transcripts, Promotion &
 *   Risk Assessment
 * [PURPOSE]: R5's PURPOSE (persisted Student.riskLevel column removal) is
 *   unchanged — see below. R8 corrects this file's own header
 *   documentation to reference the real cron route
 *   (apps/web/src/app/api/cron/risk-detection/route.ts) this same phase
 *   adds — matching what vercel.json already schedules — instead of
 *   describing this job as having no live scheduler entry point at all.
 *   No change to runRiskAssessmentJob()'s internal logic beyond what its
 *   call into the now-fixed riskService.ts (same phase) naturally
 *   resolves.
 *
 * [R5 PURPOSE, retained]: Consequential fix, not itself an R5 change-list
 *   item: R5 removes the persisted, never-actually-written
 *   `Student.riskLevel` column (schema.prisma) as a confirmed
 *   data-integrity trap. This job's `prisma.student.update({ data: {
 *   riskLevel } })` call was the only write path that ever referenced
 *   that column, and would now fail to typecheck against the regenerated
 *   Prisma client — leaving it in place would reintroduce exactly the
 *   class of build-breaking TypeScript error CONSTRAINTS.md treats as
 *   maximum severity. The function still computes and logs each student's
 *   risk level (useful for the job's own audit trail), it just no longer
 *   persists to a column that no longer exists. Wiring a real persistence
 *   path back in — e.g. a dedicated `RiskAssessment` table — remains out
 *   of scope.
 *
 * [CHANGE TYPE]: TARGETED EDIT [ALGOLIA ROLLOUT — Tier 1 item 3]
 *   R5's "persistence path back in remains out of scope" note above no
 *   longer applies. Persisting weekly-computed riskLevel back to Postgres
 *   was the wrong call (see R5's own reasoning — nothing kept a column in
 *   sync, hence removing it), but that reasoning doesn't apply to Algolia:
 *   this job already recomputes riskLevel for every active student every
 *   Monday regardless of whether anything reads it, so pushing that same
 *   value into the students index via partialUpdateObject is free
 *   (already-computed data, one more await per student in the same batch)
 *   and turns riskLevel into a genuinely useful instant facet
 *   ("show me all HIGH-risk students") without recreating the Postgres
 *   integrity trap R5 removed — Algolia is explicitly a cache/derived-data
 *   store here, not a system of record, so a value that's "correct as of
 *   last Monday" is the expected shape, not a bug.
 *
 * Weekly cron job that computes risk levels for all active students.
 *
 * Triggered by:
 *   - GET /api/cron/risk-detection (this same phase), matching
 *     vercel.json's existing schedule entry ("0 2 * * 1" — every Monday
 *     02:00 UTC)
 *   - Manually from admin settings panel
 */

import 'server-only'
import { prisma }            from '@/lib/prisma'
import { logger }            from '@/lib/logger'
import { assessStudents, invalidateRiskOverview } from '@/server/services/riskService'
import * as algolia          from '@/server/services/algoliaService'

/** Students assessed per batch — riskService runs ~7 queries per batch, not per student. */
const BATCH_SIZE = 200

/**
 * Re-assess every ACTIVE student with the unified risk engine (fees + results +
 * attendance + library) and push level + score to Algolia. Uses the same
 * assessStudents() as the Students list, profile and class roster, so the weekly
 * Algolia facet can never disagree with what staff see on screen.
 *
 * [CHANGE TYPE]: batched — previously 10 students at a time, each running its
 * own set of queries; now one batched assessment per BATCH_SIZE students.
 */
export async function runRiskAssessmentJob(
  academicTerm: number,
  academicYear: string,
): Promise<{ processed: number; errors: number }> {
  const students = await prisma.student.findMany({
    where:  { status: 'ACTIVE' },
    select: { id: true },
  })

  let processed = 0
  let errors    = 0

  for (let i = 0; i < students.length; i += BATCH_SIZE) {
    const batch = students.slice(i, i + BATCH_SIZE)
    try {
      const assessed = await assessStudents(batch.map((s) => s.id), { academicYear, term: academicTerm })
      await Promise.allSettled(
        batch.map(async (s) => {
          const a = assessed.get(s.id)
          if (!a) { errors++; return }
          logger.info({
            event: 'risk-job.student-assessed',
            studentId: s.id, riskLevel: a.riskLevel, riskScore: a.riskScore, domains: a.domains,
          })
          // Algolia is a derived-data cache here, not a system of record (see
          // header): fire-and-forget, a failed push only leaves one student's
          // facet stale until the next run.
          void algolia.updateStudent({ objectID: s.id, riskLevel: a.riskLevel, riskScore: a.riskScore })
          processed++
        }),
      )
    } catch (err) {
      logger.error({ event: 'risk-job.batch-error', offset: i, size: batch.length, err })
      errors += batch.length
    }
  }

  // Dashboards read a short-lived aggregate; drop it so they reflect this run.
  invalidateRiskOverview()

  logger.info(
    { event: 'risk-job.complete', processed, errors, academicTerm, academicYear },
    'Risk assessment job complete',
  )

  return { processed, errors }
}
