/**
 * feeService.money.test.ts
 * [CHANGE TYPE]: NEW FILE. Finance Hardening Plan P1-01.
 *
 * feeService now does its money arithmetic through `@/lib/money` (exact Decimal, half-up) instead of
 * JavaScript floats. These tests run the real `computeInvoiceCharges` and `recordPayment` against
 * a mocked Prisma and check the figures with independently worked-out expected values.
 *
 * Prisma is mocked, so these prove arithmetic and the amounts handed to Prisma, NOT locking or
 * atomicity (that needs the integration project, plan P1-03 onward).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'

const dec = (v: string | number) => new Decimal(v)

const h = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    invoice: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    payment: { create: vi.fn() },
    paymentAllocation: { create: vi.fn() },
    invoiceLineItem: { update: vi.fn(), create: vi.fn() },
    studentCredit: { create: vi.fn() },
    student: { findUnique: vi.fn() },
    invoiceNumber: undefined as unknown,
  }
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    feeStructure: { findMany: vi.fn() },
    scholarship: { findFirst: vi.fn() },
    studentCredit: { findMany: vi.fn() },
    student: { findUnique: vi.fn() },
    invoice: { findMany: vi.fn(), update: vi.fn() },
    invoiceLineItem: { create: vi.fn() },
    systemSettings: { findUnique: vi.fn() },
  }
  return { tx, prisma }
})

vi.mock('@/lib/prisma', () => ({ prisma: h.prisma }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/server/services/receiptService', () => ({ generateReceipt: vi.fn() }))
// [P1-06] The money event is registered and posted inside the payment transaction.
vi.mock('@/server/services/accountingService', () => ({
  paymentPostingPlan: vi.fn((o: { amount: number }) => ({ reference: 'PAY-X', description: 'd', lines: [{ accountCode: '1000', debit: o.amount }] })),
}))
vi.mock('@/server/services/financialRegisterService', () => ({ recordAndPost: vi.fn() }))
vi.mock('@/server/services/algoliaService', () => ({ updateInvoice: vi.fn() }))
vi.mock('@/server/services/studentService', () => ({ resolveStudentFromUid: vi.fn() }))
vi.mock('@/server/services/notificationService', () => ({ getSchoolBranding: vi.fn() }))
vi.mock('@/server/services/settingsService', () => ({}))
vi.mock('@/server/services/invoiceNumberService', () => ({ withInvoiceNumber: vi.fn() }))
vi.mock('@/server/services/analytics/financeLogic', () => ({ summariseInvoices: vi.fn() }))
vi.mock('@/server/services/reporting/kpi', () => ({ daysBetween: vi.fn() }))

import * as accountingService from '@/server/services/accountingService'
import * as financialRegister from '@/server/services/financialRegisterService'
import {
  computeInvoiceCharges, recordPayment, applyLatePenalties,
  OverpaymentConfirmationRequiredError, DuplicatePaymentError,
} from '../feeService'

const fee = (id: string, name: string, amount: string) => ({ id, name, amount: dec(amount), isActive: true })

beforeEach(() => {
  vi.clearAllMocks()
  h.prisma.scholarship.findFirst.mockResolvedValue(null)
  h.prisma.studentCredit.findMany.mockResolvedValue([])
  h.prisma.student.findUnique.mockResolvedValue({ firstName: 'A', lastName: 'B', registrationNo: 'R1' })
  h.tx.student.findUnique.mockResolvedValue({ firstName: 'A', lastName: 'B' })
  h.tx.payment.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'pay1', reference: null, paidAt: new Date(), ...data,
  }))
  h.tx.invoice.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: 'inv1', ...data,
  }))
})

// ─────────────────────────────────────────────────────────────────────────────
describe('computeInvoiceCharges', () => {
  const charges = (ids: string[], opts?: Parameters<typeof computeInvoiceCharges>[3]) =>
    computeInvoiceCharges('stu1', '2026/2027', ids, opts)

  it('no discount: lines equal the fees and the total is their exact sum', async () => {
    h.prisma.feeStructure.findMany.mockResolvedValue([
      fee('f1', 'School fee', '100000.10'),
      fee('f2', 'Transport', '25000.20'),
    ])
    const r = await charges(['f1', 'f2'])
    expect(r.subtotal).toBe(125000.3)
    expect(r.discount).toBe(0)
    expect(r.totalAmount).toBe(125000.3)
    expect(r.lineItemsData.map((l) => l.amount)).toEqual([100000.1, 25000.2])
  })

  it('a percentage scholarship is shared across lines and the shares add up exactly', async () => {
    // 10% of 100.00 + 50.00 + 33.33 = 183.33 * 10% = 18.333 -> 18.33
    h.prisma.feeStructure.findMany.mockResolvedValue([
      fee('f1', 'A', '100.00'), fee('f2', 'B', '50.00'), fee('f3', 'C', '33.33'),
    ])
    h.prisma.scholarship.findFirst.mockResolvedValue({ discountType: 'PERCENTAGE', value: dec('10') })
    const r = await charges(['f1', 'f2', 'f3'])
    expect(r.discount).toBe(18.33)
    expect(r.totalAmount).toBe(165)
    // Σ lines = subtotal − discount to the cent, however the shares round.
    const lineSum = r.lineItemsData.reduce((s, l) => s.plus(l.amount), dec(0))
    expect(lineSum.toFixed(2)).toBe('165.00')
  })

  it('three equal fees and a discount that does not divide by three still sum exactly', async () => {
    h.prisma.feeStructure.findMany.mockResolvedValue([
      fee('f1', 'A', '10.00'), fee('f2', 'B', '10.00'), fee('f3', 'C', '10.00'),
    ])
    const r = await charges(['f1', 'f2', 'f3'], { applyScholarship: false, manualDiscount: 10 })
    expect(r.discount).toBe(10)
    const lineSum = r.lineItemsData.reduce((s, l) => s.plus(l.amount), dec(0))
    expect(lineSum.toFixed(2)).toBe('20.00')
    expect(r.totalAmount).toBe(20)
  })

  it('a fixed discount larger than the subtotal is capped, never a negative total', async () => {
    h.prisma.feeStructure.findMany.mockResolvedValue([fee('f1', 'A', '100.00')])
    h.prisma.scholarship.findFirst.mockResolvedValue({ discountType: 'FIXED', value: dec('250') })
    const r = await charges(['f1'])
    expect(r.discount).toBe(100)
    expect(r.totalAmount).toBe(0)
    expect(r.lineItemsData[0]?.amount).toBe(0)
  })

  it('a discount percentage that lands on a half cent rounds up (1.005 case)', async () => {
    // 10.05 * 10% = 1.005 -> 1.01 half-up (a float gives 1.00)
    h.prisma.feeStructure.findMany.mockResolvedValue([fee('f1', 'A', '10.05')])
    h.prisma.scholarship.findFirst.mockResolvedValue({ discountType: 'PERCENTAGE', value: dec('10') })
    const r = await charges(['f1'])
    expect(r.discount).toBe(1.01)
    expect(r.totalAmount).toBe(9.04)
  })

  it('credit is applied oldest first and only up to the total', async () => {
    h.prisma.feeStructure.findMany.mockResolvedValue([fee('f1', 'A', '100.00')])
    h.prisma.studentCredit.findMany.mockResolvedValue([
      { id: 'c1', amount: dec('60.05') },
      { id: 'c2', amount: dec('60.00') },
    ])
    const r = await charges(['f1'])
    expect(r.creditApplications).toEqual([
      { id: 'c1', amountUsed: 60.05, remaining: 0 },
      { id: 'c2', amountUsed: 39.95, remaining: 20.05 },
    ])
    expect(r.creditApplied).toBe(100)
    expect(r.totalAmount).toBe(0)
  })

  it('rejects an unknown fee id', async () => {
    h.prisma.feeStructure.findMany.mockResolvedValue([fee('f1', 'A', '1.00')])
    await expect(charges(['f1', 'missing'])).rejects.toThrow(/could not be found/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('recordPayment', () => {
  const invoice = (over: Record<string, unknown> = {}) => ({
    id: 'inv1',
    studentId: 'stu1',
    academicYear: '2026/2027',
    term: 1,
    totalAmount: dec('1000.00'),
    paidAmount: dec('0'),
    balance: dec('1000.00'),
    payments: [] as Array<Record<string, unknown>>,
    lineItems: [
      { id: 'li1', invoiceId: 'inv1', feeName: 'School fee', paidAmount: dec('0'), balance: dec('700.00') },
      { id: 'li2', invoiceId: 'inv1', feeName: 'Transport', paidAmount: dec('0'), balance: dec('300.00') },
    ],
    ...over,
  })
  const input = (over: Record<string, unknown> = {}) => ({
    invoiceId: 'inv1',
    amount: 500,
    method: 'CASH' as const,
    allocations: [{ lineItemId: 'li1', amount: 500 }],
    confirmOverpayment: false,
    ...over,
  })
  const setInvoice = (inv: ReturnType<typeof invoice>) => h.tx.invoice.findUniqueOrThrow.mockResolvedValue(inv)

  it('a partial payment reduces the line and invoice, and the status becomes PARTIAL', async () => {
    setInvoice(invoice())
    await recordPayment(input() as never, 'uid1', 'finance')
    expect(h.tx.invoiceLineItem.update).toHaveBeenCalledTimes(1)
    const lineUpdate = h.tx.invoiceLineItem.update.mock.calls[0]![0].data
    expect(String(lineUpdate.paidAmount)).toBe('500')
    expect(String(lineUpdate.balance)).toBe('200')
    const invUpdate = h.tx.invoice.update.mock.calls[0]![0].data
    expect(String(invUpdate.paidAmount)).toBe('500')
    expect(String(invUpdate.balance)).toBe('500')
    expect(invUpdate.status).toBe('PARTIAL')
    expect(h.tx.studentCredit.create).not.toHaveBeenCalled()
  })

  it('paying the exact balance in cents settles it with no float residue', async () => {
    setInvoice(invoice({
      totalAmount: dec('0.30'), balance: dec('0.30'),
      lineItems: [{ id: 'li1', invoiceId: 'inv1', feeName: 'F', paidAmount: dec('0.1'), balance: dec('0.2') }],
      paidAmount: dec('0.1'),
    }))
    await recordPayment(input({ amount: 0.2, allocations: [{ lineItemId: 'li1', amount: 0.2 }] }) as never, 'uid1', 'finance')
    const invUpdate = h.tx.invoice.update.mock.calls[0]![0].data
    expect(String(invUpdate.paidAmount)).toBe('0.3')
    expect(String(invUpdate.balance)).toBe('0')
    expect(invUpdate.status).toBe('PAID')
  })

  it('an overpayment needs confirmation and writes nothing until it is given', async () => {
    setInvoice(invoice())
    await expect(
      recordPayment(input({ amount: 800, allocations: [{ lineItemId: 'li2', amount: 800 }] }) as never, 'uid1', 'finance'),
    ).rejects.toBeInstanceOf(OverpaymentConfirmationRequiredError)
    expect(h.tx.payment.create).not.toHaveBeenCalled()
  })

  it('a confirmed overpayment creates a credit for the exact excess and applies only the balance', async () => {
    setInvoice(invoice())
    // Transport balance is 300; pay 300.55 -> excess 0.55
    await recordPayment(
      input({ amount: 300.55, allocations: [{ lineItemId: 'li2', amount: 300.55 }], confirmOverpayment: true }) as never,
      'uid1', 'finance',
    )
    const credit = h.tx.studentCredit.create.mock.calls[0]![0].data
    expect(credit.amount).toBe(0.55)
    expect(credit.originalAmount).toBe(0.55)
    const lineUpdate = h.tx.invoiceLineItem.update.mock.calls[0]![0].data
    expect(String(lineUpdate.balance)).toBe('0')
    expect(String(lineUpdate.paidAmount)).toBe('300')
    const invUpdate = h.tx.invoice.update.mock.calls[0]![0].data
    expect(String(invUpdate.paidAmount)).toBe('300')
  })

  it('ONE CENT over is now an overpayment (the old 0.01 tolerance hid it)', async () => {
    setInvoice(invoice())
    await expect(
      recordPayment(input({ amount: 300.01, allocations: [{ lineItemId: 'li2', amount: 300.01 }] }) as never, 'uid1', 'finance'),
    ).rejects.toBeInstanceOf(OverpaymentConfirmationRequiredError)
  })

  it('an unallocated remainder is treated as an overpayment too', async () => {
    setInvoice(invoice())
    await expect(
      recordPayment(input({ amount: 600, allocations: [{ lineItemId: 'li1', amount: 500 }] }) as never, 'uid1', 'finance'),
    ).rejects.toMatchObject({ overpayments: [{ feeName: 'Unallocated', excess: 100 }] })
  })

  it('allocating more than the payment is refused, exactly', async () => {
    setInvoice(invoice())
    await expect(
      recordPayment(input({ amount: 500, allocations: [{ lineItemId: 'li1', amount: 500.01 }] }) as never, 'uid1', 'finance'),
    ).rejects.toThrow(/cannot exceed the total payment/)
  })

  it('an identical payment inside the window is a duplicate; a different cent is not', async () => {
    const recent = { method: 'CASH', amount: dec('500.00'), reference: null, paidAt: new Date() }
    setInvoice(invoice({ payments: [recent] }))
    await expect(recordPayment(input() as never, 'uid1', 'finance')).rejects.toBeInstanceOf(DuplicatePaymentError)

    setInvoice(invoice({ payments: [{ ...recent, amount: dec('500.01') }] }))
    await expect(recordPayment(input() as never, 'uid1', 'finance')).resolves.toBeDefined()
  })

  it('the payment is registered and posted on the same transaction as the payment itself', async () => {
    setInvoice(invoice())
    await recordPayment(input() as never, 'uid1', 'finance')
    expect(accountingService.paymentPostingPlan).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceId: 'inv1', amount: 500, studentName: 'A B' }),
    )
    expect(financialRegister.recordAndPost).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({
        type: 'STUDENT_PAYMENT', sourceType: 'PAYMENT', sourceId: 'pay1', eventKey: 'RECEIPT', direction: 'IN',
        amount: 500, actorUid: 'uid1', partyType: 'STUDENT',
      }),
      expect.objectContaining({ reference: 'PAY-X' }),
    )
  })

  it('a posting failure fails the payment (D-08): nothing is reported as recorded', async () => {
    setInvoice(invoice())
    vi.mocked(financialRegister.recordAndPost).mockRejectedValueOnce(new Error('no such account'))
    await expect(recordPayment(input() as never, 'uid1', 'finance')).rejects.toThrow('no such account')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('applyLatePenalties', () => {
  it('the penalty is rounded to the cent and the same figure goes into every column', async () => {
    // 5% of 333.33 = 16.6665 -> 16.67
    h.prisma.invoice.findMany.mockResolvedValue([{ id: 'inv1', balance: dec('333.33') }])
    h.prisma.invoice.update.mockResolvedValue({ id: 'inv1', status: 'OVERDUE', balance: dec('350.00') })
    const tx = {
      invoice: { update: vi.fn().mockResolvedValue({ id: 'inv1', status: 'OVERDUE', balance: dec('350.00') }) },
      invoiceLineItem: { create: vi.fn() },
    }
    h.prisma.$transaction.mockImplementationOnce((async (fn: (t: unknown) => unknown) => fn(tx)) as never)
    await applyLatePenalties(0.05)
    const bump = tx.invoice.update.mock.calls[0]![0].data
    expect(String(bump.latePenalty.increment)).toBe('16.67')
    expect(String(bump.totalAmount.increment)).toBe('16.67')
    expect(String(bump.balance.increment)).toBe('16.67')
    const line = tx.invoiceLineItem.create.mock.calls[0]![0].data
    expect(String(line.amount)).toBe('16.67')
    expect(String(line.balance)).toBe('16.67')
  })
})
