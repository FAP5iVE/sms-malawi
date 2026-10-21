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
