'use client'

/**
 * apps/web/src/components/settings/FinanceSettings.tsx — Phase D15
 * Finance staff / Admin: fee reminders, late payment penalties, payroll cycle.
 */

import { useState, useEffect } from 'react'
import { Loader2, Save }       from 'lucide-react'
import { apiFetch }            from '@/lib/api-client'

const inputCls = 'w-full min-h-[44px] border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25'

interface FinanceConfig {
  fee_reminder_days_before:   string
  late_payment_penalty_pct:   string
  late_payment_grace_days:    string
  invoice_due_days:           string
  payroll_day_of_month:       string
  enable_usd_display:         string
  receipt_prefix:             string
}

export function FinanceSettings() {
  const [config,  setConfig]  = useState<FinanceConfig>({
    fee_reminder_days_before:  '3',
    late_payment_penalty_pct:  '5',
    late_payment_grace_days:   '7',
    invoice_due_days:          '30',
    payroll_day_of_month:      '25',
    enable_usd_display:        'false',
    receipt_prefix:            'RCP',
  })
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    apiFetch<Partial<FinanceConfig>>('/settings/finance')
      .then((d) => setConfig((p) => ({ ...p, ...d })))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  function set(k: keyof FinanceConfig, v: string) {
    setConfig((p) => ({ ...p, [k]: v }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null); setSaved(false)
    try {
      await apiFetch('/settings/finance', { method: 'PATCH', body: JSON.stringify(config) })
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally { setSaving(false) }
  }

  if (loading) return <div className="flex items-center gap-2 text-muted text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-bold text-lg text-brand-navy">Finance Preferences</h2>
        <p className="text-sm text-muted mt-0.5">Fee reminders, penalties, payroll and receipt settings.</p>
      </div>
      <form onSubmit={handleSave} className="space-y-6">
        {/* Fee Management */}
        <div className="pb-5 border-b border-base">
          <h3 className="font-heading font-semibold text-sm text-body mb-4">Fee Management</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-lg">
            <div>
              <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">Reminder Days Before Due</label>
              <input type="number" min={1} value={config.fee_reminder_days_before} onChange={(e) => set('fee_reminder_days_before', e.target.value)} className={inputCls} />
              <p className="text-xs text-muted mt-1">Send automated reminder this many days before the due date.</p>
            </div>
            <div>
              <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">Invoice Due Period (days)</label>
              <input type="number" min={1} value={config.invoice_due_days} onChange={(e) => set('invoice_due_days', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">Late Payment Grace Period (days)</label>
              <input type="number" min={0} value={config.late_payment_grace_days} onChange={(e) => set('late_payment_grace_days', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">Late Payment Penalty (%)</label>
              <input type="number" min={0} max={100} value={config.late_payment_penalty_pct} onChange={(e) => set('late_payment_penalty_pct', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">Receipt Number Prefix</label>
              <input value={config.receipt_prefix} onChange={(e) => set('receipt_prefix', e.target.value)} className={inputCls} placeholder="RCP" />
            </div>
          </div>
        </div>
        {/* Payroll */}
        <div className="pb-5 border-b border-base">
          <h3 className="font-heading font-semibold text-sm text-body mb-4">Payroll</h3>
          <div className="max-w-xs">
            <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">Payroll Processing Day (1–28)</label>
            <input type="number" min={1} max={28} value={config.payroll_day_of_month} onChange={(e) => set('payroll_day_of_month', e.target.value)} className={inputCls} />
            <p className="text-xs text-muted mt-1">Day of month when payroll runs are auto-drafted.</p>
          </div>
        </div>
        {/* Currency */}
        <div>
          <h3 className="font-heading font-semibold text-sm text-body mb-4">Currency Display</h3>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={config.enable_usd_display === 'true'} onChange={(e) => set('enable_usd_display', e.target.checked ? 'true' : 'false')} className="mt-0.5 w-4 h-4 accent-brand-teal" />
            <div>
              <span className="text-sm font-medium text-body">Show USD equivalent in financial reports</span>
              <p className="text-xs text-muted mt-0.5">Uses a configurable exchange rate for display only. All records stored in MWK.</p>
            </div>
          </label>
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