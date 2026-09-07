"use client"

/**
 * apps/web/src/components/finances/FinanceFeeStructureTab.tsx
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: The "Finance Fee Structure" workstation from the requested
 *   redesign — a per-student bursar view: search/select a student, see
 *   their statutory (mandatory) fees, enrolled optional add-ons,
 *   scholarship grant, and net term commitment, then edit which optional
 *   add-ons they're enrolled in. Table/section structure is adopted from
 *   the reference; visuals use this app's own design system. This is a
 *   genuinely new screen — nothing existing is replaced here (Settings &
 *   Fee Catalog stays the catalog *definition* screen; this is the
 *   per-student *application* of that catalog).
 * [DEPENDS ON]: useFinances.ts (useFeeStructures/useFeeCommitments/
 *   useUpsertFeeCommitment/useUpdateFeeCommitmentStatus/useScholarships),
 *   useStudents.ts, useClasses.ts
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useStudents } from '@/hooks/useStudents'
import { useClasses } from '@/hooks/useClasses'
import {
  useFeeStructures,
  useFeeCommitments,
  useUpsertFeeCommitment,
  useUpdateFeeCommitmentStatus,
  useScholarships,
} from '@/hooks/useFinances'
import { formatMWK, FEE_CATEGORY_LABELS, formatFeeScheduleBadge } from '@shared/constants/malawi'
import type { ApiStudent, ApiFeeStructure } from '@shared/types/api'
import {
  Search, Loader2, X, Pencil, Phone, Receipt, GraduationCap, PiggyBank, Wallet2,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────

export function FinanceFeeStructureTab({ academicYear, term }: { academicYear: string; term: number }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [showCommitmentsModal, setShowCommitmentsModal] = useState(false)

  const { data: classes = [] } = useClasses(academicYear)
  const { data: studentsData, isLoading: studentsLoading } = useStudents({
    status: 'ACTIVE',
    classId: classFilter || undefined,
    search: search.length >= 2 ? search : undefined,
  })
  const students = studentsData?.students ?? []
  const selectedStudent: ApiStudent | null =
    students.find((s) => s.id === selectedStudentId) ?? students[0] ?? null

  const { data: fees = [], isLoading: feesLoading } = useFeeStructures(
    academicYear,
    selectedStudent?.id,
    term
  )
  const { data: scholarships = [] } = useScholarships()

  const activeScholarship = useMemo(
    () =>
      scholarships.find(
        (s) => s.studentId === selectedStudent?.id && s.academicYear === academicYear && s.isActive
      ),
    [scholarships, selectedStudent?.id, academicYear]
  )

  const statutory = useMemo(() => fees.filter((f) => f.mandatory), [fees])
  const addons = useMemo(() => fees.filter((f) => !f.mandatory), [fees])
  const statutoryTotal = statutory.reduce((sum, f) => sum + Number(f.amount), 0)
  const addonsTotal = addons.reduce((sum, f) => sum + Number(f.amount), 0)
  const grossTotal = statutoryTotal + addonsTotal

  // Same discount formula feeService.computeInvoiceCharges() uses server-side
  // — this is a preview of what an invoice would total, not a real invoice.
  const scholarshipDiscount = activeScholarship
    ? activeScholarship.discountType === 'PERCENTAGE'
      ? grossTotal * (Number(activeScholarship.value) / 100)
      : Math.min(Number(activeScholarship.value), grossTotal)
    : 0
  const netCommitment = Math.max(0, Math.round((grossTotal - scholarshipDiscount) * 100) / 100)

  function billNow() {
    if (!selectedStudent) return
    router.push(`/finances?tab=invoices&studentId=${selectedStudent.id}`)
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading font-semibold text-body">Finance &amp; Bursar Fee Structure Workstation</h2>
          <p className="text-xs text-muted mt-0.5">
            Manage each student&rsquo;s statutory fee commitments, optional service enrollment, and scholarship concessions.
          </p>
        </div>
        <button
          type="button"
          onClick={billNow}
          disabled={!selectedStudent}
          className="inline-flex items-center gap-1.5 bg-brand-navy text-white rounded-lg px-3.5 py-2 text-sm font-semibold hover:bg-brand-navy-light disabled:opacity-50 min-h-11"
        >
          <Receipt className="w-4 h-4" />
          {selectedStudent ? `Bill ${selectedStudent.firstName} Now` : 'Bill Now'}
        </button>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-5 items-start">
        {/* ── STUDENT ROSTER DIRECTORY ── */}
        <div className="bg-surface border border-base rounded-xl overflow-hidden">
          <div className="p-3 border-b border-base space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="font-heading text-sm font-semibold text-body">Student Roster</h3>
              <span className="text-xs text-muted">{studentsData?.total ?? 0} students</span>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or ID…"
                className="w-full border border-base rounded-lg pl-8 pr-3 py-2 text-sm bg-page min-h-11"
              />
            </div>
            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="w-full border border-base rounded-lg px-3 py-2 text-sm bg-page min-h-11"
            >
              <option value="">All Grades &amp; Forms</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="max-h-130 overflow-y-auto divide-y divide-base">
            {studentsLoading ? (
              <div className="p-4 space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-lg bg-page animate-pulse" />)}
              </div>
            ) : students.length === 0 ? (
              <p className="p-4 text-sm text-muted text-center">No students match this search.</p>
            ) : (
              students.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedStudentId(s.id)}
                  className={`w-full text-left px-3 py-2.5 hover:bg-page transition-colors ${
                    selectedStudent?.id === s.id ? 'bg-page border-l-2 border-brand-teal' : ''
                  }`}
                >
                  <p className="text-sm font-medium text-body truncate">{s.firstName} {s.lastName}</p>
                  <p className="text-xs text-muted truncate">
                    {s.registrationNo} &middot; {s.class?.name ?? 'Unassigned'}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ── SELECTED STUDENT DETAIL ── */}
        {!selectedStudent ? (
          <div className="bg-surface border border-base rounded-xl p-12 text-center text-muted text-sm">
            Select a student to view their fee structure.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-surface border border-base rounded-xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-muted">{selectedStudent.registrationNo}</span>
                    <h3 className="font-heading font-semibold text-body">
                      {selectedStudent.firstName} {selectedStudent.lastName}
                    </h3>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-page border border-base text-muted">
                      <GraduationCap className="w-3 h-3" /> {selectedStudent.class?.name ?? 'Unassigned'}
                    </span>
                  </div>
                  <p className="text-xs text-muted mt-1 flex items-center gap-1.5">
                    Guardian: {selectedStudent.guardianName}
                    {selectedStudent.guardianPhone && (
                      <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> {selectedStudent.guardianPhone}</span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCommitmentsModal(true)}
                  className="inline-flex items-center gap-1.5 border border-base rounded-lg px-3 py-2 text-sm font-medium text-body hover:bg-page min-h-11"
                >
                  <Pencil className="w-3.5 h-3.5" /> Edit Add-on Commitments
                </button>
              </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <SummaryStat label="Statutory Tuition" value={formatMWK(statutoryTotal)} icon={Wallet2} />
              <SummaryStat label="Enrolled Add-ons" value={formatMWK(addonsTotal)} icon={Receipt} />
              <SummaryStat
                label="Scholarship Grant"
                value={
                  activeScholarship
                    ? activeScholarship.discountType === 'PERCENTAGE'
                      ? `${activeScholarship.value}%`
                      : formatMWK(activeScholarship.value)
                    : 'None (0%)'
                }
                icon={PiggyBank}
                highlight={!!activeScholarship}
              />
              <SummaryStat label="Net Term Commitment" value={formatMWK(netCommitment)} icon={Receipt} emphasis />
            </div>

            {/* Itemized commitments table */}
            <div className="bg-surface border border-base rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-base">
                <h3 className="font-heading text-sm font-semibold text-body">
                  Itemized Term Commitments ({fees.length})
                </h3>
              </div>
              {feesLoading ? (
                <div className="p-4"><div className="h-32 rounded-lg bg-page animate-pulse" /></div>
              ) : fees.length === 0 ? (
                <p className="p-8 text-sm text-muted text-center">
                  No fee commitments for {selectedStudent.firstName} this term yet.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-base bg-page">
                      <th className="text-left px-4 py-2.5 font-heading text-xs uppercase tracking-wide text-muted font-semibold">Fee Category &amp; Code</th>
                      <th className="text-left px-4 py-2.5 font-heading text-xs uppercase tracking-wide text-muted font-semibold hidden sm:table-cell">Classification</th>
                      <th className="text-left px-4 py-2.5 font-heading text-xs uppercase tracking-wide text-muted font-semibold hidden md:table-cell">Schedule</th>
                      <th className="text-right px-4 py-2.5 font-heading text-xs uppercase tracking-wide text-muted font-semibold">Standard Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fees.map((f) => (
                      <tr key={f.id} className="border-b border-base last:border-0">
                        <td className="px-4 py-3">
                          <p className="font-medium text-body">{f.name}</p>
                          <p className="text-xs text-muted font-mono">{f.code}</p>
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-heading font-semibold border ${
                              f.mandatory
                                ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/25 dark:text-amber-400 dark:border-amber-800/50'
                                : 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/25 dark:text-blue-400'
                            }`}
                          >
                            {f.mandatory ? 'Mandatory / Statutory' : 'Enrolled Service'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted hidden md:table-cell">
                          {formatFeeScheduleBadge(f.mandatory, f.schedule as 'PER_TERM' | 'ANNUAL' | 'ONE_TIME').split(' \u2022 ')[1]}
                        </td>
                        <td className="px-4 py-3 text-right tabular font-semibold">{formatMWK(f.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {showCommitmentsModal && selectedStudent && (
        <AddOnCommitmentsModal
          student={selectedStudent}
          academicYear={academicYear}
          term={term}
          onClose={() => setShowCommitmentsModal(false)}
        />
      )}
    </div>
  )
}

function SummaryStat({
  label, value, icon: Icon, highlight, emphasis,
}: { label: string; value: string; icon: React.ElementType; highlight?: boolean; emphasis?: boolean }) {
  return (
    <div className={`rounded-xl border p-3.5 ${emphasis ? 'bg-brand-navy border-brand-navy' : 'bg-surface border-base'}`}>
      <div className={`flex items-center gap-1.5 text-xs mb-1 ${emphasis ? 'text-white/70' : 'text-muted'}`}>
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <p className={`font-heading font-bold text-lg tabular ${
        emphasis ? 'text-white' : highlight ? 'text-emerald-600 dark:text-emerald-400' : 'text-body'
      }`}>
        {value}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// EDIT ADD-ON COMMITMENTS MODAL
// ─────────────────────────────────────────────────────────────────────────

function AddOnCommitmentsModal({
  student, academicYear, term, onClose,
}: { student: ApiStudent; academicYear: string; term: number; onClose: () => void }) {
  // Every OPTIONAL fee available to this student's class this year — not
  // just the ones already committed (that's useFeeCommitments below); this
  // is the full universe of add-ons the bursar can enroll them in.
  const { data: allFees = [], isLoading: feesLoading } = useFeeStructures(academicYear, undefined, term)
  const optionalFees = useMemo(
    () => allFees.filter((f) => !f.mandatory && (!f.classId || f.classId === student.classId)),
    [allFees, student.classId]
  )
  const { data: commitments = [], isLoading: commitmentsLoading } = useFeeCommitments(student.id, academicYear)
  const upsert = useUpsertFeeCommitment()
  const updateStatus = useUpdateFeeCommitmentStatus()

  function commitmentFor(feeId: string) {
    return commitments.find((c) => c.feeStructureId === feeId)
  }

  function toggle(fee: ApiFeeStructure) {
    const existing = commitmentFor(fee.id)
    const isCommitted = existing?.status === 'COMMITTED'
    if (isCommitted && existing) {
      updateStatus.mutate({ id: existing.id, data: { status: 'WAIVED' } })
    } else {
      upsert.mutate({ studentId: student.id, feeStructureId: fee.id, academicYear })
    }
  }

  const isLoading = feesLoading || commitmentsLoading

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
      <div className="bg-surface rounded-xl shadow-xl max-w-md w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-base">
          <div>
            <h3 className="font-heading font-semibold text-body">Edit Add-on Commitments</h3>
            <p className="text-xs text-muted">{student.firstName} {student.lastName}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-page text-muted" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <div key={i} className="h-12 rounded-lg bg-page animate-pulse" />)}
            </div>
          ) : optionalFees.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">
              No optional add-on services are defined for this student&rsquo;s class yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {optionalFees.map((fee) => {
                const existing = commitmentFor(fee.id)
                const isCommitted = existing?.status === 'COMMITTED'
                const isPending =
                  (upsert.isPending && upsert.variables?.feeStructureId === fee.id) ||
                  (updateStatus.isPending && updateStatus.variables?.id === existing?.id)
                return (
                  <li key={fee.id} className="flex items-center justify-between gap-3 border border-base rounded-lg px-3 py-2.5">
                    <label className="flex items-center gap-2.5 cursor-pointer min-w-0">
                      <input
                        type="checkbox"
                        checked={isCommitted}
                        disabled={isPending}
                        onChange={() => toggle(fee)}
                        className="w-4 h-4 rounded border-base shrink-0"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-body truncate">{fee.name}</span>
                        <span className="block text-xs text-muted">
                          {FEE_CATEGORY_LABELS[fee.category as keyof typeof FEE_CATEGORY_LABELS] ?? fee.category} &middot; {formatMWK(fee.amount)}
                        </span>
                      </span>
                    </label>
                    {isPending && <Loader2 className="w-4 h-4 animate-spin text-muted shrink-0" />}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-end px-5 py-4 border-t border-base">
          <button
            type="button" onClick={onClose}
            className="px-4 py-2 text-sm font-semibold bg-brand-navy text-white rounded-lg min-h-11"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
