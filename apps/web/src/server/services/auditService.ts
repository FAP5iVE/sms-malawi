import 'server-only'

import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import type { UserRole } from '@shared/types/roles'

// ─────────────────────────────────────────────────────────
//  SEVERITY LEVELS
//  Used to classify audit entries for the security center
//  dashboard and for filtered reporting.
// ─────────────────────────────────────────────────────────

export const SEVERITY = {
  CRITICAL: 'CRITICAL', // Role changes, result releases, financial reversals
  HIGH:     'HIGH',     // Mark edits, payment recording, leave approvals, loan approvals
  MEDIUM:   'MEDIUM',   // Student/staff edits, class changes, announcement publications
  LOW:      'LOW',      // Data reads of sensitive sections, exports, views
} as const

export type Severity = typeof SEVERITY[keyof typeof SEVERITY]

// ─────────────────────────────────────────────────────────
//  ACTION → SEVERITY MAP
//  Every action string used across route handlers must appear here.
//  Unmapped actions default to MEDIUM.
// ─────────────────────────────────────────────────────────

const ACTION_SEVERITY: Readonly<Record<string, Severity>> = {
  // ── Auth / User management
  'auth.login_success':           SEVERITY.LOW,
  'auth.login_failed':            SEVERITY.HIGH,
  'auth.password_reset_sent':     SEVERITY.MEDIUM,
  'auth.password_changed':        SEVERITY.HIGH,
  'auth.session_revoked':         SEVERITY.CRITICAL,
  'auth.token_refreshed':         SEVERITY.LOW,
  'user.created':                 SEVERITY.CRITICAL,
  'user.role_changed':            SEVERITY.CRITICAL,
  'user.suspended':               SEVERITY.CRITICAL,
  'user.archived':                SEVERITY.CRITICAL,
  'user.password_reset_forced':   SEVERITY.CRITICAL,
  'user.claims_updated':          SEVERITY.CRITICAL,

  // ── Student
  'student.create':               SEVERITY.MEDIUM,
  'student.edit':                 SEVERITY.MEDIUM,
  'student.soft_delete':          SEVERITY.HIGH,
  'student.archive':              SEVERITY.HIGH,
  'student.status_changed':       SEVERITY.HIGH,
  'student.promoted':             SEVERITY.HIGH,
  'student.class_reassigned':     SEVERITY.HIGH,
  'student.profile_printed':      SEVERITY.LOW,
  'student.pending_action_raised':SEVERITY.MEDIUM,
  'student.pending_action_approved':SEVERITY.HIGH,
  'student.pending_action_rejected':SEVERITY.HIGH,

  // ── Application
  'application.submitted':        SEVERITY.LOW,
  'application.reviewed':         SEVERITY.MEDIUM,
  'application.approved':         SEVERITY.HIGH,
  'application.denied':           SEVERITY.HIGH,
  'application.converted_to_student':SEVERITY.CRITICAL,

  // ── Class
  'class.created':                SEVERITY.MEDIUM,
  'class.edited':                 SEVERITY.MEDIUM,
  'class.teacher_assigned':       SEVERITY.MEDIUM,
  'class.subject_assigned':       SEVERITY.MEDIUM,
  'class.deleted':                SEVERITY.HIGH,
  'class.lab_booking_created':    SEVERITY.LOW,
  'class.lab_booking_cancelled':  SEVERITY.LOW,

  // ── Assignment
  'assignment.created':           SEVERITY.LOW,
  'assignment.edited':            SEVERITY.LOW,
  'assignment.deleted':           SEVERITY.LOW,
  'assignment.submitted':         SEVERITY.LOW,

  // ── Timetable
  'timetable.slot_created':       SEVERITY.MEDIUM,
  'timetable.slot_edited':        SEVERITY.MEDIUM,
  'timetable.slot_deleted':       SEVERITY.MEDIUM,
  'timetable.slot_approved':      SEVERITY.HIGH,
  'timetable.slot_rejected':      SEVERITY.MEDIUM,

  // ── Announcement
  'announcement.created':         SEVERITY.LOW,
  'announcement.published':       SEVERITY.MEDIUM,
  'announcement.approved':        SEVERITY.MEDIUM,
  'announcement.rejected':        SEVERITY.MEDIUM,
  'announcement.deleted':         SEVERITY.MEDIUM,

  // ── Finance — fee structures
  'finance.fee_structure_created':SEVERITY.HIGH,
  'finance.fee_structure_updated':SEVERITY.HIGH,
  'finance.fee_structure_deleted':SEVERITY.HIGH,

  // ── Finance — invoices
  'finance.invoice_generated':    SEVERITY.MEDIUM,
  'finance.bulk_invoices_generated':SEVERITY.HIGH,
  'finance.invoice_edited':       SEVERITY.HIGH,
  'finance.invoice_note_added':   SEVERITY.LOW,

  // ── Finance — payments
  'finance.payment_recorded':     SEVERITY.HIGH,
  'finance.receipt_generated':    SEVERITY.LOW,

  // ── Finance — expenses
  'finance.expense_created':      SEVERITY.MEDIUM,
  'finance.expense_approved':     SEVERITY.HIGH,
  'finance.expense_rejected':     SEVERITY.HIGH,

  // ── Finance — budget
  'finance.budget_created':       SEVERITY.HIGH,
  'finance.budget_updated':       SEVERITY.HIGH,
  'finance.budget_approved':      SEVERITY.HIGH,

  // ── Finance — scholarship
  'finance.scholarship_created':  SEVERITY.HIGH,
  'finance.scholarship_updated':  SEVERITY.HIGH,
  'finance.scholarship_deactivated':SEVERITY.HIGH,

  // ── Finance — payroll
  'finance.payroll_run_started':  SEVERITY.CRITICAL,
  'finance.payroll_run_completed':SEVERITY.CRITICAL,
  'finance.payroll_approved':     SEVERITY.CRITICAL,
  'finance.payroll_locked':       SEVERITY.CRITICAL,
  'finance.payroll_rolled_back':  SEVERITY.CRITICAL,
  'finance.salary_structure_updated':SEVERITY.CRITICAL,

  // ── Library fines
  'library.fine_applied':         SEVERITY.MEDIUM,
  'library.fine_cleared':         SEVERITY.HIGH,
  'library.fine_waived':          SEVERITY.HIGH,

  // ── Library — books
  'library.book_added':           SEVERITY.LOW,
  'library.book_edited':          SEVERITY.LOW,
  'library.book_deleted':         SEVERITY.MEDIUM,
  'library.copy_registered':      SEVERITY.LOW,
  'library.book_issued':          SEVERITY.LOW,
  'library.book_returned':        SEVERITY.LOW,
  'library.book_marked_lost':     SEVERITY.MEDIUM,
  'library.book_marked_damaged':  SEVERITY.MEDIUM,

  // ── Library — digital
  'library.digital_resource_uploaded':    SEVERITY.MEDIUM,
  'library.digital_resource_approved':    SEVERITY.MEDIUM,
  'library.digital_resource_rejected':    SEVERITY.MEDIUM,
  'library.digital_resource_deleted':     SEVERITY.MEDIUM,
  'library.recommendation_submitted':     SEVERITY.LOW,
  'library.recommendation_approved':      SEVERITY.LOW,
  'library.recommendation_rejected':      SEVERITY.LOW,

  // ── HR — staff
  'hr.staff_created':             SEVERITY.CRITICAL,
  'hr.staff_edited':              SEVERITY.MEDIUM,
  'hr.staff_terminated':          SEVERITY.CRITICAL,
  'hr.staff_promoted':            SEVERITY.CRITICAL,
  'hr.role_assigned':             SEVERITY.CRITICAL,

  // ── HR — leave
  'hr.leave_request_submitted':   SEVERITY.LOW,
  'hr.leave_approved':            SEVERITY.HIGH,
  'hr.leave_rejected':            SEVERITY.HIGH,
  'hr.leave_cancelled':           SEVERITY.MEDIUM,
  'hr.leave_balance_adjusted':    SEVERITY.HIGH,

  // ── HR — loans
  'hr.loan_applied':              SEVERITY.MEDIUM,
  'hr.loan_approved':             SEVERITY.CRITICAL,
  'hr.loan_rejected':             SEVERITY.HIGH,
  'hr.loan_disbursed':            SEVERITY.CRITICAL,
  'hr.loan_settled':              SEVERITY.HIGH,

  // ── HR — performance
  'hr.performance_note_added':    SEVERITY.MEDIUM,
  'hr.performance_review_submitted':SEVERITY.HIGH,
  'hr.disciplinary_record_added': SEVERITY.CRITICAL,

  // ── Exams
  'exam.created':                 SEVERITY.MEDIUM,
  'exam.edited':                  SEVERITY.MEDIUM,
  'exam.deleted':                 SEVERITY.HIGH,
  'exam.marks_saved_draft':       SEVERITY.LOW,
  'exam.marks_finalized':         SEVERITY.HIGH,
  'exam.marks_unlocked':          SEVERITY.CRITICAL,
  'exam.results_approved':        SEVERITY.CRITICAL,
  'exam.results_released':        SEVERITY.CRITICAL,
  'exam.report_card_generated':   SEVERITY.MEDIUM,
  'exam.promotion_engine_run':    SEVERITY.CRITICAL,
  'exam.maneb_record_created':    SEVERITY.HIGH,
  'exam.maneb_record_updated':    SEVERITY.HIGH,

  // ── Settings
  'settings.updated':             SEVERITY.HIGH,
  'settings.batch_updated':       SEVERITY.CRITICAL,
  'settings.maintenance_mode_enabled': SEVERITY.CRITICAL,
  'settings.maintenance_mode_disabled':SEVERITY.CRITICAL,
  'settings.cache_invalidated':   SEVERITY.MEDIUM,

  // ── System
  'system.backup_completed':      SEVERITY.LOW,
  'system.backup_failed':         SEVERITY.CRITICAL,
  'system.ip_blocked':            SEVERITY.CRITICAL,
  'system.ip_unblocked':          SEVERITY.HIGH,
  'system.session_terminated':    SEVERITY.HIGH,
  'system.cache_cleared':         SEVERITY.MEDIUM,

  // ── Reports / exports
  'report.exported':              SEVERITY.MEDIUM,
  'report.pdf_generated':         SEVERITY.LOW,
  'report.xlsx_exported':         SEVERITY.LOW,
  'report.transcript_generated':  SEVERITY.MEDIUM,
}

