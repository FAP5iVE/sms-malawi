import 'server-only'

/**
 * [CHANGE TYPE]: TARGETED EDIT (Sessions / Audit completeness)
 * [PURPOSE]: Make every audit entry land in the log, with the time the
 *   action actually happened, so Reports > Audit Log and the per-session
 *   activity view (Reports > Sessions) show the same, complete record.
 *   Three defects fixed here:
 *   (1) logAsync() entries carried no timestamp when queued to Redis, so
 *       AuditLog.createdAt became the moment of the later FLUSH. On a
 *       serverless host the flush often runs in a later invocation, so the
 *       entry showed up in the audit log — but dated outside the session
 *       window it belonged to, i.e. "visible in Audit Log, missing from the
 *       session". Entries now carry `occurredAt` from enqueue time.
 *   (2) Fire-and-forget writes could be dropped when the function froze
 *       right after the response. A request-scoped AuditRequestContext
 *       (AsyncLocalStorage) now tracks every in-flight write so the
 *       activity middleware (server/middleware/activityLog.ts) can await
 *       them before the response is sent.
 *   (3) The MEDIUM severity filter / stats ignored any action not listed in
 *       ACTION_SEVERITY, although resolveSeverity() treats those as MEDIUM.
 *       Auto-recorded request entries are unmapped, so they would have been
 *       invisible to a MEDIUM filter. LOGIN_* (the strings auth.ts really
 *       writes) are now mapped too.
 *   Also: queryByActor() gained `offset` and countByActor() was added so the
 *   session pop-up can page through a long session.
 */

import { AsyncLocalStorage } from 'node:async_hooks'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { logger } from '@/lib/logger'
import { getRedis } from '@/lib/redis'
import type { UserRole } from '@shared/types/roles'
import { AUDIT_DEFAULT_PAGE_SIZE, AUDIT_MAX_PAGE_SIZE } from '@shared/constants/audit'

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

