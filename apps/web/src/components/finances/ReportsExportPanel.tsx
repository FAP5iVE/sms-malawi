'use client'

import { useState } from 'react'
import { getAuth } from 'firebase/auth'
import { Download, Loader2 } from 'lucide-react'

interface ReportDef {
  type: string
  label: string
  desc: string
}

const REPORTS: ReportDef[] = [
  {
    type: 'fee_collection',
    label: 'Fee Collection',
    desc: 'All invoices with paid/balance breakdown',
  },
  {
    type: 'outstanding_balances',
    label: 'Outstanding Balances',
    desc: 'Students with unpaid or overdue fees',
  },
  { type: 'expense_breakdown', label: 'Expense Breakdown', desc: 'All expenses by category' },
  { type: 'payroll_summary', label: 'Payroll Summary', desc: 'Monthly payroll runs for the year' },
]

export function ReportsExportPanel({ academicYear, term }: { academicYear: string; term: number }) {
  const [loading, setLoading] = useState<string | null>(null)

  async function exportReport(type: string) {
    setLoading(type)
    try {
      const token = await getAuth().currentUser?.getIdToken()
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/finances/reports/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ type, academicYear, term }),
      })
      if (!res.ok) throw new Error(`Export failed: ${res.status}`)
      const { downloadUrl } = (await res.json()) as { downloadUrl: string }

      // Open signed URL in new tab — browser will download the .xlsx
      window.open(downloadUrl, '_blank', 'noopener,noreferrer')
    } catch (err) {
      console.error('Export error:', err)
      alert('Export failed. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="bg-surface border border-base rounded-xl p-5">
      <p className="font-heading font-semibold text-sm text-brand-navy mb-4">
        Export Reports (.xlsx)
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {REPORTS.map((r) => (
          <button
            key={r.type}
            onClick={() => void exportReport(r.type)}
            disabled={loading === r.type}
            aria-label={`Export ${r.label} report`}
            className="flex items-start gap-3 p-3 border border-base rounded-xl hover:border-brand-navy hover:bg-page transition-all text-left disabled:opacity-50"
            type="button"
          >
            <div className="w-8 h-8 rounded-lg bg-brand-navy/8 flex items-center justify-center flex-shrink-0 mt-0.5">
              {loading === r.type ? (
                <Loader2 className="w-4 h-4 text-brand-navy animate-spin" />
              ) : (
                <Download className="w-4 h-4 text-brand-navy" />
              )}
            </div>
            <div>
              <p className="font-heading font-semibold text-sm text-brand-navy">{r.label}</p>
              <p className="text-xs text-muted mt-0.5">{r.desc}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
