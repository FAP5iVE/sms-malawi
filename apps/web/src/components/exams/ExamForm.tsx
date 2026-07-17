/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/components/exams/ExamForm.tsx
 * [R-PHASE]: R7 — Academics III: Exam Pipeline Repair & Grading Engine
 *   Unification
 * [PURPOSE]: EXAM_TYPES centralization deferred to R15 — not otherwise
 *   touched by this phase's own change list. Consequential fix: onSubmit()
 *   previously discarded a failed createExam.mutate() silently — no
 *   onError handler existed at all. This phase's examService.ts now
 *   genuinely rejects certain submissions (an END_TERM exam for Form 2/
 *   Form 4's MANEB national term, or a MANEB_JCE/MANEB_MSCE exam type
 *   created through this internal form at all — MANEB results belong in
 *   ManebRecord, never here), so a silent failure would leave the user
 *   with no feedback and an open form that appears to have done nothing.
 *   Added minimal inline error surfacing for exactly this case.
 * [DEPENDS ON]: none
 */
'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreateExamSchema } from '@shared/schemas/exam'
import type { CreateExamInput } from '@shared/schemas/exam'
import { useCreateExam } from '@/hooks/useExams'
import { useClasses } from '@/hooks/useClasses'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, AlertTriangle } from 'lucide-react'
import type { ApiClass } from '@shared/types/api'
import { MALAWI_SUBJECTS } from '@shared/constants/malawi'
import { EXAM_TYPES } from '@shared/constants/exams'

interface Props { onClose: () => void; academicYear: string; term: number }

const ic = 'w-full border border-base rounded-xl px-4 py-3 text-sm bg-surface text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25 focus:border-brand-teal transition-all'

export function ExamForm({ onClose, academicYear, term }: Props) {
  const { data: classesData } = useClasses(academicYear)
  const classes = (classesData ?? []) as ApiClass[]
  const createExam = useCreateExam()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { register, handleSubmit, formState: { errors } } = useForm<CreateExamInput>({
    resolver: zodResolver(CreateExamSchema),
    defaultValues: { academicYear, term, maxMark: 100, weightPercent: 100 },
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
                  {EXAM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Class</label>
                <select {...register('classId')} className={ic} aria-label="Class">
                  <option value="">Select class…</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {errors.classId && <p className="text-xs text-brand-coral mt-1">{errors.classId.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">Subject</label>
                <select {...register('subject')} className={ic} aria-label="Subject">
                  <option value="">Select subject…</option>
                  {MALAWI_SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
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