import 'server-only'

/**
 * apps/web/src/server/middleware/activityLog.ts
 *
 * [CHANGE TYPE]: NEW FILE (Sessions / Audit completeness)
 * [PURPOSE]: Guarantees that every action a signed-in user takes is written
 *   to the audit log, so Reports > Audit Log and the per-session activity
 *   pop-up (Reports > Sessions) both show everything.
 *
 *   Before this, auditing was opt-in per service function; most mutating
 *   routes (library, HR, finances, settings, users, announcements, …) never
 *   wrote an entry, so those actions simply did not exist in the log — and
 *   therefore could not appear under any session.
 *
 *   How it works
 *   • Mounted once in api-app.ts, before the routers. It opens a request-
 *     scoped AuditRequestContext (see auditService.ts) around the request.
 *   • It wraps res.end. When a route is about to respond, the wrapper
 *       1. if the request was a successful state-changing call by a signed-in
 *          user AND the route wrote no audit entry of its own, records one
 *          generic entry (who, what, which record, which endpoint);
 *       2. waits for every audit write started during the request (including
 *          fire-and-forget logAsync ones) to settle;
 *       3. only then lets the response go out.
 *     Step 2 matters on serverless hosting: a function can be frozen the
 *     instant the response is sent, silently dropping un-awaited writes.
 *   • Routes that already audit themselves (richer before/after metadata)
 *     are left exactly as they were — no duplicate row is added for them.
 *
 *   res.end is wrapped (not res.on('finish')) because the Next.js bridge in
 *   app/api/[[...slug]]/route.ts hands Express a minimal mock response with
 *   no event emitter, so 'finish' never fires there.
 *
 *   Request bodies are NEVER stored — only the names of the submitted fields
 *   — so passwords / personal data are not copied into the audit log.
 * [DEPENDS ON]: W/server/services/auditService.ts, W/lib/logger.ts
 */

import type { Request, Response, NextFunction } from 'express'
import * as auditService from '@/server/services/auditService'
import { logger } from '@/lib/logger'

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Reads that are worth an entry because they hand data out of the system.
const SENSITIVE_READ = /(export|download|print|pdf|report-card|transcript|receipt)/i

// Top-level route groups that are never auto-recorded: session plumbing
// (login/logout/heartbeat are tracked by UserSession itself; force-logout
// writes its own CRITICAL entry), the audit viewer itself, and high-volume
// housekeeping that is not a user decision.
const SKIP_RESOURCES = new Set(['auth', 'audit', 'sessions', 'notifications', 'monitoring', 'search', 'health', 'public'])

// Never wait longer than this for audit writes before releasing a response.
const SETTLE_TIMEOUT_MS = 5_000

// Largest JSON response body parsed to discover a newly created record's id.
const MAX_BODY_SNIFF_BYTES = 200_000

// ─────────────────────────────────────────────────────────
//  PATH HELPERS (exported for unit tests)
// ─────────────────────────────────────────────────────────

/** True for segments that are record ids (numeric, UUID, cuid, Firebase uid) rather than route words. */
export function looksLikeId(segment: string): boolean {
  if (/^\d+$/.test(segment)) return true
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return true
  if (/^c[a-z0-9]{24}$/.test(segment)) return true // cuid
  // Long opaque token containing a digit (Firebase uid etc.). The digit
  // requirement keeps long hyphenated route words from matching.
  return /^(?=.*\d)[A-Za-z0-9_-]{20,}$/.test(segment)
}

