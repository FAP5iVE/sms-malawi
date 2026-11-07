// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  PARENT_FENCE_ALLOWLIST,
  PARENT_FENCE_DENY_BODY,
  isParentRequestAllowed as allowed,
  isParentRequestAllowedFor,
  normalizeFencePath,
} from '../parentFence'

describe('parentFence: what a parent may reach', () => {
  it('allows the whole /parent tree for every method', () => {
    for (const m of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(allowed(m, ['/parent'])).toBe(true)
      expect(allowed(m, ['/parent/children'])).toBe(true)
      expect(allowed(m, ['/parent/children/clx1abc/results'])).toBe(true)
    }
  })

  it('is case-insensitive and ignores a trailing slash and the query string (Express does the same)', () => {
    expect(allowed('GET', ['/PARENT/Children'])).toBe(true)
    expect(allowed('GET', ['/parent/children/'])).toBe(true)
    expect(allowed('GET', ['/parent/children?page=2&x=/students'])).toBe(true)
  })

  it('allows the exact self-service endpoints with the right methods only', () => {
    expect(allowed('POST', ['/auth/log-login-success'])).toBe(true)
    expect(allowed('POST', ['/auth/heartbeat'])).toBe(true)
    expect(allowed('POST', ['/auth/log-logout'])).toBe(true)
    expect(allowed('GET', ['/users/me/notification-prefs'])).toBe(true)
    expect(allowed('PATCH', ['/users/me/notification-prefs'])).toBe(true)
    expect(allowed('GET', ['/notifications/feed'])).toBe(true)
    expect(allowed('PATCH', ['/notifications/feed/read-all'])).toBe(true)
    expect(allowed('PATCH', ['/notifications/feed/AbC123xyz/read'])).toBe(true)
    expect(allowed('POST', ['/notifications/register-token'])).toBe(true)
    expect(allowed('DELETE', ['/notifications/unregister-token'])).toBe(true)
  })

  it('treats HEAD like GET', () => {
    expect(allowed('HEAD', ['/notifications/feed'])).toBe(true)
    expect(allowed('HEAD', ['/students'])).toBe(false)
  })
})

describe('parentFence: everything else is denied', () => {
  const staffAndStudentPaths = [
    '/students', '/students/abc', '/students/me', '/students/abc/guardians', '/students/abc/welfare',
    '/classes', '/applications', '/applications/abc', '/assignments', '/attendance',
    '/finances', '/finances/invoices', '/finances/students/abc/balance', '/payroll',
    '/exams', '/exams/results/abc', '/exams/compute', '/announcements', '/reports/anything',
    '/users', '/users/me/sex', '/users/abc/reset-password', '/health', '/settings/notifications',
    '/audit', '/sessions', '/sessions/abc/force-logout', '/pending-actions', '/approvals',
    '/hr', '/hr/me/details', '/library', '/assets', '/gallery', '/analytics', '/reporting',
    '/search', '/calendar', '/algolia-admin', '/public', '/holidays', '/placements/me',
    '/monitoring', '/procurement', '/inventory', '/stocktakes', '/locations', '/guardians',
    '/promotion', '/',
  ]

  it('denies every staff or student router path for every method', () => {
    for (const p of staffAndStudentPaths) {
      for (const m of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']) {
        expect(allowed(m, [p])).toBe(false)
      }
    }
  })

  it('does not treat look-alike prefixes as /parent', () => {
    for (const p of ['/parentx', '/parents', '/parent.evil', '/xparent', '/parent-admin', '/guardian', '/guardians/x']) {
      expect(allowed('GET', [p])).toBe(false)
    }
  })

  it('denies a wrong method on an allowed path', () => {
    expect(allowed('GET', ['/auth/heartbeat'])).toBe(false)
    expect(allowed('DELETE', ['/notifications/feed'])).toBe(false)
    expect(allowed('POST', ['/notifications/feed'])).toBe(false)
    expect(allowed('PUT', ['/users/me/notification-prefs'])).toBe(false)
    expect(allowed('GET', ['/notifications/register-token'])).toBe(false)
  })

  it('does not let a parameter segment swallow extra path or odd characters', () => {
    expect(allowed('PATCH', ['/notifications/feed/a/b/read'])).toBe(false)
    expect(allowed('PATCH', ['/notifications/feed/read'])).toBe(false)
    expect(allowed('PATCH', ['/notifications/feed//read'])).toBe(false)
    expect(allowed('PATCH', ['/notifications/feed/a b/read'])).toBe(false)
    expect(allowed('PATCH', ['/notifications/feed/a;b/read'])).toBe(false)
  })

  it('denies unknown or missing methods and an empty set of path views', () => {
    expect(allowed(undefined, ['/parent'])).toBe(false)
    expect(allowed(null, ['/parent'])).toBe(false)
    expect(allowed(42, ['/parent'])).toBe(false)
    expect(allowed('OPTIONS', ['/parent'])).toBe(false)
    expect(allowed('TRACE', ['/parent'])).toBe(false)
    expect(allowed('GET', [])).toBe(false)
    expect(allowed('GET', [undefined, null, ''])).toBe(false)
  })
})

