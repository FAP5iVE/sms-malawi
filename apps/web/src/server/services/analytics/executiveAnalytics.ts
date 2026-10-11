/**
 * executiveAnalytics.ts — the school-wide management view for high_rank.
 *
 * It does not compute new maths for finance, HR, admissions, attendance,
 * library or exams: it selects headline KPIs from those domains' own overview
 * services, so the executive figure and the domain report can never disagree.
 * Each domain is included only when the caller holds that domain's report
 * permission (ExecutiveAccess); a domain that fails to load is reported as a
 * warning instead of failing the whole view.
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import type { AttentionItem, ReportInsight, ReportKpi, ReportSectionData, ReportWarning } from '@shared/types/reporting'
import type { ApiExecutiveGroup, ApiExecutiveOverview } from '@shared/types/reporting-executive'
import { getHighRankClassComparison } from '@/server/services/analyticsService'
import { getFinanceAttention, getFinanceOverview } from './financeAnalytics'
import { getHrAttention, getHrOverview } from './hrAnalytics'
import { getLibraryAttention, getLibraryOverview } from './libraryAnalytics'
import { getExamAttention, getExamOverview } from './examAnalytics'
import { getAdmissionsAttention, getAdmissionsOverview } from './admissionsAnalytics'
import { getAttendanceAttention, getAttendanceOverview } from './attendanceAnalytics'
import { getStocktakeVariance } from './operationsAnalytics'
import { compare, kpi, previousPeriod, ratioPct, thresholdKpi, mean } from '@/server/services/reporting/kpi'
import { compact, passRateInsight, sortInsights } from '@/server/services/reporting/insights'

export interface ExecutiveAccess {
  finance: boolean
  hr: boolean
  library: boolean
  admissions: boolean
  attendance: boolean
  exams: boolean
  operations: boolean
}

/** A class is flagged when its pass rate is below this. */
const CLASS_PASS_FLOOR = 60

async function safe<T>(label: string, warnings: ReportWarning[], fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch {
    warnings.push({ key: `load-${label}`, message: `${label} figures could not be loaded and are left out.` })
    return null
  }
}

const pick = (section: ReportSectionData | null, keys: readonly string[]): ReportKpi[] =>
  section ? keys.map((k) => section.kpis.find((x) => x.key === k)).filter((k): k is ReportKpi => k !== undefined) : []

interface SchoolTermStats {
  average: number | null
  passRate: number | null
  assessed: number
}

async function schoolTermStats(academicYear: string, term: number): Promise<SchoolTermStats> {
  const rows = await prisma.termResult.findMany({
    where: { academicYear, term },
    select: { average: true, passStatus: true },
  })
  return {
    average: mean(rows.map((r) => Number(r.average))),
    passRate: ratioPct(rows.filter((r) => r.passStatus).length, rows.length),
    assessed: rows.length,
  }
}

