'use client'

import { useQuery, useMutation } from '@tanstack/react-query'
import { getAuth } from 'firebase/auth'
import { formatMWK } from '@shared/constants/malawi'
import type { ApiPayrollRun } from '@shared/types/api'
import { Loader2 } from 'lucide-react'

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = await getAuth().currentUser?.getIdToken()
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export function PayrollTab() {
  const year = new Date().getFullYear()
  const {
    data: runs = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['payroll', year],
    queryFn: () => apiFetch<ApiPayrollRun[]>(`/payroll?year=${year}`),
  })

  const { mutate: triggerPayroll, isPending } = useMutation({
    mutationFn: ({ month, year }: { month: number; year: number }) =>
      apiFetch<{ runId: string }>('/payroll/run', {
        method: 'POST',
        body: JSON.stringify({ month, year }),
      }),
    onSuccess: () => {
      void refetch()
    },
  })

  const currentMonth = new Date().getMonth() + 1

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-heading font-semibold text-sm text-brand-navy">
          Payroll History {year}
        </h3>
        <button
          onClick={() => triggerPayroll({ month: currentMonth, year })}
          disabled={isPending}
          className="flex items-center gap-2 bg-brand-navy text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-brand-navy-mid disabled:opacity-60"
          type="button"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Run {new Date(year, currentMonth - 1).toLocaleString('en', { month: 'long' })} Payroll
        </button>
      </div>

      <div className="bg-surface border border-base rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-base bg-page">
              <th className="text-left px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                Period
              </th>
              <th className="text-right px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                Gross
              </th>
              <th className="text-right px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                Net
              </th>
              <th className="text-left px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center">
                  <div className="skeleton h-4 w-48 mx-auto rounded" />
                </td>
              </tr>
            ) : runs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted">
                  No payroll runs yet this year
                </td>
              </tr>
            ) : (
              runs.map((run) => {
                const monthName = new Date(run.year, run.month - 1).toLocaleString('en', {
                  month: 'long',
                })
                return (
                  <tr key={run.id} className="border-b border-base hover:bg-page">
                    <td className="px-4 py-3 font-medium">
                      {monthName} {run.year}
                    </td>
                    <td className="px-4 py-3 text-right tabular">{formatMWK(run.totalGross)}</td>
                    <td className="px-4 py-3 text-right tabular font-semibold text-emerald-600">
                      {formatMWK(run.totalNet)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${run.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-brand-amber/10 text-brand-amber border-brand-amber/30'}`}
                      >
                        {run.status}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
