'use client'

/**
 * Teacher ("academic") report tabs. Everything here is scoped by the server to
 * the signed-in teacher's own classes (class teacher ∪ subject assignments) and
 * deliberately contains no fee data.
 */
import { Chart } from '@/components/shared/chart'
import { ChartCard } from '@/components/shared/ChartCard'
import {
  useAcademicAttention, useAcademicOverview, useExamReadiness, useStudentsNeedingAttention, useTeacherAssignments,
  useTeachingReport,
} from '@/hooks/reporting/useAcademicReporting'
import type {
  ApiAssignmentRow, ApiExamReadinessRow, ApiStudentAttentionRow, ApiTeachingSubjectRow, SpreadKind, StudentFlag,
} from '@shared/types/reporting-academic'
import { formatCount, formatDate, formatDays, formatPercent, formatScore } from '@/lib/reportFormat'
import { ReportCard } from '../ui/ReportCard'
import { ReportHeatmap } from '../ui/ReportHeatmap'
import { ReportTable } from '../ui/ReportTable'
import { QueryState } from '../ui/ReportStates'
import { ReportKpiStrip } from '../ui/ReportKpiStrip'
import { kpiTile } from './kpiHelpers'
import { AttentionCard, OverviewSection, PanelStack, TwoUp } from './common'

interface Period {
  academicYear: string
  term: number
}

const SPREAD_NOTE: Record<SpreadKind, string> = {
  'class-wide': 'Low average with a tight spread — the whole class is struggling, which points to the teaching or the topic rather than individuals.',
  'wide-spread': 'Very uneven results — some students are well ahead while others are far behind.',
}
const SPREAD_LABEL: Record<SpreadKind, string> = { 'class-wide': 'Whole class struggling', 'wide-spread': 'Uneven results' }

const FLAG_LABEL: Record<StudentFlag, string> = {
  LOW_AVERAGE: 'Low average',
  SUBJECT_FAILS: 'Failing subjects',
  ABSENCE: 'High absence',
  DECLINING: 'Declining',
}

