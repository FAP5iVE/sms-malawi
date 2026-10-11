/**
 * admissionsAnalytics.ts — applications pipeline and student-registry reporting.
 *
 * Complements analyticsService.getLowerRank* (funnel / monthly trend /
 * enrollment-by-form, kept as-is) with turnaround times, backlog aging,
 * conversion rates, demographic breakdowns and record-quality counts.
 *
 * Application.reviewedAt is overwritten on every status change (including
 * conversion to a student), so decision timing comes from the audit trail
 * (application.approved / denied / reviewed), not from reviewedAt.
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import type { AttentionItem, ReportInsight, ReportSectionData } from '@shared/types/reporting'
import type {
  ApiAdmissionsPipeline, ApiEnrollment, ApiLabelCount,
} from '@shared/types/reporting-admissions'
import { getTermDateRange } from '@/server/services/attendanceService'
import {
  DECISION_ACTIONS, PENDING_AGE_BUCKETS, approvalToAdmissionDays, firstApprovals, firstDecisions,
  pendingAgeBucket, pipelineRates, reviewTimes, topWithOther, type DecisionEvent,
} from './admissionsLogic'
import { lastMonths, monthKey } from './libraryLogic'
import { daysBetween, kpi, ratioPct, thresholdKpi } from '@/server/services/reporting/kpi'
import { compact, sortInsights } from '@/server/services/reporting/insights'

const STATUS_ORDER = ['PENDING', 'APPROVED', 'AWAITING_ADMISSION', 'ADMITTED', 'DENIED'] as const
const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending review',
  APPROVED: 'Approved',
  AWAITING_ADMISSION: 'Awaiting admission',
  ADMITTED: 'Admitted',
  DENIED: 'Denied',
}
const STUDENT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active',
  AWAITING_MANEB_RESULTS: 'Awaiting MANEB results',
  GRADUATED: 'Graduated',
  ARCHIVED: 'Archived',
}
const SEX_LABEL: Record<string, string> = { MALE: 'Male', FEMALE: 'Female' }

const tallyBy = <T,>(items: readonly T[], key: (i: T) => string | null | undefined): ApiLabelCount[] =>
  topWithOther(items.map(key), 12)

export async function getAdmissionsPipeline(windowMonths = 12): Promise<ApiAdmissionsPipeline> {
  const now = new Date()
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (windowMonths - 1), 1))

  const [apps, backlogRows, events] = await Promise.all([
    prisma.application.findMany({
      where: { createdAt: { gte: since } },
      select: {
        id: true, status: true, createdAt: true, reviewedAt: true, applyingForForm: true,
        district: true, sex: true, previousSchool: true,
      },
    }),
    prisma.application.findMany({
      where: { status: { in: ['PENDING', 'AWAITING_ADMISSION'] } },
      select: { status: true, createdAt: true },
    }),
    prisma.auditLog.findMany({
      where: { entityType: 'Application', action: { in: [...DECISION_ACTIONS] }, createdAt: { gte: since } },
      select: { entityId: true, action: true, createdAt: true },
    }),
  ])

  const decisionEvents: DecisionEvent[] = events.map((e) => ({
    applicationId: e.entityId, action: e.action, at: e.createdAt,
  }))

  const counts: Record<string, number> = {}
  apps.forEach((a) => { counts[a.status] = (counts[a.status] ?? 0) + 1 })
  const rates = pipelineRates(counts)
  const review = reviewTimes(apps, firstDecisions(decisionEvents))

  const pending = backlogRows.filter((b) => b.status === 'PENDING')
  const pendingAging = PENDING_AGE_BUCKETS.map((label) => ({ label, count: 0 }))
  pending.forEach((p) => {
    const bucket = pendingAgeBucket(daysBetween(p.createdAt, now))
    const row = pendingAging.find((r) => r.label === bucket)
    if (row) row.count += 1
  })
  const oldest = pending.reduce<number | null>((acc, p) => {
    const age = daysBetween(p.createdAt, now)
    return acc === null || age > acc ? age : acc
  }, null)

  const months = lastMonths(windowMonths, now)
  const trendMap = new Map(months.map((m) => [m.key, { label: m.label, received: 0, admitted: 0 }]))
  apps.forEach((a) => {
    const row = trendMap.get(monthKey(a.createdAt))
    if (!row) return
    row.received += 1
    if (a.status === 'ADMITTED') row.admitted += 1
  })

  const forms = [1, 2, 3, 4].map((form) => {
    const f = apps.filter((a) => a.applyingForForm === form)
    return {
      form, label: `Form ${form}`, received: f.length, admitted: f.filter((a) => a.status === 'ADMITTED').length,
    }
  })

  return {
    windowMonths,
    received: apps.length,
    byStatus: STATUS_ORDER.map((status) => ({
      status,
      label: STATUS_LABEL[status] ?? status,
      count: counts[status] ?? 0,
      pct: ratioPct(counts[status] ?? 0, apps.length),
    })),
    ...rates,
    avgReviewDays: review.avg,
    medianReviewDays: review.median,
    avgApprovalToAdmissionDays: approvalToAdmissionDays(apps, firstApprovals(decisionEvents)),
    backlog: {
      pending: pending.length,
      awaitingAdmission: backlogRows.length - pending.length,
      pendingAging,
      oldestPendingDays: oldest,
    },
    trend: Array.from(trendMap.values()),
    byForm: forms,
    byDistrict: tallyBy(apps, (a) => a.district),
    bySex: tallyBy(apps, (a) => SEX_LABEL[a.sex] ?? a.sex),
    topPreviousSchools: topWithOther(apps.map((a) => a.previousSchool), 8).filter((r) => r.label !== 'Other'),
  }
}

export async function getEnrollment(academicYear: string): Promise<ApiEnrollment> {
  const now = new Date()
  const yearStart = getTermDateRange(academicYear, 1).start
  const trendSince = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1))

  const [byStatusRows, classes, activeStudents, newThisYear, recent, noClass, noGuardianPhone] = await Promise.all([
    prisma.student.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.class.findMany({
      where: { academicYear, status: 'ACTIVE' },
      select: { id: true, name: true, form: true, _count: { select: { students: { where: { status: 'ACTIVE' } } } } },
      orderBy: [{ form: 'asc' }, { name: 'asc' }],
    }),
    prisma.student.findMany({
      where: { status: 'ACTIVE' },
      select: { sex: true, district: true, class: { select: { form: true } } },
    }),
    prisma.student.count({ where: { status: 'ACTIVE', createdAt: { gte: yearStart } } }),
    prisma.student.findMany({ where: { createdAt: { gte: trendSince } }, select: { createdAt: true } }),
    prisma.student.count({ where: { status: 'ACTIVE', classId: null } }),
    prisma.student.count({ where: { status: 'ACTIVE', guardianPhone: '' } }),
  ])

  const statusCount = (s: string) => byStatusRows.find((r) => r.status === s)?._count._all ?? 0
  const active = statusCount('ACTIVE')

  const byForm = [1, 2, 3, 4].map((form) => {
    const inForm = activeStudents.filter((s) => s.class?.form === form)
    return {
      form,
      label: `Form ${form}`,
      students: inForm.length,
      male: inForm.filter((s) => s.sex === 'MALE').length,
      female: inForm.filter((s) => s.sex === 'FEMALE').length,
    }
  })

  const months = lastMonths(12, now)
  const trend = new Map(months.map((m) => [m.key, { label: m.label, registered: 0 }]))
  recent.forEach((s) => {
    const row = trend.get(monthKey(s.createdAt))
    if (row) row.registered += 1
  })

  return {
    academicYear,
    totalRecords: byStatusRows.reduce((s, r) => s + r._count._all, 0),
    active,
    byStatus: (['ACTIVE', 'AWAITING_MANEB_RESULTS', 'GRADUATED', 'ARCHIVED'] as const).map((status) => ({
      status, label: STUDENT_STATUS_LABEL[status] ?? status, count: statusCount(status),
    })),
    byForm,
    byClass: classes.map((c) => ({ classId: c.id, className: c.name, form: c.form, students: c._count.students })),
    bySex: tallyBy(activeStudents, (s) => SEX_LABEL[s.sex] ?? s.sex),
    byDistrict: tallyBy(activeStudents, (s) => s.district),
    newThisYear,
    returning: Math.max(0, active - newThisYear),
    registrationTrend: Array.from(trend.values()),
    records: {
      activeWithoutClass: noClass,
      missingGuardianPhone: noGuardianPhone,
      awaitingManeb: statusCount('AWAITING_MANEB_RESULTS'),
    },
  }
}

export interface AdmissionsOverviewExtras {
  /** Classes under the attendance threshold, supplied by the route when the caller may see attendance. */
  lowAttendanceClasses?: number | null
}

