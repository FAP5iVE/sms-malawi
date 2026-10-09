/**
 * [CHANGE TYPE]: MAJOR REWRITE (adds assignment-scoped class/subject pickers
 *   and exam-type filtering; the field layout, validation, and error
 *   surfacing are otherwise unchanged from the R7 version).
 * [FILE]: apps/web/src/components/exams/ExamForm.tsx
 * [MAINT 2026-08 — Exam Module P1: Teacher scoping (AC-4)]:
 *   A teacher (academic) may schedule an exam only for a (class, subject)
 *   they are assigned to. The class dropdown is now limited to the teacher's
 *   assigned classes and the subject dropdown to the subjects they teach in
 *   the selected class (via useMySubjectAssignments → GET /classes/subject-
 *   assignments/mine). Oversight roles (admin/high_rank/exam_officer) still
 *   see every class and subject. The Type dropdown no longer offers the two
 *   MANEB_* values (never schedulable internally — they route to the MANEB
 *   panel) and hides END_TERM when the chosen class+term is a national MANEB
 *   sitting (isManebNationalTerm) — mirroring examService.createExam()'s own
 *   server-side guards so the form never offers a submission the API rejects.
 * [MAINT 2026-09-16 — Class Subject Presets]: Once a class is selected, the
 *   Subject dropdown is narrowed to that class's preset subjects
 *   (useClassSubjects(selectedClassId) — classService.
 *   assertSubjectOfferedByClass is the server-side twin of this
 *   restriction, and now applies to every role, not just teachers). A
 *   subject outside the preset renders as a disabled <option> ("not
 *   offered by this class") rather than being hidden outright, so it's
 *   visible what's excluded — unless the class has no presets configured
 *   yet, in which case every subject stays selectable (the same
 *   transition-bridge state the backend allows). For a teacher this
 *   narrows their own assigned-subjects list further still; in practice
 *   the two should already agree, since createSubjectAssignment also
 *   validates against the class's presets.
 * [DEPENDS ON]: @/hooks/useClasses (useMySubjectAssignments,
 *   useClassSubjects), @/store/authStore,
 *   @shared/constants/malawi (MALAWI_SUBJECTS, isManebNationalTerm)
 */
'use client'
import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreateExamSchema } from '@shared/schemas/exam'
import type { CreateExamInput } from '@shared/schemas/exam'
import { useCreateExam } from '@/hooks/useExams'
import { useClasses, useMySubjectAssignments, useClassSubjects } from '@/hooks/useClasses'
import { useAuthStore } from '@/store/authStore'
import { Loader2, AlertTriangle } from 'lucide-react'
import type { ApiClass } from '@shared/types/api'
import { MALAWI_SUBJECTS, isManebNationalTerm } from '@shared/constants/malawi'
import { EXAM_TYPES } from '@shared/constants/exams'
import { Modal, MODAL_BTN_PRIMARY, MODAL_BTN_SECONDARY } from '@/components/shared/Modal'

// CreateExamSchema has defaulted fields (maxMark, weightPercent), so its INPUT
// type (form values — those fields optional) differs from its OUTPUT type
// (CreateExamInput — required). useForm is parameterised with both so the
// resolver and the transformed submit handler line up, avoiding the
// "two different Resolver types" mismatch.
type ExamFormValues = z.input<typeof CreateExamSchema>

interface Props { onClose: () => void; academicYear: string; term: number }

const ic = 'w-full border border-base rounded-xl px-4 py-3 text-sm bg-surface text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25 focus:border-brand-teal transition-all'

