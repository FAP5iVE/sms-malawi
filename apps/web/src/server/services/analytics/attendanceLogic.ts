/** Pure attendance maths (no database access, unit-tested). */
import { ratioPct } from '@/server/services/reporting/kpi'

/** A student is a chronic absentee at/above this absence rate… */
export const CHRONIC_ABSENCE_PCT = 20
/** …provided at least this many days were recorded (avoids 1-of-2 false alarms). */
export const CHRONIC_MIN_DAYS = 10

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const weekdayLabel = (d: number) => WEEKDAYS[d] ?? ''

/** School convention: late counts as attended. */
export function attendanceRate(present: number, late: number, absent: number): number | null {
  return ratioPct(present + late, present + late + absent)
}

/** Monday of the week containing `d` (UTC), as YYYY-MM-DD. */
export function weekStart(d: Date): string {
  const day = d.getUTCDay() // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff))
  return monday.toISOString().slice(0, 10)
}

export interface DailyCount {
  date: Date
  status: string
  count: number
}

export function aggregateWeeks(daily: readonly DailyCount[]) {
  const m = new Map<string, { present: number; late: number; absent: number }>()
  for (const d of daily) {
    const k = weekStart(d.date)
    const w = m.get(k) ?? { present: 0, late: 0, absent: 0 }
    if (d.status === 'PRESENT') w.present += d.count
    else if (d.status === 'LATE') w.late += d.count
    else if (d.status === 'ABSENT') w.absent += d.count
    m.set(k, w)
  }
  return Array.from(m.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([start, w]) => ({
      weekStart: start,
      label: new Date(`${start}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }),
      rate: attendanceRate(w.present, w.late, w.absent),
      recorded: w.present + w.late + w.absent,
    }))
}

export function aggregateWeekdays(daily: readonly DailyCount[]) {
  const m = new Map<number, { present: number; late: number; absent: number }>()
  for (const d of daily) {
    const k = d.date.getUTCDay()
    const w = m.get(k) ?? { present: 0, late: 0, absent: 0 }
    if (d.status === 'PRESENT') w.present += d.count
    else if (d.status === 'LATE') w.late += d.count
    else if (d.status === 'ABSENT') w.absent += d.count
    m.set(k, w)
  }
  // Monday–Friday first (school days); weekend entries only if data exists.
  return [1, 2, 3, 4, 5, 6, 0]
    .filter((k) => m.has(k))
    .map((k) => {
      const w = m.get(k) as { present: number; late: number; absent: number }
      return { dayOfWeek: k, label: weekdayLabel(k), rate: attendanceRate(w.present, w.late, w.absent), recorded: w.present + w.late + w.absent }
    })
}

export interface StudentDayCount {
  studentId: string
  status: string
  count: number
}

/** Students at/above the chronic absence threshold, worst first. */
export function findChronic(
  rows: readonly StudentDayCount[],
  pct = CHRONIC_ABSENCE_PCT,
  minDays = CHRONIC_MIN_DAYS,
): { studentId: string; absentDays: number; recordedDays: number; absenceRate: number }[] {
  const m = new Map<string, { absent: number; total: number }>()
  for (const r of rows) {
    const s = m.get(r.studentId) ?? { absent: 0, total: 0 }
    s.total += r.count
    if (r.status === 'ABSENT') s.absent += r.count
    m.set(r.studentId, s)
  }
  const out: { studentId: string; absentDays: number; recordedDays: number; absenceRate: number }[] = []
  for (const [studentId, s] of m) {
    if (s.total < minDays) continue
    const rate = ratioPct(s.absent, s.total)
    if (rate !== null && rate >= pct) out.push({ studentId, absentDays: s.absent, recordedDays: s.total, absenceRate: rate })
  }
  return out.sort((a, b) => b.absenceRate - a.absenceRate || b.absentDays - a.absentDays)
}
