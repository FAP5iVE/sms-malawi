'use client'

/**
 * Student ("my") report tabs. Every endpoint is self-only on the server. Results
 * for a term are shown only while that term's fee gate is open: held-back terms
 * are named, never described, and no figures are shown for them.
 */
import { Lock } from 'lucide-react'
import { Chart } from '@/components/shared/chart'
import { ChartCard } from '@/components/shared/ChartCard'
import {
  useMyAssignments, useMyAttendance, useMyAttention, useMyFees, useMyLibrary, useMyOverview, useMyProgress,
} from '@/hooks/reporting/useStudentReporting'
import type {
  ApiStudentAssignmentRow, ApiStudentLoanRow, ApiStudentSubjectRow, StudentAssignmentStatus,
} from '@shared/types/reporting-student'
import { formatCount, formatDate, formatMwk, formatPercent, formatScore } from '@/lib/reportFormat'
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

const STATUS_LABEL: Record<StudentAssignmentStatus, string> = {
  SUBMITTED: 'Submitted',
  LATE: 'Submitted late',
  PENDING: 'Due',
  OVERDUE: 'Overdue',
}

export function StudentOverviewTab({ academicYear, term }: Period) {
  const overview = useMyOverview({ academicYear, term })
  const attention = useMyAttention({ academicYear, term })
  return (
    <PanelStack>
      <OverviewSection query={overview} label="My overview" placeholders={5} />
      <AttentionCard query={attention} title="For you to look at" />
    </PanelStack>
  )
}

export function StudentProgressTab({ academicYear, term }: Period) {
  const q = useMyProgress({ academicYear, term })
  const d = q.data
  return (
    <PanelStack>
      {d?.currentWithheld ? (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-base bg-page p-4 text-sm text-brand-navy">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
          <p>
            Results for this term are being held back because of an outstanding fee balance. They will show here as soon as the balance is cleared —
            see the Fees tab for what is owed.
          </p>
        </div>
      ) : null}
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d && d.current ? [
          kpiTile('average', 'Term average', d.current.average, 'score', 'Mean score across all your subjects this term.', d.current.passStatus ? 'healthy' : 'critical'),
          kpiTile('grade', 'Overall grade', d.current.grade, 'text', 'Your grade for the term.'),
          kpiTile('position', 'Class position', d.current.position === null ? null : `${d.current.position} of ${d.current.classTotal ?? '—'}`, 'text', 'Where you rank in your class this term.'),
          kpiTile('class', 'Class average', d.classAverage, 'score', 'The average for your whole class, for comparison.'),
        ] : undefined}
      />
      <TwoUp>
        <ChartCard title="My average over time" sub={d ? `Pass mark ${d.passMark}` : undefined} isLoading={q.isLoading} height={260}>
          <Chart
            type="line"
            data={(d?.terms ?? []).map((t) => ({ x: t.label, average: t.average }))}
            series={[{ key: 'average', label: 'Average' }]}
            height={260}
            emptyStateMessage="No released results yet."
            ariaLabel="My average score by term"
          />
        </ChartCard>
        <ChartCard title="Subjects this term" sub="Score in each subject" isLoading={q.isLoading} height={260}>
          <Chart
            type="bar"
            data={(d?.subjects ?? []).map((s) => ({ x: s.subject, score: s.score }))}
            series={[{ key: 'score', label: 'Score' }]}
            height={260}
            emptyStateMessage={d?.currentWithheld ? 'Results are being held back.' : 'No results for this term yet.'}
            ariaLabel="My score in each subject this term"
          />
        </ChartCard>
      </TwoUp>
      <ReportCard title="Subject results" sub="Weakest first — distance from the pass mark shows how close you are">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable<ApiStudentSubjectRow>
            rows={d?.subjects}
            rowKey={(r) => r.subject}
            exportLabel="My subject results"
            emptyMessage={d?.currentWithheld ? 'Results are being held back.' : 'No results for this term yet.'}
            defaultSort={{ key: 'score', direction: 'asc' }}
            columns={[
              { key: 'subject', label: 'Subject', sortValue: (r) => r.subject },
              { key: 'score', label: 'Score', align: 'right', sortValue: (r) => r.score, cell: (r) => formatScore(r.score), exportValue: (r) => r.score },
              { key: 'grade', label: 'Grade', align: 'right', sortValue: (r) => r.grade },
              { key: 'change', label: 'Since last term', align: 'right', hideOnMobile: true, sortValue: (r) => r.change, cell: (r) => (r.change === null ? 'N/A' : `${r.change > 0 ? '+' : ''}${Math.round(r.change * 10) / 10}`), exportValue: (r) => r.change },
              { key: 'distance', label: 'From pass mark', align: 'right', sortValue: (r) => r.distanceFromPass, cell: (r) => `${r.distanceFromPass >= 0 ? '+' : ''}${Math.round(r.distanceFromPass * 10) / 10}`, exportValue: (r) => r.distanceFromPass },
              { key: 'pass', label: 'Result', sortValue: (r) => (r.pass ? 1 : 0), cell: (r) => (r.pass ? 'Pass' : 'Below pass mark'), exportValue: (r) => (r.pass ? 'Pass' : 'Fail') },
            ]}
          />
        </QueryState>
      </ReportCard>
      {d && d.withheldTerms.length > 0 ? (
        <p role="note" className="rounded-lg border border-base bg-page px-3 py-2 text-xs text-muted">
          Results for {d.withheldTerms.map((t) => `Term ${t.term}, ${t.academicYear}`).join('; ')} are held back until the fee balance is cleared.
        </p>
      ) : null}
    </PanelStack>
  )
}

