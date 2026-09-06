/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/placements/PlacementRegistryPanel.tsx
 * [PURPOSE]: The "Placement Registry & Analytics" tab from the reference
 *   module — open to EVERY role (placement.view / placement.viewAnalytics
 *   are universal; placement outcomes are culturally public at Malawian
 *   schools). Shows the cohort-wide analytics cards, then the list of
 *   CONFIRMED placements only — a pending student claim or a rejected one
 *   never appears here, matching the reference module exactly.
 * [DEPENDS ON]: @/hooks/usePlacements (usePlacementRegistry),
 *   @/components/placements/PlacementAnalyticsPanel, PlacementStatusBadge,
 *   @/components/shared/{AcademicYearSelect, DataTable}
 */
'use client'

import { useState } from 'react'
import { usePublicSchoolInfo } from '@/hooks/usePublic'
import { usePlacementRegistry } from '@/hooks/usePlacements'
import { AcademicYearSelect } from '@/components/shared/AcademicYearSelect'
import { DataTable, type DataColumn } from '@/components/shared/DataTable'
import { PlacementAnalyticsPanel } from '@/components/placements/PlacementAnalyticsPanel'
import { PlacementStatusBadge } from '@/components/placements/PlacementStatusBadge'
import type { ApiUniversityPlacement } from '@shared/types/api'

const FALLBACK_YEAR = '2025/2026'

function studentName(row: ApiUniversityPlacement): string {
  if (!row.student) return row.studentId
  return `${row.student.firstName} ${row.student.otherNames ? row.student.otherNames + ' ' : ''}${row.student.lastName}`
}

export function PlacementRegistryPanel() {
  const { data: schoolInfo } = usePublicSchoolInfo()
  const [academicYear, setAcademicYear] = useState<string>('')
  const effectiveYear = academicYear || schoolInfo?.currentYear || FALLBACK_YEAR

  const { data: placements = [], isLoading } = usePlacementRegistry(effectiveYear)

  const columns: DataColumn<ApiUniversityPlacement>[] = [
    { key: 'student', label: 'Student', priority: 'critical', render: studentName },
    {
      key: 'sex', label: 'Sex', priority: 'optional',
      render: (row) => row.student?.sex === 'FEMALE' ? 'F' : row.student?.sex === 'MALE' ? 'M' : '—',
    },
    {
      key: 'placedUniversityId', label: 'University', priority: 'critical',
      render: (row) => row.placedUniversityName ?? row.placedUniversityId ?? '—',
    },
    {
      key: 'placedProgrammeId', label: 'Programme', priority: 'important',
      render: (row) => row.placedProgrammeName ?? row.placedProgrammeId ?? '—',
    },
    { key: 'admissionYear', label: 'Intake', priority: 'optional' },
    { key: 'status', label: 'Status', priority: 'important', render: (row) => <PlacementStatusBadge status={row.status} /> },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-heading font-semibold text-base">Cohort placement outcomes</h3>
        <AcademicYearSelect
          value={effectiveYear}
          onChange={(e) => setAcademicYear(e.target.value)}
          className="border border-base rounded-xl px-3 py-2 text-sm bg-surface"
        />
      </div>

      <PlacementAnalyticsPanel academicYear={effectiveYear} />

      <div>
        <h4 className="font-heading font-semibold text-sm mb-2">Confirmed placements</h4>
        <DataTable
          data={placements}
          isLoading={isLoading}
          columns={columns}
          rowKey="id"
          emptyMessage={`No confirmed placements recorded for ${effectiveYear} yet.`}
        />
      </div>
    </div>
  )
}