export async function getAdmissionsOverview(
  academicYear: string,
  extras: AdmissionsOverviewExtras = {},
): Promise<ReportSectionData> {
  const [pipeline, enrollment] = await Promise.all([getAdmissionsPipeline(12), getEnrollment(academicYear)])
  const recordIssues = enrollment.records.activeWithoutClass + enrollment.records.missingGuardianPhone

  const kpis = [
    kpi({ key: 'active', label: 'Active students', value: enrollment.active, unit: 'count', description: 'Students with status Active.', subLabel: `${enrollment.newThisYear} new this year`, href: '/reports?tab=enrollment' }),
    kpi({ key: 'pending', label: 'Pending applications', value: pipeline.backlog.pending, unit: 'count', description: 'Applications submitted and not yet decided.', status: pipeline.backlog.pending > 0 ? 'watch' : 'healthy', href: '/applications' }),
    kpi({ key: 'awaiting', label: 'Awaiting admission', value: pipeline.backlog.awaitingAdmission, unit: 'count', description: 'Accepted applicants not yet admitted as students.', href: '/applications' }),
    kpi({ key: 'admitted', label: 'Admitted (12 months)', value: pipeline.byStatus.find((s) => s.status === 'ADMITTED')?.count ?? 0, unit: 'count', description: 'Applications converted to a student in the last 12 months.', href: '/reports?tab=admissions' }),
    kpi({ key: 'conversion', label: 'Conversion rate', value: pipeline.conversionRate, unit: 'percent', description: 'Admitted applications ÷ all applications received (12 months).', href: '/reports?tab=admissions' }),
    thresholdKpi('applicationReviewAge', { key: 'oldestPending', label: 'Oldest pending', value: pipeline.backlog.oldestPendingDays, unit: 'days', description: 'Age of the oldest application still waiting for a first decision.' }),
    ...(extras.lowAttendanceClasses !== undefined
      ? [kpi({ key: 'attendanceExceptions', label: 'Classes below 85% attendance', value: extras.lowAttendanceClasses, unit: 'count', description: 'Classes under the attendance threshold this term.', status: (extras.lowAttendanceClasses ?? 0) > 0 ? 'critical' : 'healthy', href: '/reports?tab=attendance' })]
      : []),
    kpi({ key: 'recordIssues', label: 'Records needing attention', value: recordIssues, unit: 'count', description: 'Active students with no class or no guardian phone number.', status: recordIssues > 0 ? 'watch' : 'healthy', href: '/reports?tab=enrollment' }),
  ]

  const oldest = pipeline.backlog.oldestPendingDays
  const insights: ReportInsight[] = compact([
    pipeline.backlog.pending > 0 && oldest !== null && oldest >= 14
      ? { key: 'applications-stale', severity: 'critical', title: `${pipeline.backlog.pending} application${pipeline.backlog.pending === 1 ? '' : 's'} awaiting review`, detail: `The oldest was submitted ${oldest} days ago.`, href: '/applications' }
      : pipeline.backlog.pending > 0 && oldest !== null && oldest >= 7
        ? { key: 'applications-aging', severity: 'watch', title: `${pipeline.backlog.pending} application${pipeline.backlog.pending === 1 ? '' : 's'} awaiting review`, detail: `The oldest was submitted ${oldest} days ago.`, href: '/applications' }
        : null,
    pipeline.backlog.awaitingAdmission > 0
      ? { key: 'applications-awaiting-admission', severity: 'info', title: `${pipeline.backlog.awaitingAdmission} accepted applicant${pipeline.backlog.awaitingAdmission === 1 ? '' : 's'} not yet admitted`, detail: 'Convert them to student records once the family confirms.', href: '/applications' }
      : null,
    enrollment.records.activeWithoutClass > 0
      ? { key: 'students-no-class', severity: 'watch', title: `${enrollment.records.activeWithoutClass} active student${enrollment.records.activeWithoutClass === 1 ? ' has' : 's have'} no class`, detail: 'Assign them to a class so attendance, fees and exams include them.', href: '/students' }
      : null,
  ])

  return {
    key: 'admissions-overview',
    title: 'Admissions & registry overview',
    scope: { academicYear, description: 'All applications and student records.' },
    kpis,
    insights: sortInsights(insights),
    generatedAt: new Date().toISOString(),
  }
}

