import 'server-only'

import { prisma }                  from '@/lib/prisma'
import { logger }                  from '@/lib/logger'
import * as auditService           from '@/server/services/auditService'
import { sendPendingActionCreated }from '@/server/services/notificationService'
import {Prisma, type PendingActionStatus } from '@prisma/client'
import type { UserRole }           from '@shared/types/roles'
import { PENDING_ACTION_REVIEWER_ROLES } from '@shared/constants/pendingActions'
import { applyApproved } from '@/server/services/pendingActionExecutor'

// ─────────────────────────────────────────────────────────
//  ALLOWED ACTIONS
//  Every action string that may appear in a PendingAction record.
//  Keeps the data consistent and prevents arbitrary strings.
// ─────────────────────────────────────────────────────────

export const PENDING_ACTION_TYPES = [
  // ── Students
  'student.create',
  'student.edit',
  'student.softDelete',
  'student.statusChange',
  // ── Classes
  'class.create',
  'class.edit',
  'class.softDelete',
  // ── Timetable
  'timetable.slotCreate',
  'timetable.slotEdit',
  'timetable.slotDelete',
  // ── Announcements
  'announcement.publish',
  'announcement.classPublish',   // student → teacher approval
  // ── HR
  'hr.leaveApproval',            // secondary approval path
  // ── Applications
  'application.statusChange',
] as const

export type PendingActionType = typeof PENDING_ACTION_TYPES[number]

// ─────────────────────────────────────────────────────────
//  INPUT / OUTPUT TYPES
// ─────────────────────────────────────────────────────────

export interface CreatePendingActionInput {
  entityType:     string
  entityId:       string
  action:         PendingActionType | string
  description:    string
  requestedByUid: string
  requestedByRole: UserRole
  targetState?:   Record<string, unknown>
  /** ISO date string — optional TTL after which action auto-expires. */
  expiresAt?:     string
}

export interface ReviewPendingActionInput {
  id:             string
  reviewedByUid:  string
  reviewedByRole: UserRole
  notes?:         string
}

export interface PendingActionRow {
  id:              string
  entityType:      string
  entityId:        string
  action:          string
  description:     string
  requestedByUid:  string
  requestedByRole: string
  targetState:     Record<string, unknown> | null
  status:          PendingActionStatus
  reviewedByUid:   string | null
  reviewedAt:      Date | null
  reviewNotes:     string | null
  expiresAt:       Date | null
  createdAt:       Date
  updatedAt:       Date
}

export interface PendingActionQueryFilters {
  status?:         PendingActionStatus | 'ALL'
  entityType?:     string
  requestedByUid?: string
  action?:         string
  dateFrom?:       Date
  dateTo?:         Date
  page?:           number
  pageSize?:       number
}

export interface PendingActionQueryResult {
  actions:  PendingActionRow[]
  total:    number
  page:     number
  pages:    number
  pageSize: number
  pendingCount: number
}

export interface PendingActionCounts {
  pending:   number
  approved:  number
  rejected:  number
  cancelled: number
  expired:   number
  total:     number
}

// ─────────────────────────────────────────────────────────
//  HELPER: Roles that may review (approve / reject) actions
// ─────────────────────────────────────────────────────────


export function canReview(role: UserRole): boolean {
  return PENDING_ACTION_REVIEWER_ROLES.includes(role)
}

// ─────────────────────────────────────────────────────────
//  CREATE
// ─────────────────────────────────────────────────────────

/**
 * Create a new pending action record.
 * Called by route handlers when a lower_rank or academic staff member
 * initiates an action that requires approval.
 *
 * Fires a notification to all admin and high_rank users asynchronously.
 *
 * @returns The created PendingActionRow
 */