function resolveSeverity(action: string): Severity {
  return ACTION_SEVERITY[action] ?? SEVERITY.MEDIUM
}

// ─────────────────────────────────────────────────────────
//  AUDIT ENTRY INPUT
// ─────────────────────────────────────────────────────────

export interface AuditMetadata {
  /** State of the entity before the action (for edits/deletes). */
  before?: Record<string, unknown>
  /** State of the entity after the action (for creates/edits). */
  after?: Record<string, unknown>
  /** Field-level diff derived from before/after. */
  changes?: Array<{ field: string; oldValue: unknown; newValue: unknown }>
  /** Any additional contextual data that doesn't fit before/after. */
  context?: Record<string, unknown>
}

export interface AuditEntry {
  /** Action identifier — must match a key in ACTION_SEVERITY or 'domain.verb' format. */
  action: string
  /** Prisma model name: 'Student', 'Invoice', 'Exam', 'User', etc. */
  entityType: string
  /** Primary key of the affected record. */
  entityId: string
  /** Firebase UID of the user performing the action. */
  actorUid: string
  /** Role at the time of the action — stored as a snapshot, not a FK. */
  actorRole: UserRole | string
  /** Optional structured metadata with before/after state and context. */
  metadata?: AuditMetadata
}

// ─────────────────────────────────────────────────────────
//  QUERY TYPES
// ─────────────────────────────────────────────────────────

