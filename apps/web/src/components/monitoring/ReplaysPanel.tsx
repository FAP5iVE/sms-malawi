/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/monitoring/ReplaysPanel.tsx
 * [PURPOSE]: Session Replay list, rendered as cards (not a dense table —
 *   a replay is a rich, multi-attribute item). Each card opens Sentry's
 *   own hosted player in a new tab; we do not rebuild video playback.
 * [DEPENDS ON]: @/hooks/useMonitoring
 */
'use client'

import { Video, AlertCircle, ExternalLink } from 'lucide-react'
import { useMonitoringReplays } from '@/hooks/useMonitoring'

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}m ${s}s`
}

export function ReplaysPanel() {
  const { data, isLoading } = useMonitoringReplays()
  const replays = data?.data ?? []

  if (isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading replays">
        {[0, 1, 2].map((i) => <div key={i} className="skeleton h-24 w-full rounded-xl" aria-hidden />)}
      </div>
    )
  }

  if (replays.length === 0) {
    return <p className="text-sm text-muted py-8 text-center">No session replays recorded in this window.</p>
  }

  return (
    <div className="space-y-3">
      {replays.map((r) => (
        <a
          key={r.id}
          href={`https://5ivestack-labs.sentry.io/replays/${r.id}/`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 bg-surface border border-base rounded-xl p-4 hover:border-brand-teal/40 transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-brand-navy/10 flex items-center justify-center shrink-0">
            <Video className="w-5 h-5 text-brand-navy" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-body">
              {formatDuration(r.duration)} session {r.browser ? `\u00b7 ${r.browser.name} ${r.browser.version}` : ''}
            </p>
            <p className="text-xs text-muted truncate">{r.urls[0] ?? 'Unknown page'}</p>
          </div>
          {r.errorCount > 0 && (
            <span className="flex items-center gap-1 text-xs font-semibold text-brand-coral shrink-0">
              <AlertCircle className="w-3.5 h-3.5" /> {r.errorCount}
            </span>
          )}
          <ExternalLink className="w-4 h-4 text-muted shrink-0" aria-hidden />
        </a>
      ))}
    </div>
  )
}