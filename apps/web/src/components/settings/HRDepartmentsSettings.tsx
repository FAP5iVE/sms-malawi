'use client'

/**
 * apps/web/src/components/settings/HRDepartmentsSettings.tsx
 *
 * [CHANGE TYPE]: NEW FILE (production fix, 2026-07-27)
 * [PURPOSE]: Admin/HR/High Rank editor for the school's department → job
 *   title taxonomy (SETTING_KEYS.HR_DEPARTMENT_TITLES). This is the single
 *   source of truth the staff-creation form (StaffForm.tsx) and the staff
 *   directory's department/title filters read from — replacing free-text
 *   department/jobTitle inputs that let every staff member spell their own
 *   department differently, which silently broke any department-scoped
 *   rollup (e.g. Finance's per-department budget).
 * [DEPENDS ON]: apps/web/src/server/routes/settings.ts (GET/PATCH /settings/hr)
 */

import { useState, useEffect } from 'react'
import { Loader2, Save, Plus, X, Building2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import type { DepartmentTitles } from '@shared/types/settings'

const inputCls =
  'w-full min-h-[44px] border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-teal/25'

export function HRDepartmentsSettings() {
  const [data, setData]       = useState<DepartmentTitles>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [newDept, setNewDept] = useState('')
  const [newTitleFor, setNewTitleFor] = useState<Record<string, string>>({})

  useEffect(() => {
    apiFetch<{ departmentTitles: DepartmentTitles }>('/settings/hr')
      .then((d) => setData(d.departmentTitles ?? {}))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  function addDepartment() {
    const name = newDept.trim()
    if (!name || data[name]) return
    setData((prev) => ({ ...prev, [name]: [] }))
    setNewDept('')
  }

  function removeDepartment(name: string) {
    setData((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
  }

  function addTitle(dept: string) {
    const title = (newTitleFor[dept] ?? '').trim()
    if (!title || data[dept]?.includes(title)) return
    setData((prev) => ({ ...prev, [dept]: [...(prev[dept] ?? []), title] }))
    setNewTitleFor((prev) => ({ ...prev, [dept]: '' }))
  }

  function removeTitle(dept: string, title: string) {
    setData((prev) => ({ ...prev, [dept]: (prev[dept] ?? []).filter((t) => t !== title) }))
  }

  async function handleSave() {
    setSaving(true); setError(null); setSaved(false)
    try {
      await apiFetch('/settings/hr', {
        method: 'PATCH',
        body:   JSON.stringify({ departmentTitles: data }),
      })
      setSaved(true); setTimeout(() => setSaved(false), 3000)
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

  const departments = Object.keys(data).sort()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading font-bold text-lg text-brand-navy">Departments &amp; Job Titles</h2>
        <p className="text-sm text-muted mt-0.5">
          Defines the department and job title options offered when creating a staff member, and the
          filters available on the staff directory. Keeping this centralised avoids the same department
          being typed a different way by different people.
        </p>
      </div>

      {/* Add department */}
      <div className="flex items-end gap-2 max-w-md">
        <div className="flex-1">
          <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">
            New Department
          </label>
          <input
            value={newDept}
            onChange={(e) => setNewDept(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDepartment() } }}
            className={inputCls}
            placeholder="e.g. Music"
          />
        </div>
        <button
          type="button"
          onClick={addDepartment}
          disabled={!newDept.trim()}
          className="min-h-[44px] px-4 rounded-xl bg-brand-navy text-white text-sm font-semibold disabled:opacity-40 flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {/* Department cards */}
      <div className="space-y-4">
        {departments.length === 0 ? (
          <div className="text-center py-10 text-muted text-sm border border-base rounded-xl">
            No departments defined yet. Add one above to get started.
          </div>
        ) : (
          departments.map((dept) => (
            <div key={dept} className="border border-base rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-heading font-semibold text-sm text-body flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-brand-teal" aria-hidden />
                  {dept}
                </h3>
                <button
                  type="button"
                  onClick={() => removeDepartment(dept)}
                  className="text-xs text-brand-coral hover:underline font-medium"
                >
                  Remove department
                </button>
              </div>

              <div className="flex flex-wrap gap-2 mb-3">
                {(data[dept] ?? []).length === 0 ? (
                  <span className="text-xs text-muted">No titles yet.</span>
                ) : (
                  (data[dept] ?? []).map((title) => (
                    <span
                      key={title}
                      className="inline-flex items-center gap-1.5 bg-page border border-base rounded-full px-3 py-1 text-xs text-body"
                    >
                      {title}
                      <button
                        type="button"
                        onClick={() => removeTitle(dept, title)}
                        aria-label={`Remove ${title}`}
                        className="text-muted hover:text-brand-coral"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>

              <div className="flex items-center gap-2 max-w-xs">
                <input
                  value={newTitleFor[dept] ?? ''}
                  onChange={(e) => setNewTitleFor((prev) => ({ ...prev, [dept]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTitle(dept) } }}
                  className={`${inputCls} min-h-[36px] text-xs`}
                  placeholder="Add job title…"
                />
                <button
                  type="button"
                  onClick={() => addTitle(dept)}
                  disabled={!(newTitleFor[dept] ?? '').trim()}
                  className="shrink-0 border border-base rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-page disabled:opacity-40"
                >
                  Add
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {error && <p className="text-sm text-brand-coral">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="min-h-[44px] px-5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60 flex items-center gap-2"
        >
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save Changes</>}
        </button>
        {saved && <span className="text-sm text-emerald-600 font-medium">Saved ✓</span>}
      </div>
    </div>
  )
}