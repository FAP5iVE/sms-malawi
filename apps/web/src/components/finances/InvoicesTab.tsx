'use client'

import { useState } from 'react'
import { useInvoices, useRecordPayment } from '@/hooks/useFinances'
import { useAuthStore } from '@/store/authStore'
import { formatMWK } from '@shared/constants/malawi'
import { PlusCircle, Loader2 } from 'lucide-react'
import { InvoiceNotes } from '@/components/finances/InvoiceNotes'
import type { ApiInvoice } from '@shared/types/api'
import { PaymentMethodSchema } from '@shared/schemas/finance'
import { z } from 'zod'

type PaymentMethodType = z.infer<typeof PaymentMethodSchema>
const STATUS_COLORS: Record<string, string> = {
  PAID: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PARTIAL: 'bg-blue-50 text-blue-700 border-blue-200',
  UNPAID: 'bg-brand-amber/10 text-brand-amber border-brand-amber/30',
  OVERDUE: 'bg-brand-coral/10 text-brand-coral border-brand-coral/30',
}
export function InvoicesTab({ academicYear, term }: { academicYear: string; term: number }) {
  const { role, user } = useAuthStore()
  const [statusFilter, setStatusFilter] = useState('')
  const [payingInvoice, setPayingInvoice] = useState<ApiInvoice | null>(null)
  const [expandedInvoiceId, setExpandedInvoiceId] = useState<string | null>(null)
  const filters: Record<string, string | number> = { academicYear, term }
  if (role === 'student') filters.studentId = user?.uid ?? ''
  if (statusFilter) filters.status = statusFilter
  const { data: invoices = [], isLoading } = useInvoices(filters)
  const { mutate: recordPayment, isPending } = useRecordPayment()
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<PaymentMethodType>('CASH')
  const [payRef, setPayRef] = useState('')
  function submitPayment() {
    if (!payingInvoice || !payAmount) return
    recordPayment(
      {
        invoiceId: payingInvoice.id,
        amount: Number(payAmount),
        method: payMethod,
        reference: payRef || undefined,
      },
      {
        onSuccess: () => {
          setPayingInvoice(null)
          setPayAmount('')
          setPayRef('')
        },
      }
    )
  }
  return (
    <div className="space-y-4">
      {/* Status chips */}
      <div className="flex gap-2 flex-wrap">
        {['', 'UNPAID', 'PARTIAL', 'PAID', 'OVERDUE'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={[
              'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
              statusFilter === s
                ? 'bg-brand-navy text-white border-brand-navy'
                : 'bg-surface border-base text-muted hover:border-brand-navy',
            ].join(' ')}
            aria-label={s || 'All statuses'}
          >
            {s || 'All'}
          </button>
        ))}
      </div>
      {/* Invoices table */}
      <div className="bg-surface border border-base rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-base bg-page">
              <th className="text-left px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">
                Student
              </th>
              <th className="text-left px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">
                Term
              </th>
              <th className="text-right px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">
                Total
              </th>
              <th className="text-right px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">
                Paid
              </th>
              <th className="text-right px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">
                Balance
              </th>
              <th className="text-left px-4 py-3 font-heading font-semibold text-xs uppercase tracking-wide text-muted">
                Status
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-base">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="skeleton h-4 rounded w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted">
                  No invoices found
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <>
                  <tr
                    key={inv.id}
                    onClick={() =>
                      role !== 'student' &&
                      setExpandedInvoiceId(expandedInvoiceId === inv.id ? null : inv.id)
                    }
                    className={[
                      'border-b border-base hover:bg-page',
                      role !== 'student' ? 'cursor-pointer' : '',
                    ].join(' ')}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-muted tabular">
                      {inv.studentId.slice(-8)}
                    </td>
                    <td className="px-4 py-3">Term {inv.term}</td>
                    <td className="px-4 py-3 text-right tabular font-medium">
                      {formatMWK(inv.totalAmount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular text-emerald-600">
                      {formatMWK(inv.paidAmount)}
                    </td>
                    <td
                      className="px-4 py-3 text-right tabular font-semibold"
                      style={{
                        color:
                          inv.balance > 0 ? 'var(--color-brand-coral)' : 'var(--color-brand-teal)',
                      }}
                    >
                      {formatMWK(inv.balance)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLORS[inv.status] ?? ''}`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {role !== 'student' && inv.status !== 'PAID' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setPayingInvoice(inv)
                          }}
                          className="flex items-center gap-1 text-xs text-brand-teal hover:underline font-medium"
                          aria-label={`Record payment for invoice ${inv.id}`}
                        >
                          <PlusCircle className="w-3.5 h-3.5" /> Pay
                        </button>
                      )}
                    </td>
                  </tr>
                  {role !== 'student' && expandedInvoiceId === inv.id && (
                    <tr key={`${inv.id}-notes`} className="border-b border-base bg-page">
                      <td colSpan={7} className="px-6 py-4">
                        <InvoiceNotes invoiceId={inv.id} />
                      </td>
                    </tr>
                  )}
                </>
              ))
            )}
          </tbody>
        </table>
      </div>
      {/* Record Payment Modal */}
      {payingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-heading font-bold text-lg text-brand-navy">Record Payment</h3>
            <p className="text-sm text-muted">
              Balance:{' '}
              <strong className="text-brand-coral">{formatMWK(payingInvoice.balance)}</strong>
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">Amount (MWK)</label>
                <input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="input w-full"
                  placeholder="Enter amount"
                  max={payingInvoice.balance}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Payment Method</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethodType)}
                  className="input w-full"
                  aria-label="Payment method"
                >
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="MOBILE_MONEY">Mobile Money</option>
                  <option value="CHEQUE">Cheque</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Reference (optional)</label>
                <input
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  className="input w-full"
                  placeholder="Transaction ID, receipt number…"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setPayingInvoice(null)}
                className="flex-1 border border-base px-4 py-2 rounded-lg text-sm hover:bg-page"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={submitPayment}
                disabled={isPending || !payAmount}
                className="flex-1 bg-brand-teal text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                type="button"
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Record Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
