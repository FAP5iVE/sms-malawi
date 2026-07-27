/**
 * apps/web/src/components/classes/TimetableSlotForm.tsx
 *
 * [CHANGE TYPE]: NEW FILE (production fix, 2026-07-26).
 * [PURPOSE]: The missing "Add Slot" UI for a class timetable. The backend route
 *   POST /classes/:id/timetable (gated admin/high_rank/exam_officer) and
 *   classService.createTimetableSlot() have existed since R6, but no frontend
 *   ever called them — timetable pages only rendered slots via useClassTimetable.
 *   This modal collects a slot and submits it through useCreateTimetableSlot().
 *
 *   teacherUid is a free-text field rather than a staff dropdown on purpose:
 *   the staff directory (GET /hr) is limited to admin/hr/high_rank, so an
 *   exam_officer — a valid slot creator — cannot load a staff list. A text UID
 *   keeps the form usable for every role the backend actually allows.
 *
 *   MANEB-administered slots are rejected server-side (Form 2 Term 3 / Form 4
 *   Term 3 use the MANEB timetable type, not a school-set EXAM slot); those
 *   rejections surface here via the onError message.
 * [DEPENDS ON]: W/hooks/useClasses.ts (useCreateTimetableSlot),
 *   @shared/schemas/student (CreateTimetableSlotSchema),
 *   @shared/constants/malawi (MALAWI_SUBJECTS).
 */
'use client'

import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CreateTimetableSlotSchema } from '@shared/schemas/student'
import type { CreateTimetableSlotInput } from '@shared/schemas/student'
import { MALAWI_SUBJECTS } from '@shared/constants/malawi'
import { useCreateTimetableSlot } from '@/hooks/useClasses'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, AlertTriangle } from 'lucide-react'

// CreateTimetableSlotSchema has a defaulted field (type), so its INPUT type
// differs from its OUTPUT type (CreateTimetableSlotInput). Parameterise useForm
// with both so the resolver and submit handler align (three-generic pattern).
type SlotFormValues = z.input<typeof CreateTimetableSlotSchema>

interface Props {
  classId:      string
  academicYear: string
  term:         number
  onClose:      () => void
}

const DAYS: SlotFormValues['day'][] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']
const TYPES: { value: NonNullable<SlotFormValues['type']>; label: string }[] = [
  { value: 'REGULAR', label: 'Regular' },
  { value: 'EXAM',    label: 'Exam (school-set)' },
  { value: 'LAB',     label: 'Lab' },
  // MANEB is intentionally omitted — MANEB slots are created through the MANEB
  // timetable path, not a school-set slot, and the server rejects them here.
]

const ic =
  'w-full border border-base rounded-xl px-4 py-3 text-sm bg-surface text-body min-h-11 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-teal/25 focus:border-brand-teal transition-all'
const lbl = 'block text-xs font-semibold text-muted uppercase tracking-wider mb-1.5'

export function TimetableSlotForm({ classId, academicYear, term, onClose }: Props) {
  const createSlot = useCreateTimetableSlot()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SlotFormValues, unknown, CreateTimetableSlotInput>({
    resolver: zodResolver(CreateTimetableSlotSchema),
    defaultValues: {
      classId,
      academicYear,
      term,
      type: 'REGULAR',
    },
  })

  function onSubmit(data: CreateTimetableSlotInput) {
    setSubmitError(null)
    // classId/academicYear/term are fixed from the class context; the hook
    // takes classId in the URL and the rest in the body.
    createSlot.mutate(
      { ...data, classId, academicYear, term },
      {
        onSuccess: onClose,
        onError: (err) =>
          setSubmitError(err instanceof Error ? err.message : 'Failed to add timetable slot. Please try again.'),
      },
    )
  }

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <div className="absolute inset-0" onClick={onClose} />
        <motion.div
          className="relative z-10 w-full max-w-md bg-surface rounded-2xl shadow-xl overflow-hidden"
          initial={{ scale: 0.96, y: 12 }}
          animate={{ scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-base">
            <h2 className="font-heading font-bold text-brand-navy">Add Timetable Slot</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-2 hover:bg-page rounded-xl min-h-11 min-w-11 flex items-center justify-center"
            >
              <X className="w-4 h-4 text-muted" />
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="overflow-y-auto max-h-[80vh]">
            <div className="p-6 grid grid-cols-2 gap-4">
              <div className="col-span-full text-xs text-muted -mb-1">
                Term {term} · {academicYear}
              </div>

              <div>
                <label className={lbl} htmlFor="ts-day">Day</label>
                <select id="ts-day" {...register('day')} className={ic} defaultValue="">
                  <option value="" disabled>Select day…</option>
                  {DAYS.map((d) => <option key={d} value={d}>{d.charAt(0) + d.slice(1).toLowerCase()}</option>)}
                </select>
                {errors.day && <p className="text-xs text-brand-coral mt-1" role="alert">{errors.day.message}</p>}
              </div>

              <div>
                <label className={lbl} htmlFor="ts-type">Type</label>
                <select id="ts-type" {...register('type')} className={ic}>
                  {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div>
                <label className={lbl} htmlFor="ts-start">Start time</label>
                <input id="ts-start" type="time" {...register('periodStart')} className={ic} />
                {errors.periodStart && <p className="text-xs text-brand-coral mt-1" role="alert">{errors.periodStart.message}</p>}
              </div>

              <div>
                <label className={lbl} htmlFor="ts-end">End time</label>
                <input id="ts-end" type="time" {...register('periodEnd')} className={ic} />
                {errors.periodEnd && <p className="text-xs text-brand-coral mt-1" role="alert">{errors.periodEnd.message}</p>}
              </div>

              <div className="col-span-full">
                <label className={lbl} htmlFor="ts-subject">Subject</label>
                <select id="ts-subject" {...register('subject')} className={ic} defaultValue="">
                  <option value="" disabled>Select subject…</option>
                  {MALAWI_SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {errors.subject && <p className="text-xs text-brand-coral mt-1" role="alert">{errors.subject.message}</p>}
              </div>

              <div className="col-span-full">
                <label className={lbl} htmlFor="ts-teacher">Teacher staff UID</label>
                <input id="ts-teacher" {...register('teacherUid')} className={ic} placeholder="Teacher's staff account UID" />
                {errors.teacherUid && <p className="text-xs text-brand-coral mt-1" role="alert">{errors.teacherUid.message}</p>}
              </div>

              <div className="col-span-full">
                <label className={lbl} htmlFor="ts-room">Room (optional)</label>
                <input id="ts-room" {...register('room')} className={ic} placeholder="e.g. Lab 2" />
              </div>
            </div>

            {submitError && (
              <p role="alert" className="mx-6 mb-4 flex items-start gap-2 text-xs text-brand-coral bg-brand-coral/8 border border-brand-coral/20 rounded-xl px-4 py-3">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
                {submitError}
              </p>
            )}

            <div className="px-6 py-4 border-t border-base flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-sm border border-base rounded-xl hover:bg-page min-h-11"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createSlot.isPending}
                className="px-5 py-2.5 text-sm bg-brand-teal text-white rounded-xl font-semibold flex items-center gap-2 disabled:opacity-60 hover:bg-brand-teal-light min-h-11"
              >
                {createSlot.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Add Slot
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}