/**
 * [FILE]: apps/web/src/components/classes/assignments/AssignmentsTab.tsx
 * [PURPOSE]: The class page's Assignments tab: list, filters, "New Assignment" and
 *   the detail dialog. Students see their own class's assignments; teachers see the
 *   subjects they teach (class teacher: all); admin / high_rank / exam_officer see
 *   everything read-only. Visibility itself is enforced by the API.
 *
 *   THE BADGE: the tab badge on the class page counts assignments a student still
 *   has to do - not handed in AND not yet past the deadline ("PENDING"). Overdue
 *   work stays in the list, flagged, but does not inflate the badge forever.
 *   countOutstanding() is that single definition (it reads the API's `myState`).
 *
 *   DEEP LINK: `initialOpenId` (from ?assignment=<id>, set by the notification)
 *   opens that assignment straight away; if it was deleted or is not theirs the
 *   dialog says so instead of failing silently.
 */
'use client'

import { useState } from 'react'
import { AlertCircle, Plus } from 'lucide-react'
import { isOutstanding, schoolDayOf, todayInSchool } from '@shared/utils/assignment'
import type { ApiAssignment } from '@shared/types/api'
import AssignmentForm from '@/components/classes/AssignmentForm'
import { AssignmentCard } from './AssignmentCard'
import { AssignmentDetailModal } from './AssignmentDetailModal'
import { FilterPills } from './FilterPills'

/** The tab badge: how many assignments this student still has to do (on time). */
export function countOutstanding(assignments: ApiAssignment[]): number {
  return assignments.filter((a) => a.myState !== undefined && isOutstanding(a.myState)).length
}

type StudentFilter = 'all' | 'todo' | 'overdue' | 'done' | 'marked'
type StaffFilter = 'all' | 'open' | 'closed'

interface AssignmentsTabProps {
  classId: string
  role: string
  assignments: ApiAssignment[]
  denied: boolean
  loading: boolean
  loadError: string | null
  onRetry: () => void
  assignableSubjects: string[]
  initialOpenId: string | null
}

