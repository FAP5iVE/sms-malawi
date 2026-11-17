'use client'

/**
 * Exam report tabs: mark completion (who still owes marks) and the results
 * workflow (where each exam is, who must act next, how long it has been there,
 * and what has changed its status). Marks entered for absent students count as
 * complete; MANEB national exams are excluded because their marks are not
 * entered by the school — MANEB is reported separately as external data.
 */
import { Chart } from '@/components/shared/chart'
import { ChartCard } from '@/components/shared/ChartCard'
import { useExamAttention, useExamOverview, useExamWorkflow, useManebStatus, useMarkCompletion } from '@/hooks/reporting/useExamsReporting'
import type {
  ApiCompletionGroup, ApiExamAuditEvent, ApiExamBlocker, ApiExamOwnerWork, ApiExamWorkflowRow, ApiMarkCompletionRow,
} from '@shared/types/reporting-exams'
import { formatCount, formatDate, formatDays, formatPercent } from '@/lib/reportFormat'
import { FilterBar, FilterSelect } from '../ui/ReportFilters'
import { useReportParam } from '../ui/useReportParams'
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
          MANEB national exams are not included. Their marks are not entered by the school.
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


// ─── Workflow ─────────────────────────────────────────────────────────────────

const link = (path: string, params: Record<string, string | undefined>) => {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v)
  const qs = search.toString()
  return qs ? `${path}?${qs}` : path
}

/** The screen where this exam's next step is done: approval and release live on the release tab. */
const examHref = (r: Pick<ApiExamWorkflowRow, 'examId' | 'classId' | 'status'>) =>
  r.status === 'MARKS_FINAL' || r.status === 'RESULTS_APPROVED'
    ? link('/exams', { tab: 'release', classId: r.classId })
    : link('/exams', { tab: 'exams', classId: r.classId, exam: r.examId })

const SOURCE_NOTE: Record<ApiExamWorkflowRow['stageSource'], string> = {
  audit: 'From the audit record of the change',
  marks: 'From when marks were entered',
  exam_date: 'From the exam date',
  updated_at: 'Approximate: from the last edit to the exam',
}

function daysCell(r: ApiExamWorkflowRow): string {
  if (r.daysInStage === null) return '-'
  if (r.status === 'RESULTS_RELEASED') return 'Released'
  return `${r.stageSource === 'updated_at' ? '~' : ''}${r.daysInStage}d`
}

