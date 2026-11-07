/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/guardians/GuardianStudentPicker.tsx
 * [PHASE]: Guardian Portal — staff UI (T7a)
 * [PURPOSE]: Search-as-you-type student chooser shared by the Student and Access log tabs.
 *   Reuses useStudents (which already waits for 2+ characters) behind a short debounce so a
 *   keystroke does not become a request.
 * [DEPENDS ON]: @/hooks/useStudents
 */
'use client'

import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import { useStudents } from '@/hooks/useStudents'

export interface PickedStudent { id: string; name: string; registrationNo: string }

export function GuardianStudentPicker({ selected, onSelect, onClear, inputId = 'guardian-student-search' }: {
  selected: PickedStudent | null
  onSelect: (s: PickedStudent) => void
  onClear: () => void
  inputId?: string
}) {
  const [text, setText] = useState('')
  const [term, setTerm] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setTerm(text.trim()), 300)
    return () => clearTimeout(t)
  }, [text])

  const search = useStudents({ search: term })
  const students = term.length >= 2 ? (search.data?.students ?? []).slice(0, 8) : []

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-base bg-surface px-4 py-3">
        <div className="min-w-0">
          <p className="font-heading font-semibold text-body truncate">{selected.name}</p>
          <p className="text-sm text-muted">{selected.registrationNo}</p>
        </div>
        <button type="button" onClick={onClear} className="inline-flex items-center gap-1.5 min-h-11 px-3 rounded-xl text-sm font-medium text-muted hover:text-body hover:bg-page">
          <X className="w-4 h-4" aria-hidden />Change
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-xs font-medium text-body">Find a student</label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" aria-hidden />
        <input
          id={inputId} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off"
          placeholder="Name or registration number"
          className="w-full rounded-xl border border-base bg-page pl-9 pr-3 py-2.5 text-sm text-body placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-teal/40 min-h-11"
        />
      </div>
      {term.length >= 2 && search.isLoading && <p className="text-sm text-muted" role="status">Searching…</p>}
      {term.length >= 2 && search.isError && <p className="text-sm text-brand-coral" role="alert">Could not search students. Try again.</p>}
      {term.length >= 2 && !search.isLoading && !search.isError && students.length === 0 && (
        <p className="text-sm text-muted" role="status">No student matches “{term}”.</p>
      )}
      {students.length > 0 && (
        <ul className="rounded-xl border border-base bg-surface divide-y divide-[var(--border-base,rgba(0,0,0,0.08))] overflow-hidden">
          {students.map((s) => (
            <li key={s.id}>
              <button
                type="button" className="w-full text-left px-4 py-3 min-h-11 hover:bg-page"
                onClick={() => onSelect({ id: s.id, name: `${s.firstName} ${s.lastName}`.trim(), registrationNo: s.registrationNo })}
              >
                <span className="block text-sm font-medium text-body">{s.firstName} {s.lastName}</span>
                <span className="block text-xs text-muted">{s.registrationNo}{s.class ? ` · ${s.class.name}` : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