function singular(word: string): string {
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (word.endsWith('sses')) return word.slice(0, -2)
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

function toEntityType(word: string): string {
  const base = singular(word.toLowerCase())
  if (base.length <= 3) return base.toUpperCase() // hr → HR
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')
}

export interface RouteDescription {
  /** e.g. 'students.archive', 'students.update', 'library.books.delete' */
  action: string
  /** e.g. 'Student', 'Book' */
  entityType: string
  /** Record id found in the URL, or null. */
  entityId: string | null
  /** Route pattern when known, else the concrete path. */
  pattern: string
}

/**
 * Turn "METHOD /students/abc123.../archive" into a stable, readable audit
 * action ('students.archive'). `pattern` is the Express route pattern
 * (baseUrl + route.path) when available; `concretePath` is the real URL path.
 */
export function describeRoute(method: string, pattern: string, concretePath: string): RouteDescription {
  const rawSegments = pattern.split('/').filter(Boolean)
  const isParam = (s: string) => s.startsWith(':') || looksLikeId(s)
  const staticSegments = rawSegments.filter((s) => !isParam(s))

  const resource = staticSegments[0] ?? 'api'
  const rest = staticSegments.slice(1)

  // POST /students                 → students.create
  // POST /exams/:id/marks          → exams.marks.create   (last word is a plural noun: a collection)
  // POST /students/:id/archive     → students.archive     (last word is itself the verb)
  // PATCH /students/:id            → students.update
  // DELETE /library/books/:id      → library.books.delete
  const m = method.toUpperCase()
  const lastWord = rest[rest.length - 1]
  const isCollection = lastWord !== undefined && /s$/.test(lastWord) && !/(ss|us|is)$/.test(lastWord)
  const verb =
    m === 'DELETE' ? 'delete'
    : m === 'PUT' || m === 'PATCH' ? 'update'
    : rest.length === 0 || isCollection ? 'create'
    : ''
  const action = [resource, ...rest, ...(verb ? [verb] : [])].join('.')

  // The thing acted on = the static word right before the first id/param
  // ('/library/books/:id' → books); otherwise the last static word.
  const firstParamIdx = rawSegments.findIndex(isParam)
  const entityWord =
    firstParamIdx > 0 ? (rawSegments[firstParamIdx - 1] as string)
    : (staticSegments[staticSegments.length - 1] ?? resource)
  const entityType = toEntityType(entityWord)

  const entityId = concretePath.split('/').filter(Boolean).find(looksLikeId) ?? null

  return { action, entityType, entityId, pattern }
}

function pathOnly(url: string): string {
  const q = url.indexOf('?')
  return q === -1 ? url : url.slice(0, q)
}

/** Best-effort: the `id` of a record a create endpoint just returned. */
function sniffCreatedId(chunk: unknown, contentType: unknown): string | null {
  if (typeof contentType !== 'string' || !contentType.includes('json')) return null
  let text: string
  if (typeof chunk === 'string') text = chunk
  else if (Buffer.isBuffer(chunk)) text = chunk.toString('utf8')
  else return null
  if (text.length === 0 || text.length > MAX_BODY_SNIFF_BYTES) return null
  try {
    const body = JSON.parse(text) as Record<string, unknown> | null
    if (!body || typeof body !== 'object') return null
    const nested = (body['data'] ?? body['result']) as Record<string, unknown> | undefined
    const id = body['id'] ?? nested?.['id']
    return typeof id === 'string' && id.length > 0 ? id : null
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────────────────
//  GENERIC ENTRY
// ─────────────────────────────────────────────────────────

function shouldRecord(req: Request, res: Response): boolean {
  if (!req.user) return false // public / unauthenticated — nothing to attribute
  if (res.statusCode >= 400) return false // failed or denied: no state changed

  const path = pathOnly(req.originalUrl || req.url || '')
  const resource = path.split('/').filter(Boolean)[0] ?? ''
  if (SKIP_RESOURCES.has(resource)) return false

  if (MUTATING_METHODS.has(req.method)) return true
  return req.method === 'GET' && SENSITIVE_READ.test(path)
}

async function recordGenericEntry(req: Request, res: Response, endChunk: unknown, ctx: auditService.AuditRequestContext): Promise<void> {
  if (ctx.entriesWritten > 0) return // the route audited itself — keep its richer entry
  if (!shouldRecord(req, res)) return

  const user = req.user!
  const concretePath = pathOnly(req.originalUrl || req.url || '')
  const routePath = (req.route as { path?: unknown } | undefined)?.path
  const pattern = typeof routePath === 'string' ? `${req.baseUrl ?? ''}${routePath}` : concretePath

  const info = describeRoute(req.method, pattern, concretePath)
  const paramId = Object.values(req.params ?? {}).find((v) => typeof v === 'string' && v.length > 0)
  const entityId =
    info.entityId ??
    (typeof paramId === 'string' ? paramId : null) ??
    sniffCreatedId(endChunk, res.getHeader?.('content-type')) ??
    '-'

  const bodyFields =
    req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)
      ? Object.keys(req.body as Record<string, unknown>).slice(0, 40)
      : []

  await auditService.log({
    action: info.action,
    entityType: info.entityType,
    entityId,
    actorUid: user.uid,
    actorRole: user.role,
    metadata: {
      context: {
        recordedBy: 'activity-middleware',
        method: req.method,
        route: info.pattern,
        path: concretePath,
        status: res.statusCode,
        submittedFields: bodyFields,
      },
    },
  })
}

// ─────────────────────────────────────────────────────────
//  MIDDLEWARE
// ─────────────────────────────────────────────────────────

export function activityLogger(req: Request, res: Response, next: NextFunction): void {
  const ctx = auditService.createAuditContext()
  const originalEnd = res.end as (...a: unknown[]) => unknown
  let deferred = false

  res.end = function patchedEnd(this: Response, ...args: unknown[]): Response {
    if (deferred) return this // a second end() is a handler bug; never send twice
    deferred = true

    void (async () => {
      try {
        await recordGenericEntry(req, res, args[0], ctx)
        let timer: ReturnType<typeof setTimeout> | undefined
        await Promise.race([
          auditService.settleAuditWrites(ctx),
          new Promise<void>((resolve) => { timer = setTimeout(resolve, SETTLE_TIMEOUT_MS) }),
        ])
        if (timer) clearTimeout(timer)
      } catch (err) {
        // Auditing must never block or break the response itself.
        logger.error({ err, method: req.method, url: req.originalUrl }, '[activityLog] failed to record activity')
      } finally {
        originalEnd.apply(this, args)
      }
    })()

    return this
  } as unknown as Response['end']

  auditService.runWithAuditContext(ctx, () => next())
}
