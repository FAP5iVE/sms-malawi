/**
 * packages/shared/types/reporting.ts
 *
 * The shared reporting contract used by every role's Reports page and
 * Dashboard. Server services build KPIs/insights with these shapes
 * (apps/web/src/server/services/reporting/*), the API returns them verbatim and
 * the shared report UI (apps/web/src/components/reports/ui/*) renders them, so
 * a number looks and behaves the same wherever it appears.
 *
 * Principles encoded here:
 *  - A KPI that cannot be computed is `value: null` (rendered "N/A"), never 0.
 *  - Every KPI carries its unit, its description (formula in words) and, when
 *    useful, a comparison and a drill-down href.
 *  - Insights are deterministic: generated from thresholds, never free text.
 */

export type ReportKpiUnit = 'count' | 'percent' | 'mwk' | 'days' | 'score' | 'ratio' | 'text'

/** Semantic health of a KPI. `neutral` = informational, no judgement. */
export type ReportStatus = 'healthy' | 'watch' | 'critical' | 'neutral'

export type ReportDirection = 'up' | 'down' | 'flat'

export interface ReportKpiComparison {
  /** Absolute or percentage-point change vs the comparison period. */
  delta: number
  direction: ReportDirection
  /** e.g. "vs previous term" */
  label: string
  /** Whether an increase is good, bad or neither (drives colour). */
  polarity: 'up-good' | 'down-good' | 'neutral'
}

export interface ReportKpi {
  key: string
  label: string
  /** null = not computable for this scope/period (render "N/A"). */
  value: number | string | null
  unit: ReportKpiUnit
  status: ReportStatus
  /** Plain-language definition: what is divided by what, over which period. */
  description: string
  /** Secondary line, e.g. "1,240 of 1,580 billed". */
  subLabel?: string
  comparison?: ReportKpiComparison
  /** App route (may carry query params) that investigates this number. */
  href?: string
}

export type ReportInsightSeverity = 'info' | 'positive' | 'watch' | 'critical'

export interface ReportInsight {
  key: string
  severity: ReportInsightSeverity
  title: string
  detail: string
  href?: string
}

export interface ReportWarning {
  key: string
  message: string
}

export interface ReportScope {
  academicYear?: string
  term?: number | null
  /** Human description of the data scope, e.g. "Your assigned classes". */
  description: string
}

/** A self-describing block returned by new reporting endpoints. */
export interface ReportSectionData<TSeries = unknown, TRow = unknown> {
  key: string
  title: string
  description?: string
  scope: ReportScope
  kpis: ReportKpi[]
  series?: TSeries[]
  rows?: TRow[]
  insights?: ReportInsight[]
  warnings?: ReportWarning[]
  generatedAt: string
}

/** Attention-queue entry used by dashboards ("what needs action"). */
export interface AttentionItem {
  key: string
  severity: ReportInsightSeverity
  label: string
  count: number | null
  detail?: string
  href?: string
}

/** Standard multi-column table payload. */
export interface ReportTableColumn {
  key: string
  label: string
  align?: 'left' | 'right' | 'center'
  format?: 'text' | 'count' | 'percent' | 'mwk' | 'date' | 'days'
}
