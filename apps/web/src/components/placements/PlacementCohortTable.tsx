/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/placements/PlacementCohortTable.tsx
 * [R-PHASE]: R18 — University Placement Module (Phase 11 Blueprint)
 * [PURPOSE]: The staff cohort view — every UniversityPlacement for the year in
 *   the shared DataTable, showing status, recorded destination, and
 *   verification state, with status quick-filters and a per-row "Open" action.
 *   Placement rows carry a studentId (not a name); an optional nameFor resolver
 *   lets the parent supply display names it already holds (e.g. from the
 *   eligible-students list) without this component issuing its own lookups.
 * [DEPENDS ON]: @/components/shared/DataTable, ./PlacementStatusBadge,
 *   @shared/types/api (ApiUniversityPlacement)
 */
'use client'

import { DataTable, type DataColumn } from '@/components/shared/DataTable'
import { PlacementStatusBadge } from './PlacementStatusBadge'
import { CheckCircle2, Eye } from 'lucide-react'
import type { ApiUniversityPlacement } from '@shared/types/api'

const STATUS_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Eligibility ready', value: 'ELIGIBILITY_COMPUTED' },
  { label: 'Choices recorded', value: 'CHOICES_RECORDED' },
  { label: 'Placed', value: 'PLACED' },
  { label: 'Confirmed', value: 'CONFIRMED' },
  { label: 'Declined', value: 'DECLINED' },
  { label: 'Not placed', value: 'NOT_PLACED' },
]

interface Props {
  placements: ApiUniversityPlacement[]
  isLoading: boolean
  activeStatus: string
  onStatusFilter: (value: string) => void
  onOpen: (placement: ApiUniversityPlacement) => void
  /** Optional display-name resolver keyed by studentId. */
  nameFor?: (studentId: string) => string | undefined
}

function destinationOf(p: ApiUniversityPlacement): string {
  if (p.placedProgrammeName) {
    return p.placedUniversityName ? `${p.placedProgrammeName} — ${p.placedUniversityName}` : p.placedProgrammeName
  }
  if (p.placedProgrammeId) return `${p.placedProgrammeId} (${p.placedUniversityId ?? ''})`
  return '—'
}

export function PlacementCohortTable({ placements, isLoading, activeStatus, onStatusFilter, onOpen, nameFor }: Props) {
  const columns: DataColumn<ApiUniversityPlacement>[] = [
    {
      key: 'studentId',
      label: 'Student',
      priority: 'critical',
      render: (p) => <span className="font-medium">{nameFor?.(p.studentId) ?? p.studentId}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      priority: 'critical',
      render: (p) => <PlacementStatusBadge status={p.status} />,
    },
    {
      key: 'destination',
      label: 'Placed at',
      priority: 'important',
      render: (p) => <span className="text-sm text-muted">{destinationOf(p)}</span>,
    },
    {
      key: 'isVerified',
      label: 'Verified',
      priority: 'optional',
      render: (p) =>
        p.isVerified ? (
          <span className="inline-flex items-center gap-1 text-xs text-green-700">
            <CheckCircle2 className="w-3.5 h-3.5" /> Verified
          </span>
        ) : (
          <span className="text-xs text-muted">—</span>
        ),
    },
    {
      key: 'choices',
      label: 'Choices',
      priority: 'optional',
      render: (p) => <span className="text-sm">{p.choices.length}</span>,
    },
  ]

  return (
    <DataTable<ApiUniversityPlacement>
      data={placements}
      isLoading={isLoading}
      columns={columns}
      rowKey="id"
      quickFilters={STATUS_FILTERS}
      activeQuickFilter={activeStatus}
      onQuickFilter={onStatusFilter}
      emptyMessage="No placements yet for this cohort."
      mobileActions={[{ label: 'Open', icon: Eye, onClick: onOpen }]}
    />
  )
}
