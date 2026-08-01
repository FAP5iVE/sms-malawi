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
 * [DEPENDS ON]: @/hooks/useClasses (useMySubjectAssignments), @/store/authStore,
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
import { useClasses, useMySubjectAssignments } from '@/hooks/useClasses'
import { useAuthStore } from '@/store/authStore'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, AlertTriangle } from 'lucide-react'
import type { ApiClass } from '@shared/types/api'
import { MALAWI_SUBJECTS, isManebNationalTerm } from '@shared/constants/malawi'
import { EXAM_TYPES } from '@shared/constants/exams'

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

  return (
    <AnimatePresence>
      <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        <div className="absolute inset-0" onClick={onClose} />
        <motion.div className="relative z-10 w-full max-w-lg bg-surface rounded-2xl shadow-xl overflow-hidden"
          initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-base">
            <h2 className="font-heading font-bold text-brand-navy">Schedule Exam</h2>
            <button type="button" onClick={onClose} aria-label="Close" className="p-2 hover:bg-page rounded-xl">
              <X className="w-4 h-4 text-muted" />
            </button>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="overflow-y-auto max-h-[80vh]">
            <div className="p-6 grid grid-cols-2 gap-4">
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
                  {availableSubjects.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {errors.subject && <p className="text-xs text-brand-coral mt-1">{errors.subject.message}</p>}
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
              <p role="alert" className="mx-6 mb-4 flex items-start gap-2 text-xs text-brand-coral bg-brand-coral/8 border border-brand-coral/20 rounded-xl px-4 py-3">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
                {submitError}
              </p>
            )}
            <div className="px-6 py-4 border-t border-base flex justify-end gap-3">
              <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm border border-base rounded-xl hover:bg-page">Cancel</button>
              <button type="submit" disabled={createExam.isPending}
                className="px-5 py-2.5 text-sm bg-brand-teal text-white rounded-xl font-semibold flex items-center gap-2 disabled:opacity-60 hover:bg-brand-teal-light">
                {createExam.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Schedule Exam
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}