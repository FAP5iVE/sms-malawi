'use client'

/**
 * apps/web/src/components/settings/IdNumberSettings.tsx
 *
 * [CHANGE TYPE]: NEW FILE (21 Nov 2026)
 * [PURPOSE]: Admin / HR / High Rank editor for how new employee numbers and
 *   student registration numbers are laid out. The system generates every new
 *   number from the layout saved here and counts up on its own; nobody types a
 *   number any more. Records that already have a number keep it.
 * [DEPENDS ON]: apps/web/src/server/routes/settings.ts (GET/PATCH /settings/id-numbers),
 *   packages/shared/constants/malawi/registration.ts (the one set of format rules,
 *   shared with the server so the preview here matches what gets issued).
 */

import { useState, useEffect } from 'react'
import { Loader2, Save } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import {
  validateIdFormat,
  formatIdNumber,
  EMPLOYEE_NO_FORMAT_DEFAULT,
  STUDENT_REGISTRATION_NO_FORMAT_DEFAULT,
} from '@shared/constants/malawi'

const inputCls =
  'w-full min-h-[44px] border border-base rounded-xl px-3 py-2.5 text-sm bg-page text-body font-mono ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-teal/25'

interface FormatCardProps {
  title:       string
  description: string
  inputId:     string
  placeholder: string
  value:       string
  onChange:    (v: string) => void
  onSave:      () => void
  saving:      boolean
  saved:       boolean
  error:       string | null
}

function FormatCard({ title, description, inputId, placeholder, value, onChange, onSave, saving, saved, error }: FormatCardProps) {
  // Same rules the server applies, so what is shown here is what gets issued.
  const problem = validateIdFormat(value)
  const now = new Date()
  const preview = problem ? null : [1, 2, 3].map((n) => formatIdNumber(value.trim(), n, now))

  return (
    <div className="bg-surface rounded-xl p-5 space-y-3 max-w-xl">
      <div>
        <h2 className="font-heading font-bold text-lg text-brand-navy">{title}</h2>
        <p className="text-sm text-muted mt-0.5">{description}</p>
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor={inputId} className="block text-xs font-heading font-semibold text-muted mb-1.5">
            Format
          </label>
          <input
            id={inputId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={inputCls}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !!problem}
          className="min-h-[44px] px-4 rounded-xl bg-brand-deep text-white text-sm font-semibold disabled:opacity-40 flex items-center gap-1.5"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
        </button>
        {saved && <span className="text-sm text-tone-teal pb-3">Saved</span>}
      </div>
      {problem && value.length > 0 && <p className="text-sm text-tone-coral" role="alert">{problem}</p>}
      {preview && (
        <p className="text-sm text-muted">
          The first numbers will be <span className="font-mono text-body">{preview.join(', ')}</span>
        </p>
      )}
      {error && <p className="text-sm text-tone-coral" role="alert">{error}</p>}
    </div>
  )
}

export function IdNumberSettings() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [employeeFormat, setEmployeeFormat] = useState(EMPLOYEE_NO_FORMAT_DEFAULT)
  const [studentFormat, setStudentFormat]   = useState(STUDENT_REGISTRATION_NO_FORMAT_DEFAULT)

  // Each layout has its own save, so changing one never rewrites (or fails
  // because of) the other.
  const [empSaving, setEmpSaving] = useState(false)
  const [empSaved, setEmpSaved]   = useState(false)
  const [empError, setEmpError]   = useState<string | null>(null)
  const [stuSaving, setStuSaving] = useState(false)
  const [stuSaved, setStuSaved]   = useState(false)
  const [stuError, setStuError]   = useState<string | null>(null)

  useEffect(() => {
    apiFetch<{ employeeNoFormat: string; studentRegistrationNoFormat: string }>('/settings/id-numbers')
      .then((d) => {
        if (d.employeeNoFormat) setEmployeeFormat(d.employeeNoFormat)
        if (d.studentRegistrationNoFormat) setStudentFormat(d.studentRegistrationNoFormat)
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  async function save(
    body: Record<string, string>,
    set: { saving: (b: boolean) => void; saved: (b: boolean) => void; error: (e: string | null) => void },
  ) {
    set.saving(true); set.error(null); set.saved(false)
    try {
      await apiFetch('/settings/id-numbers', { method: 'PATCH', body: JSON.stringify(body) })
      set.saved(true); setTimeout(() => set.saved(false), 3000)
    } catch (err) {
      set.error(err instanceof Error ? err.message : 'Save failed')
    } finally {
      set.saving(false)
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
        <h2 className="font-heading font-bold text-lg text-brand-navy">ID numbers</h2>
        <p className="text-sm text-muted mt-0.5 max-w-xl">
          Employee numbers and student registration numbers are created by the system and count up on
          their own. Write the layout you want, with zeros where the running number goes. The last run of
          zeros is the running number, and {'{YYYY}'} or {'{YY}'} is replaced by the year, so the count
          starts again at 1 each new year. Only numbers created from now on follow a new layout; existing
          numbers do not change.
        </p>
        {loadError && <p className="text-sm text-tone-coral mt-2" role="alert">{loadError}</p>}
      </div>

      <FormatCard
        title="Employee number"
        description="Used for every new member of staff. For example EMP-{YYYY}-000 gives EMP-2026-001, EMP-2026-002."
        inputId="idn-employee"
        placeholder="EMP-{YYYY}-000"
        value={employeeFormat}
        onChange={setEmployeeFormat}
        onSave={() => save({ employeeNoFormat: employeeFormat.trim() }, { saving: setEmpSaving, saved: setEmpSaved, error: setEmpError })}
        saving={empSaving}
        saved={empSaved}
        error={empError}
      />

      <FormatCard
        title="Student registration number"
        description="Used for every new student. For example SCH-ML-{YYYY}-0000 gives SCH-ML-2026-0001, SCH-ML-2026-0002."
        inputId="idn-student"
        placeholder="SMS-{YYYY}-0000"
        value={studentFormat}
        onChange={setStudentFormat}
        onSave={() => save({ studentRegistrationNoFormat: studentFormat.trim() }, { saving: setStuSaving, saved: setStuSaved, error: setStuError })}
        saving={stuSaving}
        saved={stuSaved}
        error={stuError}
      />
    </div>
  )
}
