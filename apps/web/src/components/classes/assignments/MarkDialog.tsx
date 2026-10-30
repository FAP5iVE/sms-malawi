/**
 * [FILE]: apps/web/src/components/classes/assignments/MarkDialog.tsx
 * [PURPOSE]: The teacher records ONE student: Submitted / Late submission / Not
 *   submitted. For a hand-in the "submitted on" date is REQUIRED; changing it
 *   automatically moves the choice between Submitted and Late using the same shared
 *   rule the server enforces, and the server rejects a record that contradicts its
 *   own date. Optional session marks (only when the teacher enabled marks) and a
 *   comment shown to the student with their mark. The dialog sends the version it
 *   loaded, so a record changed meanwhile (e.g. the student just handed in) is a
 *   409 with a clear message instead of a silent overwrite.
 */
'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertCircle, FileText, Loader2 } from 'lucide-react'
import {
  classifyByDay, daysBetween, schoolDayOf, todayInSchool, validateSubmittedOn,
} from '@shared/utils/assignment'
import type { HandInStatus } from '@shared/utils/assignment'
import type { ApiAssignmentRosterRow } from '@shared/types/api'
import { ApiError, queryKeys } from '@/lib/api-client'
import { openAssignmentSubmissionFile, useMarkAssignmentStudent } from '@/hooks/useClasses'
import { Modal, MODAL_BTN_PRIMARY, MODAL_BTN_SECONDARY } from '@/components/shared/Modal'
import { notifyError } from '@/lib/feedback'
import { formatDay } from './assignmentFormat'

type Choice = HandInStatus | 'MISSING'

interface MarkDialogProps {
  classId: string
  assignmentId: string
  dueDate: string
  postedAt: string
  marksEnabled: boolean
  maxMarks: number | null
  row: ApiAssignmentRosterRow
  canOpenFiles: boolean
  onClose: () => void
}

