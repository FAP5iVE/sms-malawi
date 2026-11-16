/**
 * [FILE]: apps/web/src/components/classes/AssignmentForm.tsx
 * [R-PHASE]: R6 — Academics II: Classes, Assignments & the Attendance Rebuild
 * [PURPOSE]: The teacher's form to POST or EDIT an assignment, in the same Modal and
 *   RichTextEditor as Write News: title, subject, due date, Content and Requirements
 *   (rich text with pictures and math formulae), file/picture attachments, and an
 *   optional "I will enter marks" switch with total marks.
 *
 *   SUBJECTS are limited to what the user may post (passed as `subjectOptions`), but
 *   that is only a convenience - the server re-checks class, subject and teacher.
 *
 *   ATTACHMENTS upload straight to storage when picked. Only the storage id is sent
 *   with the form; the server reads the real name/type/size from the stored object
 *   and refuses anything outside the allowlist, so the checks here are early,
 *   friendly feedback rather than the boundary.
 *
 *   DRAFT PRESERVATION (create mode): title, text and marks settings are kept in this
 *   browser (localStorage, per signed-in user and class, 7 days) so a dropped
 *   connection or accidental close doesn't lose a long assignment. Restoring a draft
 *   only refills the form - nothing is ever published until "Post Assignment" is
 *   pressed. Attachments are deliberately not part of a draft (they are uploaded
 *   files; re-attach them). A draft is cleared once posted.
 *
 *   EDITING sends the `updatedAt` it loaded; if another teacher saved first the server
 *   answers 409 and this form says so instead of overwriting their change.
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { getAuth } from 'firebase/auth'
import { AlertCircle, FileText, ImagePlus, Info, Loader2, Paperclip, X } from 'lucide-react'
import { CreateAssignmentSchema, UpdateAssignmentSchema } from '@shared/schemas/student'
import {
  ASSIGNMENT_LIMITS, acceptAttribute, checkFileAgainstRules, richTextHasContent, todayInSchool, utf8Length,
} from '@shared/utils/assignment'
import type { ApiAssignmentDetail } from '@shared/types/api'
import { ApiError, queryKeys } from '@/lib/api-client'
import { useCreateAssignment, useUpdateAssignment } from '@/hooks/useClasses'
import { uploadFileDirectly } from '@/lib/directUpload'
import { Field, inputCls } from '@/components/students/StudentFormSections'
import { RichTextEditor } from '@/components/shared/RichTextEditor'
import { Modal, MODAL_BTN_PRIMARY, MODAL_BTN_SECONDARY } from '@/components/shared/Modal'
import { formatBytes, formatInstant, schoolDayInput } from './assignments/assignmentFormat'

interface AssignmentFormProps {
  classId: string
  onClose: () => void
  /** Subjects this user may set assignments for in this class. The server re-checks. */
  subjectOptions: string[]
  /** When present the form edits this assignment instead of creating one. */
  assignment?: ApiAssignmentDetail
}

/** What the form needs to show an attachment (the server stores its own verified copy). */
interface LocalAttachment { fileKey: string; fileName: string; mimeType: string; sizeBytes: number; kind: 'FILE' | 'IMAGE' }
type Pending = { id: number; name: string }

// ── Draft (create mode only) ────────────────────────────────────────────────
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
interface Draft {
  v: 1; savedAt: number
  subject: string; title: string; dueDate: string; description: string; requirements: string
  marksEnabled: boolean; maxMarks: string
}
function draftKey(classId: string): string | null {
  const uid = getAuth().currentUser?.uid
  return uid ? `sms.assignmentDraft.v1:${uid}:${classId}` : null // per user: a shared computer never leaks a draft
}
function readDraft(classId: string): Draft | null {
  try {
    const key = draftKey(classId)
    if (!key) return null
    const d = JSON.parse(localStorage.getItem(key) ?? 'null') as Draft | null
    if (!d || d.v !== 1 || Date.now() - d.savedAt > DRAFT_MAX_AGE_MS) { localStorage.removeItem(key); return null }
    return d
  } catch { return null }
}
function writeDraft(classId: string, d: Draft) {
  try { const key = draftKey(classId); if (key) localStorage.setItem(key, JSON.stringify(d)) } catch { /* storage full/blocked: drafts are best-effort */ }
}
function clearDraft(classId: string) {
  try { const key = draftKey(classId); if (key) localStorage.removeItem(key) } catch { /* ignore */ }
}

