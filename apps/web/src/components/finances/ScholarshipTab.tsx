/**
 * [CHANGE TYPE]: TARGETED EDIT
 * [FILE]: apps/web/src/components/finances/ScholarshipTab.tsx
 * [R-PHASE]: R9 — Finance I: Invoicing, Fees & the Accounting Ledger
 *   Reconnection (previously R1 — API Client & Query-Key Singleton
 *   Consolidation)
 * [PURPOSE]:
 *   1. "Student ID" column now shows the joined student name
 *      (s.student.firstName/lastName, added to ApiScholarship this phase)
 *      instead of `s.studentId.slice(-8)`.
 *   2. The free-text "Full student Neon ID" input is replaced with a
 *      searchable student picker (autocomplete against the existing
 *      GET /students?search= endpoint via useStudents()'s new `search`
 *      param) — staff no longer need to already know a student's raw
 *      database ID to award a scholarship.
 * [DEPENDS ON]: W/lib/api-client.ts, W/hooks/useFinances.ts,
 *   W/hooks/useStudents.ts (search param, added this phase)
 *
 * [CHANGE TYPE]: TARGETED EDIT (production fix, 2026-08-27).
 * [PURPOSE]: The Academic Year field was a free-text `<input
 *   placeholder="2025/2026">` — a typo'd format here would break
 *   parseAcademicYear() wherever this scholarship's academicYear is later
 *   read. Replaced with the shared <AcademicYearSelect> (apps/web/src/
 *   components/shared/AcademicYearSelect.tsx). `value={watch(
 *   'academicYear')}` is passed alongside the register spread so the
 *   select's out-of-window safety net can see the incoming `academicYear`
 *   prop's value (from the parent finances/page.tsx tab), in case it ever
 *   falls outside the computed default window.
 * [DEPENDS ON (added)]: apps/web/src/components/shared/AcademicYearSelect.tsx (new)
 */
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useScholarships } from '@/hooks/useFinances'
import { useStudents } from '@/hooks/useStudents'
import { CreateScholarshipSchema } from '@shared/schemas/finance'
import type { CreateScholarshipInput } from '@shared/schemas/finance'
import type { ApiScholarship, ApiStudent } from '@shared/types/api'
import { formatMWK } from '@shared/constants/malawi'
import { AcademicYearSelect } from '@/components/shared/AcademicYearSelect'
import { PlusCircle, GraduationCap, Loader2, X, Search } from 'lucide-react'
import { apiFetch, queryKeys } from '@/lib/api-client'

function scholarshipStudentName(s: ApiScholarship): string {
  return s.student ? `${s.student.firstName} ${s.student.lastName}` : '—'
}

export function ScholarshipTab({ academicYear }: { academicYear: string }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const { data: scholarships = [], isLoading } = useScholarships()

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateScholarshipInput>({
    resolver: zodResolver(CreateScholarshipSchema),
    defaultValues: { academicYear, discountType: 'PERCENTAGE', studentId: '' },
  })

  const studentId = watch('studentId')
  const [studentQuery, setStudentQuery] = useState('')
  const [selectedStudentLabel, setSelectedStudentLabel] = useState('')
  const [showResults, setShowResults] = useState(false)
  const { data: searchResults, isLoading: isSearching } = useStudents({ search: studentQuery })

  function selectStudent(s: ApiStudent) {
    setValue('studentId', s.id, { shouldValidate: true })
    setSelectedStudentLabel(`${s.firstName} ${s.lastName} (${s.registrationNo})`)
    setStudentQuery('')
    setShowResults(false)
  }

  function closeAndReset() {
    reset()
    setStudentQuery('')
    setSelectedStudentLabel('')
    setShowForm(false)
  }

  const { mutate: create, isPending } = useMutation({
    mutationFn: (data: CreateScholarshipInput) =>
      apiFetch<ApiScholarship>('/finances/scholarships', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      closeAndReset()
      void qc.invalidateQueries({ queryKey: queryKeys.finances.scholarships() })
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
                Student
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
                  <td className="px-4 py-3 text-sm">{scholarshipStudentName(s)}</td>
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
                onClick={closeAndReset}
                aria-label="Close"
                className="p-1.5 rounded-lg hover:bg-page min-h-[44px]"
                type="button"
              >
                <X className="w-5 h-5 text-muted" />
              </button>
            </div>

            <form onSubmit={handleSubmit((d) => create(d))} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Scholarship Name</label>
                <input
                  {...register('name')}
                  type="text"
                  placeholder="e.g. Government Bursary"
                  className="input w-full"
                />
                {errors.name && (
                  <p className="text-xs text-brand-coral mt-1">{errors.name.message}</p>
                )}
              </div>

              {/* [R9] Student picker — replaces the free-text raw-ID input */}
              <div className="relative">
                <label className="block text-sm font-medium mb-1">Student</label>
                {selectedStudentLabel ? (
                  <div className="flex items-center justify-between input w-full">
                    <span className="text-sm">{selectedStudentLabel}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setValue('studentId', '', { shouldValidate: true })
                        setSelectedStudentLabel('')
                      }}
                      aria-label="Clear selected student"
                      className="text-muted hover:text-brand-coral"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      value={studentQuery}
                      onChange={(e) => {
                        setStudentQuery(e.target.value)
                        setShowResults(true)
                      }}
                      onFocus={() => setShowResults(true)}
                      type="text"
                      placeholder="Search by name or registration no…"
                      className="input w-full pl-9"
                      aria-label="Search for a student"
                    />
                    {showResults && studentQuery.length >= 2 && (
                      <div className="absolute z-10 mt-1 w-full bg-surface border border-base rounded-lg shadow-lg max-h-48 overflow-y-auto">
                        {isSearching ? (
                          <div className="px-3 py-2 text-xs text-muted flex items-center gap-2">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Searching…
                          </div>
                        ) : (searchResults?.students.length ?? 0) === 0 ? (
                          <div className="px-3 py-2 text-xs text-muted">No students found</div>
                        ) : (
                          searchResults?.students.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => selectStudent(s)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-page"
                            >
                              {s.firstName} {s.lastName}{' '}
                              <span className="text-xs text-muted">({s.registrationNo})</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
                {errors.studentId && !studentId && (
                  <p className="text-xs text-brand-coral mt-1">{errors.studentId.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Academic Year</label>
                <AcademicYearSelect
                  value={watch('academicYear')}
                  {...register('academicYear')}
                  className="input w-full"
                />
                {errors.academicYear && (
                  <p className="text-xs text-brand-coral mt-1">{errors.academicYear.message}</p>
                )}
              </div>

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
                  onClick={closeAndReset}
                  className="flex-1 border border-base px-4 py-2 rounded-lg text-sm hover:bg-page min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !studentId}
                  className="flex-1 bg-brand-teal text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 min-h-[44px]"
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