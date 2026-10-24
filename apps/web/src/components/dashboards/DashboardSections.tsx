'use client'

/**
 * Building blocks of the dashboard information hierarchy (Gap 8):
 *
 *   <PrimaryKpis>          the few headline figures, large, with their definition and period
 *   <TrendCard>            a chart card whose loading, failed and empty states look different
 *   <DashboardSection>     a collapsible group of secondary figures; its content is mounted
 *                          (and its data fetched) only when it is opened
 *   <CompactKpiList>       secondary KPIs as one dense list instead of a wall of cards
 *   <ReportLinks>          drill-down links to the full reports
 *
 * Nothing here computes a figure: every number is a KPI the server already
 * produced for the Reports page, so the dashboard and its report agree.
 */
import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, ChevronDown, Minus } from 'lucide-react'
import type { ReportKpi, ReportKpiComparison, ReportSectionData } from '@shared/types/reporting'
import type { ApiExecutiveOverview } from '@shared/types/reporting-executive'
import { ChartCard } from '@/components/shared/ChartCard'
import { QueryState, ReportError } from '@/components/reports/ui/ReportStates'
import { ReportKpiStrip } from '@/components/reports/ui/ReportKpiStrip'
import { InsightList } from '@/components/reports/ui/InsightList'
import type { QueryLike } from '@/components/reports/panels/common'
import { splitKpis, statusHeadline } from '@/lib/dashboardTiers'
import { formatKpiValue } from '@/lib/reportFormat'
import { cn } from '@/lib/utils'
import { DashboardIntro } from './DashboardIntro'

// ─── Primary KPIs ───────────────────────────────────────────────────────────

/**
 * The headline KPIs from the executive overview. While loading, four skeletons;
 * if the request failed, an error with a retry — never a row of zeros. A KPI whose
 * value cannot be computed shows "N/A".
 */
export function PrimaryKpis({
  overview,
  academicYear,
  term,
}: {
  overview: QueryLike<ApiExecutiveOverview>
  academicYear?: string
  term?: number | null
}) {
  const { data, isLoading, isError, refetch } = overview
  return (
    <section aria-label="School at a glance" className="space-y-3">
      <DashboardIntro
        title="School at a glance"
        summary="Review school results, attendance, enrolment and finances in one place."
        academicYear={academicYear}
        term={term}
        reportsHref="/reports?tab=overview"
        generatedAt={data?.generatedAt}
      />
      {isError ? (
        <QueryState isLoading={false} isError onRetry={() => void refetch()}>
          {null}
        </QueryState>
      ) : isLoading || !data ? (
        <ReportKpiStrip kpis={undefined} isLoading placeholders={4} />
      ) : data.primary.length === 0 ? (
        <p role="status" className="rounded-lg border border-base bg-page px-3 py-2 text-sm text-muted">
          No headline figures are available for your role.
        </p>
      ) : (
        <ReportKpiStrip kpis={data.primary} showDescription />
      )}
      {data?.warnings.map((w) => (
        <p key={w.key} role="note" className="rounded-lg border border-base bg-page px-3 py-2 text-xs text-muted">
          {w.message}
        </p>
      ))}
    </section>
  )
}

// ─── Trend card ─────────────────────────────────────────────────────────────

/** A chart in a card. Loading shows a skeleton; a failed request shows an error with retry; only a successful empty result reaches the chart's own empty message. */
export function TrendCard({
  title,
  sub,
  isLoading,
  isError,
  onRetry,
  height = 200,
  children,
}: {
  title: string
  sub?: string
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  height?: number
  children: ReactNode
}) {
  return (
    <ChartCard title={title} sub={sub} isLoading={isLoading} height={height}>
      {isError ? <ReportError message={`${title} could not be loaded.`} onRetry={onRetry} /> : children}
    </ChartCard>
  )
}

// ─── Compact KPI list ───────────────────────────────────────────────────────