export async function getAdmissionsAttention(): Promise<AttentionItem[]> {
  const now = new Date()
  const [pendingRows, awaiting, noClass, noGuardianPhone, maneb] = await Promise.all([
    prisma.application.findMany({ where: { status: 'PENDING' }, select: { createdAt: true } }),
    prisma.application.count({ where: { status: 'AWAITING_ADMISSION' } }),
    prisma.student.count({ where: { status: 'ACTIVE', classId: null } }),
    prisma.student.count({ where: { status: 'ACTIVE', guardianPhone: '' } }),
    prisma.student.count({ where: { status: 'AWAITING_MANEB_RESULTS' } }),
  ])
  const stale = pendingRows.filter((p) => daysBetween(p.createdAt, now) >= 14).length
  const items: AttentionItem[] = [
    { key: 'applications-stale', severity: 'critical', label: 'Applications waiting more than 14 days', count: stale, href: '/applications' },
    { key: 'applications-pending', severity: 'watch', label: 'Applications waiting for review', count: pendingRows.length - stale, href: '/applications' },
    { key: 'awaiting-admission', severity: 'watch', label: 'Accepted applicants awaiting admission', count: awaiting, href: '/applications' },
    { key: 'students-no-class', severity: 'watch', label: 'Active students without a class', count: noClass, href: '/students' },
    { key: 'missing-guardian-phone', severity: 'info', label: 'Students missing a guardian phone number', count: noGuardianPhone, href: '/students' },
    { key: 'awaiting-maneb', severity: 'info', label: 'Students awaiting MANEB results', count: maneb, href: '/students' },
  ]
  const order = { critical: 0, watch: 1, info: 2, positive: 3 } as const
  return items.filter((i) => (i.count ?? 0) > 0).sort((a, b) => order[a.severity] - order[b.severity])
}
