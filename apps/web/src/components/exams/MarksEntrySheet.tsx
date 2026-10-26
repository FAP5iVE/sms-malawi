/**
 * apps/web/src/components/exams/MarksEntrySheet.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE of the local marks-state initialization and
 *   data-loading only (the entry-grid UI itself is unaffected).
 * [R-PHASE]: R7 — Academics III: Exam Pipeline Repair & Grading Engine
 *   Unification
 * [PURPOSE]:
 *   1. Fixed the useState(initialMarks) vs. async student-list race: the
 *      previous code passed a useMemo-derived value straight into
 *      useState(), which React only reads on the very first render. Since
 *      `students` always starts empty (async-loaded), `marks` was
 *      permanently initialized to `{}` and never re-synced once students
 *      actually arrived — every student's entry stayed `undefined`
 *      forever. The finalize-time check `mark === null` never caught this,
 *      since `undefined === null` is false in JavaScript: an
 *      uninitialized, never-touched entry could silently reach Finalize.
 *      Now a useEffect seeds `marks` once students (and any previously-
 *      saved draft marks — see #2) have loaded, giving every active
 *      student a real `{ mark: null, absent: false }` entry at minimum —
 *      never `undefined` — so the existing `mark === null` check is
 *      finally trustworthy. Already-typed-in-this-session values are
 *      preserved across re-renders rather than being clobbered by a
 *      refetch.
 *   2. Added useExamMarks(examId) (new hook, this same phase) to load
 *      previously-saved draft marks when the sheet opens, seeding `marks`
 *      from them instead of always resetting to blank — teachers
 *      previously lost visible progress every time the sheet was closed
 *      and reopened even though the data persisted correctly server-side.
 *   3. Replaced the hardcoded `max={100}` on the mark input with the
 *      new required `maxMark` prop — the specific exam's actual
 *      configured maximum (1–1000 via ExamForm.tsx), passed down from
 *      exams/page.tsx's already-loaded exam list.
 *   Save Draft / Finalize are now disabled until both students and saved
 *   marks have finished loading, preventing a submit during the brief
 *   window before local state is fully hydrated.
 * [DEPENDS ON]: apps/web/src/hooks/useExams.ts (useExamMarks)
 */
/*
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R15 — UI/UX Polish: Shared Components, Dashboards,
 *   Confirmation Dialogs & Data-Display Consistency
 * [PURPOSE]: "Finalize Marks" — which permanently locks the sheet against
 *   further entry — executed on a single unconfirmed tap. The button now
 *   runs the existing missing-marks validation first, then routes through
 *   the shared ConfirmDialog stating the consequence before
 *   submit + finalize run.
 * [DEPENDS ON]: W/components/shared/ConfirmDialog.tsx (same phase)
 */
/*
 * [CHANGE TYPE]: TARGETED EDIT
 * [PURPOSE]: "I saved a draft, opened it again, pressed Finalize and nothing
 *   happened." Two causes, both fixed:
 *   1. Saved marks come back from GET /exams/:id/marks as STRINGS ("45") -
 *      Prisma Decimals JSON-serialize that way - and the sheet sent them
 *      straight back. The numeric Zod schema rejected the request (400) and
 *      nothing here showed errors, so the click looked dead. The route now
 *      serializes Decimals AND the sheet coerces on load, so neither side
 *      relies on the other.
 *   2. Finalize was two chained requests with no failure handling. It is now
 *      ONE atomic request carrying the sheet, with loading state on the
 *      button and dialog, a success toast, and any failure shown as a toast
 *      AND a banner inside the sheet (e.g. "Missing marks for 2 student(s)").
 *   Also: marks outside 0..max are caught before sending, and the sheet
 *   cannot be closed mid-save.
 */
'use client'
import { useState, useMemo } from 'react'
import { useStudents } from '@/hooks/useStudents'
import { useEnterMarks, useFinalizeMarks, useExamMarks, useCorrectMarks } from '@/hooks/useExams'
import { getErrorMessage } from '@/lib/feedback'
import { Loader2, Lock, Save, AlertTriangle, CheckCircle2 } from 'lucide-react'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import type { ApiStudent } from '@shared/types/api'
import { Modal, MODAL_BTN_PRIMARY, MODAL_BTN_SECONDARY } from '@/components/shared/Modal'

