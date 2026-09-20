'use client'

/**
 * apps/web/src/components/finances/payroll/MyPayTab.tsx
 *
 * [CHANGE TYPE]: NEW FILE (supersedes hr/page.tsx's old inline MyPayTab
 *   function — see that file's own edit for the removal)
 * [PURPOSE]: The My Pay (Self-Service) tab (user-requested redesign).
 *   Own payroll data by default; a "Viewing Employee" picker for callers
 *   holding hr.viewAnyPayslips (hr/high_rank — S/types/permissions.ts).
 *   Built against payrollService.getMySalaryStructure() — the route this
 *   screen's predecessor called (GET /payroll/my-salary) did not exist at
 *   all before this redesign; see that function's own header comment.
 * [DEPENDS ON]: usePayroll.ts (useMyPayslips/useMySalaryStructure/
 *   downloadPayslip), useHR.ts (useStaffDirectory/useMyLoans/useLoans —
 *   unmodified), W/store/authStore.ts
 */

import { useMemo, useState } from 'react'
import { Wallet, PiggyBank, Download, User, Loader2 } from 'lucide-react'
import { formatMWK } from '@shared/constants/malawi'
import type { ApiPayslip, ApiStaffProfile } from '@shared/types/api'
import { useAuthStore } from '@/store/authStore'
import { useMyLoans, useLoans } from '@/hooks/useHR'
import { useMyPayslips, useMySalaryStructure, useSalaryRoster, useDownloadPayslip } from '@/hooks/usePayroll'
import { DataTable, type DataColumn } from '@/components/shared/DataTable'
import { formatRunPeriod } from './payrollDisplay'

const CURRENT_YEAR = new Date().getFullYear()

// ─────────────────────────────────────────────────────────────────────────────
// "VIEWING EMPLOYEE" PICKER — only ever mounted for hr.viewAnyPayslips
// holders (see MyPayTab below).
// [PRODUCTION FIX, user-requested] Was useStaffDirectory() (GET /hr), which
// is role-gated to admin/hr/high_rank — worked fine for hr/high_rank (both
// already in that list) but 403'd the moment finance was granted
// hr.viewAnyPayslips too, since finance was never in that role list.
// Switched to useSalaryRoster() (GET /hr/salary-roster), which now
// explicitly accepts hr.viewAnyPayslips as a qualifying permission — see
// that route's own header comment. Same roster the Salary Structure &
// Allowances tab already uses for its own staff picker.
// ─────────────────────────────────────────────────────────────────────────────

