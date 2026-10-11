'use client'

/**
 * InsightList — deterministic findings ("what the numbers say") rendered with
 * severity so the reader gets interpretation, not just charts. Also used as
 * the dashboard attention queue (AttentionList below).
 */
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Info, OctagonAlert, ChevronRight } from 'lucide-react'
import type { AttentionItem, ReportInsight, ReportInsightSeverity } from '@shared/types/reporting'
import { cn } from '@/lib/utils'
import { formatCount } from '@/lib/reportFormat'

const TONE: Record<ReportInsightSeverity, { box: string; icon: string; Icon: typeof Info }> = {
  critical: { box: 'border-brand-coral/30 bg-brand-coral/5', icon: 'text-brand-coral', Icon: OctagonAlert },
  watch: { box: 'border-brand-amber/40 bg-brand-amber/5', icon: 'text-brand-amber', Icon: AlertTriangle },
  info: { box: 'border-base bg-page', icon: 'text-muted', Icon: Info },
  positive: { box: 'border-brand-teal/30 bg-brand-teal/5', icon: 'text-brand-teal', Icon: CheckCircle2 },
}

function Row({
  severity,
  title,
  detail,
  href,
  count,
}: {
  severity: ReportInsightSeverity
  title: string
  detail?: string
  href?: string
  count?: number | null
}) {
  const { box, icon, Icon } = TONE[severity]
  const inner = (
    <div className={cn('flex items-start gap-3 rounded-lg border px-3 py-2.5', box)}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', icon)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-brand-navy">{title}</p>
        {detail ? <p className="text-xs text-muted">{detail}</p> : null}
      </div>
      {count !== undefined && count !== null ? (
        <span className="shrink-0 font-heading text-sm font-bold tabular-nums text-brand-navy">
          {formatCount(count)}
        </span>
      ) : null}
      {href ? <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden /> : null}
    </div>
  )
  return href ? (
    <Link href={href} className="block focus:outline-none focus:ring-2 focus:ring-brand-teal/30 rounded-lg">
      {inner}
    </Link>
  ) : (
    inner
  )
}

export function InsightList({
  insights,
  emptyMessage,
  className,
}: {
  insights: readonly ReportInsight[] | undefined
  emptyMessage?: string
  className?: string
}) {
  if (!insights || insights.length === 0) {
    return emptyMessage ? <p className="text-sm text-muted">{emptyMessage}</p> : null
  }
  return (
    <ul className={cn('space-y-2', className)} aria-label="Findings">
      {insights.map((i) => (
        <li key={i.key}>
          <Row severity={i.severity} title={i.title} detail={i.detail} href={i.href} />
        </li>
      ))}
    </ul>
  )
}

/** Dashboard attention queue — AttentionItem[] with optional counts and drill-down links. */
export function AttentionList({
  items,
  emptyMessage = 'Nothing needs attention right now.',
  className,
}: {
  items: readonly AttentionItem[] | undefined
  emptyMessage?: string
  className?: string
}) {
  if (!items || items.length === 0) return <p className="text-sm text-muted">{emptyMessage}</p>
  return (
    <ul className={cn('space-y-2', className)} aria-label="Attention queue">
      {items.map((i) => (
        <li key={i.key}>
          <Row severity={i.severity} title={i.label} detail={i.detail} href={i.href} count={i.count} />
        </li>
      ))}
    </ul>
  )
}
