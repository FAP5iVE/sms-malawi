'use client'

/**
 * DashboardIntro — the one-line orientation shown under the welcome header on
 * every role dashboard: what this dashboard is, which period it describes and
 * (optionally) a link to the full Reports workspace for the role. Keeps the
 * nine dashboards' headers consistent without each re-implementing it.
 */
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { periodLabel } from '@/lib/reportFormat'

export function DashboardIntro({
  title,
  summary,
  academicYear,
  term,
  reportsHref = '/reports',
  generatedAt,
}: {
  title: string
  summary: string
  academicYear?: string
  term?: number | null
  reportsHref?: string | null
  /** ISO timestamp of the data (optional refresh stamp). */
  generatedAt?: string
}) {
  const period = periodLabel(academicYear, term)
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 className="font-heading text-base font-semibold text-brand-navy">
          {title}
          {period ? <span className="font-normal text-muted"> — {period}</span> : null}
        </h2>
        <p className="mt-0.5 max-w-3xl text-sm text-muted">{summary}</p>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted">
        {generatedAt ? (
          <span>
            Updated{' '}
            {new Date(generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>
        ) : null}
        {reportsHref ? (
          <Link
            href={reportsHref}
            className="inline-flex items-center gap-0.5 font-medium text-brand-teal hover:underline"
          >
            Open reports
            <ArrowUpRight className="h-3 w-3" aria-hidden />
          </Link>
        ) : null}
      </div>
    </div>
  )
}
