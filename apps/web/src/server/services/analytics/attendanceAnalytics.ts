/**
 * attendanceAnalytics.ts — term attendance reporting, school-wide or scoped to
 * a teacher's classes (class teacher ∪ subject assignments).
 *
 * Complements analyticsService.getSchoolAttendanceSummary (kept as-is for the
 * existing consumers) with trends, weekday patterns, chronic absentees and
 * "classes not marking" detection. LATE counts as attended, matching
 * attendanceService.getAttendanceSummaryForTerm, so every attendance figure in
 * the system agrees for the same term.
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import type { AttentionItem, ReportInsight, ReportSectionData } from '@shared/types/reporting'
import type {
  ApiAttendanceClassRow,
  ApiAttendanceReport,
  ApiChronicAbsentee,
} from '@shared/types/reporting-attendance'
import { getTermDateRange } from '@/server/services/attendanceService'
import { getTeacherSubjectAssignments } from '@/server/services/classService'
import {
  CHRONIC_ABSENCE_PCT, CHRONIC_MIN_DAYS, aggregateWeekdays, aggregateWeeks, attendanceRate, findChronic,
} from './attendanceLogic'
import { compare, kpi, previousPeriod, ratioPct, thresholdKpi } from '@/server/services/reporting/kpi'
import { THRESHOLDS } from '@/server/services/reporting/thresholds'
import { attendanceInsight, compact, sortInsights } from '@/server/services/reporting/insights'

export type AttendanceScope = { kind: 'school' } | { kind: 'teacher'; teacherUid: string }

const CHRONIC_LIST_CAP = 50
/** A class with no register entry for this long (while the term is running) is flagged. */
const STALE_MARKING_DAYS = 7
const DAY_MS = 86_400_000

/** Class ids in scope; null means "every class". */
async function scopedClassIds(scope: AttendanceScope, academicYear: string): Promise<string[] | null> {
  if (scope.kind === 'school') return null
  const [owned, assigned] = await Promise.all([
    prisma.class.findMany({
      where: { teacherId: scope.teacherUid, academicYear },
      select: { id: true },
    }),
    getTeacherSubjectAssignments(scope.teacherUid, academicYear),
  ])
  const ids = new Set(owned.map((c) => c.id))
  assigned.forEach((key) => {
    const classId = key.split('|')[0]
    if (classId) ids.add(classId)
  })
  return Array.from(ids)
}

const describeScope = (scope: AttendanceScope) =>
  scope.kind === 'school' ? 'All classes.' : 'Your classes (as class teacher or subject teacher).'

async function termRate(
  academicYear: string,
  term: number,
  classIds: string[] | null,
): Promise<number | null> {
  const { start, end } = getTermDateRange(academicYear, term)
  const grouped = await prisma.attendance.groupBy({
    by: ['status'],
    where: { date: { gte: start, lte: end }, ...(classIds ? { classId: { in: classIds } } : {}) },
    _count: { _all: true },
  })
  const n = (s: string) => grouped.find((g) => g.status === s)?._count._all ?? 0
  return attendanceRate(n('PRESENT'), n('LATE'), n('ABSENT'))
}

