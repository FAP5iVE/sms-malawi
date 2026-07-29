'use client'

/**
 * apps/web/src/components/settings/SystemConfigSettings.tsx — Phase D15
 * Admin only: school identity, academic calendar, and system configuration.
 */

import { useState, useEffect } from 'react'
import { Loader2, Save }       from 'lucide-react'
import { apiFetch }            from '@/lib/api-client'

interface SystemConfig {
  session_timeout_hr: string
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )
}

const inputCls = 'w-full min-h-[44px] border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25'

export function SystemConfigSettings() {
  const [config,  setConfig]  = useState<SystemConfig>({
    session_timeout_hr: '5',
  })
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    apiFetch<Partial<SystemConfig>>('/settings/system')
      .then((data) => setConfig((prev) => ({ ...prev, ...data })))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  function set(key: keyof SystemConfig, value: string) {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await apiFetch('/settings/system', { method: 'PATCH', body: JSON.stringify(config) })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-bold text-lg text-brand-navy">System Configuration</h2>
        <p className="text-sm text-muted mt-0.5">
          Global system settings. School identity now lives under its own
          &quot;School Identity&quot; section; academic calendar dates live under
          &quot;Academic Policy&quot;.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* Security */}
        <div>
          <h3 className="font-heading font-semibold text-sm text-body mb-4">Security</h3>
          <div className="max-w-xs">
            <Field label="Session Timeout (hours)">
              <select value={config.session_timeout_hr} onChange={(e) => set('session_timeout_hr', e.target.value)} className={inputCls}>
                <option value="1">1 hour</option>
                <option value="2">2 hours</option>
                <option value="5">5 hours</option>
                <option value="8">8 hours (work day)</option>
              </select>
            </Field>
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