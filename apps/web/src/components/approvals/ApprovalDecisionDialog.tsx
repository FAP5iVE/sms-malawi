'use client'

/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/approvals/ApprovalDecisionDialog.tsx
 * [PURPOSE]: The confirmation step for every decision — approve, reject,
 *   return, withdraw, single or bulk. It says what will happen, collects the
 *   reason (required on reject / return so the requester knows what to fix),
 *   and — for expenses — asks whether the money has already been paid, which
 *   decides the ledger account the approval posts to.
 *
 *   Mount it with a `key` derived from the target so its fields reset for
 *   each new decision.
 */

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  APPROVAL_NOTES_MAX,
  APPROVAL_SOURCE_META,
  type ApprovalAction,
  type ApprovalItem,
} from '@shared/constants/approvals'
import { ACTION_BUTTON_CLASS } from './approvalDisplay'

export interface DecisionTarget {
  items: ApprovalItem[]
  action: ApprovalAction
}

interface Props {
  target: DecisionTarget | null
  busy: boolean
  error: string | null
  onClose: () => void
  onConfirm: (value: { notes: string; paidImmediately: boolean }) => void
}

const GENERIC_VERB: Record<ApprovalAction, string> = {
  approve: 'Approve',
  reject: 'Reject',
  return: 'Return',
  cancel: 'Withdraw',
}

export function ApprovalDecisionDialog({ target, busy, error, onClose, onConfirm }: Props) {
  const [notes, setNotes] = useState('')
  const [paid, setPaid] = useState(true)

  const items = target?.items ?? []
  const action = target?.action ?? 'approve'
  const first = items[0]
  const single = items.length === 1 && first ? APPROVAL_SOURCE_META[first.source] : null

  const reasonRequired =
    (action === 'reject' || action === 'return') && items.some((i) => APPROVAL_SOURCE_META[i.source].reasonRequired)
  const showNotes = action !== 'cancel'
  const hasExpense = action === 'approve' && items.some((i) => i.source === 'expense')

  const verb = single
    ? action === 'approve' ? single.approveLabel
      : action === 'reject' ? single.rejectLabel
      : action === 'return' ? single.returnLabel
      : 'Withdraw request'
    : GENERIC_VERB[action]

  const title = items.length > 1 ? `${verb} ${items.length} requests` : verb
  const hint =
    action === 'approve' && single?.approveHint
      ? single.approveHint
      : action === 'cancel'
        ? 'The reviewer will no longer see this request. You can submit a new one later.'
        : null

  const canConfirm = !busy && (!reasonRequired || notes.trim().length > 0)
  const confirmClass =
    action === 'approve' ? ACTION_BUTTON_CLASS.approve
    : action === 'reject' ? 'bg-red-600 text-white hover:bg-red-700'
    : 'bg-brand-navy text-white hover:opacity-90'

  return (
    <Dialog open={target !== null} onOpenChange={(open) => { if (!open && !busy) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-heading">{title}</DialogTitle>
          <DialogDescription>
            {items.length === 1 && first ? first.title : `${items.length} selected requests`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {hint ? <p className="rounded-lg bg-page px-3 py-2 text-sm text-muted">{hint}</p> : null}

          {hasExpense ? (
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-body">
              <input
                type="checkbox"
                checked={paid}
                onChange={(e) => setPaid(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--brand-teal,#0d9488)]"
              />
              <span>
                <span className="font-semibold">Already paid</span>
                <span className="block text-muted">
                  Posts to Cash. Untick if the amount is still owed — it will post to Accounts Payable
                  and can be cleared later with “Mark paid”.
                </span>
              </span>
            </label>
          ) : null}

          {showNotes ? (
            <div>
              <label htmlFor="approval-notes" className="mb-1.5 block text-sm font-semibold text-body">
                {reasonRequired ? 'Reason (required)' : 'Note (optional)'}
              </label>
              <textarea
                id="approval-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, APPROVAL_NOTES_MAX))}
                rows={3}
                placeholder={
                  reasonRequired
                    ? 'Tell the requester what to change or why this was declined…'
                    : 'Add a note for the requester…'
                }
                className="w-full rounded-xl border border-base bg-page px-3 py-2.5 text-sm text-body placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-teal/25"
              />
              <p className="mt-1 text-right text-xs text-muted">{notes.length}/{APPROVAL_NOTES_MAX}</p>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-base px-4 py-2 text-sm font-semibold text-body hover:bg-page disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm({ notes: notes.trim(), paidImmediately: paid })}
            className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${confirmClass}`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {busy ? 'Working…' : `Confirm — ${verb}`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
