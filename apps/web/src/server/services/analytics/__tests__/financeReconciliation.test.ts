/**
 * Finance reconciliation — runs the real finance reporting services against a
 * controlled dataset whose totals were worked out by hand, and checks that the
 * overview, receivables aging, payment mix, budget position and attention
 * queue all agree with those figures and with each other.
 *
 * Scenario: academic year 2025/2026, Term 2 is being viewed.
 *
 *   Term 2 invoices                         total     paid  balance  due
 *     A  student s1  class C1              200,000  200,000        0  120 days ago
 *     B  student s2  class C1              200,000  120,000   80,000  100 days ago  (90+)
 *     C  student s3  class C2              150,000        0  150,000   40 days ago  (31–60)
 *     D  student s4  no class              100,000   50,000   50,000  in 20 days    (current)
 *     E  student s5  class C2 (scholarship) 80,000   80,000        0  60 days ago
 *   billed 730,000 · collected 450,000 · outstanding 280,000 · rate 61.6%
 *   overdue 230,000 (B + C) · over 60 days 80,000 (B) · share 28.6%
 *
 *   Cash received on those invoices: 460,000 = 450,000 applied + 10,000 held as
 *   credit (student s2 overpaid by 10,000).
 */
import { describe, it, expect, vi } from 'vitest'
import { makeFakePrisma } from '../../../../../test/fakePrisma'

const YEAR = '2025/2026'
const day = (offset: number): Date => new Date(Date.now() + offset * 86_400_000)

const student = (id: string, cls: { name: string; form: number } | null) => ({
  id,
  firstName: `First${id}`,
  lastName: `Last${id}`,
  classId: cls ? `class-${cls.name}` : null,
  class: cls,
})

const inv = (
  invoiceNumber: string,
  s: ReturnType<typeof student>,
  term: number,
  total: number,
  paid: number,
  balance: number,
  due: Date,
) => ({
  id: `inv-${invoiceNumber}`,
  invoiceNumber,
  studentId: s.id,
  student: s,
  academicYear: YEAR,
  term,
  totalAmount: total,
  paidAmount: paid,
  balance,
  dueDate: due,
})

const s1 = student('s1', { name: 'C1', form: 1 })
const s2 = student('s2', { name: 'C1', form: 1 })
const s3 = student('s3', { name: 'C2', form: 2 })
const s4 = student('s4', null)
const s5 = student('s5', { name: 'C2', form: 2 })

const invoices = [
  inv('A', s1, 2, 200_000, 200_000, 0, day(-120)),
  inv('B', s2, 2, 200_000, 120_000, 80_000, day(-100)),
  inv('C', s3, 2, 150_000, 0, 150_000, day(-40)),
  inv('D', s4, 2, 100_000, 50_000, 50_000, day(20)),
  inv('E', s5, 2, 80_000, 80_000, 0, day(-60)),
  // Previous term (term 1) — fully collected.
  inv('F', s1, 1, 100_000, 100_000, 0, day(-300)),
]

const pay = (term: number, amount: number, method: string, paidAt: Date) => ({
  amount,
  method,
  paidAt,
  invoice: { academicYear: YEAR, term },
})

const payments = [
  pay(2, 120_000, 'CASH', new Date('2026-01-12T10:00:00')), // Monday
  pay(2, 80_000, 'BANK_TRANSFER', new Date('2026-01-13T10:00:00')), // Tuesday
  pay(2, 130_000, 'AIRTEL_MONEY', new Date('2026-02-02T10:00:00')), // Monday (10,000 over → credit)
  pay(2, 50_000, 'CASH', new Date('2026-02-03T10:00:00')), // Tuesday
  pay(2, 80_000, 'BANK_TRANSFER', new Date('2026-02-04T10:00:00')), // Wednesday
  pay(1, 100_000, 'CASH', new Date('2025-10-06T10:00:00')), // term 1 — out of scope
]

const budgets = [
  { academicYear: YEAR, category: 'UTILITIES', term: 1, allocated: 100_000 },
  { academicYear: YEAR, category: 'UTILITIES', term: 2, allocated: 120_000 },
  { academicYear: YEAR, category: 'MAINTENANCE', term: null, allocated: 300_000 },
]

const exp = (category: string, term: number, amount: number, status: string) => ({
  academicYear: YEAR,
  category,
  term,
  amount,
  status,
})

const expenses = [
  exp('UTILITIES', 1, 90_000, 'APPROVED'),
  exp('UTILITIES', 2, 30_000, 'APPROVED'),
  exp('MAINTENANCE', 1, 50_000, 'APPROVED'),
  exp('MAINTENANCE', 2, 70_000, 'APPROVED'),
  exp('TRANSPORT', 2, 15_000, 'APPROVED'), // no budget → unbudgeted
  exp('MAINTENANCE', 2, 40_000, 'PENDING'),
  exp('UTILITIES', 1, 25_000, 'PENDING'),
]

