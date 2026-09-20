/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: packages/shared/constants/approvals.ts
 * [PURPOSE]: The single shared contract for the Approvals Hub (/approvals).
 *
 *   The hub is a read-through aggregator: every module that has an approval
 *   step (leave, loans, expenses, payroll, fine waivers, procurement, …)
 *   keeps its own status on its own table, and one server-side ADAPTER per
 *   module (apps/web/src/server/services/approvals/) normalises those rows
 *   into the `ApprovalItem` shape below. Decisions are delegated back to the
 *   module's own service function, so each module's guards and side effects
 *   (budget spend, journal posting, leave balances, …) stay where they are.
 *
 *   This file is framework-free (no React, no Prisma, no Express) so the
 *   server, the hooks and the UI all read the same source keys, labels and
 *   permission gates.
 *
 * [DEPENDS ON]: ../types/permissions, ../types/roles
 */

import { hasAnyPermission, type Permission } from '../types/permissions'
import type { UserRole } from '../types/roles'

// ─── STATUS ───────────────────────────────────────────────

export const APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'] as const
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number]

export type ApprovalStatusTone = 'warning' | 'success' | 'danger' | 'neutral' | 'muted'

export const APPROVAL_STATUS_CONFIG: Record<ApprovalStatus, { label: string; tone: ApprovalStatusTone }> = {
  PENDING:   { label: 'Pending',   tone: 'warning' },
  APPROVED:  { label: 'Approved',  tone: 'success' },
  REJECTED:  { label: 'Rejected',  tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  EXPIRED:   { label: 'Expired',   tone: 'muted' },
}

// ─── MODULES ──────────────────────────────────────────────

export const APPROVAL_MODULES = [
  'students',
  'classes',
  'academics',
  'admissions',
  'hr',
  'finance',
  'library',
  'assets',
  'procurement',
  'placements',
  'announcements',
] as const
export type ApprovalModule = (typeof APPROVAL_MODULES)[number]

export const APPROVAL_MODULE_LABELS: Record<ApprovalModule, string> = {
  students:      'Students',
  classes:       'Classes',
  academics:     'Exams & Timetable',
  admissions:    'Admissions',
  hr:            'HR',
  finance:       'Finance',
  library:       'Library',
  assets:        'Assets',
  procurement:   'Procurement',
  placements:    'Placements',
  announcements: 'Announcements',
}

// ─── SOURCES ──────────────────────────────────────────────

export const APPROVAL_SOURCES = [
  'pending_action',
  'leave',
  'loan',
  'expense',
  'payroll',
  'fine_waiver',
  'book_recommendation',
  'digital_resource',
  'asset_request',
  'requisition',
  'purchase_order',
  'timetable_slot',
  'exam_results',
  'application',
  'placement_claim',
  'announcement',
] as const
export type ApprovalSource = (typeof APPROVAL_SOURCES)[number]

export function isApprovalSource(value: string): value is ApprovalSource {
  return (APPROVAL_SOURCES as readonly string[]).includes(value)
}

/**
 * Who may perform an action. A user passes the gate when their role is in
 * `roles` OR they hold ANY permission in `anyPermission`. The gates below
 * deliberately mirror the guard on each module's own approve/reject route so
 * the hub never grants more (or less) than the module itself does.
 */
export interface ApprovalGate {
  roles?: readonly UserRole[]
  anyPermission?: readonly Permission[]
}

export interface ApprovalSourceMeta {
  source: ApprovalSource
  module: ApprovalModule
  /** Noun shown on cards: "Leave request", "Purchase order", … */
  typeLabel: string
  approve: ApprovalGate
  /** Omitted → the source has no reject path. */
  reject?: ApprovalGate
  /** Omitted → the source has no "return for changes" path. */
  return?: ApprovalGate
  approveLabel: string
  rejectLabel: string
  returnLabel: string
  /** Reject / return must carry a written reason. */
  reasonRequired: boolean
  /** The requester can withdraw their own pending request. */
  requesterCanCancel: boolean
  /** A reviewer may not decide a request they submitted themselves. */
  blockSelfReview: boolean
  /** Where the record lives in the app — "Open in module". */
  href: string
  /** One-line note shown in the review dialog about what approving does. */
  approveHint: string | null
}

const REVIEWER_ROLES: readonly UserRole[] = ['admin', 'high_rank']

export const APPROVAL_SOURCE_META: Record<ApprovalSource, ApprovalSourceMeta> = {
  pending_action: {
    source: 'pending_action',
    module: 'students',
    typeLabel: 'Record change',
    approve: { roles: REVIEWER_ROLES, anyPermission: ['student.approvePendingAction', 'class.approvePendingAction'] },
    reject:  { roles: REVIEWER_ROLES, anyPermission: ['student.approvePendingAction', 'class.approvePendingAction'] },
    approveLabel: 'Approve & apply',
    rejectLabel: 'Reject',
    returnLabel: 'Return',
    reasonRequired: true,
    requesterCanCancel: true,
    blockSelfReview: true,
    href: '/students',
    approveHint: 'Approving applies the requested change immediately.',
  },
  leave: {
    source: 'leave',
    module: 'hr',
    typeLabel: 'Leave request',
    approve: { roles: ['admin', 'hr', 'high_rank'] },
    reject:  { roles: ['admin', 'hr', 'high_rank'] },
    approveLabel: 'Approve leave',
    rejectLabel: 'Reject',
    returnLabel: 'Return',
    reasonRequired: true,
    requesterCanCancel: true,
    blockSelfReview: true,
    href: '/hr',
    approveHint: 'Approving deducts the days from the staff member’s leave balance.',
  },
  loan: {
    source: 'loan',
    module: 'hr',
    typeLabel: 'Staff loan',
    approve: { anyPermission: ['hr.approveLoan'] },
    reject:  { anyPermission: ['hr.approveLoan'] },
    approveLabel: 'Approve loan',
    rejectLabel: 'Reject',
    returnLabel: 'Return',
    reasonRequired: true,
    requesterCanCancel: false,
    blockSelfReview: true,
    href: '/hr',
    approveHint: 'Approved loans still need to be disbursed from HR before deductions start.',
  },
  expense: {
    source: 'expense',
    module: 'finance',
    typeLabel: 'Expense',
    approve: { roles: ['admin', 'high_rank'] },
    reject:  { anyPermission: ['finance.rejectExpense'] },
    approveLabel: 'Approve expense',
    rejectLabel: 'Reject',
    returnLabel: 'Return',
    reasonRequired: true,
    requesterCanCancel: false,
    blockSelfReview: true,
    href: '/finances',
    approveHint: 'Approving posts the expense to the ledger and updates the budget.',
  },
  payroll: {
    source: 'payroll',
    module: 'finance',
    typeLabel: 'Payroll run',
    approve: { anyPermission: ['finance.approvePayroll'] },
    return:  { anyPermission: ['finance.approvePayroll'] },
    approveLabel: 'Approve payroll',
    rejectLabel: 'Reject',
    returnLabel: 'Return to Finance',
    reasonRequired: true,
    requesterCanCancel: false,
    blockSelfReview: true,
    href: '/finances',
    approveHint: 'An approved run can then be locked and paid by Finance.',
  },
  fine_waiver: {
    source: 'fine_waiver',
    module: 'library',
    typeLabel: 'Fine waiver',
    approve: { anyPermission: ['library.waiveFine', 'finance.waiveFine'] },
    reject:  { anyPermission: ['library.waiveFine', 'finance.waiveFine'] },
    approveLabel: 'Waive fine',
    rejectLabel: 'Reject',
    returnLabel: 'Return',
    reasonRequired: true,
    requesterCanCancel: false,
    blockSelfReview: true,
    href: '/library',
    approveHint: 'Approving clears the fine from the borrower’s balance.',
  },
  book_recommendation: {
    source: 'book_recommendation',
    module: 'library',
    typeLabel: 'Book recommendation',
    approve: { anyPermission: ['library.approveRecommendation'] },
    reject:  { anyPermission: ['library.approveRecommendation'] },
    approveLabel: 'Approve',
    rejectLabel: 'Decline',
    returnLabel: 'Return',
    reasonRequired: true,
    requesterCanCancel: false,
    blockSelfReview: false,
    href: '/library',
    approveHint: null,
  },
  digital_resource: {
    source: 'digital_resource',
    module: 'library',
    typeLabel: 'Digital resource',
    approve: { anyPermission: ['library.approveDigitalResource'] },
    approveLabel: 'Approve & publish',
    rejectLabel: 'Reject',
    returnLabel: 'Return',
    reasonRequired: false,
    requesterCanCancel: false,
    blockSelfReview: true,
    href: '/library',
    approveHint: 'Approving makes the file visible in the digital library.',
  },
  asset_request: {
    source: 'asset_request',
    module: 'assets',
    typeLabel: 'Asset request',
    approve: { anyPermission: ['assets.approveRequest'] },
    reject:  { anyPermission: ['assets.approveRequest'] },
    approveLabel: 'Approve request',
    rejectLabel: 'Reject',
    returnLabel: 'Return',
    reasonRequired: true,
    requesterCanCancel: false,
    blockSelfReview: true,
    href: '/assets',
    approveHint: null,
  },
  requisition: {
    source: 'requisition',
    module: 'procurement',
    typeLabel: 'Purchase requisition',
    approve: { anyPermission: ['procurement.reviewRequisition'] },
    reject:  { anyPermission: ['procurement.reviewRequisition'] },
    return:  { anyPermission: ['procurement.reviewRequisition'] },
    approveLabel: 'Approve requisition',
    rejectLabel: 'Reject',
    returnLabel: 'Return for changes',
    reasonRequired: true,
    requesterCanCancel: true,
    blockSelfReview: true,
    href: '/assets',
    approveHint: 'Approving reserves the requested amount against the budget.',
  },
  purchase_order: {
    source: 'purchase_order',
    module: 'procurement',
    typeLabel: 'Purchase order',
    approve: { anyPermission: ['procurement.managePurchaseOrders'] },
    reject:  { anyPermission: ['procurement.managePurchaseOrders'] },
    approveLabel: 'Approve PO',
    rejectLabel: 'Cancel PO',
    returnLabel: 'Return',
    reasonRequired: true,
    requesterCanCancel: false,
    blockSelfReview: true,
    href: '/assets',
    approveHint: null,
  },
  timetable_slot: {
    source: 'timetable_slot',
    module: 'academics',
    typeLabel: 'Timetable slot',
    approve: { anyPermission: ['timetable.approve'] },
    reject:  { anyPermission: ['timetable.approve'] },
    approveLabel: 'Approve slot',
    rejectLabel: 'Reject slot',
    returnLabel: 'Return',
    reasonRequired: true,
    requesterCanCancel: false,
    blockSelfReview: false,
    href: '/timetable',
    approveHint: 'Approved slots become visible on the class timetable.',
  },
  exam_results: {
    source: 'exam_results',
    module: 'academics',
    typeLabel: 'Exam results',
    approve: { anyPermission: ['exam.approveResults'] },
    return:  { anyPermission: ['exam.unlockMarks'] },
    approveLabel: 'Approve results',
    rejectLabel: 'Reject',
    returnLabel: 'Send back for correction',
    reasonRequired: true,
    requesterCanCancel: false,
    blockSelfReview: false,
    href: '/exams',
    approveHint: 'Approved results still need High Rank authorisation before students see them.',
  },
  application: {
    source: 'application',
    module: 'admissions',
    typeLabel: 'Admission application',
    approve: { anyPermission: ['application.approve'] },
    reject:  { anyPermission: ['application.deny'] },
    approveLabel: 'Approve application',
    rejectLabel: 'Deny',
    returnLabel: 'Return',
    reasonRequired: true,
    requesterCanCancel: false,
    blockSelfReview: false,
    href: '/applications',
    approveHint: 'An approved application can then be converted into a student record.',
  },
  placement_claim: {
    source: 'placement_claim',
    module: 'placements',
    typeLabel: 'Placement claim',
    approve: { anyPermission: ['placement.verifyOutcome'] },
    reject:  { anyPermission: ['placement.verifyOutcome'] },
    approveLabel: 'Confirm placement',
    rejectLabel: 'Reject claim',
    returnLabel: 'Return',
    reasonRequired: true,
    requesterCanCancel: false,
    blockSelfReview: false,
    href: '/placements',
    approveHint: 'Confirmed placements count in the school’s placement analytics.',
  },
  announcement: {
    source: 'announcement',
    module: 'announcements',
    typeLabel: 'Announcement',
    approve: { anyPermission: ['announcement.approvePublish'] },
    reject:  { anyPermission: ['announcement.reject'] },
    approveLabel: 'Approve & publish',
    rejectLabel: 'Reject',
    returnLabel: 'Return',
    reasonRequired: true,
    requesterCanCancel: false,
    blockSelfReview: true,
    href: '/announcements',
    approveHint: 'Approving publishes the announcement to its audience immediately.',
  },
}

// ─── DTOs ─────────────────────────────────────────────────

export interface ApprovalPerson {
  uid: string | null
  name: string
  /** Role snapshot at submission time, when the module records one. */
  role: string | null
}

export interface ApprovalDetail {
  label: string
  value: string
}

export interface ApprovalCapabilities {
  canApprove: boolean
  canReject: boolean
  canReturn: boolean
  canCancel: boolean
  /** Set when a rule (not a missing permission) blocks the viewer, e.g. own request. */
  blockedReason: string | null
}

export interface ApprovalItem {
  /** `${source}:${sourceId}` — stable React key and bulk-action handle. */
  key: string
  source: ApprovalSource
  sourceId: string
  module: ApprovalModule
  typeLabel: string
  title: string
  summary: string | null
  status: ApprovalStatus
  /** The module's own status value ("UNDER_REVIEW", "SUBMITTED", …). */
  sourceStatus: string
  requester: ApprovalPerson
  /** Monetary value in MWK when the request has one. */
  amount: number | null
  details: ApprovalDetail[]
  /** Raw requested change for generic pending actions; otherwise null. */
  payload: Record<string, unknown> | null
  createdAt: string
  decidedAt: string | null
  decidedBy: ApprovalPerson | null
  decisionNotes: string | null
  expiresAt: string | null
  href: string
  isMine: boolean
  capabilities: ApprovalCapabilities
}

export type ApprovalScope = 'all' | 'review' | 'mine'
export type ApprovalSort = 'newest' | 'oldest'

export interface ApprovalListParams {
  scope?: ApprovalScope
  status?: ApprovalStatus
  module?: ApprovalModule
  source?: ApprovalSource
  search?: string
  from?: string
  to?: string
  sort?: ApprovalSort
  page?: number
  pageSize?: number
}

export interface ApprovalListResult {
  items: ApprovalItem[]
  page: number
  pageSize: number
  /** More rows exist beyond this page. Exact totals come from ApprovalSummary. */
  hasMore: boolean
  /** Modules that could not be read this time (the rest still loaded). */
  warnings: string[]
}

export interface ApprovalSummary {
  scope: ApprovalScope
  byStatus: Record<ApprovalStatus, number>
  /** Pending count per module within the scope — feeds the module filter. */
  pendingByModule: Partial<Record<ApprovalModule, number>>
  /** Pending items the viewer can act on (excludes their own requests). */
  awaitingMyReview: number
  /** The viewer's own requests still waiting for a decision. */
  myPending: number
  /** True when the viewer can review at least one kind of request. */
  canReview: boolean
  warnings: string[]
}

export type ApprovalAction = 'approve' | 'reject' | 'return' | 'cancel'

export interface ApprovalDecisionResult {
  key: string
  ok: boolean
  error?: string
}

export interface ApprovalBulkResult {
  results: ApprovalDecisionResult[]
  succeeded: number
  failed: number
}

/** Does this role pass the gate (listed role OR any listed permission)? */
export function passesApprovalGate(role: UserRole, gate: ApprovalGate | undefined): boolean {
  if (!gate) return false
  if (gate.roles?.includes(role)) return true
  if (gate.anyPermission && gate.anyPermission.length > 0) return hasAnyPermission(role, gate.anyPermission)
  return false
}

/** May this role take ANY decision (approve, reject or return) on this kind of request? */
export function canReviewApprovalSource(role: UserRole, meta: ApprovalSourceMeta): boolean {
  return (
    passesApprovalGate(role, meta.approve) ||
    passesApprovalGate(role, meta.reject) ||
    passesApprovalGate(role, meta.return)
  )
}

export const APPROVAL_BULK_LIMIT = 50
export const APPROVAL_NOTES_MAX = 500
