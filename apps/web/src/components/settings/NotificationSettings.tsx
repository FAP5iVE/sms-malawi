'use client'

/**
 * apps/web/src/components/settings/NotificationSettings.tsx — Phase D15
 * All roles: toggle push and email notification preferences per event type.
 * Preferences are stored per-user in SystemSettings keyed by uid.
 */

import { useState, useEffect } from 'react'
import { Loader2, Save, Bell }  from 'lucide-react'
import { useAuthStore }         from '@/store/authStore'
import { apiClient }            from '@/lib/api-client'

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION CATEGORIES BY ROLE GROUP
// ─────────────────────────────────────────────────────────────────────────────

interface NotifPref {
  key:   string
  label: string
  description: string
}

const ALL_PREFS: NotifPref[] = [
  { key: 'notif_announcements',    label: 'Announcements',        description: 'New school-wide announcements and events.' },
  { key: 'notif_results_released', label: 'Exam Results',         description: 'When exam results are released.' },
  { key: 'notif_fees_due',         label: 'Fee Reminders',        description: 'Upcoming and overdue fee notifications.' },
  { key: 'notif_leave_status',     label: 'Leave Request Updates', description: 'When your leave request is approved or rejected.' },
  { key: 'notif_library_overdue',  label: 'Library Overdue',      description: 'Reminders for overdue borrowed books.' },
  { key: 'notif_payslip_ready',    label: 'Payslip Ready',        description: 'When your monthly payslip is generated.' },
  { key: 'notif_pending_actions',  label: 'Pending Actions',      description: 'Items awaiting your approval or action.' },
  { key: 'notif_system_alerts',    label: 'System Alerts',        description: 'Critical system errors and downtime notices (admin only).' },
]

// Role-based filter: show only relevant prefs
const ROLE_PREFS: Record<string, string[]> = {
  admin:        ALL_PREFS.map((p) => p.key),
  high_rank:    ['notif_announcements', 'notif_pending_actions', 'notif_leave_status', 'notif_results_released'],
  finance:      ['notif_announcements', 'notif_fees_due', 'notif_payslip_ready', 'notif_pending_actions'],
  library:      ['notif_announcements', 'notif_library_overdue', 'notif_pending_actions'],
  hr:           ['notif_announcements', 'notif_leave_status', 'notif_pending_actions', 'notif_payslip_ready'],
  academic:     ['notif_announcements', 'notif_results_released', 'notif_library_overdue', 'notif_payslip_ready'],
  exam_officer: ['notif_announcements', 'notif_results_released', 'notif_pending_actions'],
  lower_rank:   ['notif_announcements', 'notif_pending_actions'],
  student:      ['notif_announcements', 'notif_results_released', 'notif_fees_due', 'notif_library_overdue'],
}

// ─────────────────────────────────────────────────────────────────────────────
// TOGGLE ROW
// ─────────────────────────────────────────────────────────────────────────────

function ToggleRow({
  pref,
  push,
  email,
  onToggle,
}: {
  pref:     NotifPref
  push:     boolean
  email:    boolean
  onToggle: (key: string, channel: 'push' | 'email', value: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5 border-b border-base last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-heading font-medium text-body">{pref.label}</p>
        <p className="text-xs text-muted mt-0.5">{pref.description}</p>
      </div>
      <div className="flex items-center gap-6 shrink-0">
        {/* Push toggle */}
        <label className="flex flex-col items-center gap-1 cursor-pointer">
          <span className="text-[10px] font-heading font-semibold text-muted uppercase tracking-wide">Push</span>
          <button
            type="button"
            role="switch"
            aria-checked={push}
            onClick={() => onToggle(pref.key, 'push', !push)}
            className={`relative w-10 h-5 rounded-full transition-colors ${push ? 'bg-brand-teal' : 'bg-base border border-base'}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${push ? 'translate-x-5' : 'translate-x-0'}`}
            />
          </button>
        </label>
        {/* Email toggle */}
        <label className="flex flex-col items-center gap-1 cursor-pointer">
          <span className="text-[10px] font-heading font-semibold text-muted uppercase tracking-wide">Email</span>
          <button
            type="button"
            role="switch"
            aria-checked={email}
            onClick={() => onToggle(pref.key, 'email', !email)}
            className={`relative w-10 h-5 rounded-full transition-colors ${email ? 'bg-brand-teal' : 'bg-base border border-base'}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${email ? 'translate-x-5' : 'translate-x-0'}`}
            />
          </button>
        </label>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION SETTINGS
// ─────────────────────────────────────────────────────────────────────────────

export function NotificationSettings() {
  const { role, user }  = useAuthStore()
  const visibleKeys     = role ? (ROLE_PREFS[role] ?? []) : []
  const visiblePrefs    = ALL_PREFS.filter((p) => visibleKeys.includes(p.key))

  // prefs: { [key_push]: boolean, [key_email]: boolean }
  const [prefs,   setPrefs]   = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {}
    ALL_PREFS.forEach((p) => { init[`${p.key}_push`] = true; init[`${p.key}_email`] = true })
    return init
  })
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    if (!user?.uid) return
    apiClient<Record<string, boolean>>(`/settings/notifications`)
      .then((d) => setPrefs((p) => ({ ...p, ...d })))
      .catch(() => {/* use defaults */})
      .finally(() => setLoading(false))
  }, [user?.uid])

  function handleToggle(key: string, channel: 'push' | 'email', value: boolean) {
    setPrefs((p) => ({ ...p, [`${key}_${channel}`]: value }))
  }

  async function handleSave() {
    setSaving(true); setError(null); setSaved(false)
    try {
      await apiClient('/settings/notifications', { method: 'PATCH', body: JSON.stringify(prefs) })
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally { setSaving(false) }
  }

  if (loading) return <div className="flex items-center gap-2 text-muted text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-bold text-lg text-brand-navy flex items-center gap-2">
          <Bell className="w-5 h-5" aria-hidden />
          Notification Preferences
        </h2>
        <p className="text-sm text-muted mt-0.5">Choose which notifications you receive via push and email.</p>
      </div>

      <div className="bg-surface border border-base rounded-xl px-5 divide-y divide-base">
        {visiblePrefs.map((pref) => (
          <ToggleRow
            key={pref.key}
            pref={pref}
            push={prefs[`${pref.key}_push`] ?? true}
            email={prefs[`${pref.key}_email`] ?? true}
            onToggle={handleToggle}
          />
        ))}
      </div>

      {error && <p className="text-sm text-brand-coral">{error}</p>}

      <div className="flex items-center gap-3">
        <button type="button" onClick={handleSave} disabled={saving}
          className="min-h-[44px] px-5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60 flex items-center gap-2">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save Preferences</>}
        </button>
        {saved && <span className="text-sm text-emerald-600 font-medium">Saved ✓</span>}
      </div>
    </div>
  )
}