export function AssignmentsTab({
  classId, role, assignments, denied, loading, loadError, onRetry, assignableSubjects, initialOpenId,
}: AssignmentsTabProps) {
  const isStudent = role === 'student'
  const [openId, setOpenId] = useState<string | null>(initialOpenId)
  const [showForm, setShowForm] = useState(false)
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [studentFilter, setStudentFilter] = useState<StudentFilter>('all')
  const [staffFilter, setStaffFilter] = useState<StaffFilter>('all')
  const today = todayInSchool()

  const subjects = Array.from(new Set(assignments.map((a) => a.subject))).sort()
  const isOpen = (a: ApiAssignment) => schoolDayOf(a.dueDate) >= today

  const bySubject = assignments.filter((a) => subjectFilter === 'all' || a.subject === subjectFilter)
  const counts = {
    todo:    bySubject.filter((a) => a.myState === 'PENDING').length,
    overdue: bySubject.filter((a) => a.myState === 'OVERDUE').length,
    done:    bySubject.filter((a) => a.myState === 'SUBMITTED' || a.myState === 'LATE').length,
    marked:  bySubject.filter((a) => a.mine?.marks != null).length,
    open:    bySubject.filter(isOpen).length,
    closed:  bySubject.filter((a) => !isOpen(a)).length,
  }
  const shown = bySubject.filter((a) => {
    if (isStudent) {
      if (studentFilter === 'todo') return a.myState === 'PENDING'
      if (studentFilter === 'overdue') return a.myState === 'OVERDUE'
      if (studentFilter === 'done') return a.myState === 'SUBMITTED' || a.myState === 'LATE'
      if (studentFilter === 'marked') return a.mine?.marks != null
      return true
    }
    if (staffFilter === 'open') return isOpen(a)
    if (staffFilter === 'closed') return !isOpen(a)
    return true
  })
  // Upcoming first (soonest due), then past (most recent first).
  const upcoming = shown.filter(isOpen).sort((x, y) => Date.parse(x.dueDate) - Date.parse(y.dueDate))
  const past = shown.filter((a) => !isOpen(a)).sort((x, y) => Date.parse(y.dueDate) - Date.parse(x.dueDate))
  const ordered = [...upcoming, ...past]

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-heading font-semibold text-brand-navy">Assignments</h3>
        {/* Only a teacher who owns at least one subject here (or the class teacher)
            can post. admin / high_rank oversee but do not set work, so they never
            see an active control that the API would refuse. */}
        {assignableSubjects.length > 0 && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-teal px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-light"
          >
            <Plus className="h-4 w-4" aria-hidden />
            New Assignment
          </button>
        )}
      </div>

      {denied ? (
        <div role="alert" className="rounded-xl border border-base py-12 text-center text-sm text-muted">
          You don&apos;t have access to this class&apos;s assignments.
        </div>
      ) : loadError ? (
        <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-base py-10 text-center text-sm">
          <span className="inline-flex items-center gap-2 text-status-danger"><AlertCircle className="h-4 w-4" aria-hidden /> {loadError}</span>
          <button type="button" onClick={onRetry} className="min-h-10 rounded-xl border border-base px-4 text-sm font-semibold text-brand-teal hover:bg-page">
            Try again
          </button>
        </div>
      ) : loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading assignments">
          <div className="skeleton h-24 rounded-xl" />
          <div className="skeleton h-24 rounded-xl" />
        </div>
      ) : assignments.length === 0 ? (
        <div className="rounded-xl border border-base py-12 text-center text-sm text-muted">
          {assignableSubjects.length > 0
            ? 'No assignments yet. Click “New Assignment” to post one — students are notified straight away.'
            : isStudent
              ? 'No assignments have been posted for your class yet.'
              : 'No assignments to show.'}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            {subjects.length > 1 && (
              <select
                value={subjectFilter}
                onChange={(e) => setSubjectFilter(e.target.value)}
                aria-label="Filter by subject"
                className="min-h-9 rounded-xl border border-base bg-page px-3 text-xs"
              >
                <option value="all">All subjects</option>
                {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
            {isStudent ? (
              <FilterPills<StudentFilter>
                label="Filter assignments"
                value={studentFilter}
                onChange={setStudentFilter}
                options={[
                  { id: 'all', label: 'All', count: bySubject.length },
                  { id: 'todo', label: 'To do', count: counts.todo },
                  { id: 'overdue', label: 'Overdue', count: counts.overdue },
                  { id: 'done', label: 'Handed in', count: counts.done },
                  { id: 'marked', label: 'Marked', count: counts.marked },
                ]}
              />
            ) : (
              <FilterPills<StaffFilter>
                label="Filter assignments"
                value={staffFilter}
                onChange={setStaffFilter}
                options={[
                  { id: 'all', label: 'All', count: bySubject.length },
                  { id: 'open', label: 'Open', count: counts.open },
                  { id: 'closed', label: 'Past due', count: counts.closed },
                ]}
              />
            )}
          </div>

          {ordered.length === 0 ? (
            <div className="rounded-xl border border-base py-10 text-center text-sm text-muted">Nothing matches this filter.</div>
          ) : (
            <ul className="space-y-3">
              {ordered.map((a) => (
                <li key={a.id}>
                  <AssignmentCard a={a} isStudent={isStudent} onOpen={() => setOpenId(a.id)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {openId && (
        <AssignmentDetailModal
          classId={classId}
          assignmentId={openId}
          role={role}
          subjectOptions={assignableSubjects}
          onClose={() => setOpenId(null)}
        />
      )}
      {showForm && (
        <AssignmentForm classId={classId} subjectOptions={assignableSubjects} onClose={() => setShowForm(false)} />
      )}
    </div>
  )
}