const line = (ordered: number, received: number, total: number) => ({
  quantityOrdered: ordered,
  quantityReceived: received,
  quantityCancelled: 0,
  lineTotal: total,
})

const purchaseOrders = [
  { status: 'APPROVED', expectedDeliveryDate: day(10), lines: [line(10, 0, 100_000)] }, // 100,000 open
  { status: 'PARTIALLY_RECEIVED', expectedDeliveryDate: day(-5), lines: [line(10, 6, 100_000)] }, // 40,000 open, late
  { status: 'FULLY_RECEIVED', expectedDeliveryDate: day(-20), lines: [line(5, 5, 50_000)] },
  { status: 'PENDING_APPROVAL', expectedDeliveryDate: null, lines: [line(5, 0, 50_000)] },
]

const installments = [
  { status: 'OVERDUE', dueDate: day(-10) },
  { status: 'PENDING', dueDate: day(-3) },
  { status: 'PENDING', dueDate: day(15) },
  { status: 'PAID', dueDate: day(-30) },
]

vi.mock('@/lib/prisma', () => ({
  prisma: makeFakePrisma({ invoice: invoices, payment: payments, budget: budgets, expense: expenses, purchaseOrder: purchaseOrders, installment: installments }),
}))

const {
  billing,
  getFinanceAging,
  getFinanceAttention,
  getFinanceOverview,
  getPaymentMix,
  loadBudgetPosition,
} = await import ('../financeAnalytics')
import { groupOutstandingByClass } from '../financeLogic'

const kpiOf = (overview: Awaited<ReturnType<typeof getFinanceOverview>>, key: string) => {
  const k = overview.kpis.find((x) => x.key === key)
  if (!k) throw new Error(`KPI ${key} missing`)
  return k
}

