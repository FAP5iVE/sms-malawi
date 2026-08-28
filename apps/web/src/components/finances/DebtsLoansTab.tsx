/**
 * [CHANGE TYPE]: NEW FILE (production fix, 2026-07-27)
 * [FILE]: apps/web/src/components/finances/DebtsLoansTab.tsx
 * [PURPOSE]: Finance's "Debts & Loans" view — two sections:
 *   1. Vendor & Company Debts — approved-but-unpaid expenses (paidAt null),
 *      each postable to "Mark as Paid" (clears ledger account 2000 Accounts
 *      Payable). Sourced from GET /finances/debts.
 *   2. Staff Loans — a READ-ONLY summary of disbursed/repaying staff loans.
 *      Full loan management (request/approve/disburse/repay) already lives
 *      on the HR page's Loans tab; this deliberately does not duplicate
 *      that UI, only links to it, per the standing "reuse rather than
 *      rewrite" convention.
 * [DEPENDS ON]: W/hooks/useFinances.ts (useDebts, useMarkExpensePaid),
 *   @shared/types/api (ApiExpense, ApiStaffLoan).
 */
'use client'

import Link from 'next/link'
import { useDebts, useMarkExpensePaid } from '@/hooks/useFinances'
import { usePermissions } from '@/hooks/usePermissions'
import { formatMWK } from '@shared/constants/malawi'
import { format } from 'date-fns'
import { Building2, Users, ArrowUpRight, Check, Loader2, AlertCircle } from 'lucide-react'
import type { ApiExpense, ApiStaffLoan } from '@shared/types/api'

export function DebtsLoansTab() {
  const { data, isLoading, isError } = useDebts()
  const markPaid = useMarkExpensePaid()
  const { can } = usePermissions()
  const canMarkPaid = can('finance.approveExpense')

  const vendorDebts   = (data?.vendorDebts   ?? []) as ApiExpense[]
  const staffLoans    = (data?.staffLoans    ?? []) as ApiStaffLoan[]
  const totalVendor   = data?.totalVendorDebt       ?? 0
  const totalStaff    = data?.totalStaffLoanBalance ?? 0

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-surface animate-pulse" />)}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex items-center gap-2 text-sm text-brand-coral bg-brand-coral/8 border border-brand-coral/20 rounded-xl px-4 py-3">
        <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
        Failed to load debts overview. Please refresh.
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface border border-base rounded-xl p-5 min-w-0">
          <p className="text-xs text-muted uppercase tracking-wider">Owed to Vendors &amp; Companies</p>
          <p className="text-xl sm:text-2xl font-bold text-brand-coral mt-1 break-words">{formatMWK(totalVendor)}</p>
          <p className="text-xs text-muted mt-1">{vendorDebts.length} unpaid expense{vendorDebts.length === 1 ? '' : 's'}</p>
        </div>
        <div className="bg-surface border border-base rounded-xl p-5 min-w-0">
          <p className="text-xs text-muted uppercase tracking-wider">Outstanding Staff Loan Balance</p>
          <p className="text-xl sm:text-2xl font-bold text-brand-amber mt-1 break-words">{formatMWK(totalStaff)}</p>
          <p className="text-xs text-muted mt-1">{staffLoans.length} active loan{staffLoans.length === 1 ? '' : 's'}</p>
        </div>
      </div>

      {/* Vendor & Company Debts */}
      <div>
        <h2 className="font-heading font-semibold text-body mb-3 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-brand-teal" aria-hidden />
          Vendor &amp; Company Debts
        </h2>
        {vendorDebts.length === 0 ? (
          <div className="text-center py-10 text-muted text-sm border border-base rounded-xl">
            No outstanding vendor debts — every approved expense is fully paid.
          </div>
        ) : (
          <div className="space-y-2">
            {vendorDebts.map((e) => (
              <div
                key={e.id}
                className="bg-surface border border-base rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap"
              >
                <div>
                  <p className="font-semibold text-body">{e.description}</p>
                  <p className="text-xs text-muted mt-0.5">
                    {e.category} · Approved {e.incurredAt ? format(new Date(e.incurredAt), 'dd MMM yyyy') : '—'}
                  </p>
                  <p className="text-sm font-semibold text-brand-coral mt-1">{formatMWK(e.amount)}</p>
                </div>
                {canMarkPaid && (
                  <button
                    type="button"
                    onClick={() => markPaid.mutate(e.id)}
                    disabled={markPaid.isPending}
                    className="shrink-0 inline-flex items-center gap-2 bg-brand-teal text-white rounded-lg px-4 py-2 text-xs font-semibold hover:bg-brand-teal-light disabled:opacity-60 min-h-11"
                  >
                    {markPaid.isPending
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                      : <Check className="w-3.5 h-3.5" aria-hidden />}
                    Mark as Paid
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {markPaid.isError && (
          <p role="alert" className="text-xs text-brand-coral mt-2">
            {markPaid.error instanceof Error ? markPaid.error.message : 'Failed to mark expense as paid.'}
          </p>
        )}
      </div>

      {/* Staff Loans — read-only summary; management stays on the HR page */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading font-semibold text-body flex items-center gap-2">
            <Users className="w-4 h-4 text-brand-teal" aria-hidden />
            Staff Loans
          </h2>
          <Link
            href="/hr?tab=loans"
            className="text-xs font-semibold text-brand-teal hover:underline inline-flex items-center gap-1"
          >
            Manage in HR <ArrowUpRight className="w-3 h-3" aria-hidden />
          </Link>
        </div>
        {staffLoans.length === 0 ? (
          <div className="text-center py-10 text-muted text-sm border border-base rounded-xl">
            No active staff loans.
          </div>
        ) : (
          <div className="space-y-2">
            {staffLoans.map((l) => (
              <div
                key={l.id}
                className="bg-surface border border-base rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap"
              >
                <div>
                  <p className="font-semibold text-body">
                    {l.staff ? `${l.staff.firstName} ${l.staff.lastName}` : l.staffId}
                    {l.staff && <span className="text-xs text-muted ml-2">({l.staff.employeeNo})</span>}
                  </p>
                  <p className="text-xs text-muted mt-0.5">
                    {formatMWK(l.monthlyDeduction)}/mo deduction · {l.status}
                  </p>
                </div>
                <p className="text-sm font-semibold text-brand-amber shrink-0">
                  {formatMWK(l.balance)} remaining
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}