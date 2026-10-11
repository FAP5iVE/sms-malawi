'use client'

/**
 * Admissions and enrollment report tabs.
 *
 * Admissions: the application funnel, the open review queue and how long
 * decisions take (measured from audit events, since an application's review
 * timestamp is overwritten when it converts to a student).
 * Enrollment: who is on the roll this year, and where the records need work.
 */
import { Chart } from '@/components/shared/chart'
import { ChartCard } from '@/components/shared/ChartCard'
import {
  useAdmissionsAttention, useAdmissionsOverview, useAdmissionsPipeline, useEnrollment,
} from '@/hooks/reporting/useAdmissionsReporting'
import type { ApiLabelCount } from '@shared/types/reporting-admissions'
import { formatCount, formatDays } from '@/lib/reportFormat'
import { ReportCard } from '../ui/ReportCard'
import { ReportTable } from '../ui/ReportTable'
import { QueryState } from '../ui/ReportStates'
import { ReportKpiStrip } from '../ui/ReportKpiStrip'
import { kpiTile } from './kpiHelpers'
import { AttentionCard, OverviewSection, PanelStack, TwoUp } from './common'

interface Period {
  academicYear: string
  term?: number
}

const counts = (rows: readonly ApiLabelCount[] | undefined) => (rows ?? []).map((r) => ({ x: r.label, count: r.count }))

export function AdmissionsTab({ academicYear, term }: Period) {
  const overview = useAdmissionsOverview({ academicYear, term })
  const attention = useAdmissionsAttention()
  const q = useAdmissionsPipeline(12)
  const d = q.data
  return (
    <PanelStack>
      <OverviewSection query={overview} label="Admissions overview" placeholders={6} />
      <AttentionCard query={attention} title="Admissions attention queue" />
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          kpiTile('received', 'Applications received', d.received, 'count', `Submitted in the last ${d.windowMonths} months.`),
          kpiTile('approval', 'Approval rate', d.approvalRate, 'percent', 'Accepted applications as a share of decided ones.'),
          kpiTile('conversion', 'Admitted', d.conversionRate, 'percent', 'Applicants who became students, as a share of everyone who applied.'),
          kpiTile('review', 'Time to decision', d.avgReviewDays, 'days', 'Average days from submission to first decision.', 'neutral', d.medianReviewDays === null ? undefined : `Median ${formatDays(d.medianReviewDays)}`),
          kpiTile('toAdmit', 'Approval to admission', d.avgApprovalToAdmissionDays, 'days', 'Average days between approval and the student record being created.'),
          kpiTile('pending', 'Awaiting review', d.backlog.pending, 'count', 'Applications not yet decided (all time).', d.backlog.pending > 0 ? 'watch' : 'healthy', d.backlog.oldestPendingDays === null ? undefined : `Oldest ${formatDays(d.backlog.oldestPendingDays)}`),
          kpiTile('awaiting', 'Approved, not admitted', d.backlog.awaitingAdmission, 'count', 'Accepted applicants who have not yet been admitted as students.', d.backlog.awaitingAdmission > 0 ? 'watch' : 'healthy'),
        ] : undefined}
      />
      <TwoUp>
        <ChartCard title="Applications over time" sub="Received and admitted, by month" isLoading={q.isLoading} height={260}>
          <Chart
            type="line"
            data={(d?.trend ?? []).map((t) => ({ x: t.label, received: t.received, admitted: t.admitted }))}
            series={[{ key: 'received', label: 'Received' }, { key: 'admitted', label: 'Admitted' }]}
            height={260}
            emptyStateMessage="No applications in this window."
            ariaLabel="Applications received and admitted by month"
          />
        </ChartCard>
        <ChartCard title="Application status" isLoading={q.isLoading} height={260}>
          <Chart type="donut" data={(d?.byStatus ?? []).map((s) => ({ x: s.label, count: s.count }))} series={[{ key: 'count', label: 'Applications' }]} height={260} emptyStateMessage="No applications in this window." ariaLabel="Applications by status" />
        </ChartCard>
        <ChartCard title="Review queue by age" sub="Applications still awaiting a decision" isLoading={q.isLoading} height={240}>
          <Chart type="bar" data={counts(d?.backlog.pendingAging)} series={[{ key: 'count', label: 'Applications' }]} height={240} emptyStateMessage="No applications are waiting." ariaLabel="Pending applications by days waiting" />
        </ChartCard>
        <ChartCard title="Applications by form" sub="Form applied for" isLoading={q.isLoading} height={240}>
          <Chart
            type="bar"
            data={(d?.byForm ?? []).map((f) => ({ x: f.label, received: f.received, admitted: f.admitted }))}
            series={[{ key: 'received', label: 'Received' }, { key: 'admitted', label: 'Admitted' }]}
            height={240}
            emptyStateMessage="No applications in this window."
            ariaLabel="Applications received and admitted by form"
          />
        </ChartCard>
        <ChartCard title="Applicants by district" isLoading={q.isLoading} height={260}>
          <Chart type="bar" data={counts(d?.byDistrict)} series={[{ key: 'count', label: 'Applicants' }]} height={260} emptyStateMessage="No district recorded." ariaLabel="Applicants by district" />
        </ChartCard>
        <ReportCard title="Top previous schools">
          <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
            <ReportTable<ApiLabelCount>
              rows={d?.topPreviousSchools}
              rowKey={(r) => r.label}
              exportLabel="Applicants by previous school"
              emptyMessage="No previous schools recorded."
              columns={[
                { key: 'school', label: 'School', sortValue: (r) => r.label },
                { key: 'count', label: 'Applicants', align: 'right', sortValue: (r) => r.count, cell: (r) => formatCount(r.count) },
              ]}
            />
          </QueryState>
        </ReportCard>
      </TwoUp>
    </PanelStack>
  )
}