describe('finance reconciliation — controlled dataset', () => {
  it('overview KPIs match the hand-calculated figures', async () => {
    const o = await getFinanceOverview(YEAR, 2)
    expect(kpiOf(o, 'collectionRate').value).toBe(61.6)
    expect(kpiOf(o, 'billed').value).toBe(730_000)
    expect(kpiOf(o, 'outstanding').value).toBe(280_000)
    expect(kpiOf(o, 'overdue').value).toBe(230_000)
    expect(kpiOf(o, 'severeShare').value).toBe(28.6)
    // Term 1 was 100% collected → comparison is −38.4 points.
    expect(kpiOf(o, 'collectionRate').comparison).toMatchObject({ delta: -38.4, direction: 'down' })
  })

  it('billed = collected + outstanding (no drift) for the scope', async () => {
    const b = await billing(YEAR, 2)
    expect(b).toMatchObject({ invoices: 5, billed: 730_000, collected: 450_000, outstanding: 280_000, drift: 0 })
    expect(b.billed - b.collected).toBe(b.outstanding)
  })

  it('receivables aging total = overview outstanding, and buckets sum to the total', async () => {
    const [o, aging] = await Promise.all([getFinanceOverview(YEAR, 2), getFinanceAging(YEAR, 2)])
    expect(aging.totalOutstanding).toBe(kpiOf(o, 'outstanding').value)
    expect(aging.totalOutstanding).toBe(280_000)
    expect(aging.overdueAmount).toBe(kpiOf(o, 'overdue').value)
    expect(aging.severeAmount).toBe(80_000)
    const bucketSum = aging.buckets.reduce((s, x) => s + x.amount, 0)
    expect(bucketSum).toBe(aging.totalOutstanding)
    const byKey = Object.fromEntries(aging.buckets.map((x) => [x.key, x.amount]))
    expect(byKey).toMatchObject({ current: 50_000, d1_30: 0, d31_60: 150_000, d61_90: 0, d90_plus: 80_000 })
    const formTotal = aging.byForm.reduce((s, f) => s + f.total, 0)
    expect(formTotal).toBe(aging.totalOutstanding) // includes the "No class" row
    expect(aging.byForm.some((f) => f.form === null)).toBe(true)
    expect(aging.debtors.reduce((s, d) => s + d.balance, 0)).toBe(aging.totalOutstanding)
  })

  it('outstanding-by-class (incl. "No class") sums to the overview outstanding', () => {
    const rows = groupOutstandingByClass(
      invoices.filter((i) => i.term === 2).map((i) => ({ studentId: i.studentId, balance: i.balance, classId: i.student.classId })),
      new Map([
        ['class-C1', 'C1'],
        ['class-C2', 'C2'],
      ]),
    )
    expect(rows.reduce((s, r) => s + r.outstanding, 0)).toBe(280_000)
    expect(rows.find((r) => r.classId === '')).toMatchObject({ className: 'No class', outstanding: 50_000, studentCount: 1 })
    expect(rows.find((r) => r.className === 'C2')).toMatchObject({ outstanding: 150_000 })
  })

  it('payment mix: cash received = applied to invoices + held as credit, and ties to collected', async () => {
    const [o, mix] = await Promise.all([getFinanceOverview(YEAR, 2), getPaymentMix(YEAR, 2)])
    expect(mix.totalCollected).toBe(460_000) // term-1 payment excluded
    expect(mix.appliedToInvoices).toBe(450_000)
    expect(mix.heldAsCredit).toBe(10_000)
    expect(mix.totalCollected).toBe(mix.appliedToInvoices + mix.heldAsCredit)
    // The "applied" figure is exactly the numerator of the collection rate.
    const b = await billing(YEAR, 2)
    expect(mix.appliedToInvoices).toBe(b.collected)
    expect(kpiOf(o, 'collectionRate').subLabel).toContain('450,000')
    expect(mix.paymentCount).toBe(5)
    expect(mix.averagePayment).toBe(92_000)
    expect(mix.byMethod.reduce((s, m) => s + m.amount, 0)).toBe(mix.totalCollected)
    expect(mix.byWeekday.reduce((s, d) => s + d.amount, 0)).toBe(mix.totalCollected)
    expect(mix.byMethod.reduce((s, m) => s + m.count, 0)).toBe(mix.paymentCount)
  })

  it('budget position uses live approved expenses, counts each expense once, and reports unbudgeted spend', async () => {
    const [o, pos] = await Promise.all([getFinanceOverview(YEAR, 2), loadBudgetPosition(YEAR, 2)])
    expect(pos.allocated).toBe(420_000) // term-2 utilities + annual maintenance
    expect(pos.spent).toBe(150_000) // utilities T2 30,000 + maintenance T1+T2 120,000
    expect(pos.utilisation).toBe(35.7)
    expect(pos.unbudgetedSpend).toBe(15_000)
    expect(kpiOf(o, 'budgetUtilisation').value).toBe(pos.utilisation)
    // Pending expenses never count as spent.
    expect(pos.spent).toBe(150_000)
  })

  it('open PO commitments price only undelivered goods', async () => {
    const o = await getFinanceOverview(YEAR, 2)
    const k = kpiOf(o, 'openCommitments')
    expect(k.value).toBe(140_000)
    expect(k.subLabel).toBe('2 orders')
  })

  it('pending-expense KPI is term-scoped; the attention queue is explicitly all-terms', async () => {
    const [o, attention] = await Promise.all([getFinanceOverview(YEAR, 2), getFinanceAttention(YEAR, 2)])
    expect(kpiOf(o, 'pendingExpenses').value).toBe(1)
    const pending = attention.find((a) => a.key === 'expenses-pending')
    expect(pending?.count).toBe(2)
    expect(pending?.label).toContain('all terms')
  })

  it('attention queue agrees with aging, instalments and procurement', async () => {
    const a = await getFinanceAttention(YEAR, 2)
    const by = Object.fromEntries(a.map((i) => [i.key, i.count]))
    expect(by['arrears-severe']).toBe(1) // B
    expect(by['arrears-recent']).toBe(1) // C (31–60 days)
    expect(by['installments-overdue']).toBe(2)
    expect(by['po-approval']).toBe(1)
    expect(by['po-late']).toBe(1)
    expect(by['budgets-high']).toBeUndefined() // no category is ≥ 90% used
    expect(a[0]?.severity).toBe('critical')
  })

  it('a term with no invoices reports null (N/A), never 0%', async () => {
    const o = await getFinanceOverview(YEAR, 3)
    expect(kpiOf(o, 'collectionRate').value).toBeNull()
    expect(kpiOf(o, 'billed').value).toBeNull()
    expect(kpiOf(o, 'outstanding').value).toBeNull()
    expect(kpiOf(o, 'overdue').value).toBeNull()
    expect(kpiOf(o, 'collectionRate').status).toBe('neutral')
    expect(kpiOf(o, 'outstanding').status).toBe('neutral')
  })

  it('the whole-year aging (no term) covers every term’s invoices', async () => {
    const aging = await getFinanceAging(YEAR, null)
    expect(aging.totalOutstanding).toBe(280_000)
    const mix = await getPaymentMix(YEAR, null)
    expect(mix.totalCollected).toBe(560_000)
    expect(mix.appliedToInvoices).toBe(550_000)
    expect(mix.heldAsCredit).toBe(10_000)
  })
})
