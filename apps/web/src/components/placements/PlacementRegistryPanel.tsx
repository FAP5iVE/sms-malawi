/**
 * [CHANGE TYPE]: TARGETED EDIT (OVERHAUL — added search/filter, richer columns)
 * [FILE]: apps/web/src/components/placements/PlacementRegistryPanel.tsx
 * [PURPOSE]: The "Placement Registry & Analytics" tab from the reference
 *   module — open to EVERY role (placement.view / placement.viewAnalytics
 *   are universal; placement outcomes are culturally public at Malawian
 *   schools). Shows the cohort-wide analytics cards, then the list of
 *   CONFIRMED placements only, with the reference module's search-by-name/
 *   MSCE-number/course + University + Gender filters (all client-side over
 *   the already-fetched confirmed list — the dataset is small by nature,
 *   one row per graduating candidate per year).
 * [DEPENDS ON]: @/hooks/usePlacements (usePlacementRegistry, usePlacementCatalogue),
 *   @/components/placements/PlacementAnalyticsPanel, PlacementStatusBadge,
 *   @/components/shared/{AcademicYearSelect, DataTable}
 */
'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { usePublicSchoolInfo } from '@/hooks/usePublic'
import { usePlacementRegistry, usePlacementCatalogue } from '@/hooks/usePlacements'
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

const ENTRY_SOURCE_LABEL: Record<string, string> = {
  STAFF_OFFICIAL: 'Staff Official List',
  STUDENT_CLAIM: 'Student Claim',
}

export function PlacementRegistryPanel() {
  const { data: schoolInfo } = usePublicSchoolInfo()
  const { data: catalogue = [] } = usePlacementCatalogue()
  const [academicYear, setAcademicYear] = useState<string>('')
  const effectiveYear = academicYear || schoolInfo?.currentYear || FALLBACK_YEAR

  const { data: placements = [], isLoading } = usePlacementRegistry(effectiveYear)

  const [search, setSearch] = useState('')
  const [universityFilter, setUniversityFilter] = useState<string>('ALL')
  const [genderFilter, setGenderFilter] = useState<'ALL' | 'MALE' | 'FEMALE'>('ALL')

  function facultyFor(row: ApiUniversityPlacement): string | null {
    if (!row.placedUniversityId || !row.placedProgrammeId) return null
    const uni = catalogue.find((u) => u.id === row.placedUniversityId)
    return uni?.programs.find((p) => p.id === row.placedProgrammeId)?.faculty ?? null
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return placements.filter((row) => {
      if (universityFilter !== 'ALL' && row.placedUniversityId !== universityFilter) return false
      if (genderFilter !== 'ALL' && row.student?.sex !== genderFilter) return false
      if (!q) return true
      const haystack = [
        studentName(row),
        row.student?.candidateNo,
        row.placedProgrammeName,
        row.placedProgrammeId,
        row.placedUniversityName,
      ].filter(Boolean).join(' ').toLowerCase()
      return haystack.includes(q)
    })
  }, [placements, search, universityFilter, genderFilter])

  const columns: DataColumn<ApiUniversityPlacement>[] = [
    {
      key: 'student', label: 'Student & Exam ID', priority: 'critical',
      render: (row) => (
        <div>
          <p className="font-medium">{studentName(row)}</p>
          {row.student?.candidateNo && <p className="text-xs text-muted">{row.student.candidateNo}</p>}
        </div>
      ),
    },
    {
      key: 'sex', label: 'Gender', priority: 'optional',
      render: (row) => row.student?.sex === 'FEMALE' ? 'Female' : row.student?.sex === 'MALE' ? 'Male' : '\u2014',
    },
    {
      key: 'placedUniversityId', label: 'Institution', priority: 'critical',
      render: (row) => row.placedUniversityName ?? row.placedUniversityId ?? '\u2014',
    },
    {
      key: 'placedProgrammeId', label: 'Faculty & Selected Course', priority: 'important',
      render: (row) => (
        <div>
          <p>{row.placedProgrammeName ?? row.placedProgrammeId ?? '\u2014'}</p>
          {facultyFor(row) && <p className="text-xs text-muted">{facultyFor(row)}</p>}
        </div>
      ),
    },
    { key: 'ncheBatchRef', label: 'NCHE Batch Ref', priority: 'optional', render: (row) => row.ncheBatchRef ?? '\u2014' },
    {
      key: 'entrySource', label: 'Entry Source', priority: 'optional',
      render: (row) => (
        <span className="inline-flex items-center rounded-full bg-page border border-base px-2 py-0.5 text-xs">
          {ENTRY_SOURCE_LABEL[row.entrySource] ?? row.entrySource}
        </span>
      ),
    },
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

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student name, MSCE #, course…"
            className="w-full border border-base rounded-xl pl-9 pr-3 py-2 text-sm bg-surface focus:outline-none"
          />
        </div>
        <select
          value={universityFilter}
          onChange={(e) => setUniversityFilter(e.target.value)}
          className="border border-base rounded-xl px-3 py-2 text-sm bg-surface shrink-0"
        >
          <option value="ALL">All Universities ({catalogue.length})</option>
          {catalogue.map((u) => (
            <option key={u.id} value={u.id}>{u.shortName ?? u.name}</option>
          ))}
        </select>
        <select
          value={genderFilter}
          onChange={(e) => setGenderFilter(e.target.value as typeof genderFilter)}
          className="border border-base rounded-xl px-3 py-2 text-sm bg-surface shrink-0"
        >
          <option value="ALL">All Genders</option>
          <option value="MALE">Male</option>
          <option value="FEMALE">Female</option>
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-heading font-semibold text-sm">Confirmed NCHE Placement List ({placements.length})</h4>
          <span className="text-xs text-muted">Showing {filtered.length} of {placements.length} confirmed</span>
        </div>
        <DataTable
          data={filtered}
          isLoading={isLoading}
          columns={columns}
          rowKey="id"
          emptyMessage={
            placements.length === 0
              ? `No confirmed placements recorded for ${effectiveYear} yet.`
              : 'No placements match your search/filters.'
          }
        />
      </div>
    </div>
  )
}
