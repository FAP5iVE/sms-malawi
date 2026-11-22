import { describe, it, expect } from 'vitest'
import {
  ratioPct,
  mean,
  median,
  stdDev,
  statusFor,
  compare,
  kpi,
  thresholdKpi,
  daysBetween,
  previousPeriod,
  round,
} from '../kpi'
import {
  collectionInsight,
  agingInsight,
  attendanceInsight,
  markCompletionInsight,
  overdueInsight,
  compact,
  sortInsights,
} from '../insights'

describe('kpi helpers', () => {
  it('ratioPct returns null (not 0) when the denominator is empty', () => {
    expect(ratioPct(0, 0)).toBeNull()
    expect(ratioPct(5, 0)).toBeNull()
    expect(ratioPct(0, 10)).toBe(0)
    expect(ratioPct(1, 3)).toBe(33.3)
  })

  it('mean/median/stdDev handle empty input', () => {
    expect(mean([])).toBeNull()
    expect(median([])).toBeNull()
    expect(stdDev([1])).toBeNull()
    expect(mean([50, 60])).toBe(55)
    expect(median([1, 3, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2)
  })

  it('statusFor honours direction of "better"', () => {
    expect(statusFor('passRate', 80)).toBe('healthy')
    expect(statusFor('passRate', 60)).toBe('watch')
    expect(statusFor('passRate', 40)).toBe('critical')
    expect(statusFor('loginFailureRate', 1)).toBe('healthy')
    expect(statusFor('loginFailureRate', 6)).toBe('watch')
    expect(statusFor('loginFailureRate', 20)).toBe('critical')
    expect(statusFor('passRate', null)).toBe('neutral')
  })

  it('compare skips unavailable sides and computes direction', () => {
    expect(compare(null, 5, 'x')).toBeUndefined()
    expect(compare(5, null, 'x')).toBeUndefined()
    expect(compare(70, 65, 'vs prev')).toMatchObject({ delta: 5, direction: 'up' })
    expect(compare(60, 65, 'vs prev', 'down-good')).toMatchObject({ delta: -5, direction: 'down', polarity: 'down-good' })
    expect(compare(65, 65, 'vs prev')?.direction).toBe('flat')
  })

  it('kpi/thresholdKpi build consistent shapes', () => {
    const k = kpi({ key: 'a', label: 'A', value: null, unit: 'percent', description: 'd' })
    expect(k.status).toBe('neutral')
    expect(k).not.toHaveProperty('comparison')
    const t = thresholdKpi('collectionRate', { key: 'c', label: 'C', value: 50, unit: 'percent', description: 'd' })
    expect(t.status).toBe('critical')
  })

  it('daysBetween ignores time-of-day', () => {
    expect(daysBetween(new Date('2026-01-01T23:59:00Z'), new Date('2026-01-02T00:01:00Z'))).toBe(1)
    expect(daysBetween(new Date('2026-01-10T00:00:00Z'), new Date('2026-01-01T12:00:00Z'))).toBe(-9)
  })

  it('previousPeriod rolls back across the year boundary', () => {
    expect(previousPeriod('2025/2026', 2)).toEqual({ academicYear: '2025/2026', term: 1 })
    expect(previousPeriod('2025/2026', 1)).toEqual({ academicYear: '2024/2025', term: 3 })
  })

  it('round', () => {
    expect(round(1.2345, 2)).toBe(1.23)
  })
})

describe('insights', () => {
  it('collectionInsight severity follows thresholds', () => {
    expect(collectionInsight(null, 0)).toBeNull()
    expect(collectionInsight(50, 1000)?.severity).toBe('critical')
    expect(collectionInsight(75, 1000)?.severity).toBe('watch')
    expect(collectionInsight(90, 0)?.severity).toBe('positive')
  })

  it('agingInsight is silent with nothing severe', () => {
    expect(agingInsight(null, 0)).toBeNull()
    expect(agingInsight(0, 0)).toBeNull()
    expect(agingInsight(45, 900)?.severity).toBe('critical')
  })

  it('attendanceInsight flags low classes even when overall rate is fine', () => {
    expect(attendanceInsight(95, 0)).toBeNull()
    expect(attendanceInsight(95, 2)?.severity).toBe('watch')
    expect(attendanceInsight(80, 1)?.severity).toBe('critical')
  })

  it('markCompletionInsight only fires with missing marks', () => {
    expect(markCompletionInsight(100, 0)).toBeNull()
    expect(markCompletionInsight(60, 40)?.severity).toBe('critical')
  })

  it('overdueInsight escalates at 10', () => {
    expect(overdueInsight(0, 'book')).toBeNull()
    expect(overdueInsight(3, 'book')?.severity).toBe('watch')
    expect(overdueInsight(12, 'book')?.severity).toBe('critical')
  })

  it('compact drops falsy entries and sorts by severity', () => {
    const out = compact([null, collectionInsight(90, 0), overdueInsight(12, 'book'), false])
    expect(out.map((i) => i.severity)).toEqual(['critical', 'positive'])
    expect(sortInsights([{ severity: 'info' as const }, { severity: 'critical' as const }])[0]?.severity).toBe('critical')
  })
})
