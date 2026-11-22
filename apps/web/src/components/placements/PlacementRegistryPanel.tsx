/**
 * [CHANGE TYPE]: TARGETED EDIT (OVERHAUL — added search/filter, richer columns)
 * [FILE]: apps/web/src/components/placements/PlacementRegistryPanel.tsx
 * [PURPOSE]: The "Placement Registry & Analytics" tab from the reference
 *   module — open to every STAFF role (placement.viewAnalytics) but never the
 *   student role — it lists other students' names, candidate numbers and points. Shows the cohort-wide analytics cards, then the list of
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
import { useEffectiveViewingPeriod } from '@/hooks/useViewingPeriod'
import { usePlacementRegistry, usePlacementCatalogue } from '@/hooks/usePlacements'
import { DataTable, type DataColumn } from '@/components/shared/DataTable'
import { PlacementAnalyticsPanel } from '@/components/placements/PlacementAnalyticsPanel'
import { PlacementStatusBadge } from '@/components/placements/PlacementStatusBadge'
import { ListPager } from '@/components/shared/ListPager'
import { usePagedRows } from '@/lib/hills/usePagedRows'
import type { ApiUniversityPlacement } from '@shared/types/api'

function studentName(row: ApiUniversityPlacement): string {
  if (!row.student) return row.studentId
  return `${row.student.firstName} ${row.student.otherNames ? row.student.otherNames + ' ' : ''}${row.student.lastName}`
}

const ENTRY_SOURCE_LABEL: Record<string, string> = {
  STAFF_OFFICIAL: 'Staff official list',
  STUDENT_CLAIM: 'Student claim',
}

export function PlacementRegistryPanel() {
  // The school's stored current year (SystemSettings), never a literal.
  // [UNIVERSAL PERIOD FILTER] The year comes ONLY from the app-wide header
  // filter. The year select this panel used to carry wrote through to it (picking
  // a year here already moved the whole app), so it was a second control for one
  // value; it is now a read-only label.
  const { academicYear: effectiveYear } = useEffectiveViewingPeriod()
  const { data: catalogue = [] } = usePlacementCatalogue()

  const { data: placements = [], isLoading, isError, error } = usePlacementRegistry(effectiveYear)

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

  // Hills 8b-1 (R7): client-side paging of the already-loaded, already-filtered list.
  const paging = usePagedRows(filtered, { resetKey: `${effectiveYear}|${search}|${universityFilter}|${genderFilter}` })

  const columns: DataColumn<ApiUniversityPlacement>[] = [
    {
      key: 'student', label: 'Student and exam ID', priority: 'critical',
      render: (row) => (
        <div>
          <p className="font-medium">{studentName(row)}</p>
          {row.student?.candidateNo && <p className="text-xs text-muted">{row.student.candidateNo}</p>}
        </div>
      ),
    },
    {
      key: 'sex', label: 'Gender', priority: 'optional',
      render: (row) => row.student?.sex === 'FEMALE' ? 'Female' : row.student?.sex === 'MALE' ? 'Male' : '-',
    },
    {
      key: 'placedUniversityId', label: 'Institution', priority: 'critical',
      render: (row) => row.placedUniversityName ?? row.placedUniversityId ?? '-',
    },
    {
      key: 'placedProgrammeId', label: 'Faculty and course', priority: 'important',
      render: (row) => (
        <div>
          <p>{row.placedProgrammeName ?? row.placedProgrammeId ?? '-'}</p>
          {facultyFor(row) && <p className="text-xs text-muted">{facultyFor(row)}</p>}
        </div>
      ),
    },
    { key: 'ncheBatchRef', label: 'NCHE batch reference', priority: 'optional', render: (row) => row.ncheBatchRef ?? '-' },
    {
      key: 'entrySource', label: 'Entry source', priority: 'optional',
      render: (row) => (
        <span className="inline-flex items-center text-xs">
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
        <span className="text-sm text-muted" aria-label="Academic year shown">
              Intake {effectiveYear}
            </span>
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
          <h4 className="font-heading font-semibold text-sm">Confirmed NCHE placement list</h4>
          <span className="text-xs text-muted">Showing {filtered.length} of {placements.length} confirmed</span>
        </div>
        {isError ? (
          <div className="text-sm text-tone-coral py-6 text-center px-4">
            <p className="font-medium">Could not load the registry.</p>
            <p className="text-xs text-muted mt-1">{(error as Error)?.message ?? 'Unknown error. Check your connection and try again.'}</p>
          </div>
        ) : (
          <DataTable
            data={paging.visible}
            isLoading={isLoading}
            columns={columns}
            rowKey="id"
            emptyMessage={
              placements.length === 0
                ? `No confirmed placements recorded for ${effectiveYear} yet.`
                : 'No placements match your search or filters.'
            }
            bordered={false}
          />
        )}
        {!isError && <ListPager paging={paging} />}
      </div>
    </div>
  )
}
