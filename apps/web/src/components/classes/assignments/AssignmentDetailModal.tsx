/**
 * [FILE]: apps/web/src/components/classes/assignments/AssignmentDetailModal.tsx
 * [PURPOSE]: One assignment in a dialog.
 *   Student: the task, attachments, and their own hand-in panel. Opening it is
 *     reported once (useRecordAssignmentView) so the teacher can see who has opened it.
 *   Teacher (subject teacher / class teacher): the task plus a "Class list" tab, and
 *     Edit / Delete. Read-only roles get the same screens with no editing controls.
 *   Links to a deleted or foreign assignment (a stale notification) end here with a
 *   clear message rather than a blank screen.
 */
'use client'

import { useEffect, useRef, useState } from 'react'
import { BookOpen, Pencil, Trash2, Users } from 'lucide-react'
import { ApiError } from '@/lib/api-client'
import { useAssignmentDetail, useDeleteAssignment, useRecordAssignmentView } from '@/hooks/useClasses'
import { Modal, MODAL_BTN_PRIMARY, MODAL_BTN_SECONDARY } from '@/components/shared/Modal'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import { ModuleTabs } from '@/components/shared/ModuleTabs'
import type { TabItem } from '@/components/shared/ModuleTabs'
import AssignmentForm from '@/components/classes/AssignmentForm'
import { AssignmentBody } from './AssignmentBody'
import { FILE_STAFF_ROLES, formatDueDate } from './assignmentFormat'
import { RosterPanel } from './RosterPanel'
import { SubmissionPanel } from './SubmissionPanel'

type DetailTab = 'details' | 'roster'

interface AssignmentDetailModalProps {
  classId: string
  assignmentId: string
  role: string
  subjectOptions: string[]
  onClose: () => void
}

export function AssignmentDetailModal({ classId, assignmentId, role, subjectOptions, onClose }: AssignmentDetailModalProps) {
  const isStudent = role === 'student'
  const { data: d, isLoading, isError, error, refetch } = useAssignmentDetail(classId, assignmentId)
  const { mutate: recordView } = useRecordAssignmentView()
  const { mutate: remove, isPending: deleting } = useDeleteAssignment()
  const [tab, setTab] = useState<DetailTab>('details')
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Report "this student opened it" once per dialog open. The ref also guards React
  // StrictMode's double effect; the server debounces too (a 30-minute visit window).
  const reported = useRef<string | null>(null)
  useEffect(() => {
    if (isStudent && d && reported.current !== d.id) {
      reported.current = d.id
      recordView({ classId, assignmentId: d.id })
    }
  }, [isStudent, d, classId, recordView])

  const status = error instanceof ApiError ? error.status : 0
  const unavailable = isError && (status === 403 || status === 404)

  const tabs: TabItem<DetailTab>[] = [
    { id: 'details', label: 'Assignment', icon: BookOpen },
    ...(!isStudent ? [{ id: 'roster' as DetailTab, label: 'Class list', icon: Users, badge: d?.stats?.totalStudents }] : []),
  ]

  if (editing && d) {
    return <AssignmentForm classId={classId} subjectOptions={subjectOptions} assignment={d} onClose={() => setEditing(false)} />
  }

  return (
    <>
      <Modal
        title={d?.title ?? 'Assignment'}
        description={d ? `${d.subject} · Due ${formatDueDate(d.dueDate)}` : undefined}
        onClose={onClose}
        size="2xl"
        footer={
          d?.canManage ? (
            <>
              <button type="button" onClick={() => { setDeleteError(null); setConfirmDelete(true) }} className={`${MODAL_BTN_SECONDARY} text-status-danger`}>
                <Trash2 className="h-4 w-4" aria-hidden /> Delete
              </button>
              <button type="button" onClick={() => setEditing(true)} className={MODAL_BTN_PRIMARY}>
                <Pencil className="h-4 w-4" aria-hidden /> Edit
              </button>
            </>
          ) : (
            <button type="button" onClick={onClose} className={MODAL_BTN_SECONDARY}>Close</button>
          )
        }
        bodyClassName="space-y-4"
      >
        {isLoading && (
          <div className="space-y-3" aria-busy="true" aria-label="Loading assignment">
            <div className="skeleton h-6 w-1/2 rounded" />
            <div className="skeleton h-32 rounded-xl" />
          </div>
        )}

        {unavailable && (
          <p role="alert" className="rounded-xl border border-base bg-page px-4 py-6 text-center text-sm text-muted">
            This assignment is no longer available, or it is not part of your class.
          </p>
        )}
        {isError && !unavailable && (
          <div role="alert" className="space-y-3 rounded-xl border border-base px-4 py-5 text-center text-sm">
            <p className="text-status-danger">{error instanceof Error ? error.message : 'Could not load this assignment.'}</p>
            <button type="button" onClick={() => void refetch()} className="min-h-10 rounded-xl border border-base px-4 text-sm font-semibold text-brand-teal hover:bg-page">
              Try again
            </button>
          </div>
        )}

        {d && (
          <>
            {!isStudent && (
              <ModuleTabs<DetailTab> id="assignment-detail-tabs" tabs={tabs} active={tab} onChange={setTab} variant="underline" />
            )}
            {(isStudent || tab === 'details') && (
              <>
                <AssignmentBody d={d} />
                {isStudent && <SubmissionPanel classId={classId} d={d} />}
              </>
            )}
            {!isStudent && tab === 'roster' && (
              <RosterPanel classId={classId} assignmentId={d.id} canOpenFiles={FILE_STAFF_ROLES.has(role)} />
            )}
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this assignment?"
        description={
          deleteError
            ?? 'Students will no longer see it, and its attachments are removed. This is only possible while nobody has handed in work.'
        }
        confirmLabel="Delete assignment"
        destructive
        confirming={deleting}
        confirmingLabel="Deleting…"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          remove(
            { classId, assignmentId },
            {
              onSuccess: () => { setConfirmDelete(false); onClose() },
              // e.g. 409: work has been handed in. Keep the dialog open and say why.
              onError: (err) => setDeleteError(err instanceof Error ? err.message : 'Could not delete the assignment.'),
            },
          )
        }
      />
    </>
  )
}
