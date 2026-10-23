import { describe, expect, it } from 'vitest'

import {
  categoryAxisLayout,
  formatChartValue,
  formatChartValueFull,
  inferValueFormat,
  truncateLabel,
  valueFormatter,
} from '../chartLabels'

describe('inferValueFormat', () => {
  it('reads a percentage from a "%" in the series label', () => {
    expect(inferValueFormat('Attendance %')).toBe('percent')
    expect(inferValueFormat('Pass rate %')).toBe('percent')
  })

  it('reads money from "MWK" in the series label', () => {
    expect(inferValueFormat('Collected (MWK)')).toBe('mwk')
    expect(inferValueFormat('MWK')).toBe('mwk')
  })

  it('defaults to a plain count', () => {
    expect(inferValueFormat('Students')).toBe('number')
    expect(inferValueFormat(undefined)).toBe('number')
  })

  it('lets an explicit format win over the label', () => {
    expect(inferValueFormat('Revenue', 'mwk')).toBe('mwk')
    expect(inferValueFormat('Attendance %', 'number')).toBe('number')
  })
})

describe('formatChartValue (on-chart text)', () => {
  it('writes counts compactly but exactly when small', () => {
    expect(formatChartValue(42)).toBe('42')
    expect(formatChartValue(7.5)).toBe('7.5')
    expect(formatChartValue(1250)).toBe('1,250')
    expect(formatChartValue(15000)).toBe('15K')
    expect(formatChartValue(2_400_000)).toBe('2.4M')
  })

  it('writes percentages with a % sign', () => {
    expect(formatChartValue(87.25, 'percent')).toBe('87.3%')
    expect(formatChartValue(100, 'percent')).toBe('100%')
  })

  it('writes money as MWK, compacted', () => {
    expect(formatChartValue(250_000, 'mwk')).toBe('MWK 250K')
    expect(formatChartValue(1_200_000, 'mwk')).toBe('MWK 1.2M')
  })

  it('writes nothing for a missing value rather than "NaN" or "0"', () => {
    expect(formatChartValue(undefined)).toBe('')
    expect(formatChartValue(null)).toBe('')
    expect(formatChartValue('')).toBe('')
    expect(formatChartValue('abc')).toBe('')
  })

  it('keeps zero as a real value', () => {
    expect(formatChartValue(0)).toBe('0')
  })
})

describe('formatChartValueFull (key / tooltip text)', () => {
  it('keeps full precision', () => {
    expect(formatChartValueFull(1_234_567, 'mwk')).toBe('MWK 1,234,567')
    expect(formatChartValueFull(1250)).toBe('1,250')
    expect(formatChartValueFull(55.5, 'percent')).toBe('55.5%')
  })
})

describe('valueFormatter', () => {
  it('returns a formatter bound to the chosen format', () => {
    expect(valueFormatter('percent')(50)).toBe('50%')
    expect(valueFormatter('mwk')(300_000)).toBe('MWK 300K')
  })
})

describe('truncateLabel', () => {
  it('leaves short names alone and ellipsises long ones', () => {
    expect(truncateLabel('Form 1A')).toBe('Form 1A')
    expect(truncateLabel('Mathematics and Statistics', 10)).toBe('Mathemati…')
    expect(truncateLabel('Mathematics and Statistics', 10)).toHaveLength(10)
  })
})

describe('categoryAxisLayout', () => {
  it('never skips a category name', () => {
    expect(categoryAxisLayout(['A', 'B']).interval).toBe(0)
    expect(categoryAxisLayout(Array.from({ length: 20 }, (_, i) => `C${i}`)).interval).toBe(0)
  })

  it('keeps few short names flat and tilts many or long ones', () => {
    expect(categoryAxisLayout(['Q1', 'Q2', 'Q3']).angle).toBe(0)
    expect(categoryAxisLayout(Array.from({ length: 8 }, (_, i) => `C${i}`)).angle).toBe(-35)
    expect(categoryAxisLayout(['Mathematics']).angle).toBe(-35)
  })
})