export async function getAttendanceReport(
  academicYear: string,
  term: number,
  scope: AttendanceScope,
): Promise<ApiAttendanceReport> {
  const { start, end } = getTermDateRange(academicYear, term)
  const prev = previousPeriod(academicYear, term)
  const classIds = await scopedClassIds(scope, academicYear)
  const inScope = classIds ? { classId: { in: classIds } } : {}
  const window = { date: { gte: start, lte: end }, ...inScope }

  const [classes, byClassStatus, daily, perStudent, previousRate] = await Promise.all([
    prisma.class.findMany({
      where: { academicYear, status: 'ACTIVE', ...(classIds ? { id: { in: classIds } } : {}) },
      select: {
        id: true, name: true, form: true,
        _count: { select: { students: { where: { status: 'ACTIVE' } } } },
      },
      orderBy: [{ form: 'asc' }, { name: 'asc' }],
    }),
    prisma.attendance.groupBy({
      by: ['classId', 'status'],
      where: window,
      _count: { _all: true },
      _max: { date: true },
    }),
    prisma.attendance.groupBy({
      by: ['date', 'status'],
      where: window,
      _count: { _all: true },
    }),
    prisma.attendance.groupBy({
      by: ['studentId', 'status'],
      where: window,
      _count: { _all: true },
    }),
    termRate(prev.academicYear, prev.term, classIds),
  ])

  const byClass: ApiAttendanceClassRow[] = classes.map((c) => {
    const rows = byClassStatus.filter((g) => g.classId === c.id)
    const n = (s: string) => rows.find((r) => r.status === s)?._count._all ?? 0
    const present = n('PRESENT')
    const late = n('LATE')
    const absent = n('ABSENT')
    const last = rows.reduce<Date | null>((acc, r) => {
      const d = r._max.date
      return d && (!acc || d > acc) ? d : acc
    }, null)
    return {
      classId: c.id,
      className: c.name,
      form: c.form,
      students: c._count.students,
      present,
      late,
      absent,
      attendanceRate: attendanceRate(present, late, absent),
      lastMarked: last ? last.toISOString() : null,
    }
  })

  const present = byClass.reduce((s, c) => s + c.present, 0)
  const late = byClass.reduce((s, c) => s + c.late, 0)
  const absent = byClass.reduce((s, c) => s + c.absent, 0)
  const recorded = present + late + absent

  const dailyCounts = daily.map((d) => ({ date: d.date, status: d.status, count: d._count._all }))
  const chronicRaw = findChronic(
    perStudent.map((p) => ({ studentId: p.studentId, status: p.status, count: p._count._all })),
  ).slice(0, CHRONIC_LIST_CAP)

  let chronic: ApiChronicAbsentee[] = []
  if (chronicRaw.length > 0) {
    const students = await prisma.student.findMany({
      where: { id: { in: chronicRaw.map((c) => c.studentId) } },
      select: { id: true, firstName: true, lastName: true, class: { select: { name: true } } },
    })
    const byId = new Map(students.map((s) => [s.id, s]))
    chronic = chronicRaw.map((c) => {
      const s = byId.get(c.studentId)
      return {
        ...c,
        name: s ? `${s.firstName} ${s.lastName}` : 'Unknown student',
        className: s?.class?.name ?? '—',
      }
    })
  }

  return {
    academicYear,
    term,
    scope: scope.kind,
    present,
    late,
    absent,
    recorded,
    attendanceRate: attendanceRate(present, late, absent),
    lateRate: ratioPct(late, recorded),
    previousRate,
    byClass,
    byWeek: aggregateWeeks(dailyCounts),
    byWeekday: aggregateWeekdays(dailyCounts),
    chronic,
    chronicThresholdPct: CHRONIC_ABSENCE_PCT,
    chronicMinDays: CHRONIC_MIN_DAYS,
  }
}

/** Classes whose register has gone quiet while the term is in progress. */
function staleClasses(report: ApiAttendanceReport, now: Date): ApiAttendanceClassRow[] {
  const { start, end } = getTermDateRange(report.academicYear, report.term)
  if (now < start || now > end) return []
  const cutoff = now.getTime() - STALE_MARKING_DAYS * DAY_MS
  // A class that has never been marked is only "stale" once the term is old enough.
  const termOldEnough = now.getTime() - start.getTime() > STALE_MARKING_DAYS * DAY_MS
  return report.byClass.filter((c) =>
    c.lastMarked === null ? termOldEnough : new Date(c.lastMarked).getTime() < cutoff,
  )
}

