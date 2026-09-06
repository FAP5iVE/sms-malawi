/**
 * [CHANGE TYPE]: TARGETED EDIT (OVERHAUL)
 * [FILE]: apps/web/src/components/placements/PlacementAnalyticsPanel.tsx
 * [PURPOSE]: Cohort placement analytics summary cards, redesigned around the
 *   reference module's three-status workflow (the old byStatus/verifiedCount/
 *   declinedCount/notPlacedCount breakdown is gone). Used two places: inside
 *   the merged Placement Registry & Analytics tab, and standalone on the
 *   Reports page (high_rank / exam_officer) — same component, same
 *   `academicYear` prop, so neither caller needed to change.
 * [DEPENDS ON]: @/hooks/usePlacements (usePlacementAnalytics)
 */
'use client'

import { usePlacementAnalytics } from '@/hooks/usePlacements'
import { GraduationCap, CheckCircle2, Clock, XCircle, Users, Building2 } from 'lucide-react'

interface StatCardProps {
  icon: React.ElementType
  label: string
  value: string | number
  accent: string
}

function StatCard({ icon: Icon, label, value, accent }: StatCardProps) {
  return (
    <div className="bg-surface border border-base rounded-xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${accent}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-heading font-bold text-body leading-tight">{value}</p>
        <p className="text-xs text-muted truncate">{label}</p>
      </div>
    </div>
  )
}

export function PlacementAnalyticsPanel({ academicYear }: { academicYear: string }) {
  const { data, isLoading } = usePlacementAnalytics(academicYear)

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-17 rounded-xl bg-page animate-pulse" />
        ))}
      </div>
    )
  }

  if (!data) {
    return <p className="text-sm text-muted">No placement analytics available for {academicYear} yet.</p>
  }

  const placementRate = data.cohortSize > 0 ? Math.round((data.confirmedCount / data.cohortSize) * 100) : 0
  const { male, female } = data.genderBreakdown
  const genderTotal = male + female
  const femalePct = genderTotal > 0 ? Math.round((female / genderTotal) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard icon={GraduationCap} label={`${academicYear} MSCE cohort`} value={data.cohortSize} accent="bg-brand-navy/10 text-brand-navy" />
        <StatCard icon={CheckCircle2} label="Confirmed placements" value={data.confirmedCount} accent="bg-brand-teal/10 text-brand-teal" />
        <StatCard icon={Clock} label="Pending approval" value={data.pendingApprovalCount} accent="bg-brand-amber/10 text-brand-amber" />
        <StatCard icon={XCircle} label="Rejected claims" value={data.rejectedCount} accent="bg-brand-coral/10 text-brand-coral" />
        <StatCard icon={Users} label="Placement rate" value={`${placementRate}%`} accent="bg-brand-navy/10 text-brand-navy" />
        <StatCard
          icon={Users}
          label="Female share of placements"
          value={genderTotal > 0 ? `${femalePct}%` : '—'}
          accent="bg-brand-teal/10 text-brand-teal"
        />
      </div>

      {data.topUniversities.length > 0 && (
        <div>
          <h4 className="font-heading font-semibold text-sm mb-2 flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-muted" /> Where students were placed
          </h4>
          <div className="flex flex-wrap gap-2">
            {data.topUniversities.map((u) => (
              <span
                key={u.universityId}
                className="inline-flex items-center gap-1.5 rounded-full border border-base bg-page px-3 py-1 text-xs font-medium text-body"
              >
                {u.universityName}
                <span className="text-muted">·</span>
                <span className="font-semibold">{u.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
