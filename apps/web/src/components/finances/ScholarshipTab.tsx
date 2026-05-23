'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getAuth } from 'firebase/auth'
import { useScholarships } from '@/hooks/useFinances'
import { CreateScholarshipSchema } from '@shared/schemas/finance'
import type { CreateScholarshipInput } from '@shared/schemas/finance'
import type { ApiScholarship } from '@shared/types/api'
import { formatMWK } from '@shared/constants/malawi'
import { PlusCircle, GraduationCap, Loader2, X } from 'lucide-react'

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = await getAuth().currentUser?.getIdToken()
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

export function ScholarshipTab({ academicYear }: { academicYear: string }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const { data: scholarships = [], isLoading } = useScholarships()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateScholarshipInput>({
    resolver: zodResolver(CreateScholarshipSchema),
    defaultValues: { academicYear, discountType: 'PERCENTAGE' },
  })

  const { mutate: create, isPending } = useMutation({
    mutationFn: (data: CreateScholarshipInput) =>
      apiFetch<ApiScholarship>('/finances/scholarships', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      reset()
      setShowForm(false)
      void qc.invalidateQueries({ queryKey: ['finances', 'scholarships'] })
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-brand-teal" />
          <h3 className="font-heading font-semibold text-sm text-brand-navy">
            Scholarship & Bursary Registry
          </h3>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 bg-brand-teal text-white px-3 py-2 rounded-lg text-sm font-semibold hover:bg-brand-teal-light transition-colors"
          type="button"
        >
          <PlusCircle className="w-4 h-4" /> Add Scholarship
        </button>
      </div>

      {/* Table */}
      <div className="bg-surface border border-base rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-base bg-page">
              <th className="text-left px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                Name
              </th>
              <th className="text-left px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                Student ID
              </th>
              <th className="text-left px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                Type
              </th>
              <th className="text-right px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                Value
              </th>
              <th className="text-left px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-base">
                  {Array.from({ length: 5 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="skeleton h-4 rounded w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : scholarships.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted">
                  No scholarships registered
                </td>
              </tr>
            ) : (
              scholarships.map((s: ApiScholarship) => (
                <tr key={s.id} className="border-b border-base hover:bg-page">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">
                    {s.studentId.slice(-8)}
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">
                    {s.discountType.replace('_', ' ')}
                  </td>
                  <td className="px-4 py-3 text-right tabular font-semibold text-brand-teal">
                    {s.discountType === 'PERCENTAGE' ? `${s.value}%` : formatMWK(s.value)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${s.isActive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}
                    >
                      {s.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add scholarship modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-heading font-bold text-lg text-brand-navy">Add Scholarship</h3>
              <button
                onClick={() => setShowForm(false)}
                aria-label="Close"
                className="p-1.5 rounded-lg hover:bg-page"
                type="button"
              >
                <X className="w-5 h-5 text-muted" />
              </button>
            </div>

            <form onSubmit={handleSubmit((d) => create(d))} className="space-y-3">
              {[
                {
                  label: 'Scholarship Name',
                  name: 'name',
                  type: 'text',
                  placeholder: 'e.g. Government Bursary',
                },
                {
                  label: 'Student ID',
                  name: 'studentId',
                  type: 'text',
                  placeholder: 'Full student Neon ID',
                },
                {
                  label: 'Academic Year',
                  name: 'academicYear',
                  type: 'text',
                  placeholder: '2025/2026',
                },
              ].map((f) => (
                <div key={f.name}>
                  <label className="block text-sm font-medium mb-1">{f.label}</label>
                  <input
                    {...register(f.name as keyof CreateScholarshipInput)}
                    type={f.type}
                    placeholder={f.placeholder}
                    className="input w-full"
                  />
                  {errors[f.name as keyof CreateScholarshipInput] && (
                    <p className="text-xs text-brand-coral mt-1">
                      {errors[f.name as keyof CreateScholarshipInput]?.message as string}
                    </p>
                  )}
                </div>
              ))}

              <div>
                <label className="block text-sm font-medium mb-1">Discount Type</label>
                <select
                  {...register('discountType')}
                  className="input w-full"
                  aria-label="Discount type"
                >
                  <option value="PERCENTAGE">Percentage (%)</option>
                  <option value="FIXED_AMOUNT">Fixed Amount (MWK)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Value (% or MWK)</label>
                <input
                  {...register('value', { valueAsNumber: true })}
                  type="number"
                  step="0.01"
                  min="0"
                  className="input w-full"
                  placeholder="50 for 50% or 50000 for MWK 50,000"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 border border-base px-4 py-2 rounded-lg text-sm hover:bg-page"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 bg-brand-teal text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Scholarship
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