export interface AuditQueryFilters {
  action?: string
  entityType?: string
  entityId?: string
  actorUid?: string
  actorRole?: string
  severity?: Severity
  dateFrom?: Date
  dateTo?: Date
  search?: string
  page?: number
  pageSize?: number
}

export interface AuditLogRow {
  id: string
  action: string
  severity: Severity
  entityType: string
  entityId: string
  actorUid: string
  actorRole: string
  metadata: AuditMetadata | null
  createdAt: Date
}

export interface AuditQueryResult {
  entries: AuditLogRow[]
  total: number
  page: number
  pages: number
  pageSize: number
}

// ─────────────────────────────────────────────────────────
//  DIFF UTILITY
// ─────────────────────────────────────────────────────────

/**
 * Compute a field-level diff between two plain objects.
 * Ignores keys whose values are identical (deep equality for primitives).
 * Does not recurse into nested objects — only top-level fields.
 * Excludes: updatedAt, createdAt (noise in every diff).
 */
export function createDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): AuditMetadata['changes'] {
  const EXCLUDED_FIELDS = new Set(['updatedAt', 'createdAt'])
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)])
  const changes: NonNullable<AuditMetadata['changes']> = []

  for (const field of allKeys) {
    if (EXCLUDED_FIELDS.has(field)) continue
    const oldValue = before[field]
    const newValue = after[field]
    // Primitive comparison — safe for strings, numbers, booleans, null
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes.push({ field, oldValue, newValue })
    }
  }

  return changes
}

