/**
 * apps/web/src/components/classes/AttendanceSheet.tsx
 *
 * [CHANGE TYPE]: MAJOR REWRITE (production fix, 2026-07-31 — full
 *   classes/attendance audit, tracked in ATTENDANCE_AUDIT.md)
 * [PURPOSE]: Was a single button per student that cycled PRESENT → ABSENT
 *   → LATE → PRESENT on repeated taps, no way to jump directly to a
 *   specific status, no date navigation (permanently locked to "today"),
 *   no bulk action, no read-only mode, and no responsive layout — the
 *   name/status pairing had genuine room to visually collide on narrow
 *   viewports since every other list in this app has an established
 *   mobile-card/desktop-row split and this one had neither.
 *
 *   Rebuilt against researched real-world attendance-marking UX patterns:
 *   a date-scoped roster with a segmented, always-visible Present/Absent/
 *   Late control per row (tap the one you want directly), a "Mark all
 *   present" bulk action, and a read-only mode for staff with oversight
 *   visibility but no marking rights for this specific class (the parent
 *   page — classes/[id]/page.tsx — now decides who gets which mode based
 *   on real Class.teacherId ownership, not just the broad role
 *   permission).
 * [DEPENDS ON]: apps/web/src/hooks/useAttendance.ts (unchanged)
 */
'use client'

import { useState } from 'react'
import { useClassAttendance, useMarkAttendance } from '@/hooks/useAttendance'
import { CheckCircle2, XCircle, Clock3, AlertTriangle, ChevronLeft, ChevronRight, CalendarDays, Users } from 'lucide-react'
import { format, addDays, subDays, isToday as isTodayFn, isFuture } from 'date-fns'

interface Student {
  id: string
  firstName: string
  lastName: string
}

interface AttendanceSheetProps {
  classId: string
  students: Student[]
  /** Staff with oversight visibility (e.g. class.viewAnalytics) but not
   *  this specific class's assigned teacher see the roster and can
   *  navigate dates, but get status badges instead of marking controls,
   *  and no save/bulk actions at all. */
  readOnly?: boolean
}

type Status = 'PRESENT' | 'ABSENT' | 'LATE'
type AttendanceRecord = Record<string, Status>

const STATUS_CONFIG: Record<Status, { icon: typeof CheckCircle2; label: string; short: string }> = {
  PRESENT: { icon: CheckCircle2, label: 'Present', short: 'P' },
  ABSENT:  { icon: XCircle,      label: 'Absent',  short: 'A' },
  LATE:    { icon: Clock3,       label: 'Late',     short: 'L' },
}

// Active-state styling per status — filled and coloured when selected,
// a plain outline otherwise, so the currently-marked status is
// unambiguous at a glance without relying on colour alone (icon differs
// too, for colour-blind accessibility).
const ACTIVE_CLS: Record<Status, string> = {
  PRESENT: 'bg-emerald-500 border-emerald-500 text-white',
  ABSENT:  'bg-brand-coral border-brand-coral text-white',
  LATE:    'bg-brand-amber border-brand-amber text-white',
}
const BADGE_CLS: Record<Status, string> = {
  PRESENT: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  ABSENT:  'bg-brand-coral/10 text-brand-coral',
  LATE:    'bg-brand-amber/10 text-brand-amber',
}

