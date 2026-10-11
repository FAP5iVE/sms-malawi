/**
 * hrAnalytics.ts — workforce reporting over StaffProfile / LeaveRequest /
 * StaffLoan / PerformanceReview / StaffPromotion.
 *
 * Leave is measured in DAYS (LeaveRequest.days), never in number of requests,
 * so the figure answers "how much leave was consumed". Staff turnover and staff
 * attendance are NOT reported: the schema keeps no separation date or daily
 * staff attendance, and a number derived from status alone would be fabricated.
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import { SETTING_KEYS } from '@shared/types/settings'
import * as settingsService from '@/server/services/settingsService'
import type { AttentionItem, ReportInsight, ReportSectionData } from '@shared/types/reporting'
import type {
  ApiContractRow,
  ApiHrContracts,
  ApiHrLeave,
  ApiHrLoans,
  ApiHrPromotions,
  ApiHrReviews,
  ApiHrWorkforce,
} from '@shared/types/reporting-hr'
import {
  MONTH_LABELS,
  SCORE_BAND_ORDER,
  TENURE_LABELS,
  contractWindow,
  countBy,
  daysToExpiry,
  distributeLeaveDays,
  scoreBand,
  tenureBand,
} from './hrLogic'
import { kpi, mean, ratioPct, round, daysBetween } from '@/server/services/reporting/kpi'
import { compact, expiryInsight, sortInsights } from '@/server/services/reporting/insights'

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const fullName = (s: { firstName: string; lastName: string }) => `${s.firstName} ${s.lastName}`
const pretty = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())

const LOAN_ACTIVE = ['DISBURSED', 'REPAYING'] as const
const NOT_TERMINATED = { status: { not: 'TERMINATED' as const } }

async function lookahead(): Promise<number> {
  return settingsService.get(SETTING_KEYS.HR_CONTRACT_EXPIRY_LOOKAHEAD_DAYS)
}

// ─── WORKFORCE ───────────────────────────────────────────────────────────────

export async function getHrWorkforce(): Promise<ApiHrWorkforce> {
  const now = new Date()
  const staff = await prisma.staffProfile.findMany({
    where: NOT_TERMINATED,
    select: { status: true, employmentType: true, role: true, department: true, sex: true, dateJoined: true },
  })

  const withSex = staff.filter((s) => s.sex !== null).length
  return {
    headcount: staff.length,
    byStatus: countBy(staff, (s) => pretty(s.status)),
    byEmploymentType: countBy(staff, (s) => pretty(s.employmentType)),
    byRole: countBy(staff, (s) => pretty(s.role)).sort((a, b) => b.count - a.count),
    byDepartment: countBy(staff, (s) => s.department).sort((a, b) => b.count - a.count),
    bySex: countBy(staff, (s) => (s.sex === 'MALE' ? 'Male' : s.sex === 'FEMALE' ? 'Female' : 'Not recorded')),
    byTenure: countBy(staff, (s) => tenureBand(s.dateJoined, now), TENURE_LABELS),
    sexRecordedShare: ratioPct(withSex, staff.length),
  }
}

// ─── CONTRACTS ───────────────────────────────────────────────────────────────

export async function getHrContracts(): Promise<ApiHrContracts> {
  const now = new Date()
  const days = await lookahead()
  const horizon = Math.max(days, 90)
  const cutoff = new Date(now.getTime() + horizon * 86_400_000)

  const [staff, noExpiry] = await Promise.all([
    prisma.staffProfile.findMany({
      where: { ...NOT_TERMINATED, contractExpiry: { lte: cutoff } },
      select: {
        id: true, employeeNo: true, firstName: true, lastName: true, department: true,
        jobTitle: true, employmentType: true, contractExpiry: true,
      },
      orderBy: { contractExpiry: 'asc' },
    }),
    prisma.staffProfile.count({ where: { ...NOT_TERMINATED, contractExpiry: null } }),
  ])

  const rows: ApiContractRow[] = []
  for (const s of staff) {
    if (!s.contractExpiry) continue
    const d = daysToExpiry(s.contractExpiry, now)
    const window = contractWindow(d)
    if (!window) continue
    rows.push({
      staffId: s.id,
      employeeNo: s.employeeNo,
      name: fullName(s),
      department: s.department,
      jobTitle: s.jobTitle,
      employmentType: pretty(s.employmentType),
      contractExpiry: s.contractExpiry.toISOString(),
      daysToExpiry: d,
      window,
    })
  }

  const count = (k: ApiContractRow['window']) => rows.filter((r) => r.window === k).length
  return {
    lookaheadDays: days,
    noExpiryRecorded: noExpiry,
    windows: [
      { key: 'expired', label: 'Expired, still active', count: count('expired') },
      { key: 'd30', label: 'Within 30 days', count: count('d30') },
      { key: 'd60', label: '31–60 days', count: count('d60') },
      { key: 'd90', label: '61–90 days', count: count('d90') },
    ],
    rows,
  }
}

// ─── LEAVE (DAYS) ────────────────────────────────────────────────────────────

export async function getHrLeave(year: number): Promise<ApiHrLeave> {
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59))
  const today = new Date()

  const [approved, pending, onLeave, decided] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { status: 'APPROVED', startDate: { lte: yearEnd }, endDate: { gte: yearStart } },
      select: {
        leaveType: true, startDate: true, endDate: true, days: true,
        staff: { select: { department: true } },
      },
    }),
    prisma.leaveRequest.aggregate({
      where: { status: 'PENDING' },
      _count: { _all: true },
      _sum: { days: true },
    }),
    prisma.leaveRequest.findMany({
      where: { status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } },
      select: {
        leaveType: true, endDate: true,
        staff: { select: { id: true, firstName: true, lastName: true, department: true } },
      },
    }),
    prisma.leaveRequest.findMany({
      where: { status: { in: ['APPROVED', 'REJECTED'] }, reviewedAt: { not: null, gte: yearStart, lte: yearEnd } },
      select: { createdAt: true, reviewedAt: true },
    }),
  ])

  const byType = new Map<string, { days: number; requests: number }>()
  const byDept = new Map<string, number>()
  const byMonth = new Array<number>(12).fill(0)
  let totalDays = 0

  for (const r of approved) {
    const spread = distributeLeaveDays(r.startDate, r.endDate, r.days, year)
    const inYear = spread.reduce((a, b) => a + b, 0)
    totalDays += inYear
    spread.forEach((v, i) => {
      byMonth[i] = (byMonth[i] ?? 0) + v
    })
    const t = byType.get(r.leaveType) ?? { days: 0, requests: 0 }
    t.days += inYear
    t.requests += 1
    byType.set(r.leaveType, t)
    byDept.set(r.staff.department, (byDept.get(r.staff.department) ?? 0) + inYear)
  }

  const decisionDays = decided
    .filter((d): d is { createdAt: Date; reviewedAt: Date } => d.reviewedAt !== null)
    .map((d) => daysBetween(d.createdAt, d.reviewedAt))
    .filter((d) => d >= 0)

  return {
    year,
    approvedDays: round(totalDays, 1),
    approvedRequests: approved.length,
    pendingRequests: pending._count._all,
    pendingDays: num(pending._sum.days),
    byType: Array.from(byType.entries())
      .map(([leaveType, v]) => ({ leaveType: pretty(leaveType), days: round(v.days, 1), requests: v.requests }))
      .sort((a, b) => b.days - a.days),
    byDepartment: Array.from(byDept.entries())
      .map(([department, days]) => ({ department, days: round(days, 1) }))
      .sort((a, b) => b.days - a.days),
    byMonth: byMonth.map((days, i) => ({ month: i + 1, label: MONTH_LABELS[i] ?? '', days: round(days, 1) })),
    onLeaveToday: onLeave.map((l) => ({
      staffId: l.staff.id,
      name: fullName(l.staff),
      department: l.staff.department,
      leaveType: pretty(l.leaveType),
      endDate: l.endDate.toISOString(),
    })),
    avgDecisionDays: mean(decisionDays),
  }
}

// ─── LOANS ───────────────────────────────────────────────────────────────────

export async function getHrLoans(): Promise<ApiHrLoans> {
  const loans = await prisma.staffLoan.findMany({
    where: { status: { in: ['PENDING', 'APPROVED', 'DISBURSED', 'REPAYING'] } },
    select: {
      id: true, amount: true, balance: true, monthlyDeduction: true, totalRepaid: true, status: true,
      staff: { select: { id: true, firstName: true, lastName: true } },
    },
  })

  const active = loans.filter((l) => (LOAN_ACTIVE as readonly string[]).includes(l.status))
  const pending = loans.filter((l) => l.status === 'PENDING')
  const byStatus = new Map<string, { count: number; amount: number }>()
  for (const l of loans) {
    const s = byStatus.get(l.status) ?? { count: 0, amount: 0 }
    s.count += 1
    s.amount += num(l.amount)
    byStatus.set(l.status, s)
  }

  return {
    activeCount: active.length,
    outstandingBalance: round(active.reduce((s, l) => s + num(l.balance), 0), 2),
    monthlyDeductions: round(active.reduce((s, l) => s + num(l.monthlyDeduction), 0), 2),
    pendingApprovals: pending.length,
    pendingAmount: round(pending.reduce((s, l) => s + num(l.amount), 0), 2),
    byStatus: Array.from(byStatus.entries()).map(([status, v]) => ({
      status: pretty(status), count: v.count, amount: round(v.amount, 2),
    })),
    rows: loans
      .map((l) => ({
        loanId: l.id,
        staffId: l.staff.id,
        name: fullName(l.staff),
        amount: num(l.amount),
        balance: num(l.balance),
        monthlyDeduction: num(l.monthlyDeduction),
        status: pretty(l.status),
        repaidShare: ratioPct(num(l.totalRepaid), num(l.amount)),
      }))
      .sort((a, b) => b.balance - a.balance),
  }
}

// ─── PERFORMANCE REVIEWS ─────────────────────────────────────────────────────

export async function getHrReviews(academicYear: string): Promise<ApiHrReviews> {
  const [activeStaff, reviews] = await Promise.all([
    prisma.staffProfile.count({ where: { status: { in: ['ACTIVE', 'ON_LEAVE'] } } }),
    prisma.performanceReview.findMany({
      where: { academicYear },
      select: { staffId: true, status: true, overallScore: true },
    }),
  ])

  const completed = reviews.filter((r) => r.status === 'SUBMITTED' || r.status === 'ACKNOWLEDGED')
  const completedStaff = new Set(completed.map((r) => r.staffId))
  const scored = completed.map((r) => num(r.overallScore)).filter((s) => s > 0)

  return {
    academicYear,
    activeStaff,
    reviewed: completedStaff.size,
    completionRate: ratioPct(completedStaff.size, activeStaff),
    byStatus: countBy(reviews, (r) => pretty(r.status), ['Draft', 'Submitted', 'Acknowledged']),
    averageScore: mean(scored, 2),
    scoreBands: countBy(scored, (s) => scoreBand(s), SCORE_BAND_ORDER),
  }
}

// ─── PROMOTIONS ──────────────────────────────────────────────────────────────

export async function getHrPromotions(): Promise<ApiHrPromotions> {
  const yearStart = new Date(new Date().getFullYear(), 0, 1)
  const [pending, approved, rejected, recent] = await Promise.all([
    prisma.staffPromotion.count({ where: { status: 'PENDING' } }),
    prisma.staffPromotion.count({ where: { status: 'APPROVED', effectiveDate: { gte: yearStart } } }),
    prisma.staffPromotion.count({ where: { status: 'REJECTED', createdAt: { gte: yearStart } } }),
    prisma.staffPromotion.findMany({
      orderBy: { effectiveDate: 'desc' },
      take: 20,
      select: { id: true, staffId: true, fromJobTitle: true, toJobTitle: true, effectiveDate: true, status: true },
    }),
  ])

  // StaffPromotion keeps only a plain staffId (no relation), so resolve names in one query.
  const staff = await prisma.staffProfile.findMany({
    where: { id: { in: [...new Set(recent.map((r) => r.staffId))] } },
    select: { id: true, firstName: true, lastName: true },
  })
  const names = new Map(staff.map((s) => [s.id, fullName(s)]))

  return {
    pending,
    approvedThisYear: approved,
    rejectedThisYear: rejected,
    recent: recent.map((r) => ({
      id: r.id,
      name: names.get(r.staffId) ?? 'Staff member',
      fromJobTitle: r.fromJobTitle,
      toJobTitle: r.toJobTitle,
      effectiveDate: r.effectiveDate.toISOString(),
      status: pretty(r.status),
    })),
  }
}

// ─── OVERVIEW + ATTENTION ────────────────────────────────────────────────────

export async function getHrOverview(academicYear: string): Promise<ReportSectionData> {
  const year = new Date().getFullYear()
  const [workforce, contracts, leave, loans, reviews, promotions] = await Promise.all([
    getHrWorkforce(),
    getHrContracts(),
    getHrLeave(year),
    getHrLoans(),
    getHrReviews(academicYear),
    getHrPromotions(),
  ])

  const expired = contracts.windows.find((w) => w.key === 'expired')?.count ?? 0
  const within = contracts.rows.filter((r) => r.window !== 'expired' && r.daysToExpiry <= contracts.lookaheadDays).length

  const kpis = [
    kpi({
      key: 'headcount', label: 'Staff', value: workforce.headcount, unit: 'count',
      description: 'Staff on the payroll register who are not terminated (active, on leave or suspended).',
      href: '/reports?tab=workforce',
    }),
    kpi({
      key: 'onLeaveToday', label: 'On leave today', value: leave.onLeaveToday.length, unit: 'count',
      description: 'Staff with an approved leave request covering today.',
      subLabel: workforce.headcount > 0 ? `${ratioPct(leave.onLeaveToday.length, workforce.headcount) ?? 0}% of staff` : undefined,
      href: '/reports?tab=leave',
    }),
    kpi({
      key: 'expiringContracts', label: 'Contracts expiring', value: within, unit: 'count',
      description: `Active staff whose contract ends within ${contracts.lookaheadDays} days.`,
      status: within > 0 ? 'watch' : 'healthy',
      subLabel: expired > 0 ? `${expired} already expired` : undefined,
      href: '/reports?tab=contracts',
    }),
    kpi({
      key: 'pendingLeave', label: 'Leave awaiting decision', value: leave.pendingRequests, unit: 'count',
      description: 'Leave requests submitted and not yet approved or rejected.',
      subLabel: leave.pendingDays > 0 ? `${leave.pendingDays} days requested` : undefined,
      status: leave.pendingRequests > 0 ? 'watch' : 'healthy',
      href: '/hr',
    }),
    kpi({
      key: 'loanExposure', label: 'Staff loan balance', value: loans.activeCount > 0 ? loans.outstandingBalance : 0, unit: 'mwk',
      description: 'Outstanding balance on disbursed and repaying staff loans.',
      subLabel: `${loans.activeCount} active loan${loans.activeCount === 1 ? '' : 's'}`,
      href: '/reports?tab=loans',
    }),
    kpi({
      key: 'reviewCompletion', label: 'Reviews completed', value: reviews.completionRate, unit: 'percent',
      description: `Staff with a submitted or acknowledged performance review for ${academicYear}, divided by active staff.`,
      subLabel: `${reviews.reviewed} of ${reviews.activeStaff} staff`,
      status: reviews.completionRate === null ? 'neutral' : reviews.completionRate >= 80 ? 'healthy' : reviews.completionRate >= 50 ? 'watch' : 'critical',
      href: '/reports?tab=reviews',
    }),
    kpi({
      key: 'leaveDays', label: 'Leave days taken', value: leave.approvedDays, unit: 'days',
      description: `Approved leave days falling in ${year}, summed from request days (not request counts).`,
      href: '/reports?tab=leave',
    }),
    kpi({
      key: 'pendingPromotions', label: 'Promotions pending', value: promotions.pending, unit: 'count',
      description: 'Staff promotions awaiting approval.',
      status: promotions.pending > 0 ? 'watch' : 'healthy',
      href: '/reports?tab=workforce',
    }),
  ]

  const insights: ReportInsight[] = compact([
    expired > 0
      ? {
          key: 'contracts-expired', severity: 'critical' as const,
          title: `${expired} active staff have an expired contract`,
          detail: 'Renew the contract or update the staff record.', href: '/reports?tab=contracts',
        }
      : null,
    expiryInsight(within, 'contract', contracts.lookaheadDays, '/reports?tab=contracts'),
    reviews.completionRate !== null && reviews.completionRate < 50
      ? {
          key: 'reviews-low', severity: 'watch' as const,
          title: `Only ${reviews.completionRate}% of staff reviews are complete`,
          detail: `${reviews.activeStaff - reviews.reviewed} staff have no submitted review for ${academicYear}.`,
          href: '/reports?tab=reviews',
        }
      : null,
    workforce.sexRecordedShare !== null && workforce.sexRecordedShare < 80
      ? {
          key: 'sex-data', severity: 'info' as const,
          title: 'Gender is recorded for only some staff',
          detail: `${workforce.sexRecordedShare}% of staff have it recorded, so gender splits are incomplete.`,
        }
      : null,
  ])

  return {
    key: 'hr-overview',
    title: 'Workforce overview',
    scope: { academicYear, description: 'All staff who are not terminated.' },
    kpis,
    insights: sortInsights(insights),
    generatedAt: new Date().toISOString(),
  }
}

export async function getHrAttention(academicYear: string): Promise<AttentionItem[]> {
  const [contracts, leave, loans, reviews, promotions] = await Promise.all([
    getHrContracts(),
    getHrLeave(new Date().getFullYear()),
    getHrLoans(),
    getHrReviews(academicYear),
    getHrPromotions(),
  ])
  const expired = contracts.windows.find((w) => w.key === 'expired')?.count ?? 0
  const soon = contracts.rows.filter((r) => r.window !== 'expired' && r.daysToExpiry <= contracts.lookaheadDays).length
  const overdueReviews = Math.max(0, reviews.activeStaff - reviews.reviewed)

  const items: AttentionItem[] = [
    { key: 'contracts-expired', severity: 'critical', label: 'Contracts already expired (staff still active)', count: expired, href: '/reports?tab=contracts' },
    { key: 'contracts-soon', severity: 'watch', label: `Contracts expiring within ${contracts.lookaheadDays} days`, count: soon, href: '/reports?tab=contracts' },
    { key: 'leave-pending', severity: 'watch', label: 'Leave requests awaiting a decision', count: leave.pendingRequests, href: '/hr' },
    { key: 'loans-pending', severity: 'watch', label: 'Staff loans awaiting approval', count: loans.pendingApprovals, href: '/hr' },
    { key: 'promotions-pending', severity: 'info', label: 'Promotions awaiting approval', count: promotions.pending, href: '/hr' },
    { key: 'reviews-outstanding', severity: 'info', label: `Staff without a completed ${academicYear} review`, count: overdueReviews, href: '/reports?tab=reviews' },
  ]
  const order = { critical: 0, watch: 1, info: 2, positive: 3 } as const
  return items.filter((i) => (i.count ?? 0) > 0).sort((a, b) => order[a.severity] - order[b.severity])
}

