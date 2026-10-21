'use client'

/**
 * InsightList — deterministic findings ("what the numbers say") rendered with
 * severity so the reader gets interpretation, not just charts. Also used as
 * the dashboard attention queue (AttentionList below).
 */
import { useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Info, OctagonAlert, ChevronRight } from 'lucide-react'
import type { AttentionItem, ReportInsight, ReportInsightSeverity } from '@shared/types/reporting'
import { cn } from '@/lib/utils'
import { formatCount } from '@/lib/reportFormat'
import { ageLabel } from '@/lib/dashboardTiers'

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
  meta,
}: {
  severity: ReportInsightSeverity
  title: string
  detail?: string
  href?: string
  count?: number | null
  /** Short facts under the detail: owner, next step, age. */
  meta?: string[]
}) {
  const { box, icon, Icon } = TONE[severity]
  const inner = (
    <div className={cn('flex items-start gap-3 rounded-lg border px-3 py-2.5', box)}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', icon)} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-brand-navy">{title}</p>
        {detail ? <p className="text-xs text-muted">{detail}</p> : null}
        {meta && meta.length > 0 ? <p className="mt-0.5 text-xs text-muted">{meta.join(' · ')}</p> : null}
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

/**
 * Dashboard attention queue — AttentionItem[] already ranked by the server
 * (severity, then age), each with its count, owner, next step and age when known.
 * `limit` shows the first N and a button for the rest, so a long queue does not
 * push everything else down the screen.
 */
export function AttentionList({
  items,
  emptyMessage = 'Nothing needs attention right now.',
  className,
  limit,
}: {
  items: readonly AttentionItem[] | undefined
  emptyMessage?: string
  className?: string
  limit?: number
}) {
  const [expanded, setExpanded] = useState(false)
  if (!items || items.length === 0) return <p className="text-sm text-muted">{emptyMessage}</p>
  const capped = limit !== undefined && limit > 0 && items.length > limit && !expanded
  const shown = capped ? items.slice(0, limit) : items
  return (
    <div className={className}>
      <ul className="space-y-2" aria-label="Attention queue">
        {shown.map((i) => (
          <li key={i.key}>
            <Row
              severity={i.severity}
              title={i.label}
              detail={i.detail}
              href={i.href}
              count={i.count}
              meta={[i.owner ? `Owner: ${i.owner}` : '', i.action ? `Next: ${i.action}` : '', ageLabel(i.ageDays) ?? ''].filter(Boolean)}
            />
          </li>
        ))}
      </ul>
      {limit !== undefined && items.length > limit ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-2 min-h-11 w-full rounded-lg border border-base px-3 py-2 text-xs font-medium text-brand-navy hover:bg-page focus:outline-none focus:ring-2 focus:ring-brand-teal/30"
        >
          {expanded ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      ) : null}
    </div>
  )
}
