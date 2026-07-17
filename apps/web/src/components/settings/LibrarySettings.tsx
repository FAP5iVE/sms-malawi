'use client'

/**
 * apps/web/src/components/settings/LibrarySettings.tsx — Phase D15
 * Library staff / Admin: borrowing limits, fine rates, digital resource rules.
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R12 — Library Domain & the Storage API Contract Fix
 * [PURPOSE]: Fixed the broken `apiClient` import — no such export exists
 *   in api-client.ts (the real singleton is `apiFetch`, per
 *   sms-erp-backend's apiFetch-singleton rule); this compiled-and-crashed
 *   silently before since nothing else in this file's own module graph
 *   caught the missing export until a real TypeScript pass ran. The
 *   `fine_per_day_mwk` field this panel already exposed is now backed for
 *   real by SETTING_KEYS.LIBRARY_FINE_PER_DAY on the server side
 *   (settings.ts, same phase) — no change needed in this file itself for
 *   that part, since the field/endpoint shape was already correct.
 * [DEPENDS ON]: apps/web/src/server/routes/settings.ts (GET/PATCH
 *   /settings/library — same phase)
 */

import { useState, useEffect } from 'react'
import { Loader2, Save }       from 'lucide-react'
import { apiFetch }            from '@/lib/api-client'

const inputCls = 'w-full min-h-[44px] border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25'

interface LibraryConfig {
  max_borrow_days_student:  string
  max_borrow_days_staff:    string
  max_books_student:        string
  max_books_staff:          string
  fine_per_day_mwk:         string
  fine_grace_days:          string
  max_fine_per_book_mwk:    string
  allow_student_upload:     string
  require_approval:         string
}

export function LibrarySettings() {
  const [config,  setConfig]  = useState<LibraryConfig>({
    max_borrow_days_student: '14',
    max_borrow_days_staff:   '21',
    max_books_student:       '3',
    max_books_staff:         '5',
    fine_per_day_mwk:        '100',
    fine_grace_days:         '2',
    max_fine_per_book_mwk:   '2000',
    allow_student_upload:    'false',
    require_approval:        'true',
  })
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    apiFetch<Partial<LibraryConfig>>('/settings/library')
      .then((d) => setConfig((p) => ({ ...p, ...d })))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  function set(k: keyof LibraryConfig, v: string) {
    setConfig((p) => ({ ...p, [k]: v }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null); setSaved(false)
    try {
      await apiFetch('/settings/library', { method: 'PATCH', body: JSON.stringify(config) })
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally { setSaving(false) }
  }

  if (loading) return <div className="flex items-center gap-2 text-muted text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-bold text-lg text-brand-navy">Library Rules</h2>
        <p className="text-sm text-muted mt-0.5">Borrowing limits, fine rates, and digital resource policies.</p>
      </div>
      <form onSubmit={handleSave} className="space-y-6">
        {/* Borrowing Limits */}
        <div className="pb-5 border-b border-base">
          <h3 className="font-heading font-semibold text-sm text-body mb-4">Borrowing Limits</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {([
              ['max_borrow_days_student', 'Student Loan Days'],
              ['max_borrow_days_staff',   'Staff Loan Days'],
              ['max_books_student',       'Max Books (Student)'],
              ['max_books_staff',         'Max Books (Staff)'],
            ] as [keyof LibraryConfig, string][]).map(([k, label]) => (
              <div key={k}>
                <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">{label}</label>
                <input type="number" min={1} value={config[k]} onChange={(e) => set(k, e.target.value)} className={inputCls} />
              </div>
            ))}
          </div>
        </div>
        {/* Fines */}
        <div className="pb-5 border-b border-base">
          <h3 className="font-heading font-semibold text-sm text-body mb-4">Late Return Fines (MWK)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg">
            {([
              ['fine_per_day_mwk',       'Fine Per Day'],
              ['fine_grace_days',        'Grace Period (days)'],
              ['max_fine_per_book_mwk',  'Maximum Fine Per Book'],
            ] as [keyof LibraryConfig, string][]).map(([k, label]) => (
              <div key={k}>
                <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">{label}</label>
                <input type="number" min={0} value={config[k]} onChange={(e) => set(k, e.target.value)} className={inputCls} />
              </div>
            ))}
          </div>
        </div>
        {/* Digital Resources */}
        <div>
          <h3 className="font-heading font-semibold text-sm text-body mb-4">Digital Resource Policy</h3>
          <div className="space-y-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={config.allow_student_upload === 'true'} onChange={(e) => set('allow_student_upload', e.target.checked ? 'true' : 'false')} className="mt-0.5 w-4 h-4 accent-brand-teal" />
              <div>
                <span className="text-sm font-medium text-body">Allow students to upload past papers</span>
                <p className="text-xs text-muted mt-0.5">Uploads require library staff approval before appearing in the catalogue.</p>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={config.require_approval === 'true'} onChange={(e) => set('require_approval', e.target.checked ? 'true' : 'false')} className="mt-0.5 w-4 h-4 accent-brand-teal" />
              <div>
                <span className="text-sm font-medium text-body">Require library staff approval for all uploads</span>
                <p className="text-xs text-muted mt-0.5">All digital resources must be reviewed before student access.</p>
              </div>
            </label>
          </div>
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