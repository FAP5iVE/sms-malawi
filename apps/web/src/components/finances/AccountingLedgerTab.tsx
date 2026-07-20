'use client'

/**
 * apps/web/src/components/finances/AccountingLedgerTab.tsx — Phase D6
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R9 — Finance I: Invoicing, Fees & the Accounting Ledger
 *   Reconnection
 * [PURPOSE]: Fixed a build-breaking import — `apiClient` has never existed
 *   as an export of `@/lib/api-client`; the real, canonical singleton is
 *   `apiFetch` (sms-erp-backend Rule 2). Discovered while implementing
 *   this phase's own headline acceptance criterion (a recorded payment
 *   must produce a posting visible here, in the same request cycle) —
 *   this component could not compile, let alone display anything, before
 *   this fix. The three routes it calls (`/finances/accounting/
 *   income-statement`, `/trial-balance`, `/ledger/:code`) are added to
 *   finances.ts in this same phase; the ledger-computation logic itself
 *   (accountingService.ts) was already correct and is unchanged.
 * [DEPENDS ON]: W/lib/api-client.ts (apiFetch), finances.ts's new
 *   /accounting/* routes
 *
 * Double-entry accounting UI rendered inside the Finances page.
 *
 * Sub-tabs:
 *   Income Statement  — revenue vs expenses for a selected period
 *   Trial Balance     — all accounts with debit/credit totals
 *   Account Ledger    — drill-down into a single account's transactions
 */

import { useState, useEffect }         from 'react'
import { TrendingUp, TrendingDown, Scale, BookOpen } from 'lucide-react'
import { ModuleTabs }                  from '@/components/shared/ModuleTabs'
import { apiFetch }                    from '@/lib/api-client'
import { formatMWK }                   from '@shared/constants/malawi'
import type {
  IncomeStatement,
  TrialBalanceLine,
  LedgerLine,
}                                      from '@/server/services/accountingService'

type SubTab = 'income' | 'trial' | 'ledger'

const TABS = [
  { id: 'income' as SubTab, label: 'Income Statement', icon: TrendingUp   },
  { id: 'trial'  as SubTab, label: 'Trial Balance',    icon: Scale        },
  { id: 'ledger' as SubTab, label: 'Account Ledger',   icon: BookOpen     },
]

// ─────────────────────────────────────────────────────────────────────────────
// INCOME STATEMENT PANEL
// ─────────────────────────────────────────────────────────────────────────────