export async function create(
  input: CreatePendingActionInput
): Promise<PendingActionRow> {
  const row = await prisma.pendingAction.create({
    data: {
      entityType:     input.entityType,
      entityId:       input.entityId,
      action:         input.action,
      description:    input.description,
      requestedByUid: input.requestedByUid,
      requestedByRole:input.requestedByRole,
      targetState: (input.targetState ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      status:         'PENDING',
      expiresAt:      input.expiresAt ? new Date(input.expiresAt) : null,
    },
  })

  // Audit log — synchronous (HIGH severity: any pending action creation matters)
  await auditService.log({
    action:     'student.pending_action_raised',
    entityType: input.entityType,
    entityId:   input.entityId,
    actorUid:   input.requestedByUid,
    actorRole:  input.requestedByRole,
    metadata: {
      context: {
        pendingActionId: row.id,
        pendingAction:   input.action,
        description:     input.description,
      },
    },
  })

  // Notify reviewers — fire and forget
  void notifyReviewers(row.id, input)

  logger.info(
    { pendingActionId: row.id, action: input.action, entityType: input.entityType },
    '[pendingActionService] Pending action created'
  )

  return toRow(row)
}

async function notifyReviewers(
  pendingActionId: string,
  input:           CreatePendingActionInput
): Promise<void> {
  try {
    // Fetch all admin and high_rank staff profiles to get their emails
    const reviewerProfiles = await prisma.staffProfile.findMany({
      where:  { role: { in: ['admin', 'high_rank'] }, status: 'ACTIVE' },
      select: { uid: true, email: true, firstName: true, lastName: true },
    })

    if (reviewerProfiles.length === 0) return

    await sendPendingActionCreated({
      reviewerUids:   reviewerProfiles.map((p) => p.uid),
      reviewerEmails: reviewerProfiles.map((p) => p.email),
      action:         input.action,
      entityType:     input.entityType,
      entityId:       input.entityId,
      requestedBy:    input.requestedByUid,
      description:    input.description,
    })
  } catch (err) {
    logger.error({ err, pendingActionId }, '[pendingActionService] Failed to notify reviewers')
  }
}

// ─────────────────────────────────────────────────────────
//  APPROVE
// ─────────────────────────────────────────────────────────

/**
 * Approve a pending action AND apply it.
 *
 * [FIX] This used to only flip the status to APPROVED and rely on "the
 * calling route handler" to execute the change — which no caller did, so
 * approving a student/class request never changed a single record. The
 * stored change is now applied here through pendingActionExecutor, which
 * delegates to the same service functions the direct path uses.
 *
 * Ordering is claim → apply → (revert on failure): the row is first moved
 * PENDING → APPROVED with a conditional update, so two reviewers clicking at
 * once cannot both apply the change; if applying then fails (duplicate,
 * record gone, validation), the claim is released back to PENDING and the
 * error is surfaced to the reviewer instead of leaving an "approved" request
 * whose change never happened.
 *
 * @throws Error with status 400 if action is not in PENDING state
 * @throws Error with status 403 if reviewer role is not authorised
 * @throws Error with status 409 if another reviewer decided it first
 */
export async function approve(
  input: ReviewPendingActionInput
): Promise<PendingActionRow> {
  if (!canReview(input.reviewedByRole)) {
    throw Object.assign(
      new Error('Your role does not have permission to approve pending actions.'),
      { status: 403 }
    )
  }

  const existing = await prisma.pendingAction.findUnique({
    where: { id: input.id },
  })

  if (!existing) {
    throw Object.assign(new Error('Pending action not found.'), { status: 404 })
  }

  if (existing.status !== 'PENDING') {
    throw Object.assign(
      new Error(`Cannot approve a pending action with status "${existing.status}".`),
      { status: 400 }
    )
  }

  // Check expiry
  if (existing.expiresAt && existing.expiresAt < new Date()) {
    await prisma.pendingAction.update({
      where: { id: input.id },
      data:  { status: 'EXPIRED', updatedAt: new Date() },
    })
    throw Object.assign(
      new Error('This pending action has expired and can no longer be approved.'),
      { status: 400 }
    )
  }

  const now = new Date()
  const claim = await prisma.pendingAction.updateMany({
    where: { id: input.id, status: 'PENDING' },
    data: {
      status:        'APPROVED',
      reviewedByUid: input.reviewedByUid,
      reviewedAt:    now,
      reviewNotes:   input.notes ?? null,
    },
  })
  if (claim.count === 0) {
    throw Object.assign(
      new Error('This request was already decided by someone else.'),
      { status: 409 }
    )
  }

  let applyNote: string | null = null
  try {
    const target = existing.targetState
    const result = await applyApproved(
      {
        id:          existing.id,
        action:      existing.action,
        entityId:    existing.entityId,
        targetState: target && typeof target === 'object' && !Array.isArray(target)
          ? (target as Record<string, unknown>)
          : null,
      },
      { uid: input.reviewedByUid, role: input.reviewedByRole },
    )
    applyNote = result.note
  } catch (err) {
    await prisma.pendingAction.updateMany({
      where: { id: input.id, status: 'APPROVED' },
      data: { status: 'PENDING', reviewedByUid: null, reviewedAt: null, reviewNotes: null },
    })
    logger.error(
      { err, pendingActionId: input.id, action: existing.action },
      '[pendingActionService] Applying approved change failed — approval rolled back'
    )
    throw err
  }

  const updated = await prisma.pendingAction.findUniqueOrThrow({ where: { id: input.id } })

  await auditService.log({
    action:     'student.pending_action_approved',
    entityType: existing.entityType,
    entityId:   existing.entityId,
    actorUid:   input.reviewedByUid,
    actorRole:  input.reviewedByRole,
    metadata: {
      context: {
        pendingActionId: input.id,
        pendingAction:   existing.action,
        reviewNotes:     input.notes,
        ...(applyNote ? { applyNote } : {}),
      },
    },
  })

  logger.info(
    { pendingActionId: input.id, approvedBy: input.reviewedByUid },
    '[pendingActionService] Pending action approved'
  )

  return toRow(updated)
}

// ─────────────────────────────────────────────────────────
//  REJECT
// ─────────────────────────────────────────────────────────

/**
 * Reject a pending action.
 * Sets status to REJECTED and records reviewer details and notes.
 * A rejection reason (notes) is strongly recommended for auditability.
 *
 * @throws Error with status 400 if action is not in PENDING state
 * @throws Error with status 403 if reviewer role is not authorised
 */
export async function reject(
  input: ReviewPendingActionInput
): Promise<PendingActionRow> {
  if (!canReview(input.reviewedByRole)) {
    throw Object.assign(
      new Error('Your role does not have permission to reject pending actions.'),
      { status: 403 }
    )
  }

  const existing = await prisma.pendingAction.findUnique({
    where: { id: input.id },
  })

  if (!existing) {
    throw Object.assign(new Error('Pending action not found.'), { status: 404 })
  }

  if (existing.status !== 'PENDING') {
    throw Object.assign(
      new Error(`Cannot reject a pending action with status "${existing.status}".`),
      { status: 400 }
    )
  }

  const now     = new Date()
  const updated = await prisma.pendingAction.update({
    where: { id: input.id },
    data: {
      status:        'REJECTED',
      reviewedByUid: input.reviewedByUid,
      reviewedAt:    now,
      reviewNotes:   input.notes ?? null,
    },
  })

  await auditService.log({
    action:     'student.pending_action_rejected',
    entityType: existing.entityType,
    entityId:   existing.entityId,
    actorUid:   input.reviewedByUid,
    actorRole:  input.reviewedByRole,
    metadata: {
      context: {
        pendingActionId: input.id,
        pendingAction:   existing.action,
        reviewNotes:     input.notes,
      },
    },
  })

  logger.info(
    { pendingActionId: input.id, rejectedBy: input.reviewedByUid },
    '[pendingActionService] Pending action rejected'
  )

  return toRow(updated)
}

// ─────────────────────────────────────────────────────────
//  CANCEL
// ─────────────────────────────────────────────────────────

/**
 * Cancel a pending action.
 * Only the original requester or an admin may cancel.
 * Can only cancel PENDING actions.
 */
export async function cancel(
  id:           string,
  cancelledByUid: string,
  cancelledByRole: UserRole
): Promise<PendingActionRow> {
  const existing = await prisma.pendingAction.findUnique({
    where: { id },
  })

  if (!existing) {
    throw Object.assign(new Error('Pending action not found.'), { status: 404 })
  }

  if (existing.status !== 'PENDING') {
    throw Object.assign(
      new Error(`Cannot cancel a pending action with status "${existing.status}".`),
      { status: 400 }
    )
  }

  // Only the requester or a reviewer may cancel
  const isRequester = existing.requestedByUid === cancelledByUid
  const isReviewer  = canReview(cancelledByRole)

  if (!isRequester && !isReviewer) {
    throw Object.assign(
      new Error('You may only cancel your own pending actions.'),
      { status: 403 }
    )
  }

  const updated = await prisma.pendingAction.update({
    where: { id },
    data: {
      status:        'CANCELLED',
      reviewedByUid: cancelledByUid,
      reviewedAt:    new Date(),
    },
  })

  auditService.logAsync({
    action:     'student.pending_action_rejected',
    entityType: existing.entityType,
    entityId:   existing.entityId,
    actorUid:   cancelledByUid,
    actorRole:  cancelledByRole,
    metadata: { context: { pendingActionId: id, cancelledBy: cancelledByUid } },
  })

  return toRow(updated)
}

// ─────────────────────────────────────────────────────────
//  EXPIRE STALE ACTIONS  (called by cron job)
// ─────────────────────────────────────────────────────────

/**
 * Mark all PENDING actions past their expiresAt date as EXPIRED.
 * Should be called by a nightly cron job.
 * Returns the count of newly-expired actions.
 */
export async function expireStale(): Promise<number> {
  const result = await prisma.pendingAction.updateMany({
    where: {
      status:    'PENDING',
      expiresAt: { lt: new Date() },
    },
    data: { status: 'EXPIRED' },
  })

  if (result.count > 0) {
    logger.info({ count: result.count }, '[pendingActionService] Expired stale pending actions')
  }

  return result.count
}

// ─────────────────────────────────────────────────────────
//  QUERY
// ─────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE     = 100

/**
 * Query pending actions with filtering and pagination.
 * Results are ordered PENDING-first, then by createdAt DESC.
 */
export async function query(
  filters: PendingActionQueryFilters
): Promise<PendingActionQueryResult> {
  const {
    status,
    entityType,
    requestedByUid,
    action,
    dateFrom,
    dateTo,
    page     = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  } = filters

  const safePageSize = Math.min(pageSize, MAX_PAGE_SIZE)
  const safeOffset   = (Math.max(page, 1) - 1) * safePageSize

  const where: {
    status?:          { in: PendingActionStatus[] } | PendingActionStatus
    entityType?:      string
    requestedByUid?:  string
    action?:          { contains: string; mode: 'insensitive' }
    createdAt?:       { gte?: Date; lte?: Date }
  } = {}

  if (status && status !== 'ALL') {
    where.status = status
  }
  if (entityType)       where.entityType       = entityType
  if (requestedByUid)   where.requestedByUid   = requestedByUid
  if (action)           where.action           = { contains: action, mode: 'insensitive' }
  if (dateFrom || dateTo) {
    where.createdAt = {}
    if (dateFrom) where.createdAt.gte = dateFrom
    if (dateTo)   where.createdAt.lte = dateTo
  }

  const [total, pendingCount, rows] = await prisma.$transaction([
    prisma.pendingAction.count({ where }),
    prisma.pendingAction.count({ where: { status: 'PENDING' } }),
    prisma.pendingAction.findMany({
      where,
      orderBy: [
        { status:    'asc' },   // PENDING sorts before APPROVED/CANCELLED/EXPIRED/REJECTED alphabetically — adjust below
        { createdAt: 'desc' },
      ],
      skip: safeOffset,
      take: safePageSize,
    }),
  ])

  // Re-sort: PENDING first, then rest by createdAt DESC
  const sorted = [
    ...rows.filter((r) => r.status === 'PENDING').sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    ...rows.filter((r) => r.status !== 'PENDING').sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
  ]

  return {
    actions:      sorted.map(toRow),
    total,
    page:         Math.max(page, 1),
    pages:        Math.ceil(total / safePageSize),
    pageSize:     safePageSize,
    pendingCount,
  }
}

/**
 * Get a single pending action by ID.
 */
export async function getById(id: string): Promise<PendingActionRow | null> {
  const row = await prisma.pendingAction.findUnique({ where: { id } })
  return row ? toRow(row) : null
}

/**
 * Get count breakdown across all statuses.
 * Used by the admin dashboard badge and summary widget.
 *
 * [PRODUCTION FIX] Previously ran six separate `count()` round trips (one
 * per PendingActionStatus value plus an unfiltered total), reported by
 * Sentry as an N+1 Query issue on GET /api/[[...slug]] — five near-identical
 * `SELECT COUNT(*) ... WHERE status = CAST($1 ...)` spans back to back
 * (~78ms each), all on a table small enough that a single grouped query
 * does the same job in one round trip. `groupBy` returns one row per
 * status present in the table in a single query; the unfiltered total is
 * just the sum of those rows, so no separate `count()` call is needed
 * either — five-plus statuses collapsed into 1 query.
 */
export async function getCounts(): Promise<PendingActionCounts> {
  const groups = await prisma.pendingAction.groupBy({
    by:     ['status'],
    _count: { _all: true },
  })

  const byStatus: Record<PendingActionStatus, number> = {
    PENDING:   0,
    APPROVED:  0,
    REJECTED:  0,
    CANCELLED: 0,
    EXPIRED:   0,
  }
  let total = 0
  for (const g of groups) {
    byStatus[g.status] = g._count._all
    total += g._count._all
  }

  return {
    pending:   byStatus.PENDING,
    approved:  byStatus.APPROVED,
    rejected:  byStatus.REJECTED,
    cancelled: byStatus.CANCELLED,
    expired:   byStatus.EXPIRED,
    total,
  }
}

/**
 * Get all PENDING actions for a specific entity record.
 * Used to check if an entity already has an outstanding approval request
 * before creating a duplicate.
 */
export async function getPendingForEntity(
  entityType: string,
  entityId:   string
): Promise<PendingActionRow[]> {
  const rows = await prisma.pendingAction.findMany({
    where:   { entityType, entityId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(toRow)
}

/**
 * Check whether a specific entity already has a PENDING action
 * of a given type. Prevents duplicate approval requests.
 */
export async function hasPendingAction(
  entityType: string,
  entityId:   string,
  action:     string
): Promise<boolean> {
  const count = await prisma.pendingAction.count({
    where: { entityType, entityId, action, status: 'PENDING' },
  })
  return count > 0
}

// ─────────────────────────────────────────────────────────
//  SERIALISER
// ─────────────────────────────────────────────────────────

function toRow(
  row: {
    id:              string
    entityType:      string
    entityId:        string
    action:          string
    description:     string
    requestedByUid:  string
    requestedByRole: string
    targetState:     unknown
    status:          PendingActionStatus
    reviewedByUid:   string | null
    reviewedAt:      Date | null
    reviewNotes:     string | null
    expiresAt:       Date | null
    createdAt:       Date
    updatedAt:       Date
  }
): PendingActionRow {
  return {
    id:              row.id,
    entityType:      row.entityType,
    entityId:        row.entityId,
    action:          row.action,
    description:     row.description,
    requestedByUid:  row.requestedByUid,
    requestedByRole: row.requestedByRole,
    targetState:     (row.targetState as Record<string, unknown> | null) ?? null,
    status:          row.status,
    reviewedByUid:   row.reviewedByUid,
    reviewedAt:      row.reviewedAt,
    reviewNotes:     row.reviewNotes,
    expiresAt:       row.expiresAt,
    createdAt:       row.createdAt,
    updatedAt:       row.updatedAt,
  }
}