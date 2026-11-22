/**
 * financeAnalytics.ts — finance reporting built on the real invoice / payment /
 * budget / expense / procurement models. Complements analyticsService (cash
 * flow, collection trends, expense breakdown, payroll, scholarships), which is
 * reused as-is by the UI; this file adds what it lacked: receivables aging by
 * due date, payment-method mix, a KPI overview with period comparison, and the
 * finance attention queue.
 *
 * All amounts are MWK numbers (Prisma Decimal → Number at the boundary).
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import type { ReportSectionData, AttentionItem, ReportInsight, ReportWarning } from '@shared/types/reporting'
import type { ApiFinanceAging, ApiPaymentMix } from '@shared/types/reporting-finance'
import { buildAging, type AgingInvoiceInput } from './financeAging'
import {
  OPEN_PO_STATUSES,
  budgetPosition,
  openPoCommitment,
  reconcilePayments,
  summariseInvoices,
  type BudgetPosition,
} from './financeLogic'
import { kpi, thresholdKpi, ratioPct, compare, previousPeriod, round } from '@/server/services/reporting/kpi'
import { THRESHOLDS } from '@/server/services/reporting/thresholds'
import { collectionInsight, agingInsight, compact, sortInsights } from '@/server/services/reporting/insights'
import { enrichAttention, rankAttention } from './executiveLogic'

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  MOBILE_MONEY: 'Mobile money (legacy)',
  CHEQUE: 'Cheque',
  AIRTEL_MONEY: 'Airtel Money',
  TNM_MPAMBA: 'TNM Mpamba',
  POS_CARD: 'POS / card',
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Invoices in scope: the year, optionally narrowed to one term. */
function invoiceScope(academicYear: string, term?: number | null) {
  return term ? { academicYear, term } : { academicYear }
}

// ─── RECEIVABLES AGING ───────────────────────────────────────────────────────

export async function getFinanceAging(
  academicYear: string,
  term?: number | null,
  asOf: Date = new Date(),
): Promise<ApiFinanceAging> {
  const invoices = await prisma.invoice.findMany({
    where: { ...invoiceScope(academicYear, term), balance: { gt: 0 } },
    select: {
      id: true,
      invoiceNumber: true,
      balance: true,
      dueDate: true,
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          class: { select: { name: true, form: true } },
        },
      },
    },
  })

  const inputs: AgingInvoiceInput[] = invoices.map((i) => ({
    invoiceId: i.id,
    invoiceNumber: i.invoiceNumber,
    studentId: i.student.id,
    studentName: `${i.student.firstName} ${i.student.lastName}`,
    className: i.student.class?.name ?? null,
    form: i.student.class?.form ?? null,
    balance: num(i.balance),
    dueDate: i.dueDate,
  }))

  return {
    asOf: asOf.toISOString(),
    academicYear,
    term: term ?? null,
    ...buildAging(inputs, asOf),
  }
}

// ─── PAYMENT MIX ─────────────────────────────────────────────────────────────

export async function getPaymentMix(academicYear: string, term?: number | null): Promise<ApiPaymentMix> {
  const scope = invoiceScope(academicYear, term)
  const [payments, invoices] = await Promise.all([
    prisma.payment.findMany({
      where: { invoice: scope },
      select: { amount: true, method: true, paidAt: true },
    }),
    prisma.invoice.findMany({ where: scope, select: { totalAmount: true, paidAmount: true, balance: true } }),
  ])

  const methods = new Map<string, { count: number; amount: number }>()
  const weekdays = WEEKDAY.map((label, dayOfWeek) => ({ dayOfWeek, label, count: 0, amount: 0 }))
  let total = 0

  for (const p of payments) {
    const amount = num(p.amount)
    total += amount
    const m = methods.get(p.method) ?? { count: 0, amount: 0 }
    m.count += 1
    m.amount += amount
    methods.set(p.method, m)
    const day = weekdays[new Date(p.paidAt).getDay()]
    if (day) {
      day.count += 1
      day.amount += amount
    }
  }

  // Cash received vs the part applied to these invoices (the rest is held as
  // student credit from overpayments). Same invoices, so the two reconcile.
  const recon = reconcilePayments(payments.map((p) => num(p.amount)), summariseInvoices(toFigures(invoices)).collected)

  return {
    academicYear,
    term: term ?? null,
    totalCollected: round(total, 2),
    paymentCount: payments.length,
    averagePayment: payments.length > 0 ? round(total / payments.length, 0) : null,
    appliedToInvoices: recon.appliedToInvoices,
    heldAsCredit: recon.heldAsCredit,
    byMethod: Array.from(methods.entries())
      .map(([method, v]) => ({
        method,
        label: METHOD_LABEL[method] ?? method,
        count: v.count,
        amount: round(v.amount, 2),
        share: ratioPct(v.amount, total),
      }))
      .sort((a, b) => b.amount - a.amount),
    byWeekday: weekdays.map((d) => ({ ...d, amount: round(d.amount, 2) })),
  }
}

