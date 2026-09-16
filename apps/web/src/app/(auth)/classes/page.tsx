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
 *
 * [CHANGE TYPE]: TARGETED EDIT (production fix, 2026-08-27).
 * [PURPOSE]: The Add/Edit Class dialog's "Academic Year" field was a
 *   free-text `<input placeholder="2025/2026">` — nothing stopped a typo'd
 *   format ("2025-2026", "25/26") from being submitted, which would then
 *   fail every downstream parseAcademicYear() call that expects the exact
 *   "YYYY/YYYY" shape. Replaced with the shared <AcademicYearSelect>
 *   (apps/web/src/components/shared/AcademicYearSelect.tsx) — the same
 *   fix already applied to apply/page.tsx's Academic Year field. `watch`
 *   added to the form-hook destructure so the select's out-of-window
 *   safety net can see the field's current value when editing an existing
 *   class from a prior academic year.
 * [DEPENDS ON]: apps/web/src/components/shared/AcademicYearSelect.tsx (new)
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
import { AcademicYearSelect } from '@/components/shared/AcademicYearSelect'
import { TeacherSelect } from '@/components/shared/TeacherSelect'
import { ClassSubjectsField } from '@/components/classes/ClassSubjectsField'
import ConfirmDialog from '@/components/shared/ConfirmDialog'
import type { ApiClass } from '@shared/types/api'
import { Users, ChevronRight, UserPlus, Pencil, Archive, X, Inbox, ArchiveRestore, GraduationCap } from 'lucide-react'

// [BUGFIX 2026-09-16] These were bg-*-50/border-*-200 — at that lightness
// the tint reads as barely-there/washed-out against the page background
// ("too faded, too muted"). One step darker on both background and border
// keeps the same four-color rotation and stays legible against the black
// class-teacher/student-count text added below, without going as bold as a
// solid fill.
const FORM_COLORS = [
  'bg-blue-100 border-blue-300',
  'bg-teal-100 border-teal-300',
  'bg-purple-100 border-purple-300',
  'bg-amber-100 border-amber-300',
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
  // [R15 fix] Archiving a class has no confirmation step at all — unlike
  // students' bulk-archive path, which routes through ConfirmDialog. A class
  // affects every enrolled student's roster/timetable/attendance history, so
  // this needed protection at least as strong as the student path, not less.
  // Restoring an already-archived class is left unconfirmed (non-destructive,
  // fully reversible) — only the archive direction is gated.
  const [pendingArchiveClass, setPendingArchiveClass] = useState<{ id: string; name: string } | null>(null)
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
                            <p className="flex items-center gap-1 text-xs text-muted mt-0.5">
                              <GraduationCap className="w-3 h-3 shrink-0" aria-hidden />
                              {cls.teacherName ?? 'No class teacher assigned'}
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
                                  onClick={() =>
                                    cls.status === 'ARCHIVED'
                                      ? handleArchive(cls.id)
                                      : setPendingArchiveClass({ id: cls.id, name: cls.name })
                                  }
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
        <ClassFormDialog
          classes={classes ?? []}
          activeYear={activeYear}
          onClose={() => setShowAddForm(false)}
          onCreated={(cls) => {
            setShowAddForm(false)
            // Straight into edit mode for the class just created — this is
            // the "when creating a class ... there should be the option to
            // set subjects for that class" flow: subjects/teacher can only
            // be set once the class has an id (PUT /classes/:id/subjects),
            // so the fastest path from "create" to "set subjects" is
            // reopening this same dialog already scoped to the new class.
            setEditingClass({
              id: cls.id, name: cls.name, form: cls.form, stream: cls.stream,
              teacherId: cls.teacherId, room: cls.room, academicYear: cls.academicYear,
            })
          }}
        />
      )}
      {editingClass && (
        <ClassFormDialog
          classes={classes ?? []}
          activeYear={activeYear}
          classToEdit={editingClass}
          onClose={() => setEditingClass(null)}
        />
      )}

      <ConfirmDialog
        open={pendingArchiveClass !== null}
        title={`Archive ${pendingArchiveClass?.name ?? 'this class'}?`}
        description="This will affect every enrolled student's roster, timetable, and attendance history for this class. Records are preserved and can be restored by an administrator."
        confirmLabel="Archive Class"
        destructive
        onConfirm={() => {
          if (pendingArchiveClass) handleArchive(pendingArchiveClass.id)
          setPendingArchiveClass(null)
        }}
        onCancel={() => setPendingArchiveClass(null)}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASS FORM DIALOG — shared create/edit dialog