export function ExamWorkflowTab({ academicYear, term }: Period) {
  const [classId, setClassId] = useReportParam('classId')
  const [subject, setSubject] = useReportParam('subject')
  const [teacherUid, setTeacherUid] = useReportParam('teacherUid')
  const [status, setStatus] = useReportParam('status')
  const q = useExamWorkflow({ academicYear, term }, { classId, subject, teacherUid, status })
  const d = q.data
  const owner = (o: ApiExamOwnerWork['owner']) => d?.byOwner.find((x) => x.owner === o)
  const stage = (k: string) => d?.stages.find((x) => x.key === k)
  const filtered = Boolean(classId || subject || teacherUid || status)

  return (
    <PanelStack>
      <FilterBar ariaLabel="Exam workflow filters">
        <FilterSelect label="Class" value={classId ?? ''} onChange={setClassId} options={(d?.options.classes ?? []).map((c) => ({ value: c.id, label: c.label }))} allLabel="All classes" />
        <FilterSelect label="Subject" value={subject ?? ''} onChange={setSubject} options={(d?.options.subjects ?? []).map((v) => ({ value: v, label: v }))} allLabel="All subjects" />
        {(d?.options.teachers.length ?? 0) > 1 ? (
          <FilterSelect label="Teacher" value={teacherUid ?? ''} onChange={setTeacherUid} options={(d?.options.teachers ?? []).map((t) => ({ value: t.uid, label: t.label }))} allLabel="All teachers" />
        ) : null}
        <FilterSelect label="Stage" value={status ?? ''} onChange={setStatus} options={(d?.options.statuses ?? []).map((s) => ({ value: s.key, label: s.label }))} allLabel="All stages" />
      </FilterBar>

      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          kpiTile('exams', 'Exams', d.totals.exams, 'count', 'Internal exams for the term that match the filters. MANEB national exams are not included.', 'neutral', `${formatCount(d.totals.released)} released`),
          kpiTile('delayed', 'Delayed', d.totals.delayed, 'count', `Exams that have been in their current stage longer than allowed: stalled more than ${d.thresholds.afterExamDate} day after the exam date, marks entry over ${d.thresholds.marksEntry} days, approval over ${d.thresholds.approval} days, release over ${d.thresholds.release} days. The school stores no deadlines, so these are report defaults.`, d.totals.delayed > 0 ? 'watch' : 'healthy'),
          kpiTile('teachers', 'With teachers', owner('teacher')?.exams ?? 0, 'count', 'Exams waiting for a teacher to enter or finalise marks.', 'neutral', `${formatCount(d.totals.missing)} marks missing`),
          kpiTile('approval', 'Awaiting approval', stage('MARKS_FINAL')?.count ?? 0, 'count', 'Marks are final; the exam officer has to approve the results.', (stage('MARKS_FINAL')?.delayed ?? 0) > 0 ? 'watch' : 'neutral', stage('MARKS_FINAL')?.oldestDaysInStage != null ? `Oldest ${stage('MARKS_FINAL')?.oldestDaysInStage} days` : undefined),
          kpiTile('release', 'Awaiting release', stage('RESULTS_APPROVED')?.count ?? 0, 'count', 'Results are approved; senior leadership has to authorise their release.', (stage('RESULTS_APPROVED')?.delayed ?? 0) > 0 ? 'watch' : 'neutral', stage('RESULTS_APPROVED')?.oldestDaysInStage != null ? `Oldest ${stage('RESULTS_APPROVED')?.oldestDaysInStage} days` : undefined),
        ] : undefined}
      />

      <TwoUp>
        <ChartCard title="Where exams are" sub={filtered ? 'Matching the filters' : 'Every exam this term, by stage'} isLoading={q.isLoading} height={260}>
          <Chart type="bar" data={(d?.stages ?? []).map((s) => ({ x: s.label, exams: s.count, delayed: s.delayed }))} series={[{ key: 'exams', label: 'Exams' }, { key: 'delayed', label: 'Delayed' }]} height={260} emptyStateMessage="No exams this term." ariaLabel="Exams at each stage of the results workflow" />
        </ChartCard>
        <ReportCard title="Who has to act" sub="Exams waiting on each person next">
          <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
            <ReportTable<ApiExamOwnerWork>
              rows={d?.byOwner}
              rowKey={(r) => r.owner}
              exportLabel="Exam work by owner"
              columns={[
                { key: 'owner', label: 'Action by', sortValue: (r) => OWNER_LABEL[r.owner], cell: (r) => OWNER_LABEL[r.owner], exportValue: (r) => OWNER_LABEL[r.owner] },
                { key: 'exams', label: 'Exams', align: 'right', sortValue: (r) => r.exams, cell: (r) => formatCount(r.exams) },
                { key: 'delayed', label: 'Delayed', align: 'right', sortValue: (r) => r.delayed, cell: (r) => formatCount(r.delayed) },
                { key: 'missing', label: 'Marks missing', align: 'right', hideOnMobile: true, sortValue: (r) => r.marksMissing, cell: (r) => (r.owner === 'teacher' ? formatCount(r.marksMissing) : '-'), exportValue: (r) => r.marksMissing },
                { key: 'oldest', label: 'Longest wait', align: 'right', sortValue: (r) => r.oldestDays, cell: (r) => formatDays(r.oldestDays), exportValue: (r) => r.oldestDays },
              ]}
            />
          </QueryState>
        </ReportCard>
      </TwoUp>

      <ReportCard title="Exam by exam" sub="Delayed first, then longest in stage. Select a row to go to where it is done" >
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable<ApiExamWorkflowRow>
            rows={d?.rows}
            rowKey={(r) => r.examId}
            rowHref={examHref}
            exportLabel="Exam workflow"
            exportNote={d?.rowsTruncated ? `First ${d?.rows.length ?? 0} exams only: narrow the filters for the rest` : undefined}
            emptyMessage={filtered ? 'No exams match these filters.' : 'No exams this term.'}
            columns={[
              { key: 'title', label: 'Exam', sortValue: (r) => r.title },
              { key: 'class', label: 'Class', sortValue: (r) => r.className },
              { key: 'subject', label: 'Subject', hideOnMobile: true, sortValue: (r) => r.subject },
              { key: 'teacher', label: 'Teacher', hideOnMobile: true, sortValue: (r) => r.teacher ?? '', cell: (r) => r.teacher ?? 'Unassigned', exportValue: (r) => r.teacher ?? 'Unassigned' },
              { key: 'status', label: 'Stage', sortValue: (r) => r.status, cell: (r) => `${(d?.stages.find((s) => s.key === r.status)?.label ?? r.status)}${r.delayed ? ' delayed' : ''}`, exportValue: (r) => r.status },
              { key: 'days', label: 'In stage', align: 'right', sortValue: (r) => r.daysInStage, cell: (r) => <span title={SOURCE_NOTE[r.stageSource]}>{daysCell(r)}</span>, exportValue: (r) => r.daysInStage },
              { key: 'next', label: 'Next step', hideOnMobile: true, sortValue: (r) => r.nextAction ?? '', cell: (r) => (r.owner ? `${OWNER_LABEL[r.owner]}: ${r.nextAction ?? ''}` : '-'), exportValue: (r) => (r.owner ? `${OWNER_LABEL[r.owner]}: ${r.nextAction ?? ''}` : '') },
              { key: 'missing', label: 'Missing', align: 'right', hideOnMobile: true, sortValue: (r) => r.missing, cell: (r) => formatCount(r.missing) },
              { key: 'rate', label: 'Complete', align: 'right', sortValue: (r) => r.completionRate, cell: (r) => formatPercent(r.completionRate), exportValue: (r) => r.completionRate },
              { key: 'final', label: 'Finalised', align: 'right', hideOnMobile: true, sortValue: (r) => r.finalisedAt, cell: (r) => (r.finalisedAt ? formatDate(r.finalisedAt) : '-'), exportValue: (r) => r.finalisedAt },
              { key: 'approved', label: 'Approved', align: 'right', hideOnMobile: true, sortValue: (r) => r.approvedAt, cell: (r) => (r.approvedAt ? formatDate(r.approvedAt) : '-'), exportValue: (r) => r.approvedAt },
              { key: 'released', label: 'Released', align: 'right', hideOnMobile: true, sortValue: (r) => r.releasedAt, cell: (r) => (r.releasedAt ? formatDate(r.releasedAt) : '-'), exportValue: (r) => r.releasedAt },
              { key: 'unlocks', label: 'Unlocked', align: 'right', hideOnMobile: true, sortValue: (r) => r.unlockCount, cell: (r) => (r.unlockCount ? `${r.unlockCount}×` : '-'), exportValue: (r) => r.unlockCount },
            ]}
          />
          {d?.rowsTruncated ? <p className="mt-2 text-xs text-muted">Showing the first {d.rows.length}. Narrow the filters to see the rest.</p> : null}
          {d && d.approximateStageTimes > 0 ? (
            <p className="mt-2 text-xs text-muted">{d.approximateStageTimes} exam{d.approximateStageTimes === 1 ? '' : 's'} show “~” because no record of when they reached this stage exists; the time is taken from the last edit to the exam.</p>
          ) : null}
        </QueryState>
      </ReportCard>

      {d?.termRelease && d.termRelease.endTermExams > 0 ? (
        <ReportCard title="End-of-term results release" sub="All classes are released together, once every end-of-term exam is approved" href="/exams?tab=release" hrefLabel="Open results release">
          <p className="text-sm text-body">
            {d.termRelease.allReleased
              ? 'All end-of-term results have been released.'
              : d.termRelease.readyToRelease
                ? `Ready to release: all ${d.termRelease.approved} end-of-term exams are approved.`
                : `Not ready: ${d.termRelease.notReady.length} of ${d.termRelease.endTermExams} end-of-term exams are not yet approved.`}
          </p>
          {d.termRelease.notReady.length > 0 ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted">
              {d.termRelease.notReady.map((n, i) => <li key={`${n.className}-${i}`}>{n.className} - {n.status.replace(/_/g, ' ').toLowerCase()}</li>)}
            </ul>
          ) : null}
        </ReportCard>
      ) : null}

      {d?.audit ? (
        <ReportCard title="What changed exam status" sub="Status changes and result edits recorded in the audit log, newest first">
          <ReportTable<ApiExamAuditEvent>
            rows={d.audit}
            rowKey={(r) => `${r.at}-${r.action}-${r.exam}-${r.actorRole}`}
            exportLabel="Exam status changes"
            exportNote={d.auditTruncated ? `Latest ${d.audit.length} changes only` : undefined}
            emptyMessage="No status changes recorded."
            columns={[
              { key: 'at', label: 'When', sortValue: (r) => r.at, cell: (r) => formatDate(r.at), exportValue: (r) => r.at },
              { key: 'label', label: 'Action', sortValue: (r) => r.label, cell: (r) => (r.sensitive ? <strong>{r.label}</strong> : r.label), exportValue: (r) => r.label },
              { key: 'exam', label: 'Exam', sortValue: (r) => r.exam, cell: (r) => `${r.exam}${r.className ? ` · ${r.className}` : ''}`, exportValue: (r) => r.exam },
              { key: 'who', label: 'By', hideOnMobile: true, sortValue: (r) => r.actor ?? r.actorRole, cell: (r) => r.actor ?? r.actorRole.replace(/_/g, ' '), exportValue: (r) => r.actor ?? r.actorRole },
              { key: 'role', label: 'Role', hideOnMobile: true, sortValue: (r) => r.actorRole, cell: (r) => r.actorRole.replace(/_/g, ' '), exportValue: (r) => r.actorRole },
            ]}
          />
          {d.auditTruncated ? <p className="mt-2 text-xs text-muted">Showing the latest {d.audit.length}.</p> : null}
          <p className="mt-2 text-xs text-muted">Bold actions rewrite or release results. Deleted exams are not listed.</p>
        </ReportCard>
      ) : null}

      <p role="note" className="rounded-lg border border-base bg-page px-3 py-2 text-xs text-muted">
        MANEB national exams are not part of this workflow. Their results come from MANEB. See the MANEB report for their status.
      </p>
    </PanelStack>
  )
}

