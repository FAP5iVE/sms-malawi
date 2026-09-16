/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/shared/TeacherSelect.tsx
 * [PURPOSE]: [NEW 2026-09-16 — Class Subject Presets / Teacher Roster] A
 *   searchable, name-based staff picker backed by GET /hr/teacher-roster
 *   (useTeacherRoster()) — replaces every free-text "Teacher Firebase UID"
 *   input this codebase had (TimetableSlotForm.tsx's teacherUid field, the
 *   Class form's class-teacher field). Firebase UIDs are long, random,
 *   and impossible for a person to type correctly; this searches by name
 *   or employee number and submits the resolved uid underneath.
 *
 *   The roster itself is already role: 'academic'-filtered server-side
 *   (see hr.ts's GET /hr/teacher-roster), so this component never shows
 *   non-teaching staff — it doesn't need to filter by role again.
 *
 *   disabledUids/disabledReason are optional and only meaningful for the
 *   "class teacher" use (a teacher may head at most one ACTIVE class per
 *   academicYear — classService.assertNotAlreadyClassTeacher enforces this
 *   server-side regardless). Every other caller (timetable slot teacher,
 *   subject-teacher assignment) omits them — those aren't exclusive
 *   assignments, so no options are ever disabled there.
 * [DEPENDS ON]: apps/web/src/hooks/useHR.ts (useTeacherRoster)
 */
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, ChevronDown, Check, AlertTriangle, Loader2 } from 'lucide-react'
import { useTeacherRoster } from '@/hooks/useHR'
import type { ApiStaffProfile } from '@shared/types/api'

export interface TeacherSelectProps {
  id?: string
  value: string | undefined
  onChange: (uid: string) => void
  /** uids to grey out and block selecting — see this file's header note. */
  disabledUids?: Set<string>
  /** Message shown when a greyed-out teacher is clicked. */
  disabledReason?: (teacher: ApiStaffProfile) => string
  placeholder?: string
  className?: string
  'aria-invalid'?: boolean
}

const ic =
  'w-full border border-base rounded-xl px-4 py-3 text-sm bg-surface text-body min-h-11 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-teal/25 focus:border-brand-teal transition-all'

export function TeacherSelect({
  id,
  value,
  onChange,
  disabledUids,
  disabledReason,
  placeholder = 'Search teacher by name or employee no…',
  className,
}: TeacherSelectProps) {
  const { data: teachers, isLoading, isError } = useTeacherRoster()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const selected = useMemo(
    () => (teachers ?? []).find((t) => t.uid === value),
    [teachers, value],
  )

  const filtered = useMemo(() => {
    const list = teachers ?? []
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter((t) =>
      `${t.firstName} ${t.lastName}`.toLowerCase().includes(q) ||
      t.employeeNo.toLowerCase().includes(q) ||
      t.department.toLowerCase().includes(q),
    )
  }, [teachers, query])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function pick(teacher: ApiStaffProfile) {
    if (disabledUids?.has(teacher.uid)) {
      setBlockedMessage(
        disabledReason?.(teacher) ?? `${teacher.firstName} ${teacher.lastName} is already assigned to a class.`,
      )
      return
    }
    setBlockedMessage(null)
    onChange(teacher.uid)
    setQuery('')
    setOpen(false)
  }

  return (
    <div ref={rootRef} className={`relative ${className ?? ''}`}>
      <button
        type="button"
        id={id}
        onClick={() => setOpen((o) => !o)}
        className={`${ic} flex items-center justify-between text-left`}
      >
        <span className={selected ? 'text-body' : 'text-muted'}>
          {selected ? `${selected.firstName} ${selected.lastName} — ${selected.employeeNo}` : placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-muted shrink-0 ml-2" aria-hidden />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full bg-surface border border-base rounded-xl shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-base">
            <Search className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or employee no…"
              className="w-full text-sm bg-transparent focus:outline-none text-body"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {isLoading && (
              <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading teachers…
              </div>
            )}
            {isError && (
              <div className="px-4 py-3 text-sm text-brand-coral">Could not load the teacher list.</div>
            )}
            {!isLoading && !isError && filtered.length === 0 && (
              <div className="px-4 py-3 text-sm text-muted">No teachers match “{query}”.</div>
            )}
            {filtered.map((t) => {
              const isDisabled = disabledUids?.has(t.uid) ?? false
              const isSelected = t.uid === value
              return (
                <button
                  type="button"
                  key={t.uid}
                  onClick={() => pick(t)}
                  aria-disabled={isDisabled}
                  className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm text-left transition-colors ${
                    isDisabled
                      ? 'text-muted/50 cursor-not-allowed bg-page/50'
                      : 'text-body hover:bg-page cursor-pointer'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{t.firstName} {t.lastName}</span>
                    <span className="block text-xs text-muted truncate">{t.employeeNo} · {t.department}</span>
                  </span>
                  <span className="shrink-0 flex items-center gap-1.5">
                    {isDisabled && <span className="text-[10px] uppercase tracking-wide">Assigned</span>}
                    {isSelected && !isDisabled && <Check className="w-4 h-4 text-brand-teal" aria-hidden />}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {blockedMessage && (
        <p role="alert" className="flex items-start gap-1.5 text-xs text-brand-coral mt-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
          {blockedMessage}
        </p>
      )}
    </div>
  )
}