// ─────────────────────────────────────────────────────────
//  CORE WRITE OPERATIONS
// ─────────────────────────────────────────────────────────

/**
 * Write a single audit log entry synchronously.
 * Use for CRITICAL and HIGH severity actions where the audit entry
 * must be persisted before the response is returned.
 *
 * @example
 *   await auditService.log({
 *     action: 'exam.results_released',
 *     entityType: 'Exam',
 *     entityId: exam.id,
 *     actorUid: req.user!.uid,
 *     actorRole: req.user!.role,
 *     metadata: { context: { classId, term, academicYear } },
 *   })
 */
export async function log(entry: AuditEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action:     entry.action,
      entityType: entry.entityType,
      entityId:   entry.entityId,
      actorUid:   entry.actorUid,
      actorRole:  entry.actorRole,
      metadata:   (entry.metadata ?? null) as object | null,
    },
    select: { id: true }, // Minimal select — we don't use the returned row
  })
}

/**
 * Write a single audit log entry asynchronously (fire-and-forget).
 * Use for MEDIUM and LOW severity actions where audit persistence
 * must not add latency to the response.
 *
 * Caveat: On Vercel serverless, if the Lambda function instance is
 * recycled immediately after the response is sent (before the
 * micro-task queue flushes), this write may be lost. For CRITICAL
 * and HIGH actions always use the synchronous `log()` instead.
 *
 * @example
 *   auditService.logAsync({
 *     action: 'student.profile_printed',
 *     entityType: 'Student',
 *     entityId: studentId,
 *     actorUid: req.user!.uid,
 *     actorRole: req.user!.role,
 *   })
 */
export function logAsync(entry: AuditEntry): void {
  prisma.auditLog
    .create({
      data: {
        action:     entry.action,
        entityType: entry.entityType,
        entityId:   entry.entityId,
        actorUid:   entry.actorUid,
        actorRole:  entry.actorRole,
        metadata:   (entry.metadata ?? null) as object | null,
      },
      select: { id: true },
    })
    .catch((err: unknown) => {
      // Never let an audit log failure propagate — log internally only
      logger.error({ err, entry }, '[auditService] logAsync write failed')
    })
}

/**
 * Write multiple audit log entries in a single Prisma transaction.
 * Use when a single user action produces multiple entity changes
 * (e.g., promotion engine: promotes 40 students in one run).
 *
 * With the Neon HTTP adapter, $transaction([...array]) is sent as a
 * single HTTP batch to Neon — far more efficient than N sequential writes.
 */
export async function logBatch(entries: AuditEntry[]): Promise<void> {
  if (entries.length === 0) return

  await prisma.$transaction(
    entries.map((entry) =>
      prisma.auditLog.create({
        data: {
          action:     entry.action,
          entityType: entry.entityType,
          entityId:   entry.entityId,
          actorUid:   entry.actorUid,
          actorRole:  entry.actorRole,
          metadata:   (entry.metadata ?? null) as object | null,
        },
        select: { id: true },
      })
    )
  )
}

// ─────────────────────────────────────────────────────────
//  QUERY OPERATIONS
// ─────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE     = 100

/**
 * Query audit logs with full filtering and pagination.
 * Results are ordered by createdAt DESC (most recent first).
 *
 * The severity field is not stored in the database — it is computed
 * from the action string at query time and applied as a post-filter.
 * This avoids a migration while keeping the API clean.
 */
