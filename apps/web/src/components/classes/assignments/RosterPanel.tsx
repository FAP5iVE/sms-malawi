/**
 * [FILE]: apps/web/src/components/classes/assignments/RosterPanel.tsx
 * [PURPOSE]: The teacher's class list for one assignment: every active student with
 *   whether they opened it, their status (Submitted / Late submission / Not
 *   submitted), the date they handed in, their file and - if the teacher chose
 *   marks - their mark. A card list rather than a table so long names and file
 *   names wrap instead of forcing sideways scrolling on a narrow phone.
 *   "Record" appears only for the subject teacher / class teacher; admin, high_rank
 *   and exam_officer see the same list read-only (the API refuses their writes too).
 */
'use client'

import { useMemo, useState } from 'react'
import { Eye, EyeOff, FileText, Search } from 'lucide-react'
import { schoolDayOf } from '@shared/utils/assignment'
import type { ApiAssignmentRosterRow } from '@shared/types/api'
import { openAssignmentSubmissionFile, useAssignmentRoster } from '@/hooks/useClasses'
import { notifyError } from '@/lib/feedback'
import { MarksText, RosterStatusLabel } from './AssignmentChips'
import { formatDay, formatInstant } from './assignmentFormat'
import { FilterPills } from './FilterPills'
import { MarkDialog } from './MarkDialog'

type RosterFilter = 'all' | 'notOpened' | 'notSubmitted' | 'submitted' | 'late' | 'needsMarks'

function StatTile({ label, value, tone = 'text-brand-navy' }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-xl border border-base bg-page px-3 py-2">
      <p className={`font-heading text-xl font-bold ${tone}`}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  )
}

