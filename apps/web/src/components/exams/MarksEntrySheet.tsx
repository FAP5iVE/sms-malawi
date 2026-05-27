'use client'
import { useState, useMemo } from 'react'
import { useStudents } from '@/hooks/useStudents'
import { useEnterMarks, useFinalizeMarks } from '@/hooks/useExams'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, Lock, Save, AlertTriangle } from 'lucide-react'
import type { ApiStudent } from '@shared/types/api'

interface Props { examId: string; classId: string; onClose: () => void }

type MarkEntry = { mark: number | null; absent: boolean }

export function MarksEntrySheet({ examId, classId, onClose }: Props) {
  const { data: studentData } = useStudents({ classId, status: 'ACTIVE' })
  const students = (studentData?.students ?? []) as ApiStudent[]
  const enterMarks   = useEnterMarks(examId)
  const finalizeMarks = useFinalizeMarks()

  // useMemo instead of useEffect+setState — avoids the set-state-in-effect lint error
  const initialMarks = useMemo(() => {
    const init: Record<string, MarkEntry> = {}
    students.forEach((s) => { init[s.id] = { mark: null, absent: false } })
    return init
  }, [students])

  const [marks, setMarks] = useState<Record<string, MarkEntry>>(initialMarks)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function setMark(studentId: string, val: string) {
    const n = val === '' ? null : Number(val)
    setMarks((p) => ({ ...p, [studentId]: { ...p[studentId]!, mark: n, absent: false } }))
    setErrors((p) => { const { [studentId]: _removed, ...rest } = p; return rest })
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

  function finalize() {
    const missing = students.filter((s) => marks[s.id]?.mark === null && !marks[s.id]?.absent)
    if (missing.length > 0) {
      const errs: Record<string, string> = {}
      missing.forEach((s) => { errs[s.id] = 'Mark required or mark as absent' })
      setErrors(errs)
      return
    }
    const entries = students.map((s) => ({
      examId, studentId: s.id,
      mark:   marks[s.id]?.mark ?? undefined,
      absent: marks[s.id]?.absent ?? false,
    }))
    enterMarks.mutate({ entries, isDraft: false }, {
      onSuccess: () => finalizeMarks.mutate(examId, { onSuccess: onClose }),
    })
  }

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="absolute inset-0" onClick={onClose} />
        <motion.div className="relative z-10 w-full max-w-2xl bg-surface rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
          initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-base shrink-0">
            <div>
              <h2 className="font-heading font-bold text-brand-navy">Enter Marks</h2>
              <p className="text-xs text-muted mt-0.5">{students.length} students</p>
            </div>
            <button onClick={onClose} aria-label="Close" className="p-2 hover:bg-page rounded-xl">
              <X className="w-4 h-4 text-muted" />
            </button>
          </div>
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-base bg-page">
                  <th className="px-5 py-3 text-left font-heading text-xs uppercase tracking-wide text-muted">Student</th>
                  <th className="px-5 py-3 text-left font-heading text-xs uppercase tracking-wide text-muted w-36">Mark</th>
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
                        type="number" min={0} max={100}
                        value={marks[student.id]?.mark ?? ''}
                        disabled={marks[student.id]?.absent}
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
                        aria-label={`Mark ${student.firstName} ${student.lastName} as absent`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-4 border-t border-base flex items-center justify-between gap-3 shrink-0">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-base rounded-xl hover:bg-page">Cancel</button>
            <div className="flex gap-3">
              <button onClick={saveDraft} disabled={enterMarks.isPending}
                className="flex items-center gap-2 px-4 py-2 text-sm border border-base rounded-xl hover:bg-page disabled:opacity-60">
                {enterMarks.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save Draft
              </button>
              <button onClick={finalize} disabled={finalizeMarks.isPending}
                className="flex items-center gap-2 px-5 py-2 text-sm bg-brand-navy text-white rounded-xl font-semibold disabled:opacity-60 hover:bg-brand-navy-mid">
                {finalizeMarks.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                Finalize Marks
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}