export function AcademicTeachingTab({ academicYear, term }: Period) {
  const overview = useAcademicOverview({ academicYear, term })
  const attention = useAcademicAttention({ academicYear, term })
  const q = useTeachingReport({ academicYear, term })
  const d = q.data

  const rows = Array.from(new Set<string>((d?.subjects ?? []).map((s) => s.className)))
  const columns = Array.from(new Set<string>((d?.subjects ?? []).map((s) => s.subject)))

  return (
    <PanelStack>
      <OverviewSection query={overview} label="My teaching overview" placeholders={6} />
      <AttentionCard query={attention} title="Needs your attention" />
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          kpiTile('assessed', 'Scores assessed', d.totals.assessed, 'count', 'Marks entered for your classes and subjects this term (absent excluded).', 'neutral', `${formatCount(d.totals.absentMarks)} absent`),
          kpiTile('average', 'Average score', d.totals.average, 'score', 'Mean score across all assessed marks in scope.'),
          kpiTile('pass', 'Pass rate', d.totals.passRate, 'percent', 'Share of assessed scores at or above the pass mark for each class’s form.'),
          kpiTile('below', 'Subjects below pass', d.totals.subjectsBelowPass, 'count', 'Class and subject pairs whose average is under the pass mark.', d.totals.subjectsBelowPass > 0 ? 'watch' : 'healthy'),
        ] : undefined}
      />
      <ReportCard title="Class × subject average" sub="Darker teal is stronger; coral is below the pass mark">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          {d && d.subjects.length > 0 ? (
            <ReportHeatmap
              caption="Average score by class and subject"
              rows={rows}
              columns={columns}
              min={0}
              max={100}
              invert
              cells={d.subjects.map((s) => ({
                row: s.className,
                column: s.subject,
                value: s.average,
                detail: `${s.assessed} assessed · pass rate ${formatPercent(s.passRate)}`,
              }))}
              format={(v) => String(Math.round(v))}
            />
          ) : (
            <p className="py-6 text-center text-sm text-muted">No marks have been entered for your classes this term.</p>
          )}
        </QueryState>
      </ReportCard>
      <TwoUp>
        <ChartCard title="Score distribution" sub="Assessed scores in 10-point bands" isLoading={q.isLoading} height={260}>
          <Chart type="bar" data={(d?.distribution ?? []).map((b) => ({ x: b.bucket, count: b.count }))} series={[{ key: 'count', label: 'Scores' }]} height={260} emptyStateMessage="No marks entered yet." ariaLabel="Distribution of assessed scores" />
        </ChartCard>
        <ChartCard title="Term trend" sub="Average score and pass rate" isLoading={q.isLoading} height={260}>
          <Chart
            type="line"
            data={(d?.trend ?? []).flatMap((t) => (t.average === null ? [] : [{ x: t.label, average: t.average, passRate: t.passRate ?? 0 }]))}
            series={[{ key: 'average', label: 'Average' }, { key: 'passRate', label: 'Pass rate %' }]}
            height={260}
            emptyStateMessage="No marks entered yet."
            ariaLabel="Average score and pass rate by term"
          />
        </ChartCard>
      </TwoUp>
      <ReportCard title="Subject results" sub="Class by subject, weakest first">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable<ApiTeachingSubjectRow>
            rows={d?.subjects}
            rowKey={(r) => `${r.classId}|${r.subject}`}
            exportLabel="Subject results"
            emptyMessage="No marks have been entered for your classes this term."
            defaultSort={{ key: 'avg', direction: 'asc' }}
            columns={[
              { key: 'class', label: 'Class', sortValue: (r) => r.className },
              { key: 'subject', label: 'Subject', sortValue: (r) => r.subject },
              { key: 'assessed', label: 'Assessed', align: 'right', hideOnMobile: true, sortValue: (r) => r.assessed, cell: (r) => formatCount(r.assessed) },
              { key: 'avg', label: 'Average', align: 'right', sortValue: (r) => r.average, cell: (r) => formatScore(r.average), exportValue: (r) => r.average },
              { key: 'median', label: 'Median', align: 'right', hideOnMobile: true, sortValue: (r) => r.median, cell: (r) => formatScore(r.median), exportValue: (r) => r.median },
              { key: 'range', label: 'Lowest – highest', align: 'right', hideOnMobile: true, sortValue: (r) => r.min, cell: (r) => (r.min === null || r.max === null ? 'N/A' : `${formatScore(r.min)} – ${formatScore(r.max)}`), exportValue: (r) => (r.min === null || r.max === null ? '' : `${r.min} – ${r.max}`) },
              { key: 'pass', label: `Pass rate`, align: 'right', sortValue: (r) => r.passRate, cell: (r) => formatPercent(r.passRate), exportValue: (r) => r.passRate },
              {
                key: 'note',
                label: 'Pattern',
                sortValue: (r) => r.spread ?? '',
                cell: (r) => (r.spread ? <span title={SPREAD_NOTE[r.spread]}>{SPREAD_LABEL[r.spread]}</span> : '—'),
                exportValue: (r) => (r.spread ? SPREAD_NOTE[r.spread] : ''),
              },
            ]}
          />
        </QueryState>
      </ReportCard>
      <ReportCard title="Your classes">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable
            rows={d?.classes}
            rowKey={(r) => r.classId}
            exportLabel="My classes"
            emptyMessage="You have no classes this year."
            columns={[
              { key: 'class', label: 'Class', sortValue: (r) => r.className },
              { key: 'students', label: 'Students', align: 'right', sortValue: (r) => r.students, cell: (r) => formatCount(r.students) },
              { key: 'role', label: 'Your role', sortValue: (r) => r.role, cell: (r) => (r.role === 'form_teacher' ? 'Class teacher' : r.role === 'both' ? 'Class and subject teacher' : 'Subject teacher'), exportValue: (r) => r.role },
              { key: 'subjects', label: 'Subjects', hideOnMobile: true, sortValue: (r) => r.subjects.join(', '), cell: (r) => r.subjects.join(', ') || 'All (class teacher)', exportValue: (r) => r.subjects.join(', ') },
            ]}
          />
        </QueryState>
      </ReportCard>
    </PanelStack>
  )
}