export function RosterPanel({ classId, assignmentId, canOpenFiles }: { classId: string; assignmentId: string; canOpenFiles: boolean }) {
  const { data, isLoading, isError, error, refetch } = useAssignmentRoster(classId, assignmentId)
  const [filter, setFilter] = useState<RosterFilter>('all')
  const [query, setQuery] = useState('')
  const [marking, setMarking] = useState<ApiAssignmentRosterRow | null>(null)

  const marksOn = !!data?.assignment.marksEnabled
  const rows = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    return data.rows.filter((r) => {
      if (q && !`${r.firstName} ${r.lastName} ${r.registrationNo}`.toLowerCase().includes(q)) return false
      switch (filter) {
        case 'notOpened': return !r.viewedAt
        case 'notSubmitted': return r.status === 'NOT_SUBMITTED'
        case 'submitted': return r.status === 'SUBMITTED'
        case 'late': return r.status === 'LATE'
        case 'needsMarks': return marksOn && r.status !== 'NOT_SUBMITTED' && r.marks == null
        default: return true
      }
    })
  }, [data, filter, query, marksOn])

  if (isLoading) return <div className="skeleton h-48 rounded-xl" aria-busy="true" aria-label="Loading class list" />
  if (isError || !data) {
    return (
      <div role="alert" className="space-y-3 rounded-xl border border-base px-4 py-5 text-center text-sm">
        <p className="text-status-danger">{error instanceof Error ? error.message : 'Could not load the class list.'}</p>
        <button type="button" onClick={() => void refetch()} className="min-h-10 rounded-xl border border-base px-4 text-sm font-semibold text-tone-teal hover:bg-page">
          Try again
        </button>
      </div>
    )
  }

  const { assignment, stats } = data

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="In class" value={stats.totalStudents} />
        <StatTile label="Opened it" value={stats.viewed} />
        <StatTile label="Submitted" value={stats.submitted} tone="text-status-success" />
        <StatTile label="Late" value={stats.late} tone="text-status-warning" />
        <StatTile label="Not submitted" value={stats.notSubmitted} tone="text-status-danger" />
        {marksOn && <StatTile label="Marked" value={stats.marked} />}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a student…"
            aria-label="Find a student"
            className="min-h-9 w-full rounded-xl border border-base bg-page pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
          />
        </div>
        <FilterPills<RosterFilter>
          label="Filter students"
          value={filter}
          onChange={setFilter}
          options={[
            { id: 'all', label: 'All' },
            { id: 'notOpened', label: 'Not opened' },
            { id: 'notSubmitted', label: 'Not submitted' },
            { id: 'submitted', label: 'Submitted' },
            { id: 'late', label: 'Late' },
            ...(marksOn ? [{ id: 'needsMarks' as RosterFilter, label: 'Needs marks' }] : []),
          ]}
        />
      </div>

      {!assignment.canManage && (
        <p className="text-xs text-muted">View only — recording is done by the subject teacher or the class teacher.</p>
      )}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-base py-8 text-center text-sm text-muted">No students match.</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {rows.map((r) => (
            <li key={r.studentId} className="space-y-2 rounded-xl border border-base bg-surface p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words font-medium text-body">{r.firstName} {r.lastName}</p>
                  <p className="text-xs text-muted">{r.registrationNo}</p>
                </div>
                <RosterStatusLabel status={r.status} />
              </div>

              <dl className="space-y-1 text-xs">
                <div className="flex flex-wrap items-center gap-x-2">
                  <dt className="text-muted">Opened</dt>
                  <dd className="inline-flex items-center gap-1 text-body">
                    {r.viewedAt ? (
                      <>
                        <Eye className="h-3.5 w-3.5 text-status-success" aria-hidden />
                        {formatInstant(r.viewedAt)}{r.viewCount > 1 ? ` · ${r.viewCount} visits` : ''}
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted"><EyeOff className="h-3.5 w-3.5" aria-hidden /> Not opened</span>
                    )}
                  </dd>
                </div>
                {r.submittedAt && (
                  <div className="flex flex-wrap items-center gap-x-2">
                    <dt className="text-muted">Handed in</dt>
                    <dd className="text-body">
                      {r.recordedByTeacher ? formatDay(schoolDayOf(r.submittedAt)) : formatInstant(r.submittedAt)}
                      {r.recordedByTeacher && <span className="text-muted"> · recorded by teacher</span>}
                    </dd>
                  </div>
                )}
                {r.hasFile && (
                  <div className="flex flex-wrap items-center gap-x-2">
                    <dt className="text-muted">File</dt>
                    <dd className="min-w-0">
                      {canOpenFiles ? (
                        <button
                          type="button"
                          onClick={() => void openAssignmentSubmissionFile(classId, assignmentId, r.studentId, r.fileName ?? 'hand-in').catch((e) => notifyError('Could not open the file', e))}
                          className="inline-flex max-w-full items-center gap-1 text-tone-teal hover:underline"
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="truncate">{r.fileName ?? 'Open file'}</span>
                        </button>
                      ) : (
                        <span className="text-muted">{r.fileName ?? 'File attached'}</span>
                      )}
                    </dd>
                  </div>
                )}
                {r.note && (
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <dt className="text-muted">Note</dt>
                    <dd className="min-w-0 break-words text-body">{r.note}</dd>
                  </div>
                )}
                {marksOn && r.marks != null && (
                  <div className="flex flex-wrap items-center gap-x-2">
                    <dt className="text-muted">Mark</dt>
                    <dd><MarksText marks={r.marks} max={assignment.maxMarks} /></dd>
                  </div>
                )}
              </dl>

              {assignment.canManage && (
                <button
                  type="button"
                  onClick={() => setMarking(r)}
                  className="min-h-9 w-full rounded-lg border border-base px-3 text-xs font-semibold text-tone-teal hover:bg-page sm:w-auto"
                >
                  {r.status === 'NOT_SUBMITTED' && !r.updatedAt ? 'Record' : marksOn ? 'Update / marks' : 'Update'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {marking && (
        <MarkDialog
          classId={classId}
          assignmentId={assignmentId}
          dueDate={assignment.dueDate}
          postedAt={assignment.postedAt}
          marksEnabled={marksOn}
          maxMarks={assignment.maxMarks ?? null}
          row={marking}
          canOpenFiles={canOpenFiles}
          onClose={() => setMarking(null)}
        />
      )}
    </div>
  )
}