export const ACTION_SEVERITY: Readonly<Record<string, Severity>> = {
  // ── Auth / User management
  'auth.login_success':           SEVERITY.LOW,
  'auth.login_failed':            SEVERITY.HIGH,
  'auth.password_reset_sent':     SEVERITY.MEDIUM,
  'auth.password_changed':        SEVERITY.HIGH,
  'auth.session_revoked':         SEVERITY.CRITICAL,
  'auth.token_refreshed':         SEVERITY.LOW,
  // The strings routes/auth.ts actually writes (and analytics queries read).
  'LOGIN_SUCCESS':                SEVERITY.LOW,
  'LOGIN_FAILED':                 SEVERITY.HIGH,
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
  'student.welfare_edited':       SEVERITY.HIGH,     // orphan / vulnerability / support needs (sensitive child data)
  'student.guardian_changed':     SEVERITY.MEDIUM,
  'student.exit_recorded':        SEVERITY.MEDIUM,
  'student.archive':              SEVERITY.HIGH,
  'student.status_changed':       SEVERITY.HIGH,
  'student.promoted':             SEVERITY.HIGH,
  'student.class_reassigned':     SEVERITY.HIGH,
  'student.profile_printed':      SEVERITY.LOW,
  'student.pending_action_raised':SEVERITY.MEDIUM,
  'student.pending_action_approved':SEVERITY.HIGH,
  'student.pending_action_rejected':SEVERITY.HIGH,

  // ── Guardian portal (who may see which child). Severity follows blast radius:
  //    anything that grants, widens or restores access to a child is HIGH or
  //    CRITICAL; a successful claim mints an account tied to a child, so CRITICAL.
  'guardian.profile_created':           SEVERITY.LOW,
  'guardian.profile_suspended':         SEVERITY.HIGH,
  'guardian.profile_reinstated':        SEVERITY.HIGH,
  'guardian.profile_merged':            SEVERITY.CRITICAL,
  'guardian.link_proposed':             SEVERITY.MEDIUM,
  'guardian.link_approved':             SEVERITY.HIGH,
  'guardian.link_rejected':             SEVERITY.MEDIUM,
  'guardian.link_capabilities_changed': SEVERITY.HIGH,
  'guardian.link_suspended':            SEVERITY.HIGH,
  'guardian.link_reinstated':           SEVERITY.HIGH,
  'guardian.link_revoked':              SEVERITY.HIGH,
  'guardian.link_reverify_flagged':     SEVERITY.MEDIUM,
  'guardian.link_reverified':           SEVERITY.MEDIUM,
  'guardian.link_repointed':            SEVERITY.MEDIUM,
  'guardian.link_reopened':             SEVERITY.HIGH,    // restarts verification of a previously ended grant
  'guardian.evidence_recorded':         SEVERITY.MEDIUM,
  'guardian.invitation_issued':         SEVERITY.HIGH,
  'guardian.invitation_revoked':        SEVERITY.HIGH,
  'guardian.invitation_locked':         SEVERITY.HIGH,    // wrong-code lockout: someone is guessing
  'guardian.claim_succeeded':           SEVERITY.CRITICAL,
  'guardian.claim_failed':              SEVERITY.HIGH,
  'guardian.request_submitted':         SEVERITY.MEDIUM,
  'guardian.request_approved':          SEVERITY.HIGH,
  'guardian.request_rejected':          SEVERITY.MEDIUM,
  'guardian.onboarding_dry_run':        SEVERITY.MEDIUM,
  'guardian.onboarding_applied':        SEVERITY.HIGH,
  'guardian.onboarding_rolled_back':    SEVERITY.HIGH,
  'guardian.national_ids_backfilled':   SEVERITY.MEDIUM,
  'guardian.directory_synced':          SEVERITY.LOW,

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
  'class.subject_unassigned':     SEVERITY.MEDIUM,
  'class.subject_teacher_changed': SEVERITY.MEDIUM,
  'class.subject_assignments_backfilled': SEVERITY.MEDIUM,
  // [NEW 2026-09-16 — Class Subject Presets]
  'class.subjects_set':           SEVERITY.MEDIUM,
  'class.subjects_updated':       SEVERITY.MEDIUM,
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
  'finance.payroll_returned':     SEVERITY.CRITICAL,
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
  'hr.staff_identity_edited':     SEVERITY.HIGH,     // DOB, NRB, TPIN, next of kin (field names only are logged)
  'hr.staff_compliance_edited':   SEVERITY.MEDIUM,   // TCM licence, qualifications, employment category
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

  // ── Signatures
  'signature.uploaded':           SEVERITY.HIGH,
  'signature.removed':            SEVERITY.HIGH,
  'signature.printed':            SEVERITY.LOW,

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

  // ── Approvals Hub — one entry per decision taken from /approvals
  'approval.approved':            SEVERITY.HIGH,
  'approval.rejected':            SEVERITY.HIGH,
  'approval.returned':            SEVERITY.HIGH,
  'approval.cancelled':           SEVERITY.MEDIUM,

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
  /**
   * When the action happened. Set automatically by logAsync() at enqueue
   * time so a deferred flush can't re-date the entry. Leave unset for
   * log()/logBatch() — the database stamps those at insert, which is
   * already the moment of the action.
   */
  occurredAt?: string
}

// ─────────────────────────────────────────────────────────
//  REQUEST-SCOPED AUDIT CONTEXT
//  Created per HTTP request by server/middleware/activityLog.ts. Lets that
//  middleware (a) wait for fire-and-forget writes before the response is
//  sent and (b) know whether the route already audited what it did, so it
//  only records a generic entry when the route recorded nothing itself.
//  Outside a request (cron jobs, scripts) there is no context and every
//  function below behaves exactly as before.
// ─────────────────────────────────────────────────────────

export interface AuditRequestContext {
  /** Writes started during this request that have not settled yet. */
  pending: Set<Promise<unknown>>
  /** Number of audit entries written (or being written) during this request. */
  entriesWritten: number
}

const auditContextStore = new AsyncLocalStorage<AuditRequestContext>()

export function createAuditContext(): AuditRequestContext {
  return { pending: new Set(), entriesWritten: 0 }
}

/** Run `fn` (and everything it awaits) inside `ctx`. */
export function runWithAuditContext<T>(ctx: AuditRequestContext, fn: () => T): T {
  return auditContextStore.run(ctx, fn)
}

/** Resolve once every audit write started in `ctx` has settled (never rejects). */
export async function settleAuditWrites(ctx: AuditRequestContext): Promise<void> {
  // Loop: a settling write may itself start another (e.g. enqueue → flush).
  while (ctx.pending.size > 0) {
    await Promise.allSettled([...ctx.pending])
  }
}

