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
import type { ApiExecutiveGroup, ApiExecutiveOverview, ApiRetention, ApiRetentionFormRow } from '@shared/types/reporting-executive'
import { getTermDatesForYear } from '@shared/constants/malawi/academic'
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
import { CLASS_PASS_FLOOR, enrichAttention, rankAttention, selectLowPassClasses, selectPrimaryKpis, selectWeakestClass } from './executiveLogic'

export interface ExecutiveAccess {
  finance: boolean
  hr: boolean
  library: boolean
  admissions: boolean
  attendance: boolean
  exams: boolean
  operations: boolean
}

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

  // A genuine 0% pass rate is a real result and must be flagged; only classes
  // with no students or no computed results (passRate === null) are skipped.
  const lowPassClasses = selectLowPassClasses(classes ?? [])

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
        description: `Classes with students and a computed term pass rate below ${CLASS_PASS_FLOOR}% — including a genuine 0%. Classes with no computed results are not counted.`,
        status: !classes || !stats || stats.assessed === 0 ? 'neutral' : lowPassClasses.length > 0 ? 'watch' : 'healthy', href: '/reports?tab=classes',
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

  const weakest = selectWeakestClass(classes ?? [])
  const insights: ReportInsight[] = sortInsights(compact([
    passRateInsight(stats?.passRate ?? null, weakest ? weakest.className : null, '/reports?tab=classes'),
    ...[admissions, attendance, finance, hr, library, exams].flatMap((s) => (s?.insights ?? []).filter((i) => i.severity === 'critical')),
  ])).slice(0, 8)

  const groups = [academic, students, financeGroup, operations].filter((g) => g.kpis.length > 0)

  return {
    academicYear,
    term,
    primary: selectPrimaryKpis(groups),
    groups,
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

  const low = selectLowPassClasses(classes).length
  const own: AttentionItem[] = [
    { key: 'classes-low-pass', severity: 'watch', label: `Classes with a pass rate under ${CLASS_PASS_FLOOR}%`, count: low, href: '/reports?tab=classes' },
    { key: 'variances-open', severity: 'watch', label: 'Unresolved stocktake variances', count: variance?.unresolved ?? 0, href: '/reports?tab=stocktake' },
  ]

  return enrichAttention(rankAttention([...own, ...admissions, ...attendance, ...finance, ...hr, ...library, ...exams])).slice(0, 12)
}

// ─── RETENTION (repetition + exits) ──────────────────────────────────────────

/**
 * Repetition rate by form (from the year outcomes written at promotion commit)
 * and exits by reason inside the academic year's term window. The window comes
 * from the school's own term dates, not a hard-coded calendar. Counts only: no
 * student is named, and nothing here reads welfare data.
 */
export async function getRetention(academicYear: string): Promise<ApiRetention> {
  const terms = getTermDatesForYear(academicYear)
  const windowStart = terms[0]!.start
  const windowEnd = terms[terms.length - 1]!.end
  const from = new Date(`${windowStart}T00:00:00Z`)
  const toExclusive = new Date(new Date(`${windowEnd}T00:00:00Z`).getTime() + 86_400_000)

  const [outcomes, repeaterGroups, exitGroups, archivedNoRecord] = await Promise.all([
    prisma.studentYearOutcome.groupBy({
      by: ['form', 'outcome'],
      where: { academicYear },
      _count: { _all: true },
    }),
    prisma.studentYearOutcome.groupBy({
      by: ['studentId'],
      where: { outcome: 'REPEATED' },
      _count: { _all: true },
      having: { studentId: { _count: { gte: 2 } } },
    }),
    prisma.student.groupBy({
      by: ['exitReason'],
      where: { status: 'ARCHIVED', exitDate: { gte: from, lt: toExclusive } },
      _count: { _all: true },
    }),
    prisma.student.count({ where: { status: 'ARCHIVED', OR: [{ exitReason: null }, { exitDate: null }] } }),
  ])

  const byForm = new Map<number, ApiRetentionFormRow>()
  for (const o of outcomes) {
    const row = byForm.get(o.form) ?? { form: o.form, students: 0, promoted: 0, repeated: 0, awaitingManeb: 0, graduated: 0, repetitionRate: null }
    const n = o._count._all
    row.students += n
    if (o.outcome === 'PROMOTED') row.promoted += n
    else if (o.outcome === 'REPEATED') row.repeated += n
    else if (o.outcome === 'AWAITING_MANEB') row.awaitingManeb += n
    else if (o.outcome === 'GRADUATED') row.graduated += n
    byForm.set(o.form, row)
  }
  const repetitionByForm = [...byForm.values()]
    .map((r) => ({ ...r, repetitionRate: ratioPct(r.repeated, r.students) }))
    .sort((a, b) => a.form - b.form)

  const byReason = exitGroups
    .map((g) => ({ reason: g.exitReason ?? 'NOT_RECORDED', count: g._count._all }))
    .sort((a, b) => b.count - a.count)

  return {
    academicYear,
    repetitionByForm,
    multiYearRepeaters: repeaterGroups.length,
    exits: {
      total: byReason.reduce((sum, r) => sum + r.count, 0),
      byReason,
      windowStart,
      windowEnd,
    },
    archivedWithoutExitRecord: archivedNoRecord,
  }
}