export default function AssignmentForm({ classId, onClose, subjectOptions, assignment }: AssignmentFormProps) {
  const editing = !!assignment
  const qc = useQueryClient()
  const { mutate: createAssignment, isPending: creating } = useCreateAssignment()
  const { mutate: updateAssignment, isPending: updating } = useUpdateAssignment()
  const busyServer = creating || updating

  const [subject, setSubject] = useState(assignment?.subject ?? (subjectOptions.length === 1 ? subjectOptions[0] ?? '' : ''))
  const [title, setTitle] = useState(assignment?.title ?? '')
  const [dueDate, setDueDate] = useState(assignment ? schoolDayInput(assignment.dueDate) : '')
  const [description, setDescription] = useState(assignment?.description ?? '')
  const [requirements, setRequirements] = useState(assignment?.requirements ?? '')
  const [marksEnabled, setMarksEnabled] = useState(assignment?.marksEnabled ?? false)
  const [maxMarks, setMaxMarks] = useState<string>(assignment?.maxMarks ? String(assignment.maxMarks) : '')
  const [attachments, setAttachments] = useState<LocalAttachment[]>(
    (assignment?.attachments ?? []).map((a) => ({ fileKey: a.fileKey, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes, kind: a.kind })),
  )
  const [pending, setPending] = useState<Pending[]>([])
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(() => (assignment ? null : readDraft(classId)))
  const [dirty, setDirty] = useState(false)

  const fileInput = useRef<HTMLInputElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const pendingId = useRef(0)
  const uploading = pending.length > 0
  // Pictures go to a public-read prefix (they render in <img>); documents stay private.
  const ticketBase = `/classes/${classId}/assignments/attachments`

  const touch = useCallback(() => setDirty(true), [])

  // ── draft autosave (create mode) ──
  useEffect(() => {
    if (editing || !dirty) return
    const hasAnything = title.trim() !== '' || richTextHasContent(description) || richTextHasContent(requirements)
    const t = setTimeout(() => {
      if (hasAnything) writeDraft(classId, { v: 1, savedAt: Date.now(), subject, title, dueDate, description, requirements, marksEnabled, maxMarks })
      else clearDraft(classId)
    }, 800)
    return () => clearTimeout(t)
  }, [editing, dirty, classId, subject, title, dueDate, description, requirements, marksEnabled, maxMarks])

  function restoreDraft() {
    if (!draft) return
    if (draft.subject && subjectOptions.includes(draft.subject)) setSubject(draft.subject)
    setTitle(draft.title)
    setDueDate(draft.dueDate >= todayInSchool() ? draft.dueDate : '') // a stale due date is dropped, not kept
    setDescription(draft.description)
    setRequirements(draft.requirements)
    setMarksEnabled(draft.marksEnabled)
    setMaxMarks(draft.maxMarks)
    setDraft(null)
    setDirty(true)
  }
  function discardDraft() { clearDraft(classId); setDraft(null) }

  async function addFiles(list: FileList | null, kind: 'FILE' | 'IMAGE') {
    if (!list || list.length === 0) return
    setUploadError(null)
    const picked = Array.from(list)
    if (attachments.length + pending.length + picked.length > ASSIGNMENT_LIMITS.maxAttachments) {
      setUploadError(`You can attach at most ${ASSIGNMENT_LIMITS.maxAttachments} files.`)
      return
    }
    for (const file of picked) {
      // The same allowlist the server enforces - early feedback only.
      const problem = checkFileAgainstRules(
        { name: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size },
        kind === 'IMAGE' ? 'IMAGE' : 'ATTACHMENT',
      )
      if (problem) { setUploadError(problem); continue }
      const id = ++pendingId.current
      setPending((p) => [...p, { id, name: file.name }])
      try {
        const fileKey = await uploadFileDirectly(`${ticketBase}/${kind === 'IMAGE' ? 'image' : 'file'}/upload-ticket`, file)
        setAttachments((a) => [...a, { fileKey, fileName: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size, kind }])
        touch()
      } catch (err) {
        setUploadError(err instanceof Error ? `"${file.name}" failed: ${err.message}` : `Could not upload "${file.name}". Try again.`)
      } finally {
        setPending((p) => p.filter((x) => x.id !== id))
      }
    }
  }

  function removeAttachment(fileKey: string) {
    setAttachments((a) => a.filter((x) => x.fileKey !== fileKey))
    touch()
  }

  // Closing an EDIT with unsaved changes asks first (create mode has the draft).
  function requestClose() {
    if (busyServer) return
    if (editing && dirty && !window.confirm('Discard your changes to this assignment?')) return
    onClose()
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (busyServer) return // a double click must not post twice
    setSubmitError(null)
    setConflict(false)
    setFieldErrors({})
    if (uploading) { setSubmitError('Wait for the uploads to finish.'); return }

    const marks = marksEnabled ? Number(maxMarks) : null
    const shared = {
      title,
      dueDate,
      description,
      requirements, // '' clears it when editing (the server stores null)
      marksEnabled,
      maxMarks: marksEnabled && Number.isFinite(marks) && marks ? marks : null,
      attachments: attachments.map((a) => ({ fileKey: a.fileKey })),
    }

    const parsed = editing
      ? UpdateAssignmentSchema.safeParse({ ...shared, expectedUpdatedAt: assignment!.updatedAt })
      : CreateAssignmentSchema.safeParse({ ...shared, subject })
    if (!parsed.success) {
      const errs: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form')
        if (!errs[key]) errs[key] = issue.message
      }
      setFieldErrors(errs)
      return
    }
    if (!editing && dueDate < todayInSchool()) { setFieldErrors({ dueDate: 'The due date cannot be in the past.' }); return }

    const onError = (err: unknown) => {
      // Nothing is cleared: the teacher's text and attachments stay in the form.
      setSubmitError(err instanceof Error ? err.message : 'Could not save the assignment. Please try again.')
      if (err instanceof ApiError && err.status === 409 && editing) setConflict(true)
    }
    const onSuccess = () => { if (!editing) clearDraft(classId); onClose() }

    if (assignment) {
      updateAssignment({ classId, assignmentId: assignment.id, ...(parsed.data as Record<string, unknown>) }, { onSuccess, onError })
    } else {
      createAssignment({ ...(parsed.data as Omit<Parameters<typeof createAssignment>[0], 'classId'>), classId }, { onSuccess, onError })
    }
  }

  function reloadLatest() {
    void qc.invalidateQueries({ queryKey: queryKeys.classes.assignments(classId) })
    onClose()
  }

  const busy = busyServer || uploading
  const contentBytes = utf8Length(description)
  const nearLimit = contentBytes > ASSIGNMENT_LIMITS.maxContentBytes * 0.8

  return (
    <Modal
      title={editing ? 'Edit Assignment' : 'New Assignment'}
      onClose={requestClose}
      size="l"
      onSubmit={handleSubmit}
      busy={busyServer}
      closeOnBackdrop={false}
      bodyClassName="flex flex-col gap-4"
      footer={
        <>
          <button type="button" onClick={requestClose} className={MODAL_BTN_SECONDARY}>Cancel</button>
          <button type="submit" disabled={busy} className={MODAL_BTN_PRIMARY}>
            {busyServer && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {busyServer ? (editing ? 'Saving…' : 'Posting…') : editing ? 'Save Changes' : 'Post Assignment'}
          </button>
        </>
      }
    >
      {draft && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-base bg-page px-3 py-2 text-xs">
          <span className="text-muted">You have an unfinished draft from {formatInstant(new Date(draft.savedAt).toISOString())}. It was never posted.</span>
          <span className="flex gap-2">
            <button type="button" onClick={restoreDraft} className="font-semibold text-tone-teal underline">Restore draft</button>
            <button type="button" onClick={discardDraft} className="font-semibold text-muted underline">Discard</button>
          </span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Subject" error={fieldErrors.subject} required>
          <select value={subject} onChange={(e) => { setSubject(e.target.value); touch() }} disabled={editing} className={inputCls}>
            <option value="" disabled>Select subject…</option>
            {subjectOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            {editing && subject && !subjectOptions.includes(subject) && <option value={subject}>{subject}</option>}
          </select>
        </Field>

        <Field label="Due Date" error={fieldErrors.dueDate} required>
          <input
            type="date"
            value={dueDate}
            min={editing ? undefined : todayInSchool()}
            onChange={(e) => { setDueDate(e.target.value); touch() }}
            className={inputCls}
          />
          <span className="mt-1 block text-xs text-muted">Students can hand in until the end of this day (Malawi time).</span>
        </Field>
      </div>

      <Field label="Title" error={fieldErrors.title} required>
        <input
          type="text"
          value={title}
          onChange={(e) => { setTitle(e.target.value); touch() }}
          maxLength={200}
          placeholder="e.g. Chapter 4 Problem Set"
          className={inputCls}
        />
      </Field>

      <Field label="Content" error={fieldErrors.description} required>
        <RichTextEditor
          value={description}
          onChange={(v) => { setDescription(v); touch() }}
          enableMath
          imageTicketPath={`${ticketBase}/image/upload-ticket`}
          placeholder="Write the assignment. Use the Σ button for formulae and the picture button for diagrams…"
          minHeightClassName="min-h-[200px]"
        />
        {nearLimit && (
          <span className="mt-1 block text-xs text-muted">
            {Math.round((contentBytes / ASSIGNMENT_LIMITS.maxContentBytes) * 100)}% of the size limit used.
          </span>
        )}
      </Field>

      <Field label="Requirements" error={fieldErrors.requirements}>
        <RichTextEditor
          value={requirements}
          onChange={(v) => { setRequirements(v); touch() }}
          enableMath
          imageTicketPath={`${ticketBase}/image/upload-ticket`}
          placeholder="What must the student hand in? Format, length, how it will be judged… (optional)"
          minHeightClassName="min-h-[110px]"
        />
      </Field>

      <div>
        <p className="mb-1.5 text-sm font-medium text-body">
          Attachments <span className="font-normal text-muted">(optional, up to {ASSIGNMENT_LIMITS.maxAttachments}, {ASSIGNMENT_LIMITS.maxFileBytes / 1024 / 1024} MB each)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => fileInput.current?.click()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-base px-3 text-sm hover:border-brand-teal hover:text-tone-teal">
            <Paperclip className="h-4 w-4" aria-hidden /> Attach file
          </button>
          <button type="button" onClick={() => imageInput.current?.click()} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-base px-3 text-sm hover:border-brand-teal hover:text-tone-teal">
            <ImagePlus className="h-4 w-4" aria-hidden /> Attach picture
          </button>
          <input ref={fileInput} type="file" multiple hidden accept={acceptAttribute('ATTACHMENT')}
            onChange={(e) => { void addFiles(e.target.files, 'FILE'); e.target.value = '' }} />
          <input ref={imageInput} type="file" multiple hidden accept={acceptAttribute('IMAGE')}
            onChange={(e) => { void addFiles(e.target.files, 'IMAGE'); e.target.value = '' }} />
        </div>

        {(attachments.length > 0 || pending.length > 0) && (
          <ul className="mt-2 space-y-1.5">
            {attachments.map((a) => (
              <li key={a.fileKey} className="flex items-center gap-2 rounded-lg border border-base bg-page px-3 py-2 text-sm">
                {a.kind === 'IMAGE' ? <ImagePlus className="h-4 w-4 shrink-0 text-muted" aria-hidden /> : <FileText className="h-4 w-4 shrink-0 text-muted" aria-hidden />}
                <span className="min-w-0 flex-1 break-all">{a.fileName}</span>
                <span className="shrink-0 text-xs text-muted">{formatBytes(a.sizeBytes)}</span>
                <button type="button" onClick={() => removeAttachment(a.fileKey)} aria-label={`Remove ${a.fileName}`}
                  className="shrink-0 rounded-full p-1.5 text-muted hover:bg-surface hover:text-status-danger">
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
            {pending.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-lg border border-dashed border-base px-3 py-2 text-sm text-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                <span className="min-w-0 flex-1 truncate">Uploading {p.name}…</span>
              </li>
            ))}
          </ul>
        )}
        {uploadError && <p role="alert" className="mt-1 text-xs text-status-danger">{uploadError} You can pick the file again to retry.</p>}
        {fieldErrors.attachments && <p role="alert" className="mt-1 text-xs text-status-danger">{fieldErrors.attachments}</p>}
      </div>

      <div className="rounded-xl border border-base p-3">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={marksEnabled} onChange={(e) => { setMarksEnabled(e.target.checked); touch() }} className="mt-0.5 accent-brand-teal" />
          <span>
            <span className="font-medium text-body">I will enter marks for this assignment</span>
            <span className="block text-xs text-muted">Optional. A mark you enter shows on that student&apos;s assignment screen.</span>
          </span>
        </label>
        {marksEnabled && (
          <div className="mt-3 max-w-xs">
            <Field label="Total marks" error={fieldErrors.maxMarks} required>
              <input type="number" min={1} max={1000} step={1} inputMode="numeric" value={maxMarks}
                onChange={(e) => { setMaxMarks(e.target.value); touch() }} placeholder="e.g. 20" className={inputCls} />
            </Field>
          </div>
        )}
        <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          These are session marks to check that students are keeping up. They do not count toward exam results or C.A.
        </p>
      </div>

      {!editing && <p className="text-xs text-muted">Students in this class are notified as soon as you post.</p>}

      {submitError && (
        <div role="alert" className="space-y-2 rounded-xl border border-status-danger/30 px-4 py-3 text-xs text-status-danger">
          <p className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {submitError}</p>
          {conflict && (
            <button type="button" onClick={reloadLatest} className="font-semibold underline">Close and load the latest version</button>
          )}
        </div>
      )}
    </Modal>
  )
}
