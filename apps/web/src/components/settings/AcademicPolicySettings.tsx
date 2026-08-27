'use client'

/*
 * apps/web/src/components/settings/AcademicPolicySettings.tsx — Phase D15
 * High Rank / Admin: academic calendar dates, attendance thresholds, report card policy.
 *
 * [CHANGE TYPE]: TARGETED EDIT (production fix, 2026-08-27).
 * [PURPOSE]: "Current Academic Year" — the actual source of truth this
 *   whole app derives its academic year from (SETTING_KEYS.
 *   CURRENT_ACADEMIC_YEAR) — was a free-text `<input placeholder=
 *   "2025/2026">`. Since every parseAcademicYear() call downstream
 *   requires the exact "YYYY/YYYY" shape, a single admin typo here
 *   ("2025-2026", "25/26") would break academic-year derivation
 *   app-wide. Replaced with the shared <AcademicYearSelect>
 *   (apps/web/src/components/shared/AcademicYearSelect.tsx) so the value
 *   can now only ever be a well-formed, real option — `{ back: 2,
 *   forward: 3 }` gives a bit more forward runway than the shared
 *   component's default, since this is the one field admins use to
 *   advance the setting itself ahead of a new academic year.
 * [DEPENDS ON]: apps/web/src/components/shared/AcademicYearSelect.tsx (new)
 */

import { useState, useEffect } from 'react'
import { Loader2, Save }       from 'lucide-react'
import { apiFetch }            from '@/lib/api-client'
import { AcademicYearSelect }  from '@/components/shared/AcademicYearSelect'

const inputCls = 'w-full min-h-11 border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25'

interface AcademicPolicy {
  // [PRODUCTION FIX 2026-07-28] Moved here from System Configuration, where
  // they didn't semantically belong. current_academic_year is the
  // corrected key name — the old System Config field wrote to current_year,
  // a key nothing else in the system ever read.
  current_academic_year: string
  current_term:          string
  next_term_date:        string
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
    current_academic_year: '2025/2026',
    current_term:          '1',
    next_term_date:        '',
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
        {/* [PRODUCTION FIX 2026-07-28] Current Term & Year — moved from
            System Configuration, and the year field now writes to the
            correct key (current_academic_year) instead of the dead
            current_year key the old form used. */}
        <div className="pb-5 border-b border-base">
          <h3 className="font-heading font-semibold text-sm text-body mb-4">Current Term &amp; Year</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">Current Academic Year</label>
              <AcademicYearSelect
                value={policy.current_academic_year}
                onChange={(e) => set('current_academic_year', e.target.value)}
                optionsConfig={{ back: 2, forward: 3 }}
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">Current Term</label>
              <select value={policy.current_term} onChange={(e) => set('current_term', e.target.value)} className={inputCls}>
                <option value="1">Term 1</option>
                <option value="2">Term 2</option>
                <option value="3">Term 3</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">Next Term Start Date</label>
              <input type="date" value={policy.next_term_date} onChange={(e) => set('next_term_date', e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>

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