export async function getExecutiveOverview(
  academicYear: string,
  term: number,
  access: ExecutiveAccess,
): Promise<ApiExecutiveOverview> {
  const warnings: ReportWarning[] = []
  const prev = previousPeriod(academicYear, term)
  const skipped = Promise.resolve(null)

  const [stats, prevStats, classes, admissions, attendance, finance, hr, library, exams, variance] = await Promise.all([
    safe('Academic', warnings, () => schoolTermStats(academicYear, term)),
    safe('Academic', [], () => schoolTermStats(prev.academicYear, prev.term)),
    safe('Class performance', [], () => getHighRankClassComparison(academicYear, term)),
    access.admissions ? safe('Admissions', warnings, () => getAdmissionsOverview(academicYear)) : skipped,
    access.attendance ? safe('Attendance', warnings, () => getAttendanceOverview(academicYear, term, { kind: 'school' })) : skipped,
    access.finance ? safe('Finance', warnings, () => getFinanceOverview(academicYear, term)) : skipped,
    access.hr ? safe('HR', warnings, () => getHrOverview(academicYear)) : skipped,
    access.library ? safe('Library', warnings, () => getLibraryOverview()) : skipped,
    access.exams ? safe('Examinations', warnings, () => getExamOverview(academicYear, term, { kind: 'school' })) : skipped,
    access.operations ? safe('Stocktake', warnings, () => getStocktakeVariance(academicYear)) : skipped,
  ])

  const lowPassClasses = (classes ?? []).filter((c) => c.studentCount > 0 && c.passRate > 0 && c.passRate < CLASS_PASS_FLOOR)

  const academic: ApiExecutiveGroup = {
    key: 'academic',
    title: 'Academic',
    kpis: [
      thresholdKpi('average', {
        key: 'schoolAverage', label: 'School average', value: stats?.average ?? null, unit: 'percent',
        description: 'Mean term average across every student with a computed result this term.',
        comparison: compare(stats?.average ?? null, prevStats?.average ?? null, 'vs previous term'),
        href: '/reports?tab=performance',
      }),
      thresholdKpi('passRate', {
        key: 'schoolPassRate', label: 'Pass rate', value: stats?.passRate ?? null, unit: 'percent',
        description: 'Students who passed the term ÷ students with a computed result.',
        comparison: compare(stats?.passRate ?? null, prevStats?.passRate ?? null, 'vs previous term'),
        href: '/reports?tab=performance',
      }),
      kpi({ key: 'assessed', label: 'Students assessed', value: stats && stats.assessed > 0 ? stats.assessed : null, unit: 'count', description: 'Students with a computed term result (results are computed after release).' }),
      kpi({
        key: 'lowPassClasses', label: `Classes under ${CLASS_PASS_FLOOR}% pass`, value: classes && stats && stats.assessed > 0 ? lowPassClasses.length : null, unit: 'count',
        description: `Classes with a term pass rate below ${CLASS_PASS_FLOOR}%.`,
        status: lowPassClasses.length > 0 ? 'watch' : 'healthy', href: '/reports?tab=classes',
      }),
      ...pick(exams, ['markCompletion']),
    ],
  }

  const students: ApiExecutiveGroup = {
    key: 'students',
    title: 'Students',
    kpis: [...pick(admissions, ['active', 'pending', 'conversion']), ...pick(attendance, ['attendanceRate', 'lowClasses'])],
  }

  const financeGroup: ApiExecutiveGroup = {
    key: 'finance',
    title: 'Finance',
    kpis: pick(finance, ['collectionRate', 'outstanding', 'overdue', 'pendingExpenses']),
  }

  const operations: ApiExecutiveGroup = {
    key: 'operations',
    title: 'People & operations',
    kpis: [
      ...pick(hr, ['headcount', 'expiringContracts', 'pendingLeave']),
      ...pick(library, ['overdueRate']),
      ...(variance
        ? [kpi({ key: 'unresolvedVariances', label: 'Unresolved stock variances', value: variance.unresolved, unit: 'count', description: 'Stocktake variances still open or under investigation.', status: variance.unresolved > 0 ? 'watch' : 'healthy', href: '/reports?tab=stocktake' })]
        : []),
    ],
  }

  const weakest = (classes ?? []).filter((c) => c.passRate > 0).sort((a, b) => a.passRate - b.passRate)[0]
  const insights: ReportInsight[] = sortInsights(compact([
    passRateInsight(stats?.passRate ?? null, weakest ? weakest.className : null, '/reports?tab=classes'),
    ...[admissions, attendance, finance, hr, library, exams].flatMap((s) => (s?.insights ?? []).filter((i) => i.severity === 'critical')),
  ])).slice(0, 8)

  return {
    academicYear,
    term,
    groups: [academic, students, financeGroup, operations].filter((g) => g.kpis.length > 0),
    insights,
    warnings,
    generatedAt: new Date().toISOString(),
  }
}

export async function getExecutiveAttention(
  academicYear: string,
  term: number,
  access: ExecutiveAccess,
): Promise<AttentionItem[]> {
  const none = (): Promise<AttentionItem[]> => Promise.resolve([])
  const quiet = (fn: () => Promise<AttentionItem[]>) => fn().catch(() => [] as AttentionItem[])

  const [classes, admissions, attendance, finance, hr, library, exams, variance] = await Promise.all([
    getHighRankClassComparison(academicYear, term).catch(() => []),
    access.admissions ? quiet(() => getAdmissionsAttention()) : none(),
    access.attendance ? quiet(() => getAttendanceAttention(academicYear, term, { kind: 'school' })) : none(),
    access.finance ? quiet(() => getFinanceAttention(academicYear, term)) : none(),
    access.hr ? quiet(() => getHrAttention(academicYear)) : none(),
    access.library ? quiet(() => getLibraryAttention()) : none(),
    access.exams ? quiet(() => getExamAttention(academicYear, term, { kind: 'school' })) : none(),
    access.operations ? getStocktakeVariance(academicYear).catch(() => null) : Promise.resolve(null),
  ])

  const low = classes.filter((c) => c.studentCount > 0 && c.passRate > 0 && c.passRate < CLASS_PASS_FLOOR).length
  const own: AttentionItem[] = [
    { key: 'classes-low-pass', severity: 'watch', label: `Classes with a pass rate under ${CLASS_PASS_FLOOR}%`, count: low, href: '/reports?tab=classes' },
    { key: 'variances-open', severity: 'watch', label: 'Unresolved stocktake variances', count: variance?.unresolved ?? 0, href: '/reports?tab=stocktake' },
  ]

  const order = { critical: 0, watch: 1, info: 2, positive: 3 } as const
  return [...own, ...admissions, ...attendance, ...finance, ...hr, ...library, ...exams]
    .filter((i) => (i.count ?? 0) > 0)
    .sort((a, b) => order[a.severity] - order[b.severity])
    .slice(0, 12)
}

