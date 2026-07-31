/**
 * apps/web/src/app/(auth)/attendance/page.tsx
 *
 * [CHANGE TYPE]: NEW FILE (production fix, 2026-07-31)
 * [PURPOSE]: Full attendance audit finding — a student had no way to see
 *   their own attendance history anywhere in the app. The class detail
 *   page's Attendance tab was purely a teacher marking tool with no
 *   student-facing mode, and the one hook that already existed for this
 *   (useStudentAttendance) had zero UI callers. Built as its own top-level
 *   page rather than squeezed into the class detail tabs, matching the
 *   standard pattern for this kind of self-service view (a distinct "My
 *   Attendance" nav entry, not nested under a page a student can't manage).
 *
 *   Design follows the researched standard for a student-facing attendance
 *   view: a stats summary (present/absent/late/rate) for the selected term,
 *   plus a real month calendar with colour-coded days — not just a flat
 *   list — since a calendar makes patterns (a string of Mondays, a bad
 *   week) visible at a glance in a way a table doesn't.
 * [DEPENDS ON]: useStudentMe (student's own Student.id), useCurrentAcademicPeriod,
 *   useOwnAttendance (analytics.ts — resolveStudentId bug fixed same pass),
 *   useStudentAttendance (attendance.ts — already correctly self-scoped,
 *   simply never had a caller)
 */
'use client'

import { useMemo, useState } from 'react'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { useStudentMe } from '@/hooks/useStudents'
import { useCurrentAcademicPeriod } from '@/hooks/useSettings'
import { useOwnAttendance } from '@/hooks/useAnalytics'
import { useStudentAttendance } from '@/hooks/useAttendance'
import {
  startOfMonth, endOfMonth, eachDayOfInterval, format, isSameMonth,
  isSameDay, addMonths, subMonths, isToday, isFuture,
} from 'date-fns'
import { ChevronLeft, ChevronRight, CheckCircle2, XCircle, Clock3, CalendarDays } from 'lucide-react'

export default function AttendancePage() {
  return (
    <RoleGuard allowed={['student']}>
      <AttendanceContent />
    </RoleGuard>
  )
}

type Status = 'PRESENT' | 'ABSENT' | 'LATE'

const STATUS_STYLE: Record<Status, { dot: string; bg: string; text: string }> = {
  PRESENT: { dot: 'bg-emerald-500', bg: 'bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-400' },
  ABSENT:  { dot: 'bg-brand-coral', bg: 'bg-brand-coral/10', text: 'text-brand-coral' },
  LATE:    { dot: 'bg-brand-amber', bg: 'bg-brand-amber/10', text: 'text-brand-amber' },
}