function EmployeePicker({
  selected, onChange,
}: {
  selected: ApiStaffProfile | null
  onChange: (staff: ApiStaffProfile | null) => void
}) {
  const { data } = useSalaryRoster()
  const directory = (data ?? []) as ApiStaffProfile[]

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs font-heading font-semibold text-muted uppercase tracking-wider whitespace-nowrap">
        Viewing Employee:
      </label>
      <select
        value={selected?.uid ?? 'self'}
        onChange={(e) => {
          if (e.target.value === 'self') return onChange(null)
          onChange(directory.find((s) => s.uid === e.target.value) ?? null)
        }}
        className="min-h-10 px-3 rounded-xl text-sm border border-base bg-page text-body focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
      >
        <option value="self">Myself</option>
        {directory.map((s) => (
          <option key={s.uid} value={s.uid}>{s.firstName} {s.lastName} ({s.department})</option>
        ))}
      </select>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// STAFF WELFARE & SAVINGS — active loan (if any) + pension accumulation
// ─────────────────────────────────────────────────────────────────────────────

function ActiveLoanCard({ loan }: {
  loan: { amount: number; balance: number; monthlyDeduction: number; reason: string } | undefined
}) {
  const progressPct = loan && loan.amount > 0
    ? Math.round(((loan.amount - loan.balance) / loan.amount) * 100)
    : 0

  return (
    <div className="bg-surface border border-base rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <PiggyBank className="w-4 h-4 text-brand-navy" aria-hidden />
        <h3 className="text-xs font-heading font-semibold text-muted uppercase tracking-wider">Staff Welfare &amp; Savings</h3>
      </div>
      {loan ? (
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Active Loan</span>
            <span className="font-heading font-semibold text-body text-right">{loan.reason}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Remaining Balance</span>
            <span className="font-heading font-semibold tabular text-brand-coral">{formatMWK(loan.balance)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted">Monthly Deduction</span>
            <span className="font-heading font-semibold tabular text-body">{formatMWK(loan.monthlyDeduction)}/mo</span>
          </div>
          <div className="h-1.5 rounded-full bg-base overflow-hidden mt-2">
            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="text-xs text-muted text-right">{progressPct}% repaid</p>
        </div>
      ) : (
        <p className="text-sm text-muted mb-4">No active loan on record.</p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB
// ─────────────────────────────────────────────────────────────────────────────

export function MyPayTab({ canViewAnyPayslips }: { canViewAnyPayslips: boolean }) {
  const { user } = useAuthStore()
  const [viewingStaff, setViewingStaff] = useState<ApiStaffProfile | null>(null)
  const targetUid = viewingStaff?.uid // undefined ⇒ self, resolved server-side to the caller's own uid

  const { data: payslips = [], isLoading: payslipsLoading } = useMyPayslips(targetUid)
  const { data: salary, isLoading: salaryLoading } = useMySalaryStructure(targetUid)
  // [BUGFIX — ERR-5 / ERR-6 / ERR-7] see useDownloadPayslip()'s own header
  // comment in usePayroll.ts.
  const downloadPayslipMutation = useDownloadPayslip()

  // Loan lookups are two separate hooks (rather than one branching on
  // targetUid) so each only ever fires the request its caller's role can
  // actually make — useLoans() is gated server-side to
  // admin/hr/finance/high_rank, and only a hr.viewAnyPayslips holder
  // (already hr/high_rank) can ever set viewingStaff in the first place.
  const { data: myLoans = [] } = useMyLoans()
  const { data: allLoans = [] } = useLoans()
  const relevantLoans = viewingStaff ? allLoans.filter((l) => l.staffId === viewingStaff.id) : myLoans
  const activeLoan = relevantLoans.find((l) => l.status === 'DISBURSED' || l.status === 'REPAYING')

  const latest = payslips[0]
  const ytd = useMemo(() => {
    const thisYear = payslips.filter((p) => p.payrollRun?.year === CURRENT_YEAR)
    return {
      gross: thisYear.reduce((s, p) => s + Number(p.grossSalary), 0),
      paye: thisYear.reduce((s, p) => s + Number(p.paye), 0),
      pension: thisYear.reduce((s, p) => s + Number(p.pension), 0),
      net: thisYear.reduce((s, p) => s + Number(p.netSalary), 0),
    }
  }, [payslips])

  const displayName = viewingStaff ? `${viewingStaff.firstName} ${viewingStaff.lastName}` : (user?.displayName ?? 'My Pay')
  const displaySubtitle = viewingStaff ? `${viewingStaff.employeeNo} • ${viewingStaff.department} • ${viewingStaff.jobTitle}` : salary?.jobTitle
    ? `${salary.department ?? ''} • ${salary.jobTitle}`.replace(/^ • /, '')
    : undefined

  const columns: DataColumn<ApiPayslip>[] = [
    {
      key: 'payrollRun', label: 'Pay Period', priority: 'critical',
      render: (p) => p.payrollRun ? formatRunPeriod(p.payrollRun.month, p.payrollRun.year) : '—',
    },
    { key: 'grossSalary', label: 'Gross Pay', priority: 'important', render: (p) => formatMWK(p.grossSalary) },
    { key: 'paye', label: 'PAYE Tax', priority: 'important', render: (p) => <span className="text-brand-coral">-{formatMWK(p.paye)}</span> },
    { key: 'pension', label: 'Pension', priority: 'optional', render: (p) => <span className="text-brand-coral">-{formatMWK(p.pension)}</span> },
    { key: 'loanDeduction', label: 'Loan Ded.', priority: 'optional', render: (p) => p.loanDeduction > 0 ? <span className="text-brand-coral">-{formatMWK(p.loanDeduction)}</span> : <span className="text-muted">—</span> },
    { key: 'netSalary', label: 'Net Remittance', priority: 'critical', render: (p) => <span className="font-semibold text-emerald-700">{formatMWK(p.netSalary)}</span> },
    {
      key: 'id', label: 'Action', priority: 'critical',
      render: (p) => {
        const isDownloading = downloadPayslipMutation.isPending && downloadPayslipMutation.variables === p.id
        return (
          <button type="button" onClick={() => downloadPayslipMutation.mutate(p.id)}
            disabled={isDownloading}
            aria-busy={isDownloading}
            className="inline-flex items-center gap-1.5 text-xs font-heading font-semibold text-brand-navy hover:underline whitespace-nowrap disabled:opacity-60 disabled:pointer-events-none">
            {isDownloading
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> Opening…</>
              : <><Download className="w-3.5 h-3.5" aria-hidden /> View Payslip</>}
          </button>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-base flex items-center justify-center shrink-0">
            <User className="w-5 h-5 text-muted" aria-hidden />
          </div>
          <div>
            <h2 className="font-heading font-bold text-body">
              {displayName} {viewingStaff && <span className="text-xs font-normal text-muted ml-1">{viewingStaff.employeeNo}</span>}
            </h2>
            {displaySubtitle && <p className="text-xs text-muted">{displaySubtitle}</p>}
          </div>
        </div>
        {canViewAnyPayslips && <EmployeePicker selected={viewingStaff} onChange={setViewingStaff} />}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Monthly Earnings Structure */}
        <div className="bg-surface border border-base rounded-2xl p-5">
          <h3 className="text-xs font-heading font-semibold text-muted uppercase tracking-wider mb-3">Monthly Earnings Structure</h3>
          {salaryLoading && <p className="text-sm text-muted">Loading…</p>}
          {!salaryLoading && !salary && <p className="text-sm text-muted">No salary structure on record yet.</p>}
          {salary && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Base Salary</span>
                <span className="font-heading font-semibold tabular text-body">{formatMWK(salary.baseSalary)}</span>
              </div>
              {salary.allowances.map((a) => (
                <div key={a.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted">Allowance ({a.type})</span>
                  <span className="font-heading font-semibold tabular text-emerald-600">+{formatMWK(a.amount)}</span>
                </div>
              ))}
              <div className="border-t border-base pt-2 flex items-center justify-between">
                <span className="text-sm font-heading font-semibold text-body">Total Gross Monthly</span>
                <span className="font-heading font-bold tabular text-body">{formatMWK(salary.monthlyGross)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Latest Monthly Net Pay */}
        <div className="bg-brand-navy text-white rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-4 h-4 text-emerald-300" aria-hidden />
            <span className="text-xs font-heading font-semibold uppercase tracking-wider text-emerald-300">Latest Monthly Net Pay</span>
          </div>
          {latest ? (
            <>
              <p className="text-2xl font-heading font-bold tabular mt-1">{formatMWK(latest.netSalary)}</p>
              {latest.payrollRun && (
                <p className="text-xs text-white/60 mt-0.5">{formatRunPeriod(latest.payrollRun.month, latest.payrollRun.year)}</p>
              )}
              <div className="mt-4 space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-white/70">PAYE Tax Withheld</span>
                  <span className="tabular">-{formatMWK(latest.paye)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/70">Pension</span>
                  <span className="tabular">-{formatMWK(latest.pension)}</span>
                </div>
                {latest.loanDeduction > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-white/70">Loan Repayment</span>
                    <span className="tabular">-{formatMWK(latest.loanDeduction)}</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-white/70 mt-2">No payslips yet.</p>
          )}
        </div>

        <ActiveLoanCard loan={activeLoan} />
      </div>

      {/* YTD stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'YTD Gross Earnings', value: ytd.gross },
          { label: 'YTD PAYE Tax Remitted', value: ytd.paye },
          { label: 'YTD Pension Contribution', value: ytd.pension },
          { label: 'YTD Total Net Received', value: ytd.net, emphasize: true },
        ].map((s) => (
          <div key={s.label} className="bg-surface border border-base rounded-xl p-4">
            <p className="text-[11px] font-heading font-semibold text-muted uppercase tracking-wider mb-1">{s.label}</p>
            <p className={`font-heading font-bold tabular ${s.emphasize ? 'text-emerald-700' : 'text-body'}`}>{formatMWK(s.value)}</p>
          </div>
        ))}
      </div>

      {/* Payslip records */}
      <div className="bg-surface border border-base rounded-2xl p-5 sm:p-6">
        <h3 className="font-heading font-bold text-body mb-1">My Official Payslip Records</h3>
        <p className="text-sm text-muted mb-4">Instant access to view and print official school payslip advice slips.</p>
        <DataTable
          data={payslips}
          isLoading={payslipsLoading}
          columns={columns}
          rowKey="id"
          emptyMessage="No payslips yet."
          bordered={false}
        />
      </div>
    </div>
  )
}