interface Props {
  examId: string
  classId: string
  maxMark: number
  onClose: () => void
  // [PRODUCTION FIX 2026-07-28] Exam officers held exam.viewDraftMarks
  // (the real backend permission) but had no way to actually review marks
  // before clicking Approve — only teachers entering their own marks ever
  // opened this sheet. Reused rather than building a separate review
  // component: same data, same layout, just non-editable when true.
  readOnly?: boolean
  // RW-1: when true, exam_officer/high_rank may EDIT individual marks during
  // review (finalized/approved, pre-release) and save via /correct-marks —
  // distinct from the teacher's draft/finalize flow. Requires the
  // exam.correctMarksInReview permission (enforced server-side).
  correctionMode?: boolean
}

type MarkEntry = { mark: number | null; absent: boolean }

export function MarksEntrySheet({ examId, classId, maxMark, onClose, readOnly = false, correctionMode = false }: Props) {
  const { data: studentData, isLoading: studentsLoading } = useStudents({ classId, status: 'ACTIVE' })
  // R19 — memoized so `students` has a stable reference across renders
  // (the `?? []` fallback previously produced a brand-new empty-array
  // literal on every render while studentData was still loading, which is
  // what made the effect below's dependency array unreliable).
  const students = useMemo(() => (studentData?.students ?? []) as ApiStudent[], [studentData])
  const { data: savedMarks, isLoading: marksLoading } = useExamMarks(examId)
  const enterMarks    = useEnterMarks(examId)
  const finalizeMarks = useFinalizeMarks()
  const correctMarks  = useCorrectMarks(examId)
  // Inputs are editable for the teacher entry flow (not readOnly) OR when an
  // oversight reviewer is in correctionMode.
  const editable = correctionMode || !readOnly

  const [marks, setMarks] = useState<Record<string, MarkEntry>>({})
  const [hydrated, setHydrated] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  // R15 — finalize-confirmation dialog visibility
  const [confirmFinalizeOpen, setConfirmFinalizeOpen] = useState(false)
  // Why the last save/finalize/correct was refused - shown inside the sheet so
  // it is still there after the toast fades.
  const [actionError, setActionError] = useState<string | null>(null)
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null)

  const busy = enterMarks.isPending || finalizeMarks.isPending || correctMarks.isPending

  // Seed `marks` once students and any previously-saved draft marks have
  // loaded. A student ID already present in local state (typed in this
  // session, or seeded by a prior run of this adjustment) is preserved
  // as-is rather than clobbered by a refetch; every student otherwise gets
  // a real entry — never left as `undefined` — seeded from their saved
  // draft mark if one exists, or the explicit "not yet entered" sentinel.
  //
  // This intentionally does NOT use a useEffect: `students`/`savedMarks`
  // are reference-stable between renders until they genuinely change (the
  // useMemo above, and TanStack Query's own structural sharing), so
  // comparing against the previous render's references and adjusting state
  // directly in the render body — React's own documented pattern for
  // "reset state when a prop changes" — seeds `marks` one render sooner
  // than an effect would, without ever calling setState from inside one.
  const [prevStudents, setPrevStudents] = useState(students)
  const [prevSavedMarks, setPrevSavedMarks] = useState(savedMarks)
  const canSeed = !studentsLoading && !marksLoading && students.length > 0
  if (canSeed && (students !== prevStudents || savedMarks !== prevSavedMarks)) {
    setPrevStudents(students)
    setPrevSavedMarks(savedMarks)
    const next: Record<string, MarkEntry> = {}
    for (const s of students) {
      if (marks[s.id] !== undefined) {
        next[s.id] = marks[s.id]!
        continue
      }
      const saved = savedMarks?.find((m) => m.studentId === s.id)
      // Number(): a saved mark may arrive as a string ("45") from an API that
      // serializes Decimals as text. Left as a string it fails validation on
      // the way back out - the "Finalize does nothing" bug.
      const savedMark = saved?.mark == null || Number.isNaN(Number(saved.mark)) ? null : Number(saved.mark)
      next[s.id] = saved ? { mark: savedMark, absent: saved.absent } : { mark: null, absent: false }
    }
    setMarks(next)
    setHydrated(true)
  }

  function setMark(studentId: string, val: string) {
    const parsed = val === '' ? null : Number(val)
    const n = parsed !== null && Number.isFinite(parsed) ? parsed : null
    setMarks((p) => ({ ...p, [studentId]: { ...p[studentId]!, mark: n, absent: false } }))
    setErrors((p) => Object.fromEntries(Object.entries(p).filter(([id]) => id !== studentId)))
    setActionError(null)
  }

  function toggleAbsent(studentId: string) {
    setMarks((p) => ({ ...p, [studentId]: { mark: null, absent: !(p[studentId]?.absent) } }))
    setErrors((p) => Object.fromEntries(Object.entries(p).filter(([id]) => id !== studentId)))
    setActionError(null)
  }

  function buildEntries() {
    return students.map((s) => ({
      examId, studentId: s.id,
      mark:   marks[s.id]?.mark ?? undefined,
      absent: marks[s.id]?.absent ?? false,
    }))
  }

  // Marks outside 0..max are caught here, next to the box that holds them,
  // instead of coming back from the server as one unattributed error.
  function findOutOfRange(): Record<string, string> {
    const errs: Record<string, string> = {}
    for (const s of students) {
      const m = marks[s.id]?.mark
      if (m === null || m === undefined) continue
      if (m < 0 || m > maxMark) errs[s.id] = `Must be between 0 and ${maxMark}`
    }
    return errs
  }

  function saveDraft() {
    setActionError(null)
    const outOfRange = findOutOfRange()
    if (Object.keys(outOfRange).length > 0) {
      setErrors(outOfRange)
      setActionError(`${Object.keys(outOfRange).length} mark(s) are outside 0–${maxMark}. Fix them before saving.`)
      return
    }
    enterMarks.mutate({ entries: buildEntries(), isDraft: true }, {
      onSuccess: () => setDraftSavedAt(new Date()),
      onError:   (err) => setActionError(getErrorMessage(err, 'The draft could not be saved.')),
    })
  }

  // R15 — split: the button validates and opens the shared ConfirmDialog;
  // the actual submit + finalize runs only from the dialog's onConfirm.
  function requestFinalize() {
    setActionError(null)
    const errs: Record<string, string> = findOutOfRange()
    students
      .filter((s) => marks[s.id]?.mark === null && !marks[s.id]?.absent)
      .forEach((s) => { errs[s.id] = 'Mark required or mark as absent' })
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      setActionError(`${Object.keys(errs).length} student(s) need a valid mark (or to be marked absent) before the marks can be finalized.`)
      return
    }
    setConfirmFinalizeOpen(true)
  }

  // ONE request: the sheet goes up with the confirm, the server saves and
  // locks it atomically. The dialog stays open (spinner on its button) until
  // the answer is back, then closes either way.
  function doFinalize() {
    setActionError(null)
    finalizeMarks.mutate({ examId, entries: buildEntries() }, {
      onSuccess: () => { setConfirmFinalizeOpen(false); onClose() },
      onError:   (err) => {
        setConfirmFinalizeOpen(false)
        setActionError(getErrorMessage(err, 'The marks could not be finalized.'))
      },
    })
  }

  // RW-1: save reviewer corrections to individual marks (marks stay final).
  function saveCorrections() {
    setActionError(null)
    const outOfRange = findOutOfRange()
    if (Object.keys(outOfRange).length > 0) {
      setErrors(outOfRange)
      setActionError(`${Object.keys(outOfRange).length} mark(s) are outside 0–${maxMark}. Fix them before saving.`)
      return
    }
    correctMarks.mutate({ entries: buildEntries(), isDraft: false }, {
      onSuccess: onClose,
      onError:   (err) => setActionError(getErrorMessage(err, 'The corrections could not be saved.')),
    })
  }

  const loading = studentsLoading || marksLoading

  return (
    <>
      <Modal
        title={correctionMode ? 'Correct Marks (Review)' : 'Enter Marks'}
        description={loading ? 'Loading…' : `${students.length} students · out of ${maxMark}`}
        onClose={onClose}
        busy={busy}
        size="xl"
        flush
        footer={
          <>
            <button type="button" onClick={onClose} disabled={busy} className={`${MODAL_BTN_SECONDARY} sm:mr-auto`}>
              {readOnly && !correctionMode ? 'Close' : 'Cancel'}
            </button>
            {correctionMode ? (
              <button type="button" onClick={saveCorrections} disabled={busy || !hydrated} aria-busy={correctMarks.isPending} className={MODAL_BTN_PRIMARY}>
                {correctMarks.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {correctMarks.isPending ? 'Saving…' : 'Save Corrections'}
              </button>
            ) : !readOnly ? (
              <>
                <button type="button" onClick={saveDraft} disabled={busy || !hydrated} aria-busy={enterMarks.isPending} className={MODAL_BTN_SECONDARY}>
                  {enterMarks.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {enterMarks.isPending ? 'Saving draft…' : 'Save Draft'}
                </button>
                <button type="button" onClick={requestFinalize} disabled={busy || !hydrated} aria-busy={finalizeMarks.isPending} className={MODAL_BTN_PRIMARY}>
                  {finalizeMarks.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                  {finalizeMarks.isPending ? 'Finalizing…' : 'Finalize Marks'}
                </button>
              </>
            ) : null}
          </>
        }
      >
          {/* Result of the last action - persists after the toast fades. */}
          {actionError && (
            <p role="alert" className="mx-5 mt-4 flex items-start gap-2 text-xs text-brand-coral bg-brand-coral/8 border border-brand-coral/20 rounded-xl px-4 py-3">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
              {actionError}
            </p>
          )}
          {!actionError && draftSavedAt && !busy && !readOnly && !correctionMode && (
            <p role="status" className="mx-5 mt-4 flex items-center gap-2 text-xs text-brand-teal">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden />
              Draft saved at {draftSavedAt.toLocaleTimeString('en-MW', { hour: '2-digit', minute: '2-digit' })}. You can close this and come back to finish later.
            </p>
          )}
          {loading ? (
            <div className="px-6 py-12 text-center text-sm text-muted animate-pulse">
              Loading students and saved marks…
            </div>
          ) : (
            <div className="table-scroll">
            <table className="w-full text-sm border-collapse min-w-75">
              <thead>
                <tr className="border-b border-base bg-page">
                  <th className="px-5 py-3 text-left font-heading text-xs uppercase tracking-wide text-muted">Student</th>
                  <th className="px-5 py-3 text-left font-heading text-xs uppercase tracking-wide text-muted w-36">Mark (/{maxMark})</th>
                  <th className="px-5 py-3 text-center font-heading text-xs uppercase tracking-wide text-muted w-24">Absent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-base">
                {students.map((student) => (
                  <tr key={student.id} className={marks[student.id]?.absent ? 'text-muted italic' : ''}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-body">{student.firstName} {student.lastName}</p>
                      <p className="text-xs text-muted">{student.registrationNo}</p>
                    </td>
                    <td className="px-5 py-2">
                      <input
                        type="number" min={0} max={maxMark}
                        value={marks[student.id]?.mark ?? ''}
                        disabled={marks[student.id]?.absent || !editable}
                        onChange={(e) => setMark(student.id, e.target.value)}
                        aria-label={`Mark for ${student.firstName} ${student.lastName}`}
                        className={`w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal/25 ${
                          errors[student.id] ? 'border-brand-coral bg-brand-coral/5' : 'border-base bg-page'
                        } disabled:opacity-40`}
                      />
                      {errors[student.id] && (
                        <p className="text-xs text-brand-coral mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> {errors[student.id]}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-2 text-center">
                      <input
                        type="checkbox"
                        className="accent-brand-amber w-4 h-4"
                        checked={marks[student.id]?.absent ?? false}
                        onChange={() => toggleAbsent(student.id)}
                        disabled={!editable}
                        aria-label={`Mark ${student.firstName} ${student.lastName} as absent`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
      </Modal>

      {/* R15 — confirmation before the irreversible finalize */}
        <ConfirmDialog
          open={confirmFinalizeOpen}
          title="Finalize these marks?"
          description={`Marks for all ${students.length} students will be submitted and the sheet locked against further entry. Once confirmed, this exam can no longer be edited or deleted, and corrections need an exam officer.`}
          confirmLabel="Finalize Marks"
          confirming={finalizeMarks.isPending}
          confirmingLabel="Finalizing…"
          destructive
          onConfirm={doFinalize}
          onCancel={() => setConfirmFinalizeOpen(false)}
        />
    </>
  )
}