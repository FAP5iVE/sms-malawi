'use client'

/**
 * Executive summary for school leadership: the headline KPIs from every domain
 * the viewer may see, composed server-side from the same overviews the domain
 * reports use (so a number here always matches the report it links to).
 */
import { useExecutiveAttention, useExecutiveOverview, useExecutiveRetention } from '@/hooks/reporting/useExecutiveReporting'
import type { ApiRetentionFormRow } from '@shared/types/reporting-executive'
import { EXIT_REASON_LABELS } from '@shared/constants/malawi'
import { formatDate, formatPercent } from '@/lib/reportFormat'
import { ReportTable } from '../ui/ReportTable'
import { kpiTile } from './kpiHelpers'
import { useReportSummary } from '../ui/ReportExport'
import { InsightList } from '../ui/InsightList'
import { ReportCard } from '../ui/ReportCard'
import { ReportKpiStrip } from '../ui/ReportKpiStrip'
import { QueryState } from '../ui/ReportStates'
import { AttentionCard, PanelStack } from './common'

interface Period {
  academicYear: string
  term: number
}

export function ExecutiveOverviewTab({ academicYear, term }: Period) {
  const q = useExecutiveOverview({ academicYear, term })
  const attention = useExecutiveAttention({ academicYear, term })
  const d = q.data
  useReportSummary('Executive summary', d?.groups.flatMap((g) => g.kpis), d?.insights)

  return (
    <PanelStack>
      {q.isError ? (
        <QueryState isLoading={false} isError onRetry={() => void q.refetch()}>
          {null}
        </QueryState>
      ) : null}
      {q.isLoading ? <ReportKpiStrip isLoading kpis={undefined} placeholders={8} /> : null}
      {d && d.insights.length > 0 ? (
        <ReportCard title="What stands out" sub="Across academics, students, finance and operations">
          <InsightList insights={d.insights} />
        </ReportCard>
      ) : null}
      <AttentionCard query={attention} title="Needs leadership attention" />
      {d?.groups.map((g) => (
        <section key={g.key} aria-label={g.title} className="space-y-2">
          <h3 className="font-heading text-sm font-semibold text-brand-navy">{g.title}</h3>
          <ReportKpiStrip kpis={g.kpis} isLoading={false} />
        </section>
      ))}
      {d?.warnings.map((w) => (
        <p key={w.key} role="note" className="rounded-lg border border-base bg-page px-3 py-2 text-xs text-muted">
          {w.message}
        </p>
      ))}
    </PanelStack>
  )
}

// ─── RETENTION: repetition by form + exits by reason ─────────────────────────
// Counts only; no student is named. Repetition comes from the year outcomes
// written when a promotion run is committed, so a year with no committed run
// shows nothing rather than an estimate.

export function RetentionPanel({ academicYear, term }: Period) {
  const q = useExecutiveRetention({ academicYear, term })
  const d = q.data
  const totalRepeated = d?.repetitionByForm.reduce((s, r) => s + r.repeated, 0) ?? 0
  const totalStudents = d?.repetitionByForm.reduce((s, r) => s + r.students, 0) ?? 0
  return (
    <PanelStack>
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          kpiTile('repeated', 'Repeating this year', totalRepeated, 'count', `Students held back in the ${academicYear} promotion run (of ${totalStudents} recorded).`, totalRepeated > 0 ? 'watch' : 'healthy'),
          kpiTile('multi', 'Repeated more than once', d.multiYearRepeaters, 'count', 'Students who have repeated in two or more recorded years.', d.multiYearRepeaters > 0 ? 'watch' : 'healthy'),
          kpiTile('exits', 'Exits this year', d.exits.total, 'count', `Students archived with an exit date between ${formatDate(d.exits.windowStart)} and ${formatDate(d.exits.windowEnd)}.`),
          kpiTile('noexit', 'Archived, no exit record', d.archivedWithoutExitRecord, 'count', 'Archived students with no reason or date recorded (archived before exit records were required).'),
        ] : undefined}
      />
      <ReportCard title="Repetition by form" sub={`Promotion outcomes, ${academicYear}`}>
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable<ApiRetentionFormRow> rows={d?.repetitionByForm} rowKey={(r) => String(r.form)} exportLabel="Repetition by form" emptyMessage="No promotion run has been committed for this year yet." columns={[
            { key: 'form', label: 'Form', sortValue: (r) => r.form, cell: (r) => `Form ${r.form}` },
            { key: 'students', label: 'Students', align: 'right', sortValue: (r) => r.students, cell: (r) => String(r.students) },
            { key: 'promoted', label: 'Promoted', align: 'right', sortValue: (r) => r.promoted, cell: (r) => String(r.promoted) },
            { key: 'repeated', label: 'Repeated', align: 'right', sortValue: (r) => r.repeated, cell: (r) => String(r.repeated) },
            { key: 'graduated', label: 'Graduated / awaiting MANEB', align: 'right', sortValue: (r) => r.graduated + r.awaitingManeb, cell: (r) => String(r.graduated + r.awaitingManeb) },
            { key: 'rate', label: 'Repetition rate', align: 'right', sortValue: (r) => r.repetitionRate ?? -1, cell: (r) => (r.repetitionRate == null ? '-' : formatPercent(r.repetitionRate)), exportValue: (r) => r.repetitionRate ?? '' },
          ]} />
        </QueryState>
      </ReportCard>
      <ReportCard title="Exits by reason" sub={d ? `${formatDate(d.exits.windowStart)} to ${formatDate(d.exits.windowEnd)}` : undefined}>
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable<{ reason: string; count: number }> rows={d?.exits.byReason} rowKey={(r) => r.reason} exportLabel="Exits by reason" emptyMessage="No exits recorded in this academic year." columns={[
            { key: 'reason', label: 'Reason', sortValue: (r) => r.reason, cell: (r) => (EXIT_REASON_LABELS as Record<string, string>)[r.reason] ?? 'Not recorded', exportValue: (r) => (EXIT_REASON_LABELS as Record<string, string>)[r.reason] ?? 'Not recorded' },
            { key: 'count', label: 'Students', align: 'right', sortValue: (r) => r.count, cell: (r) => String(r.count) },
          ]} />
        </QueryState>
      </ReportCard>
    </PanelStack>
  )
}
