/**
 * money.test.ts
 * [CHANGE TYPE]: NEW FILE. Finance Hardening Plan P1-01 (Part 6 §3: "unit tests incl.
 * largest-remainder, half-up, 0.1+0.2").
 */
import { describe, it, expect } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'
import {
  MoneyError, MONEY_MAX, ZERO,
  money, toNumber, round2, add, sub, mul, percentOf, sum, min, max, nonNegative,
  compare, eq, gt, gte, lt, lte, isZero, allocate,
} from '../money'

const s = (x: Decimal) => x.toFixed(2)

describe('money(): the strict gate for outside values', () => {
  it('accepts numbers, strings and Decimals with at most 2 decimal places', () => {
    expect(s(money(100))).toBe('100.00')
    expect(s(money(12.5))).toBe('12.50')
    expect(s(money('1234.56'))).toBe('1234.56')
    expect(s(money(' 7 '))).toBe('7.00')
    expect(s(money(new Decimal('3.1')))).toBe('3.10')
    expect(s(money(-20))).toBe('-20.00')
  })

  it('rejects 0.1 + 0.2 instead of silently rounding it', () => {
    expect(() => money(0.1 + 0.2)).toThrow(MoneyError)
  })

  it('rejects more than 2 decimal places', () => {
    expect(() => money(1.234)).toThrow(/at most 2 decimal places/)
    expect(() => money('1.234')).toThrow(MoneyError)
  })

  it('rejects NaN, Infinity, empty, exponent and non-numeric text', () => {
    expect(() => money(NaN)).toThrow(MoneyError)
    expect(() => money(Infinity)).toThrow(MoneyError)
    expect(() => money('')).toThrow(MoneyError)
    expect(() => money('abc')).toThrow(MoneyError)
    expect(() => money('1e3')).toThrow(MoneyError)
    expect(() => money(1e21)).toThrow(MoneyError)
    expect(() => money(new Decimal(NaN))).toThrow(MoneyError)
  })
})

describe('rounding is half-up at 2 dp', () => {
  it('rounds ties up (1.005 is 1.01; the old float rounding gave 1.00)', () => {
    expect(Math.round(1.005 * 100) / 100).toBe(1) // the defect being removed
    expect(s(round2(2.675))).toBe('2.68')
    expect(s(round2(1.005))).toBe('1.01')
    expect(s(round2(0.125))).toBe('0.13')
  })

  it('rounds below the tie down and keeps exact values unchanged', () => {
    expect(s(round2(2.674))).toBe('2.67')
    expect(s(round2('10.00'))).toBe('10.00')
  })

  it('rounds a tie away from zero for negatives', () => {
    expect(s(round2(-2.675))).toBe('-2.68')
  })

  it('brings the float artefact of 0.1 + 0.2 to exactly 0.30', () => {
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(s(round2(0.1 + 0.2))).toBe('0.30')
  })
})

describe('arithmetic is exact', () => {
  it('adds and subtracts without float error', () => {
    expect(s(add(0.1, 0.2))).toBe('0.30')
    expect(eq(add(0.1, 0.2), 0.3)).toBe(true)
    expect(s(sub(1, 0.9))).toBe('0.10')
    expect(s(sum([0.1, 0.2, 0.3]))).toBe('0.60')
    expect(s(sum([]))).toBe('0.00')
  })

  it('multiplies without rounding and percentOf rounds half-up', () => {
    expect(mul(10.5, 0.15).toString()).toBe('1.575')
    expect(s(round2(mul(10.5, 0.15)))).toBe('1.58')
    expect(s(percentOf(1000, 5))).toBe('50.00')
    expect(s(percentOf(33.33, 10))).toBe('3.33')
    expect(s(percentOf(1234.5, 7.5))).toBe('92.59')
  })

  it('min, max and nonNegative', () => {
    expect(s(min(3, 2.5))).toBe('2.50')
    expect(s(max(3, 2.5))).toBe('3.00')
    expect(s(nonNegative(-5))).toBe('0.00')
    expect(s(nonNegative(5))).toBe('5.00')
    expect(nonNegative(-0.01)).toBe(ZERO)
  })

  it('accepts Prisma Decimals alongside numbers', () => {
    expect(s(add(new Decimal('100.10'), 0.2))).toBe('100.30')
    expect(toNumber(new Decimal('12.34'))).toBe(12.34)
  })

  it('refuses a non-finite operand', () => {
    expect(() => add(NaN, 1)).toThrow(MoneyError)
    expect(() => sum([1, Infinity])).toThrow(MoneyError)
  })
})

