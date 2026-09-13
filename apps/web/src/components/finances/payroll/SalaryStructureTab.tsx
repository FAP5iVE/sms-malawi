'use client'

/**
 * apps/web/src/components/finances/payroll/SalaryStructureTab.tsx
 *
 * [CHANGE TYPE]: NEW FILE
 * [PURPOSE]: The Salary Structure & Allowances tab (user-requested
 *   redesign). A full-tab staff picker + editor built on the salary/
 *   allowance CRUD hooks already proven inside StaffForm.tsx's SalarySection
 *   (useSalary/useUpdateSalary/useAllowances/useAddAllowance/
 *   useDeleteAllowance — untouched, reused as-is), plus a new staff picker
 *   (useSalaryRoster) since finance holds hr.manageSalaryStructure/
 *   finance.manageSalaryStructure but was never in the real staff
 *   directory's role list and had no other way to reach this data outside
 *   the Staff Directory → edit-staff modal path HR alone can take.
 *   monthlyLoanDeduction is shown read-only here — UpdateSalarySchema only
 *   accepts baseSalary; the deduction itself is maintained automatically by
 *   hrService.disburseLoan()/recordLoanRepayment() against the staff
 *   member's real StaffLoan, not hand-edited.
 * [DEPENDS ON]: useHR.ts (useSalary/useUpdateSalary/useAllowances/
 *   useAddAllowance/useDeleteAllowance — unmodified), usePayroll.ts
 *   (useSalaryRoster — new)
 */

import { useMemo, useState } from 'react'
import { Search, Plus, Trash2, Loader2, User, Wallet } from 'lucide-react'
import { formatMWK } from '@shared/constants/malawi'
import {
  useSalary,
  useUpdateSalary,
  useAllowances,
  useAddAllowance,
  useDeleteAllowance,
} from '@/hooks/useHR'
import { useSalaryRoster } from '@/hooks/usePayroll'
import type { ApiStaffProfile } from '@shared/types/api'

// ─────────────────────────────────────────────────────────────────────────────
// STAFF PICKER
// ─────────────────────────────────────────────────────────────────────────────

