import { describe, it, expect } from 'vitest'
import {
  budgetPosition,
  openLineValue,
  openPoCommitment,
  payrollForTerm,
  payrollOutsideTerms,
  reconcilePayments,
  summariseInvoices,
} from '../financeLogic'

describe('summariseInvoices', () => {
  it('computes billed / collected / outstanding / rate for a scope', () => {
    const s = summariseInvoices([
      { totalAmount: 100_000, paidAmount: 100_000, balance: 0 },
      { totalAmount: 100_000, paidAmount: 40_000, balance: 60_000 },
      { totalAmount: 50_000, paidAmount: 0, balance: 50_000 },
    ])
    expect(s).toEqual({
      invoices: 3,
      billed: 250_000,
      collected: 140_000,
      outstanding: 110_000,
      collectionRate: 56,
      drift: 0,
    })
  })

  it('returns a null rate — not 0% — when nothing was billed', () => {
    const s = summariseInvoices([])
    expect(s.invoices).toBe(0)
    expect(s.collectionRate).toBeNull()
    expect(s.billed).toBe(0)
  })

  it('a genuine 0% collection is 0, distinct from no data', () => {
    const s = summariseInvoices([{ totalAmount: 80_000, paidAmount: 0, balance: 80_000 }])
    expect(s.collectionRate).toBe(0)
  })

  it('flags drift when balances no longer equal billed − collected', () => {
    const s = summariseInvoices([{ totalAmount: 100_000, paidAmount: 40_000, balance: 50_000 }])
    expect(s.drift).toBe(10_000)
  })

  it('never lets a negative balance reduce outstanding', () => {
    const s = summariseInvoices([
      { totalAmount: 100, paidAmount: 100, balance: -20 },
      { totalAmount: 100, paidAmount: 0, balance: 100 },
    ])
    expect(s.outstanding).toBe(100)
  })

  it('ignores non-finite values instead of poisoning the totals', () => {
    const s = summariseInvoices([{ totalAmount: Number.NaN, paidAmount: 10, balance: 5 }])
    expect(s.billed).toBe(0)
    expect(s.collected).toBe(10)
  })
})

describe('reconcilePayments (received = applied + held as credit)', () => {
  it('splits an overpayment into applied and credit', () => {
    const r = reconcilePayments([30_000, 25_000], 50_000)
    expect(r).toEqual({ received: 55_000, appliedToInvoices: 50_000, heldAsCredit: 5_000, appliedExceedsReceived: false })
  })

  it('has no credit when everything received was applied', () => {
    expect(reconcilePayments([10, 20], 30).heldAsCredit).toBe(0)
  })

  it('flags applied > received for review rather than reporting negative credit', () => {
    const r = reconcilePayments([10], 30)
    expect(r.heldAsCredit).toBe(0)
    expect(r.appliedExceedsReceived).toBe(true)
  })
})

describe('budgetPosition', () => {
  const budgets = [
    { category: 'UTILITIES', term: 1, allocated: 100_000 },
    { category: 'UTILITIES', term: 2, allocated: 120_000 },
    { category: 'MAINTENANCE', term: null, allocated: 300_000 },
    { category: 'LIBRARY', term: null, allocated: 0 },
  ]
  const expenses = [
    { category: 'UTILITIES', term: 1, amount: 90_000 },
    { category: 'UTILITIES', term: 2, amount: 30_000 },
    { category: 'MAINTENANCE', term: 1, amount: 50_000 },
    { category: 'MAINTENANCE', term: 2, amount: 70_000 },
    { category: 'TRANSPORT', term: 2, amount: 15_000 },
  ]

  it('term view = that term’s budgets + annual budgets; each expense counted once', () => {
    const p = budgetPosition(budgets, expenses, 2)
    const by = Object.fromEntries(p.rows.map((r) => [r.category, r]))
    // Utilities: only term-2 budget and term-2 spend (no annual budget absorbs term 1).
    expect(by.UTILITIES).toMatchObject({ allocated: 120_000, spent: 30_000, utilisation: 25 })
    // Maintenance: annual budget absorbs year-to-date spend (term 1 + term 2).
    expect(by.MAINTENANCE).toMatchObject({ allocated: 300_000, spent: 120_000, utilisation: 40 })
    expect(p.allocated).toBe(420_000)
    expect(p.spent).toBe(150_000)
    expect(p.utilisation).toBeCloseTo(35.7, 1)
  })

  it('reports unbudgeted spend separately and never nets it against allocation', () => {
    const p = budgetPosition(budgets, expenses, 2)
    expect(p.unbudgetedSpend).toBe(15_000)
    const t = p.rows.find((r) => r.category === 'TRANSPORT')
    expect(t).toMatchObject({ allocated: 0, spent: 15_000, utilisation: null, unbudgeted: true })
    expect(p.spent).toBe(150_000) // excludes transport
  })

  it('a budget with zero allocation has a null utilisation, not 0% or Infinity', () => {
    const p = budgetPosition(budgets, [{ category: 'LIBRARY', term: 1, amount: 500 }], 1)
    expect(p.rows.find((r) => r.category === 'LIBRARY')?.utilisation).toBeNull()
  })

  it('year view sums every term', () => {
    const p = budgetPosition(budgets, expenses, null)
    expect(p.allocated).toBe(520_000)
    expect(p.spent).toBe(240_000)
  })

  it('no budgets → null utilisation', () => {
    const p = budgetPosition([], expenses, 1)
    expect(p.utilisation).toBeNull()
    expect(p.allocated).toBe(0)
  })

  it('does not double count when a category has several budgets (the cached-spent bug)', () => {
    // Two departments budget MAINTENANCE; one 60,000 expense must count once.
    const p = budgetPosition(
      [
        { category: 'MAINTENANCE', term: 1, allocated: 100_000 },
        { category: 'MAINTENANCE', term: 1, allocated: 100_000 },
      ],
      [{ category: 'MAINTENANCE', term: 1, amount: 60_000 }],
      1,
    )
    expect(p.spent).toBe(60_000)
    expect(p.allocated).toBe(200_000)
    expect(p.utilisation).toBe(30)
  })
})

