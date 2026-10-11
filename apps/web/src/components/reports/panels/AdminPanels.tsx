'use client'

/**
 * Admin report tabs: overview, security (sign-in outcomes and anomalies),
 * sessions (usage and how sessions end), governance (audit activity by actor,
 * area and sensitivity) and adoption (who actually uses the system). Only
 * facts the platform records are reported — nothing is inferred or estimated.
 */
import { Chart } from '@/components/shared/chart'
import { ChartCard } from '@/components/shared/ChartCard'
import {
  useAdminAttention, useAdminOverview, useAdoptionReport, useGovernanceReport, useSecurityReport, useSessionsReport,
} from '@/hooks/reporting/useAdminReporting'
import type { ApiAdoptionRole, ApiGovernanceCategory } from '@shared/types/reporting-admin'
import { formatCount, formatDate, formatPercent } from '@/lib/reportFormat'
import { FilterBar, FilterSelect } from '../ui/ReportFilters'
import { useReportParam } from '../ui/useReportParams'
import { ReportCard } from '../ui/ReportCard'
import { ReportTable } from '../ui/ReportTable'
import { QueryState } from '../ui/ReportStates'
import { ReportKpiStrip } from '../ui/ReportKpiStrip'
import { kpiTile } from './kpiHelpers'
import { AttentionCard, OverviewSection, PanelStack, TwoUp } from './common'

const DAY_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
]

/** Day-window filter backed by the `days` URL parameter. */
function useDays(fallback: number): [number, (v: string) => void] {
  const [raw, set] = useReportParam('days')
  return [Number(raw) || fallback, (v) => set(v)]
}

function DaysFilter({ days, onChange }: { days: number; onChange: (v: string) => void }) {
  return (
    <FilterBar>
      <FilterSelect label="Window" value={String(days)} onChange={onChange} options={DAY_OPTIONS} />
    </FilterBar>
  )
}

const label = (rows: readonly { label: string; count: number }[] | undefined) => (rows ?? []).map((r) => ({ x: r.label, count: r.count }))
const roleLabel = (role: string) => role.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

export function AdminOverviewSection() {
  const overview = useAdminOverview()
  const attention = useAdminAttention()
  return (
    <PanelStack>
      <OverviewSection query={overview} label="Administration overview" placeholders={6} />
      <AttentionCard query={attention} title="Needs attention" />
    </PanelStack>
  )
}

