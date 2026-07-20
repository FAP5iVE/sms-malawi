'use client'

/*
 * apps/web/src/components/settings/AcademicPolicySettings.tsx — Phase D15
 * High Rank / Admin: academic calendar dates, attendance thresholds, report card policy.
 */

import { useState, useEffect } from 'react'
import { Loader2, Save }       from 'lucide-react'
import { apiFetch }            from '@/lib/api-client'

const inputCls = 'w-full min-h-11 border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25'

interface AcademicPolicy {
  term1_start:            string
  term1_end:              string
  term2_start:            string
  term2_end:              string
  term3_start:            string
  term3_end:              string
  min_attendance_pct:     string
  report_card_comment_required: string
  ca_weight_pct:          string
  exam_weight_pct:        string
}

export function AcademicPolicySettings() {
  const [policy,  setPolicy]  = useState<AcademicPolicy>({
    term1_start:            '',
    term1_end:              '',
    term2_start:            '',
    term2_end:              '',
    term3_start:            '',
    term3_end:              '',
    min_attendance_pct:     '80',
    report_card_comment_required: 'true',
    ca_weight_pct:          '30',
    exam_weight_pct:        '70',
  })
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    apiFetch<Partial<AcademicPolicy>>('/settings/academic-policy')
      .then((data) => setPolicy((prev) => ({ ...prev, ...data })))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  function set(key: keyof AcademicPolicy, value: string) {
    setPolicy((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null); setSaved(false)
    try {
      await apiFetch('/settings/academic-policy', { method: 'PATCH', body: JSON.stringify(policy) })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex items-center gap-2 text-muted text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-bold text-lg text-brand-navy">Academic Policy</h2>
        <p className="text-sm text-muted mt-0.5">Term dates, attendance rules, and assessment weighting.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Term Dates */}
        <div className="pb-5 border-b border-base">
          <h3 className="font-heading font-semibold text-sm text-body mb-4">Term Calendar Dates</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {([
              ['term1_start', 'Term 1 Start'],
              ['term1_end',   'Term 1 End'],
              ['term2_start', 'Term 2 Start'],
              ['term2_end',   'Term 2 End'],
              ['term3_start', 'Term 3 Start'],
              ['term3_end',   'Term 3 End'],
            ] as [keyof AcademicPolicy, string][]).map(([key, label]) => (
              <div key={key}>
                <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">{label}</label>
                <input type="date" value={policy[key]} onChange={(e) => set(key, e.target.value)} className={inputCls} />
              </div>
            ))}
          </div>
        </div>

        {/* Attendance */}
        <div className="pb-5 border-b border-base">
          <h3 className="font-heading font-semibold text-sm text-body mb-4">Attendance Policy</h3>
          <div className="max-w-xs">
            <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">
              Minimum Attendance Required (%)
            </label>
            <input type="number" min={0} max={100}
              value={policy.min_attendance_pct}
              onChange={(e) => set('min_attendance_pct', e.target.value)}
              className={inputCls} />
            <p className="text-xs text-muted mt-1">Students below this threshold are flagged as at-risk.</p>
          </div>
        </div>

        {/* Assessment Weighting */}
        <div className="pb-5 border-b border-base">
          <h3 className="font-heading font-semibold text-sm text-body mb-4">Assessment Weighting</h3>
          <div className="grid grid-cols-2 gap-4 max-w-xs">
            <div>
              <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">C.A. Weight (%)</label>
              <input type="number" min={0} max={100}
                value={policy.ca_weight_pct}
                onChange={(e) => set('ca_weight_pct', e.target.value)}
                className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">Exam Weight (%)</label>
              <input type="number" min={0} max={100}
                value={policy.exam_weight_pct}
                onChange={(e) => set('exam_weight_pct', e.target.value)}
                className={inputCls} />
            </div>
          </div>
          <p className="text-xs text-muted mt-2">C.A. + Exam must sum to 100%.</p>
        </div>

        {/* Report Card Policy */}
        <div>
          <h3 className="font-heading font-semibold text-sm text-body mb-4">Report Card Policy</h3>
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox"
              checked={policy.report_card_comment_required === 'true'}
              onChange={(e) => set('report_card_comment_required', e.target.checked ? 'true' : 'false')}
              className="mt-0.5 w-4 h-4 accent-brand-teal" />
            <div>
              <span className="text-sm font-medium text-body">Require teacher comment before report card release</span>
              <p className="text-xs text-muted mt-0.5">When enabled, report cards cannot be released if the class teacher comment is empty.</p>
            </div>
          </label>
        </div>

        {error && <p className="text-sm text-brand-coral">{error}</p>}

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving}
            className="min-h-11 px-5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60 flex items-center gap-2">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save Settings</>}
          </button>
          {saved && <span className="text-sm text-emerald-600 font-medium">Saved ✓</span>}
        </div>
      </form>
    </div>
  )
}