function noteEntries(count: number): void {
  const ctx = auditContextStore.getStore()
  if (ctx) ctx.entriesWritten += count
}

function trackWrite<T>(promise: Promise<T>): Promise<T> {
  const ctx = auditContextStore.getStore()
  if (ctx) {
    ctx.pending.add(promise)
    const done = () => { ctx.pending.delete(promise) }
    promise.then(done, done)
  }
  return promise
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
  noteEntries(1)
  await trackWrite(
    prisma.auditLog.create({
      data: {
        action:     entry.action,
        entityType: entry.entityType,
        entityId:   entry.entityId,
        actorUid:   entry.actorUid,
        actorRole:  entry.actorRole,
        metadata:   (entry.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
      select: { id: true }, // Minimal select — we don't use the returned row
    })
  )
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
// R19: durable audit queue key (Upstash). When Redis is configured, logAsync
// LPUSHes entries here and flushAuditQueue() drains them to Neon — so a Lambda
// recycled immediately after the response no longer silently drops the
// MEDIUM/LOW entry the old un-awaited create() could lose.
const AUDIT_QUEUE_KEY = 'audit:queue'

export function logAsync(input: AuditEntry): void {
  // Stamp the moment of the action NOW. Without this, an entry parked in
  // Redis was dated by whichever later invocation flushed it (see header).
  const entry: AuditEntry = { ...input, occurredAt: input.occurredAt ?? new Date().toISOString() }
  noteEntries(1)

  const redis = getRedis()

  if (redis) {
    // Enqueue durably, then opportunistically drain. Once the LPUSH resolves
    // the entry lives in Redis; even if this instance is recycled before the
    // flush finishes, a later flush (here or via cron) still persists it —
    // now with its original timestamp. The whole chain is tracked so the
    // request middleware can wait for it before sending the response.
    trackWrite(
      redis
        .lpush(AUDIT_QUEUE_KEY, entry)
        .then(() => flushAuditQueue())
    ).catch((err: unknown) => {
      logger.error({ err, entry }, '[auditService] logAsync enqueue failed')
    })
    return
  }

  trackWrite(
    prisma.auditLog.create({
      data: {
        action:     entry.action,
        entityType: entry.entityType,
        entityId:   entry.entityId,
        actorUid:   entry.actorUid,
        actorRole:  entry.actorRole,
        metadata:   (entry.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        createdAt:  new Date(entry.occurredAt as string),
      },
      select: { id: true },
    })
  ).catch((err: unknown) => {
    // Never let an audit log failure propagate — log internally only
    logger.error({ err, entry }, '[auditService] logAsync write failed')
  })
}

/**
 * Drain queued audit entries from Redis to Neon. Safe to call from a cron or
 * opportunistically after an enqueue. No-op when Upstash is not configured
 * (nothing is ever queued in that case). Returns the number persisted.
 */
export async function flushAuditQueue(max = 100): Promise<number> {
  const redis = getRedis()
  if (!redis) return 0

  const drained: AuditEntry[] = []
  for (let i = 0; i < max; i++) {
    const entry = await redis.rpop<AuditEntry>(AUDIT_QUEUE_KEY)
    if (!entry) break
    drained.push(entry)
  }
  if (drained.length === 0) return 0

  try {
    await prisma.auditLog.createMany({
      data: drained.map((entry) => ({
        action:     entry.action,
        entityType: entry.entityType,
        entityId:   entry.entityId,
        actorUid:   entry.actorUid,
        actorRole:  entry.actorRole,
        metadata:   (entry.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        // Entries queued before occurredAt existed have none → DB default.
        ...(entry.occurredAt ? { createdAt: new Date(entry.occurredAt) } : {}),
      })),
    })
    return drained.length
  } catch (err) {
    // Persistence failed — return the entries to the queue so none are lost.
    try {
      await redis.lpush(AUDIT_QUEUE_KEY, ...drained)
    } catch (reErr) {
      logger.error({ reErr, count: drained.length }, '[auditService] failed to requeue audit entries after write failure')
    }
    logger.error({ err, count: drained.length }, '[auditService] flushAuditQueue write failed — entries requeued')
    return 0
  }
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

  noteEntries(entries.length)
  await trackWrite(
    prisma.$transaction(
      entries.map((entry) =>
        prisma.auditLog.create({
          data: {
            action:     entry.action,
            entityType: entry.entityType,
            entityId:   entry.entityId,
            actorUid:   entry.actorUid,
            actorRole:  entry.actorRole,
            metadata:   (entry.metadata ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          },
          select: { id: true },
        })
      )
    )
  )
}

// ─────────────────────────────────────────────────────────
//  QUERY OPERATIONS
// ─────────────────────────────────────────────────────────


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
    pageSize = AUDIT_DEFAULT_PAGE_SIZE,
  } = filters

  const safePageSize = Math.min(pageSize, AUDIT_MAX_PAGE_SIZE)
  const safeOffset   = (Math.max(page, 1) - 1) * safePageSize

  // Build Prisma where clause
  const where: {
    action?: { contains: string; mode: 'insensitive' } | { in: string[] } | { notIn: string[] }
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
  if (severity === SEVERITY.MEDIUM) {
    // MEDIUM is also what resolveSeverity() returns for any action that is
    // NOT listed in ACTION_SEVERITY (including every auto-recorded request
    // entry), so match "everything that isn't explicitly another level"
    // rather than only the explicitly-MEDIUM list.
    const notMedium = Object.entries(ACTION_SEVERITY)
      .filter(([, s]) => s !== SEVERITY.MEDIUM)
      .map(([a]) => a)
    where.action = { notIn: notMedium }
  } else if (severity) {
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

function buildActorWhere(
  actorUid: string,
  filters?: { dateFrom?: Date; dateTo?: Date }
): { actorUid: string; createdAt?: { gte?: Date; lte?: Date } } {
  const where: { actorUid: string; createdAt?: { gte?: Date; lte?: Date } } = { actorUid }
  if (filters?.dateFrom || filters?.dateTo) {
    where.createdAt = {}
    if (filters.dateFrom) where.createdAt.gte = filters.dateFrom
    if (filters.dateTo)   where.createdAt.lte = filters.dateTo
  }
  return where
}

/** Total entries queryByActor() would match with the same date bounds. */
export async function countByActor(
  actorUid: string,
  filters?: { dateFrom?: Date; dateTo?: Date }
): Promise<number> {
  return prisma.auditLog.count({ where: buildActorWhere(actorUid, filters) })
}

/**
 * Get all audit entries produced by a specific actor (Firebase UID).
 * Ordered most-recent first. Cap at 200 entries per call.
 */
export async function queryByActor(
  actorUid: string,
  filters?: { dateFrom?: Date; dateTo?: Date; limit?: number; offset?: number }
): Promise<AuditLogRow[]> {
  const where = buildActorWhere(actorUid, filters)

  const rows = await prisma.auditLog.findMany({
    where,
    // id as a tie-breaker keeps page boundaries stable when several entries
    // share a millisecond (a bulk action writes many at once).
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip: Math.max(filters?.offset ?? 0, 0),
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
  // MEDIUM = every action not explicitly CRITICAL/HIGH/LOW (see resolveSeverity default).
  const nonMediumActions = Object.entries(ACTION_SEVERITY).filter(([, s]) => s !== SEVERITY.MEDIUM).map(([a]) => a)
  const lowActions      = Object.entries(ACTION_SEVERITY).filter(([, s]) => s === SEVERITY.LOW).map(([a]) => a)

  const [critical, high, medium, low, totalToday, totalPeriod] = await prisma.$transaction([
    prisma.auditLog.count({ where: { action: { in: criticalActions }, createdAt: { gte: since7d } } }),
    prisma.auditLog.count({ where: { action: { in: highActions },     createdAt: { gte: since7d } } }),
    prisma.auditLog.count({ where: { action: { notIn: nonMediumActions }, createdAt: { gte: since7d } } }),
    prisma.auditLog.count({ where: { action: { in: lowActions },      createdAt: { gte: since7d } } }),
    prisma.auditLog.count({ where: { createdAt: { gte: sinceToday } } }),
    prisma.auditLog.count({ where: { createdAt: { gte: since7d }    } }),
  ])

  return { critical, high, medium, low, totalToday, totalPeriod }
}