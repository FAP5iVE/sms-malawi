'use client'

/**
 * ReportCard — the thin bordered card every report/dashboard widget sits in.
 * Optional `href` renders a "View report" style link so a dashboard widget can
 * drill into the report that explains it.
 */
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function ReportCard({
  title,
  sub,
  href,
  hrefLabel = 'View report',
  actions,
  children,
  className,
}: {
  title: string
  sub?: string
  href?: string
  hrefLabel?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-xl border border-base bg-surface p-3 sm:p-5', className)}>
      <header className="mb-3 flex items-start justify-between gap-3 sm:mb-4">
        <div className="min-w-0">
          <h3 className="font-heading text-sm font-semibold text-brand-navy">{title}</h3>
          {sub ? <p className="mt-0.5 text-xs text-muted">{sub}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {href ? (
            <Link
              href={href}
              className="inline-flex items-center gap-0.5 whitespace-nowrap text-xs font-medium text-brand-teal hover:underline focus:outline-none focus:ring-2 focus:ring-brand-teal/30 rounded"
            >
              {hrefLabel}
              <ArrowUpRight className="h-3 w-3" aria-hidden />
            </Link>
          ) : null}
        </div>
      </header>
      {children}
    </section>
  )
}

/** Section heading inside a report tab (title + one-line description). */
export function ReportSectionHeader({
  title,
  description,
  icon,
}: {
  title: string
  description?: string
  icon?: ReactNode
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        {icon ? <span className="text-brand-teal">{icon}</span> : null}
        <h2 className="font-heading text-base font-bold text-brand-navy">{title}</h2>
      </div>
      {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
    </div>
  )
}
