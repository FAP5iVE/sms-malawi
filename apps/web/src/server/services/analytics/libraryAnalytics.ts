/**
 * libraryAnalytics.ts — circulation, overdue exposure and fine reporting.
 * Complements analyticsService (borrowing trend, inventory health, top
 * borrowed, digital stats), which the UI keeps using as-is.
 *
 * "Overdue" is derived from the due date of loans not yet returned, not from
 * Borrowing.status (which only changes when a job or librarian updates it).
 */
import 'server-only'
import { subDays } from 'date-fns'
import { prisma } from '@/lib/prisma'
import type { AttentionItem, ReportInsight, ReportSectionData } from '@shared/types/reporting'
import type { ApiLibraryCirculation, ApiLibraryFines, ApiOverdueRow } from '@shared/types/reporting-library'
import {
  OVERDUE_BUCKETS, averageLoanDays, lastMonths, monthKey, onTimeRate, overdueBucket,
} from './libraryLogic'
import { kpi, thresholdKpi, ratioPct, compare, round, daysBetween } from '@/server/services/reporting/kpi'
import { compact, overdueInsight, sortInsights } from '@/server/services/reporting/insights'

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
const pretty = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
const OVERDUE_LIST_CAP = 100

function tally<T>(items: readonly T[], key: (i: T) => string, order?: readonly string[]) {
  const m = new Map<string, number>()
  order?.forEach((o) => m.set(o, 0))
  items.forEach((i) => m.set(key(i), (m.get(key(i)) ?? 0) + 1))
  return Array.from(m.entries()).map(([label, count]) => ({ label, count }))
}

export async function getLibraryCirculation(windowDays = 90): Promise<ApiLibraryCirculation> {
  const now = new Date()
  const since = subDays(now, windowDays)

  const [loans, open] = await Promise.all([
    prisma.borrowing.findMany({
      where: { issuedAt: { gte: since } },
      select: {
        issuedAt: true, dueDate: true, returnedAt: true, borrowerType: true,
        book: { select: { category: true } },
        student: { select: { class: { select: { form: true } } } },
      },
    }),
    prisma.borrowing.findMany({
      where: { returnedAt: null, status: { not: 'LOST' }, dueDate: { lt: now } },
      select: {
        id: true, dueDate: true, borrowerType: true,
        book: { select: { title: true } },
        student: { select: { firstName: true, lastName: true, class: { select: { name: true } } } },
        staff: { select: { firstName: true, lastName: true } },
      },
      orderBy: { dueDate: 'asc' },
    }),
  ])

  const returned = loans.filter((l): l is typeof l & { returnedAt: Date } => l.returnedAt !== null)

  const overdue: ApiOverdueRow[] = open.map((o) => {
    const who = o.student ?? o.staff
    return {
      borrowingId: o.id,
      bookTitle: o.book.title,
      borrower: who ? `${who.firstName} ${who.lastName}` : 'Unknown borrower',
      borrowerType: o.borrowerType,
      className: o.student?.class?.name ?? null,
      dueDate: o.dueDate.toISOString(),
      daysOverdue: daysBetween(o.dueDate, now),
    }
  })

  return {
    windowDays,
    loans: loans.length,
    returned: returned.length,
    onTimeRate: onTimeRate(returned),
    avgLoanDays: averageLoanDays(returned),
    byCategory: tally(loans, (l) => pretty(l.book.category)).sort((a, b) => b.count - a.count),
    byBorrowerType: tally(loans, (l) => (l.borrowerType === 'STAFF' ? 'Staff' : 'Students')),
    byForm: tally(
      loans.filter((l) => l.student?.class?.form != null),
      (l) => `Form ${l.student?.class?.form}`,
    ).sort((a, b) => a.label.localeCompare(b.label)),
    overdueAging: tally(
      overdue.filter((o) => overdueBucket(o.daysOverdue) !== null),
      (o) => overdueBucket(o.daysOverdue) as string,
      OVERDUE_BUCKETS,
    ),
    overdue: overdue.sort((a, b) => b.daysOverdue - a.daysOverdue).slice(0, OVERDUE_LIST_CAP),
  }
}

export async function getLibraryFines(months = 6): Promise<ApiLibraryFines> {
  const now = new Date()
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1))
  const fines = await prisma.libraryFine.findMany({
    where: { createdAt: { gte: since } },
    select: { amount: true, status: true, createdAt: true, paidAt: true },
  })
  const all = await prisma.libraryFine.groupBy({
    by: ['status'],
    _count: { _all: true },
    _sum: { amount: true },
  })
  const sum = (s: string) => num(all.find((g) => g.status === s)?._sum.amount)
  const pending = sum('PENDING')
  const paid = sum('PAID')
  const waived = sum('WAIVED')

  const buckets = new Map(lastMonths(months, now).map((m) => [m.key, { label: m.label, assessed: 0, collected: 0 }]))
  for (const f of fines) {
    const a = buckets.get(monthKey(f.createdAt))
    if (a) a.assessed += num(f.amount)
    if (f.status === 'PAID' && f.paidAt) {
      const c = buckets.get(monthKey(f.paidAt))
      if (c) c.collected += num(f.amount)
    }
  }

  return {
    pendingCount: all.find((g) => g.status === 'PENDING')?._count._all ?? 0,
    pendingAmount: pending,
    paidAmount: paid,
    waivedAmount: waived,
    collectionRate: ratioPct(paid, paid + waived + pending),
    monthly: Array.from(buckets.values()).map((b) => ({ ...b, assessed: round(b.assessed, 2), collected: round(b.collected, 2) })),
  }
}

