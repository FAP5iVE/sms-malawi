/**
 * [CHANGE TYPE]: TARGETED EDIT (OVERHAUL)
 * [FILE]: apps/web/src/components/placements/PlacementStatusBadge.tsx
 * [PURPOSE]: A small colored pill for a PlacementStatus value. Redesigned
 *   for the reference module's three-status workflow (PENDING_APPROVAL,
 *   CONFIRMED, REJECTED) — the old seven-value pipeline states
 *   (NOT_STARTED/ELIGIBILITY_COMPUTED/CHOICES_RECORDED/PLACED/DECLINED/
 *   NOT_PLACED) no longer exist.
 * [DEPENDS ON]: lucide-react
 */
import { Clock, CheckCircle2, XCircle } from 'lucide-react'

type PlacementStatusValue = 'PENDING_APPROVAL' | 'CONFIRMED' | 'REJECTED'

const STATUS_META: Record<PlacementStatusValue, { label: string; className: string; Icon: typeof Clock }> = {
  PENDING_APPROVAL: {
    label: 'Pending Approval',
    className: 'text-status-warning',
    Icon: Clock,
  },
  CONFIRMED: {
    label: 'Confirmed',
    className: 'text-status-success',
    Icon: CheckCircle2,
  },
  REJECTED: {
    label: 'Rejected',
    className: 'text-status-danger',
    Icon: XCircle,
  },
}

export function PlacementStatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status as PlacementStatusValue] ?? {
    label: status,
    className: 'text-muted',
    Icon: Clock,
  }
  const { label, className, Icon } = meta

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-semibold ${className}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  )
}
