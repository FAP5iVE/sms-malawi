/**
 * apps/web/src/server/lib/financialUnitOfWork.ts
 *
 * [CHANGE TYPE]: NEW FILE. Finance Hardening Plan P1-06 (D-08, C-02, X-12, X-16; spec Part 4 §1.1, §1.4, §1.5).
 *
 * Every operation that moves money runs through `runFinancialTransaction`:
 *
 *   one database transaction
 *     1. claim the idempotency key (when the request carries one)
 *     2. the caller's work: guards, conditional writes, register row + journal, balances
 *     3. store the response against the key
 *   commit
 *
 * A failure anywhere rolls back everything, including the key, so the same key can simply be sent again. If the
 * commit succeeded but the answer was lost, the retry finds the stored record and gets the first response back: no
 * second payment. Nothing here retries by itself — only the client does, with the same key.
 *
 * Lock order (Part 4 §1.2): idempotency key → the aggregate row(s) in ascending id → child rows → ledger accounts
 * (accountingService.postEntry already takes those in ascending id).
 */
import 'server-only'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { fingerprintOf } from '@/lib/idempotency-core'
import { isFinanceV2 } from '@/server/services/settingsService'

/** The client of the open money transaction. */
export type FinancialTx = Prisma.TransactionClient

export type FinancialErrorCode =
  | 'VALIDATION_ERROR'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'STATE_CONFLICT'
  | 'ALREADY_POSTED'
  | 'ALREADY_REVERSED'
  | 'IN_PROGRESS'
  | 'SEGREGATION_VIOLATION'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'INSUFFICIENT_BUDGET'
  | 'AMBIGUOUS_BUDGET'
  | 'NO_BUDGET'
  | 'GONE'
  | 'RETRYABLE'

