/**
 * [FILE]: apps/web/src/components/classes/assignments/AssignmentChips.tsx
 * [PURPOSE]: Status labels for the assignment screens. Per the design system
 *   (globals.css "Status text colours") a status is plain coloured TEXT - no pill
 *   background or border - using text-status-* so dark mode swaps automatically.
 *   Every label also carries an icon, so meaning never depends on colour alone.
 */
import { AlertTriangle, CheckCircle2, Circle, Clock } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ApiAssignmentStudentState, ApiAssignmentStudentStatus } from '@shared/types/api'
import { formatMarks } from './assignmentFormat'

function Label({ tone, icon, children }: { tone: string; icon: ReactNode; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-heading font-semibold ${tone}`}>
      {icon}
      {children}
    </span>
  )
}
const ICON = 'h-3.5 w-3.5 shrink-0'

/** What a STUDENT sees for one assignment (the one definition: studentAssignmentState). */
export function StudentStateLabel({ state }: { state: ApiAssignmentStudentState }) {
  switch (state) {
    case 'SUBMITTED': return <Label tone="text-status-success" icon={<CheckCircle2 className={ICON} aria-hidden />}>Handed in</Label>
    case 'LATE':      return <Label tone="text-status-warning" icon={<AlertTriangle className={ICON} aria-hidden />}>Handed in late</Label>
    case 'OVERDUE':   return <Label tone="text-status-danger" icon={<AlertTriangle className={ICON} aria-hidden />}>Overdue</Label>
    default:          return <Label tone="text-status-info" icon={<Clock className={ICON} aria-hidden />}>To do</Label>
  }
}

/** One student's state in the teacher's class list. */
export function RosterStatusLabel({ status }: { status: ApiAssignmentStudentStatus }) {
  switch (status) {
    case 'SUBMITTED': return <Label tone="text-status-success" icon={<CheckCircle2 className={ICON} aria-hidden />}>Submitted</Label>
    case 'LATE':      return <Label tone="text-status-warning" icon={<AlertTriangle className={ICON} aria-hidden />}>Late submission</Label>
    default:          return <Label tone="text-status-danger" icon={<Circle className={ICON} aria-hidden />}>Not submitted</Label>
  }
}

/** A mark, earned out of the maximum. */
export function MarksText({ marks, max }: { marks: number; max?: number | null }) {
  return <span className="font-heading text-sm font-bold text-brand-navy">{formatMarks(marks, max)}</span>
}