export function AttendanceSheet({ classId, students, readOnly = false }: AttendanceSheetProps) {
  // [FINDING-08] Component now owns its own date navigation instead of a
  // fixed prop nobody ever varied — starts on today, moves freely to any
  // past day, capped at today (can't mark attendance for a day that
  // hasn't happened yet).
  const [viewDate, setViewDate] = useState(new Date())
  const dateStr = format(viewDate, 'yyyy-MM-dd')
  const onToday = isTodayFn(viewDate)

  const { data: fetched = [], isLoading } = useClassAttendance(classId, dateStr)
  const { mutate: markAttendance, isPending: saving } = useMarkAttendance()

  const [record, setRecord] = useState<AttendanceRecord>({})
  const [saveError, setSaveError] = useState<string | null>(null)

  // Re-seed local state whenever the server data actually changes (date
  // change, initial load, or a save's invalidation refetch) — React's own
  // documented "adjust state during render" pattern rather than an effect,
  // consistent with how finances/page.tsx's own tab-sync fix does this
  // elsewhere in this codebase.
  const [prevFetched, setPrevFetched] = useState(fetched)
  const [prevStudents, setPrevStudents] = useState(students)
  const [prevDateStr, setPrevDateStr] = useState(dateStr)
  if (fetched !== prevFetched || students !== prevStudents || dateStr !== prevDateStr) {
    setPrevFetched(fetched)
    setPrevStudents(students)
    setPrevDateStr(dateStr)
    const seeded: AttendanceRecord = {}
    for (const student of students) {
      const existing = fetched.find((r) => r.studentId === student.id)
      if (existing) seeded[student.id] = existing.status
    }
    setRecord(seeded)
    setSaveError(null)
  }

  function setStatus(studentId: string, status: Status) {
    if (readOnly) return
    setSaveError(null)
    const previousRecord = record
    setRecord({ ...record, [studentId]: status })
    markAttendance(
      { classId, date: dateStr, entries: [{ studentId, status }] },
      {
        onError: () => {
          setRecord(previousRecord)
          setSaveError('Failed to save attendance. Please try again.')
        },
      },
    )
  }

  // [FINDING-09] Bulk mark-all-present — a real, expected feature for a
  // homeroom roster where most students are present most days; marking 40
  // students one at a time for the common case is avoidable friction.
  function markAllPresent() {
    if (readOnly || students.length === 0) return
    setSaveError(null)
    const previousRecord = record
    const next: AttendanceRecord = { ...record }
    for (const s of students) next[s.id] = 'PRESENT'
    setRecord(next)
    markAttendance(
      { classId, date: dateStr, entries: students.map((s) => ({ studentId: s.id, status: 'PRESENT' as const })) },
      {
        onError: () => {
          setRecord(previousRecord)
          setSaveError('Failed to save attendance. Please try again.')
        },
      },
    )
  }

  const markedCount = Object.keys(record).length
  const presentCount = Object.values(record).filter((v) => v === 'PRESENT').length
  const absentCount = Object.values(record).filter((v) => v === 'ABSENT').length
  const lateCount = Object.values(record).filter((v) => v === 'LATE').length

  return (
    <div className="bg-surface rounded-xl overflow-hidden">
      {/* ── Date navigation ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-base gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewDate((d) => subDays(d, 1))}
            aria-label="Previous day"
            className="p-2 rounded-lg hover:bg-page text-muted hover:text-body min-h-11 min-w-11 flex items-center justify-center"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <label className="relative flex items-center">
            <CalendarDays className="w-3.5 h-3.5 text-muted absolute left-2.5 pointer-events-none" aria-hidden />
            <span className="sr-only">Select date</span>
            <input
              type="date"
              value={dateStr}
              max={format(new Date(), 'yyyy-MM-dd')}
              onChange={(e) => e.target.value && setViewDate(new Date(`${e.target.value}T00:00:00`))}
              className="pl-8 pr-2 py-1.5 text-sm border border-base rounded-lg bg-page text-body min-h-11"
            />
          </label>
          <button
            type="button"
            onClick={() => setViewDate((d) => addDays(d, 1))}
            disabled={onToday}
            aria-label="Next day"
            className="p-2 rounded-lg hover:bg-page text-muted hover:text-body disabled:opacity-30 min-h-11 min-w-11 flex items-center justify-center"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {!onToday && (
            <button
              type="button"
              onClick={() => setViewDate(new Date())}
              className="text-xs font-semibold text-brand-teal hover:underline ml-1"
            >
              Today
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {markedCount}/{students.length} marked</span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:flex items-center gap-2.5">
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">{presentCount}P</span>
            <span className="text-brand-coral font-medium">{absentCount}A</span>
            <span className="text-brand-amber font-medium">{lateCount}L</span>
          </span>
          {saving && <span>· saving…</span>}
        </div>
      </div>

      {readOnly && (
        <div className="px-5 py-2 bg-brand-teal/8 border-b border-base">
          <p className="text-xs text-brand-teal">
            Viewing only — you are not the assigned teacher for this class.
          </p>
        </div>
      )}

      {saveError && (
        <div className="px-5 py-2 bg-brand-coral/10 border-b border-base flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-brand-coral shrink-0" aria-hidden />
          <p className="text-xs text-brand-coral">{saveError}</p>
        </div>
      )}

      {/* ── Bulk action ──────────────────────────────────────────────── */}
      {!readOnly && students.length > 0 && (
        <div className="px-5 py-2.5 border-b border-base bg-page/60">
          <button
            type="button"
            onClick={markAllPresent}
            disabled={saving}
            className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline disabled:opacity-50 min-h-11"
          >
            Mark all present
          </button>
        </div>
      )}

      {/* ── Roster ───────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="p-5 space-y-2">
          {students.map((s) => <div key={s.id} className="h-12 rounded-lg bg-page animate-pulse" />)}
        </div>
      ) : students.length === 0 ? (
        <p className="px-5 py-10 text-center text-muted text-sm">No students assigned to this class yet.</p>
      ) : (
        <div className="divide-y divide-base">
          {students.map((student) => {
            const status = record[student.id]
            return (
              <div
                key={student.id}
                className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-page transition-colors flex-wrap sm:flex-nowrap"
              >
                <p className="text-sm font-medium text-body min-w-0 flex-1">
                  {student.firstName} {student.lastName}
                </p>

                {readOnly ? (
                  status ? (
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${BADGE_CLS[status]}`}>
                      {STATUS_CONFIG[status].label}
                    </span>
                  ) : (
                    <span className="text-xs text-muted shrink-0">Not marked</span>
                  )
                ) : (
                  // [FINDING-07] Segmented, always-visible controls — each
                  // status is its own button, tap the one you want
                  // directly. Replaces the old single cycling button that
                  // required repeated taps to reach a specific status.
                  <div className="flex items-center gap-1.5 shrink-0" role="group" aria-label={`Attendance for ${student.firstName} ${student.lastName}`}>
                    {(Object.keys(STATUS_CONFIG) as Status[]).map((s) => {
                      const { icon: Icon, label, short } = STATUS_CONFIG[s]
                      const active = status === s
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setStatus(student.id, s)}
                          aria-pressed={active}
                          aria-label={`Mark ${student.firstName} ${student.lastName} as ${label}`}
                          className={`min-h-11 min-w-11 px-2.5 rounded-lg border flex items-center justify-center gap-1 text-xs font-semibold transition-colors
                            ${active ? ACTIVE_CLS[s] : 'bg-page border-base text-muted hover:border-brand-teal/40 hover:text-body'}`}
                        >
                          <Icon className="w-3.5 h-3.5" aria-hidden />
                          <span className="hidden sm:inline">{label}</span>
                          <span className="sm:hidden">{short}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}