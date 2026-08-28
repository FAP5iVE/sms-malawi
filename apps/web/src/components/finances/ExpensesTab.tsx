/**
 * [CHANGE TYPE]: MAJOR REWRITE
 * [FILE]: apps/web/src/components/finances/ExpensesTab.tsx
 * [R-PHASE]: R9 — Finance I: Invoicing, Fees & the Accounting Ledger
 *   Reconnection
 * [PURPOSE]: Was a read-only list. Now a full three-state workflow view:
 *   - Create: a form (category, description, amount, date, optional
 *     receipt file) posts to POST /finances/expenses, then — if a receipt
 *     file was attached — uploads it via POST /finances/expenses/:id/receipt
 *     (Expense.receiptKey previously had no upload/view UI anywhere despite
 *     the field existing since this feature's inception).
 *   - Approve/Reject: PENDING expenses gate these actions on
 *     usePermissions().can('finance.approveExpense'/'finance.rejectExpense')
 *     — the latter newly a real, role-assigned permission this phase
 *     (S/types/permissions.ts). Approving now also posts to the double-entry
 *     accounting ledger server-side (finances.ts's PATCH .../approve).
 *   - Receipt: a row with a receiptKey shows a "View" action
 *     (GET /finances/expenses/:id/receipt, an authenticated signed-proxy
 *     URL); a row without one and still PENDING shows an upload control.
 * [DEPENDS ON]: W/hooks/useFinances.ts (useCreateExpense,
 *   useUploadExpenseReceipt, useViewExpenseReceipt, useApproveExpense,
 *   useRejectExpense), W/hooks/usePermissions.ts
 */
'use client'

import { useRef, useState } from 'react'
import {
  useExpenses,
  useCreateExpense,
  useUploadExpenseReceipt,
  useViewExpenseReceipt,
  useApproveExpense,
  useRejectExpense,
} from '@/hooks/useFinances'
import { usePermissions } from '@/hooks/usePermissions'
import { formatMWK } from '@shared/constants/malawi'
import { format } from 'date-fns'
import { ExpenseCategorySchema, type CreateExpenseInput } from '@shared/schemas/finance'
import { z } from 'zod'
import { Plus, Check, X, Paperclip, FileText, Loader2 } from 'lucide-react'

type ExpenseCategoryType = z.infer<typeof ExpenseCategorySchema>

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-brand-amber/10 text-brand-amber border-brand-amber/30',
  APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-brand-coral/10 text-brand-coral border-brand-coral/30',
}

const CATEGORY_OPTIONS: ExpenseCategoryType[] = [
  'SALARIES',
  'UTILITIES',
  'MAINTENANCE',
  'PROCUREMENT',
  'LIBRARY',
  'TRANSPORT',
  'MISCELLANEOUS',
]

