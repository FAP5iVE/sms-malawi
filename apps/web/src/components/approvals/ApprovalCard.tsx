'use client'

/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/approvals/ApprovalCard.tsx
 * [PURPOSE]: One request in the Approvals list — what it is, who asked, how
 *   much, where it stands, and exactly the actions THIS viewer may take
 *   (the server decides; the card only renders `item.capabilities`).
 */

import Link from 'next/link'
import { Ban, Check, ExternalLink, Eye, Info, Undo2, X } from 'lucide-react'
import {
  APPROVAL_MODULE_LABELS,
  APPROVAL_SOURCE_META,
  type ApprovalAction,
  type ApprovalItem,
} from '@shared/constants/approvals'
import {
  ACTION_BUTTON_CLASS, MODULE_ICONS, StatusBadge, formatDate, formatMwk, humanize, statusDetail, timeAgo,
} from './approvalDisplay'

interface ApprovalCardProps {
  item: ApprovalItem
  selectable: boolean
  selected: boolean
  onToggleSelect: (key: string) => void
  onOpen: (item: ApprovalItem) => void
  onAction: (item: ApprovalItem, action: ApprovalAction) => void
}

const BTN = 'inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal/40'

export function ApprovalCard({ item, selectable, selected, onToggleSelect, onOpen, onAction }: ApprovalCardProps) {
  const meta = APPROVAL_SOURCE_META[item.source]
  const Icon = MODULE_ICONS[item.module]
  const caps = item.capabilities
  const hasAction = caps.canApprove || caps.canReject || caps.canReturn || caps.canCancel
  const detail = statusDetail(item)

  return (
    <article
      className={`rounded-xl border bg-surface p-4 transition-colors ${selected ? 'border-brand-teal' : 'border-base'}`}
      aria-label={`${item.typeLabel}: ${item.title}`}
    >
      <div className="flex items-start gap-3">
        {selectable ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(item.key)}
            aria-label={`Select ${item.title}`}
            className="mt-1.5 h-5 w-5 shrink-0 cursor-pointer accent-[var(--brand-teal,#0d9488)]"
          />
        ) : null}

        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-teal/10 text-brand-teal">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-heading text-base font-semibold text-body break-words">{item.title}</h3>
              <p className="text-xs text-muted">
                {item.typeLabel} · {APPROVAL_MODULE_LABELS[item.module]} · {timeAgo(item.createdAt)}
              </p>
            </div>
            <StatusBadge status={item.status} detail={detail} />
          </div>

          {item.summary ? <p className="mt-2 line-clamp-2 text-sm text-muted">{item.summary}</p> : null}

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            <span>
              Requested by{' '}
              <span className="font-medium text-body">{item.isMine ? 'you' : item.requester.name}</span>
              {item.requester.role && !item.isMine ? ` (${humanize(item.requester.role)})` : ''}
            </span>
            {item.amount !== null ? (
              <span className="rounded-full bg-page px-2.5 py-0.5 text-xs font-semibold text-body">
                {formatMwk(item.amount)}
              </span>
            ) : null}
            {item.status !== 'PENDING' && item.decidedAt ? (
              <span>
                {item.decidedBy ? `by ${item.decidedBy.name} · ` : ''}
                {formatDate(item.decidedAt)}
              </span>
            ) : null}
          </div>

          {item.status !== 'PENDING' && item.decisionNotes ? (
            <p className="mt-2 rounded-lg border border-base bg-page px-3 py-2 text-sm text-body">
              <span className="font-semibold">{item.status === 'REJECTED' ? 'Reason: ' : 'Note: '}</span>
              {item.decisionNotes}
            </p>
          ) : null}

          {caps.blockedReason ? (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {caps.blockedReason}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
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

            <span className={hasAction ? 'sm:ml-auto flex items-center gap-2' : 'flex items-center gap-2'}>
              <button type="button" className={`${BTN} ${ACTION_BUTTON_CLASS.neutral}`} onClick={() => onOpen(item)}>
                <Eye className="h-4 w-4" aria-hidden="true" /> Details
              </button>
              <Link href={item.href} className={`${BTN} ${ACTION_BUTTON_CLASS.neutral}`}>
                <ExternalLink className="h-4 w-4" aria-hidden="true" /> Open
              </Link>
            </span>
          </div>
        </div>
      </div>
    </article>
  )
}
