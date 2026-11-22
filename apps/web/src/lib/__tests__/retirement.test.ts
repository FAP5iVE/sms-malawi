/**
 * retirement.test.ts
 * Pure-logic tests for packages/shared/utils/retirement.ts: the retirement date
 * (date of birth + the school's retirement age) and the retired / retiring-soon
 * status shown on staff profiles and counted in the HR attention list. No
 * database, no framework; fixed "now" values so the boundaries are exact.
 */
import { describe, it, expect } from 'vitest'
import { computeRetirementDate, getRetirementInfo } from '@shared/utils/retirement'

const ymd = (d: Date) => d.toISOString().slice(0, 10)
const NOW = new Date(Date.UTC(2026, 10, 3)) // 3 November 2026

describe('computeRetirementDate', () => {
  it('is the birthday at retirement age', () => {
    expect(ymd(computeRetirementDate('1970-03-14', 60))).toBe('2030-03-14')
  })

  it('accepts a Date as well as a YYYY-MM-DD string', () => {
    expect(ymd(computeRetirementDate(new Date(Date.UTC(1970, 2, 14)), 60))).toBe('2030-03-14')
  })

  it('keeps 29 February in a leap year and falls back to 28 February otherwise', () => {
    expect(ymd(computeRetirementDate('1964-02-29', 60))).toBe('2024-02-29')
    expect(ymd(computeRetirementDate('1968-02-29', 61))).toBe('2029-02-28')
  })

  it('uses the retirement age it is given (the policy is a setting, not a constant)', () => {
    expect(ymd(computeRetirementDate('1985-05-20', 55))).toBe('2040-05-20')
    expect(ymd(computeRetirementDate('1985-05-20', 65))).toBe('2050-05-20')
  })
})

describe('getRetirementInfo status', () => {
  it('is RETIRED on the retirement day itself', () => {
    const info = getRetirementInfo('1966-11-03', 60, NOW)
    expect(info.retirementDate).toBe('2026-11-03')
    expect(info.status).toBe('RETIRED')
    expect(info.monthsRemaining).toBe(0)
  })

  it('is RETIRED for anyone already past retirement age', () => {
    expect(getRetirementInfo('1950-01-01', 60, NOW).status).toBe('RETIRED')
  })

  it('is DUE_WITHIN_YEAR the day before retirement, with 0 whole months left', () => {
    const info = getRetirementInfo('1966-11-04', 60, NOW)
    expect(info.status).toBe('DUE_WITHIN_YEAR')
    expect(info.monthsRemaining).toBe(0)
  })

  it('counts whole months remaining', () => {
    const info = getRetirementInfo('1967-06-15', 60, NOW)
    expect(info.retirementDate).toBe('2027-06-15')
    expect(info.monthsRemaining).toBe(7)
  })

  it('treats exactly one year away as still within the year', () => {
    expect(getRetirementInfo('1967-11-03', 60, NOW).status).toBe('DUE_WITHIN_YEAR')
  })

  it('treats one year and a day away as OK (a calendar cutoff, not a months count)', () => {
    expect(getRetirementInfo('1967-11-04', 60, NOW).status).toBe('OK')
  })

  it('does not depend on the machine timezone', () => {
    const original = process.env.TZ
    process.env.TZ = 'Pacific/Kiritimati'
    try {
      expect(ymd(computeRetirementDate('1970-03-14', 60))).toBe('2030-03-14')
    } finally {
      if (original === undefined) delete process.env.TZ
      else process.env.TZ = original
    }
  })
})
