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
'use client'
import { useState, useMemo } from 'react'
import { useStudents } from '@/hooks/useStudents'
import { useEnterMarks, useFinalizeMarks, useExamMarks, useCorrectMarks } from '@/hooks/useExams'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, Lock, Save, AlertTriangle } from 'lucide-react'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import type { ApiStudent } from '@shared/types/api'

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
      next[s.id] = saved ? { mark: saved.mark, absent: saved.absent } : { mark: null, absent: false }
    }
    setMarks(next)
    setHydrated(true)
  }

  function setMark(studentId: string, val: string) {
    const n = val === '' ? null : Number(val)
    setMarks((p) => ({ ...p, [studentId]: { ...p[studentId]!, mark: n, absent: false } }))
    setErrors((p) => Object.fromEntries(Object.entries(p).filter(([id]) => id !== studentId)))
  }

  function toggleAbsent(studentId: string) {
    setMarks((p) => ({ ...p, [studentId]: { mark: null, absent: !(p[studentId]?.absent) } }))
  }

  function saveDraft() {
    const entries = students.map((s) => ({
      examId, studentId: s.id,
      mark:   marks[s.id]?.mark ?? undefined,
      absent: marks[s.id]?.absent ?? false,
    }))
    enterMarks.mutate({ entries, isDraft: true })
  }

  // R15 — split: the button validates and opens the shared ConfirmDialog;
  // the actual submit + finalize runs only from the dialog's onConfirm.
  function requestFinalize() {
    const missing = students.filter((s) => marks[s.id]?.mark === null && !marks[s.id]?.absent)
    if (missing.length > 0) {
      const errs: Record<string, string> = {}
      missing.forEach((s) => { errs[s.id] = 'Mark required or mark as absent' })
      setErrors(errs)
      return
    }
    setConfirmFinalizeOpen(true)
  }

  function doFinalize() {
    setConfirmFinalizeOpen(false)
    const entries = students.map((s) => ({
      examId, studentId: s.id,
      mark:   marks[s.id]?.mark ?? undefined,
      absent: marks[s.id]?.absent ?? false,
    }))
    enterMarks.mutate({ entries, isDraft: false }, {
      onSuccess: () => finalizeMarks.mutate(examId, { onSuccess: onClose }),
    })
  }

  // RW-1: save reviewer corrections to individual marks (marks stay final).
  function saveCorrections() {
    const entries = students.map((s) => ({
      examId, studentId: s.id,
      mark:   marks[s.id]?.mark ?? undefined,
      absent: marks[s.id]?.absent ?? false,
    }))
    correctMarks.mutate({ entries, isDraft: false }, { onSuccess: onClose })
  }

  const loading = studentsLoading || marksLoading

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="absolute inset-0" onClick={onClose} />
        <motion.div className="relative z-10 w-full max-w-2xl bg-surface rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
          initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-base shrink-0">
            <div>
              <h2 className="font-heading font-bold text-brand-navy">{correctionMode ? 'Correct Marks (Review)' : 'Enter Marks'}</h2>
              <p className="text-xs text-muted mt-0.5">
                {loading ? 'Loading…' : `${students.length} students · out of ${maxMark}`}
              </p>
            </div>
            <button onClick={onClose} aria-label="Close" className="p-2 hover:bg-page rounded-xl">
              <X className="w-4 h-4 text-muted" />
            </button>
          </div>
          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="px-6 py-12 text-center text-sm text-muted animate-pulse">
                Loading students and saved marks…
              </div>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-base bg-page">
                    <th className="px-5 py-3 text-left font-heading text-xs uppercase tracking-wide text-muted">Student</th>
                    <th className="px-5 py-3 text-left font-heading text-xs uppercase tracking-wide text-muted w-36">Mark (/{maxMark})</th>
                    <th className="px-5 py-3 text-center font-heading text-xs uppercase tracking-wide text-muted w-24">Absent</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-base">
                  {students.map((student) => (
                    <tr key={student.id} className={marks[student.id]?.absent ? 'bg-amber-50' : ''}>
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
            )}
          </div>
          <div className="px-6 py-4 border-t border-base flex items-center justify-between gap-3 shrink-0">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-base rounded-xl hover:bg-page">
              {readOnly && !correctionMode ? 'Close' : 'Cancel'}
            </button>
            {correctionMode ? (
              <button type="button" onClick={saveCorrections} disabled={correctMarks.isPending || !hydrated}
                className="flex items-center gap-2 px-5 py-2 text-sm bg-brand-teal text-white rounded-xl font-semibold disabled:opacity-60 hover:bg-brand-teal/90">
                {correctMarks.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Corrections
              </button>
            ) : !readOnly ? (
            <div className="flex gap-3">
              <button onClick={saveDraft} disabled={enterMarks.isPending || !hydrated}
                className="flex items-center gap-2 px-4 py-2 text-sm border border-base rounded-xl hover:bg-page disabled:opacity-60">
                {enterMarks.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Draft
              </button>
              <button type="button" onClick={requestFinalize} disabled={finalizeMarks.isPending || !hydrated}
                className="flex items-center gap-2 px-5 py-2 text-sm bg-brand-navy text-white rounded-xl font-semibold disabled:opacity-60 hover:bg-brand-navy-mid">
                {finalizeMarks.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                Finalize Marks
              </button>
            </div>
            ) : null}
          </div>

          {/* R15 — confirmation before the irreversible finalize */}
          <ConfirmDialog
            open={confirmFinalizeOpen}
            title="Finalize these marks?"
            description={`Marks for all ${students.length} students will be submitted and the sheet locked against further entry. Corrections after this point require an administrator.`}
            confirmLabel="Finalize Marks"
            destructive
            onConfirm={doFinalize}
            onCancel={() => setConfirmFinalizeOpen(false)}
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}