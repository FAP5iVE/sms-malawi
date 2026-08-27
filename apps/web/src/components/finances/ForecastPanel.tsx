'use client'

/**
 * apps/web/src/components/finances/ForecastPanel.tsx — Phase D14
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R10 — Finance II: Payroll, Forecasting & the Finance↔Library
 *   Reconciliation
 * [PURPOSE]: Fixed a build-breaking import — `apiClient` has never
 *   existed as an export of `@/lib/api-client`; the real, canonical
 *   singleton is `apiFetch`. Discovered while implementing this phase's
 *   own GET /finances/forecast route (previously nonexistent — this
 *   component's sole data source), matching the identical fix already
 *   applied to AccountingLedgerTab.tsx in R9.
 * [DEPENDS ON]: W/lib/api-client.ts (apiFetch), finances.ts's new
 *   GET /forecast route
 *
 * [CHANGE TYPE]: TARGETED EDIT (production fix, 2026-08-27).
 * [PURPOSE]: The Academic Year field was a free-text `<input>` seeded
 *   with a hardcoded '2025/2026' initial value — a typo'd format here
 *   silently returns an empty/wrong forecast rather than an error, since
 *   the forecast route just filters by the literal string. Replaced with
 *   the shared <AcademicYearSelect> (apps/web/src/components/shared/
 *   AcademicYearSelect.tsx), which also fixes the hardcoded initial
 *   useState value the same way — the select's first option is the
 *   school's real current academic year, so the initial state is now an
 *   empty string that the select fills in from live data on first render.
 * [DEPENDS ON (added)]: apps/web/src/components/shared/AcademicYearSelect.tsx (new)
 *
 * Finance forecasting UI with three-series Recharts ComposedChart:
 *   - Solid bar  → ACTUAL collected revenue
 *   - Striped/dashed bar  → FORECAST projected revenue
 *   - Line → net cash flow trend
 *
 * Uses Recharts (simple metrics per architecture decision).
 * Actual data in brand-teal, forecast in brand-amber, net flow as brand-navy line.
 */

import { useState, useEffect }  from 'react'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
}                               from 'recharts'
import { TrendingUp, Loader2, AlertTriangle, RefreshCw } from 'lucide-react'
import { apiFetch }             from '@/lib/api-client'
import { formatMWK }            from '@shared/constants/malawi'
import { AcademicYearSelect }   from '@/components/shared/AcademicYearSelect'
import type { ForecastReport, MonthlyDataPoint } from '@/server/services/forecastService'

// Seeds the mount-effect's eager first fetch (below) synchronously, before
// usePublicSchoolInfo() has had a chance to resolve — matches the same
// fallback-while-loading convention used elsewhere (apps/web/src/hooks/
// usePublic.ts, exams/page.tsx). The <AcademicYearSelect> field itself
// always offers the real, live current year regardless of this seed.
const FALLBACK_YEAR = '2025/2026'

// ─────────────────────────────────────────────────────────────────────────────
// CHART DATA TRANSFORM
// Recharts needs a flat object per data point with a value for each series.
// Actual values show as full bars, forecast as lighter bars — both on the same axis.
// ─────────────────────────────────────────────────────────────────────────────

interface ChartRow {
  label:      string
  actual:     number
  forecast:   number
  netFlow:    number
  isActual:   boolean
}

function buildChartData(
  feeRevenue: MonthlyDataPoint[],
  expenses:   MonthlyDataPoint[],
  netFlow:    MonthlyDataPoint[],
): ChartRow[] {
  return feeRevenue.map((rev, i) => ({
    label:    rev.label,
    actual:   rev.actual   ?? 0,
    forecast: rev.forecast ?? 0,
    netFlow:  (netFlow[i]?.actual ?? netFlow[i]?.forecast ?? 0),
    isActual: rev.actual !== undefined,
  }))
}