export function AcademicAssignmentsTab({ academicYear, term }: Period) {
  const q = useTeacherAssignments({ academicYear, term })
  const d = q.data
  return (
    <PanelStack>
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          kpiTile('assignments', 'Assignments set', d.totals.assignments, 'count', 'Assignments you set for your classes this term.'),
          kpiTile('completion', 'Submitted', d.totals.completionRate, 'percent', 'Submissions received as a share of those expected.', 'neutral', `${formatCount(d.totals.submitted)} of ${formatCount(d.totals.expected)}`),
          kpiTile('late', 'Late submissions', d.totals.lateRate, 'percent', 'Late submissions as a share of all submissions.'),
          kpiTile('overdue', 'Overdue, incomplete', d.totals.overdue, 'count', 'Assignments past their due date where not everyone has submitted.', d.totals.overdue > 0 ? 'watch' : 'healthy'),
        ] : undefined}
      />
      <ChartCard title="Submission rate by class" isLoading={q.isLoading} height={240}>
        <Chart
          type="bar"
          data={(d?.byClass ?? []).flatMap((c) => (c.completionRate === null ? [] : [{ x: c.className, rate: c.completionRate }]))}
          series={[{ key: 'rate', label: 'Submitted %' }]}
          height={240}
          emptyStateMessage="No assignments this term."
          ariaLabel="Assignment submission rate by class"
        />
      </ChartCard>
      <ReportCard title="Assignments" sub="Least submitted first">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable<ApiAssignmentRow>
            rows={d?.rows}
            rowKey={(r) => r.assignmentId}
            exportLabel="Assignment submissions"
            emptyMessage="No assignments this term."
            defaultSort={{ key: 'rate', direction: 'asc' }}
            columns={[
              { key: 'title', label: 'Assignment', sortValue: (r) => r.title },
              { key: 'subject', label: 'Subject', hideOnMobile: true, sortValue: (r) => r.subject },
              { key: 'class', label: 'Class', sortValue: (r) => r.className },
              { key: 'due', label: 'Due', hideOnMobile: true, sortValue: (r) => r.dueDate, cell: (r) => formatDate(r.dueDate), exportValue: (r) => formatDate(r.dueDate) },
              { key: 'submitted', label: 'Submitted', align: 'right', sortValue: (r) => r.submitted, cell: (r) => `${formatCount(r.submitted)} / ${formatCount(r.expected)}`, exportValue: (r) => r.submitted },
              { key: 'late', label: 'Late', align: 'right', hideOnMobile: true, sortValue: (r) => r.late, cell: (r) => formatCount(r.late) },
              { key: 'rate', label: 'Rate', align: 'right', sortValue: (r) => r.completionRate, cell: (r) => formatPercent(r.completionRate), exportValue: (r) => r.completionRate },
              { key: 'overdue', label: 'Status', sortValue: (r) => (r.overdue ? 1 : 0), cell: (r) => (r.overdue ? 'Overdue' : 'Open'), exportValue: (r) => (r.overdue ? 'Overdue' : 'Open') },
            ]}
          />
        </QueryState>
      </ReportCard>
    </PanelStack>
  )
}