// ─── MANEB status (external data) ─────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = { REGISTERED: 'Registered', SITTING: 'Sitting', RESULTS_RECEIVED: 'Results received', CERTIFIED: 'Certified' }

export function ManebStatusCard({ academicYear }: { academicYear: string }) {
  const q = useManebStatus({ academicYear })
  const d = q.data
  return (
    <ReportCard
      title="MANEB registration and results"
      sub="External national-exam records held by the school. Not marks entered by the school's teachers"
      href="/exams?tab=maneb"
      hrefLabel="Open MANEB records"
    >
      <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
        <ReportTable
          rows={d?.types}
          rowKey={(r) => r.examType}
          exportLabel="MANEB status"
          emptyMessage="No MANEB records for this year."
          columns={[
            { key: 'type', label: 'Exam', sortValue: (r) => r.examType, cell: (r) => `${r.examType}${r.form ? ` (Form ${r.form})` : ''}`, exportValue: (r) => r.examType },
            { key: 'eligible', label: 'Could sit', align: 'right', hideOnMobile: true, sortValue: (r) => r.eligible, cell: (r) => (r.eligible === null ? 'N/A' : formatCount(r.eligible)), exportValue: (r) => r.eligible },
            { key: 'cand', label: 'Registered', align: 'right', sortValue: (r) => r.candidates, cell: (r) => formatCount(r.candidates) },
            { key: 'notreg', label: 'Not registered', align: 'right', hideOnMobile: true, sortValue: (r) => r.notRegistered, cell: (r) => (r.notRegistered === null ? 'N/A' : formatCount(r.notRegistered)), exportValue: (r) => r.notRegistered },
            { key: 'await', label: 'Awaiting results', align: 'right', sortValue: (r) => r.awaitingResults, cell: (r) => formatCount(r.awaitingResults) },
            { key: 'recv', label: 'Results received', align: 'right', sortValue: (r) => r.resultsReceived, cell: (r) => formatCount(r.resultsReceived) },
            { key: 'nograde', label: 'No grade recorded', align: 'right', hideOnMobile: true, sortValue: (r) => r.resultsWithoutGrade, cell: (r) => formatCount(r.resultsWithoutGrade) },
          ]}
        />
        {d ? (
          <p className="mt-2 text-xs text-muted">
            Statuses: {Object.values(STATUS_LABEL).join(' → ')}. “Could sit” is the active students now in the exam form, so it is shown for the current year only.
          </p>
        ) : null}
      </QueryState>
    </ReportCard>
  )
}
