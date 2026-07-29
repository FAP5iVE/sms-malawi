'use client'

/**
 * [CHANGE TYPE]: MAJOR REWRITE (production fix, 2026-07-28)
 * [PURPOSE]: Was export-only (.xlsx download, no way to look at the data
 *   without opening a spreadsheet). Added a "View" button per report that
 *   expands an in-system table using the new GET /finances/reports/data
 *   endpoint (same underlying queries as the Excel export, just JSON).
 */

import { useState } from 'react'
import { getAuth } from 'firebase/auth'
import { Download, Loader2, Eye, EyeOff } from 'lucide-react'
import { buildApiUrl, apiFetch } from '@/lib/api-client'
import { formatMWK } from '@shared/constants/malawi'

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

type ReportRow = Record<string, string | number | null>

function ReportTable({ rows }: { rows: ReportRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted py-6 text-center">No data for this period.</p>
  }
  const columns = Object.keys(rows[0]!)
  const isMoney = (col: string) => /amount|balance|total|paid|gross|net/i.test(col)
  const isDate = (col: string) => /date/i.test(col)

  return (
    <div className="overflow-x-auto -mx-3">
      <table className="w-full text-xs min-w-[500px]">
        <thead>
          <tr className="border-b border-base">
            {columns.map((c) => (
              <th key={c} className="text-left px-3 py-2 font-heading font-semibold text-muted uppercase tracking-wide">
                {c.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-base last:border-0 hover:bg-page">
              {columns.map((c) => {
                const val = row[c]
                return (
                  <td key={c} className="px-3 py-2 text-body">
                    {val == null
                      ? '—'
                      : isMoney(c) && typeof val === 'number'
                        ? formatMWK(val)
                        : isDate(c)
                          ? new Date(val).toLocaleDateString('en-MW')
                          : String(val)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ReportsExportPanel({ academicYear, term }: { academicYear: string; term: number }) {
  const [exporting, setExporting] = useState<string | null>(null)
  const [viewingType, setViewingType] = useState<string | null>(null)
  const [rows, setRows] = useState<ReportRow[]>([])
  const [viewLoading, setViewLoading] = useState(false)

  async function exportReport(type: string) {
    setExporting(type)
    try {
      const token = await getAuth().currentUser?.getIdToken()
      const res = await fetch(buildApiUrl('/finances/reports/export'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ type, academicYear, term }),
      })
      if (!res.ok) throw new Error(`Export failed: ${res.status}`)
      const { downloadUrl } = (await res.json()) as { downloadUrl: string }
      window.open(downloadUrl, '_blank', 'noopener,noreferrer')
    } catch (err) {
      console.error('Export error:', err)
      alert('Export failed. Please try again.')
    } finally {
      setExporting(null)
    }
  }

  async function toggleView(type: string) {
    if (viewingType === type) {
      setViewingType(null)
      return
    }
    setViewingType(type)
    setViewLoading(true)
    try {
      const data = await apiFetch<ReportRow[]>(
        `/finances/reports/data?type=${type}&academicYear=${academicYear}&term=${term}`,
      )
      setRows(data)
    } catch (err) {
      console.error('View report error:', err)
      setRows([])
    } finally {
      setViewLoading(false)
    }
  }

  return (
    <div className="bg-surface border border-base rounded-xl p-5">
      <p className="font-heading font-semibold text-sm text-brand-navy mb-4">
        Reports
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {REPORTS.map((r) => (
          <div key={r.type} className="border border-base rounded-xl overflow-hidden">
            <div className="flex items-start gap-3 p-3">
              <div className="w-8 h-8 rounded-lg bg-brand-navy/8 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Download className="w-4 h-4 text-brand-navy" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-heading font-semibold text-sm text-brand-navy">{r.label}</p>
                <p className="text-xs text-muted mt-0.5">{r.desc}</p>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => void toggleView(r.type)}
                    aria-label={`View ${r.label} report`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-teal hover:underline"
                  >
                    {viewingType === r.type ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {viewingType === r.type ? 'Hide' : 'View'}
                  </button>
                  <span className="text-muted">·</span>
                  <button
                    type="button"
                    onClick={() => void exportReport(r.type)}
                    disabled={exporting === r.type}
                    aria-label={`Export ${r.label} report`}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-navy hover:underline disabled:opacity-50"
                  >
                    {exporting === r.type ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    Export .xlsx
                  </button>
                </div>
              </div>
            </div>
            {viewingType === r.type && (
              <div className="border-t border-base p-3 bg-page">
                {viewLoading ? (
                  <div className="h-24 rounded-lg bg-surface animate-pulse" />
                ) : (
                  <ReportTable rows={rows} />
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}