function StaffPicker({
  roster,
  isLoading,
  selectedId,
  onSelect,
  search,
  onSearch,
}: {
  roster: ApiStaffProfile[]
  isLoading: boolean
  selectedId: string | null
  onSelect: (id: string) => void
  search: string
  onSearch: (v: string) => void
}) {
  return (
    <div className="bg-surface border border-base rounded-2xl overflow-hidden lg:col-span-1">
      <div className="p-4 border-b border-base">
        <div className="relative">
          <Search
            className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2"
            aria-hidden
          />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search staff…"
            className="w-full min-h-[40px] pl-9 pr-3 rounded-xl text-sm border border-base bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
          />
        </div>
      </div>
      <div className="max-h-[520px] overflow-y-auto divide-y divide-base">
        {isLoading && (
          <div className="p-6 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted" />
          </div>
        )}
        {!isLoading && roster.length === 0 && (
          <p className="p-6 text-sm text-muted text-center">No staff match this search.</p>
        )}
        {roster.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            className={[
              'w-full text-left px-4 py-3 flex items-center gap-3 transition-colors',
              selectedId === s.id ? 'bg-brand-navy/5' : 'hover:bg-page',
            ].join(' ')}
          >
            <div className="w-9 h-9 rounded-lg bg-base flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-muted" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-heading font-semibold text-body truncate">
                {s.firstName} {s.lastName}
              </p>
              <p className="text-xs text-muted truncate">
                {s.department} • {s.jobTitle}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// ALLOWANCE ADD FORM
// ─────────────────────────────────────────────────────────────────────────────

function AddAllowanceForm({ staffId, onDone }: { staffId: string; onDone: () => void }) {
  const addAllowance = useAddAllowance()
  const [type, setType] = useState('')
  const [amount, setAmount] = useState('')
  const [recurring, setRecurring] = useState(true)
  const [paidMonth, setPaidMonth] = useState(String(new Date().getMonth() + 1))
  const [paidYear, setPaidYear] = useState(String(new Date().getFullYear()))
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit() {
    if (!type.trim() || !amount || Number(amount) < 0) {
      setError('An allowance type and a non-negative amount are required.')
      return
    }
    setError(null)
    addAllowance.mutate(
      {
        staffId,
        data: {
          type: type.trim(),
          amount: Number(amount),
          recurring,
          ...(recurring ? {} : { paidMonth: Number(paidMonth), paidYear: Number(paidYear) }),
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        },
      },
      { onSuccess: onDone }
    )
  }

  return (
    <div className="bg-page rounded-xl p-4 space-y-3">
      {error && <p className="text-xs text-brand-coral">{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1">
            Type
          </label>
          <input
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder="e.g. Housing"
            className="w-full min-h-[40px] px-3 rounded-lg text-sm border border-base bg-surface text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
          />
        </div>
        <div>
          <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1">
            Amount (MWK)
          </label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="number"
            min={0}
            placeholder="0.00"
            className="w-full min-h-[40px] px-3 rounded-lg text-sm border border-base bg-surface text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-body">
        <input
          type="checkbox"
          checked={recurring}
          onChange={(e) => setRecurring(e.target.checked)}
          className="w-4 h-4 rounded border-base"
        />
        Recurring every month
      </label>
      {!recurring && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1">
              Paid Month
            </label>
            <select
              value={paidMonth}
              onChange={(e) => setPaidMonth(e.target.value)}
              className="w-full min-h-[40px] px-3 rounded-lg text-sm border border-base bg-surface text-body"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1">
              Paid Year
            </label>
            <input
              value={paidYear}
              onChange={(e) => setPaidYear(e.target.value)}
              type="number"
              className="w-full min-h-[40px] px-3 rounded-lg text-sm border border-base bg-surface text-body"
            />
          </div>
        </div>
      )}
      <div>
        <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1">
          Notes (optional)
        </label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full min-h-[40px] px-3 rounded-lg text-sm border border-base bg-surface text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="min-h-[40px] px-4 rounded-lg text-sm font-heading font-semibold text-muted hover:bg-surface"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={addAllowance.isPending}
          className="min-h-[40px] px-4 rounded-lg text-sm font-heading font-semibold text-white bg-brand-navy hover:bg-brand-navy/90 disabled:opacity-50 flex items-center gap-2"
        >
          {addAllowance.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Add Allowance
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SALARY EDITOR
// ─────────────────────────────────────────────────────────────────────────────

function SalaryEditor({ staff }: { staff: ApiStaffProfile }) {
  const { data: salary, isLoading: salaryLoading } = useSalary(staff.id)
  const { data: allowances = [], isLoading: allowancesLoading } = useAllowances(staff.id)
  const updateSalary = useUpdateSalary()
  const deleteAllowance = useDeleteAllowance()

  const [baseSalaryOverride, setBaseSalaryOverride] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [saved, setSaved] = useState(false)

  const baseSalaryInput = baseSalaryOverride ?? (salary ? String(salary.baseSalary) : '')

  const recurringTotal = useMemo(
    () => allowances.filter((a) => a.recurring).reduce((sum, a) => sum + Number(a.amount), 0),
    [allowances]
  )
  const monthlyGross = Number(baseSalaryInput || 0) + recurringTotal
  const isDirty = salary ? Number(baseSalaryInput) !== Number(salary.baseSalary) : !!baseSalaryInput

  function saveBaseSalary() {
    const value = Number(baseSalaryInput)
    if (!Number.isFinite(value) || value < 0) return
    setSaved(false)
    updateSalary.mutate(
      { staffId: staff.id, data: { baseSalary: value } },
      {
        onSuccess: () => {
          setSaved(true)
          setTimeout(() => setSaved(false), 2000)
        },
      }
    )
  }

  return (
    <div className="bg-surface border border-base rounded-2xl p-5 sm:p-6 lg:col-span-2 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-brand-navy/10 flex items-center justify-center shrink-0">
          <Wallet className="w-5 h-5 text-brand-navy" aria-hidden />
        </div>
        <div>
          <h3 className="font-heading font-bold text-body">
            {staff.firstName} {staff.lastName}
          </h3>
          <p className="text-xs text-muted">
            {staff.employeeNo} • {staff.department} • {staff.jobTitle}
          </p>
        </div>
      </div>

      {/* Base salary */}
      <div>
        <label className="block text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-1.5">
          Base Salary (Monthly, MWK)
        </label>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            value={baseSalaryInput}
            onChange={(e) => setBaseSalaryOverride(e.target.value)}
            type="number"
            min={0}
            disabled={salaryLoading}
            className="min-h-[44px] px-3 rounded-xl text-sm border border-base bg-page text-body w-48 focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
          />
          <button
            type="button"
            onClick={saveBaseSalary}
            disabled={!isDirty || updateSalary.isPending}
            className="min-h-[44px] px-5 rounded-xl text-sm font-heading font-semibold text-white bg-brand-navy hover:bg-brand-navy/90 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {updateSalary.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Save
          </button>
          {saved && (
            <span className="text-xs text-emerald-600 font-heading font-semibold">Saved</span>
          )}
        </div>
      </div>

      {/* Loan deduction — read-only, driven by the staff member's real active loan */}
      <div className="bg-page rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-heading font-semibold text-body">Monthly Loan Deduction</p>
          <p className="text-xs text-muted mt-0.5">
            Set automatically when a staff loan is disbursed — not directly editable here.
          </p>
        </div>
        <p className="font-heading font-bold text-body tabular">
          {salaryLoading ? '—' : formatMWK(Number(salary?.monthlyLoanDeduction ?? 0))}
        </p>
      </div>

      {/* Allowances */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-heading font-semibold text-sm text-body">Allowances</h4>
          {!showAddForm && (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="inline-flex items-center gap-1.5 text-xs font-heading font-semibold text-brand-navy hover:underline"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden /> Add Allowance
            </button>
          )}
        </div>

        {showAddForm && (
          <div className="mb-3">
            <AddAllowanceForm staffId={staff.id} onDone={() => setShowAddForm(false)} />
          </div>
        )}

        {allowancesLoading && <p className="text-sm text-muted">Loading…</p>}
        {!allowancesLoading && allowances.length === 0 && !showAddForm && (
          <p className="text-sm text-muted">No allowances on record.</p>
        )}
        <div className="space-y-2">
          {allowances.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 bg-page rounded-xl px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-heading font-semibold text-body">{a.type}</p>
                <p className="text-xs text-muted">
                  {a.recurring ? 'Recurring, monthly' : `One-time — ${a.paidMonth}/${a.paidYear}`}
                  {a.notes ? ` • ${a.notes}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <span className="font-heading font-semibold tabular text-body">
                  {formatMWK(Number(a.amount))}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${a.type}`}
                  onClick={() => deleteAllowance.mutate({ allowanceId: a.id, staffId: staff.id })}
                  className="p-1.5 rounded-lg text-muted hover:bg-brand-coral/10 hover:text-brand-coral transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Computed summary — mirrors exactly what payrollService.ts sums for a real payslip's gross */}
      <div className="border-t border-base pt-4 flex items-center justify-between">
        <span className="text-sm font-heading font-semibold text-body">Total Gross Monthly</span>
        <span className="text-lg font-heading font-bold tabular text-body">
          {formatMWK(monthlyGross)}
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB
// ─────────────────────────────────────────────────────────────────────────────

export function SalaryStructureTab() {
  const { data: roster = [], isLoading } = useSalaryRoster()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return roster
    return roster.filter((s) =>
      `${s.firstName} ${s.lastName} ${s.employeeNo} ${s.department} ${s.jobTitle}`
        .toLowerCase()
        .includes(q)
    )
  }, [roster, search])

  const selected = roster.find((s) => s.id === selectedId) ?? null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <StaffPicker
        roster={filtered}
        isLoading={isLoading}
        selectedId={selectedId}
        onSelect={setSelectedId}
        search={search}
        onSearch={setSearch}
      />
      {selected ? (
        <SalaryEditor key={selected.id} staff={selected} />
      ) : (
        <div className="lg:col-span-2 bg-surface border border-dashed border-base rounded-2xl flex items-center justify-center p-12 text-sm text-muted text-center">
          Select a staff member to view or edit their salary structure and allowances.
        </div>
      )}
    </div>
  )
}
