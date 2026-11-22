// @vitest-environment node
/**
 * Guardian-portal fence completeness (plan release gate "Fence completeness").
 *
 * Walks EVERY Express route registered in lib/api-app.ts + server/routes/** (via the
 * same static inventory the route-contract test uses) and proves that a `parent`
 * token is denied by the fence unless the route is on the explicit allowlist. A route
 * added next year is therefore denied to parents without anyone remembering to do
 * anything. Also pins the wiring: the fence must run inside verifyAuth before
 * req.user is set, Server Actions must refuse parents, and the allowlist must not
 * go stale or drift to point at routes that no longer exist.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { collectAll, type ExpressEndpoint } from '../../../../test/security/endpointInventory'
import {
  PARENT_FENCE_ALLOWLIST,
  isParentRequestAllowed,
  isParentRequestAllowedFor,
} from '@/lib/parentFence'

const WEB_ROOT = path.resolve(__dirname, '../../../..')
const inv = collectAll(WEB_ROOT)
const express = inv.express

/** `/api/students/:id/x` -> `/students/abc123/x` (what Express sees). */
function concretePath(e: ExpressEndpoint): string {
  return e.fullPath.replace(/^\/api/, '').replace(/:[A-Za-z0-9_]+(\([^)]*\))?\??/g, 'abc123') || '/'
}

const isParentTree = (p: string) => p === '/parent' || p.startsWith('/parent/')

/** Is this concrete endpoint (method+path) covered by an allowlist entry? */
function allowlistCovers(method: string, p: string): boolean {
  return isParentRequestAllowed(method, [p])
}

describe('fence completeness: every registered route', () => {
  it('discovers a realistic number of endpoints (guards against the walker silently finding none)', () => {
    expect(express.length).toBeGreaterThan(300)
  })

  it('denies a parent on every route that is not allowlisted, for the route\u2019s own method', () => {
    const leaks: string[] = []
    for (const e of express) {
      const p = concretePath(e)
      const decision = isParentRequestAllowed(e.method, [p])
      const onList = PARENT_FENCE_ALLOWLIST.some(
        (a) => !a.path.includes('*') && a.methods.includes(e.method.toUpperCase()) &&
          a.path.split('/').length === p.split('/').length &&
          a.path.split('/').every((seg, i) => seg.startsWith(':') || seg === p.split('/')[i]),
      )
      if (decision && !onList && !isParentTree(p)) leaks.push(`${e.method} ${p}  (${e.file}:${e.line})`)
    }
    expect(leaks).toEqual([])
  })

  it('denies a parent on every route under every OTHER method too (method confusion)', () => {
    const leaks: string[] = []
    for (const e of express) {
      const p = concretePath(e)
      if (isParentTree(p)) continue
      for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        if (allowlistCovers(m, p) && !PARENT_FENCE_ALLOWLIST.some((a) => a.methods.includes(m) && !a.path.includes('*') &&
          a.path.split('/').length === p.split('/').length &&
          a.path.split('/').every((seg, i) => seg.startsWith(':') || seg === p.split('/')[i]))) {
          leaks.push(`${m} ${p}`)
        }
      }
    }
    expect(leaks).toEqual([])
  })

  it('every non-wildcard allowlist entry maps to a REAL, AUTHENTICATED route that carries no role gate (stale entries fail)', () => {
    const problems: string[] = []
    for (const a of PARENT_FENCE_ALLOWLIST) {
      if (a.path.includes('*')) continue
      for (const method of a.methods) {
        const match = express.find((e) => {
          const ep = e.fullPath.replace(/^\/api/, '')
          return e.method.toUpperCase() === method && ep === a.path
        })
        if (!match) { problems.push(`${method} ${a.path}: no such route (stale allowlist entry)`); continue }
        if (!match.authenticated) problems.push(`${method} ${a.path}: route is not behind verifyAuth`)
        if (match.hasGate) problems.push(`${method} ${a.path}: has a role/permission gate, so it would never admit a parent`)
      }
    }
    expect(problems).toEqual([])
  })

  it('a staff/student route that is public (no auth) is not a fence concern, but is never on the allowlist', () => {
    for (const e of express.filter((x) => !x.authenticated)) {
      const p = concretePath(e)
      if (isParentTree(p)) continue
      expect(allowlistCovers(e.method, p), `${e.method} ${p}`).toBe(false)
    }
  })

  it('denies a parent on routes whose mount is verifyAuth-wrapped at the mount (views disagree on baseUrl)', () => {
    // /reports, /analytics, /reporting, /settings, /promotion run verifyAuth at the mount.
    for (const mount of ['/reports', '/analytics', '/reporting', '/settings', '/promotion']) {
      expect(isParentRequestAllowedFor({ method: 'GET', originalUrl: `${mount}/x`, baseUrl: mount, path: '/x' })).toBe(false)
    }
  })
})

describe('fence completeness: wiring is in place', () => {
  const read = (rel: string) => fs.readFileSync(path.join(WEB_ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

  it('verifyAuth runs the fence before it sets req.user, and never honours superUser for a parent', () => {
    const src = read('src/lib/verifyAuth.ts')
    const fence = src.indexOf('isParentRequestAllowedFor(req)')
    const setUser = src.indexOf('req.user = {')
    expect(fence).toBeGreaterThan(-1)
    expect(setUser).toBeGreaterThan(fence)
    expect(src).toMatch(/isValidRole\(rawRole\)/)
    expect(src).toMatch(/role !== 'parent' && isSuperUserClaim/)
    expect(src).toMatch(/getAuth\(\)\.verifyIdToken\(token,\s*true\)/)
  })

  it('verifyAuth no longer trusts an arbitrary role string from the token', () => {
    const src = read('src/lib/verifyAuth.ts')
    expect(src).not.toMatch(/decoded\['role'\] as UserRole/)
  })

  it('Server Actions refuse the parent role (they back staff pages)', () => {
    const src = read('src/lib/serverAuth.ts')
    expect(src).toMatch(/role === 'parent'/)
  })

  it('parent route tree, when present, is gated to the parent role only', () => {
    const parentRoutes = express.filter((e) => isParentTree(concretePath(e)))
    for (const e of parentRoutes) {
      expect(e.authenticated, `${e.method} ${e.fullPath}`).toBe(true)
      expect(e.hasGate, `${e.method} ${e.fullPath} must be gated requireRole(['parent'])`).toBe(true)
    }
  })
})