export function ExpensesTab({ academicYear, term }: { academicYear: string; term: number }) {
  const { can } = usePermissions()
  const canCreate = can('finance.createExpense')
  const canApprove = can('finance.approveExpense')
  const canReject = can('finance.rejectExpense')

  const { data: expenses = [], isLoading } = useExpenses({ academicYear, term })
  const { mutate: createExpense, isPending: isCreating } = useCreateExpense()
  const { mutate: uploadReceipt, isPending: isUploading } = useUploadExpenseReceipt()
  const { mutate: viewReceipt, isPending: isFetchingUrl } = useViewExpenseReceipt()
  const { mutate: approveExpense, isPending: isApproving } = useApproveExpense()
  const { mutate: rejectExpense, isPending: isRejecting } = useRejectExpense()

  const [showCreate, setShowCreate] = useState(false)
  const [category, setCategory] = useState<ExpenseCategoryType>('MISCELLANEOUS')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [incurredAt, setIncurredAt] = useState(() => new Date().toISOString().slice(0, 10))
  const [receiptFile, setReceiptFile] = useState<File | null>(null)

  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null)

  function resetCreateForm() {
    setCategory('MISCELLANEOUS')
    setDescription('')
    setAmount('')
    setIncurredAt(new Date().toISOString().slice(0, 10))
    setReceiptFile(null)
  }

  function submitCreate() {
    if (!description.trim() || !amount) return
    const data: CreateExpenseInput = {
      category,
      description: description.trim(),
      amount: Number(amount),
      academicYear,
      term,
      incurredAt,
    }
    createExpense(data, {
      onSuccess: (created) => {
        if (receiptFile) {
          uploadReceipt({ expenseId: created.id, file: receiptFile })
        }
        setShowCreate(false)
        resetCreateForm()
      },
    })
  }

  function handleUploadPick(expenseId: string) {
    setUploadTargetId(expenseId)
    uploadInputRef.current?.click()
  }

  function handleUploadChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file && uploadTargetId) {
      uploadReceipt({ expenseId: uploadTargetId, file })
    }
    e.target.value = ''
    setUploadTargetId(null)
  }

  return (
    <div className="space-y-4">
      {/* Hidden file input shared by every row's "Attach" action */}
      <input
        ref={uploadInputRef}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={handleUploadChange}
        aria-label="Upload expense receipt"
      />

      {canCreate && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 bg-brand-teal text-white px-4 py-2 rounded-lg text-sm font-semibold min-h-[44px]"
            type="button"
          >
            <Plus className="w-4 h-4" /> Log Expense
          </button>
        </div>
      )}

      <div className="bg-surface border border-base rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-base bg-page">
              <th className="text-left px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                Category
              </th>
              <th className="text-left px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                Description
              </th>
              <th className="text-right px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                Amount
              </th>
              <th className="text-left px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                Date
              </th>
              <th className="text-left px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                Status
              </th>
              <th className="text-left px-4 py-3 font-heading text-xs uppercase tracking-wide text-muted font-semibold">
                Receipt
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-base">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="skeleton h-4 rounded w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : expenses.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted">
                  No expenses recorded
                </td>
              </tr>
            ) : (
              expenses.map((e) => (
                <tr key={e.id} className="border-b border-base hover:bg-page">
                  <td className="px-4 py-3">
                    <span className="text-xs bg-brand-navy/8 text-brand-navy px-2 py-0.5 rounded-full font-medium">
                      {e.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted">{e.description}</td>
                  <td className="px-4 py-3 text-right tabular font-semibold">
                    {formatMWK(e.amount)}
                  </td>
                  <td className="px-4 py-3 text-muted text-xs">
                    {format(new Date(e.incurredAt), 'dd MMM yyyy')}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLORS[e.status] ?? ''}`}
                    >
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {e.receiptKey ? (
                      <button
                        onClick={() => viewReceipt(e.id)}
                        disabled={isFetchingUrl}
                        className="flex items-center gap-1 text-xs text-brand-teal hover:underline font-medium min-h-[44px]"
                        type="button"
                        aria-label={`View receipt for ${e.description}`}
                      >
                        <FileText className="w-3.5 h-3.5" /> View
                      </button>
                    ) : canCreate ? (
                      <button
                        onClick={() => handleUploadPick(e.id)}
                        disabled={isUploading}
                        className="flex items-center gap-1 text-xs text-muted hover:text-brand-teal font-medium min-h-[44px]"
                        type="button"
                        aria-label={`Attach receipt for ${e.description}`}
                      >
                        <Paperclip className="w-3.5 h-3.5" /> Attach
                      </button>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {e.status === 'PENDING' && (
                      <div className="flex items-center gap-2 justify-end">
                        {canApprove && (
                          <>
                            <button
                              onClick={() => approveExpense({ expenseId: e.id, paidImmediately: true })}
                              disabled={isApproving}
                              className="flex items-center gap-1 text-xs text-emerald-700 hover:underline font-medium min-h-[44px]"
                              type="button"
                              aria-label={`Approve expense ${e.description} as paid`}
                              title="Approve — already paid in cash"
                            >
                              <Check className="w-3.5 h-3.5" /> Approve (Paid)
                            </button>
                            <button
                              onClick={() => approveExpense({ expenseId: e.id, paidImmediately: false })}
                              disabled={isApproving}
                              className="flex items-center gap-1 text-xs text-brand-amber hover:underline font-medium min-h-[44px]"
                              type="button"
                              aria-label={`Approve expense ${e.description} as owed`}
                              title="Approve — owed to vendor, not yet paid (tracked as a debt)"
                            >
                              <Check className="w-3.5 h-3.5" /> Approve (Owed)
                            </button>
                          </>
                        )}
                        {canReject && (
                          <button
                            onClick={() => rejectExpense(e.id)}
                            disabled={isRejecting}
                            className="flex items-center gap-1 text-xs text-brand-coral hover:underline font-medium min-h-[44px]"
                            type="button"
                            aria-label={`Reject expense ${e.description}`}
                          >
                            <X className="w-3.5 h-3.5" /> Reject
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Log Expense Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-surface rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-heading font-bold text-lg text-brand-navy">Log Expense</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1.5">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ExpenseCategoryType)}
                  className="input w-full"
                  aria-label="Expense category"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Description</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="input w-full"
                  placeholder="What was this expense for?"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Amount (MWK)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="input w-full"
                  placeholder="Enter amount"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Date incurred</label>
                <input
                  type="date"
                  value={incurredAt}
                  onChange={(e) => setIncurredAt(e.target.value)}
                  className="input w-full"
                  aria-label="Date incurred"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Receipt (optional)</label>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                  className="input w-full"
                  aria-label="Receipt file"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCreate(false)
                  resetCreateForm()
                }}
                className="flex-1 border border-base px-4 py-2 rounded-lg text-sm hover:bg-page min-h-[44px]"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={submitCreate}
                disabled={isCreating || !description.trim() || !amount}
                className="flex-1 bg-brand-teal text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60 min-h-[44px]"
                type="button"
              >
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Log Expense
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}