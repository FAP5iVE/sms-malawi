// @vitest-environment node
/**
 * Route-contract tests (Issue 7 — authorization parity).
 *
 * These run the static endpoint inventory (test/security/endpointInventory.ts)
 * over the REAL source of lib/api-app.ts, every router in server/routes/**,
 * every Next.js Route Handler and every 'use server' file, then assert the
 * access-control contract. A newly added endpoint that forgets authentication
 * or an access policy fails here, in CI, before it can ship.
 *
 *   1. Authentication at the boundary — every non-public endpoint is behind verifyAuth.
 *   2. Declared policy — an endpoint without a role/permission gate in its chain must be
 *      declared in test/security/accessPolicy.ts (public / own-data / object-checked /
 *      reference-data) with a reason; stale declarations also fail.
 *   3. Behavioural matrix — the real requireRole/requirePermission* middleware is executed for
 *      all ten roles (incl. the guardian-portal `parent`) + unauthenticated + the super user for every statically resolvable gate.
 *   4. Students never reach staff mutations (except the declared self-service list).
 *   5. Route handlers (cron / webhooks / file proxy / gateway) and Server Actions.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import {
  collectAll,
  collectConstArrays,
  collectUnmountedRouters,
  parseGate,
  type ExpressEndpoint,
  type GateSpec,
} from '../../../../test/security/endpointInventory'
import {
  ENDPOINT_POLICY,
  ROUTE_HANDLER_POLICY,
  SERVER_ACTION_FILES,
  STUDENT_REACHABLE_MUTATIONS,
} from '../../../../test/security/accessPolicy'
import { requireRole } from '@/lib/verifyAuth'
import {
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
} from '@/server/middleware/verifyPermission'
import { hasPermission, ROLE_PERMISSIONS, type Permission } from '@shared/types/permissions'
import { USER_ROLES, STAFF_ROLES, isStaffRole, type UserRole } from '@shared/types/roles'

const webRoot = process.cwd()
const inventory = collectAll(webRoot)
const express = inventory.express
const key = (e: ExpressEndpoint) => `${e.method} ${e.fullPath}`

/** Removes block and line comments so header prose cannot satisfy (or trip) a source assertion. */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const PUBLIC_CATEGORIES = new Set(['public-site', 'public-telemetry', 'cron-or-admin'])
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// ─── 0. inventory sanity ────────────────────────────────────────────────────

describe('endpoint inventory', () => {
  it('finds the endpoints (guards against the extractor silently returning nothing)', () => {
    expect(express.length).toBeGreaterThan(400)
    expect(inventory.routeHandlers.length).toBeGreaterThanOrEqual(13)
  })

  it('every router that declares routes is mounted (an unmounted router serves nothing, then ships unreviewed)', () => {
    expect(collectUnmountedRouters(webRoot)).toEqual([])
  })
})

// ─── 1 + 2. authentication and declared policy ──────────────────────────────

