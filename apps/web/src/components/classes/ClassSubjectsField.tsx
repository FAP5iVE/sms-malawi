/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/classes/ClassSubjectsField.tsx
 * [PURPOSE]: [NEW 2026-09-16 — Class Subject Presets] The "set subjects for
 *   this class" UI — GET/PUT /classes/:id/subjects (classService.
 *   getClassSubjectsMeta/setClassSubjectPresets) via useClassSubjects()/
 *   useSetClassSubjectPresets(). Subjects are chosen from the same
 *   MALAWI_SUBJECTS list TimetableSlotForm.tsx/ExamForm.tsx already draw
 *   from — this is the one place that list actually gets narrowed down
 *   per class; those two forms then read the narrowed list back via the
 *   same useClassSubjects() hook.
 *
 *   Once at least one subject has ever been saved, the list is editable
 *   for SUBJECT_PRESET_LOCK_WINDOW_DAYS (5) days from that first save —
 *   classService enforces this server-side; this component only reflects
 *   the `locked`/`lockedAt` state the API already computed, it does not
 *   recompute the window itself.
 * [DEPENDS ON]: apps/web/src/hooks/useClasses.ts (useClassSubjects,
 *   useSetClassSubjectPresets), @shared/constants/malawi (MALAWI_SUBJECTS)
 */
'use client'

import { useState } from 'react'
import { MALAWI_SUBJECTS } from '@shared/constants/malawi'
import { useClassSubjects, useSetClassSubjectPresets } from '@/hooks/useClasses'
import { Lock, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface Props {
  classId: string
  /** Hide the editing controls and show the saved list only — used where
   *  the viewer holds class.view but not class.manageSubjectPresets. */
  readOnly?: boolean
}

export function ClassSubjectsField({ classId, readOnly = false }: Props) {
  const { data: meta, isLoading } = useClassSubjects(classId)
  const setPresets = useSetClassSubjectPresets()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [touched, setTouched] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted py-3">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading subjects…
      </div>
    )
  }
  if (!meta) return null

  const locked = meta.locked
  // Use the server selection until editing starts, avoiding a synchronous
  // state update in an effect while preserving any unsaved changes.
  const currentSelection = touched ? selected : new Set(meta.subjects)
  const isDirty =
    touched &&
    (currentSelection.size !== meta.subjects.length ||
      meta.subjects.some((s) => !currentSelection.has(s)))

  function toggle(subject: string) {
    if (locked || readOnly) return
    setTouched(true)
    setSaved(false)
    setSelected(() => {
      const next = new Set(currentSelection)
      if (next.has(subject)) next.delete(subject)
      else next.add(subject)
      return next
    })
  }

  function handleSave() {
    setSaveError(null)
    setPresets.mutate(
      { classId, subjects: Array.from(selected) },
      {
        onSuccess: () => {
          setTouched(false)
          setSaved(true)
        },
        onError: (err) =>
          setSaveError(err instanceof Error ? err.message : 'Failed to save subjects.'),
      }
    )
  }

  return (
    <div className="space-y-3">
      {locked ? (
        <p className="flex items-start gap-2 text-xs text-muted bg-page border border-base rounded-xl px-3 py-2.5">
          <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
          Locked since{' '}
          {meta.lockedAt ? new Date(meta.lockedAt).toDateString() : 'the edit window closed'} —
          subjects can no longer be changed for the {meta.academicYear} academic year.
        </p>
      ) : meta.subjectsSetAt ? (
        <p className="flex items-start gap-2 text-xs text-muted bg-page border border-base rounded-xl px-3 py-2.5">
          <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
          Editable until {meta.lockedAt ? new Date(meta.lockedAt).toDateString() : '—'}, then locked
          for the rest of the {meta.academicYear} academic year.
        </p>
      ) : (
        !readOnly && (
          <p className="text-xs text-muted">
            Choose the subjects this class takes. Once saved, you have 5 days to change them — after
            that they are locked for the rest of the {meta.academicYear} academic year.
          </p>
        )
      )}

      {readOnly && meta.subjects.length === 0 ? (
        <p className="text-sm text-muted">No subjects have been set for this class yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {MALAWI_SUBJECTS.map((subject) => {
            const isChecked = currentSelection.has(subject)
            const isOptionLocked = locked || readOnly
            if (readOnly && !isChecked) return null
            return (
              <button
                type="button"
                key={subject}
                onClick={() => toggle(subject)}
                disabled={isOptionLocked}
                aria-pressed={isChecked}
                className={`text-left text-xs px-3 py-2 rounded-lg border transition-colors ${
                  isChecked
                    ? 'bg-brand-teal/10 border-brand-teal text-brand-teal font-medium'
                    : 'bg-surface border-base text-muted'
                } ${isOptionLocked ? 'cursor-default opacity-80' : 'hover:border-brand-teal/60 cursor-pointer'}`}
              >
                {subject}
              </button>
            )
          })}
        </div>
      )}

      {!readOnly && !locked && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || selected.size === 0 || setPresets.isPending}
            className="min-h-10 px-4 rounded-xl bg-brand-teal text-white text-sm font-heading font-semibold hover:bg-brand-teal-light transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {setPresets.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save Subjects
          </button>
          {saved && !isDirty && (
            <span className="flex items-center gap-1 text-xs text-brand-teal">
              <CheckCircle2 className="w-3.5 h-3.5" /> Saved
            </span>
          )}
        </div>
      )}

      {saveError && (
        <p
          role="alert"
          className="flex items-start gap-2 text-xs text-brand-coral bg-brand-coral/8 border border-brand-coral/20 rounded-xl px-3 py-2.5"
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
          {saveError}
        </p>
      )}
    </div>
  )
}
