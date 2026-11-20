/**
 * [FILE]: apps/web/src/components/classes/assignments/SubmissionPanel.tsx
 * [PURPOSE]: A student's own hand-in for one assignment: what they have sent, the
 *   mark and teacher comment (only if the teacher chose marks AND entered one), and
 *   the form to hand in or replace work (a file, a note, or both).
 *   Resubmission is allowed until the teacher marks or records the work; after that the
 *   form is replaced by an explanation. The file is verified again by the server
 *   (type/size/age), so the client checks here are only for early, friendly feedback.
 *   Nothing is cleared on failure, so a dropped connection never loses a typed note.
 */
'use client'

import { useRef, useState } from 'react'
import { FileText, Loader2, Send } from 'lucide-react'
import { ASSIGNMENT_LIMITS, acceptAttribute, checkFileAgainstRules, schoolDayOf } from '@shared/utils/assignment'
import type { ApiAssignmentDetail } from '@shared/types/api'
import { openAssignmentSubmissionFile, useSubmitAssignment } from '@/hooks/useClasses'
import { MODAL_BTN_PRIMARY } from '@/components/shared/Modal'
import { notifyError } from '@/lib/feedback'
import { MarksText, StudentStateLabel } from './AssignmentChips'
import { dueLabel, formatBytes, formatDay, formatInstant } from './assignmentFormat'

export function SubmissionPanel({ classId, d }: { classId: string; d: ApiAssignmentDetail }) {
  const { mutate: submit, isPending } = useSubmitAssignment()
  const mine = d.mine
  const [file, setFile] = useState<File | null>(null)
  // Pre-fill the note when replacing a hand-in, so editing is not starting over.
  const [note, setNote] = useState(mine?.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const [justSent, setJustSent] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Replacing with nothing changed would only refresh the hand-in time.
  const unchanged = !!mine && !file && note.trim() === (mine.note ?? '')
  const hasMarks = mine?.marks != null
  const locked = hasMarks || !!mine?.recordedByTeacher
  const overdue = dueLabel(d.dueDate).overdue

  function onPickFile(f: File | null) {
    setError(null)
    setJustSent(false)
    if (f) {
      // The same allowlist the server enforces - early feedback only.
      const problem = checkFileAgainstRules({ name: f.name, mimeType: f.type || 'application/octet-stream', sizeBytes: f.size }, 'SUBMISSION')
      if (problem) {
        setError(problem)
        if (fileRef.current) fileRef.current.value = ''
        setFile(null)
        return
      }
    }
    setFile(f)
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (isPending || unchanged) return // a double tap must not send twice
    setError(null)
    if (!file && !note.trim()) {
      setError('Attach a file or write a note before handing in.')
      return
    }
    submit(
      { classId, assignmentId: d.id, file, note },
      {
        onSuccess: () => {
          setFile(null)
          setJustSent(true)
          if (fileRef.current) fileRef.current.value = ''
        },
        // Keep the file and the note so the student can simply try again.
        onError: (err) => setError(err instanceof Error ? err.message : 'Could not hand in. Please try again.'),
      },
    )
  }

  return (
    <section aria-label="Your work" className="space-y-3 rounded-xl border border-base bg-page p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-heading text-sm font-bold text-brand-navy">Your work</h4>
        {d.myState && <StudentStateLabel state={d.myState} />}
      </div>

      {mine ? (
        <div className="space-y-2 text-sm">
          <p className="text-muted">
            {mine.recordedByTeacher ? 'Recorded by your teacher as handed in on' : 'Handed in on'}{' '}
            <span className="font-medium text-body">
              {mine.recordedByTeacher ? formatDay(schoolDayOf(mine.submittedAt)) : formatInstant(mine.submittedAt)}
            </span>
            {mine.status === 'LATE' && <span className="font-medium text-status-warning"> · after the due date</span>}
          </p>
          {mine.hasFile && (
            <button
              type="button"
              onClick={() => void openAssignmentSubmissionFile(classId, d.id, mine.studentId, mine.fileName ?? 'my-hand-in').catch((e) => notifyError('Could not open your file', e))}
              className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-lg border border-base bg-surface px-3 text-xs font-semibold text-tone-teal"
            >
              <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="truncate">{mine.fileName ?? 'My file'}</span>
            </button>
          )}
          {mine.note && <p className="whitespace-pre-wrap break-words rounded-lg bg-surface px-3 py-2 text-xs text-body">{mine.note}</p>}
        </div>
      ) : (
        <p className="text-sm text-muted">
          You haven&apos;t handed anything in yet.{' '}
          {overdue ? 'The due date has passed. Work handed in now is marked late.' : 'Work handed in after the due date is marked late.'}
        </p>
      )}

      {hasMarks && (
        <div className="rounded-xl border border-brand-teal/30 bg-brand-teal/5 p-3">
          <p className="text-xs font-heading font-bold uppercase tracking-wider text-muted">Your mark</p>
          <p className="mt-0.5"><MarksText marks={mine!.marks as number} max={d.maxMarks} /></p>
          {mine!.feedback && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-body">{mine!.feedback}</p>}
          <p className="mt-2 text-xs text-muted">Session mark: not counted toward exams or continuous assessment.</p>
        </div>
      )}

      {locked ? (
        <p className="text-xs text-muted">
          {hasMarks ? 'Your teacher has marked this work, so it can no longer be replaced.' : 'Your teacher has recorded this hand-in, so it can no longer be changed.'}
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-3" noValidate>
          <div>
            <label className="mb-1 block text-xs font-heading font-semibold uppercase tracking-wider text-muted" htmlFor={`file-${d.id}`}>
              {mine?.hasFile ? 'Replace your file' : 'Attach your file'} <span className="font-normal normal-case">(optional)</span>
            </label>
            <input
              id={`file-${d.id}`}
              ref={fileRef}
              type="file"
              accept={acceptAttribute('SUBMISSION')}
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-teal/10 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-tone-teal"
            />
            <p className="mt-1 text-xs text-muted">
              Documents or photos, up to {ASSIGNMENT_LIMITS.maxFileBytes / 1024 / 1024} MB{file ? ` · selected: ${file.name} (${formatBytes(file.size)})` : ''}.
              {mine?.hasFile && !file ? ' Leave empty to keep the file you already sent.' : ''}
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-heading font-semibold uppercase tracking-wider text-muted" htmlFor={`note-${d.id}`}>
              Note to your teacher <span className="font-normal normal-case">(optional)</span>
            </label>
            <textarea
              id={`note-${d.id}`}
              value={note}
              onChange={(e) => { setNote(e.target.value); setJustSent(false) }}
              rows={3}
              maxLength={2000}
              className="w-full resize-y rounded-xl border border-base bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
            />
          </div>
          {error && <p role="alert" className="text-xs text-status-danger">{error}</p>}
          {justSent && !error && <p role="status" className="text-xs text-status-success">Handed in. You can replace it until your teacher marks it.</p>}
          <button type="submit" disabled={isPending || unchanged} className={MODAL_BTN_PRIMARY}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            {isPending ? 'Sending…' : mine ? 'Replace hand-in' : 'Hand in work'}
          </button>
        </form>
      )}
    </section>
  )
}
