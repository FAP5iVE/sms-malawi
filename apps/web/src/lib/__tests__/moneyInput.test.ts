/**
 * moneyInput.test.ts
 * [CHANGE TYPE]: NEW FILE. Finance Hardening Plan P1-01: the Zod money validator and the schemas
 * that now use it (payment, allocation, expense, library fine, fee structure).
 */
import { describe, it, expect } from 'vitest'
import {
  moneyInput, hasAtMostTwoDecimals, MONEY_MAX,
  RecordPaymentSchema, CreateExpenseSchema, CreateLibraryFineSchema,
} from '@shared/schemas/finance'

describe('hasAtMostTwoDecimals', () => {
  it('matches the number text', () => {
    expect(hasAtMostTwoDecimals(100)).toBe(true)
    expect(hasAtMostTwoDecimals(12.5)).toBe(true)
    expect(hasAtMostTwoDecimals(12.55)).toBe(true)
    expect(hasAtMostTwoDecimals(12.555)).toBe(false)
    expect(hasAtMostTwoDecimals(0.1 + 0.2)).toBe(false)
    expect(hasAtMostTwoDecimals(NaN)).toBe(false)
    expect(hasAtMostTwoDecimals(Infinity)).toBe(false)
    expect(hasAtMostTwoDecimals(1e21)).toBe(false)
  })
})

describe('moneyInput()', () => {
  const amount = moneyInput()
  const msg = (v: unknown) => {
    const r = amount.safeParse(v)
    return r.success ? null : r.error.issues[0]?.message
  }

  it('accepts a positive amount with up to 2 decimal places', () => {
    expect(amount.parse(1)).toBe(1)
    expect(amount.parse(0.01)).toBe(0.01)
    expect(amount.parse(18450000.5)).toBe(18450000.5)
    expect(amount.parse(MONEY_MAX)).toBe(MONEY_MAX)
  })

  it('rejects zero and negatives with the existing wording', () => {
    expect(msg(0)).toBe('Amount must be positive')
    expect(msg(-5)).toBe('Amount must be positive')
  })

  it('rejects more than 2 decimal places, including 0.1 + 0.2', () => {
    expect(msg(100.456)).toBe('Amount cannot have more than 2 decimal places')
    expect(msg(0.1 + 0.2)).toBe('Amount cannot have more than 2 decimal places')
  })

  it('rejects NaN, Infinity, text and null', () => {
    expect(amount.safeParse(NaN).success).toBe(false)
    expect(amount.safeParse(Infinity).success).toBe(false)
    expect(amount.safeParse('100').success).toBe(false)
    expect(amount.safeParse(null).success).toBe(false)
  })

  it('enforces the upper bound', () => {
    expect(msg(MONEY_MAX + 1)).toMatch(/cannot be more than/)
    expect(moneyInput({ max: 500 }).safeParse(500.01).success).toBe(false)
    expect(moneyInput({ max: 500 }).safeParse(500).success).toBe(true)
  })

  it('min, allowZero and label options', () => {
    expect(moneyInput({ allowZero: true }).safeParse(0).success).toBe(true)
    expect(moneyInput({ allowZero: true }).safeParse(-1).success).toBe(false)
    expect(moneyInput({ min: 10 }).safeParse(9.99).success).toBe(false)
    const r = moneyInput({ label: 'Allocation amount' }).safeParse(-1)
    expect(r.success ? '' : r.error.issues[0]?.message).toBe('Allocation amount must be positive')
  })

  it('works with .optional()', () => {
    expect(moneyInput().optional().parse(undefined)).toBeUndefined()
  })
})

describe('schemas that use it', () => {
  const payment = {
    invoiceId: 'inv1', amount: 500, method: 'CASH' as const,
    allocations: [{ lineItemId: 'li1', amount: 500 }],
  }

  it('RecordPaymentSchema accepts a normal payment and keeps its defaults', () => {
    const r = RecordPaymentSchema.parse(payment)
    expect(r.confirmOverpayment).toBe(false)
  })

  it('RecordPaymentSchema rejects a payment or allocation with 3 decimal places', () => {
    expect(RecordPaymentSchema.safeParse({ ...payment, amount: 500.123 }).success).toBe(false)
    expect(
      RecordPaymentSchema.safeParse({ ...payment, allocations: [{ lineItemId: 'li1', amount: 0.1 + 0.2 }] }).success,
    ).toBe(false)
  })

  it('CreateExpenseSchema and CreateLibraryFineSchema reject sub-cent amounts', () => {
    const expense = {
      category: 'UTILITIES' as const, description: 'Power', amount: 10.999,
      academicYear: '2026/2027', term: 1, incurredAt: '2026-11-24',
    }
    expect(CreateExpenseSchema.safeParse(expense).success).toBe(false)
    expect(CreateExpenseSchema.safeParse({ ...expense, amount: 10.99 }).success).toBe(true)

    const fine = { studentId: 's1', bookTitle: 'Book', amount: 100.001, reason: 'Late' }
    expect(CreateLibraryFineSchema.safeParse(fine).success).toBe(false)
    expect(CreateLibraryFineSchema.safeParse({ ...fine, amount: 100 }).success).toBe(true)
  })
})
