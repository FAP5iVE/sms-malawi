/**
 * forecastService.test.ts
 * [CHANGE TYPE]: MAJOR REWRITE (R19 — unit-test suite repair).
 *
 * The nonexistent `generateForecast` (and its asserted
 * projectedRevenue/projectedExpenses/projectedNet shape) is replaced by the
 * real `getCashFlowForecast`, whose ForecastReport exposes feeRevenue /
 * expenses / netCashFlow time-series plus totalActualRev / totalForecastRev /
 * totalActualExp / totalForecastExp aggregates. Assertions target that real
 * shape.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    payment:      { findMany: vi.fn() },
    feeStructure: { findMany: vi.fn() },
    student:      { groupBy: vi.fn() },
    expense:      { findMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import * as forecast from '../forecastService'

const mp = prisma as unknown as {
  payment:      { findMany: ReturnType<typeof vi.fn> }
  feeStructure: { findMany: ReturnType<typeof vi.fn> }
  student:      { groupBy: ReturnType<typeof vi.fn> }
  expense:      { findMany: ReturnType<typeof vi.fn> }
}

describe('forecastService.getCashFlowForecast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mp.payment.findMany.mockResolvedValue([])
    mp.feeStructure.findMany.mockResolvedValue([])
    mp.student.groupBy.mockResolvedValue([])
    mp.expense.findMany.mockResolvedValue([])
  })

  it('returns a ForecastReport with the real time-series and aggregate fields', async () => {
    const report = await forecast.getCashFlowForecast('2025/2026')
    expect(report.academicYear).toBe('2025/2026')
    expect(Array.isArray(report.feeRevenue)).toBe(true)
    expect(Array.isArray(report.expenses)).toBe(true)
    expect(Array.isArray(report.netCashFlow)).toBe(true)
    expect(typeof report.totalActualRev).toBe('number')
    expect(typeof report.totalForecastRev).toBe('number')
    expect(typeof report.totalActualExp).toBe('number')
    expect(typeof report.totalForecastExp).toBe('number')
  })

  it('aligns the netCashFlow series length with the revenue series', async () => {
    const report = await forecast.getCashFlowForecast('2025/2026', 3)
    expect(report.netCashFlow).toHaveLength(report.feeRevenue.length)
  })
})