export function EnrollmentTab({ academicYear }: { academicYear: string }) {
  const q = useEnrollment({ academicYear })
  const d = q.data
  return (
    <PanelStack>
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          kpiTile('active', 'Active students', d.active, 'count', 'Students currently enrolled.', 'neutral', `${formatCount(d.totalRecords)} records in all`),
          kpiTile('new', 'New this year', d.newThisYear, 'count', 'Active students first registered since the academic year began.'),
          kpiTile('returning', 'Returning', d.returning, 'count', 'Active students registered before this academic year.'),
          kpiTile('noClass', 'Without a class', d.records.activeWithoutClass, 'count', 'Active students not placed in any class.', d.records.activeWithoutClass > 0 ? 'watch' : 'healthy'),
          kpiTile('noPhone', 'No guardian phone', d.records.missingGuardianPhone, 'count', 'Active students with no guardian phone on file — the school cannot reach their families.', d.records.missingGuardianPhone > 0 ? 'watch' : 'healthy'),
          kpiTile('maneb', 'Awaiting MANEB registration', d.records.awaitingManeb, 'count', 'Active Form 4 students not yet registered for MANEB.'),
        ] : undefined}
      />
      <TwoUp>
        <ChartCard title="Students by form" sub="Male and female" isLoading={q.isLoading} height={260}>
          <Chart
            type="stackedBar"
            data={(d?.byForm ?? []).map((f) => ({ x: f.label, male: f.male, female: f.female }))}
            series={[{ key: 'male', label: 'Male' }, { key: 'female', label: 'Female' }]}
            height={260}
            emptyStateMessage="No students enrolled."
            ariaLabel="Active students by form and sex"
          />
        </ChartCard>
        <ChartCard title="Registrations over time" sub="Students first registered, by month" isLoading={q.isLoading} height={260}>
          <Chart type="bar" data={(d?.registrationTrend ?? []).map((r) => ({ x: r.label, registered: r.registered }))} series={[{ key: 'registered', label: 'Registered' }]} height={260} emptyStateMessage="No registrations in this window." ariaLabel="Student registrations by month" />
        </ChartCard>
        <ChartCard title="Student status" isLoading={q.isLoading} height={240}>
          <Chart type="donut" data={(d?.byStatus ?? []).map((s) => ({ x: s.label, count: s.count }))} series={[{ key: 'count', label: 'Students' }]} height={240} emptyStateMessage="No students." ariaLabel="Students by status" />
        </ChartCard>
        <ChartCard title="Students by district" isLoading={q.isLoading} height={240}>
          <Chart type="bar" data={counts(d?.byDistrict)} series={[{ key: 'count', label: 'Students' }]} height={240} emptyStateMessage="No district recorded." ariaLabel="Active students by district" />
        </ChartCard>
      </TwoUp>
      <ReportCard title="Class sizes" sub="Active students per class this year">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable
            rows={d?.byClass}
            rowKey={(r) => r.classId}
            exportLabel="Class sizes"
            emptyMessage="No classes."
            columns={[
              { key: 'class', label: 'Class', sortValue: (r) => r.className },
              { key: 'form', label: 'Form', align: 'right', hideOnMobile: true, sortValue: (r) => r.form },
              { key: 'students', label: 'Students', align: 'right', sortValue: (r) => r.students, cell: (r) => formatCount(r.students) },
            ]}
          />
        </QueryState>
      </ReportCard>
    </PanelStack>
  )
}
