/**
 * examService.test.ts
 * [CHANGE TYPE]: TARGETED EDIT (R19 — unit-test suite repair).
 *
 * Grading was unified into gradeService.calcGrade() in R7; examService no
 * longer exposes a private calcGrade. This suite now imports `beforeEach`
 * (previously missing — a ReferenceError at collection time) and exercises the
 * real, exported, async gradeService.calcGrade() against the MSCE 1–9 scale.
 * The hand-written MSCE_SCALES fixture (which incorrectly labelled grade 5 as
 * failing) is replaced by the real DEFAULT_GRADING_SCALES; the prisma mock is
 * retained only because calcGrade loads its scale table via
 * prisma.gradingScale.findMany, and is fed the real default rows.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    gradingScale: { findMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import * as gradeService from '../gradeService'
import { DEFAULT_GRADING_SCALES } from '../gradeService'

const mockPrisma = prisma as unknown as {
  gradingScale: { findMany: ReturnType<typeof vi.fn> }
}

describe('gradeService.calcGrade (MSCE 1–9 scale)', () => {
  beforeEach(() => {
    gradeService.invalidateGradeCache()
    mockPrisma.gradingScale.findMany.mockResolvedValue(DEFAULT_GRADING_SCALES)
  })

  it('returns grade 1 for a percentage of 85', async () => {
    const result = await gradeService.calcGrade(85, 'MANEB_MSCE')
    expect(result.grade).toBe('1')
    expect(result.pass).toBe(true)
  })

  it('returns grade 4 for a percentage of 54 (50–59 band)', async () => {
    const result = await gradeService.calcGrade(54, 'MANEB_MSCE')
    expect(result.grade).toBe('4')
    expect(result.pass).toBe(true)
  })

  it('returns grade 9 (fail) for a percentage of 5', async () => {
    const result = await gradeService.calcGrade(5, 'MANEB_MSCE')
    expect(result.grade).toBe('9')
    expect(result.pass).toBe(false)
  })

  it('grades the 80% boundary as grade 1', async () => {
    const result = await gradeService.calcGrade(80, 'MANEB_MSCE')
    expect(result.grade).toBe('1')
    expect(result.pass).toBe(true)
  })

  it('returns grade 9 (fail) for a zero percentage', async () => {
    const result = await gradeService.calcGrade(0, 'MANEB_MSCE')
    expect(result.grade).toBe('9')
    expect(result.pass).toBe(false)
  })
})
