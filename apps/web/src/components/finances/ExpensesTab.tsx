'use client'

import { useExpenses } from '@/hooks/useFinances'
import { formatMWK } from '@shared/constants/malawi'
import { format } from 'date-fns'

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-brand-amber/10 text-brand-amber border-brand-amber/30',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-brand-coral/10 text-brand-coral border-brand-coral/30',
}

export function ExpensesTab({ academicYear, term }: { academicYear: string; term: number }) {
  const { data: expenses = [], isLoading } = useExpenses({ academicYear, term })

  return (
    <div className="bg-surface border border-base rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-base bg-page">
            <th className="text-left px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
              Category
            </th>
            <th className="text-left px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
              Description
            </th>
            <th className="text-right px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
              Amount
            </th>
            <th className="text-left px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
              Date
            </th>
            <th className="text-left px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className="border-b border-base">
                {Array.from({ length: 5 }).map((__, j) => (
                  <td key={j} className="px-4 py-3">
                    <div className="skeleton h-4 rounded w-3/4" />
                  </td>
                ))}
              </tr>
            ))
          ) : expenses.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
                No expenses recorded
              </td>
            </tr>
          ) : (
            expenses.map((e) => (
              <tr key={e.id} className="border-b border-base hover:bg-page">
                <td className="px-4 py-3">
                  <span className="text-xs bg-brand-navy/8 text-brand-navy px-2 py-0.5 rounded-full font-medium">
                    {e.category}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">{e.description}</td>
                <td className="px-4 py-3 text-right tabular font-semibold">
                  {formatMWK(e.amount)}
                </td>
                <td className="px-4 py-3 text-muted text-xs">
                  {format(new Date(e.incurredAt), 'dd MMM yyyy')}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLORS[e.status] ?? ''}`}
                  >
                    {e.status}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