function AttendanceContent() {
  const { data: me } = useStudentMe()
  const { academicYear: defaultYear, term: defaultTerm } = useCurrentAcademicPeriod()
  const [term, setTerm] = useState<number | null>(null)
  const activeTerm = term ?? defaultTerm ?? 1

  const { data: summary, isLoading: summaryLoading } = useOwnAttendance(
    me?.id ?? '', defaultYear ?? '', activeTerm,
  )
  const { data: records = [], isLoading: recordsLoading } = useStudentAttendance(me?.id ?? '')

  const [viewMonth, setViewMonth] = useState(new Date())
  const recordByDate = useMemo(() => {
    const map = new Map<string, Status>()
    for (const r of records) map.set(format(new Date(r.date), 'yyyy-MM-dd'), r.status)
    return map
  }, [records])

  const monthDays = useMemo(() => {
    const start = startOfMonth(viewMonth)
    const end = endOfMonth(viewMonth)
    // Pad to full weeks (Sun–Sat) so the grid stays rectangular.
    const startPad = start.getDay()
    const days = eachDayOfInterval({ start, end })
    return { leadingBlanks: startPad, days }
  }, [viewMonth])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold text-brand-navy dark:text-white flex items-center gap-2">
          <CalendarDays className="w-6 h-6 text-brand-teal" aria-hidden />
          My Attendance
        </h1>
        <p className="text-sm text-muted mt-0.5">Your own attendance record — no other student&apos;s data is shown here.</p>
      </div>

      {/* ── Term summary ─────────────────────────────────────────────── */}
      <div className="bg-surface rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="font-heading font-semibold text-sm text-body">Term Summary</p>
          <select
            value={activeTerm}
            onChange={(e) => setTerm(Number(e.target.value))}
            className="border border-base rounded-lg px-3 py-1.5 text-sm bg-page min-h-[36px]"
            aria-label="Select term"
          >
            {[1, 2, 3].map((t) => <option key={t} value={t}>Term {t}</option>)}
          </select>
        </div>
        {summaryLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 rounded-lg bg-page animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-page">
              <p className="text-xs text-muted mb-1">Present</p>
              <p className="text-2xl font-heading font-bold text-emerald-600 dark:text-emerald-400">{summary?.daysPresent ?? 0}</p>
            </div>
            <div className="p-3 rounded-lg bg-page">
              <p className="text-xs text-muted mb-1">Absent</p>
              <p className="text-2xl font-heading font-bold text-brand-coral">{summary?.daysAbsent ?? 0}</p>
            </div>
            <div className="p-3 rounded-lg bg-page">
              <p className="text-xs text-muted mb-1">Late</p>
              <p className="text-2xl font-heading font-bold text-brand-amber">{summary?.daysLate ?? 0}</p>
            </div>
            <div className="p-3 rounded-lg bg-page">
              <p className="text-xs text-muted mb-1">Attendance Rate</p>
              <p className="text-2xl font-heading font-bold text-brand-navy dark:text-white">{summary?.attendanceRate ?? 0}%</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Calendar ──────────────────────────────────────────────────── */}
      <div className="bg-surface rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <button
            type="button"
            onClick={() => setViewMonth((d) => subMonths(d, 1))}
            aria-label="Previous month"
            className="p-2 rounded-lg hover:bg-page text-muted hover:text-body min-h-11 min-w-11 flex items-center justify-center"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <p className="font-heading font-semibold text-body">{format(viewMonth, 'MMMM yyyy')}</p>
          <button
            type="button"
            onClick={() => setViewMonth((d) => addMonths(d, 1))}
            disabled={isFuture(startOfMonth(addMonths(viewMonth, 1)))}
            aria-label="Next month"
            className="p-2 rounded-lg hover:bg-page text-muted hover:text-body disabled:opacity-30 min-h-11 min-w-11 flex items-center justify-center"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {recordsLoading ? (
          <div className="h-64 rounded-lg bg-page animate-pulse" />
        ) : (
          <>
            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="text-center text-[11px] font-heading font-semibold text-muted uppercase py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: monthDays.leadingBlanks }).map((_, i) => <div key={`blank-${i}`} />)}
              {monthDays.days.map((day) => {
                const key = format(day, 'yyyy-MM-dd')
                const status = recordByDate.get(key)
                const style = status ? STATUS_STYLE[status] : null
                return (
                  <div
                    key={key}
                    className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-xs
                      ${style ? style.bg : 'bg-page'}
                      ${isToday(day) ? 'ring-2 ring-brand-teal' : ''}`}
                  >
                    <span className={`font-medium ${style ? style.text : 'text-muted'}`}>{format(day, 'd')}</span>
                    {status && <span className={`w-1.5 h-1.5 rounded-full ${style!.dot}`} aria-hidden />}
                  </div>
                )
              })}
            </div>
          </>
        )}

        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-base flex-wrap">
          <span className="flex items-center gap-1.5 text-xs text-muted"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Present</span>
          <span className="flex items-center gap-1.5 text-xs text-muted"><XCircle className="w-3.5 h-3.5 text-brand-coral" /> Absent</span>
          <span className="flex items-center gap-1.5 text-xs text-muted"><Clock3 className="w-3.5 h-3.5 text-brand-amber" /> Late</span>
          <span className="flex items-center gap-1.5 text-xs text-muted"><span className="w-3.5 h-3.5 rounded bg-page border border-base inline-block" /> No record</span>
        </div>
      </div>
    </div>
  )
}