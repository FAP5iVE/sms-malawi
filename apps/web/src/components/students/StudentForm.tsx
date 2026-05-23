'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, User } from 'lucide-react'
import Image from 'next/image'
import { getAuth } from 'firebase/auth'
import { CreateStudentSchema } from '@shared/schemas/student'
import type { CreateStudentInput } from '@shared/schemas/student'
import { MALAWI_DISTRICTS } from '@shared/constants/malawi'
import { useCreateStudent } from '@/hooks/useStudents'

interface StudentFormProps {
  onClose: () => void
  studentId?: string
}

// -- Field helpers -------------------------------------------------------------
function Field({
  label,
  error,
  children,
  className = '',
}: {
  label: string
  error?: string | undefined
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
      {error && <p className="text-xs text-brand-coral mt-1">{error}</p>}
    </div>
  )
}

function FieldSection({ title }: { title: string }) {
  return (
    <div className="col-span-2 pt-2 pb-1">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] font-heading font-bold text-muted uppercase tracking-widest">
          {title}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
    </div>
  )
}

const inputCls =
  'w-full border border-base rounded-lg px-3 py-2.5 text-sm bg-page text-body placeholder:text-muted ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-teal/25 focus:border-brand-teal transition-all'

const COUNTRIES = [
  'Malawian',
  'Zambian',
  'Mozambican',
  'Tanzanian',
  'Zimbabwean',
  'South African',
  'Kenyan',
  'Ugandan',
  'Rwandan',
  'Ethiopian',
  'British',
  'American',
  'Other',
]

export function StudentForm({ onClose, studentId }: StudentFormProps) {
  const isEdit = !!studentId
  const { mutate: createStudent, isPending } = useCreateStudent()

  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateStudentInput>({
    resolver: zodResolver(CreateStudentSchema) as Resolver<CreateStudentInput>,
    defaultValues: { nationality: 'Malawian' } as Partial<CreateStudentInput>,
  })

  async function onSubmit(data: CreateStudentInput) {
    createStudent(data, {
      onSuccess: async (student) => {
        // Upload photo if selected
        if (photoFile && student?.id) {
          const formData = new FormData()
          formData.append('photo', photoFile)
          const token = await getAuth().currentUser?.getIdToken()
          await fetch(`${process.env.NEXT_PUBLIC_API_URL}/students/${student.id}/photo`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          }).catch((e) => console.error('Photo upload failed:', e))
        }
        onClose()
      },
    })
  }

  return (
    <AnimatePresence>
      {/* -- BACKDROP --------------------------------------------------- */}
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Dim backdrop */}
        <div
          className="absolute inset-0 bg-brand-navy/50 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden
        />

        {/* -- DIALOG ---------------------------------------------------- */}
        <motion.div
          className="relative z-10 w-full max-w-2xl bg-surface rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          initial={{ opacity: 0, scale: 0.96, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 12 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        >
          {/* Modal header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-base shrink-0">
            <div>
              <h2 className="font-heading font-bold text-lg text-brand-navy">
                {isEdit ? 'Edit Student' : 'Add New Student'}
              </h2>
              <p className="text-xs text-muted font-sans mt-0.5">
                {isEdit
                  ? 'Update student record details.'
                  : "Fill in the student's details to create a new record."}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-page text-muted hover:text-body transition-colors"
              aria-label="Close dialog"
              type="button"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable form body */}
          <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto">
            {/* Photo upload section */}
            <div className="flex items-center gap-4 px-6 py-4 bg-page border-b border-base">
              <div className="w-16 h-16 rounded-full bg-surface border-2 border-dashed border-base flex items-center justify-center overflow-hidden shrink-0">
                {photoPreview ? (
                  <Image src={photoPreview} alt="Preview" fill className="object-cover" />
                ) : (
                  <User className="w-7 h-7 text-muted" />
                )}
              </div>
              <div>
                <label
                  htmlFor="photo-upload"
                  className="cursor-pointer text-sm font-heading font-semibold text-brand-teal hover:text-brand-teal-light transition-colors"
                >
                  {photoPreview ? 'Change photo' : 'Upload photo'}
                </label>
                <input
                  id="photo-upload"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) {
                      setPhotoFile(f)
                      setPhotoPreview(URL.createObjectURL(f))
                    }
                  }}
                />
                <p className="text-xs text-muted mt-0.5">JPG, PNG or WebP · max 5 MB</p>
              </div>
            </div>

            <div className="px-6 py-5 grid grid-cols-2 gap-x-5 gap-y-4">
              <FieldSection title="Personal Details" />
              <Field label="First Name" error={errors.firstName?.message}>
                <input {...register('firstName')} className={inputCls} placeholder="Given name" />
              </Field>
              <Field label="Last Name" error={errors.lastName?.message}>
                <input {...register('lastName')} className={inputCls} placeholder="Family name" />
              </Field>
              <Field label="Date of Birth" error={errors.dateOfBirth?.message}>
                <input type="date" {...register('dateOfBirth')} className={inputCls} />
              </Field>
              <Field label="Sex" error={errors.sex?.message}>
                <select {...register('sex')} className={inputCls}>
                  <option value="">Select…</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </Field>
              <Field
                label="Nationality"
                error={errors.nationality?.message}
                className="col-span-2 sm:col-span-1"
              >
                <select {...register('nationality')} className={inputCls}>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="District (Malawi)"
                error={errors.district?.message}
                className="col-span-2 sm:col-span-1"
              >
                <select {...register('district')} className={inputCls}>
                  <option value="">Select district…</option>
                  {MALAWI_DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>

              <FieldSection title="Academic Details" />
              <Field label="Form / Class" error={errors.classId?.message}>
                <select {...register('classId')} className={inputCls}>
                  <option value="">Select form…</option>
                  {['Form 1', 'Form 2', 'Form 3', 'Form 4'].map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Academic Status" error={errors.status?.message}>
                <select {...register('status')} className={inputCls}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="suspended">Suspended</option>
                </select>
              </Field>

              <FieldSection title="Contact Details" />
              <Field label="Phone Number" error={errors.phone?.message}>
                <input
                  {...register('phone')}
                  className={inputCls}
                  placeholder="+265 999 000 000"
                  type="tel"
                />
              </Field>
              <Field label="Village" error={errors.village?.message}>
                <input {...register('village')} className={inputCls} placeholder="Home village" />
              </Field>
              <Field label="Address" error={errors.address?.message} className="col-span-2">
                <textarea
                  {...register('address')}
                  className={`${inputCls} resize-none`}
                  rows={2}
                  placeholder="Postal or physical address"
                />
              </Field>
            </div>

            {/* Footer actions — sticky at bottom */}
            <div className="px-6 py-4 border-t border-base bg-surface flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl text-sm font-heading font-semibold text-muted border border-base hover:bg-page transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-6 py-2.5 rounded-xl text-sm font-heading font-semibold bg-brand-navy text-white hover:bg-brand-navy-mid transition-colors flex items-center gap-2 disabled:opacity-60"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Student'}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
