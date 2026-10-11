'use client'

/**
 * Exam report tabs: mark completion (who still owes marks) and the results
 * pipeline (where each exam is stuck and who must act next). Marks entered for
 * absent students count as complete; MANEB national exams are excluded because
 * their marks are not entered by the school.
 */
import { Chart } from '@/components/shared/chart'
import { ChartCard } from '@/components/shared/ChartCard'
import { useExamAttention, useExamOverview, useExamPipeline, useMarkCompletion } from '@/hooks/reporting/useExamsReporting'
import type { ApiCompletionGroup, ApiExamBlocker, ApiMarkCompletionRow } from '@shared/types/reporting-exams'
import { formatCount, formatDate, formatDays, formatPercent } from '@/lib/reportFormat'
import { ReportCard } from '../ui/ReportCard'
import { ReportTable } from '../ui/ReportTable'
import { QueryState } from '../ui/ReportStates'
import { ReportKpiStrip } from '../ui/ReportKpiStrip'
import { kpiTile } from './kpiHelpers'
import { AttentionCard, OverviewSection, PanelStack, TwoUp } from './common'

interface Period {
  academicYear: string
  term: number
}

const OWNER_LABEL: Record<ApiExamBlocker['owner'], string> = {
  teacher: 'Teacher',
  exam_officer: 'Exam officer',
  high_rank: 'Senior leadership',
}

const groupColumns = (name: string) => [
  { key: 'label', label: name, sortValue: (r: ApiCompletionGroup) => r.label },
  { key: 'exams', label: 'Exams', align: 'right' as const, hideOnMobile: true, sortValue: (r: ApiCompletionGroup) => r.exams, cell: (r: ApiCompletionGroup) => formatCount(r.exams) },
  { key: 'missing', label: 'Marks missing', align: 'right' as const, sortValue: (r: ApiCompletionGroup) => r.missing, cell: (r: ApiCompletionGroup) => formatCount(r.missing) },
  { key: 'rate', label: 'Complete', align: 'right' as const, sortValue: (r: ApiCompletionGroup) => r.completionRate, cell: (r: ApiCompletionGroup) => formatPercent(r.completionRate), exportValue: (r: ApiCompletionGroup) => r.completionRate },
  { key: 'turnaround', label: 'Avg turnaround', align: 'right' as const, hideOnMobile: true, sortValue: (r: ApiCompletionGroup) => r.avgTurnaroundDays, cell: (r: ApiCompletionGroup) => formatDays(r.avgTurnaroundDays), exportValue: (r: ApiCompletionGroup) => r.avgTurnaroundDays },
]

const rateData = (rows: readonly ApiCompletionGroup[] | undefined) =>
  (rows ?? []).flatMap((g) => (g.completionRate === null ? [] : [{ x: g.label, rate: g.completionRate }]))

/**
 * @param showTeachers  Leadership view: adds the per-teacher table. Teachers
 *   already only see their own exams (server-scoped), so it is hidden for them.
 */
