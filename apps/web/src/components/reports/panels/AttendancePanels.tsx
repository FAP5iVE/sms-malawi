'use client'

/**
 * Attendance report tab — school-wide for leadership, scoped to "my classes"
 * (class teacher ∪ subject teacher) for teachers; the server decides which.
 * LATE counts as attended, so the figures agree with every other attendance
 * number in the system for the same term.
 */
import { Chart } from '@/components/shared/chart'
import { ChartCard } from '@/components/shared/ChartCard'
import { useAttendanceAttention, useAttendanceOverview, useAttendanceReport } from '@/hooks/reporting/useAttendanceReporting'
import type { ApiAttendanceClassRow, ApiChronicAbsentee } from '@shared/types/reporting-attendance'
import { formatCount, formatDate, formatPercent } from '@/lib/reportFormat'
import { ReportCard } from '../ui/ReportCard'
import { ReportTable } from '../ui/ReportTable'
import { QueryState } from '../ui/ReportStates'
import { AttentionCard, OverviewSection, PanelStack, TwoUp } from './common'

interface Period {
  academicYear: string
  term: number
}

const rated = (rows: readonly { label: string; rate: number | null }[] | undefined) =>
  (rows ?? []).flatMap((r) => (r.rate === null ? [] : [{ x: r.label, rate: r.rate }]))

export function AttendanceReportTab({ academicYear, term }: Period) {
  const overview = useAttendanceOverview({ academicYear, term })
  const attention = useAttendanceAttention({ academicYear, term })
  const report = useAttendanceReport({ academicYear, term })
  const d = report.data

  return (
    <PanelStack>
      <OverviewSection query={overview} label="Attendance overview" placeholders={5} />
      <AttentionCard query={attention} title="Attendance attention queue" />

      <TwoUp>
        <ChartCard
          title="Attendance by class"
          sub="Present plus late, as a share of all register entries"
          isLoading={report.isLoading}
          height={280}
        >
          <Chart
            type="bar"
            data={(d?.byClass ?? []).flatMap((c) => (c.attendanceRate === null ? [] : [{ x: c.className, rate: c.attendanceRate }]))}
            series={[{ key: 'rate', label: 'Attendance %' }]}
            height={280}
            emptyStateMessage="No attendance has been recorded for this term."
            ariaLabel="Attendance rate by class"
          />
        </ChartCard>
        <ChartCard title="Weekly trend" sub="Week commencing (Monday)" isLoading={report.isLoading} height={280}>
          <Chart
            type="line"
            data={rated(d?.byWeek)}
            series={[{ key: 'rate', label: 'Attendance %' }]}
            height={280}
            emptyStateMessage="No attendance has been recorded for this term."
            ariaLabel="Weekly attendance rate"
          />
        </ChartCard>
        <ChartCard title="By day of the week" sub="Where absence clusters" isLoading={report.isLoading} height={240}>
          <Chart
            type="bar"
            data={rated(d?.byWeekday)}
            series={[{ key: 'rate', label: 'Attendance %' }]}
            height={240}
            emptyStateMessage="No attendance has been recorded for this term."
            ariaLabel="Attendance rate by weekday"
          />
        </ChartCard>
        <ChartCard title="Register entries" sub={d ? `Previous term: ${formatPercent(d.previousRate)}` : undefined} isLoading={report.isLoading} height={240}>
          <Chart
            type="donut"
            data={d && d.recorded > 0 ? [
              { x: 'Present', count: d.present },
              { x: 'Late', count: d.late },
              { x: 'Absent', count: d.absent },
            ] : []}
            series={[{ key: 'count', label: 'Entries' }]}
            height={240}
            emptyStateMessage="No attendance has been recorded for this term."
            ariaLabel="Present, late and absent register entries"
          />
        </ChartCard>
      </TwoUp>

      <ReportCard title="Classes" sub={d?.scope === 'teacher' ? 'Classes you teach' : 'Every active class'}>
        <QueryState isLoading={report.isLoading} isError={report.isError} onRetry={() => void report.refetch()}>
          <ReportTable<ApiAttendanceClassRow>
            rows={d?.byClass}
            rowKey={(r) => r.classId}
            exportLabel="Attendance by class"
            emptyMessage="No classes in scope."
            defaultSort={{ key: 'rate', direction: 'asc' }}
            columns={[
              { key: 'class', label: 'Class', sortValue: (r) => r.className },
              { key: 'students', label: 'Students', align: 'right', hideOnMobile: true, sortValue: (r) => r.students, cell: (r) => formatCount(r.students) },
              { key: 'present', label: 'Present', align: 'right', hideOnMobile: true, sortValue: (r) => r.present, cell: (r) => formatCount(r.present) },
              { key: 'late', label: 'Late', align: 'right', hideOnMobile: true, sortValue: (r) => r.late, cell: (r) => formatCount(r.late) },
              { key: 'absent', label: 'Absent', align: 'right', sortValue: (r) => r.absent, cell: (r) => formatCount(r.absent) },
              { key: 'rate', label: 'Attendance', align: 'right', sortValue: (r) => r.attendanceRate, cell: (r) => formatPercent(r.attendanceRate), exportValue: (r) => r.attendanceRate },
              { key: 'last', label: 'Last marked', align: 'right', hideOnMobile: true, sortValue: (r) => r.lastMarked ?? '', cell: (r) => (r.lastMarked ? formatDate(r.lastMarked) : 'Never'), exportValue: (r) => (r.lastMarked ? formatDate(r.lastMarked) : 'Never') },
            ]}
          />
        </QueryState>
      </ReportCard>

      <ReportCard
        title="Chronic absentees"
        sub={d ? `Absent at least ${d.chronicThresholdPct}% of recorded days (minimum ${d.chronicMinDays} days recorded)` : undefined}
      >
        <QueryState isLoading={report.isLoading} isError={report.isError} onRetry={() => void report.refetch()}>
          <ReportTable<ApiChronicAbsentee>
            rows={d?.chronic}
            rowKey={(r) => r.studentId}
            exportLabel="Chronic absentees"
            emptyMessage="No students meet the chronic absence threshold."
            defaultSort={{ key: 'rate', direction: 'desc' }}
            columns={[
              { key: 'name', label: 'Student', sortValue: (r) => r.name },
              { key: 'class', label: 'Class', sortValue: (r) => r.className },
              { key: 'absent', label: 'Days absent', align: 'right', sortValue: (r) => r.absentDays, cell: (r) => formatCount(r.absentDays) },
              { key: 'recorded', label: 'Days recorded', align: 'right', hideOnMobile: true, sortValue: (r) => r.recordedDays, cell: (r) => formatCount(r.recordedDays) },
              { key: 'rate', label: 'Absence rate', align: 'right', sortValue: (r) => r.absenceRate, cell: (r) => formatPercent(r.absenceRate), exportValue: (r) => r.absenceRate },
            ]}
          />
        </QueryState>
      </ReportCard>
    </PanelStack>
  )
}