describe('parentFence: path tricks are denied, never repaired', () => {
  const tricks = [
    '/parent/../students',
    '/parent/./children',
    '/parent//children',
    '//parent/children',
    '/parent/children/..',
    '/parent/%2e%2e/students',
    '/parent/%2E%2E%2Fstudents',
    '/parent/..%2fstudents',
    '/parent%2fchildren',
    '/%70arent/children',
    '/parent\\..\\students',
    '/parent/children\u0000/x',
    '/parent/chi\nldren',
    '/parent/children /x',
    'parent/children',
    'http://evil.example/parent/children',
  ]
  it('denies traversal, double slashes, encodings, backslashes, control characters and non-absolute paths', () => {
    for (const t of tricks) expect(allowed('GET', [t])).toBe(false)
  })

  it('an over-long path is denied', () => {
    expect(allowed('GET', ['/parent/' + 'a'.repeat(3000)])).toBe(false)
  })

  it('normalizeFencePath returns null for unusable input', () => {
    expect(normalizeFencePath(undefined)).toBeNull()
    expect(normalizeFencePath(5)).toBeNull()
    expect(normalizeFencePath('')).toBeNull()
    expect(normalizeFencePath('/a/%41')).toBeNull()
    expect(normalizeFencePath('/Parent/X/?q=1')).toBe('/parent/x')
    expect(normalizeFencePath('/')).toBe('/')
  })
})

describe('parentFence: every view of the path must agree', () => {
  it('denies when originalUrl is allowed but baseUrl + path is not (and vice versa)', () => {
    expect(allowed('GET', ['/parent/children', '/students/x'])).toBe(false)
    expect(allowed('GET', ['/students/x', '/parent/children'])).toBe(false)
  })

  it('isParentRequestAllowedFor builds both views from an Express-like request', () => {
    expect(isParentRequestAllowedFor({ method: 'GET', originalUrl: '/parent/children?x=1', baseUrl: '/parent', path: '/children' })).toBe(true)
    // Mounted router: url has been stripped, path/baseUrl carry the truth.
    expect(isParentRequestAllowedFor({ method: 'GET', originalUrl: '/students/abc', baseUrl: '/students', path: '/abc' })).toBe(false)
    // Views that disagree deny.
    expect(isParentRequestAllowedFor({ method: 'GET', originalUrl: '/parent/x', baseUrl: '/students', path: '/x' })).toBe(false)
    // Mount-level verifyAuth: baseUrl is the mount, path the remainder.
    expect(isParentRequestAllowedFor({ method: 'GET', originalUrl: '/reports/exec', baseUrl: '/reports', path: '/exec' })).toBe(false)
    // Nothing usable at all.
    expect(isParentRequestAllowedFor({ method: 'GET' })).toBe(false)
  })
})

describe('parentFence: the allowlist itself', () => {
  it('only /parent uses a wildcard', () => {
    const wild = PARENT_FENCE_ALLOWLIST.filter((e) => e.path.includes('*'))
    expect(wild.map((e) => e.path)).toEqual(['/parent/*'])
  })

  it('has no duplicate method+path pairs and every entry explains itself', () => {
    const seen = new Set<string>()
    for (const e of PARENT_FENCE_ALLOWLIST) {
      expect(e.reason.length).toBeGreaterThan(10)
      for (const m of e.methods) {
        const k = `${m} ${e.path}`
        expect(seen.has(k)).toBe(false)
        seen.add(k)
      }
    }
  })

  it('never allows a staff or student router prefix', () => {
    const banned = ['/students', '/finances', '/exams', '/classes', '/applications', '/reports', '/hr',
      '/payroll', '/settings', '/audit', '/sessions', '/pending-actions', '/approvals', '/library']
    for (const e of PARENT_FENCE_ALLOWLIST) {
      for (const b of banned) {
        expect(e.path === b || e.path.startsWith(`${b}/`)).toBe(false)
      }
    }
  })

  it('self-service entries under /users and /notifications are all "me"-scoped or uid-keyed', () => {
    for (const e of PARENT_FENCE_ALLOWLIST) {
      if (e.path.startsWith('/users/')) expect(e.path.startsWith('/users/me/')).toBe(true)
    }
  })

  it('the deny body matches requireRole\u2019s so a denial does not fingerprint the control', () => {
    expect(PARENT_FENCE_DENY_BODY).toEqual({ error: 'Access denied for your role' })
  })
})