export function StudentAssignmentsTab({ academicYear, term }: Period) {
  const q = useMyAssignments({ academicYear, term })
  const d = q.data
  return (
    <PanelStack>
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          kpiTile('total', 'Assignments', d.totals.total, 'count', 'Assignments set for your class this term.'),
          kpiTile('done', 'Submitted', d.totals.submitted + d.totals.late, 'count', 'Handed in, on time or late.', 'neutral', `${formatCount(d.totals.late)} late`),
          kpiTile('pending', 'Still due', d.totals.pending, 'count', 'Not yet handed in and not yet past the due date.'),
          kpiTile('overdue', 'Overdue', d.totals.overdue, 'count', 'Past the due date and not handed in.', d.totals.overdue > 0 ? 'critical' : 'healthy'),
        ] : undefined}
      />
      <ReportCard title="My assignments" sub="Overdue and due soonest first">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable<ApiStudentAssignmentRow>
            rows={d?.rows}
            rowKey={(r) => r.assignmentId}
            exportLabel="My assignments"
            emptyMessage="No assignments this term."
            columns={[
              { key: 'title', label: 'Assignment', sortValue: (r) => r.title },
              { key: 'subject', label: 'Subject', sortValue: (r) => r.subject },
              { key: 'due', label: 'Due', sortValue: (r) => r.dueDate, cell: (r) => formatDate(r.dueDate), exportValue: (r) => formatDate(r.dueDate) },
              { key: 'status', label: 'Status', sortValue: (r) => r.status, cell: (r) => STATUS_LABEL[r.status], exportValue: (r) => STATUS_LABEL[r.status] },
              { key: 'at', label: 'Handed in', hideOnMobile: true, sortValue: (r) => r.submittedAt ?? '', cell: (r) => (r.submittedAt ? formatDate(r.submittedAt) : '—'), exportValue: (r) => (r.submittedAt ? formatDate(r.submittedAt) : '') },
            ]}
          />
        </QueryState>
      </ReportCard>
    </PanelStack>
  )
}

export function StudentLibraryTab({ academicYear, term }: Period) {
  const q = useMyLibrary({ academicYear, term })
  const d = q.data
  return (
    <PanelStack>
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          kpiTile('active', 'Books borrowed now', d.activeLoans, 'count', 'Books you currently have out.'),
          kpiTile('overdue', 'Overdue', d.overdueLoans, 'count', 'Books past their due date.', d.overdueLoans > 0 ? 'critical' : 'healthy'),
          kpiTile('year', 'Borrowed this year', d.borrowedThisYear, 'count', 'Books you have borrowed in this academic year.'),
          kpiTile('fines', 'Library fines owed', d.finesPendingAmount, 'mwk', 'Unpaid library fines.', d.finesPendingAmount > 0 ? 'watch' : 'healthy', d.finesPendingCount > 0 ? `${d.finesPendingCount} fine${d.finesPendingCount === 1 ? '' : 's'}` : undefined),
        ] : undefined}
      />
      <ReportCard title="Books I have out">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable<ApiStudentLoanRow>
            rows={d?.loans}
            rowKey={(r) => r.borrowingId}
            exportLabel="My library loans"
            emptyMessage="You have no books out."
            columns={[
              { key: 'book', label: 'Book', sortValue: (r) => r.bookTitle },
              { key: 'issued', label: 'Borrowed', hideOnMobile: true, sortValue: (r) => r.issuedAt, cell: (r) => formatDate(r.issuedAt), exportValue: (r) => formatDate(r.issuedAt) },
              { key: 'due', label: 'Due back', sortValue: (r) => r.dueDate, cell: (r) => formatDate(r.dueDate), exportValue: (r) => formatDate(r.dueDate) },
              { key: 'late', label: 'Days overdue', align: 'right', sortValue: (r) => r.daysOverdue, cell: (r) => (r.daysOverdue > 0 ? formatCount(r.daysOverdue) : '—'), exportValue: (r) => r.daysOverdue },
            ]}
          />
        </QueryState>
      </ReportCard>
    </PanelStack>
  )
}