// ─── OVERVIEW (KPIs + insights) ──────────────────────────────────────────────

/** Decimal-safe numeric view of invoice rows, for the shared pure maths. */
function toFigures(rows: readonly { totalAmount: unknown; paidAmount: unknown; balance: unknown }[]) {
  return rows.map((r) => ({ totalAmount: num(r.totalAmount), paidAmount: num(r.paidAmount), balance: num(r.balance) }))
}

/** Billed / collected / outstanding for a scope — the single source for every collection KPI. */
export async function billing(academicYear: string, term: number | null) {
  const rows = await prisma.invoice.findMany({
    where: invoiceScope(academicYear, term),
    select: { totalAmount: true, paidAmount: true, balance: true },
  })
  return summariseInvoices(toFigures(rows))
}

/**
 * Budget position from LIVE approved expenses (see financeLogic.budgetPosition).
 * Shared by the finance overview, the attention queue and the Budget-vs-Actual
 * report so the three can never disagree.
 */
export async function loadBudgetPosition(academicYear: string, term: number | null): Promise<BudgetPosition> {
  const [budgets, expenses] = await Promise.all([
    prisma.budget.findMany({
      where: { academicYear },
      select: { category: true, term: true, allocated: true },
    }),
    prisma.expense.findMany({
      where: { academicYear, status: 'APPROVED', ...(term !== null ? { term: { lte: term } } : {}) },
      select: { category: true, term: true, amount: true },
    }),
  ])
  return budgetPosition(
    budgets.map((b) => ({ category: b.category, term: b.term, allocated: num(b.allocated) })),
    expenses.map((e) => ({ category: e.category, term: e.term, amount: num(e.amount) })),
    term,
  )
}

export async function openCommitments() {
  const pos = await prisma.purchaseOrder.findMany({
    where: { status: { in: [...OPEN_PO_STATUSES] } },
    select: {
      status: true,
      lines: { select: { quantityOrdered: true, quantityReceived: true, quantityCancelled: true, lineTotal: true } },
    },
  })
  return openPoCommitment(
    pos.map((po) => ({
      status: po.status,
      lines: po.lines.map((l) => ({
        quantityOrdered: num(l.quantityOrdered),
        quantityReceived: num(l.quantityReceived),
        quantityCancelled: num(l.quantityCancelled),
        lineTotal: num(l.lineTotal),
      })),
    })),
  )
}