describe('comparison has no tolerance', () => {
  it('compares exactly', () => {
    expect(compare(1, 2)).toBe(-1)
    expect(compare(2, 2)).toBe(0)
    expect(compare(3, 2)).toBe(1)
    expect(eq(0.1 + 0.2, 0.3)).toBe(false) // a raw float sum is NOT 0.3 until rounded
    expect(eq(round2(0.1 + 0.2), 0.3)).toBe(true)
    expect(gt(100.01, 100)).toBe(true)
    expect(gte(100, 100)).toBe(true)
    expect(lt(99.99, 100)).toBe(true)
    expect(lte(100, 100)).toBe(true)
    expect(gt(100, 100)).toBe(false)
  })

  it('one cent is a difference', () => {
    expect(eq(100.00, 100.01)).toBe(false)
  })

  it('isZero', () => {
    expect(isZero(0)).toBe(true)
    expect(isZero('0.00')).toBe(true)
    expect(isZero(0.01)).toBe(false)
  })
})

describe('allocate(): largest remainder', () => {
  const parts = (total: number | string, weights: (number | string)[]) =>
    allocate(total, weights).map(s)

  it('splits 100 three ways: 33.34, 33.33, 33.33 (earlier part takes the spare cent)', () => {
    expect(parts(100, [1, 1, 1])).toEqual(['33.34', '33.33', '33.33'])
  })

  it('parts always add up to the total exactly', () => {
    const cases: Array<[number, number[]]> = [
      [100, [1, 1, 1]],
      [0.01, [1, 1, 1]],
      [10, [3, 3, 3]],
      [1234.57, [10, 20, 30, 40]],
      [999.99, [0.1, 0.2, 0.7]],
      [50, [1, 2, 3, 4, 5, 6, 7]],
      [1, [1, 1, 1, 1, 1, 1, 1]],
    ]
    for (const [total, w] of cases) {
      expect(s(sum(allocate(total, w)))).toBe(total.toFixed(2))
    }
  })

  it('follows the weights', () => {
    expect(parts(100, [50, 30, 20])).toEqual(['50.00', '30.00', '20.00'])
    expect(parts(10, [1, 2])).toEqual(['3.33', '6.67'])
  })

  it('gives the spare cents to the largest remainders', () => {
    // 10.00 across 1:1:1 = 3.333.. each; one spare cent goes to the first.
    expect(parts(10, [1, 1, 1])).toEqual(['3.34', '3.33', '3.33'])
    // 0.05 across 2:3 = 2.0 and 3.0 cents exactly.
    expect(parts(0.05, [2, 3])).toEqual(['0.02', '0.03'])
    // 0.02 across 1:1:1 -> remainders tie, the first two parts get a cent.
    expect(parts(0.02, [1, 1, 1])).toEqual(['0.01', '0.01', '0.00'])
  })

  it('a zero weight gets nothing', () => {
    expect(parts(10, [0, 1, 1])).toEqual(['0.00', '5.00', '5.00'])
  })

  it('works on a negative total (a reversal)', () => {
    expect(parts(-100, [1, 1, 1])).toEqual(['-33.34', '-33.33', '-33.33'])
  })

  it('a zero total gives zeros', () => {
    expect(parts(0, [1, 2])).toEqual(['0.00', '0.00'])
  })

  it('accepts Decimal weights', () => {
    const out = allocate(new Decimal('90.00'), [new Decimal('1.5'), new Decimal('3.5')])
    expect(out.map(s)).toEqual(['27.00', '63.00'])
  })

  it('rejects bad input', () => {
    expect(() => allocate(100, [])).toThrow(MoneyError)
    expect(() => allocate(100, [0, 0])).toThrow(/every weight is zero/)
    expect(() => allocate(100, [1, -1])).toThrow(/negative/)
    expect(() => allocate(1.234, [1, 1])).toThrow(/2 decimal places/)
  })

  it('is exact on large totals (no precision loss)', () => {
    const total = MONEY_MAX
    const out = allocate(total, [1, 1, 1, 1, 1, 1, 1])
    expect(s(sum(out))).toBe(total.toFixed(2))
  })
})
