'use client'

/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/approvals/ApprovalDetailDialog.tsx
 * [PURPOSE]: Everything the module recorded about one request, its short
 *   timeline (submitted → decided), and the same decision buttons as the
 *   card — so a reviewer can read the full context and act without leaving.
 */

import Link from 'next/link'
import { Ban, Check, CircleDot, ExternalLink, Info, Undo2, X } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  APPROVAL_MODULE_LABELS,
  APPROVAL_SOURCE_META,
  APPROVAL_STATUS_CONFIG,
  type ApprovalAction,
  type ApprovalItem,
} from '@shared/constants/approvals'
import {
  ACTION_BUTTON_CLASS, StatusBadge, formatDateTime, formatMwk, humanize, statusDetail,
} from './approvalDisplay'

interface Props {
  item: ApprovalItem | null
  onClose: () => void
  onAction: (item: ApprovalItem, action: ApprovalAction) => void
}

const BTN = 'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/40'

export function ApprovalDetailDialog({ item, onClose, onAction }: Props) {
  const meta = item ? APPROVAL_SOURCE_META[item.source] : null
  const caps = item?.capabilities

  return (
    <Dialog open={item !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {item && meta && caps ? (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={item.status} detail={statusDetail(item)} />
                <span className="text-xs text-muted">
                  {item.typeLabel} · {APPROVAL_MODULE_LABELS[item.module]}
                </span>
              </div>
              <DialogTitle className="font-heading break-words">{item.title}</DialogTitle>
              {item.summary ? <DialogDescription>{item.summary}</DialogDescription> : null}
            </DialogHeader>

            {item.amount !== null ? (
              <p className="text-2xl font-bold font-heading text-body">{formatMwk(item.amount)}</p>
            ) : null}

            {item.details.length > 0 ? (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 rounded-xl border border-base bg-page p-4 sm:grid-cols-2">
                {item.details.map((d) => (
                  <div key={`${d.label}-${d.value}`} className="min-w-0">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{d.label}</dt>
                    <dd className="mt-0.5 break-words text-sm text-body">{d.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            <section aria-label="Timeline">
              <h4 className="mb-2 font-heading text-sm font-semibold text-body">Timeline</h4>
              <ol className="space-y-3 border-l border-base pl-4">
                <li className="relative">
                  <CircleDot className="absolute -left-[25px] top-0.5 h-4 w-4 bg-surface text-brand-teal" aria-hidden="true" />
                  <p className="text-sm font-medium text-body">
                    Submitted by {item.isMine ? 'you' : item.requester.name}
                    {item.requester.role ? ` (${humanize(item.requester.role)})` : ''}
                  </p>
                  <p className="text-xs text-muted">{formatDateTime(item.createdAt)}</p>
                </li>
                <li className="relative">
                  <CircleDot
                    className={`absolute -left-[25px] top-0.5 h-4 w-4 bg-surface ${item.status === 'PENDING' ? 'text-amber-500' : 'text-brand-teal'}`}
                    aria-hidden="true"
                  />
                  {item.status === 'PENDING' ? (
                    <p className="text-sm font-medium text-body">Awaiting a decision</p>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-body">
                        {APPROVAL_STATUS_CONFIG[item.status].label}
                        {item.decidedBy ? ` by ${item.decidedBy.name}` : ''}
                      </p>
                      {item.decidedAt ? <p className="text-xs text-muted">{formatDateTime(item.decidedAt)}</p> : null}
                      {item.decisionNotes ? (
                        <p className="mt-1 rounded-lg border border-base bg-page px-3 py-2 text-sm text-body">
                          {item.decisionNotes}
                        </p>
                      ) : null}
                    </>
                  )}
                </li>
                {item.expiresAt && item.status === 'PENDING' ? (
                  <li className="text-xs text-muted">Expires {formatDateTime(item.expiresAt)} if not decided.</li>
                ) : null}
              </ol>
            </section>

            {item.payload ? (
              <details className="rounded-xl border border-base p-3 text-sm">
                <summary className="cursor-pointer font-semibold text-body">Requested change (raw data)</summary>
                <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-page p-3 text-xs text-muted">
                  {JSON.stringify(item.payload, null, 2)}
                </pre>
              </details>
            ) : null}

            {caps.blockedReason ? (
              <p className="flex items-start gap-1.5 text-xs text-muted">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {caps.blockedReason}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-base pt-4">
              {caps.canApprove ? (
                <button type="button" className={`${BTN} ${ACTION_BUTTON_CLASS.approve}`} onClick={() => onAction(item, 'approve')}>
                  <Check className="h-4 w-4" aria-hidden="true" /> {meta.approveLabel}
                </button>
              ) : null}
              {caps.canReturn ? (
                <button type="button" className={`${BTN} ${ACTION_BUTTON_CLASS.neutral}`} onClick={() => onAction(item, 'return')}>
                  <Undo2 className="h-4 w-4" aria-hidden="true" /> {meta.returnLabel}
                </button>
              ) : null}
              {caps.canReject ? (
                <button type="button" className={`${BTN} ${ACTION_BUTTON_CLASS.reject}`} onClick={() => onAction(item, 'reject')}>
                  <X className="h-4 w-4" aria-hidden="true" /> {meta.rejectLabel}
                </button>
              ) : null}
              {caps.canCancel ? (
                <button type="button" className={`${BTN} ${ACTION_BUTTON_CLASS.neutral}`} onClick={() => onAction(item, 'cancel')}>
                  <Ban className="h-4 w-4" aria-hidden="true" /> Withdraw
                </button>
              ) : null}
              <Link href={item.href} className={`${BTN} ${ACTION_BUTTON_CLASS.neutral} sm:ml-auto`}>
                <ExternalLink className="h-4 w-4" aria-hidden="true" /> Open in {APPROVAL_MODULE_LABELS[item.module]}
              </Link>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
