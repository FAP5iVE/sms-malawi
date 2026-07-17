/**
 * [CHANGE TYPE]: TARGETED EDIT (output in full — header, list, and actions
 *   all change)
 * [FILE]: apps/web/src/app/(auth)/classes/page.tsx
 * [R-PHASE]: R6 — Academics II: Classes, Assignments & the Attendance Rebuild
 * [PURPOSE]:
 *   1. Added an "Add Class" entry point (button + dialog) wired to
 *      useCreateClass() — the hook and backend route were already
 *      correctly built but had zero UI caller.
 *   2. Added Edit/Archive actions per class card, gated by usePermissions()
 *      (class.edit/class.softDelete — admin correctly excluded, high_rank/
 *      lower_rank included, per the real permission matrix).
 *   3. Replaced the hardcoded useClasses('2025/2026') call and the local
 *      [1,2,3,4] Form-number literal with values derived from the live
 *      classes list itself (distinct academicYear/form values actually
 *      present), with a real academic-year selector and a clear empty
 *      state ("No classes found for {year}") instead of a silent blank
 *      list for any other year.
 *   4. Added a "Show archived" toggle — listClasses()'s new
 *      includeArchived parameter (this same phase) would otherwise be a
 *      backend capability with zero UI caller, the exact defect class this
 *      audit repeatedly flags elsewhere.
 * [DEPENDS ON]: apps/web/src/hooks/useClasses.ts (useCreateClass,
 *   useUpdateClass, useArchiveClass), apps/web/src/hooks/usePermissions.ts
 */
'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import type { Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreateClassSchema } from '@shared/schemas/student'
import type { CreateClassInput } from '@shared/schemas/student'
import { useClasses, useCreateClass, useUpdateClass, useArchiveClass } from '@/hooks/useClasses'
import { usePermissions } from '@/hooks/usePermissions'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { PermissionGuard } from '@/components/shared/PermissionGuard'
import { Field, inputCls } from '@/components/students/StudentFormSections'
import { Users, ChevronRight, UserPlus, Pencil, Archive, X, Inbox, ArchiveRestore } from 'lucide-react'

const FORM_COLORS = [
  'bg-blue-50 border-blue-200',
  'bg-teal-50 border-teal-200',
  'bg-purple-50 border-purple-200',
  'bg-amber-50 border-amber-200',
]

export default function ClassesPage() {
  return (
    <RoleGuard
      allowed={['admin', 'high_rank', 'lower_rank', 'academic', 'exam_officer', 'student']}
    >
      <ClassesContent />
    </RoleGuard>
  )
}

