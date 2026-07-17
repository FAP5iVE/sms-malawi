/**
 * riskService.test.ts
 * [CHANGE TYPE]: TARGETED EDIT (R19 — unit-test suite repair).
 *
 * The nonexistent `detectAtRiskStudents` export is replaced by the real
 * exports `assessStudentRisk` / `assessClassRisk` / `getSchoolRiskSummary`.
 * Each risk factor in assessStudentRisk degrades gracefully (try/catch), so a
 * student with no fee debt, no term result and no released marks yields an
 * empty factor set and zeroed metrics.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    gradingScale: { findMany: vi.fn() },
    studentFee:   { aggregate: vi.fn() },
    termResult:   { findFirst: vi.fn() },
    examMark:     { findMany: vi.fn() },
    student:      { findMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { DEFAULT_GRADING_SCALES } from '../gradeService'
import * as risk from '../riskService'

const mp = prisma as unknown as {
  gradingScale: { findMany: ReturnType<typeof vi.fn> }
  studentFee:   { aggregate: ReturnType<typeof vi.fn> }
  termResult:   { findFirst: ReturnType<typeof vi.fn> }
  examMark:     { findMany: ReturnType<typeof vi.fn> }
  student:      { findMany: ReturnType<typeof vi.fn> }
}

const VALID_LEVELS = ['HIGH', 'MEDIUM', 'LOW', 'NONE']

describe('riskService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mp.gradingScale.findMany.mockResolvedValue(DEFAULT_GRADING_SCALES)
    mp.studentFee.aggregate.mockResolvedValue({ _sum: { amount: 0, paid: 0 } })
    mp.termResult.findFirst.mockResolvedValue(null)
    mp.examMark.findMany.mockResolvedValue([])
  })

  describe('assessStudentRisk', () => {
    it('returns a valid assessment with zeroed metrics for a clean student', async () => {
      const assessment = await risk.assessStudentRisk('stu-1', 2, '2025/2026')
      expect(assessment.studentId).toBe('stu-1')
      expect(VALID_LEVELS).toContain(assessment.riskLevel)
      expect(assessment.factors).toHaveLength(0)
      expect(assessment.metrics.feeDebtPct).toBe(0)
      expect(assessment.metrics.subjectFails).toBe(0)
    })
  })

  describe('getSchoolRiskSummary', () => {
    it('counts every active student across the risk buckets', async () => {
      mp.student.findMany.mockResolvedValue([{ id: 'stu-1' }, { id: 'stu-2' }])
      const summary = await risk.getSchoolRiskSummary(2, '2025/2026')
      expect(summary.total).toBe(2)
      expect(summary.HIGH + summary.MEDIUM + summary.LOW + summary.NONE).toBe(2)
    })
  })
})