export function AdminSecurityTab() {
  const [days, setDays] = useDays(30)
  const q = useSecurityReport(days)
  const d = q.data
  return (
    <PanelStack>
      <DaysFilter days={days} onChange={setDays} />
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          kpiTile('ok', 'Successful sign-ins', d.successful, 'count', `Successful sign-ins in the last ${d.days} days.`),
          kpiTile('failed', 'Failed sign-ins', d.failed, 'count', 'Sign-in attempts rejected.', 'neutral'),
          kpiTile('rate', 'Failure rate', d.failureRate, 'percent', 'Failed attempts as a share of all attempts.', d.failureRate !== null && d.failureRate >= 20 ? 'watch' : 'neutral'),
          kpiTile('forced', 'Forced sign-outs', d.forcedLogouts.count, 'count', 'Sessions ended by an administrator.'),
          kpiTile('repeat', 'Repeated failures (24 h)', d.repeatedFailures.length, 'count', `Identifiers with ${d.repeatedFailureThreshold} or more failures in the last 24 hours.`, d.repeatedFailures.length > 0 ? 'watch' : 'healthy'),
          kpiTile('multiIp', 'Multi-location accounts', d.multiIpAccounts.length, 'count', `Accounts that signed in from ${d.multiIpThreshold} or more IP addresses in the last 7 days.`, d.multiIpAccounts.length > 0 ? 'watch' : 'healthy'),
        ] : undefined}
      />
      <ChartCard title="Sign-ins by day" sub="Successful and failed attempts" isLoading={q.isLoading} height={280}>
        <Chart
          type="line"
          data={(d?.trend ?? []).map((t) => ({ x: t.label, successful: t.successful, failed: t.failed }))}
          series={[{ key: 'successful', label: 'Successful' }, { key: 'failed', label: 'Failed' }]}
          height={280}
          emptyStateMessage="No sign-in activity in this window."
          ariaLabel="Successful and failed sign-ins by day"
        />
      </ChartCard>
      <TwoUp>
        <ReportCard title="Repeated failures" sub="Last 24 hours — possible guessing or a locked-out user">
          <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
            <ReportTable
              rows={d?.repeatedFailures}
              rowKey={(r) => r.identifier}
              exportLabel="Repeated sign-in failures"
              emptyMessage="No identifier has repeated failures."
              columns={[
                { key: 'who', label: 'Identifier', sortValue: (r) => r.identifier },
                { key: 'n', label: 'Failures', align: 'right', sortValue: (r) => r.failures, cell: (r) => formatCount(r.failures) },
                { key: 'last', label: 'Last attempt', align: 'right', sortValue: (r) => r.lastAt, cell: (r) => formatDate(r.lastAt), exportValue: (r) => r.lastAt },
              ]}
            />
          </QueryState>
        </ReportCard>
        <ReportCard title="Accounts used from several locations" sub="Last 7 days">
          <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
            <ReportTable
              rows={d?.multiIpAccounts}
              rowKey={(r) => r.uid}
              exportLabel="Multi-location accounts"
              emptyMessage="No account shows unusual location spread."
              columns={[
                { key: 'role', label: 'Role', sortValue: (r) => r.role, cell: (r) => roleLabel(r.role), exportValue: (r) => r.role },
                { key: 'ips', label: 'IP addresses', align: 'right', sortValue: (r) => r.ipCount, cell: (r) => formatCount(r.ipCount) },
                { key: 'sessions', label: 'Sessions', align: 'right', sortValue: (r) => r.sessions, cell: (r) => formatCount(r.sessions) },
              ]}
            />
          </QueryState>
        </ReportCard>
        <ReportCard title="Days with unusual failures" sub="Failed sign-ins well above the norm">
          <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
            <ReportTable
              rows={d?.bursts}
              rowKey={(r) => r.date}
              exportLabel="Failure bursts"
              emptyMessage="No unusual spikes in this window."
              columns={[
                { key: 'date', label: 'Day', sortValue: (r) => r.date, cell: (r) => r.label },
                { key: 'n', label: 'Failed sign-ins', align: 'right', sortValue: (r) => r.failed, cell: (r) => formatCount(r.failed) },
              ]}
            />
          </QueryState>
        </ReportCard>
        <ReportCard title="Forced sign-outs" sub="Most recent">
          <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
            <ReportTable
              rows={d?.forcedLogouts.recent}
              rowKey={(r) => `${r.at}|${r.role}`}
              exportLabel="Forced sign-outs"
              emptyMessage="No sessions were ended by an administrator."
              columns={[
                { key: 'at', label: 'When', sortValue: (r) => r.at, cell: (r) => formatDate(r.at), exportValue: (r) => r.at },
                { key: 'role', label: 'Role of user', sortValue: (r) => r.role, cell: (r) => roleLabel(r.role), exportValue: (r) => r.role },
              ]}
            />
          </QueryState>
        </ReportCard>
      </TwoUp>
    </PanelStack>
  )
}