function IncomeStatementPanel() {
  const [from,   setFrom]   = useState(() => `${new Date().getFullYear()}-01-01`)
  const [to,     setTo]     = useState(() => new Date().toISOString().slice(0, 10))
  const [data,   setData]   = useState<IncomeStatement | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const result = await apiFetch<IncomeStatement>(
        `/finances/accounting/income-statement?from=${from}&to=${to}`,
      )
      setData(result)
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="min-h-11 border border-base rounded-xl px-3 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25" />
        </div>
        <div>
          <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="min-h-11 border border-base rounded-xl px-3 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25" />
        </div>
        <button type="button" onClick={load} disabled={loading}
          className="min-h-11 px-5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60">
          {loading ? 'Loading…' : 'Generate'}
        </button>
      </div>

      {data && (
        <div className="space-y-4">
          {/* Net surplus card */}
          <div className={`rounded-2xl p-6 border ${data.netSurplus >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-brand-coral/8 border-brand-coral/25'}`}>
            <p className="text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1">Net Surplus / (Deficit)</p>
            <p className={`text-3xl font-bold font-heading tabular ${data.netSurplus >= 0 ? 'text-emerald-700' : 'text-brand-coral'}`}>
              {formatMWK(data.netSurplus)}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            {/* Revenue */}
            <div className="border border-base rounded-xl overflow-hidden">
              <div className="bg-emerald-50 border-b border-emerald-100 px-4 py-3 flex items-center justify-between">
                <span className="font-heading font-semibold text-sm text-emerald-700 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> Revenue
                </span>
                <span className="font-bold font-heading text-emerald-700 tabular">{formatMWK(data.totalRevenue)}</span>
              </div>
              <div className="divide-y divide-base">
                {data.revenueLines.map((l) => (
                  <div key={l.code} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="text-muted">{l.code} — {l.account}</span>
                    <span className="font-medium tabular text-body">{formatMWK(l.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Expenses */}
            <div className="border border-base rounded-xl overflow-hidden">
              <div className="bg-brand-coral/8 border-b border-brand-coral/20 px-4 py-3 flex items-center justify-between">
                <span className="font-heading font-semibold text-sm text-brand-coral flex items-center gap-2">
                  <TrendingDown className="w-4 h-4" /> Expenses
                </span>
                <span className="font-bold font-heading text-brand-coral tabular">{formatMWK(data.totalExpenses)}</span>
              </div>
              <div className="divide-y divide-base">
                {data.expenseLines.map((l) => (
                  <div key={l.code} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="text-muted">{l.code} — {l.account}</span>
                    <span className="font-medium tabular text-body">{formatMWK(l.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TRIAL BALANCE PANEL
// ─────────────────────────────────────────────────────────────────────────────

function TrialBalancePanel() {
  const [rows, setRows]     = useState<TrialBalanceLine[]>([])
  // R19 — starts `true`, not `false`: the mount effect below always fetches
  // immediately, so initializing to the loading state the very first render
  // already knows it'll be in means the effect needs no setState of its own
  // before starting the request (the `.then`/`.finally` continuations below
  // are already correctly deferred, not flagged).
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch<TrialBalanceLine[]>('/finances/accounting/trial-balance')
      .then(setRows)
      .finally(() => setLoading(false))
  }, [])

  const totalDebit  = rows.reduce((s, r) => s + r.debit,  0)
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0)

  if (loading) return <div className="text-center py-12 text-muted text-sm">Loading trial balance…</div>

  return (
    <div className="border border-base rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-page border-b border-base">
              {['Code', 'Account Name', 'Type', 'Debit (MWK)', 'Credit (MWK)'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-base">
            {rows.map((r) => (
              <tr key={r.code} className="hover:bg-page transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-muted">{r.code}</td>
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3 text-xs text-muted">{r.type}</td>
                <td className="px-4 py-3 text-right tabular">{r.debit > 0 ? formatMWK(r.debit) : '—'}</td>
                <td className="px-4 py-3 text-right tabular">{r.credit > 0 ? formatMWK(r.credit) : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-page border-t-2 border-base font-bold">
              <td colSpan={3} className="px-4 py-3 text-xs uppercase tracking-wider text-muted">Totals</td>
              <td className="px-4 py-3 text-right tabular text-brand-navy">{formatMWK(totalDebit)}</td>
              <td className="px-4 py-3 text-right tabular text-brand-navy">{formatMWK(totalCredit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT LEDGER PANEL
// ─────────────────────────────────────────────────────────────────────────────

function AccountLedgerPanel() {
  const [code,  setCode]  = useState('1000')
  const [from,  setFrom]  = useState(() => `${new Date().getFullYear()}-01-01`)
  const [to,    setTo]    = useState(() => new Date().toISOString().slice(0, 10))
  const [lines, setLines] = useState<LedgerLine[]>([])
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const data = await apiFetch<LedgerLine[]>(
        `/finances/accounting/ledger/${code}?from=${from}&to=${to}`,
      )
      setLines(data)
    } finally { setLoading(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">Account Code</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 1000"
            className="min-h-11 border border-base rounded-xl px-3 text-sm bg-page text-body w-28 focus:outline-none focus:ring-2 focus:ring-brand-teal/25" />
        </div>
        <div>
          <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="min-h-11 border border-base rounded-xl px-3 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25" />
        </div>
        <div>
          <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="min-h-11 border border-base rounded-xl px-3 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25" />
        </div>
        <button type="button" onClick={load} disabled={loading}
          className="min-h-11 px-5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60">
          {loading ? 'Loading…' : 'Load Ledger'}
        </button>
      </div>

      {lines.length > 0 && (
        <div className="border border-base rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-page border-b border-base">
                  {['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Balance'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-heading font-semibold text-muted uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-base">
                {lines.map((l, i) => (
                  <tr key={i} className="hover:bg-page transition-colors">
                    <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                      {new Date(l.date).toLocaleDateString('en-GB')}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{l.reference}</td>
                    <td className="px-4 py-3 text-muted max-w-50 truncate">{l.description}</td>
                    <td className="px-4 py-3 text-right tabular text-emerald-700">
                      {l.debit > 0 ? formatMWK(l.debit) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular text-brand-coral">
                      {l.credit > 0 ? formatMWK(l.credit) : '—'}
                    </td>
                    <td className={`px-4 py-3 text-right tabular font-semibold ${l.balance >= 0 ? 'text-body' : 'text-brand-coral'}`}>
                      {formatMWK(Math.abs(l.balance))}{l.balance < 0 ? ' (Cr)' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {lines.length === 0 && !loading && (
        <div className="text-center py-12 text-muted text-sm border border-dashed border-base rounded-xl">
          Enter an account code and date range, then click Load Ledger.
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNTING LEDGER TAB (root export)
// ─────────────────────────────────────────────────────────────────────────────

export function AccountingLedgerTab() {
  const [subTab, setSubTab] = useState<SubTab>('income')

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-bold text-xl text-brand-navy flex items-center gap-2">
          <Scale className="w-5 h-5" aria-hidden />
          Accounting Ledger
        </h2>
        <p className="text-sm text-muted mt-0.5">
          Double-entry bookkeeping — income statement, trial balance, and account ledger.
        </p>
      </div>

      <ModuleTabs<SubTab>
        tabs={TABS}
        active={subTab}
        onChange={setSubTab}
        variant="underline"
        id="accounting-tabs"
      />

      {subTab === 'income' && <IncomeStatementPanel />}
      {subTab === 'trial'  && <TrialBalancePanel  />}
      {subTab === 'ledger' && <AccountLedgerPanel  />}
    </div>
  )
}