export async function getFinanceOverview(
  academicYear: string,
  term: number,
): Promise<ReportSectionData> {
  const prev = previousPeriod(academicYear, term)
  const [current, previous, aging, budget, pendingExpenses, openPos] = await Promise.all([
    billing(academicYear, term),
    billing(prev.academicYear, prev.term),
    getFinanceAging(academicYear, term),
    loadBudgetPosition(academicYear, term),
    prisma.expense.aggregate({
      where: { academicYear, term, status: 'PENDING' },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    openCommitments(),
  ])

  const allocated = budget.allocated
  const spent = budget.spent
  const utilisation = budget.utilisation
  const prevRate = previous.invoices > 0 ? previous.collectionRate : null

  const warnings: ReportWarning[] = []
  if (current.drift !== 0) {
    warnings.push({
      key: 'invoice-drift',
      message: `Invoice balances for this term differ from billed − collected by MWK ${Math.abs(Math.round(current.drift)).toLocaleString('en-US')}. Totals below are as recorded; the difference should be reconciled by Finance.`,
    })
  }

  const kpis = [
    thresholdKpi('collectionRate', {
      key: 'collectionRate',
      label: 'Collection rate',
      value: current.collectionRate,
      unit: 'percent',
      description: 'Fees applied to the term’s invoices to date ÷ fees billed for the term (same invoices, same term; a point-in-time rate, not money received this month).',
      subLabel: current.billed > 0 ? `${Math.round(current.collected).toLocaleString('en-US')} of ${Math.round(current.billed).toLocaleString('en-US')} MWK` : undefined,
      comparison: compare(current.collectionRate, prevRate, 'vs previous term'),
      href: '/reports?tab=collection',
    }),
    kpi({
      key: 'billed',
      label: 'Billed',
      value: current.invoices > 0 ? current.billed : null,
      unit: 'mwk',
      description: 'Total of all invoices raised for the selected term (after scholarships, discounts and credit applied; including late penalties).',
      subLabel: `${current.invoices.toLocaleString('en-US')} invoices`,
    }),
    kpi({
      key: 'outstanding',
      label: 'Outstanding',
      value: current.invoices > 0 ? current.outstanding : null,
      unit: 'mwk',
      description: 'Unpaid balance across the selected term’s invoices, as at today (billed − collected).',
      status: current.invoices === 0 ? 'neutral' : current.outstanding > 0 ? 'watch' : 'healthy',
      href: '/reports?tab=outstanding',
    }),
    kpi({
      key: 'overdue',
      label: 'Overdue',
      value: current.invoices > 0 ? aging.overdueAmount : null,
      unit: 'mwk',
      description: 'The part of the outstanding balance on invoices already past their due date.',
      status: current.invoices === 0 ? 'neutral' : aging.overdueAmount > 0 ? 'watch' : 'healthy',
      href: '/reports?tab=aging',
    }),
    thresholdKpi('severeArrearsShare', {
      key: 'severeShare',
      label: 'Over 60 days',
      value: aging.severeShare,
      unit: 'percent',
      description: 'Share of the outstanding balance that is more than 60 days past its due date — the hardest to recover.',
      href: '/reports?tab=aging&bucket=d90_plus',
    }),
    thresholdKpi('budgetUtilisation', {
      key: 'budgetUtilisation',
      label: 'Budget used',
      value: utilisation,
      unit: 'percent',
      description: 'Approved expenses ÷ allocated budget, for budgeted categories: this term’s budgets plus annual budgets (annual budgets count year-to-date spend). Unbudgeted spend is reported separately.',
      subLabel: allocated > 0 ? `${Math.round(spent).toLocaleString('en-US')} of ${Math.round(allocated).toLocaleString('en-US')} MWK` : undefined,
      href: '/reports?tab=expenses',
    }),
    kpi({
      key: 'pendingExpenses',
      label: 'Expenses awaiting approval',
      value: pendingExpenses._count._all,
      unit: 'count',
      description: 'Expenses recorded for the selected term that are still pending approval (the attention queue counts pending expenses from every term).',
      subLabel: pendingExpenses._count._all > 0 ? `MWK ${Math.round(num(pendingExpenses._sum.amount)).toLocaleString('en-US')}` : undefined,
      status: pendingExpenses._count._all > 0 ? 'watch' : 'healthy',
    }),
    kpi({
      key: 'openCommitments',
      label: 'Open PO commitments',
      value: openPos.value,
      unit: 'mwk',
      description: 'Undelivered value of approved purchase orders as at today (ordered − received − cancelled, at each line’s price). Received goods are expenses, not commitments, so nothing is counted twice. Not period-scoped.',
      subLabel: `${openPos.orders} order${openPos.orders === 1 ? '' : 's'}`,
    }),
  ]

  const insights: ReportInsight[] = compact([
    collectionInsight(current.collectionRate, current.outstanding, '/reports?tab=outstanding'),
    agingInsight(aging.severeShare, aging.severeAmount, '/reports?tab=aging&bucket=d90_plus'),
    utilisation !== null && utilisation >= THRESHOLDS.budgetUtilisation.critical
      ? {
          key: 'budget-over',
          severity: 'critical',
          title: `Budgets are ${utilisation}% spent`,
          detail: 'Spending has reached or passed the allocated amount; new commitments need approval for more funds.',
          href: '/reports?tab=expenses',
        }
      : utilisation !== null && utilisation >= THRESHOLDS.budgetUtilisation.watch
        ? {
            key: 'budget-high',
            severity: 'watch',
            title: `Budgets are ${utilisation}% spent`,
            detail: 'Spending is close to the allocated amount.',
            href: '/reports?tab=expenses',
          }
        : null,
  ])

  return {
    key: 'finance-overview',
    title: 'Financial position',
    scope: { academicYear, term, description: 'All fees billed for the term, budgets for the term and year, and open purchase orders for the school.' },
    kpis,
    insights: sortInsights(insights),
    ...(warnings.length > 0 ? { warnings } : {}),
    generatedAt: new Date().toISOString(),
  }
}

// ─── ATTENTION QUEUE ─────────────────────────────────────────────────────────

export async function getFinanceAttention(academicYear: string, term: number): Promise<AttentionItem[]> {
  const now = new Date()
  const [aging, pendingExpenses, overdueInstallments, posAwaiting, lateDeliveries, budget] = await Promise.all([
    getFinanceAging(academicYear, term, now),
    // Pending approvals are action items, so they are counted across every term
    // (an unapproved expense from last term still needs a decision).
    prisma.expense.count({ where: { status: 'PENDING' } }),
    prisma.installment.count({
      where: { OR: [{ status: 'OVERDUE' }, { status: 'PENDING', dueDate: { lt: now } }] },
    }),
    prisma.purchaseOrder.count({ where: { status: 'PENDING_APPROVAL' } }),
    prisma.purchaseOrder.count({
      where: { status: { in: ['SENT', 'PARTIALLY_RECEIVED'] }, expectedDeliveryDate: { lt: now } },
    }),
    loadBudgetPosition(academicYear, term),
  ])

  const severe = aging.buckets.filter((b) => b.key === 'd90_plus' || b.key === 'd61_90')
  const severeCount = severe.reduce((s, b) => s + b.count, 0)
  const recentOverdue = aging.buckets.filter((b) => b.key === 'd1_30' || b.key === 'd31_60')
  const recentCount = recentOverdue.reduce((s, b) => s + b.count, 0)
  // Same category-level, live-spend position as the overview's "Budget used" KPI.
  const overBudget = budget.rows.filter((r) => r.utilisation !== null && r.utilisation >= THRESHOLDS.budgetUtilisation.watch).length

  const items: AttentionItem[] = [
    {
      key: 'arrears-severe',
      severity: 'critical',
      label: 'Invoices more than 60 days overdue',
      count: severeCount,
      detail: severeCount > 0 ? `MWK ${Math.round(severe.reduce((s, b) => s + b.amount, 0)).toLocaleString('en-US')} outstanding` : undefined,
      href: '/reports?tab=aging&bucket=d90_plus',
    },
    {
      key: 'arrears-recent',
      severity: 'watch',
      label: 'Invoices 1–60 days overdue',
      count: recentCount,
      detail: recentCount > 0 ? `MWK ${Math.round(recentOverdue.reduce((s, b) => s + b.amount, 0)).toLocaleString('en-US')} outstanding` : undefined,
      href: '/reports?tab=aging&bucket=d1_30',
    },
    { key: 'installments-overdue', severity: 'watch', label: 'Instalments past due (all periods)', count: overdueInstallments, href: '/finances?tab=invoices' },
    { key: 'expenses-pending', severity: 'watch', label: 'Expenses awaiting approval (all terms)', count: pendingExpenses, href: '/finances?tab=expenses' },
    { key: 'budgets-high', severity: 'watch', label: 'Budget categories at or above 90% spent', count: overBudget, href: '/reports?tab=expenses' },
    { key: 'po-approval', severity: 'info', label: 'Purchase orders awaiting approval', count: posAwaiting, href: '/finances?tab=procurement' },
    { key: 'po-late', severity: 'watch', label: 'Purchase orders past expected delivery', count: lateDeliveries, href: '/finances?tab=procurement' },
  ]

  return enrichAttention(rankAttention(items))
}