export function AdminSessionsReportTab() {
  const [days, setDays] = useDays(30)
  const q = useSessionsReport(days)
  const d = q.data
  return (
    <PanelStack>
      <DaysFilter days={days} onChange={setDays} />
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          kpiTile('now', 'Active now', d.activeNow, 'count', 'Sessions with recent activity.'),
          kpiTile('total', 'Sessions in window', d.totalSessions, 'count', `Sessions started in the last ${d.days} days.`),
          kpiTile('avg', 'Average session', d.avgDurationMinutes === null ? null : `${Math.round(d.avgDurationMinutes)} min`, 'text', 'Mean time between sign-in and last activity or sign-out.', 'neutral', d.medianDurationMinutes === null ? undefined : `Median ${Math.round(d.medianDurationMinutes)} min`),
        ] : undefined}
      />
      <TwoUp>
        <ChartCard title="Sessions per day" sub="Sessions started and distinct users" isLoading={q.isLoading} height={260}>
          <Chart
            type="line"
            data={(d?.perDay ?? []).map((p) => ({ x: p.label, sessions: p.sessions, users: p.users }))}
            series={[{ key: 'sessions', label: 'Sessions' }, { key: 'users', label: 'Users' }]}
            height={260}
            emptyStateMessage="No sessions in this window."
            ariaLabel="Sessions and distinct users per day"
          />
        </ChartCard>
        <ChartCard title="Active now by role" isLoading={q.isLoading} height={260}>
          <Chart type="bar" data={(d?.activeByRole ?? []).map((r) => ({ x: roleLabel(r.role), count: r.count }))} series={[{ key: 'count', label: 'Sessions' }]} height={260} emptyStateMessage="Nobody is signed in." ariaLabel="Active sessions by role" />
        </ChartCard>
        <ChartCard title="Session length" isLoading={q.isLoading} height={240}>
          <Chart type="bar" data={label(d?.durationBands)} series={[{ key: 'count', label: 'Sessions' }]} height={240} emptyStateMessage="No sessions in this window." ariaLabel="Sessions by length" />
        </ChartCard>
        <ChartCard title="How sessions ended" isLoading={q.isLoading} height={240}>
          <Chart type="donut" data={label(d?.endReasons)} series={[{ key: 'count', label: 'Sessions' }]} height={240} emptyStateMessage="No sessions in this window." ariaLabel="Sessions by how they ended" />
        </ChartCard>
      </TwoUp>
    </PanelStack>
  )
}

export function AdminGovernanceTab() {
  const [days, setDays] = useDays(30)
  const q = useGovernanceReport(days)
  const d = q.data
  return (
    <PanelStack>
      <DaysFilter days={days} onChange={setDays} />
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [kpiTile('total', 'Audited actions', d.total, 'count', `Recorded in the last ${d.days} days.`)] : undefined}
      />
      <ChartCard title="Audit activity by day" isLoading={q.isLoading} height={260}>
        <Chart type="bar" data={(d?.perDay ?? []).map((p) => ({ x: p.label, count: p.count }))} series={[{ key: 'count', label: 'Actions' }]} height={260} emptyStateMessage="No audited activity in this window." ariaLabel="Audited actions per day" />
      </ChartCard>
      <TwoUp>
        <ChartCard title="By role" sub="Who is acting" isLoading={q.isLoading} height={240}>
          <Chart type="bar" data={(d?.byRole ?? []).map((r) => ({ x: roleLabel(r.label), count: r.count }))} series={[{ key: 'count', label: 'Actions' }]} height={240} emptyStateMessage="No audited activity." ariaLabel="Audited actions by role" />
        </ChartCard>
        <ChartCard title="By area" sub="Where it happens" isLoading={q.isLoading} height={240}>
          <Chart type="bar" data={label(d?.byDomain)} series={[{ key: 'count', label: 'Actions' }]} height={240} emptyStateMessage="No audited activity." ariaLabel="Audited actions by area" />
        </ChartCard>
      </TwoUp>
      <ReportCard title="Sensitive activity" sub="Actions that change who can do what, or touch money, grades and records">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable<ApiGovernanceCategory>
            rows={d?.categories}
            rowKey={(r) => r.key}
            exportLabel="Sensitive activity"
            emptyMessage="No sensitive activity in this window."
            defaultSort={{ key: 'count', direction: 'desc' }}
            columns={[
              { key: 'label', label: 'Category', sortValue: (r) => r.label, cell: (r) => <span title={r.description}>{r.label}</span>, exportValue: (r) => r.label },
              { key: 'count', label: 'Actions', align: 'right', sortValue: (r) => r.count, cell: (r) => formatCount(r.count) },
              { key: 'top', label: 'Most frequent', hideOnMobile: true, sortValue: (r) => r.top[0]?.action ?? '', cell: (r) => r.top.map((t) => `${t.action} (${t.count})`).join(', ') || '—', exportValue: (r) => r.top.map((t) => `${t.action} (${t.count})`).join(', ') },
            ]}
          />
        </QueryState>
      </ReportCard>
      <ReportCard title="Most frequent actions">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable
            rows={d?.byAction}
            rowKey={(r) => r.label}
            exportLabel="Audited actions"
            emptyMessage="No audited activity."
            columns={[
              { key: 'action', label: 'Action', sortValue: (r) => r.label },
              { key: 'count', label: 'Times', align: 'right', sortValue: (r) => r.count, cell: (r) => formatCount(r.count) },
            ]}
          />
        </QueryState>
      </ReportCard>
    </PanelStack>
  )
}

