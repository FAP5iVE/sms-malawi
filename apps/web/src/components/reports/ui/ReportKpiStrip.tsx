'use client'

/**
 * ReportKpiStrip — renders ReportKpi[] consistently. A KPI with value === null
 * shows "N/A" (never 0). Status drives the accent; the `description` (the KPI's
 * formula in words) is exposed as a tooltip and to screen readers; a KPI with
 * an href is a link to the report that investigates it.
 */
import Link from 'next/link'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import type { ReportKpi, ReportKpiComparison, ReportStatus } from '@shared/types/reporting'
import { formatKpiValue } from '@/lib/reportFormat'
import { cn } from '@/lib/utils'
import { ReportLoading } from './ReportStates'

const STATUS_BORDER: Record<ReportStatus, string> = {
  healthy: 'border-base',
  watch: 'border-brand-amber/50',
  critical: 'border-brand-coral/50',
  neutral: 'border-base',
}

const STATUS_DOT: Record<ReportStatus, string> = {
  healthy: 'bg-brand-teal',
  watch: 'bg-brand-amber',
  critical: 'bg-brand-coral',
  neutral: 'bg-transparent',
}

const STATUS_TEXT: Record<ReportStatus, string> = {
  healthy: 'Healthy',
  watch: 'Needs watching',
  critical: 'Critical',
  neutral: '',
}

function comparisonTone(c: ReportKpiComparison): string {
  if (c.direction === 'flat' || c.polarity === 'neutral') return 'text-muted'
  const good = (c.direction === 'up') === (c.polarity === 'up-good')
  return good ? 'text-brand-teal' : 'text-brand-coral'
}

function Comparison({ c, unit }: { c: ReportKpiComparison; unit: ReportKpi['unit'] }) {
  const Icon = c.direction === 'up' ? ArrowUpRight : c.direction === 'down' ? ArrowDownRight : Minus
  const magnitude = Math.abs(c.delta)
  const text =
    unit === 'percent'
      ? `${magnitude} pts`
      : unit === 'mwk'
        ? formatKpiValue(magnitude, 'mwk', true)
        : magnitude.toLocaleString('en-US')
  return (
    <p className={cn('flex items-center gap-0.5 text-xs', comparisonTone(c))}>
      <Icon className="h-3 w-3" aria-hidden />
      <span>
        {c.direction === 'flat' ? 'No change' : text} {c.label}
      </span>
    </p>
  )
}

export function KpiTile({ kpi }: { kpi: ReportKpi }) {
  const body = (
    <div
      className={cn(
        'flex h-full min-w-0 flex-col gap-1 rounded-xl border bg-surface p-3 sm:p-4',
        STATUS_BORDER[kpi.status],
        kpi.href && 'transition-colors hover:border-brand-teal/50',
      )}
      title={kpi.description}
    >
      <div className="flex items-center gap-1.5">
        {kpi.status !== 'neutral' && (
          <span className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[kpi.status])} aria-hidden />
        )}
        <p className="truncate text-xs font-medium uppercase tracking-wide text-muted">{kpi.label}</p>
        {kpi.status !== 'neutral' && <span className="sr-only">{STATUS_TEXT[kpi.status]}</span>}
      </div>
      <p className="break-words font-heading text-xl font-bold tabular-nums text-brand-navy sm:text-2xl">
        {formatKpiValue(kpi.value, kpi.unit, true)}
      </p>
      {kpi.subLabel ? <p className="text-xs text-muted">{kpi.subLabel}</p> : null}
      {kpi.comparison ? <Comparison c={kpi.comparison} unit={kpi.unit} /> : null}
    </div>
  )
  return kpi.href ? (
    <Link href={kpi.href} aria-label={`${kpi.label}: ${formatKpiValue(kpi.value, kpi.unit)}. ${kpi.description}`}>
      {body}
    </Link>
  ) : (
    body
  )
}

export function ReportKpiStrip({
  kpis,
  isLoading = false,
  placeholders = 6,
  className,
}: {
  kpis: readonly ReportKpi[] | undefined
  isLoading?: boolean
  placeholders?: number
  className?: string
}) {
  const grid = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6'
  if (isLoading) {
    return (
      <div className={cn(grid, className)}>
        {Array.from({ length: placeholders }, (_, i) => (
          <div key={i} className="rounded-xl border border-base bg-surface p-4">
            <ReportLoading label="KPI" height={56} />
          </div>
        ))}
      </div>
    )
  }
  if (!kpis || kpis.length === 0) return null
  // 4 or fewer KPIs get wider tiles.
  const cols = kpis.length <= 4 ? 'grid grid-cols-2 gap-3 lg:grid-cols-4' : grid
  return (
    <div className={cn(cols, className)}>
      {kpis.map((k) => (
        <KpiTile key={k.key} kpi={k} />
      ))}
    </div>
  )
}
