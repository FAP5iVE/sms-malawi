'use client'

/**
 * apps/web/src/components/finances/payroll/PayrollInsightsTab.tsx
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: The Financial Insights & Trends tab (user-requested
 *   redesign), against the new GET /analytics/finance/payroll-breakdown
 *   (analyticsService.getFinancePayrollBreakdown — same redesign). Recharts
 *   used directly, matching this codebase's actual precedent
 *   (ForecastPanel.tsx) rather than a dynamic-import/ChartContainer
 *   wrapper this repo doesn't actually use anywhere for a payroll-scale
 *   dataset (at most a few dozen points — one per month).
 * [DEPENDS ON]: useAnalytics.ts's useFinancePayrollBreakdown (new, same
 *   redesign — see analyticsService.ts's header comment for the
 *   getFinancePayrollTrend status-filter bug this shares a fix with)
 */

import { useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { TrendingUp, Users2 } from 'lucide-react'
import { formatMWK } from '@shared/constants/malawi'
import { useFinancePayrollBreakdown } from '@/hooks/useAnalytics'
import { formatCompactMWK } from './payrollDisplay'

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-base rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-heading font-bold text-body mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: entry.color }} />
            <span className="text-muted">{entry.name}</span>
          </div>
          <span className="font-heading font-semibold tabular" style={{ color: entry.color }}>{formatMWK(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}

const MONTH_OPTIONS = [
  { label: '6 months', value: 6 },
  { label: '12 months', value: 12 },
  { label: '24 months', value: 24 },
]

export function PayrollInsightsTab() {
  const [months, setMonths] = useState(12)
  const { data: points = [], isLoading } = useFinancePayrollBreakdown(months)

  const latest = points[points.length - 1]
  const previous = points[points.length - 2]
  const momChange = latest && previous && previous.totalNet > 0
    ? ((latest.totalNet - previous.totalNet) / previous.totalNet) * 100
    : null

  const ytdGross = points.reduce((s, p) => s + p.totalGross, 0)
  const ytdPaye = points.reduce((s, p) => s + p.totalPaye, 0)
  const avgEffectiveRate = ytdGross > 0 ? (ytdPaye / ytdGross) * 100 : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-heading font-bold text-lg text-brand-navy flex items-center gap-2">
            <TrendingUp className="w-5 h-5" aria-hidden /> Financial Insights &amp; Trends
          </h2>
          <p className="text-sm text-muted mt-0.5">Payroll cost, tax, and pension trends over time.</p>
        </div>
        <select
          value={months}
          onChange={(e) => setMonths(Number(e.target.value))}
          className="min-h-[40px] px-3 rounded-xl text-sm border border-base bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
        >
          {MONTH_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-surface border border-base rounded-xl p-4">
          <p className="text-[11px] font-heading font-semibold text-muted uppercase tracking-wider mb-1">Total Payroll Cost</p>
          <p className="font-heading font-bold tabular text-body">{formatMWK(ytdGross)}</p>
          <p className="text-xs text-muted mt-0.5">Over {points.length} run{points.length === 1 ? '' : 's'}</p>
        </div>
        <div className="bg-surface border border-base rounded-xl p-4">
          <p className="text-[11px] font-heading font-semibold text-muted uppercase tracking-wider mb-1">Avg. Effective PAYE Rate</p>
          <p className="font-heading font-bold tabular text-body">{avgEffectiveRate.toFixed(1)}%</p>
          <p className="text-xs text-muted mt-0.5">Of gross payroll</p>
        </div>
        <div className="bg-surface border border-base rounded-xl p-4">
          <p className="text-[11px] font-heading font-semibold text-muted uppercase tracking-wider mb-1 flex items-center gap-1">
            <Users2 className="w-3 h-3" aria-hidden /> Latest Enrolled Staff
          </p>
          <p className="font-heading font-bold tabular text-body">{latest?.staffCount ?? '—'}</p>
          <p className="text-xs text-muted mt-0.5">{latest ? latest.label : 'No runs yet'}</p>
        </div>
        <div className="bg-surface border border-base rounded-xl p-4">
          <p className="text-[11px] font-heading font-semibold text-muted uppercase tracking-wider mb-1">Month-over-Month</p>
          <p className={`font-heading font-bold tabular ${momChange !== null && momChange >= 0 ? 'text-emerald-600' : 'text-brand-coral'}`}>
            {momChange !== null ? `${momChange >= 0 ? '+' : ''}${momChange.toFixed(1)}%` : '—'}
          </p>
          <p className="text-xs text-muted mt-0.5">Net payroll disbursed</p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-surface border border-base rounded-2xl p-5">
        <p className="text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-4">
          Gross Payroll, PAYE &amp; Pension, and Net Disbursed
        </p>
        {isLoading && <p className="text-sm text-muted py-16 text-center">Loading…</p>}
        {!isLoading && points.length === 0 && (
          <p className="text-sm text-muted py-16 text-center">No completed payroll runs in this window yet.</p>
        )}
        {!isLoading && points.length > 0 && (
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={points} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-base, #e5e7eb)" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-muted, #9ca3af)' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={formatCompactMWK} tick={{ fontSize: 11, fill: 'var(--color-muted, #9ca3af)' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '16px' }} />
              <Bar dataKey="totalGross" name="Gross Payroll" fill="var(--color-brand-teal, #0d9488)" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="totalPaye" name="PAYE Tax" fill="var(--color-brand-coral, #f97316)" radius={[4, 4, 0, 0]} maxBarSize={28} opacity={0.75} />
              <Bar dataKey="totalPension" name="Pension" fill="var(--color-brand-amber, #f59e0b)" radius={[4, 4, 0, 0]} maxBarSize={28} opacity={0.75} />
              <Line type="monotone" dataKey="totalNet" name="Net Disbursed" stroke="var(--color-brand-navy, #1e3a5f)" strokeWidth={2} dot={{ fill: 'var(--color-brand-navy, #1e3a5f)', r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
