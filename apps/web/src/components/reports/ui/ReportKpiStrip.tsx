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
import { StatusText } from '@/components/shared/StatusText'
import { ReportLoading } from './ReportStates'

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
  return good ? 'text-tone-teal' : 'text-tone-coral'
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

export function KpiTile({ kpi, showDescription = false }: { kpi: ReportKpi; showDescription?: boolean }) {
  const body = (
    <div
      className={cn(
        'flex h-full min-w-0 flex-col gap-1 rounded-xl app-tint p-3 sm:p-4',
        kpi.href && 'transition-colors hover:bg-brand-teal/10',
      )}
      title={kpi.description}
    >
      <div className="flex items-center gap-1.5">
        {kpi.status === 'healthy' && (
          <span className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[kpi.status])} aria-hidden />
        )}
        <p className="truncate text-xs font-medium text-muted">{kpi.label}</p>
        {kpi.status === 'healthy' && <span className="sr-only">{STATUS_TEXT[kpi.status]}</span>}
      </div>
      {kpi.status === 'watch' || kpi.status === 'critical' ? (
        <StatusText tone={kpi.status === 'critical' ? 'danger' : 'warning'}>{STATUS_TEXT[kpi.status]}</StatusText>
      ) : null}
      <p data-kpi-value className="break-words font-heading text-xl font-bold tabular-nums text-brand-navy">
        {formatKpiValue(kpi.value, kpi.unit, true)}
      </p>
      {kpi.subLabel ? <p className="text-xs text-muted">{kpi.subLabel}</p> : null}
      {kpi.comparison ? <Comparison c={kpi.comparison} unit={kpi.unit} /> : null}
      {showDescription ? <p className="mt-auto line-clamp-3 pt-1 text-xs leading-snug text-muted">{kpi.description}</p> : null}
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
  showDescription = false,
}: {
  kpis: readonly ReportKpi[] | undefined
  isLoading?: boolean
  placeholders?: number
  className?: string
  /** Print each KPI's definition under its value (otherwise it is a tooltip / screen-reader label only). */
  showDescription?: boolean
}) {
  const grid = 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6'
  if (isLoading) {
    return (
      <div className={cn(grid, className)}>
        {Array.from({ length: placeholders }, (_, i) => (
          <div key={i} className="rounded-xl app-tint p-4">
            <ReportLoading label="KPI" height={56} />
          </div>
        ))}
      </div>
    )
  }
  if (!kpis || kpis.length === 0) return null
  // 4 or fewer KPIs get wider tiles.
  const cols = kpis.length <= 4 ? 'grid grid-cols-2 gap-3 lg:grid-cols-4 sm:[&_[data-kpi-value]]:text-2xl' : grid
  return (
    <div className={cn(cols, className)}>
      {kpis.map((k) => (
        <KpiTile key={k.key} kpi={k} showDescription={showDescription} />
      ))}
    </div>
  )
}