export function MarkCompletionTab({ academicYear, term, showTeachers = true }: Period & { showTeachers?: boolean }) {
  const overview = useExamOverview({ academicYear, term })
  const attention = useExamAttention({ academicYear, term })
  const q = useMarkCompletion({ academicYear, term })
  const d = q.data
  return (
    <PanelStack>
      <OverviewSection query={overview} label="Exam overview" placeholders={5} />
      <AttentionCard query={attention} title="Exam attention queue" />
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          kpiTile('exams', 'Exams in scope', d.totals.exams, 'count', 'School-set exams for the term.'),
          kpiTile('expected', 'Marks expected', d.totals.expected, 'count', 'One mark per active student on each exam’s class roster.'),
          kpiTile('missing', 'Marks missing', d.totals.missing, 'count', 'Expected marks that are neither entered nor recorded as absent.', d.totals.missing > 0 ? 'watch' : 'healthy'),
          kpiTile('completion', 'Completion', d.totals.completionRate, 'percent', 'Entered plus absent, as a share of expected marks.'),
        ] : undefined}
      />
      {d?.excludesManeb ? (
        <p role="note" className="rounded-lg border border-base bg-page px-3 py-2 text-xs text-muted">
          MANEB national exams are not included — their marks are not entered by the school.
        </p>
      ) : null}
      <TwoUp>
        <ChartCard title="Completion by subject" isLoading={q.isLoading} height={260}>
          <Chart type="bar" data={rateData(d?.bySubject)} series={[{ key: 'rate', label: 'Complete %' }]} height={260} emptyStateMessage="No exams this term." ariaLabel="Mark completion by subject" />
        </ChartCard>
        <ChartCard title="Completion by class" isLoading={q.isLoading} height={260}>
          <Chart type="bar" data={rateData(d?.byClass)} series={[{ key: 'rate', label: 'Complete %' }]} height={260} emptyStateMessage="No exams this term." ariaLabel="Mark completion by class" />
        </ChartCard>
      </TwoUp>
      {showTeachers ? (
        <ReportCard title="By teacher" sub="Least complete first">
          <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
            <ReportTable<ApiCompletionGroup> rows={d?.byTeacher} rowKey={(r) => r.key} exportLabel="Mark completion by teacher" emptyMessage="No exams this term." defaultSort={{ key: 'rate', direction: 'asc' }} columns={groupColumns('Teacher')} />
          </QueryState>
        </ReportCard>
      ) : null}
      <ReportCard title="Exam by exam" sub="Least complete first">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable<ApiMarkCompletionRow>
            rows={d?.rows}
            rowKey={(r) => r.examId}
            exportLabel="Mark completion by exam"
            emptyMessage="No exams this term."
            defaultSort={{ key: 'rate', direction: 'asc' }}
            columns={[
              { key: 'title', label: 'Exam', sortValue: (r) => r.title },
              { key: 'subject', label: 'Subject', sortValue: (r) => r.subject },
              { key: 'class', label: 'Class', sortValue: (r) => r.className },
              { key: 'teacher', label: 'Teacher', hideOnMobile: true, sortValue: (r) => r.teacher ?? '', cell: (r) => r.teacher ?? 'Unassigned', exportValue: (r) => r.teacher ?? 'Unassigned' },
              { key: 'date', label: 'Date', hideOnMobile: true, sortValue: (r) => r.date, cell: (r) => formatDate(r.date), exportValue: (r) => formatDate(r.date) },
              { key: 'status', label: 'Status', hideOnMobile: true, sortValue: (r) => r.status },
              { key: 'entered', label: 'Entered', align: 'right', hideOnMobile: true, sortValue: (r) => r.entered, cell: (r) => `${formatCount(r.entered)} / ${formatCount(r.expected)}`, exportValue: (r) => r.entered },
              { key: 'missing', label: 'Missing', align: 'right', sortValue: (r) => r.missing, cell: (r) => formatCount(r.missing) },
              { key: 'rate', label: 'Complete', align: 'right', sortValue: (r) => r.completionRate, cell: (r) => formatPercent(r.completionRate), exportValue: (r) => r.completionRate },
            ]}
          />
        </QueryState>
      </ReportCard>
    </PanelStack>
  )
}

export function ExamPipelineTab({ academicYear, term }: Period) {
  const q = useExamPipeline({ academicYear, term })
  const d = q.data
  return (
    <PanelStack>
      <ChartCard title="Results pipeline" sub={d ? `${d.total} exam${d.total === 1 ? '' : 's'} this term` : undefined} isLoading={q.isLoading} height={260}>
        <Chart type="bar" data={(d?.stages ?? []).map((s) => ({ x: s.label, count: s.count }))} series={[{ key: 'count', label: 'Exams' }]} height={260} emptyStateMessage="No exams this term." ariaLabel="Exams at each stage of the results pipeline" />
      </ChartCard>
      <ReportCard title="What is holding results back" sub="Most urgent first, with who has to act next">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable<ApiExamBlocker>
            rows={d?.blockers}
            rowKey={(r) => r.examId}
            exportLabel="Exam blockers"
            emptyMessage="Nothing is blocking results this term."
            columns={[
              { key: 'title', label: 'Exam', sortValue: (r) => r.title },
              { key: 'subject', label: 'Subject', hideOnMobile: true, sortValue: (r) => r.subject },
              { key: 'class', label: 'Class', sortValue: (r) => r.className },
              { key: 'reason', label: 'Reason', sortValue: (r) => r.reason },
              { key: 'owner', label: 'Action by', sortValue: (r) => OWNER_LABEL[r.owner], cell: (r) => OWNER_LABEL[r.owner], exportValue: (r) => OWNER_LABEL[r.owner] },
              { key: 'waiting', label: 'Waiting', align: 'right', sortValue: (r) => r.daysWaiting, cell: (r) => formatDays(r.daysWaiting), exportValue: (r) => r.daysWaiting },
            ]}
          />
        </QueryState>
      </ReportCard>
    </PanelStack>
  )
}
