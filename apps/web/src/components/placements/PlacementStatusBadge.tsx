/**
 * [CHANGE TYPE]: TARGETED EDIT (OVERHAUL)
 * [FILE]: apps/web/src/components/placements/PlacementStatusBadge.tsx
 * [PURPOSE]: A coloured status word (StatusText) for a PlacementStatus value. Redesigned
 *   for the reference module's three-status workflow (PENDING_APPROVAL,
 *   CONFIRMED, REJECTED) — the old seven-value pipeline states
 *   (NOT_STARTED/ELIGIBILITY_COMPUTED/CHOICES_RECORDED/PLACED/DECLINED/
 *   NOT_PLACED) no longer exist.
 * [DEPENDS ON]: StatusText
 */
import { StatusText, type StatusTone } from '@/components/shared/StatusText'

type PlacementStatusValue = 'PENDING_APPROVAL' | 'CONFIRMED' | 'REJECTED'

// Hills 8b-1 (R2): status words use the shared StatusText, so the shape in front
// of the word (not a colour or an icon) carries the meaning too.
const STATUS_META: Record<PlacementStatusValue, { label: string; tone: StatusTone }> = {
  PENDING_APPROVAL: { label: 'Pending approval', tone: 'warning' },
  CONFIRMED: { label: 'Confirmed', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
}

export function PlacementStatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status as PlacementStatusValue] ?? { label: status, tone: 'neutral' as StatusTone }
  return <StatusText tone={meta.tone}>{meta.label}</StatusText>
}
