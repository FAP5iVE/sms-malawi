'use client'

/**
 * apps/web/src/components/finances/payroll/PayrollSettingsTab.tsx
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: The PAYE & Pension Settings tab (user-requested redesign) —
 *   a payroll-scoped subset of Settings > Finance
 *   (components/settings/FinanceSettings.tsx), against the exact same
 *   GET/PATCH /settings/finance route. PATCH there already accepts a
 *   partial payload (settings.ts's finance route only writes the keys it's
 *   given), so this tab can safely round-trip only
 *   payroll_day_of_month/payroll_run_window_days/payeBrackets/
 *   pensionPercent/loanInterestRate without touching fee/invoice/receipt
 *   settings — those keep working exactly as FinanceSettings.tsx left
 *   them, edited from either screen with no risk of one clobbering the
 *   other's fields. Kept as a second, independent component (not a shared
 *   extraction) rather than importing/wrapping FinanceSettings.tsx itself,
 *   since that component's full fee/invoice/currency sections don't belong
 *   inside the Payroll workspace and gating them per-field would have made
 *   that file harder to read for its own, unrelated audience (Settings
 *   page visitors who aren't in Payroll at all).
 * [DEPENDS ON]: server/routes/settings.ts's /finance route (FINANCE_KEYS,
 *   same redesign added payroll_run_window_days to), S/types/settings.ts
 *   (PayeBracket)
 */

import { useEffect, useState } from 'react'
import { Loader2, Save, Plus, X, Settings as SettingsIcon } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import type { PayeBracket } from '@shared/types/settings'

const inputCls = 'w-full min-h-[44px] border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25'

interface PayrollScalarConfig {
  payroll_day_of_month: string
  payroll_run_window_days: string
}