export function AcademicStudentsTab({ academicYear, term }: Period) {
  const q = useStudentsNeedingAttention({ academicYear, term })
  const d = q.data
  return (
    <PanelStack>
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          kpiTile('flagged', 'Students flagged', d.totalFlagged, 'count', 'Students in your classes with at least one academic or attendance flag.', d.totalFlagged > 0 ? 'watch' : 'healthy'),
          kpiTile('multi', 'Multiple flags', d.multiRisk, 'count', 'Students with two or more flags at once — the most likely to need intervention.', d.multiRisk > 0 ? 'critical' : 'healthy'),
          kpiTile('low', FLAG_LABEL.LOW_AVERAGE, d.counts.LOW_AVERAGE, 'count', 'Overall average below the pass mark.'),
          kpiTile('fail', FLAG_LABEL.SUBJECT_FAILS, d.counts.SUBJECT_FAILS, 'count', 'Failing at least one subject.'),
          kpiTile('absence', FLAG_LABEL.ABSENCE, d.counts.ABSENCE, 'count', `Absent at least ${d.absenceThresholdPct}% of recorded days.`),
          kpiTile('declining', FLAG_LABEL.DECLINING, d.counts.DECLINING, 'count', `Average down ${d.decliningPoints} points or more since the previous term.`),
        ] : undefined}
      />
      <ReportCard
        title="Students needing attention"
        sub={d && d.totalFlagged > d.students.length ? `Showing the ${d.students.length} most concerning of ${d.totalFlagged}` : 'Most concerning first'}
      >
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable<ApiStudentAttentionRow>
            rows={d?.students}
            rowKey={(r) => r.studentId}
            exportLabel="Students needing attention"
            emptyMessage="No students are flagged this term."
            columns={[
              { key: 'name', label: 'Student', sortValue: (r) => r.name },
              { key: 'class', label: 'Class', sortValue: (r) => r.className },
              { key: 'avg', label: 'Average', align: 'right', sortValue: (r) => r.average, cell: (r) => formatScore(r.average), exportValue: (r) => r.average },
              { key: 'change', label: 'Change', align: 'right', hideOnMobile: true, sortValue: (r) => r.change, cell: (r) => (r.change === null ? 'N/A' : `${r.change > 0 ? '+' : ''}${Math.round(r.change * 10) / 10}`), exportValue: (r) => r.change },
              { key: 'fails', label: 'Failing subjects', hideOnMobile: true, sortValue: (r) => r.failingSubjects.length, cell: (r) => r.failingSubjects.join(', ') || '—', exportValue: (r) => r.failingSubjects.join(', ') },
              { key: 'absence', label: 'Absence', align: 'right', sortValue: (r) => r.absenceRate, cell: (r) => formatPercent(r.absenceRate), exportValue: (r) => r.absenceRate },
              { key: 'flags', label: 'Flags', sortValue: (r) => r.flags.length, cell: (r) => r.flags.map((f) => FLAG_LABEL[f]).join(', '), exportValue: (r) => r.flags.map((f) => FLAG_LABEL[f]).join(', ') },
            ]}
          />
        </QueryState>
      </ReportCard>
    </PanelStack>
  )
}

export function AcademicReadinessTab({ academicYear, term }: Period) {
  const q = useExamReadiness({ academicYear, term })
  const d = q.data
  return (
    <ReportCard
      title="Upcoming exams"
      sub={d ? `Your exams in the next ${d.lookaheadDays} days, with how each class is currently performing` : undefined}
    >
      <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
        <ReportTable<ApiExamReadinessRow>
          rows={d?.rows}
          rowKey={(r) => r.examId}
          exportLabel="Exam readiness"
          emptyMessage="You have no exams coming up."
          defaultSort={{ key: 'days', direction: 'asc' }}
          columns={[
            { key: 'title', label: 'Exam', sortValue: (r) => r.title },
            { key: 'subject', label: 'Subject', hideOnMobile: true, sortValue: (r) => r.subject },
            { key: 'class', label: 'Class', sortValue: (r) => r.className },
            { key: 'date', label: 'Date', sortValue: (r) => r.date, cell: (r) => formatDate(r.date), exportValue: (r) => formatDate(r.date) },
            { key: 'days', label: 'In', align: 'right', sortValue: (r) => r.daysAway, cell: (r) => formatDays(r.daysAway), exportValue: (r) => r.daysAway },
            { key: 'avg', label: 'Class average so far', align: 'right', sortValue: (r) => r.previousAverage, cell: (r) => formatScore(r.previousAverage), exportValue: (r) => r.previousAverage },
            { key: 'pass', label: 'Pass rate so far', align: 'right', hideOnMobile: true, sortValue: (r) => r.previousPassRate, cell: (r) => formatPercent(r.previousPassRate), exportValue: (r) => r.previousPassRate },
            { key: 'below', label: 'Below pass', align: 'right', sortValue: (r) => r.belowPass, cell: (r) => `${formatCount(r.belowPass)} of ${formatCount(r.students)}`, exportValue: (r) => r.belowPass },
          ]}
        />
      </QueryState>
    </ReportCard>
  )
}
