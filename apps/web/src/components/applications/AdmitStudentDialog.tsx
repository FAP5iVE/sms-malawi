'use client'

/**
 * apps/web/src/components/applications/AdmitStudentDialog.tsx
 *
 * [PURPOSE]: Asks which stream of the applicant's form to admit them to. Lists every live class
 *   of the form they applied for, one row each, with how many students are already in it, and
 *   pre-selects the one with the fewest. A form with one class shows a single confirmed line; a
 *   form with no classes lets the school admit without one and place the student later.
 *   The server also checks that the class is live and in the right form.
 */
import { useMemo, useState } from 'react'
import type { ApiApplication } from '@shared/types/api'
import { Modal, MODAL_BTN_PRIMARY, MODAL_BTN_SECONDARY } from '@/components/shared/Modal'
import { useClasses } from '@/hooks/useClasses'
import { useEffectiveViewingPeriod } from '@/hooks/useViewingPeriod'

interface Props {
  application: ApiApplication
  busy: boolean
  error: string | null
  onClose: () => void
  /** classId is undefined only when the form has no class at all. */
  onConfirm: (classId: string | undefined) => void
}

export function AdmitStudentDialog({ application, busy, error, onClose, onConfirm }: Props) {
  const { academicYear } = useEffectiveViewingPeriod()
  const { data: classes, isLoading } = useClasses(academicYear ?? undefined)
  const form = application.applyingForForm

  const options = useMemo(
    () => (classes ?? [])
      .filter((c) => c.form === form && c.status === 'ACTIVE' && (!academicYear || c.academicYear === academicYear))
      .map((c) => ({ id: c.id, name: c.name, students: c._count?.students ?? 0 })),
    [classes, form, academicYear],
  )
  const fewest = useMemo(
    () => options.reduce<(typeof options)[number] | null>((low, o) => (low === null || o.students < low.students ? o : low), null),
    [options],
  )
  const [picked, setPicked] = useState<string | null>(null)
  const chosen = picked ?? fewest?.id ?? null
  const needsChoice = options.length > 0
  const only = options.length === 1 ? options[0] : undefined
  const name = `${application.firstName} ${application.lastName}`

  return (
    <Modal
      title={`Admit ${name}`}
      description={`Applied for Form ${form}${academicYear ? ` · ${academicYear}` : ''}`}
      onClose={onClose}
      busy={busy}
      size="m"
      onSubmit={(e) => { e.preventDefault(); if (!needsChoice || chosen) onConfirm(chosen ?? undefined) }}
      footer={
        <>
          <button type="button" className={MODAL_BTN_SECONDARY} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={MODAL_BTN_PRIMARY} disabled={busy || isLoading || (needsChoice && !chosen)}>
            {busy ? 'Admitting…' : 'Admit student'}
          </button>
        </>
      }
    >
      {isLoading ? (
        <div className="skeleton h-24 rounded-xl" aria-hidden />
      ) : options.length === 0 ? (
        <p className="text-sm text-body">
          Form {form} has no classes{academicYear ? ` for ${academicYear}` : ''} yet. You can admit {application.firstName} now and
          place them in a class later from their student record.
        </p>
      ) : only ? (
        <p className="text-sm text-body">
          {application.firstName} will join <span className="font-heading font-semibold text-brand-navy">{only.name}</span>
          {' '}({only.students} {only.students === 1 ? 'student' : 'students'} now), the only Form {form} class.
        </p>
      ) : (
        <fieldset className="space-y-2">
          <legend className="text-sm text-body mb-2">Choose the stream for Form {form}. The count is the students already in each.</legend>
          {options.map((o) => {
            const selected = chosen === o.id
            return (
              <label
                key={o.id}
                className={`app-tint rounded-xl px-4 py-3 flex items-center justify-between gap-3 cursor-pointer min-h-[44px] transition-colors hover:bg-surface ${selected ? 'ring-2 ring-inset ring-brand-navy' : ''}`}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="admit-class"
                    value={o.id}
                    checked={selected}
                    onChange={() => setPicked(o.id)}
                    className="accent-brand-navy"
                  />
                  <span className="font-heading font-semibold text-brand-navy">{o.name}</span>
                  {fewest?.id === o.id && <span className="text-xs text-muted">Fewest students</span>}
                </span>
                <span className="text-sm text-muted tabular-nums">{o.students} {o.students === 1 ? 'student' : 'students'}</span>
              </label>
            )
          })}
        </fieldset>
      )}
      {error && <p role="alert" className="mt-3 text-sm text-tone-coral">{error}</p>}
    </Modal>
  )
}