export function PayrollSettingsTab() {
  const [config, setConfig] = useState<PayrollScalarConfig>({
    payroll_day_of_month: '25',
    payroll_run_window_days: '5',
  })
  const [payeBrackets, setPayeBrackets] = useState<PayeBracket[]>([])
  const [pensionPercent, setPensionPercent] = useState(5)
  const [loanInterestRate, setLoanInterestRate] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiFetch<Partial<PayrollScalarConfig> & { payeBrackets?: PayeBracket[]; pensionPercent?: number; loanInterestRate?: number }>('/settings/finance')
      .then((d) => {
        setConfig((p) => ({ ...p, ...d }))
        if (d.payeBrackets) setPayeBrackets(d.payeBrackets)
        if (d.pensionPercent !== undefined) setPensionPercent(d.pensionPercent)
        if (d.loanInterestRate !== undefined) setLoanInterestRate(d.loanInterestRate)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  function set(k: keyof PayrollScalarConfig, v: string) {
    setConfig((p) => ({ ...p, [k]: v }))
  }
  function addBracket() {
    setPayeBrackets((prev) => [...prev, { minAnnualMwk: 0, maxAnnualMwk: null, ratePercent: 0, label: '' }])
  }
  function updateBracket(i: number, patch: Partial<PayeBracket>) {
    setPayeBrackets((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)))
  }
  function removeBracket(i: number) {
    setPayeBrackets((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null); setSaved(false)
    try {
      // Partial PATCH — only the payroll-relevant subset. Fee/invoice/
      // receipt/currency settings (edited from Settings > Finance) are
      // untouched by this request.
      await apiFetch('/settings/finance', {
        method: 'PATCH',
        body: JSON.stringify({ ...config, payeBrackets, pensionPercent, loanInterestRate }),
      })
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally { setSaving(false) }
  }

  if (loading) return <div className="flex items-center gap-2 text-muted text-sm py-8"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-bold text-lg text-brand-navy flex items-center gap-2">
          <SettingsIcon className="w-5 h-5" aria-hidden /> PAYE &amp; Pension Settings
        </h2>
        <p className="text-sm text-muted mt-0.5">
          Controls the run window Payroll Runs &amp; Approvals enforces, and the tax/pension figures every payslip is calculated from.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Run window */}
        <div className="pb-5 border-b border-base">
          <h3 className="font-heading font-semibold text-sm text-body mb-1">Payroll Run Window</h3>
          <p className="text-xs text-muted mb-4 max-w-2xl">
            Run Payroll is only enabled inside this window each month. Once a month is run it is permanently
            locked — nothing here can reopen it, by design.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-xl">
            <div>
              <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">Window Opens On (day 1–28)</label>
              <input type="number" min={1} max={28} value={config.payroll_day_of_month} onChange={(e) => set('payroll_day_of_month', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">Window Length (days)</label>
              <input type="number" min={1} max={31} value={config.payroll_run_window_days} onChange={(e) => set('payroll_run_window_days', e.target.value)} className={inputCls} />
              <p className="text-xs text-muted mt-1">e.g. 25 + 5 = open through the 29th.</p>
            </div>
          </div>
        </div>

        {/* Pension & loan interest */}
        <div className="pb-5 border-b border-base">
          <h3 className="font-heading font-semibold text-sm text-body mb-4">Pension &amp; Loans</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-xl">
            <div>
              <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">Pension Contribution (%)</label>
              <input type="number" min={0} max={100} value={pensionPercent} onChange={(e) => setPensionPercent(Number(e.target.value))} className={inputCls} />
              <p className="text-xs text-muted mt-1">Employee pension as % of gross salary.</p>
            </div>
            <div>
              <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">Staff Loan Interest Rate (%)</label>
              <input type="number" min={0} max={100} value={loanInterestRate} onChange={(e) => setLoanInterestRate(Number(e.target.value))} className={inputCls} />
              <p className="text-xs text-muted mt-1">Annual rate applied to new loans. 0 = interest-free.</p>
            </div>
          </div>
        </div>

        {/* PAYE brackets */}
        <div className="pb-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading font-semibold text-sm text-body">PAYE Income Tax Brackets</h3>
            <button type="button" onClick={addBracket}
              className="inline-flex items-center gap-1.5 border border-base rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-page">
              <Plus className="w-3.5 h-3.5" /> Add bracket
            </button>
          </div>
          <p className="text-xs text-muted mb-3">Annual income ranges (MWK) and their tax rate. Verify with MRA annually.</p>
          {payeBrackets.length === 0 ? (
            <p className="text-sm text-muted">No brackets defined.</p>
          ) : (
            <div className="space-y-2">
              {payeBrackets.map((b, i) => (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end border border-base rounded-lg p-3">
                  <div>
                    <label className="text-[11px] text-muted mb-1 block">Label</label>
                    <input value={b.label} onChange={(e) => updateBracket(i, { label: e.target.value })} className={`${inputCls} min-h-[36px] text-xs`} />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted mb-1 block">Min (MWK/yr)</label>
                    <input type="number" min={0} value={b.minAnnualMwk} onChange={(e) => updateBracket(i, { minAnnualMwk: Number(e.target.value) })} className={`${inputCls} min-h-[36px] text-xs`} />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted mb-1 block">Max (MWK/yr, blank = no ceiling)</label>
                    <input type="number" min={0} value={b.maxAnnualMwk ?? ''}
                      onChange={(e) => updateBracket(i, { maxAnnualMwk: e.target.value ? Number(e.target.value) : null })}
                      className={`${inputCls} min-h-[36px] text-xs`} />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted mb-1 block">Rate (%)</label>
                    <input type="number" min={0} max={100} value={b.ratePercent} onChange={(e) => updateBracket(i, { ratePercent: Number(e.target.value) })} className={`${inputCls} min-h-[36px] text-xs`} />
                  </div>
                  <button type="button" onClick={() => removeBracket(i)} className="text-brand-coral hover:underline text-xs font-medium flex items-center gap-1 justify-center min-h-[36px]">
                    <X className="w-3.5 h-3.5" /> Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-brand-coral">{error}</p>}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving}
            className="min-h-[44px] px-5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60 flex items-center gap-2">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save Settings</>}
          </button>
          {saved && <span className="text-sm text-emerald-600 font-medium">Saved ✓</span>}
        </div>
      </form>
    </div>
  )
}