export function ExamForm({ onClose, academicYear, term }: Props) {
  const { role } = useAuthStore()
  const isTeacher = role === 'academic'

  const { data: classesData } = useClasses(academicYear)
  const classes = (classesData ?? []) as ApiClass[]
  const { data: assignmentsData } = useMySubjectAssignments(isTeacher ? academicYear : undefined)
  const assignments = assignmentsData ?? []

  const createExam = useCreateExam()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { register, handleSubmit, watch, formState: { errors } } = useForm<ExamFormValues, unknown, CreateExamInput>({
    resolver: zodResolver(CreateExamSchema),
    defaultValues: { academicYear, term, maxMark: 100, weightPercent: 100 },
  })

  const selectedClassId = watch('classId')
  const { data: subjectsMeta } = useClassSubjects(selectedClassId || undefined)

  // AC-4: teachers pick only from their assigned classes/subjects.
  const assignedClassIds = new Set(assignments.map((a) => a.classId))
  const subjectsByClass = assignments.reduce<Record<string, string[]>>((acc, a) => {
    ;(acc[a.classId] ??= []).push(a.subject)
    return acc
  }, {})

  const availableClasses = isTeacher ? classes.filter((c) => assignedClassIds.has(c.id)) : classes
  const availableSubjects: readonly string[] = isTeacher
    ? (selectedClassId ? (subjectsByClass[selectedClassId] ?? []) : [])
    : MALAWI_SUBJECTS

  // [NEW 2026-09-16 — Class Subject Presets] Once the class has preset
  // subjects configured, only those are selectable — everyone else in
  // availableSubjects renders disabled, not hidden, so the exclusion is
  // visible rather than a silent gap.
  const presetSubjects = subjectsMeta?.subjects ?? []
  const hasPresets = presetSubjects.length > 0

  // Never offer a MANEB_* type through the internal scheduler; hide END_TERM
  // when the chosen class+term is a national MANEB sitting.
  const selectedClass = classes.find((c) => c.id === selectedClassId)
  const manebSlot = selectedClass ? isManebNationalTerm(selectedClass.form, term) : false
  const availableTypes = EXAM_TYPES.filter((t) => {
    if (t.value === 'MANEB_JCE' || t.value === 'MANEB_MSCE') return false
    if (manebSlot && t.value === 'END_TERM') return false
    return true
  })

  function onSubmit(data: CreateExamInput) {
    setSubmitError(null)
    createExam.mutate(data, {
      onSuccess: onClose,
      onError: (err) => {
        setSubmitError(err instanceof Error ? err.message : 'Failed to schedule exam. Please try again.')
      },
    })
  }

  // [PRODUCTION FIX] Portals directly under <body> — same reasoning as
  // AnnouncementForm.tsx/StaffForm.tsx/StudentForm.tsx.
  if (typeof document === 'undefined') return null

  return (
    <Modal
      title="Schedule Exam"
      onClose={onClose}
      size="lg"
      onSubmit={handleSubmit(onSubmit)}
      busy={createExam.isPending}
      footer={
        <>
          <button type="button" onClick={onClose} className={MODAL_BTN_SECONDARY}>Cancel</button>
          <button type="submit" disabled={createExam.isPending}
            className={MODAL_BTN_PRIMARY}>
            {createExam.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Schedule Exam
          </button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-full">
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Title</label>
          <input {...register('title')} className={ic} placeholder="e.g. Week 3 Biology Test" />
          {errors.title && <p className="text-xs text-brand-coral mt-1">{errors.title.message}</p>}
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Type</label>
          <select {...register('type')} className={ic} aria-label="Exam type">
            {availableTypes.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Class</label>
          <select {...register('classId')} className={ic} aria-label="Class">
            <option value="">Select class\u2026</option>
            {availableClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {errors.classId && <p className="text-xs text-brand-coral mt-1">{errors.classId.message}</p>}
          {isTeacher && availableClasses.length === 0 && (
            <p className="text-xs text-muted mt-1">You have no subject assignments for {academicYear}.</p>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Subject</label>
          <select {...register('subject')} className={ic} aria-label="Subject" disabled={isTeacher && !selectedClassId}>
            <option value="">{isTeacher && !selectedClassId ? 'Select a class first\u2026' : 'Select subject\u2026'}</option>
            {availableSubjects.map((s) => {
              const notOffered = hasPresets && !presetSubjects.includes(s)
              return (
                <option key={s} value={s} disabled={notOffered}>
                  {s}{notOffered ? ' (not offered by this class)' : ''}
                </option>
              )
            })}
          </select>
          {errors.subject && <p className="text-xs text-brand-coral mt-1">{errors.subject.message}</p>}
          {selectedClassId && !hasPresets && (
            <p className="text-xs text-muted mt-1">
              This class has no preset subjects yet — every subject is selectable until they are set.
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Date</label>
          <input type="date" {...register('date')} className={ic} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Start Time</label>
          <input type="time" {...register('timeStart')} className={ic} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">End Time</label>
          <input type="time" {...register('timeEnd')} className={ic} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Venue</label>
          <input {...register('venue')} className={ic} placeholder="e.g. Room 12" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Max Mark</label>
          <input type="number" {...register('maxMark', { valueAsNumber: true })} className={ic} min={1} max={1000} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Weight (% of term)</label>
          <input type="number" {...register('weightPercent', { valueAsNumber: true })} className={ic} min={1} max={100} />
        </div>
      </div>
      {submitError && (
        <p role="alert" className="mt-4 flex items-start gap-2 text-xs text-brand-coral bg-brand-coral/8 border border-brand-coral/20 rounded-xl px-4 py-3">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
          {submitError}
        </p>
      )}
    </Modal>
  )
}