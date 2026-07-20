/**
 * apps/web/src/components/classes/AttendanceSheet.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE
 * [R-PHASE]: R3 — Gateway Hardening (stopgap `db!` null-guard fix,
 *   superseded — not layered on top of — by this phase's real migration);
 *   R6 — Academics II: Classes, Assignments & the Attendance Rebuild
 * [PURPOSE]: Replaces both Firestore call sites (the onSnapshot listener
 *   and the setDoc write, including the R3 stopgap null-guard around them)
 *   with TanStack Query hooks (useClassAttendance/useMarkAttendance)
 *   calling the new Express route, per the R3 Option B decision. The
 *   realtime "live update while marking" UX Firestore provided is replaced
 *   with a standard mutate-then-invalidate pattern: each tap optimistically
 *   updates local state, then saves that one student's entry; a failed
 *   save reverts the optimistic update and surfaces an inline error,
 *   matching the R3 stopgap's own error-handling shape. The status model
 *   also gains a third state (LATE) the old Firestore-backed component
 *   never supported — tapping now cycles PRESENT → ABSENT → LATE → PRESENT.
 * [DEPENDS ON]: apps/web/src/hooks/useAttendance.ts
 */
'use client'

import { useState } from 'react'
import { useClassAttendance, useMarkAttendance } from '@/hooks/useAttendance'
import { CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'

interface Student {
  id: string
  firstName: string
  lastName: string
}

interface AttendanceSheetProps {
  classId: string
  students: Student[]
  date?: Date
}

type AttendanceStatusValue = 'PRESENT' | 'ABSENT' | 'LATE'
type AttendanceRecord = Record<string, AttendanceStatusValue>

const STATUS_CYCLE: readonly AttendanceStatusValue[] = ['PRESENT', 'ABSENT', 'LATE']

const STATUS_DISPLAY: Record<AttendanceStatusValue, { icon: typeof CheckCircle; label: string; textCls: string }> = {
  PRESENT: { icon: CheckCircle, label: 'Present', textCls: 'text-emerald-600' },
  ABSENT:  { icon: XCircle,     label: 'Absent',  textCls: 'text-brand-coral/70' },
  LATE:    { icon: Clock,       label: 'Late',    textCls: 'text-brand-amber' },
}

export function AttendanceSheet({ classId, students, date = new Date() }: AttendanceSheetProps) {
  const dateStr = format(date, 'yyyy-MM-dd')

  const { data: fetched = [], isLoading } = useClassAttendance(classId, dateStr)
  const { mutate: markAttendance, isPending: saving } = useMarkAttendance()

  const [record, setRecord] = useState<AttendanceRecord>({})
  const [saveError, setSaveError] = useState<string | null>(null)

  // Re-seed local state whenever the server data actually changes (initial
  // load, date change, or after a successful save's invalidation refetch) —
  // unmarked students default to ABSENT, matching the previous
  // Firestore-backed component's own default.
  //
  // This intentionally does NOT use a useEffect: `fetched`/`students` are
  // reference-stable between renders until they genuinely change (TanStack
  // Query's structural sharing, and the caller's own students array), so
  // comparing against the previous render's references and adjusting state
  // directly in the render body — React's own documented pattern for
  // "reset state when a prop changes" — re-seeds `record` one render sooner
  // than an effect would, without ever calling setState from inside one.
  const [prevFetched, setPrevFetched] = useState(fetched)
  const [prevStudents, setPrevStudents] = useState(students)
  if (fetched !== prevFetched || students !== prevStudents) {
    setPrevFetched(fetched)
    setPrevStudents(students)
    const seeded: AttendanceRecord = {}
    for (const student of students) {
      const existing = fetched.find((r) => r.studentId === student.id)
      seeded[student.id] = existing?.status ?? 'ABSENT'
    }
    setRecord(seeded)
  }

  function cycle(studentId: string) {
    setSaveError(null)
    const current = record[studentId] ?? 'ABSENT'
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length]!
    const previousRecord = record
    setRecord({ ...record, [studentId]: next })

    markAttendance(
      {
        classId,
        date: dateStr,
        entries: [{ studentId, status: next }],
      },
      {
        onError: () => {
          setRecord(previousRecord) // revert the optimistic update on write failure
          setSaveError('Failed to save attendance. Please try again.')
        },
      }
    )
  }

  const presentCount = Object.values(record).filter((v) => v === 'PRESENT').length

  if (isLoading) {
    return (
      <div className="bg-surface border border-base rounded-xl p-5">
        <div className="skeleton h-6 w-40 rounded-md mb-4" />
        <div className="space-y-2">
          {students.map((s) => (
            <div key={s.id} className="skeleton h-10 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-base rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-base">
        <p className="font-heading font-semibold text-sm text-brand-navy">
          Attendance — {format(date, 'dd MMM yyyy')}
        </p>
        <p className="text-xs text-muted">
          {presentCount} / {students.length} present
          {saving && ' · saving…'}
        </p>
      </div>
      {saveError && (
        <div className="px-5 py-2 bg-brand-coral/10 border-b border-base flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-brand-coral shrink-0" aria-hidden />
          <p className="text-xs text-brand-coral">{saveError}</p>
        </div>
      )}
      <div className="divide-y divide-base">
        {students.map((student) => {
          const status = record[student.id] ?? 'ABSENT'
          const { icon: Icon, label, textCls } = STATUS_DISPLAY[status]
          return (
            <div
              key={student.id}
              className="flex items-center justify-between px-5 py-2.5 hover:bg-page transition-colors"
            >
              <p className="text-sm font-medium">
                {student.firstName} {student.lastName}
              </p>
              <button
                onClick={() => cycle(student.id)}
                aria-label={`${student.firstName} ${student.lastName}: ${label}. Tap to change.`}
                className="flex items-center gap-1.5 text-sm font-medium transition-colors min-h-11"
              >
                <Icon className={`w-5 h-5 ${textCls}`} aria-hidden />
                <span className={textCls}>{label}</span>
              </button>
            </div>
          )
        })}
        {students.length === 0 && (
          <p className="px-5 py-10 text-center text-muted text-sm">
            No students assigned to this class yet.
          </p>
        )}
      </div>
    </div>
  )
}