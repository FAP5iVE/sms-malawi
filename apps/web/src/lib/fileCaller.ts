/**
 * [FILE]: apps/web/src/lib/fileCaller.ts
 * [PURPOSE]: Pure decision for "who is calling the file proxy, and may this
 *   identity use it at all", made BEFORE any file-specific check.
 *
 *   Replaces `role ?? 'student'` in app/api/files/[fileId]/route.ts. Defaulting a
 *   token with no role to the least-privileged real role looked safe, but it
 *   turned "no role" into "student" (who may read lots of things). A missing or
 *   unrecognised role is now refused outright.
 *
 *   The proxy still accepts `?token=` for staff and students because browser
 *   navigations (window.open, iframes) cannot send a header. A guardian is a
 *   member of the public using phones and shared devices: a URL carrying a
 *   bearer token ends up in history, referrers and chat apps. Parents may only
 *   present the token in the Authorization header (the app already fetches
 *   protected files that way and opens a blob URL: lib/pdfPreview.ts).
 *
 * Pure (no I/O) so it is unit-tested directly.
 */
import { isValidRole, type UserRole } from '@shared/types/roles'

export type TokenSource = 'header' | 'query' | 'none'

/**
 * Mirrors getIdTokenFromRequest exactly: the Authorization header wins when it
 * carries a Bearer token, otherwise the `token` query parameter is used.
 */
export function tokenSourceOf(
  authorizationHeader: string | null | undefined,
  queryToken: string | null | undefined,
): TokenSource {
  const header = authorizationHeader ?? ''
  const headerToken = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (headerToken) return 'header'
  if (queryToken) return 'query'
  return 'none'
}

export type FileCaller =
  | { ok: true; uid: string; role: UserRole }
  | { ok: false; status: 401 | 403; error: 'Unauthorised' | 'Forbidden' }

export function resolveFileCaller(input: {
  uid: unknown
  roleClaim: unknown
  source: TokenSource
}): FileCaller {
  if (typeof input.uid !== 'string' || input.uid.length === 0) {
    return { ok: false, status: 401, error: 'Unauthorised' }
  }
  // Never default. No role / unknown role = no access.
  if (!isValidRole(input.roleClaim)) {
    return { ok: false, status: 403, error: 'Forbidden' }
  }
  // Guardians: header only. A token in a URL is refused even if it is valid.
  if (input.roleClaim === 'parent' && input.source !== 'header') {
    return { ok: false, status: 403, error: 'Forbidden' }
  }
  return { ok: true, uid: input.uid, role: input.roleClaim }
}
