/**
 * [FILE]: apps/web/src/components/classes/assignments/AssignmentCard.tsx
 * [PURPOSE]: One assignment in the class's Assignments tab. Students see their own
 *   state (To do / Overdue / Handed in / Handed in late), a "New" marker until they
 *   first open it, and their mark once the teacher entered one. Staff see class-wide
 *   progress. The whole card is one button that opens the detail dialog.
 */
import { Award, CalendarClock, Paperclip } from 'lucide-react'
import type { ApiAssignment } from '@shared/types/api'
import { MarksText, StudentStateLabel } from './AssignmentChips'
import { dueLabel, formatDueDate } from './assignmentFormat'

interface AssignmentCardProps {
  a: ApiAssignment
  isStudent: boolean
  onOpen: () => void
}

export function AssignmentCard({ a, isStudent, onOpen }: AssignmentCardProps) {
  const due = dueLabel(a.dueDate)
  const stats = a.stats
  const handedIn = stats ? stats.submitted + stats.late : 0
  const pct = stats && stats.totalStudents > 0 ? Math.round((handedIn / stats.totalStudents) * 100) : 0
  const isNew = isStudent && !a.viewedAt
  // Overdue and still not handed in: tell the student they can still send it.
  const lateStillOpen = isStudent && a.myState === 'OVERDUE'

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-xl app-tint p-4 text-left transition-colors hover:bg-brand-teal/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/40"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-heading font-semibold text-body">
            <span className="min-w-0 break-words">{a.title}</span>
            {isNew && <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-tone-coral">New</span>}
          </p>
          <p className="mt-0.5 break-words text-sm text-muted">
            {a.subject} · Due {formatDueDate(a.dueDate)}
            {a.createdByName ? ` · ${a.createdByName}` : ''}
          </p>
        </div>
        {isStudent && a.myState && (
          <div className="flex shrink-0 items-center gap-3">
            {a.mine?.marks != null && <MarksText marks={a.mine.marks} max={a.maxMarks} />}
            <StudentStateLabel state={a.myState} />
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className={`inline-flex items-center gap-1 font-medium ${due.overdue ? 'text-status-danger' : 'text-status-info'}`}>
          <CalendarClock className="h-3.5 w-3.5" aria-hidden />
          {lateStillOpen ? `${due.text}. You can still hand in; it will be marked late.` : due.text}
        </span>
        {!!a.attachmentCount && (
          <span className="inline-flex items-center gap-1 text-muted">
            <Paperclip className="h-3.5 w-3.5" aria-hidden />
            {a.attachmentCount} attachment{a.attachmentCount === 1 ? '' : 's'}
          </span>
        )}
        {a.marksEnabled && (
          <span className="inline-flex items-center gap-1 text-muted">
            <Award className="h-3.5 w-3.5" aria-hidden />
            Marked out of {a.maxMarks}
          </span>
        )}
      </div>

      {stats && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-base/60" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Handed in">
            <div className="h-full bg-brand-teal" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {handedIn} of {stats.totalStudents} handed in
            {stats.late > 0 ? ` · ${stats.late} late` : ''}
            {` · ${stats.viewed} opened`}
            {a.marksEnabled ? ` · ${stats.marked} marked` : ''}
          </p>
        </div>
      )}
    </button>
  )
}