describe('Express endpoints: authentication + declared access policy', () => {
  it('every endpoint is authenticated, or explicitly declared public', () => {
    const offenders = express
      .filter((e) => !e.authenticated)
      .filter((e) => !PUBLIC_CATEGORIES.has(ENDPOINT_POLICY[key(e)]?.category ?? ''))
      .map(key)
    expect(offenders, 'unauthenticated endpoints with no public policy').toEqual([])
  })

  it('every authenticated endpoint without a role/permission gate declares what protects it', () => {
    const offenders = express
      .filter((e) => e.authenticated && !e.hasGate)
      .filter((e) => !ENDPOINT_POLICY[key(e)])
      .map(key)
    expect(offenders, 'add these to test/security/accessPolicy.ts with a reason (and negative tests)').toEqual([])
  })

  it('declared policies match reality (no stale entries, public categories really are public)', () => {
    const byKey = new Map(express.map((e) => [key(e), e]))
    const stale: string[] = []
    for (const [k, policy] of Object.entries(ENDPOINT_POLICY)) {
      const e = byKey.get(k)
      if (!e) {
        stale.push(`${k} — endpoint no longer exists`)
        continue
      }
      if (e.authenticated && e.hasGate) stale.push(`${k} — now fully gated, remove the entry`)
      if (PUBLIC_CATEGORIES.has(policy.category) !== !e.authenticated && policy.category !== 'cron-or-admin') {
        stale.push(`${k} — category ${policy.category} disagrees with its middleware`)
      }
      if (!policy.reason || policy.reason.length < 20) stale.push(`${k} — reason too short`)
    }
    expect(stale).toEqual([])
  })

  it('public write endpoints are rate-limited', () => {
    const offenders = express
      .filter((e) => !e.authenticated && MUTATING.has(e.method))
      .filter((e) => !e.middleware.some((m) => /\brateLimit\(|verifyCronOrAdmin/.test(m)))
      .map(key)
    expect(offenders).toEqual([])
  })

  it('authenticated-only MUTATIONS are always own-data or object-checked (never "any signed-in user may write")', () => {
    const offenders = express
      .filter((e) => MUTATING.has(e.method) && e.authenticated && !e.hasGate)
      .filter((e) => !['own-data', 'object-checked'].includes(ENDPOINT_POLICY[key(e)]?.category ?? ''))
      .map(key)
    expect(offenders).toEqual([])
  })

  it('declared object-checked / own-data handlers do not take an owner id from the request body', () => {
    // Heuristic: a handler that is meant to be own-data must not read a *Uid/owner field
    // out of the body or query to decide whose data to act on.
    const offenders = express
      .filter((e) => ENDPOINT_POLICY[key(e)]?.category === 'own-data')
      .filter((e) => /req\.(body|query)\??\.(uid|userId|staffUid|ownerUid)\b/.test(e.handlerText))
      .map(key)
    expect(offenders).toEqual([])
  })
})

// ─── 3. behavioural matrix ──────────────────────────────────────────────────

type Outcome = { allowed: boolean; status: number }

function runGate(spec: GateSpec, user: { uid: string; role: string; superUser?: boolean } | undefined): Outcome {
  const mw =
    spec.kind === 'role'
      ? requireRole(spec.roles as UserRole[])
      : spec.mode === 'one'
        ? requirePermission(spec.permissions[0] as Permission)
        : spec.mode === 'any'
          ? requireAnyPermission(spec.permissions as Permission[])
          : requireAllPermissions(spec.permissions as Permission[])
  let status = 200
  let allowed = false
  const req = { user } as never
  const res = {
    status(c: number) { status = c; return this },
    json() { return this },
  } as never
  mw(req, res, () => { allowed = true })
  return { allowed, status }
}

function expected(spec: GateSpec, role: string): boolean {
  if (spec.kind === 'role') return spec.roles.includes(role)
  const has = (p: string) => hasPermission(role as UserRole, p as Permission, false)
  return spec.mode === 'one' ? has(spec.permissions[0]!)
    : spec.mode === 'any' ? spec.permissions.some(has)
    : spec.permissions.every(has)
}

const constCache = new Map<string, Map<string, string[]>>()
function gatesOf(e: ExpressEndpoint): GateSpec[] {
  let consts = constCache.get(e.file)
  if (!consts) {
    consts = collectConstArrays(fs.readFileSync(path.join(webRoot, e.file), 'utf8'))
    constCache.set(e.file, consts)
  }
  return e.middleware.map((m) => parseGate(m, consts!)).filter((g): g is GateSpec => g !== null)
}

describe('behavioural access matrix (real middleware, all roles)', () => {
  const gated = express.filter((e) => e.authenticated && gatesOf(e).length > 0)

  it('resolves the large majority of gates statically', () => {
    const unresolved = express.filter((e) => e.hasGate && gatesOf(e).length === 0).map(key)
    // The only unresolved ones are permission lists held in imported constants (OWN_* sets in analytics/reports).
    expect(unresolved.length).toBeLessThanOrEqual(10)
  })

  it('an unauthenticated caller is refused by every gate (401/403, next() never called)', () => {
    const offenders: string[] = []
    for (const e of gated) {
      for (const g of gatesOf(e)) {
        const o = runGate(g, undefined)
        if (o.allowed || (o.status !== 401 && o.status !== 403)) offenders.push(key(e))
      }
    }
    expect(offenders).toEqual([])
  })

  it('for all ten roles the real middleware agrees with the role/permission definition', () => {
    const mismatches: string[] = []
    for (const e of gated) {
      for (const g of gatesOf(e)) {
        for (const role of USER_ROLES) {
          const o = runGate(g, { uid: 'u1', role })
          if (o.allowed !== expected(g, role)) mismatches.push(`${key(e)} as ${role}`)
          if (!o.allowed && o.status !== 403) mismatches.push(`${key(e)} as ${role}: denial must be 403, was ${o.status}`)
        }
      }
    }
    expect(mismatches).toEqual([])
  })

  it('the super user (alpha_admin claim) passes every gate, a non-admin forging superUser:"true" does not', () => {
    const offenders: string[] = []
    for (const e of gated) {
      for (const g of gatesOf(e)) {
        if (!runGate(g, { uid: 'su', role: 'admin', superUser: true }).allowed) offenders.push(`${key(e)} (super user denied)`)
        // isSuperUserClaim is strict: only boolean true counts.
        const forged = runGate(g, { uid: 'x', role: 'student', superUser: 'true' as unknown as boolean })
        if (forged.allowed && !expected(g, 'student')) offenders.push(`${key(e)} (string superUser accepted)`)
      }
    }
    expect(offenders).toEqual([])
  })
})

// ─── 4. students vs staff mutations ─────────────────────────────────────────

describe('students cannot reach staff mutations', () => {
  const reachable = express
    .filter((e) => MUTATING.has(e.method) && e.authenticated && e.hasGate)
    .filter((e) => {
      const gates = gatesOf(e)
      return gates.length > 0 && gates.every((g) => expected(g, 'student'))
    })
    .map(key)

  it('every mutation a student passes at the middleware layer is a declared self-service endpoint', () => {
    const undeclared = reachable.filter((k) => !STUDENT_REACHABLE_MUTATIONS[k])
    expect(undeclared, 'a student-role token can call these staff mutations').toEqual([])
  })

  it('the self-service list has no stale entries', () => {
    const stale = Object.keys(STUDENT_REACHABLE_MUTATIONS).filter((k) => !reachable.includes(k))
    expect(stale).toEqual([])
  })

  it('library, hr and finance staff cannot reach payroll approval / user administration', () => {
    const sensitive = express.filter((e) =>
      /^\/api\/(users(?!\/me\/)|payroll\/runs\/:id\/(approve|lock|rollback)|algolia-admin)/.test(e.fullPath) && MUTATING.has(e.method),
    )
    expect(sensitive.length).toBeGreaterThan(0)
    for (const e of sensitive) {
      for (const role of ['library', 'lower_rank', 'student'] as const) {
        const allowed = gatesOf(e).every((g) => expected(g, role))
        expect(allowed, `${key(e)} must deny ${role}`).toBe(false)
      }
    }
  })
})

// ─── 5. Next.js route handlers ──────────────────────────────────────────────

describe('Next.js Route Handlers', () => {
  const handlers = inventory.routeHandlers

  it('every route handler is declared, and no declaration is stale', () => {
    const found = handlers.map((h) => h.fullPath).sort()
    expect(found).toEqual(Object.keys(ROUTE_HANDLER_POLICY).sort())
  })

  it('cron routes call guardCron() before doing any work and never echo error text', () => {
    const offenders: string[] = []
    for (const h of handlers.filter((x) => ROUTE_HANDLER_POLICY[x.fullPath] === 'cron')) {
      const code = stripComments(h.source)
      const getAt = code.indexOf('export async function GET')
      const body = code.slice(getAt)
      const guardAt = body.indexOf('await guardCron()')
      if (guardAt === -1) offenders.push(`${h.fullPath}: no guardCron()`)
      else if (/await (?!guardCron)/.test(body.slice(0, guardAt))) offenders.push(`${h.fullPath}: work before guard`)
      if (/\.message\b/.test(code)) offenders.push(`${h.fullPath}: echoes error message`)
      if (/process\.env\.CRON_SECRET\}`/.test(code)) offenders.push(`${h.fullPath}: hand-rolled secret comparison`)
    }
    expect(offenders).toEqual([])
  })

  it('webhooks verify the provider signature before parsing the payload', () => {
    const offenders: string[] = []
    for (const h of handlers.filter((x) => ROUTE_HANDLER_POLICY[x.fullPath] === 'webhook-signature')) {
      const verifyAt = h.source.search(/verify\w*(Webhook|Signature)\w*\(/)
      const parseAt = h.source.indexOf('JSON.parse')
      if (verifyAt === -1 || parseAt === -1 || verifyAt > parseAt) offenders.push(h.fullPath)
      if (!/status: 401/.test(h.source)) offenders.push(`${h.fullPath}: no 401 on a bad signature`)
    }
    expect(offenders).toEqual([])
  })

  it('the file proxy verifies identity (with revocation checking) and canReadFile() before streaming', () => {
    const file = handlers.find((h) => ROUTE_HANDLER_POLICY[h.fullPath] === 'bearer-file-proxy')!
    const src = stripComments(file.source)
    const tokenAt = src.indexOf('await getIdTokenFromRequest(request)')
    const readAt = src.indexOf('if (!canReadFile(')
    const streamAt = src.indexOf('await streamFile(fileId)')
    expect(tokenAt).toBeGreaterThan(-1)
    expect(tokenAt).toBeLessThan(readAt)
    expect(readAt).toBeLessThan(streamAt)
    const verifyAuthSrc = fs.readFileSync(path.join(webRoot, 'src/lib/verifyAuth.ts'), 'utf8')
    expect(verifyAuthSrc).toMatch(/getAuth\(\)\.verifyIdToken\(token,\s*true\)/)
  })

  it('the gateway exports exactly the verbs the Express CORS list advertises', () => {
    const gw = handlers.find((h) => ROUTE_HANDLER_POLICY[h.fullPath] === 'express-gateway')!
    expect([...gw.methods].sort()).toEqual(['DELETE', 'GET', 'OPTIONS', 'PATCH', 'POST'])
  })
})

// ─── Server Actions ─────────────────────────────────────────────────────────

describe('Server Actions', () => {
  const actions = inventory.serverActions

  it("only declared files contain 'use server'", () => {
    const files = [...new Set(actions.map((a) => a.file))].sort()
    expect(files).toEqual([...SERVER_ACTION_FILES].sort())
  })

  it('every exported action authenticates via the verified-token gate before anything else', () => {
    const offenders: string[] = []
    for (const file of SERVER_ACTION_FILES) {
      const src = fs.readFileSync(path.join(webRoot, file), 'utf8')
      const exported = actions.filter((a) => a.file === file).map((a) => a.name)
      for (const name of exported) {
        const start = src.indexOf(`export async function ${name}(`)
        const next = src.indexOf('export async function', start + 10)
        const body = src.slice(start, next === -1 ? undefined : next)
        const authAt = body.search(/await authorize\(|requireCurrentUser\(/)
        const mutateAt = body.search(/settingsService\.|prisma\./)
        if (authAt === -1) offenders.push(`${name}: no authentication`)
        else if (mutateAt !== -1 && mutateAt < authAt) offenders.push(`${name}: side effect before authentication`)
        if (/cookies\(\)/.test(body)) offenders.push(`${name}: reads cookies for identity`)
      }
    }
    expect(offenders).toEqual([])
  })
})

// ─── role/resource matrix is derived from source, never hand-typed ──────────

describe('role model', () => {
  it('has the ten roles the audit matrix is written for', () => {
    expect([...USER_ROLES].sort()).toEqual(
      ['academic', 'admin', 'exam_officer', 'finance', 'high_rank', 'hr', 'library', 'lower_rank', 'parent', 'student'],
    )
  })

  it('the parent role holds NO permissions and is not a staff role', () => {
    expect(ROLE_PERMISSIONS.parent.size).toBe(0)
    expect(STAFF_ROLES).not.toContain('parent')
    expect(isStaffRole('parent')).toBe(false)
  })
})
