/** Response types for /reporting/executive/* — the school-wide management view (high_rank). */
import type { ReportInsight, ReportKpi, ReportWarning } from './reporting'

export interface ApiExecutiveGroup {
  key: 'academic' | 'students' | 'finance' | 'operations'
  title: string
  kpis: ReportKpi[]
}

export interface ApiExecutiveOverview {
  academicYear: string
  term: number
  /**
   * The four headline KPIs for the Headteacher (student population, attendance,
   * academic performance, fee collection). Each is also present in its group, so
   * the dashboard can show the four prominently and list the rest compactly.
   * A headline whose data the caller may not see is simply absent.
   */
  primary: ReportKpi[]
  groups: ApiExecutiveGroup[]
  insights: ReportInsight[]
  /** Sections left out because the caller lacks the permission or the data could not load. */
  warnings: ReportWarning[]
  generatedAt: string
}

/** Repetition and exits for the leadership Enrollment tab (GET /reporting/executive/retention). */
export interface ApiRetentionFormRow {
  form: number
  /** Students with a recorded promotion-run outcome for the year. */
  students: number
  promoted: number
  repeated: number
  awaitingManeb: number
  graduated: number
  /** repeated / students, percent; null when there are no students. */
  repetitionRate: number | null
}

export interface ApiRetention {
  academicYear: string
  repetitionByForm: ApiRetentionFormRow[]
  /** Students who have repeated in two or more recorded years. */
  multiYearRepeaters: number
  exits: {
    /** Exits dated inside this academic year's terms. */
    total: number
    byReason: { reason: string; count: number }[]
    windowStart: string
    windowEnd: string
  }
  /** Archived students with no exit reason or date (archived before exit records were required). */
  archivedWithoutExitRecord: number
}