describe('open purchase-order commitments', () => {
  it('prices only the undelivered quantity of a partially received order', () => {
    // 10 units, 6 received → 4 open of a 100,000 line = 40,000.
    expect(openLineValue({ quantityOrdered: 10, quantityReceived: 6, quantityCancelled: 0, lineTotal: 100_000 })).toBe(40_000)
  })

  it('excludes cancelled quantity and never goes negative on over-receipt', () => {
    expect(openLineValue({ quantityOrdered: 10, quantityReceived: 2, quantityCancelled: 8, lineTotal: 100_000 })).toBe(0)
    expect(openLineValue({ quantityOrdered: 10, quantityReceived: 12, quantityCancelled: 0, lineTotal: 100_000 })).toBe(0)
  })

  it('handles a zero-quantity line safely', () => {
    expect(openLineValue({ quantityOrdered: 0, quantityReceived: 0, quantityCancelled: 0, lineTotal: 500 })).toBe(0)
  })

  it('counts only open statuses with undelivered value', () => {
    const line = (o: number, r: number, total: number) => ({ quantityOrdered: o, quantityReceived: r, quantityCancelled: 0, lineTotal: total })
    const c = openPoCommitment([
      { status: 'APPROVED', lines: [line(10, 0, 100_000)] }, // 100,000
      { status: 'PARTIALLY_RECEIVED', lines: [line(10, 6, 100_000)] }, // 40,000
      { status: 'SENT', lines: [line(5, 5, 50_000)] }, // fully delivered → no value, not counted
      { status: 'FULLY_RECEIVED', lines: [line(5, 5, 50_000)] }, // closed
      { status: 'CANCELLED', lines: [line(5, 0, 50_000)] },
      { status: 'DRAFT', lines: [line(5, 0, 50_000)] },
      { status: 'PENDING_APPROVAL', lines: [line(5, 0, 50_000)] },
    ])
    expect(c).toEqual({ orders: 2, value: 140_000 })
  })
})

describe('payroll by term', () => {
  const runs = [
    { month: 9, year: 2025, totalNet: 10 },
    { month: 12, year: 2025, totalNet: 20 },
    { month: 1, year: 2026, totalNet: 30 },
    { month: 4, year: 2026, totalNet: 40 },
    { month: 5, year: 2026, totalNet: 50 },
    { month: 7, year: 2026, totalNet: 60 },
    { month: 8, year: 2026, totalNet: 70 }, // August: no term
    { month: 9, year: 2026, totalNet: 999 }, // next academic year
  ]

  it('assigns each month to its term in the right calendar year', () => {
    expect(payrollForTerm(runs, '2025/2026', 1)).toBe(30)
    expect(payrollForTerm(runs, '2025/2026', 2)).toBe(70)
    expect(payrollForTerm(runs, '2025/2026', 3)).toBe(110)
  })

  it('does not drop August payroll silently — it is reported as outside every term', () => {
    expect(payrollOutsideTerms(runs, '2025/2026')).toBe(70)
    const termTotal = [1, 2, 3].reduce((s, t) => s + payrollForTerm(runs, '2025/2026', t), 0)
    expect(termTotal + payrollOutsideTerms(runs, '2025/2026')).toBe(10 + 20 + 30 + 40 + 50 + 60 + 70)
  })

  it('returns 0 for a malformed academic year', () => {
    expect(payrollForTerm(runs, 'bad', 1)).toBe(0)
  })
})
