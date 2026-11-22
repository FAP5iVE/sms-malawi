/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: packages/shared/constants/pendingActions.ts
 * [R-PHASE]: R16 — Constants Centralization (Phase 10B Plan)
 * [PURPOSE]: Pending-action presentation + policy constants.
 *   PENDING_ACTION_LABELS and PENDING_ACTION_STATUS_CONFIG moved from
 *   PendingActionsPanel.tsx; PENDING_ACTION_REVIEWER_ROLES moved from
 *   pendingActionService.ts's inline REVIEWER_ROLES.
 *
 *   NOTE: the status config carries an `icon` NAME (string), not a React
 *   component, so this module stays framework-free in packages/shared.
 *   PendingActionsPanel.tsx maps the name to a lucide-react icon at render.
 * [DEPENDS ON]: @shared/types/roles (UserRole)
 */
import type { UserRole } from '../types/roles'

// ─── ACTION LABELS ───────────────────────────────────────
export const PENDING_ACTION_LABELS: Record<string, string> = {
  'student.create': 'Create Student',
  'student.edit': 'Edit Student',
  'student.softDelete': 'Delete Student',
  'student.statusChange': 'Change Student Status',
  'class.create': 'Create Class',
  'class.edit': 'Edit Class',
  'class.softDelete': 'Delete Class',
  'timetable.slotCreate': 'Add Timetable Slot',
  'timetable.slotEdit': 'Edit Timetable Slot',
  'timetable.slotDelete': 'Remove Timetable Slot',
  'announcement.publish': 'Publish Announcement',
  'announcement.classPublish': 'Publish Class Announcement',
  'hr.leaveApproval': 'Leave Request',
  'application.statusChange': 'Change Application Status',
}

// ─── STATUS DISPLAY CONFIG ───────────────────────────────
export type PendingActionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED'

/** Lucide icon name keys — resolved to components in PendingActionsPanel.tsx. */
export type PendingActionIconName = 'clock' | 'check' | 'x' | 'alert'

export const PENDING_ACTION_STATUS_CONFIG: Record<
  PendingActionStatus,
  { label: string; icon: PendingActionIconName; badgeClass: string }
> = {
  PENDING:   { label: 'Pending',   icon: 'clock', badgeClass: 'text-status-warning' },
  APPROVED:  { label: 'Approved',  icon: 'check', badgeClass: 'text-status-success' },
  REJECTED:  { label: 'Rejected',  icon: 'x',     badgeClass: 'text-status-danger' },
  CANCELLED: { label: 'Cancelled', icon: 'x',     badgeClass: 'text-status-neutral' },
  EXPIRED:   { label: 'Expired',   icon: 'alert', badgeClass: 'text-status-neutral' },
}

// ─── REVIEWER ROLES ──────────────────────────────────────
/** Roles permitted to approve/reject a pending action. */
export const PENDING_ACTION_REVIEWER_ROLES: readonly UserRole[] = ['admin', 'high_rank']