export async function getLibraryOverview(): Promise<ReportSectionData> {
  const now = new Date()
  const d30 = subDays(now, 30)
  const d60 = subDays(now, 60)

  const [copies, titles, activeLoans, overdueLoans, loans30, loansPrev30, borrowers30, fines, circulation] = await Promise.all([
    prisma.book.aggregate({ _sum: { totalCopies: true, availableCopies: true } }),
    prisma.book.count(),
    prisma.borrowing.count({ where: { returnedAt: null, status: { not: 'LOST' } } }),
    prisma.borrowing.count({ where: { returnedAt: null, status: { not: 'LOST' }, dueDate: { lt: now } } }),
    prisma.borrowing.count({ where: { issuedAt: { gte: d30 } } }),
    prisma.borrowing.count({ where: { issuedAt: { gte: d60, lt: d30 } } }),
    prisma.borrowing.findMany({ where: { issuedAt: { gte: d30 } }, select: { studentId: true, staffId: true }, distinct: ['studentId', 'staffId'] }),
    getLibraryFines(1),
    getLibraryCirculation(90),
  ])

  const totalCopies = num(copies._sum.totalCopies)
  const available = num(copies._sum.availableCopies)
  const overdueRate = ratioPct(overdueLoans, activeLoans)

  const kpis = [
    kpi({ key: 'titles', label: 'Titles', value: titles, unit: 'count', description: 'Distinct titles in the catalogue.', subLabel: `${totalCopies.toLocaleString('en-US')} copies` }),
    kpi({ key: 'availability', label: 'Copies available', value: ratioPct(available, totalCopies), unit: 'percent', description: 'Copies on the shelf divided by total copies owned.', subLabel: `${available.toLocaleString('en-US')} of ${totalCopies.toLocaleString('en-US')}` }),
    kpi({ key: 'activeLoans', label: 'Books on loan', value: activeLoans, unit: 'count', description: 'Loans issued and not yet returned (excluding lost).' }),
    thresholdKpi('libraryOverdueRate', { key: 'overdueRate', label: 'Overdue rate', value: overdueRate, unit: 'percent', description: 'Open loans past their due date divided by all open loans.', subLabel: `${overdueLoans} overdue`, href: '/reports?tab=circulation' }),
    kpi({ key: 'loans30', label: 'Loans (30 days)', value: loans30, unit: 'count', description: 'Books issued in the last 30 days.', comparison: compare(loans30, loansPrev30, 'vs previous 30 days'), href: '/reports?tab=circulation' }),
    kpi({ key: 'activeBorrowers', label: 'Active borrowers', value: borrowers30.length, unit: 'count', description: 'Distinct students and staff who borrowed in the last 30 days.' }),
    kpi({ key: 'onTime', label: 'Returned on time', value: circulation.onTimeRate, unit: 'percent', description: 'Loans returned by their due date, over the last 90 days.' }),
    kpi({ key: 'finesPending', label: 'Fines pending', value: fines.pendingAmount, unit: 'mwk', description: 'Library fines assessed and not yet paid or waived.', subLabel: `${fines.pendingCount} fines`, status: fines.pendingAmount > 0 ? 'watch' : 'healthy', href: '/reports?tab=fines' }),
  ]

  const insights: ReportInsight[] = compact([overdueInsight(overdueLoans, 'loan', '/reports?tab=circulation')])
  return {
    key: 'library-overview',
    title: 'Library overview',
    scope: { description: 'Whole catalogue and all borrowers.' },
    kpis,
    insights: sortInsights(insights),
    generatedAt: now.toISOString(),
  }
}

export async function getLibraryAttention(): Promise<AttentionItem[]> {
  const now = new Date()
  const [overdueSevere, overdueAny, pendingApprovals, lost, lowStock] = await Promise.all([
    prisma.borrowing.count({ where: { returnedAt: null, status: { not: 'LOST' }, dueDate: { lt: subDays(now, 30) } } }),
    prisma.borrowing.count({ where: { returnedAt: null, status: { not: 'LOST' }, dueDate: { lt: now } } }),
    prisma.digitalResource.count({ where: { approved: false } }),
    prisma.borrowing.count({ where: { status: 'LOST' } }),
    prisma.book.count({ where: { availableCopies: 0 } }),
  ])
  const items: AttentionItem[] = [
    { key: 'overdue-severe', severity: 'critical', label: 'Loans more than 30 days overdue', count: overdueSevere, href: '/reports?tab=circulation' },
    { key: 'overdue', severity: 'watch', label: 'Loans overdue', count: overdueAny - overdueSevere, href: '/reports?tab=circulation' },
    { key: 'unapproved-digital', severity: 'info', label: 'Digital resources awaiting approval', count: pendingApprovals, href: '/library' },
    { key: 'no-copies', severity: 'info', label: 'Titles with no copy available', count: lowStock, href: '/library' },
    { key: 'lost', severity: 'info', label: 'Copies recorded as lost', count: lost, href: '/library' },
  ]
  const order = { critical: 0, watch: 1, info: 2, positive: 3 } as const
  return items.filter((i) => (i.count ?? 0) > 0).sort((a, b) => order[a.severity] - order[b.severity])
}
