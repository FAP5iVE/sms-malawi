/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/approvals/approvalDisplay.tsx
 * [PURPOSE]: Presentation helpers shared by the Approvals Hub components —
 *   module icons, status badge, relative/absolute time and money formatting.
 *   Kept separate so the card, the dialogs and the dashboard widget all
 *   render a status or an amount identically.
 */

import {
  Award, Banknote, BookOpen, Briefcase, CalendarClock, GraduationCap, Megaphone,
  Package, ShoppingCart, UserCheck, Building2, type LucideIcon,
} from 'lucide-react'
import {
  APPROVAL_STATUS_CONFIG,
  type ApprovalItem,
  type ApprovalModule,
  type ApprovalStatus,
  type ApprovalStatusTone,
} from '@shared/constants/approvals'

export const MODULE_ICONS: Record<ApprovalModule, LucideIcon> = {
  students:      GraduationCap,
  classes:       Building2,
  academics:     CalendarClock,
  admissions:    UserCheck,
  hr:            Briefcase,
  finance:       Banknote,
  library:       BookOpen,
  assets:        Package,
  procurement:   ShoppingCart,
  placements:    Award,
  announcements: Megaphone,
}

const TONE_CLASS: Record<ApprovalStatusTone, string> = {
  warning: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  success: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  danger:  'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
  neutral: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30',
  muted:   'bg-slate-500/10 text-muted border-slate-500/20',
}

export function humanize(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
}

/** The module's own status, when it says something the unified status doesn't. */
export function statusDetail(item: Pick<ApprovalItem, 'status' | 'sourceStatus'>): string | null {
  const raw = humanize(item.sourceStatus)
  if (raw.toLowerCase() === APPROVAL_STATUS_CONFIG[item.status].label.toLowerCase()) return null
  if (item.status === 'PENDING') return raw === 'Under Review' ? raw : null
  return raw
}

export function StatusBadge({ status, detail }: { status: ApprovalStatus; detail?: string | null }) {
  const cfg = APPROVAL_STATUS_CONFIG[status]
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASS[cfg.tone]}`}
    >
      {cfg.label}
      {detail ? <span className="font-normal opacity-80">· {detail}</span> : null}
    </span>
  )
}

export function timeAgo(iso: string): string {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return ''
  const minutes = Math.floor((Date.now() - then) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatDate(iso)
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${formatDate(iso)}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

export function formatMwk(value: number): string {
  return `MWK ${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

export const ACTION_BUTTON_CLASS = {
  approve: 'bg-brand-teal text-white hover:opacity-90',
  reject:  'border border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10',
  neutral: 'border border-base text-body hover:bg-page',
} as const
