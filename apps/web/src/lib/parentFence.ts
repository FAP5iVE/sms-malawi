/**
 * [FILE]: apps/web/src/lib/parentFence.ts
 * [PURPOSE]: The default-deny fence for the guardian-portal ("parent") role.
 *
 *   Every router in this app was written for staff or students. Several decide
 *   access by exclusion (`role !== 'student'` means staff) or by a permission
 *   check that a role with an empty permission set simply fails. Neither is a
 *   safe foundation for a role whose users are members of the public, so a
 *   parent token is confined HERE, at the one place every router passes through
 *   (`verifyAuth`), to an explicit allowlist. A route added next year is denied
 *   to parents by default; there is nothing to remember to do.
 *
 *   This module is deliberately PURE (no imports): it is unit-tested directly and
 *   by an auto-generated test that walks every registered Express route.
 *
 * [SECURITY NOTES]
 *   - Entries are exact method + path pairs. The only prefix is `/parent`, whose
 *     own router performs the per-request guardian-link authorization.
 *   - A path is normalised before matching and is DENIED (not repaired) if it
 *     contains anything unusual: percent-encoding, backslashes, empty or dot
 *     segments, control characters. Allowed paths never need those.
 *   - Express routes case-insensitively and ignores a trailing slash, so both
 *     are normalised the same way before comparison.
 *   - The caller passes every view of the request path it has (originalUrl and
 *     baseUrl + path); ALL of them must be allowed. A disagreement between the
 *     views fails closed.
 *   - The decision depends only on method and path. Nothing client-controlled
 *     (headers, cookies, body, the sms_role cookie) can widen it.
 */

export interface ParentFenceEntry {
  /** Upper-case HTTP methods this entry permits. HEAD is treated as GET. */
  readonly methods: readonly string[]
  /**
   * Path relative to the API root (no `/api`). `:name` matches exactly one
   * identifier-like segment. A trailing `/*` is a prefix match and is only ever
   * used for `/parent`.
   */
  readonly path: string
  /** Why a parent needs it. Reviewed when the list changes. */
  readonly reason: string
}

export const PARENT_FENCE_ALLOWLIST: readonly ParentFenceEntry[] = [
  {
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    path: '/parent/*',
    reason: 'The guardian portal router. Every route beneath it authorizes the guardian link per request.',
  },
  // ── Session telemetry (AuthProvider calls these for every signed-in user) ──
  { methods: ['POST'], path: '/auth/log-login-success', reason: 'Login telemetry for the caller\u2019s own session.' },
  { methods: ['POST'], path: '/auth/heartbeat',          reason: 'Keeps the caller\u2019s own session row alive.' },
  { methods: ['POST'], path: '/auth/log-logout',         reason: 'Closes the caller\u2019s own session row.' },
  // ── Own notification settings and feed (all keyed by the verified uid) ──
  { methods: ['GET', 'PATCH'], path: '/users/me/notification-prefs',        reason: 'The caller\u2019s own notification preferences.' },
  { methods: ['POST'],         path: '/users/me/clear-password-change-flag', reason: 'Clears the caller\u2019s own forced-password-change flag after they change it.' },
  { methods: ['GET'],    path: '/notifications/feed',               reason: 'The caller\u2019s own in-app feed (notifications/{uid}/items).' },
  { methods: ['PATCH'],  path: '/notifications/feed/read-all',      reason: 'Marks the caller\u2019s own feed read.' },
  { methods: ['PATCH'],  path: '/notifications/feed/:id/read',      reason: 'Marks one of the caller\u2019s own feed items read.' },
  { methods: ['POST'],   path: '/notifications/register-token',     reason: 'Registers the caller\u2019s own device for push.' },
  { methods: ['DELETE'], path: '/notifications/unregister-token',   reason: 'Removes the caller\u2019s own device from push.' },
  { methods: ['GET'],    path: '/notifications/token-status',       reason: 'Reports the caller\u2019s own push registration state.' },
]

/** Generic body. Identical to requireRole's, so a denial reveals nothing about which control fired. */
export const PARENT_FENCE_DENY_BODY = { error: 'Access denied for your role' } as const

const SEGMENT_ID = /^[a-z0-9][a-z0-9_-]{0,127}$/

/**
 * Lower-cases, strips the query string and one trailing slash. Returns null when
 * the path contains anything an allowed route never needs, so callers deny.
 */
export function normalizeFencePath(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return null
  const q = raw.search(/[?#]/)
  let p = q === -1 ? raw : raw.slice(0, q)
  if (!p.startsWith('/')) return null
  // Encoded characters, backslashes, control characters and whitespace are never
  // part of an allowed path. Reject rather than decode: decoding is how filters
  // and routers come to disagree.
  if (/[%\\\u0000-\u001f\u007f\s]/.test(p)) return null
  p = p.toLowerCase()
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1)
  if (p === '/') return p
  const segments = p.slice(1).split('/')
  for (const s of segments) {
    if (s === '' || s === '.' || s === '..') return null
  }
  return p
}

function entryMatches(entry: ParentFenceEntry, method: string, path: string): boolean {
  if (!entry.methods.includes(method)) return false
  if (entry.path.endsWith('/*')) {
    const base = entry.path.slice(0, -2)
    return path === base || path.startsWith(`${base}/`)
  }
  const want = entry.path.split('/')
  const got  = path.split('/')
  if (want.length !== got.length) return false
  for (let i = 0; i < want.length; i++) {
    const w = want[i]!
    const g = got[i]!
    if (w.startsWith(':')) {
      if (!SEGMENT_ID.test(g)) return false
    } else if (w !== g) {
      return false
    }
  }
  return true
}

/**
 * True only when EVERY supplied path view normalises and matches an allowlist
 * entry for the method. No views, or any unusable view, means deny.
 */
export function isParentRequestAllowed(
  method: unknown,
  pathViews: ReadonlyArray<unknown>,
): boolean {
  if (typeof method !== 'string') return false
  let m = method.toUpperCase()
  if (m === 'HEAD') m = 'GET'
  const views = pathViews.filter((v) => v !== undefined && v !== null && v !== '')
  if (views.length === 0) return false
  for (const view of views) {
    const path = normalizeFencePath(view)
    if (path === null) return false
    if (!PARENT_FENCE_ALLOWLIST.some((e) => entryMatches(e, m, path))) return false
  }
  return true
}

/** Convenience for Express: pass the request-like object. */
export function isParentRequestAllowedFor(req: {
  method?: unknown
  originalUrl?: unknown
  baseUrl?: unknown
  path?: unknown
  url?: unknown
}): boolean {
  const views: unknown[] = []
  if (typeof req.originalUrl === 'string' && req.originalUrl) views.push(req.originalUrl)
  // Inside a mounted router `url` is already stripped of the mount path, so the
  // second view is rebuilt from baseUrl + path (query string excluded).
  if (typeof req.path === 'string') views.push(`${typeof req.baseUrl === 'string' ? req.baseUrl : ''}${req.path}`)
  // Last resort when Express has populated neither (never the case in the app).
  if (views.length === 0 && typeof req.url === 'string') views.push(req.url)
  return isParentRequestAllowed(req.method, views)
}