export async function query(
  filters: AuditQueryFilters
): Promise<AuditQueryResult> {
  const {
    action,
    entityType,
    entityId,
    actorUid,
    actorRole,
    severity,
    dateFrom,
    dateTo,
    search,
    page = 1,
    pageSize = DEFAULT_PAGE_SIZE,
  } = filters

  const safePageSize = Math.min(pageSize, MAX_PAGE_SIZE)
  const safeOffset   = (Math.max(page, 1) - 1) * safePageSize

  // Build Prisma where clause
  const where: {
    action?: { contains: string; mode: 'insensitive' } | { in: string[] }
    entityType?: string
    entityId?: string
    actorUid?: string
    actorRole?: string
    createdAt?: { gte?: Date; lte?: Date }
    OR?: Array<{
      action?: { contains: string; mode: 'insensitive' }
      entityType?: { contains: string; mode: 'insensitive' }
      entityId?: { contains: string; mode: 'insensitive' }
      actorUid?: { contains: string; mode: 'insensitive' }
    }>
  } = {}

  // If severity filter is set, collect all actions matching that severity
  // and use them as an IN filter — we can't store severity in the DB
  // without a schema migration.
  if (severity) {
    const matchingActions = Object.entries(ACTION_SEVERITY)
      .filter(([, s]) => s === severity)
      .map(([a]) => a)
    if (matchingActions.length > 0) {
      where.action = { in: matchingActions }
    }
  } else if (action) {
    where.action = { contains: action, mode: 'insensitive' }
  }

  if (entityType) where.entityType = entityType
  if (entityId)   where.entityId   = entityId
  if (actorUid)   where.actorUid   = actorUid
  if (actorRole)  where.actorRole  = actorRole

  if (dateFrom || dateTo) {
    where.createdAt = {}
    if (dateFrom) where.createdAt.gte = dateFrom
    if (dateTo)   where.createdAt.lte = dateTo
  }

  // Full-text search across action, entityId, entityType, actorUid
  if (search && search.trim().length > 0) {
    const term = search.trim()
    where.OR = [
      { action:     { contains: term, mode: 'insensitive' } },
      { entityType: { contains: term, mode: 'insensitive' } },
      { entityId:   { contains: term, mode: 'insensitive' } },
      { actorUid:   { contains: term, mode: 'insensitive' } },
    ]
  }

  // Run count and data fetch in parallel — single round-trip with Neon batch
  const [total, rows] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip:  safeOffset,
      take:  safePageSize,
      select: {
        id:         true,
        action:     true,
        entityType: true,
        entityId:   true,
        actorUid:   true,
        actorRole:  true,
        metadata:   true,
        createdAt:  true,
      },
    }),
  ])

  const entries: AuditLogRow[] = rows.map((row) => ({
    id:         row.id,
    action:     row.action,
    severity:   resolveSeverity(row.action),
    entityType: row.entityType,
    entityId:   row.entityId,
    actorUid:   row.actorUid,
    actorRole:  row.actorRole,
    metadata:   (row.metadata as AuditMetadata | null) ?? null,
    createdAt:  row.createdAt,
  }))

  return {
    entries,
    total,
    page: Math.max(page, 1),
    pages: Math.ceil(total / safePageSize),
    pageSize: safePageSize,
  }
}

/**
 * Get the full audit trail for a specific entity record.
 * Ordered oldest-first so history can be read chronologically.
 *
 * @example
 *   const history = await auditService.queryByEntity('Student', studentId)
 */
export async function queryByEntity(
  entityType: string,
  entityId: string,
  limit = 50
): Promise<AuditLogRow[]> {
  const rows = await prisma.auditLog.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: 'asc' },
    take: Math.min(limit, 200),
    select: {
      id:         true,
      action:     true,
      entityType: true,
      entityId:   true,
      actorUid:   true,
      actorRole:  true,
      metadata:   true,
      createdAt:  true,
    },
  })

  return rows.map((row) => ({
    id:         row.id,
    action:     row.action,
    severity:   resolveSeverity(row.action),
    entityType: row.entityType,
    entityId:   row.entityId,
    actorUid:   row.actorUid,
    actorRole:  row.actorRole,
    metadata:   (row.metadata as AuditMetadata | null) ?? null,
    createdAt:  row.createdAt,
  }))
}

/**
 * Get all audit entries produced by a specific actor (Firebase UID).
 * Ordered most-recent first. Cap at 200 entries per call.
 */
export async function queryByActor(
  actorUid: string,
  filters?: { dateFrom?: Date; dateTo?: Date; limit?: number }
): Promise<AuditLogRow[]> {
  const where: {
    actorUid: string
    createdAt?: { gte?: Date; lte?: Date }
  } = { actorUid }

  if (filters?.dateFrom || filters?.dateTo) {
    where.createdAt = {}
    if (filters.dateFrom) where.createdAt.gte = filters.dateFrom
    if (filters.dateTo)   where.createdAt.lte = filters.dateTo
  }

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: Math.min(filters?.limit ?? 100, 200),
    select: {
      id:         true,
      action:     true,
      entityType: true,
      entityId:   true,
      actorUid:   true,
      actorRole:  true,
      metadata:   true,
      createdAt:  true,
    },
  })

  return rows.map((row) => ({
    id:         row.id,
    action:     row.action,
    severity:   resolveSeverity(row.action),
    entityType: row.entityType,
    entityId:   row.entityId,
    actorUid:   row.actorUid,
    actorRole:  row.actorRole,
    metadata:   (row.metadata as AuditMetadata | null) ?? null,
    createdAt:  row.createdAt,
  }))
}

