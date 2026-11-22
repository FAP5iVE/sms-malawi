/** Response types for /reporting/attendance/* */

export interface ApiAttendanceClassRow {
  classId: string
  className: string
  form: number
  students: number
  present: number
  late: number
  absent: number
  /** (present + late) ÷ recorded days; null when nothing was recorded. */
  attendanceRate: number | null
  /** Latest date attendance was marked for the class (ISO), null if never. */
  lastMarked: string | null
}

export interface ApiChronicAbsentee {
  studentId: string
  name: string
  className: string
  absentDays: number
  recordedDays: number
  absenceRate: number
}

export interface ApiAttendanceReport {
  academicYear: string
  term: number
  scope: 'school' | 'teacher'
  present: number
  late: number
  absent: number
  recorded: number
  attendanceRate: number | null
  lateRate: number | null
  previousRate: number | null
  byClass: ApiAttendanceClassRow[]
  /** Week commencing (Monday) → rate. */
  byWeek: { weekStart: string; label: string; rate: number | null; recorded: number }[]
  byWeekday: { dayOfWeek: number; label: string; rate: number | null; recorded: number }[]
  chronic: ApiChronicAbsentee[]
  chronicThresholdPct: number
  chronicMinDays: number
}
