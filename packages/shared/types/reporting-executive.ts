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
  groups: ApiExecutiveGroup[]
  insights: ReportInsight[]
  /** Sections left out because the caller lacks the permission or the data could not load. */
  warnings: ReportWarning[]
  generatedAt: string
}
