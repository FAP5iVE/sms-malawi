'use client'

/**
 * Loading / empty / error / insufficient-data states shared by every report
 * and dashboard widget, so the three states look identical everywhere and an
 * empty result can never be mistaken for a stuck skeleton.
 */
import { AlertTriangle, BarChart2, RefreshCw } from 'lucide-react'
import type { ReactNode } from 'react'

export function ReportLoading({ label = 'Loading', height = 160 }: { label?: string; height?: number }) {
  return (
    <div role="status" aria-label={`${label} — loading`} className="space-y-2" style={{ minHeight: height }}>
      <div className="skeleton h-3 w-1/3 rounded" aria-hidden />
      <div className="skeleton w-full rounded" style={{ height: Math.max(height - 24, 40) }} aria-hidden />
    </div>
  )
}

export function ReportEmpty({ message = 'No data for this selection.' }: { message?: string }) {
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-2 py-8 text-muted">
      <BarChart2 className="h-7 w-7 opacity-30" aria-hidden />
      <p className="text-sm text-center">{message}</p>
    </div>
  )
}

export function ReportError({
  message = 'This section could not be loaded.',
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <AlertTriangle className="h-6 w-6 text-brand-coral" aria-hidden />
      <p className="text-sm text-muted">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1.5 rounded-lg border border-base px-3 py-1.5 text-xs font-medium text-brand-navy hover:bg-base focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry
        </button>
      )}
    </div>
  )
}

/**
 * Renders the right one of loading / error / empty / content for a query.
 * `isEmpty` is decided by the caller because "empty" differs per payload.
 */
export function QueryState({
  isLoading,
  isError,
  isEmpty,
  onRetry,
  emptyMessage,
  errorMessage,
  loadingLabel,
  loadingHeight,
  children,
}: {
  isLoading: boolean
  isError?: boolean
  isEmpty?: boolean
  onRetry?: () => void
  emptyMessage?: string
  errorMessage?: string
  loadingLabel?: string
  loadingHeight?: number
  children: ReactNode
}) {
  if (isLoading) return <ReportLoading label={loadingLabel} height={loadingHeight} />
  if (isError) return <ReportError message={errorMessage} onRetry={onRetry} />
  if (isEmpty) return <ReportEmpty message={emptyMessage} />
  return <>{children}</>
}