function ClassesContent() {
  const [showArchived, setShowArchived] = useState(false)
  const [selectedYear, setSelectedYear] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingClass, setEditingClass] = useState<{ id: string; name: string; form: number; stream?: string; teacherId?: string; room?: string; academicYear: string } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const { data: classes, isLoading } = useClasses(undefined, true)
  const archive = useArchiveClass()
  const { can } = usePermissions()

  // ── Derive available academic years and forms from live data — no
  // hardcoded literal for either. ──────────────────────────────────────────
  const availableYears = useMemo(
    () => Array.from(new Set((classes ?? []).map((c) => c.academicYear))).sort().reverse(),
    [classes]
  )
  const activeYear = selectedYear ?? availableYears[0] ?? null

  const yearClasses = useMemo(
    () => (classes ?? []).filter((c) => {
      if (activeYear && c.academicYear !== activeYear) return false
      if (!showArchived && c.status === 'ARCHIVED') return false
      return true
    }),
    [classes, activeYear, showArchived]
  )

  const forms = useMemo(
    () => Array.from(new Set(yearClasses.map((c) => c.form))).sort((a, b) => a - b),
    [yearClasses]
  )

  function handleArchive(id: string) {
    setActionError(null)
    archive.mutate(id, {
      onError: (err) => setActionError(err instanceof Error ? err.message : 'Failed to archive class.'),
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl font-bold text-brand-navy">Classes</h1>
          <p className="text-sm text-muted mt-0.5">
            {activeYear ? `Academic Year ${activeYear}` : 'No classes yet'}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {availableYears.length > 0 && (
            <select
              value={activeYear ?? ''}
              onChange={(e) => setSelectedYear(e.target.value)}
              className={`${inputCls} w-auto min-w-[140px]`}
              aria-label="Academic year"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          )}

          <label className="flex items-center gap-2 text-sm text-muted min-h-[44px]">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-base"
            />
            Show archived
          </label>

          <PermissionGuard permission="class.create">
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 min-h-[44px] px-5 rounded-xl text-sm font-heading font-semibold bg-brand-teal text-white hover:bg-brand-teal/90 transition-colors"
            >
              <UserPlus className="w-4 h-4" aria-hidden />
              Add Class
            </button>
          </PermissionGuard>
        </div>
      </div>

      {actionError && (
        <p role="alert" className="text-sm text-brand-coral bg-brand-coral/8 border border-brand-coral/20 rounded-xl px-4 py-3">
          {actionError}
        </p>
      )}

      {!isLoading && yearClasses.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center bg-surface border border-base rounded-xl">
          <Inbox className="w-8 h-8 text-muted" aria-hidden />
          <div>
            <p className="font-heading font-semibold text-body">
              {activeYear ? `No classes found for ${activeYear}` : 'No classes found'}
            </p>
            <p className="text-sm text-muted mt-1">
              {showArchived ? 'Try a different academic year.' : 'Try showing archived classes, or a different academic year.'}
            </p>
          </div>
        </div>
      ) : (
        forms.map((form) => {
          const formClasses = yearClasses.filter((c) => c.form === form)
          return (
            <div key={form}>
              <h2 className="font-heading font-semibold text-sm text-brand-navy mb-3">Form {form}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {isLoading
                  ? Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="skeleton h-28 rounded-xl" />
                    ))
                  : formClasses.map((cls) => (
                      <div
                        key={cls.id}
                        className={`border rounded-xl p-4 flex flex-col gap-3 hover:shadow-md transition-all relative ${FORM_COLORS[(form - 1) % 4]} ${cls.status === 'ARCHIVED' ? 'opacity-60' : ''}`}
                      >
                        <Link href={`/classes/${cls.id}`} className="flex items-start justify-between">
                          <div>
                            <p className="font-heading font-bold text-brand-navy">
                              {cls.name}
                              {cls.status === 'ARCHIVED' && (
                                <span className="ml-2 text-[10px] font-sans font-normal text-muted uppercase tracking-wide">
                                  Archived
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-muted mt-0.5">
                              {cls.room ?? 'No room assigned'}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted mt-0.5" aria-hidden />
                        </Link>
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5 text-sm text-muted">
                            <Users className="w-3.5 h-3.5" aria-hidden />
                            {cls._count?.students ?? 0} students
                          </span>
                          {(can('class.edit') || can('class.softDelete')) && (
                            <div className="flex items-center gap-1">
                              {can('class.edit') && (
                                <button
                                  type="button"
                                  onClick={() => setEditingClass(cls)}
                                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-muted hover:bg-white/60 hover:text-body transition-colors"
                                  aria-label={`Edit ${cls.name}`}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {can('class.softDelete') && (
                                <button
                                  type="button"
                                  onClick={() => handleArchive(cls.id)}
                                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-muted hover:bg-white/60 hover:text-brand-coral transition-colors"
                                  aria-label={cls.status === 'ARCHIVED' ? `Restore ${cls.name}` : `Archive ${cls.name}`}
                                >
                                  {cls.status === 'ARCHIVED' ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
              </div>
            </div>
          )
        })
      )}

      {showAddForm && (
        <ClassFormDialog onClose={() => setShowAddForm(false)} />
      )}
      {editingClass && (
        <ClassFormDialog classToEdit={editingClass} onClose={() => setEditingClass(null)} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASS FORM DIALOG — shared create/edit dialog
// ─────────────────────────────────────────────────────────────────────────────

interface ClassFormDialogProps {
  onClose: () => void
  classToEdit?: { id: string; name: string; form: number; stream?: string; teacherId?: string; room?: string; academicYear: string } | null
}

function ClassFormDialog({ onClose, classToEdit }: ClassFormDialogProps) {
  const isEdit = !!classToEdit
  const { mutate: createClass, isPending: isCreating } = useCreateClass()
  const { mutate: updateClass, isPending: isUpdating } = useUpdateClass()
  const isPending = isCreating || isUpdating
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateClassInput>({
    resolver: zodResolver(CreateClassSchema) as Resolver<CreateClassInput>,
    defaultValues: classToEdit
      ? {
          name: classToEdit.name,
          form: classToEdit.form,
          stream: classToEdit.stream,
          teacherId: classToEdit.teacherId,
          room: classToEdit.room,
          academicYear: classToEdit.academicYear,
        }
      : undefined,
  })

  function onSubmit(data: CreateClassInput) {
    setSubmitError(null)
    if (isEdit) {
      updateClass(
        { id: classToEdit!.id, ...data },
        {
          onSuccess: () => onClose(),
          onError: (err) => setSubmitError(err instanceof Error ? err.message : 'Failed to save changes.'),
        }
      )
    } else {
      createClass(data, {
        onSuccess: () => onClose(),
        onError: (err) => setSubmitError(err instanceof Error ? err.message : 'Failed to create class.'),
      })
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-brand-navy/50 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        className="relative z-10 w-full max-w-md bg-surface rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]"
        role="dialog"
        aria-label={isEdit ? 'Edit class' : 'Add new class'}
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-base shrink-0">
          <h2 className="font-heading font-bold text-lg text-brand-navy">
            {isEdit ? 'Edit Class' : 'Add New Class'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-page text-muted hover:text-body transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto flex flex-col">
          <div className="flex flex-col gap-4 px-6 py-5">
            <Field label="Class Name" error={errors.name?.message} required>
              <input type="text" {...register('name')} placeholder="e.g. Form 1A" className={inputCls} />
            </Field>
            <Field label="Form" error={errors.form?.message} required>
              <select {...register('form', { valueAsNumber: true })} className={inputCls}>
                {[1, 2, 3, 4].map((f) => (
                  <option key={f} value={f}>Form {f}</option>
                ))}
              </select>
            </Field>
            <Field label="Stream" error={errors.stream?.message}>
              <input type="text" {...register('stream')} placeholder="e.g. Science (optional)" className={inputCls} />
            </Field>
            <Field label="Room" error={errors.room?.message}>
              <input type="text" {...register('room')} placeholder="e.g. Room 12 (optional)" className={inputCls} />
            </Field>
            <Field label="Teacher Firebase UID" error={errors.teacherId?.message}>
              <input type="text" {...register('teacherId')} placeholder="Optional" className={inputCls} />
            </Field>
            <Field label="Academic Year" error={errors.academicYear?.message} required>
              <input type="text" {...register('academicYear')} placeholder="2025/2026" className={inputCls} />
            </Field>

            {submitError && (
              <p role="alert" className="text-xs text-brand-coral bg-brand-coral/8 border border-brand-coral/20 rounded-xl px-4 py-3">
                {submitError}
              </p>
            )}
          </div>

          <div className="shrink-0 px-6 py-4 border-t border-base bg-surface flex justify-end gap-3 mt-auto">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 rounded-xl text-sm font-heading font-semibold text-muted hover:bg-page transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="min-h-[44px] px-5 rounded-xl bg-brand-teal text-white font-heading font-semibold text-sm hover:bg-brand-teal-light transition-colors disabled:opacity-60"
            >
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Class'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