export async function getAttendanceOverview(
  academicYear: string,
  term: number,
  scope: AttendanceScope,
): Promise<ReportSectionData> {
  const r = await getAttendanceReport(academicYear, term, scope)
  const now = new Date()
  const low = r.byClass.filter((c) => c.attendanceRate !== null && c.attendanceRate < THRESHOLDS.attendanceRate.critical)
  const stale = staleClasses(r, now)

  const kpis = [
    thresholdKpi('attendanceRate', {
      key: 'attendanceRate', label: 'Attendance rate', value: r.attendanceRate, unit: 'percent',
      description: 'Present plus late records divided by all register entries this term.',
      subLabel: `${r.recorded.toLocaleString('en-US')} entries`,
      comparison: compare(r.attendanceRate, r.previousRate, 'vs previous term'),
      href: '/reports?tab=attendance',
    }),
    kpi({
      key: 'lateRate', label: 'Late arrivals', value: r.lateRate, unit: 'percent',
      description: 'Late records divided by all register entries (late students count as attended).',
    }),
    kpi({
      key: 'absences', label: 'Absences recorded', value: r.recorded === 0 ? null : r.absent, unit: 'count',
      description: 'Absent entries across the term.',
    }),
    kpi({
      key: 'lowClasses', label: 'Classes below 85%', value: r.byClass.length === 0 ? null : low.length, unit: 'count',
      description: `Classes with attendance under ${THRESHOLDS.attendanceRate.critical}%.`,
      status: low.length > 0 ? 'critical' : 'healthy',
      href: '/reports?tab=attendance',
    }),
    kpi({
      key: 'chronic', label: 'Chronic absentees', value: r.recorded === 0 ? null : r.chronic.length, unit: 'count',
      description: `Students absent at least ${CHRONIC_ABSENCE_PCT}% of recorded days (minimum ${CHRONIC_MIN_DAYS} days recorded).`,
      status: r.chronic.length > 0 ? 'watch' : 'healthy',
      href: '/reports?tab=attendance',
    }),
  ]

  const insights: ReportInsight[] = compact([
    attendanceInsight(r.attendanceRate, low.length, '/reports?tab=attendance'),
    r.chronic.length > 0
      ? {
          key: 'attendance-chronic',
          severity: 'watch',
          title: `${r.chronic.length} chronic absentee${r.chronic.length === 1 ? '' : 's'}`,
          detail: `Students absent ${CHRONIC_ABSENCE_PCT}% or more of recorded days.`,
          href: '/reports?tab=attendance',
        }
      : null,
  ])

  return {
    key: 'attendance-overview',
    title: 'Attendance overview',
    scope: { academicYear, term, description: describeScope(scope) },
    kpis,
    insights: sortInsights(insights),
    ...(stale.length > 0
      ? { warnings: [{ key: 'stale-registers', message: `${stale.length} class${stale.length === 1 ? ' has' : 'es have'} no attendance marked in the last ${STALE_MARKING_DAYS} days.` }] }
      : {}),
    generatedAt: now.toISOString(),
  }
}

export async function getAttendanceAttention(
  academicYear: string,
  term: number,
  scope: AttendanceScope,
): Promise<AttentionItem[]> {
  const r = await getAttendanceReport(academicYear, term, scope)
  const low = r.byClass.filter((c) => c.attendanceRate !== null && c.attendanceRate < THRESHOLDS.attendanceRate.critical)
  const stale = staleClasses(r, new Date())
  const items: AttentionItem[] = [
    { key: 'classes-low-attendance', severity: 'critical', label: 'Classes below 85% attendance', count: low.length, href: '/reports?tab=attendance' },
    { key: 'chronic-absentees', severity: 'watch', label: 'Chronic absentees', count: r.chronic.length, href: '/reports?tab=attendance' },
    { key: 'stale-registers', severity: 'info', label: `Classes with no attendance marked in ${STALE_MARKING_DAYS} days`, count: stale.length, href: '/attendance' },
  ]
  const order = { critical: 0, watch: 1, info: 2, positive: 3 } as const
  return items.filter((i) => (i.count ?? 0) > 0).sort((a, b) => order[a.severity] - order[b.severity])
}