export function AdminAdoptionTab() {
  const q = useAdoptionReport()
  const d = q.data
  return (
    <PanelStack>
      <ReportKpiStrip
        isLoading={q.isLoading}
        kpis={d ? [
          kpiTile('accounts', 'Accounts', d.accounts, 'count', 'Active user accounts.'),
          kpiTile('a7', 'Active in 7 days', d.active7, 'count', 'Accounts with a session in the last week.'),
          kpiTile('a30', 'Active in 30 days', d.active30, 'count', 'Accounts with a session in the last month.'),
          kpiTile('rate', 'Monthly adoption', d.activeRate30, 'percent', 'Accounts active in the last 30 days as a share of all accounts.'),
        ] : undefined}
      />
      <TwoUp>
        <ChartCard title="Weekly active users" isLoading={q.isLoading} height={260}>
          <Chart type="line" data={(d?.weekly ?? []).map((w) => ({ x: w.label, users: w.users }))} series={[{ key: 'users', label: 'Users' }]} height={260} emptyStateMessage="No sessions recorded." ariaLabel="Distinct active users per week" />
        </ChartCard>
        <ChartCard title="What is being used" sub="Audited actions by area, last 30 days" isLoading={q.isLoading} height={260}>
          <Chart type="bar" data={label(d?.featureUsage)} series={[{ key: 'count', label: 'Actions' }]} height={260} emptyStateMessage="No activity recorded." ariaLabel="System usage by area" />
        </ChartCard>
      </TwoUp>
      <ReportCard title="Adoption by role" sub="Roles with the most inactive accounts first">
        <QueryState isLoading={q.isLoading} isError={q.isError} onRetry={() => void q.refetch()}>
          <ReportTable<ApiAdoptionRole>
            rows={d?.byRole}
            rowKey={(r) => r.role}
            exportLabel="Adoption by role"
            emptyMessage="No accounts."
            defaultSort={{ key: 'inactive', direction: 'desc' }}
            columns={[
              { key: 'role', label: 'Role', sortValue: (r) => r.role, cell: (r) => roleLabel(r.role), exportValue: (r) => r.role },
              { key: 'accounts', label: 'Accounts', align: 'right', sortValue: (r) => r.accounts, cell: (r) => formatCount(r.accounts) },
              { key: 'a7', label: 'Active 7 d', align: 'right', hideOnMobile: true, sortValue: (r) => r.active7, cell: (r) => formatCount(r.active7) },
              { key: 'a30', label: 'Active 30 d', align: 'right', sortValue: (r) => r.active30, cell: (r) => formatCount(r.active30) },
              { key: 'inactive', label: 'Inactive', align: 'right', sortValue: (r) => r.inactive, cell: (r) => formatCount(r.inactive) },
              { key: 'rate', label: 'Adoption', align: 'right', sortValue: (r) => r.activeRate, cell: (r) => formatPercent(r.activeRate), exportValue: (r) => r.activeRate },
            ]}
          />
        </QueryState>
      </ReportCard>
    </PanelStack>
  )
}