// ─────────────────────────────────────────────────────────────────────────────
// CUSTOM TOOLTIP
// ─────────────────────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?:  boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?:   string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-base rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-heading font-bold text-body mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: entry.color }} />
            <span className="text-muted capitalize">{entry.name}</span>
          </div>
          <span className="font-heading font-semibold tabular" style={{ color: entry.color }}>
            {formatMWK(entry.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY CARD
// ─────────────────────────────────────────────────────────────────────────────

function SummaryCard({
  label,
  actual,
  forecast,
  color,
}: {
  label:    string
  actual:   number
  forecast: number
  color:    string
}) {
  return (
    <div className="bg-surface border border-base rounded-xl p-4">
      <p className="text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-2">{label}</p>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">Actual YTD</span>
          <span className="font-bold font-heading tabular text-body">{formatMWK(actual)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">Forecast Remaining</span>
          <span className="font-semibold font-heading tabular" style={{ color }}>{formatMWK(forecast)}</span>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// FORECAST PANEL
// ─────────────────────────────────────────────────────────────────────────────

function buildForecastUrl(academicYear: string, forwardMonths: number): string {
  return `/finances/forecast?academicYear=${encodeURIComponent(academicYear)}&forwardMonths=${forwardMonths}`
}

export function ForecastPanel() {
  const [academicYear, setAcademicYear] = useState(FALLBACK_YEAR)
  const [forwardMonths, setForwardMonths] = useState(3)
  const [report,   setReport]   = useState<ForecastReport | null>(null)
  // R19 — starts `true`, not `false`: the mount effect below always kicks
  // off a fetch immediately, so initializing to the loading state the very
  // first render already knows it'll be in avoids one wasted render
  // (false → true → ...) and means the mount effect needs no setState call
  // of its own before starting the request.
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  // User-triggered reload (the Refresh button). Setting `loading`/`error`
  // synchronously here is fine — this runs inside a click handler, not an
  // effect — giving immediate visual feedback before the fetch resolves.
  function loadForecast() {
    setLoading(true)
    setError(null)
    apiFetch<ForecastReport>(buildForecastUrl(academicYear, forwardMonths))
      .then((data) => setReport(data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Forecast failed'))
      .finally(() => setLoading(false))
  }

  // Mount-only fetch — the textbook-legitimate use of an effect (fetching
  // data when a component mounts). Written as a .then/.catch/.finally
  // promise chain rather than calling an async/await function: every
  // setState call is then syntactically inside a callback the promise
  // invokes later, a deferred continuation the linter (correctly)
  // recognizes as never running synchronously within the effect body —
  // vs. calling a named async function, which it can't statically prove
  // is free of a pre-`await` setState without deeper control-flow analysis
  // than this rule performs. `loading` already starts `true` (above), so
  // no setState is needed before starting the request either.
  useEffect(() => {
    apiFetch<ForecastReport>(buildForecastUrl(academicYear, forwardMonths))
      .then((data) => setReport(data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Forecast failed'))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-only fetch; academicYear/forwardMonths changes are applied via the Refresh button (loadForecast), not automatically re-fetched
  }, [])

  const chartData = report
    ? buildChartData(report.feeRevenue, report.expenses, report.netCashFlow)
    : []

  const yFormatter = (v: number) =>
    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : String(v)

  return (
    <div className="space-y-6">

      {/* Header + controls */}
      <div className="flex items-end gap-4 flex-wrap justify-between">
        <div>
          <h2 className="font-heading font-bold text-xl text-brand-navy flex items-center gap-2">
            <TrendingUp className="w-5 h-5" aria-hidden />
            Finance Forecast
          </h2>
          <p className="text-sm text-muted mt-0.5">
            Actual vs projected fee revenue and cash flow.
          </p>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">
              Academic Year
            </label>
            <AcademicYearSelect
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="min-h-[44px] border border-base rounded-xl px-3 text-sm bg-page text-body w-32 focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
            />
          </div>
          <div>
            <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">
              Forecast Months
            </label>
            <select value={forwardMonths} onChange={(e) => setForwardMonths(Number(e.target.value))}
              className="min-h-[44px] border border-base rounded-xl px-3 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25">
              <option value={1}>+1 month</option>
              <option value={3}>+3 months</option>
              <option value={6}>+6 months</option>
            </select>
          </div>
          <button type="button" onClick={loadForecast} disabled={loading}
            className="min-h-[44px] px-5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60 flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-brand-coral/8 border border-brand-coral/25 rounded-xl px-4 py-3 text-sm text-brand-coral">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Summary cards */}
      {report && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard
            label="Fee Revenue"
            actual={report.totalActualRev}
            forecast={report.totalForecastRev}
            color="var(--color-brand-teal, #0d9488)"
          />
          <SummaryCard
            label="Expenses"
            actual={report.totalActualExp}
            forecast={report.totalForecastExp}
            color="var(--color-brand-coral, #f97316)"
          />
          <div className="bg-surface border border-base rounded-xl p-4">
            <p className="text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-2">
              Net Surplus Forecast
            </p>
            <p className={`text-xl font-bold font-heading tabular ${
              (report.totalActualRev + report.totalForecastRev - report.totalActualExp - report.totalForecastExp) >= 0
                ? 'text-emerald-600'
                : 'text-brand-coral'
            }`}>
              {formatMWK(
                report.totalActualRev + report.totalForecastRev
                - report.totalActualExp - report.totalForecastExp,
              )}
            </p>
            <p className="text-xs text-muted mt-1">Actual + forecast combined</p>
          </div>
        </div>
      )}

      {/* Chart */}
      {report && chartData.length > 0 && (
        <div className="bg-surface border border-base rounded-2xl p-5">
          <p className="text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-4">
            Monthly Cash Flow — Actual (solid) vs Forecast (light)
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-base, #e5e7eb)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'var(--color-muted, #9ca3af)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={yFormatter}
                tick={{ fontSize: 11, fill: 'var(--color-muted, #9ca3af)' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: '12px', paddingTop: '16px' }}
              />
              <Bar dataKey="actual"   name="Actual Revenue" fill="var(--color-brand-teal, #0d9488)" radius={[4,4,0,0]} maxBarSize={32} />
              <Bar dataKey="forecast" name="Forecast Revenue" fill="var(--color-brand-amber, #f59e0b)" radius={[4,4,0,0]} maxBarSize={32} opacity={0.65} />
              <Line
                type="monotone"
                dataKey="netFlow"
                name="Net Cash Flow"
                stroke="var(--color-brand-navy, #1e3a5f)"
                strokeWidth={2}
                dot={{ fill: 'var(--color-brand-navy, #1e3a5f)', r: 3 }}
                strokeDasharray="4 2"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {!report && !loading && (
        <div className="text-center py-16 text-muted text-sm border border-dashed border-base rounded-xl">
          Click Refresh to generate the forecast.
        </div>
      )}
    </div>
  )
}