// ─────────────────────────────────────────────────────────────────────────────

interface ClassFormDialogProps {
  onClose: () => void
  classToEdit?: { id: string; name: string; form: number; stream?: string; teacherId?: string; room?: string; academicYear: string } | null
  /** Live classes list — used to grey out staff who already head another
   *  ACTIVE class this academic year (server also enforces this; see
   *  classService.assertNotAlreadyClassTeacher). */
  classes: ApiClass[]
  activeYear: string | null
  /** Fired instead of onClose on a successful create, so the caller can
   *  transition straight into editing the new class (see the "set
   *  subjects right after creating" flow above this component). */
  onCreated?: (cls: ApiClass) => void
}

function ClassFormDialog({ onClose, classToEdit, classes, activeYear, onCreated }: ClassFormDialogProps) {
  const isEdit = !!classToEdit
  const { mutate: createClass, isPending: isCreating } = useCreateClass()
  const { mutate: updateClass, isPending: isUpdating } = useUpdateClass()
  const isPending = isCreating || isUpdating
  const [submitError, setSubmitError] = useState<string | null>(null)
  const { can } = usePermissions()
  const canAssignTeacher = can('class.assignTeacher')
  const canManageSubjects = can('class.manageSubjectPresets')

  const {
    register,
    handleSubmit,
    watch,
    setValue,
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
      : { academicYear: activeYear ?? undefined },
  })

  const formYear = watch('academicYear')
  // A staff member may head at most one ACTIVE class per academicYear —
  // classService.assertNotAlreadyClassTeacher's client-side mirror. Only
  // classes in the same target year count, and the class being edited
  // never disables its own current teacher.
  const disabledTeacherUids = new Set(
    classes
      .filter((c) => c.status === 'ACTIVE' && c.teacherId && c.academicYear === formYear && c.id !== classToEdit?.id)
      .map((c) => c.teacherId!),
  )

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
        onSuccess: (cls) => (onCreated ? onCreated(cls) : onClose()),
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
            {/* [BUGFIX 2026-09-16] Was a free-text "Teacher Firebase UID"
                input — replaced with a searchable, name-based staff picker
                (GET /hr/teacher-roster, academic staff only). Only shown to
                roles that actually hold class.assignTeacher (high_rank) —
                classService enforces the same boundary server-side, so
                showing this to lower_rank would only produce a confusing
                403 on save. */}
            {canAssignTeacher ? (
              <Field label="Class Teacher" error={errors.teacherId?.message}>
                <TeacherSelect
                  value={watch('teacherId')}
                  onChange={(uid) => setValue('teacherId', uid, { shouldValidate: true, shouldDirty: true })}
                  disabledUids={disabledTeacherUids}
                  disabledReason={(t) => `${t.firstName} ${t.lastName} is already the class teacher of another class for ${formYear}.`}
                  placeholder="Optional — search teacher…"
                />
              </Field>
            ) : (
              <p className="text-xs text-muted -mt-1">
                Only a high-ranking staff member can assign a class teacher.
              </p>
            )}
            <Field label="Academic Year" error={errors.academicYear?.message} required>
              <AcademicYearSelect
                value={watch('academicYear')}
                {...register('academicYear')}
                className={inputCls}
              />
            </Field>

            {submitError && (
              <p role="alert" className="text-xs text-brand-coral bg-brand-coral/8 border border-brand-coral/20 rounded-xl px-4 py-3">
                {submitError}
              </p>
            )}

            {/* Subjects can only be set once the class has an id — new
                classes are routed straight into edit mode after creation
                (see onCreated above) specifically so this section is
                reachable in the same flow. */}
            {isEdit && (
              <div className="pt-2 border-t border-base">
                <p className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                  Subjects Taken by This Class
                </p>
                <ClassSubjectsField classId={classToEdit!.id} readOnly={!canManageSubjects} />
              </div>
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