'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2 } from 'lucide-react'
import { CreateStudentSchema } from '@shared/schemas/student'
import type { CreateStudentInput } from '@shared/schemas/student'
import { MALAWI_DISTRICTS, MALAWI_SUBJECTS } from '@shared/constants/malawi'
import { useCreateStudent } from '@/hooks/useStudents'

interface StudentFormProps {
  onClose: () => void
  studentId?: string // pass to edit existing student
}

export function StudentForm({ onClose, studentId }: StudentFormProps) {
  const isEdit = !!studentId
  const { mutate: createStudent, isPending } = useCreateStudent()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateStudentInput>({
    resolver: zodResolver(CreateStudentSchema),
    defaultValues: { nationality: 'Malawian' },
  })

  function onSubmit(data: CreateStudentInput) {
    createStudent(data, {
      onSuccess: () => onClose(),
    })
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex">
        {/* Backdrop */}
        <motion.div
          className="flex-1 bg-black/40"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />
        {/* Panel */}
        <motion.aside
          className="w-full max-w-lg bg-surface h-full overflow-y-auto flex flex-col shadow-xl"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'tween', duration: 0.25 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-base">
            <h2 className="font-heading font-bold text-lg text-brand-navy">
              {isEdit ? 'Edit Student' : 'Add New Student'}
            </h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-page">
              <X className="w-5 h-5 text-muted" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="flex-1 p-6 space-y-5">
            <FieldGroup label="Personal Details">
              <Field label="First Name" error={errors.firstName?.message}>
                <input {...register('firstName')} className="input" placeholder="Given name" />
              </Field>
              <Field label="Last Name" error={errors.lastName?.message}>
                <input {...register('lastName')} className="input" placeholder="Family name" />
              </Field>
              <Field label="Date of Birth" error={errors.dateOfBirth?.message}>
                <input type="date" {...register('dateOfBirth')} className="input" />
              </Field>
              <Field label="Sex" error={errors.sex?.message}>
                <select {...register('sex')} className="input">
                  <option value="">Select sex</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
              </Field>
            </FieldGroup>

            <FieldGroup label="Location">
              <Field label="District" error={errors.district?.message}>
                <select {...register('district')} className="input">
                  <option value="">Select district</option>
                  {MALAWI_DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Village" error={errors.village?.message}>
                <input {...register('village')} className="input" placeholder="Optional" />
              </Field>
              <Field label="Phone" error={errors.phone?.message}>
                <input {...register('phone')} className="input" placeholder="+265 ..." />
              </Field>
            </FieldGroup>

            <FieldGroup label="Guardian Information">
              <Field label="Guardian Name" error={errors.guardianName?.message}>
                <input {...register('guardianName')} className="input" />
              </Field>
              <Field label="Guardian Phone" error={errors.guardianPhone?.message}>
                <input {...register('guardianPhone')} className="input" placeholder="+265 ..." />
              </Field>
              <Field label="Relationship" error={errors.guardianRelation?.message}>
                <select {...register('guardianRelation')} className="input">
                  <option value="">Select relationship</option>
                  {['Parent', 'Guardian', 'Sibling', 'Uncle', 'Aunt', 'Grandparent', 'Other'].map(
                    (r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    )
                  )}
                </select>
              </Field>
            </FieldGroup>

            {/* Submit */}
            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-brand-teal text-white py-2.5 rounded-xl font-heading font-semibold flex items-center justify-center gap-2 hover:bg-brand-teal-light transition-colors disabled:opacity-60"
            >
              {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Student'}
            </button>
          </form>
        </motion.aside>
      </div>
    </AnimatePresence>
  )
}

// ─── SMALL HELPERS ────────────────────────────────────────
function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-heading font-semibold text-xs uppercase tracking-wide text-muted mb-3">
        {label}
      </p>
      <div className="space-y-3">{children}</div>
    </div>
  )
}
function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-body mb-1.5">{label}</label>
      {children}
      {error && <p className="text-xs text-brand-coral mt-1">{error}</p>}
    </div>
  )
}
