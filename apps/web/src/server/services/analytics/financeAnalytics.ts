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
import type { ReportSectionData, AttentionItem, ReportInsight } from '@shared/types/reporting'
import type { ApiFinanceAging, ApiPaymentMix } from '@shared/types/reporting-finance'
import { buildAging, type AgingInvoiceInput } from './financeAging'
import { kpi, thresholdKpi, ratioPct, compare, previousPeriod, round } from '@/server/services/reporting/kpi'
import { THRESHOLDS } from '@/server/services/reporting/thresholds'
import { collectionInsight, agingInsight, compact, sortInsights } from '@/server/services/reporting/insights'

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
  const payments = await prisma.payment.findMany({
    where: { invoice: invoiceScope(academicYear, term) },
    select: { amount: true, method: true, paidAt: true },
  })

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

  return {
    academicYear,
    term: term ?? null,
    totalCollected: round(total, 2),
    paymentCount: payments.length,
    averagePayment: payments.length > 0 ? round(total / payments.length, 0) : null,
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

async function billing(academicYear: string, term: number | null) {
  const agg = await prisma.invoice.aggregate({
    where: invoiceScope(academicYear, term),
    _sum: { totalAmount: true, paidAmount: true, balance: true },
    _count: { _all: true },
  })
  const billed = num(agg._sum.totalAmount)
  const collected = num(agg._sum.paidAmount)
  return {
    billed,
    collected,
    outstanding: num(agg._sum.balance),
    invoices: agg._count._all,
    rate: ratioPct(collected, billed),
  }
}

const OPEN_PO_STATUSES = ['APPROVED', 'SENT', 'PARTIALLY_RECEIVED'] as const

export async function getFinanceOverview(
  academicYear: string,
  term: number,
): Promise<ReportSectionData> {
  const prev = previousPeriod(academicYear, term)
  const [current, previous, aging, budgets, pendingExpenses, openPos] = await Promise.all([
    billing(academicYear, term),
    billing(prev.academicYear, prev.term),
    getFinanceAging(academicYear, term),
    prisma.budget.aggregate({
      where: { academicYear, OR: [{ term }, { term: null }] },
      _sum: { allocated: true, spent: true },
    }),
    prisma.expense.aggregate({
      where: { academicYear, term, status: 'PENDING' },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.purchaseOrder.aggregate({
      where: { status: { in: [...OPEN_PO_STATUSES] } },
      _count: { _all: true },
      _sum: { total: true },
    }),
  ])

  const allocated = num(budgets._sum.allocated)
  const spent = num(budgets._sum.spent)
  const utilisation = ratioPct(spent, allocated)
  const prevRate = previous.invoices > 0 ? previous.rate : null

  const kpis = [
    thresholdKpi('collectionRate', {
      key: 'collectionRate',
      label: 'Collection rate',
      value: current.rate,
      unit: 'percent',
      description: 'Fees collected divided by fees billed for the selected term.',
      subLabel: current.billed > 0 ? `${Math.round(current.collected).toLocaleString('en-US')} of ${Math.round(current.billed).toLocaleString('en-US')} MWK` : undefined,
      comparison: compare(current.rate, prevRate, 'vs previous term'),
      href: '/reports?tab=collection',
    }),
    kpi({
      key: 'billed',
      label: 'Billed',
      value: current.invoices > 0 ? current.billed : null,
      unit: 'mwk',
      description: 'Total of all invoices raised for the selected term (after discounts and scholarships).',
      subLabel: `${current.invoices.toLocaleString('en-US')} invoices`,
    }),
    kpi({
      key: 'outstanding',
      label: 'Outstanding',
      value: current.invoices > 0 ? current.outstanding : null,
      unit: 'mwk',
      description: 'Unpaid balance across the selected term’s invoices.',
      status: current.outstanding > 0 ? 'watch' : 'healthy',
      href: '/reports?tab=outstanding',
    }),
    kpi({
      key: 'overdue',
      label: 'Overdue',
      value: current.invoices > 0 ? aging.overdueAmount : null,
      unit: 'mwk',
      description: 'Outstanding balance on invoices that are past their due date.',
      status: aging.overdueAmount > 0 ? 'watch' : 'healthy',
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
      description: 'Spend recorded against budgets divided by the amount allocated, for the term and annual budgets.',
      subLabel: allocated > 0 ? `${Math.round(spent).toLocaleString('en-US')} of ${Math.round(allocated).toLocaleString('en-US')} MWK` : undefined,
      href: '/reports?tab=expenses',
    }),
    kpi({
      key: 'pendingExpenses',
      label: 'Expenses awaiting approval',
      value: pendingExpenses._count._all,
      unit: 'count',
      description: 'Expenses recorded this term that are still pending approval.',
      subLabel: pendingExpenses._count._all > 0 ? `MWK ${Math.round(num(pendingExpenses._sum.amount)).toLocaleString('en-US')}` : undefined,
      status: pendingExpenses._count._all > 0 ? 'watch' : 'healthy',
    }),
    kpi({
      key: 'openCommitments',
      label: 'Open PO commitments',
      value: openPos._count._all > 0 ? num(openPos._sum.total) : 0,
      unit: 'mwk',
      description: 'Value of approved purchase orders not yet fully received.',
      subLabel: `${openPos._count._all} order${openPos._count._all === 1 ? '' : 's'}`,
    }),
  ]

  const insights: ReportInsight[] = compact([
    collectionInsight(current.rate, current.outstanding, '/reports?tab=outstanding'),
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
    scope: { academicYear, term, description: 'All billed fees, budgets and open purchase orders for the school.' },
    kpis,
    insights: sortInsights(insights),
    generatedAt: new Date().toISOString(),
  }
}

// ─── ATTENTION QUEUE ─────────────────────────────────────────────────────────

export async function getFinanceAttention(academicYear: string, term: number): Promise<AttentionItem[]> {
  const now = new Date()
  const [aging, pendingExpenses, overdueInstallments, posAwaiting, lateDeliveries, budgets] = await Promise.all([
    getFinanceAging(academicYear, term, now),
    prisma.expense.count({ where: { status: 'PENDING' } }),
    prisma.installment.count({
      where: { OR: [{ status: 'OVERDUE' }, { status: 'PENDING', dueDate: { lt: now } }] },
    }),
    prisma.purchaseOrder.count({ where: { status: 'PENDING_APPROVAL' } }),
    prisma.purchaseOrder.count({
      where: { status: { in: ['SENT', 'PARTIALLY_RECEIVED'] }, expectedDeliveryDate: { lt: now } },
    }),
    prisma.budget.findMany({
      where: { academicYear, OR: [{ term }, { term: null }] },
      select: { allocated: true, spent: true },
    }),
  ])

  const severe = aging.buckets.filter((b) => b.key === 'd90_plus' || b.key === 'd61_90')
  const severeCount = severe.reduce((s, b) => s + b.count, 0)
  const recentOverdue = aging.buckets.filter((b) => b.key === 'd1_30' || b.key === 'd31_60')
  const recentCount = recentOverdue.reduce((s, b) => s + b.count, 0)
  const overBudget = budgets.filter((b) => num(b.allocated) > 0 && num(b.spent) / num(b.allocated) >= THRESHOLDS.budgetUtilisation.watch / 100).length

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
    { key: 'installments-overdue', severity: 'watch', label: 'Instalments past due', count: overdueInstallments, href: '/finances?tab=invoices' },
    { key: 'expenses-pending', severity: 'watch', label: 'Expenses awaiting approval', count: pendingExpenses, href: '/finances?tab=expenses' },
    { key: 'budgets-high', severity: 'watch', label: 'Budgets at or above 90% spent', count: overBudget, href: '/reports?tab=expenses' },
    { key: 'po-approval', severity: 'info', label: 'Purchase orders awaiting approval', count: posAwaiting, href: '/finances?tab=procurement' },
    { key: 'po-late', severity: 'watch', label: 'Purchase orders past expected delivery', count: lateDeliveries, href: '/finances?tab=procurement' },
  ]

  const order = { critical: 0, watch: 1, info: 2, positive: 3 } as const
  return items
    .filter((i) => (i.count ?? 0) > 0)
    .sort((a, b) => order[a.severity] - order[b.severity] || (b.count ?? 0) - (a.count ?? 0))
}
