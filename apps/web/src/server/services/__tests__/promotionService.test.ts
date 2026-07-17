/**
 * promotionService.test.ts
 * [CHANGE TYPE]: TARGETED EDIT (R19 — unit-test suite repair).
 *
 * The nonexistent `previewPromotion` is replaced by the real `runPromotion`
 * (whose third boolean parameter already covers preview mode). The
 * `class.findFirst` / `$transaction` mocks — relevant only to the separate
 * `commitPromotion` export this file does not test — are removed and replaced
 * with the models `runPromotion` actually reads.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    systemSettings: { findUnique: vi.fn() },
    student:        { findMany: vi.fn() },
    class:          { findMany: vi.fn() },
    termResult:     { findFirst: vi.fn() },
    manebRecord:    { findFirst: vi.fn() },
    promotionRun:   { upsert: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import * as svc from '../promotionService'

const mp = prisma as unknown as {
  systemSettings: { findUnique: ReturnType<typeof vi.fn> }
  student:        { findMany: ReturnType<typeof vi.fn> }
  class:          { findMany: ReturnType<typeof vi.fn> }
  termResult:     { findFirst: ReturnType<typeof vi.fn> }
  manebRecord:    { findFirst: ReturnType<typeof vi.fn> }
  promotionRun:   { upsert: ReturnType<typeof vi.fn> }
}

describe('promotionService.runPromotion (preview mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Thresholds fall back to SETTING_META defaults when no row exists.
    mp.systemSettings.findUnique.mockResolvedValue(null)
    mp.student.findMany.mockResolvedValue([
      {
        id: 'stu-1', registrationNo: 'SMS-2025-0001',
        firstName: 'Alice', lastName: 'Banda', status: 'ACTIVE', classId: 'cls-1',
        class: { id: 'cls-1', name: 'Form 1A', form: 1 },
      },
    ])
    mp.class.findMany.mockResolvedValue([
      { id: 'cls-1', name: 'Form 1A', form: 1 },
      { id: 'cls-2', name: 'Form 2A', form: 2 },
    ])
    mp.termResult.findFirst.mockResolvedValue(null)
    mp.manebRecord.findFirst.mockResolvedValue(null)
    mp.promotionRun.upsert.mockResolvedValue({ id: 'run-1', academicYear: '2025/2026' })
  })

  it('produces a preview snapshot for the academic year', async () => {
    const preview = await svc.runPromotion('2025/2026', 'actor-uid', true)
    expect(preview).toBeDefined()
    expect(preview.academicYear).toBe('2025/2026')
    expect(preview.totalStudents).toBe(1)
    expect(Array.isArray(preview.students)).toBe(true)
  })

  it('persists the preview via a PromotionRun upsert', async () => {
    await svc.runPromotion('2025/2026', 'actor-uid', true)
    expect(mp.promotionRun.upsert).toHaveBeenCalledOnce()
  })
})
