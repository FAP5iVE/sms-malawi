'use client'

/**
 * apps/web/src/components/settings/ClassroomSettings.tsx — Phase D15
 * Academic staff: default assignment deadline, marks entry preferences, lab booking defaults.
 */

import { useState, useEffect } from 'react'
import { Loader2, Save }       from 'lucide-react'
import { apiClient }           from '@/lib/api-client'

const inputCls = 'w-full min-h-[44px] border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25'

interface ClassroomConfig {
  default_assignment_days:   string
  marks_entry_reminder_hrs:  string
  show_class_averages:       string
  lab_booking_advance_days:  string
  default_exam_duration_min: string
}

export function ClassroomSettings() {
  const [config,  setConfig]  = useState<ClassroomConfig>({
    default_assignment_days:   '7',
    marks_entry_reminder_hrs:  '48',
    show_class_averages:       'true',
    lab_booking_advance_days:  '3',
    default_exam_duration_min: '120',
  })
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    apiClient<Partial<ClassroomConfig>>('/settings/classroom')
      .then((d) => setConfig((p) => ({ ...p, ...d })))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  function set(k: keyof ClassroomConfig, v: string) {
    setConfig((p) => ({ ...p, [k]: v }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null); setSaved(false)
    try {
      await apiClient('/settings/classroom', { method: 'PATCH', body: JSON.stringify(config) })
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally { setSaving(false) }
  }

  if (loading) return <div className="flex items-center gap-2 text-muted text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-bold text-lg text-brand-navy">Classroom Preferences</h2>
        <p className="text-sm text-muted mt-0.5">Default values for assignments, marks entry, and lab bookings.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Assignments */}
        <div className="pb-5 border-b border-base">
          <h3 className="font-heading font-semibold text-sm text-body mb-4">Assignments</h3>
          <div className="max-w-xs">
            <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">
              Default Deadline (days from today)
            </label>
            <input type="number" min={1} value={config.default_assignment_days} onChange={(e) => set('default_assignment_days', e.target.value)} className={inputCls} />
            <p className="text-xs text-muted mt-1">Pre-filled when creating a new assignment.</p>
          </div>
        </div>

        {/* Marks Entry */}
        <div className="pb-5 border-b border-base">
          <h3 className="font-heading font-semibold text-sm text-body mb-4">Marks Entry</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-sm">
            <div>
              <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">
                Entry Reminder (hours before deadline)
              </label>
              <input type="number" min={1} value={config.marks_entry_reminder_hrs} onChange={(e) => set('marks_entry_reminder_hrs', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">
                Default Exam Duration (min)
              </label>
              <input type="number" min={30} step={30} value={config.default_exam_duration_min} onChange={(e) => set('default_exam_duration_min', e.target.value)} className={inputCls} />
            </div>
          </div>
          <div className="mt-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={config.show_class_averages === 'true'} onChange={(e) => set('show_class_averages', e.target.checked ? 'true' : 'false')} className="mt-0.5 w-4 h-4 accent-brand-teal" />
              <div>
                <span className="text-sm font-medium text-body">Show class averages in marks entry view</span>
                <p className="text-xs text-muted mt-0.5">Displays running class average as marks are entered to help identify outliers.</p>
              </div>
            </label>
          </div>
        </div>

        {/* Lab Bookings */}
        <div>
          <h3 className="font-heading font-semibold text-sm text-body mb-4">Laboratory Bookings</h3>
          <div className="max-w-xs">
            <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">
              Minimum Advance Booking (days)
            </label>
            <input type="number" min={1} value={config.lab_booking_advance_days} onChange={(e) => set('lab_booking_advance_days', e.target.value)} className={inputCls} />
            <p className="text-xs text-muted mt-1">Bookings cannot be made less than this many days in advance.</p>
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