export function MarkDialog({ classId, assignmentId, dueDate, postedAt, marksEnabled, maxMarks, row, canOpenFiles, onClose }: MarkDialogProps) {
  const qc = useQueryClient()
  const { mutate: save, isPending } = useMarkAssignmentStudent()
  const studentOwnHandIn = row.status !== 'NOT_SUBMITTED' && !row.recordedByTeacher

  const [choice, setChoice] = useState<Choice>(row.status === 'NOT_SUBMITTED' ? (row.updatedAt ? 'MISSING' : 'SUBMITTED') : row.status)
  const [submittedOn, setSubmittedOn] = useState(row.submittedAt ? schoolDayOf(row.submittedAt) : '')
  const [marks, setMarks] = useState(row.marks != null ? String(row.marks) : '')
  const [feedback, setFeedback] = useState(row.feedback ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)

  const dueDay = schoolDayOf(dueDate)
  const postedDay = schoolDayOf(postedAt)
  const submitted = choice !== 'MISSING'
  // What the shared rule says about the chosen day.
  const derived: HandInStatus | null = submitted && submittedOn ? classifyByDay(submittedOn, dueDate) : null
  const mismatch = derived !== null && derived !== choice

  function onDateChange(value: string) {
    setSubmittedOn(value)
    // Keep the choice in step with the date, so the teacher never has to think about it.
    if (value && submitted) setChoice(classifyByDay(value, dueDate))
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isPending) return
    setServerError(null)
    const errs: Record<string, string> = {}
    if (submitted) {
      if (!submittedOn) errs.submittedOn = 'Enter the date the work was submitted.'
      else {
        const problem = validateSubmittedOn(submittedOn, { postedAt })
        if (problem) errs.submittedOn = problem
      }
      if (marksEnabled && marks.trim() !== '') {
        const n = Number(marks)
        if (!Number.isFinite(n) || n < 0) errs.marks = 'Enter a valid mark.'
        else if (maxMarks != null && n > maxMarks) errs.marks = `Marks cannot be more than ${maxMarks}.`
      }
    }
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    save(
      {
        classId, assignmentId, studentId: row.studentId,
        status: choice,
        submittedOn: submitted ? submittedOn : undefined,
        marks: submitted && marksEnabled && marks.trim() !== '' ? Number(marks) : null,
        feedback: marksEnabled && submitted ? feedback.trim() || undefined : undefined,
        expectedUpdatedAt: row.updatedAt, // null = "no record yet"
      },
      {
        onSuccess: onClose,
        onError: (err) => {
          setServerError(err instanceof Error ? err.message : 'Could not save. Please try again.')
          if (err instanceof ApiError && err.status === 409) {
            setStale(true)
            // Pull the latest class list so the teacher sees what changed.
            void qc.invalidateQueries({ queryKey: queryKeys.classes.assignmentRoster(classId, assignmentId) })
          }
        },
      },
    )
  }

  const radio = (value: Choice, label: string, disabled = false) => (
    <label className={`flex min-h-9 items-center gap-2 text-sm ${disabled ? 'opacity-50' : ''}`}>
      <input type="radio" name="choice" checked={choice === value} disabled={disabled}
        onChange={() => { setChoice(value); if (value === 'MISSING') setErrors({}) }} className="accent-brand-teal" />
      {label}
    </label>
  )

  return (
    <Modal
      title={`${row.firstName} ${row.lastName}`}
      description={row.registrationNo}
      onClose={onClose}
      size="md"
      onSubmit={onSubmit}
      busy={isPending}
      bodyClassName="space-y-4"
      footer={
        <>
          <button type="button" onClick={onClose} className={MODAL_BTN_SECONDARY}>{stale ? 'Close' : 'Cancel'}</button>
          <button type="submit" disabled={isPending || stale} className={MODAL_BTN_PRIMARY}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            {isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      {(row.hasFile || row.note) && (
        <div className="space-y-2 rounded-xl border border-base bg-page p-3 text-sm">
          <p className="text-xs font-heading font-bold uppercase tracking-wider text-muted">Student&apos;s work</p>
          {row.hasFile && canOpenFiles && (
            <button
              type="button"
              onClick={() => void openAssignmentSubmissionFile(classId, assignmentId, row.studentId, row.fileName ?? 'hand-in').catch((e) => notifyError('Could not open the file', e))}
              className="inline-flex max-w-full items-center gap-1.5 text-xs font-semibold text-brand-teal hover:underline"
            >
              <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="truncate">{row.fileName ?? 'Open file'}</span>
            </button>
          )}
          {row.note && <p className="whitespace-pre-wrap break-words text-xs text-body">{row.note}</p>}
        </div>
      )}

      <fieldset className="space-y-0.5">
        <legend className="mb-1 text-xs font-heading font-semibold uppercase tracking-wider text-muted">Record as</legend>
        {radio('SUBMITTED', 'Submitted (on time)')}
        {radio('LATE', 'Late submission')}
        {radio('MISSING', 'Not submitted', studentOwnHandIn)}
        {studentOwnHandIn && (
          <p className="text-xs text-muted">The student handed this in themselves, so it can&apos;t be marked as not submitted.</p>
        )}
      </fieldset>

      {submitted && (
        <>
          <div>
            <label htmlFor="submitted-on" className="mb-1.5 block text-xs font-heading font-semibold uppercase tracking-wider text-muted">
              Submitted on <span className="text-status-danger" aria-hidden>*</span>
            </label>
            <input
              id="submitted-on"
              type="date"
              value={submittedOn}
              min={postedDay}
              max={todayInSchool()}
              onChange={(e) => onDateChange(e.target.value)}
              aria-required
              aria-invalid={!!errors.submittedOn}
              className="w-full rounded-xl border border-base bg-page px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
            />
            {errors.submittedOn && <p role="alert" className="mt-1 text-xs text-status-danger">{errors.submittedOn}</p>}
            {derived && !mismatch && (
              <p className={`mt-1.5 text-xs font-medium ${derived === 'LATE' ? 'text-status-warning' : 'text-status-success'}`}>
                {derived === 'LATE'
                  ? `Late — ${daysBetween(dueDay, submittedOn)} day${daysBetween(dueDay, submittedOn) === 1 ? '' : 's'} after the due date`
                  : 'On time'}{' '}· due {formatDay(dueDay)}
              </p>
            )}
            {mismatch && (
              <p role="alert" className="mt-1.5 text-xs text-status-danger">
                That date is {derived === 'LATE' ? 'after' : 'on or before'} the due date ({formatDay(dueDay)}), so it must be recorded as{' '}
                {derived === 'LATE' ? 'a late submission' : 'submitted on time'}.{' '}
                <button type="button" className="font-semibold underline" onClick={() => setChoice(derived)}>
                  Switch to {derived === 'LATE' ? 'Late submission' : 'Submitted'}
                </button>
              </p>
            )}
          </div>

          {marksEnabled && (
            <div>
              <label htmlFor="mark-value" className="mb-1.5 block text-xs font-heading font-semibold uppercase tracking-wider text-muted">
                Marks{maxMarks ? ` (out of ${maxMarks})` : ''} <span className="font-normal normal-case">— leave empty to mark later</span>
              </label>
              <input
                id="mark-value"
                type="number"
                inputMode="decimal"
                min={0}
                max={maxMarks ?? undefined}
                step="0.5"
                value={marks}
                onChange={(e) => setMarks(e.target.value)}
                aria-invalid={!!errors.marks}
                className="w-full rounded-xl border border-base bg-page px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
              />
              {errors.marks && <p role="alert" className="mt-1 text-xs text-status-danger">{errors.marks}</p>}
              <p className="mt-1 text-[11px] text-muted">The student sees this mark on their assignment. It does not count toward exams or C.A.</p>
            </div>
          )}
        </>
      )}

      {marksEnabled && submitted && (
        <div>
          <label htmlFor="mark-feedback" className="mb-1.5 block text-xs font-heading font-semibold uppercase tracking-wider text-muted">
            Comment <span className="font-normal normal-case">(optional)</span>
          </label>
          <textarea
            id="mark-feedback"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={3}
            maxLength={2000}
            className="w-full resize-y rounded-xl border border-base bg-page px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
          />
          <p className="mt-1 text-[11px] text-muted">Shown to the student together with their mark.</p>
        </div>
      )}

      {serverError && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-status-danger/30 px-3 py-2 text-xs text-status-danger">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {serverError}
        </p>
      )}
    </Modal>
  )
}