export function StudentAttendanceTab({ academicYear, term }: Period) {
  const q = useMyAttendance({ academicYear, term })
  const d = q.data
  return (
    <PanelStack>
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          kpiTile('rate', 'Attendance', d.attendanceRate, 'percent', 'Days present or late, as a share of all days recorded this term.', d.attendanceRate !== null && d.attendanceRate < 85 ? 'watch' : 'neutral'),
          kpiTile('present', 'Present', d.present, 'count', 'Days marked present.'),
          kpiTile('late', 'Late', d.late, 'count', 'Days marked late (these count as attended).'),
          kpiTile('absent', 'Absent', d.absent, 'count', 'Days marked absent.'),
        ] : undefined}
      />
      <TwoUp>
        <ChartCard title="Attendance by week" sub="Week commencing (Monday)" isLoading={q.isLoading} height={260}>
          <Chart
            type="line"
            data={(d?.weekly ?? []).flatMap((w) => (w.rate === null ? [] : [{ x: w.label, rate: w.rate }]))}
            series={[{ key: 'rate', label: 'Attendance %' }]}
            height={260}
            emptyStateMessage="No attendance recorded for this term."
            ariaLabel="My weekly attendance rate"
          />
        </ChartCard>
        <ReportCard title="Recent absences">
          <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
            <ReportTable
              rows={d?.recentAbsences.map((date) => ({ date }))}
              rowKey={(r) => r.date}
              exportLabel="My recent absences"
              emptyMessage="No absences recorded this term."
              columns={[{ key: 'date', label: 'Date', sortValue: (r) => r.date, cell: (r) => formatDate(r.date), exportValue: (r) => formatDate(r.date) }]}
            />
          </QueryState>
        </ReportCard>
      </TwoUp>
    </PanelStack>
  )
}

export function StudentFeesTab({ academicYear, term }: Period) {
  const q = useMyFees({ academicYear, term })
  const d = q.data
  return (
    <PanelStack>
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          kpiTile('invoiced', 'Fees this year', d.invoiced, 'mwk', 'Total invoiced for the academic year.'),
          kpiTile('paid', 'Paid', d.paid, 'mwk', 'Payments received.', 'neutral', d.paidPct === null ? undefined : `${formatPercent(d.paidPct)} of fees`),
          kpiTile('balance', 'Balance', d.balance, 'mwk', 'Still to be paid.', d.balance > 0 ? 'watch' : 'healthy'),
          kpiTile('overdue', 'Overdue', d.overdue, 'mwk', 'Unpaid balance on invoices already past their due date.', d.overdue > 0 ? 'critical' : 'healthy', d.nextInstallment ? `Next instalment ${formatMwk(d.nextInstallment.amount)} on ${formatDate(d.nextInstallment.dueDate)}` : undefined),
        ] : undefined}
      />
      <ReportCard title="Invoices by term">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable
            rows={d?.invoices}
            rowKey={(r) => String(r.term)}
            exportLabel="My fee invoices"
            emptyMessage="No invoices for this year."
            columns={[
              { key: 'term', label: 'Term', sortValue: (r) => r.term, cell: (r) => `Term ${r.term}`, exportValue: (r) => `Term ${r.term}` },
              { key: 'total', label: 'Total', align: 'right', sortValue: (r) => r.total, cell: (r) => formatMwk(r.total), exportValue: (r) => r.total },
              { key: 'paid', label: 'Paid', align: 'right', sortValue: (r) => r.paid, cell: (r) => formatMwk(r.paid), exportValue: (r) => r.paid },
              { key: 'balance', label: 'Balance', align: 'right', sortValue: (r) => r.balance, cell: (r) => formatMwk(r.balance), exportValue: (r) => r.balance },
              { key: 'due', label: 'Due', hideOnMobile: true, sortValue: (r) => r.dueDate, cell: (r) => formatDate(r.dueDate), exportValue: (r) => formatDate(r.dueDate) },
              { key: 'status', label: 'Status', sortValue: (r) => r.status, cell: (r) => (r.overdue ? 'Overdue' : r.status), exportValue: (r) => (r.overdue ? 'Overdue' : r.status) },
            ]}
          />
        </QueryState>
      </ReportCard>
    </PanelStack>
  )
}
