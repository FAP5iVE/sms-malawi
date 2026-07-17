/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/placements/PlacementAnalyticsPanel.tsx
 * [R-PHASE]: R18 — University Placement Module (Phase 11 Blueprint)
 * [PURPOSE]: Cohort university-placement analytics for an academic year — the
 *   panel the Reports page mounts for its Placements tab. Reads the server-
 *   computed getPlacementAnalytics via usePlacementAnalytics and shows the
 *   headline counts (cohort size, started, placed, confirmed, verified) plus
 *   the status breakdown and the most-common destination universities.
 * [DEPENDS ON]: @/hooks/usePlacements (usePlacementAnalytics), @shared/types/api
 */
'use client'

import { usePlacementAnalytics } from '@/hooks/usePlacements'
import { PlacementStatusBadge } from './PlacementStatusBadge'

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-base p-4">
      <p className="text-2xl font-heading font-bold text-brand-navy">{value}</p>
      <p className="text-xs text-muted mt-0.5">{label}</p>
    </div>
  )
}

export function PlacementAnalyticsPanel({ academicYear }: { academicYear?: string }) {
  const { data, isLoading } = usePlacementAnalytics(academicYear)

  if (isLoading) {
    return <div className="text-center py-12 text-muted text-sm animate-pulse">Loading placement analytics…</div>
  }
  if (!data) {
    return <div className="text-center py-12 text-muted text-sm">No placement analytics available.</div>
  }

  const statusEntries = Object.entries(data.byStatus).sort((a, b) => b[1] - a[1])
  const maxStatus = statusEntries.reduce((m, [, n]) => Math.max(m, n), 0)

  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Stat label="MSCE cohort" value={data.cohortSize} />
        <Stat label="Placements started" value={data.placementsStarted} />
        <Stat label="Placed" value={data.placedCount} />
        <Stat label="Confirmed" value={data.confirmedCount} />
        <Stat label="Verified" value={data.verifiedCount} />
      </div>

      <section>
        <h3 className="font-heading font-semibold text-sm mb-3">Status breakdown</h3>
        {statusEntries.length === 0 ? (
          <p className="text-sm text-muted">No placements generated yet for {data.academicYear}.</p>
        ) : (
          <div className="space-y-2">
            {statusEntries.map(([status, count]) => (
              <div key={status} className="flex items-center gap-3">
                <div className="w-40 shrink-0">
                  <PlacementStatusBadge status={status} />
                </div>
                <div className="flex-1 bg-base rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-brand-teal h-full rounded-full"
                    style={{ width: maxStatus > 0 ? `${(count / maxStatus) * 100}%` : '0%' }}
                  />
                </div>
                <span className="text-sm font-semibold w-8 text-right">{count}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {data.topUniversities.length > 0 && (
        <section>
          <h3 className="font-heading font-semibold text-sm mb-3">Most common destinations</h3>
          <ol className="space-y-1.5">
            {data.topUniversities.map((u, i) => (
              <li key={u.universityId} className="flex items-center gap-3 text-sm">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-brand-navy text-white text-xs font-bold shrink-0">
                  {i + 1}
                </span>
                <span className="flex-1">{u.universityName}</span>
                <span className="text-muted">{u.count}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