const DOT: Record<ReportKpi['status'], string> = {
  healthy: 'bg-brand-teal',
  watch: 'bg-brand-amber',
  critical: 'bg-brand-coral',
  neutral: 'bg-transparent',
}

function CompactDelta({ c, unit }: { c: ReportKpiComparison; unit: ReportKpi['unit'] }) {
  const Icon = c.direction === 'up' ? ArrowUpRight : c.direction === 'down' ? ArrowDownRight : Minus
  const good = c.direction !== 'flat' && c.polarity !== 'neutral' && (c.direction === 'up') === (c.polarity === 'up-good')
  const bad = c.direction !== 'flat' && c.polarity !== 'neutral' && !good
  const mag = Math.abs(c.delta)
  const text = unit === 'percent' ? `${mag} pts` : unit === 'mwk' ? formatKpiValue(mag, 'mwk', true) : mag.toLocaleString('en-US')
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs', good ? 'text-brand-teal' : bad ? 'text-brand-coral' : 'text-muted')}>
      <Icon className="h-3 w-3" aria-hidden />
      {c.direction === 'flat' ? 'No change' : text}
      <span className="sr-only"> {c.label}</span>
    </span>
  )
}

/** Secondary KPIs as a dense list: label (with status dot), value, change. Each row links to its report. */
export function CompactKpiList({ kpis }: { kpis: readonly ReportKpi[] }) {
  if (kpis.length === 0) return null
  return (
    <ul className="divide-y divide-base" aria-label="Figures">
      {kpis.map((k) => {
        const row = (
          <div className="flex min-h-11 items-center justify-between gap-3 py-2" title={k.description}>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm text-body">
                {k.status !== 'neutral' ? <span className={cn('h-2 w-2 shrink-0 rounded-full', DOT[k.status])} aria-hidden /> : null}
                <span className="truncate">{k.label}</span>
                {k.status === 'watch' ? <span className="sr-only">Needs watching</span> : null}
                {k.status === 'critical' ? <span className="sr-only">Critical</span> : null}
              </p>
              {k.subLabel ? <p className="truncate text-xs text-muted">{k.subLabel}</p> : null}
            </div>
            <div className="shrink-0 text-right">
              <p className="font-heading text-sm font-bold tabular-nums text-brand-navy">{formatKpiValue(k.value, k.unit, true)}</p>
              {k.comparison ? <CompactDelta c={k.comparison} unit={k.unit} /> : null}
            </div>
          </div>
        )
        return (
          <li key={k.key}>
            {k.href ? (
              <Link href={k.href} aria-label={`${k.label}: ${formatKpiValue(k.value, k.unit)}. ${k.description}`} className="block rounded focus:outline-none focus:ring-2 focus:ring-brand-teal/30">
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        )
      })}
    </ul>
  )
}

// ─── Collapsible section ────────────────────────────────────────────────────

/**
 * A secondary group. Closed by default; the body (and the data fetches inside it)
 * mounts only once opened, so a closed section costs the page nothing.
 */
export function DashboardSection({
  title,
  headline,
  href,
  hrefLabel = 'Open report',
  defaultOpen = false,
  children,
}: {
  title: string
  headline?: string
  href?: string
  hrefLabel?: string
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  return (
    <section className="rounded-xl border border-base bg-surface">
      <h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-brand-teal/30 sm:px-5"
        >
          <span className="min-w-0">
            <span className="font-heading text-sm font-semibold text-brand-navy">{title}</span>
            {headline ? <span className="ml-2 text-xs text-muted">{headline}</span> : null}
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      </h3>
      <div id={panelId} hidden={!open} className="border-t border-base px-3 pb-3 pt-2 sm:px-5 sm:pb-5">
        {open ? (
          <div className="space-y-4">
            {children}
            {href ? (
              <Link href={href} className="inline-flex min-h-11 items-center gap-0.5 text-xs font-medium text-brand-teal hover:underline">
                {hrefLabel}
                <ArrowUpRight className="h-3 w-3" aria-hidden />
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}

// ─── Report links ───────────────────────────────────────────────────────────

export interface ReportLink {
  label: string
  href: string
  description?: string
}

/** Drill-down links to the full reports (filters, tables, exports live there). */
export function ReportLinks({ links, title = 'Detailed reports' }: { links: readonly ReportLink[]; title?: string }) {
  return (
    <section aria-label={title} className="rounded-xl border border-base bg-surface p-3 sm:p-5">
      <h3 className="mb-2 font-heading text-sm font-semibold text-brand-navy sm:mb-3">{title}</h3>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="flex min-h-11 flex-col justify-center rounded-lg border border-base px-3 py-2 hover:border-brand-teal/50 hover:bg-page focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
            >
              <span className="text-sm font-medium text-brand-navy">{l.label}</span>
              {l.description ? <span className="text-xs text-muted">{l.description}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ─── Tiered KPIs for a single-domain dashboard ──────────────────────────────


/**
 * The lead KPIs of a domain overview (Finance, Admin, HR, …) as large tiles, with
 * their definitions printed. Loading and failure are shown as such. The KPIs not
 * chosen here are listed by <SecondaryKpis> further down the page.
 */
export function PrimaryOverviewKpis({
  title,
  summary,
  academicYear,
  term,
  overview,
  preferred,
  max = 4,
  reportsHref = '/reports',
}: {
  title: string
  summary: string
  academicYear?: string
  term?: number | null
  overview: QueryLike<ReportSectionData>
  preferred: readonly string[]
  max?: number
  reportsHref?: string | null
}) {
  const { data, isLoading, isError, refetch } = overview
  const { primary } = splitKpis(data?.kpis, preferred, max)
  return (
    <section aria-label={title} className="space-y-3">
      <DashboardIntro title={title} summary={summary} academicYear={academicYear} term={term} reportsHref={reportsHref} generatedAt={data?.generatedAt} />
      {isError ? (
        <QueryState isLoading={false} isError onRetry={() => void refetch()}>
          {null}
        </QueryState>
      ) : isLoading || !data ? (
        <ReportKpiStrip kpis={undefined} isLoading placeholders={max} />
      ) : primary.length === 0 ? (
        <p role="status" className="rounded-lg border border-base bg-page px-3 py-2 text-sm text-muted">
          No figures are available for this period.
        </p>
      ) : (
        <ReportKpiStrip kpis={primary} showDescription />
      )}
      {data?.warnings?.map((w) => (
        <p key={w.key} role="note" className="rounded-lg border border-base bg-page px-3 py-2 text-xs text-muted">
          {w.message}
        </p>
      ))}
    </section>
  )
}

/** Everything in the overview that is not a lead KPI, plus its findings, in one collapsed section. */
export function SecondaryKpis({
  title = 'More figures',
  overview,
  preferred,
  max = 4,
  showInsights = false,
  extra,
}: {
  title?: string
  overview: QueryLike<ReportSectionData>
  preferred: readonly string[]
  max?: number
  showInsights?: boolean
  /** Further content for the section (a list, a chart). */
  extra?: ReactNode
}) {
  const { secondary } = splitKpis(overview.data?.kpis, preferred, max)
  const insights = showInsights ? overview.data?.insights ?? [] : []
  return (
    <DashboardSection title={title} headline={overview.data ? statusHeadline(secondary) || undefined : undefined}>
      <QueryState isLoading={overview.isLoading} isError={overview.isError} onRetry={() => void overview.refetch()} loadingHeight={80}>
        {secondary.length > 0 ? <CompactKpiList kpis={secondary} /> : <p className="text-sm text-muted">No further figures for this period.</p>}
        {insights.length > 0 ? (
          <div className="mt-3">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">What stands out</h4>
            <InsightList insights={insights} />
          </div>
        ) : null}
      </QueryState>
      {extra}
    </DashboardSection>
  )
}