/** A money rule was broken. The message is written to be shown to the person; `code` is for the program. */
export class FinancialError extends Error {
  constructor(
    public readonly code: FinancialErrorCode,
    public readonly status: 400 | 403 | 404 | 409 | 410 | 422 | 503,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'FinancialError'
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// IDEMPOTENCY
// ─────────────────────────────────────────────────────────────────────────────

export const IDEMPOTENCY_HEADER = 'idempotency-key'
/** Same shape lib/idempotency-core.ts accepts (the Redis front filter). */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_\-:.]{8,128}$/
export const IDEMPOTENCY_RETENTION_DAYS = 90

export interface IdempotencyContext {
  /** The operation, e.g. "payment.record". A key is unique within its scope. */
  scope: string
  key: string
  /** Fingerprint of what was asked: the same key with a different request is refused. */
  requestHash: string
  /** Turns the operation's result into the response body that is stored and replayed. */
  serialize?: (result: unknown) => unknown
  /** Set by runFinancialTransaction when it returned a stored response instead of doing the work. */
  replayed?: boolean
}

interface RequestLike {
  headers: Record<string, string | string[] | undefined>
  params?: unknown
  body?: unknown
}

/**
 * The idempotency context of a money request. The key is honoured whenever it is sent; it is REQUIRED
 * (400 IDEMPOTENCY_KEY_REQUIRED) once `finance.v2.ledgerEngine` is on.
 */
export async function financialIdempotency(
  req: RequestLike,
  scope: string,
  serialize?: (result: unknown) => unknown,
): Promise<IdempotencyContext | undefined> {
  const raw = req.headers[IDEMPOTENCY_HEADER]
  const key = (Array.isArray(raw) ? raw[0] : raw)?.trim()
  if (!key) {
    if (await isFinanceV2('ledgerEngine')) {
      throw new FinancialError(
        'IDEMPOTENCY_KEY_REQUIRED', 400,
        'This request needs an Idempotency-Key header. Refresh the page and try again.',
      )
    }
    return undefined
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new FinancialError(
      'VALIDATION_ERROR', 400,
      'Idempotency-Key must be 8–128 characters: letters, digits, "_", "-", ":" or ".".',
    )
  }
  return {
    scope,
    key,
    requestHash: fingerprintOf({ params: req.params ?? {}, body: req.body ?? null }),
    serialize,
  }
}

/** Mark a replayed answer. Returns the HTTP status to answer with: 200 for a replay, otherwise `status`. */
export function replayAwareStatus(
  res: { setHeader(name: string, value: string): unknown },
  context: IdempotencyContext | undefined,
  status = 200,
): number {
  if (!context?.replayed) return status
  res.setHeader('Idempotent-Replay', 'true')
  return 200
}

/** Returns the stored response when this key has already completed; otherwise claims the key and returns null. */
async function claimKey(
  tx: FinancialTx,
  context: IdempotencyContext,
  actorUid: string,
): Promise<{ body: unknown } | null> {
  const { scope, key, requestHash } = context
  // Held until this transaction ends. A second request with the same key does not wait: it is told to.
  const lockName = `idempotency:${scope}:${key}`
  const rows = await tx.$queryRaw<{ locked: boolean }[]>`
    SELECT pg_try_advisory_xact_lock(hashtextextended(${lockName}, 0)) AS "locked"`
  if (!rows[0]?.locked) {
    throw new FinancialError('IN_PROGRESS', 409, 'This request is already being processed. Wait a moment, then check the record.')
  }

  const existing = await tx.idempotencyRecord.findUnique({ where: { scope_key: { scope, key } } })
  if (existing) {
    if (existing.requestHash !== requestHash || existing.actorUid !== actorUid) {
      throw new FinancialError('IDEMPOTENCY_KEY_REUSED', 422, 'This Idempotency-Key was already used for a different request.')
    }
    if (existing.status !== 'COMPLETED') {
      throw new FinancialError('IN_PROGRESS', 409, 'This request is already being processed. Wait a moment, then check the record.')
    }
    return { body: existing.responseBody }
  }

  const expiresAt = new Date(Date.now() + IDEMPOTENCY_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  await tx.idempotencyRecord.create({
    data: { scope, key, actorUid, requestHash, status: 'IN_PROGRESS', expiresAt },
  })
  return null
}

async function completeKey(tx: FinancialTx, context: IdempotencyContext, result: unknown): Promise<void> {
  const shaped = context.serialize ? context.serialize(result) : result
  // Exactly what res.json() would send: Dates and Decimals become what the client receives.
  const text = JSON.stringify(shaped ?? null)
  await tx.idempotencyRecord.update({
    where: { scope_key: { scope: context.scope, key: context.key } },
    data: {
      status: 'COMPLETED',
      responseStatus: 200,
      // A JSON column cannot be set to a bare null this way; an operation with no result stores nothing.
      responseBody: text === 'null' ? undefined : (JSON.parse(text) as Prisma.InputJsonValue),
      completedAt: new Date(),
    },
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// UNIT OF WORK
// ─────────────────────────────────────────────────────────────────────────────

// Connection and transaction failures: the outcome is unknown or nothing was written. Never retried here.
const TRANSIENT_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2028', 'P2034'])
const DEFAULT_MAX_WAIT_MS = 10_000
const DEFAULT_TIMEOUT_MS = 20_000

export interface FinancialTransactionOptions {
  actorUid: string
  idempotency?: IdempotencyContext
  maxWaitMs?: number
  timeoutMs?: number
}

/**
 * Run one money operation. `work` must do every read it decides on, and every write, through `tx`.
 *
 * On a replay the return value is the STORED JSON response (dates as strings, amounts as they were sent), and
 * `idempotency.replayed` is true: callers skip their after-commit side effects.
 */
export async function runFinancialTransaction<T>(
  options: FinancialTransactionOptions,
  work: (tx: FinancialTx) => Promise<T>,
): Promise<T> {
  const context = options.idempotency
  if (context) context.replayed = false
  try {
    return await prisma.$transaction(
      async (tx) => {
        if (context) {
          const stored = await claimKey(tx, context, options.actorUid)
          if (stored) {
            context.replayed = true
            return stored.body as T
          }
        }
        const result = await work(tx)
        if (context) await completeKey(tx, context, result)
        return result
      },
      { maxWait: options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS, timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS },
    )
  } catch (err) {
    const code = (err as { code?: unknown } | null)?.code
    if (typeof code === 'string' && TRANSIENT_CODES.has(code)) {
      throw new FinancialError(
        'RETRYABLE', 503,
        context
          ? 'The database did not confirm this. Submit again: a repeat of the same request is not recorded twice.'
          : 'The database did not confirm this. Check whether it was saved before trying again.',
        { cause: code },
      )
    }
    throw err
  }
}