/**
 * Get recent security-critical events for the admin security center.
 * Returns entries of severity CRITICAL or HIGH from the last N hours.
 */
export async function getRecentSecurityEvents(
  hoursBack = 24,
  limit = 50
): Promise<AuditLogRow[]> {
  const criticalAndHighActions = Object.entries(ACTION_SEVERITY)
    .filter(([, s]) => s === SEVERITY.CRITICAL || s === SEVERITY.HIGH)
    .map(([a]) => a)

  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000)

  const rows = await prisma.auditLog.findMany({
    where: {
      action:    { in: criticalAndHighActions },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
    take:    Math.min(limit, 200),
    select: {
      id:         true,
      action:     true,
      entityType: true,
      entityId:   true,
      actorUid:   true,
      actorRole:  true,
      metadata:   true,
      createdAt:  true,
    },
  })

  return rows.map((row) => ({
    id:         row.id,
    action:     row.action,
    severity:   resolveSeverity(row.action),
    entityType: row.entityType,
    entityId:   row.entityId,
    actorUid:   row.actorUid,
    actorRole:  row.actorRole,
    metadata:   (row.metadata as AuditMetadata | null) ?? null,
    createdAt:  row.createdAt,
  }))
}

/**
 * Get login attempt history (successes and failures) for the security center.
 */
export async function getLoginAttempts(
  hoursBack = 24,
  limit = 100
): Promise<AuditLogRow[]> {
  const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000)

  const rows = await prisma.auditLog.findMany({
    where: {
      action:    { in: ['auth.login_success', 'auth.login_failed'] },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
    take:    Math.min(limit, 500),
    select: {
      id:         true,
      action:     true,
      entityType: true,
      entityId:   true,
      actorUid:   true,
      actorRole:  true,
      metadata:   true,
      createdAt:  true,
    },
  })

  return rows.map((row) => ({
    id:         row.id,
    action:     row.action,
    severity:   resolveSeverity(row.action),
    entityType: row.entityType,
    entityId:   row.entityId,
    actorUid:   row.actorUid,
    actorRole:  row.actorRole,
    metadata:   (row.metadata as AuditMetadata | null) ?? null,
    createdAt:  row.createdAt,
  }))
}

/**
 * Get audit statistics for the admin dashboard overview.
 * Returns counts grouped by severity for the last 7 days.
 */
export async function getAuditStats(daysBack = 7): Promise<{
  critical: number
  high: number
  medium: number
  low: number
  totalToday: number
  totalPeriod: number
}> {
  const since7d   = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
  const sinceToday = new Date(); sinceToday.setHours(0, 0, 0, 0)

  const criticalActions = Object.entries(ACTION_SEVERITY).filter(([, s]) => s === SEVERITY.CRITICAL).map(([a]) => a)
  const highActions     = Object.entries(ACTION_SEVERITY).filter(([, s]) => s === SEVERITY.HIGH).map(([a]) => a)
  const mediumActions   = Object.entries(ACTION_SEVERITY).filter(([, s]) => s === SEVERITY.MEDIUM).map(([a]) => a)
  const lowActions      = Object.entries(ACTION_SEVERITY).filter(([, s]) => s === SEVERITY.LOW).map(([a]) => a)

  const [critical, high, medium, low, totalToday, totalPeriod] = await prisma.$transaction([
    prisma.auditLog.count({ where: { action: { in: criticalActions }, createdAt: { gte: since7d } } }),
    prisma.auditLog.count({ where: { action: { in: highActions },     createdAt: { gte: since7d } } }),
    prisma.auditLog.count({ where: { action: { in: mediumActions },   createdAt: { gte: since7d } } }),
    prisma.auditLog.count({ where: { action: { in: lowActions },      createdAt: { gte: since7d } } }),
    prisma.auditLog.count({ where: { createdAt: { gte: sinceToday } } }),
    prisma.auditLog.count({ where: { createdAt: { gte: since7d }    } }),
  ])

  return { critical, high, medium, low, totalToday, totalPeriod }
}