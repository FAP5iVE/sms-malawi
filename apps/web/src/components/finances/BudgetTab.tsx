'use client'

import { useState } from 'react'
import { useBudgetVsActual, useCreateBudget } from '@/hooks/useFinances'
import { useDepartmentTitles } from '@/hooks/useSettings'
import { formatMWK } from '@shared/constants/malawi'
import { MOBILE_BREAKPOINT } from '@shared/constants/breakpoints'
import { Plus, Loader2 } from 'lucide-react'
import dynamic from 'next/dynamic'

// ApexCharts must be dynamically imported — it's not SSR-compatible
const Chart = dynamic(() => import('react-apexcharts'), { ssr: false })

const EXPENSE_CATEGORIES = ['SALARIES', 'UTILITIES', 'MAINTENANCE', 'PROCUREMENT', 'LIBRARY', 'TRANSPORT', 'MISCELLANEOUS']

export function BudgetTab({ academicYear }: { academicYear: string }) {
  const { data: budget = [], isLoading } = useBudgetVsActual(academicYear)
  const createBudget = useCreateBudget()
  // [PRODUCTION FIX 2026-07-28] Budget.department was free-text with no
  // create UI at all (confirmed: CreateBudgetSchema/createBudget had zero
  // callers). Now that a create form exists, department is a real select
  // sourced from the same admin-editable taxonomy HR staff creation uses
  // (useDepartmentTitles) — not another free-text field that could drift
  // from what departments actually exist.
  const { data: departmentTitles = {} } = useDepartmentTitles()
  const departments = Object.keys(departmentTitles).sort()

  const [showForm, setShowForm] = useState(false)
  const [term, setTerm] = useState('')
  const [department, setDepartment] = useState('')
  const [category, setCategory] = useState('')
  const [allocatedAmount, setAllocatedAmount] = useState('')
  const [description, setDescription] = useState('')

  function submitBudget() {
    if (!department || !category || !allocatedAmount || Number(allocatedAmount) <= 0) return
    createBudget.mutate(
      {
        academicYear,
        term: term ? Number(term) : undefined,
        department,
        category: category as never,
        allocated: Number(allocatedAmount),
        description: description.trim() || undefined,
      },
      {
        onSuccess: () => {
          setShowForm(false)
          setTerm(''); setDepartment(''); setCategory(''); setAllocatedAmount(''); setDescription('')
        },
      },
    )
  }

  const categories = budget.map((b) => b.category)
  const allocated = budget.map((b) => b.allocated)
  const spent = budget.map((b) => b.spent)

  const chartOptions = {
    chart: { type: 'bar' as const, toolbar: { show: false }, height: 300 },
    plotOptions: { bar: { horizontal: false, columnWidth: '55%' } },
    xaxis: {
      categories,
      labels: {
        rotate: -45,
        trim: true,
        hideOverlappingLabels: true,
        style: { fontSize: '11px' },
      },
    },
    yaxis: {
      labels: {
        formatter: (v: number) => `MWK ${(v / 1_000_000).toFixed(1)}M`,
      },
    },
    colors: ['#0F2744', '#0E8A6A'],
    legend: { position: 'top' as const },
    // Per-bar numeric labels are dropped in favor of the tooltip below and
    // the y-axis scale — exact figures are one tap away, and the chart
    // reads as a clean shape instead of a wall of small numbers on every
    // bar. This also removes the white-on-white illegible labels that
    // appeared whenever a bar was too short for its label to fit inside it.
    dataLabels: { enabled: false },
    tooltip: {
      y: { formatter: (v: number) => formatMWK(v) },
    },
    responsive: [
      {
        breakpoint: MOBILE_BREAKPOINT,
        options: {
          chart: { height: 260 },
          xaxis: { labels: { style: { fontSize: '9px' }, rotate: -60 } },
          legend: { position: 'bottom' as const, fontSize: '11px' },
        },
      },
    ],
  }

  const series = [
    { name: 'Allocated', data: allocated },
    { name: 'Spent', data: spent },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-heading font-semibold text-body">Budget vs Actual — {academicYear}</h2>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 bg-brand-teal text-white rounded-lg px-3.5 py-2 text-sm font-semibold hover:bg-brand-teal-light min-h-11"
        >
          <Plus className="w-4 h-4" /> {showForm ? 'Cancel' : 'Create Budget'}
        </button>
      </div>

      {showForm && (
        <div className="bg-surface border border-base rounded-xl p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="budget-department" className="text-xs text-muted mb-1 block">Department</label>
              <select
                id="budget-department"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
              >
                <option value="" disabled>Select department…</option>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              {departments.length === 0 && (
                <p className="text-xs text-muted mt-1">
                  No departments defined yet — set them up under Settings → Departments &amp; Titles.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="budget-category" className="text-xs text-muted mb-1 block">Expense category</label>
              <select
                id="budget-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
              >
                <option value="" disabled>Select category…</option>
                {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="budget-allocated" className="text-xs text-muted mb-1 block">Allocated amount (MWK)</label>
              <input
                id="budget-allocated"
                type="number"
                min="1"
                value={allocatedAmount}
                onChange={(e) => setAllocatedAmount(e.target.value)}
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
              />
            </div>
            <div>
              <label htmlFor="budget-term" className="text-xs text-muted mb-1 block">Term <span className="text-muted/70">(optional — leave blank for the full year)</span></label>
              <select
                id="budget-term"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
              >
                <option value="">Full year</option>
                <option value="1">Term 1</option>
                <option value="2">Term 2</option>
                <option value="3">Term 3</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="budget-description" className="text-xs text-muted mb-1 block">Description <span className="text-muted/70">(optional)</span></label>
            <textarea
              id="budget-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page"
            />
          </div>
          <button
            type="button"
            onClick={submitBudget}
            disabled={createBudget.isPending || !department || !category || !allocatedAmount}
            className="inline-flex items-center gap-2 bg-brand-navy text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 min-h-11"
          >
            {createBudget.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {createBudget.isPending ? 'Creating…' : 'Save Budget'}
          </button>
          {createBudget.isError && (
            <p className="text-sm text-brand-coral">
              {createBudget.error instanceof Error ? createBudget.error.message : 'Failed to create budget.'}
            </p>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="skeleton h-64 rounded-xl" />
      ) : budget.length === 0 ? (
        <div className="bg-surface border border-base rounded-xl p-12 text-center text-muted text-sm">
          No budget data for {academicYear}
        </div>
      ) : (
        <>
          {/* Chart */}
          <div className="bg-surface border border-base rounded-xl p-5">
            <p className="font-heading font-semibold text-sm text-brand-navy mb-4">
              Budget vs Actual Spending
            </p>
            <Chart type="bar" options={chartOptions} series={series} />
          </div>

          {/* Table */}
          <div className="bg-surface border border-base rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base bg-page">
                  <th className="text-left px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                    Category
                  </th>
                  <th className="text-right px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                    Allocated
                  </th>
                  <th className="text-right px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                    Spent
                  </th>
                  <th className="text-right px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                    Remaining
                  </th>
                  <th className="text-left px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                    %
                  </th>
                </tr>
              </thead>
              <tbody>
                {budget.map((b) => {
                  const pct = b.allocated > 0 ? Math.round((b.spent / b.allocated) * 100) : 0
                  return (
                    <tr key={b.category} className="border-b border-base hover:bg-page">
                      <td className="px-4 py-3 font-medium">{b.category}</td>
                      <td className="px-4 py-3 text-right tabular">{formatMWK(b.allocated)}</td>
                      <td className="px-4 py-3 text-right tabular">{formatMWK(b.spent)}</td>
                      <td
                        className={`px-4 py-3 text-right tabular font-semibold ${b.remaining < 0 ? 'text-brand-coral' : 'text-emerald-600'}`}
                      >
                        {formatMWK(b.remaining)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${pct > 100 ? 'bg-brand-coral' : 'bg-brand-teal'}`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted tabular">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}