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
import { assessStudentRisk } from '@/server/services/riskService'

const CONCURRENT_LIMIT = 10

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

  for (let i = 0; i < students.length; i += CONCURRENT_LIMIT) {
    const chunk = students.slice(i, i + CONCURRENT_LIMIT)
    await Promise.allSettled(
      chunk.map(async (s) => {
        try {
          const { riskLevel } = await assessStudentRisk(s.id, academicTerm, academicYear)
          logger.info({ event: 'risk-job.student-assessed', studentId: s.id, riskLevel })
          processed++
        } catch (err) {
          logger.error({ event: 'risk-job.student-error', studentId: s.id, err })
          errors++
        }
      }),
    )
  }

  logger.info(
    { event: 'risk-job.complete', processed, errors, academicTerm, academicYear },
    'Risk assessment job complete',
  )

  return { processed, errors }
}