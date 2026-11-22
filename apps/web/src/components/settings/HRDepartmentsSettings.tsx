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
import { StatusText } from '@/components/shared/StatusText'
import { Loader2, Save, Plus, X, Building2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import type { DepartmentTitles, LeavePayPercent, LeaveTypeKey } from '@shared/types/settings'
import { LEAVE_TYPES, LEAVE_TYPE_LABELS } from '@shared/types/settings'

/** The leave rules HR sets here. Mirrors the `leave` object of GET/PATCH /settings/hr. */
interface LeaveConfig {
  annualDays: number
  sickFullDays: number
  sickHalfDays: number
  emergencyDays: number
  maternityDays: number
  paternityDays: number
  studyDays: number
  maxConcurrentPct: number
  payPercent: LeavePayPercent
}

const PAY_CHOICES: Array<{ value: number; label: string }> = [
  { value: 100, label: 'Full pay' },
  { value: 50,  label: 'Half pay' },
  { value: 0,   label: 'Unpaid' },
]

// The days each type is allowed, and what the number means for that type.
const LEAVE_DAY_FIELDS: Array<{ key: keyof Omit<LeaveConfig, 'payPercent'>; label: string; hint: string; max: number }> = [
  { key: 'annualDays',       label: 'Annual leave (days a year)',          hint: 'Statutory minimum is 15 on a five-day week. Does not carry over.', max: 365 },
  { key: 'sickFullDays',     label: 'Sick leave on full pay (days a year)', hint: 'Statutory minimum is 4 weeks (20 days).', max: 365 },
  { key: 'sickHalfDays',     label: 'Sick leave on half pay (days a year)', hint: 'Used after the full-pay days. Statutory minimum is 8 weeks (40 days).', max: 365 },
  { key: 'emergencyDays',    label: 'Emergency leave (days a year)',       hint: 'Funeral and urgent family matters.', max: 30 },
  { key: 'maternityDays',    label: 'Maternity leave (days per request)',  hint: 'Statutory minimum is 8 weeks (40 days) on full pay.', max: 365 },
  { key: 'paternityDays',    label: 'Paternity leave (days per request)',  hint: 'Statutory minimum is 2 weeks (10 days).', max: 60 },
  { key: 'studyDays',        label: 'Study leave (days per request)',      hint: 'Longest single request.', max: 180 },
  { key: 'maxConcurrentPct', label: 'Most staff away at once (percent)',         hint: 'Per department. Warns HR when approving would go over.', max: 100 },
]
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
  // Retirement age is a separate policy value with its own save, so editing it
  // never rewrites (or fails because of) the department list.
  const [retirementAge, setRetirementAge]   = useState('60')
  const [ageSaving, setAgeSaving]           = useState(false)
  const [ageSaved, setAgeSaved]             = useState(false)
  const [ageError, setAgeError]             = useState<string | null>(null)
  // Leave days and leave pay: their own card and their own save, like the
  // retirement age, so one never blocks the other.
  const [leave, setLeave]                   = useState<LeaveConfig | null>(null)
  const [leaveSaving, setLeaveSaving]       = useState(false)
  const [leaveSaved, setLeaveSaved]         = useState(false)
  const [leaveError, setLeaveError]         = useState<string | null>(null)

  useEffect(() => {
    apiFetch<{ departmentTitles: DepartmentTitles; retirementAge?: number; leave?: LeaveConfig }>('/settings/hr')
      .then((d) => {
        setData(d.departmentTitles ?? {})
        if (typeof d.retirementAge === 'number') setRetirementAge(String(d.retirementAge))
        if (d.leave) setLeave(d.leave)
      })
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

  async function handleSaveLeave() {
    if (!leave) return
    for (const f of LEAVE_DAY_FIELDS) {
      const v = leave[f.key]
      const min = f.key === 'sickHalfDays' || f.key === 'maxConcurrentPct' ? 0 : 1
      if (!Number.isInteger(v) || v < min || v > f.max) {
        setLeaveError(`${f.label}: enter a whole number from ${min} to ${f.max}.`)
        return
      }
    }
    setLeaveSaving(true); setLeaveError(null); setLeaveSaved(false)
    try {
      await apiFetch('/settings/hr', { method: 'PATCH', body: JSON.stringify({ leave }) })
      setLeaveSaved(true); setTimeout(() => setLeaveSaved(false), 3000)
    } catch (err) {
      setLeaveError(err instanceof Error ? err.message : 'Could not save the leave rules. Try again.')
    } finally {
      setLeaveSaving(false)
    }
  }

  async function handleSaveRetirementAge() {
    const age = Number(retirementAge)
    if (!Number.isInteger(age) || age < 50 || age > 75) {
      setAgeError('Enter a whole number of years between 50 and 75.')
      return
    }
    setAgeSaving(true); setAgeError(null); setAgeSaved(false)
    try {
      await apiFetch('/settings/hr', {
        method: 'PATCH',
        body:   JSON.stringify({ retirementAge: age }),
      })
      setAgeSaved(true); setTimeout(() => setAgeSaved(false), 3000)
    } catch (err) {
      setAgeError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setAgeSaving(false)
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
      {/* Leave: how many days, and how each type is paid. HR / high_rank decide
          each request; these are the allowances and the pay rule payroll applies. */}
      {leave && (
        <div className="app-tint rounded-xl p-5 space-y-5 max-w-3xl">
          <div>
            <h2 className="font-heading font-bold text-lg text-brand-navy">Leave days and pay</h2>
            <p className="text-sm text-muted mt-0.5">
              Days are working days (Monday to Friday, public holidays excluded). Annual, sick and
              emergency leave start fresh each January and do not carry over. Saving updates
              everyone&apos;s balance for this year.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {LEAVE_DAY_FIELDS.map((f) => (
              <div key={f.key}>
                <label htmlFor={`leave-${f.key}`} className="block text-xs font-heading font-semibold text-muted mb-1.5">{f.label}</label>
                <input
                  id={`leave-${f.key}`}
                  aria-describedby={`leave-${f.key}-hint`}
                  type="number"
                  inputMode="numeric"
                  min={f.key === 'sickHalfDays' || f.key === 'maxConcurrentPct' ? 0 : 1}
                  max={f.max}
                  value={leave[f.key]}
                  onChange={(e) => setLeave({ ...leave, [f.key]: e.target.value === '' ? 0 : Number(e.target.value) })}
                  className={inputCls}
                />
                <p id={`leave-${f.key}-hint`} className="text-xs text-muted mt-1">{f.hint}</p>
              </div>
            ))}
          </div>

          <div>
            <h3 className="font-heading font-semibold text-sm text-body">Pay while on leave</h3>
            <p className="text-xs text-muted mt-0.5 mb-3">
              Payroll applies this in the month the leave falls in. Half-paid and unpaid days are
              taken off that month&apos;s pay, and PAYE and pension are worked out on the reduced
              pay. For sick leave, this choice covers the full-pay days; half-pay days are always
              paid at half.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              {LEAVE_TYPES.map((t: LeaveTypeKey) => (
                <div key={t} className="flex items-center justify-between gap-3">
                  <label htmlFor={`leave-pay-${t}`} className="text-sm text-body">{LEAVE_TYPE_LABELS[t]}</label>
                  <select
                    id={`leave-pay-${t}`}
                    value={leave.payPercent[t]}
                    onChange={(e) => setLeave({ ...leave, payPercent: { ...leave.payPercent, [t]: Number(e.target.value) } })}
                    className="border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-[40px]"
                  >
                    {PAY_CHOICES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    {!PAY_CHOICES.some((c) => c.value === leave.payPercent[t]) && (
                      <option value={leave.payPercent[t]}>{leave.payPercent[t]}% pay</option>
                    )}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {leaveError && <p className="text-sm text-tone-coral">{leaveError}</p>}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSaveLeave}
              disabled={leaveSaving}
              className="min-h-[44px] px-5 rounded-xl text-sm font-heading font-semibold bg-btn-brand text-btn-brand-fg hover:bg-btn-brand-hover transition-colors disabled:opacity-60 flex items-center gap-2"
            >
              {leaveSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save leave rules</>}
            </button>
            {leaveSaved && <StatusText tone="success" size="md">Saved</StatusText>}
          </div>
        </div>
      )}

      {/* Retirement age — drives the retirement date shown on each staff profile
          (date of birth + this value) and the "retiring soon" list for HR. */}
      <div className="app-tint rounded-xl p-5 space-y-3 max-w-xl">
        <div>
          <h2 className="font-heading font-bold text-lg text-brand-navy">Retirement age</h2>
          <p className="text-sm text-muted mt-0.5">
            Each staff member&apos;s retirement date is their date of birth plus this age. Changing it
            updates every staff profile at once. Visible to admin, HR and the headteacher only.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="w-32">
            <label className="block text-xs font-heading font-semibold text-muted mb-1.5">
              Age (years)
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={50}
              max={75}
              value={retirementAge}
              onChange={(e) => setRetirementAge(e.target.value)}
              className={inputCls}
            />
          </div>
          <button
            type="button"
            onClick={handleSaveRetirementAge}
            disabled={ageSaving}
            className="min-h-[44px] px-4 rounded-xl bg-brand-deep text-white text-sm font-semibold disabled:opacity-40 flex items-center gap-1.5"
          >
            {ageSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
          {ageSaved && <span className="text-sm text-tone-teal pb-3">Saved</span>}
        </div>
        {ageError && <p className="text-sm text-tone-coral">{ageError}</p>}
      </div>

      <div>
        <h2 className="font-heading font-bold text-lg text-brand-navy">Departments and job titles</h2>
        <p className="text-sm text-muted mt-0.5">
          Defines the department and job title options offered when creating a staff member, and the
          filters available on the staff directory. Keeping this centralised avoids the same department
          being typed a different way by different people.
        </p>
      </div>

      {/* Add department */}
      <div className="flex items-end gap-2 max-w-md">
        <div className="flex-1">
          <label className="block text-xs font-heading font-semibold text-muted mb-1.5">
            New department
          </label>
          <input
            value={newDept}
            onChange={(e) => setNewDept(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDepartment() } }}
            className={inputCls}
            placeholder="Music"
          />
        </div>
        <button
          type="button"
          onClick={addDepartment}
          disabled={!newDept.trim()}
          className="min-h-[44px] px-4 rounded-xl bg-brand-deep text-white text-sm font-semibold disabled:opacity-40 flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {/* Department cards */}
      <div className="space-y-4">
        {departments.length === 0 ? (
          <div className="text-center py-10 text-muted text-sm">
            No departments defined yet. Add one above to get started.
          </div>
        ) : (
          departments.map((dept) => (
            <div key={dept} className="pb-4 border-b border-base last:border-b-0">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-heading font-semibold text-sm text-body flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-tone-teal" aria-hidden />
                  {dept}
                </h3>
                <button
                  type="button"
                  onClick={() => removeDepartment(dept)}
                  className="text-xs text-tone-coral app-action font-medium"
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
                      className="inline-flex items-center gap-1.5 app-tint rounded-lg px-3 py-1 text-xs text-body"
                    >
                      {title}
                      <button
                        type="button"
                        onClick={() => removeTitle(dept, title)}
                        aria-label={`Remove ${title}`}
                        className="text-muted hover:text-tone-coral"
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

      {error && <p className="text-sm text-tone-coral">{error}</p>}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="min-h-[44px] px-5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors disabled:opacity-60 flex items-center gap-2"
        >
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Save className="w-4 h-4" /> Save Changes</>}
        </button>
        {saved && <StatusText tone="success" size="md">Saved</StatusText>}
      </div>
    </div>
  )
}