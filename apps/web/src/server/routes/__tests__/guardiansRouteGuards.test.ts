// @vitest-environment node
/**
 * Pins WHICH permission and rate-limit policy guards every staff guardian-portal route,
 * and the architectural rules that keep the security-critical services testable and
 * their secrets contained. A future edit that weakens a route fails here, by name.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { collectAll } from '../../../../test/security/endpointInventory'
import { permissionFor } from '@/server/lib/guardian/linkStateMachine'

const webRoot = path.resolve(__dirname, '../../../..')
const read = (p: string) => fs.readFileSync(path.join(webRoot, p), 'utf8').replace(/\r\n/g, '\n')

const EXPECTED: Record<string, { perm: string; rate: string | null }> = {
  'GET /guardians/queue':                      { perm: 'guardian.view', rate: null },
  'GET /guardians/students':                   { perm: 'guardian.view', rate: null },
  'GET /guardians/students/:studentId':        { perm: 'guardian.view', rate: null },
  'GET /guardians/access-log':                 { perm: 'guardian.viewAccessLog', rate: null },
  'GET /guardians/access-log/recent':          { perm: 'guardian.viewAccessLog', rate: null },
  'POST /guardians/students/:studentId/sync':  { perm: 'guardian.propose', rate: 'guardian-staff' },
  'POST /guardians/links/:id/evidence':        { perm: 'guardian.propose', rate: 'guardian-staff' },
  'POST /guardians/links/:id/repoint':         { perm: 'guardian.propose', rate: 'guardian-staff' },
  'POST /guardians/links/:id/approve':         { perm: 'guardian.approve', rate: 'guardian-staff' },
  'POST /guardians/links/:id/reject':          { perm: 'guardian.approve', rate: 'guardian-staff' },
  'POST /guardians/links/:id/reinstate':       { perm: 'guardian.approve', rate: 'guardian-staff' },
  'POST /guardians/links/:id/reopen':          { perm: 'guardian.approve', rate: 'guardian-staff' },
  'POST /guardians/links/:id/reverified':      { perm: 'guardian.approve', rate: 'guardian-staff' },
  'POST /guardians/links/:id/suspend':         { perm: 'guardian.restrict', rate: 'guardian-staff' },
  'POST /guardians/links/:id/revoke':          { perm: 'guardian.restrict', rate: 'guardian-staff' },
  'PATCH /guardians/links/:id/capabilities':   { perm: 'guardian.restrict', rate: 'guardian-staff' },
  'POST /guardians/links/:id/invitations':     { perm: 'guardian.invite', rate: 'guardian-invite' },
  'DELETE /guardians/invitations/:id':         { perm: 'guardian.invite', rate: 'guardian-invite' },
  'POST /guardians/profiles/:id/suspend':      { perm: 'guardian.restrict', rate: 'guardian-staff' },
  'POST /guardians/profiles/:id/reinstate':    { perm: 'guardian.approve', rate: 'guardian-staff' },
  'POST /guardians/onboarding/dry-run':        { perm: 'guardian.backfill', rate: 'bulk-mutation' },
  'GET /guardians/onboarding/:id':             { perm: 'guardian.backfill', rate: null },
  'POST /guardians/onboarding/:id/apply':      { perm: 'guardian.backfill', rate: 'bulk-mutation' },
  'POST /guardians/onboarding/:id/rollback':   { perm: 'guardian.backfill', rate: 'bulk-mutation' },
  'POST /guardians/national-ids/backfill':     { perm: 'guardian.backfill', rate: 'bulk-mutation' },
}

const routes = collectAll(webRoot).express.filter((e) => e.fullPath.startsWith('/api/guardians'))
const key = (e: { method: string; fullPath: string }) => `${e.method.toUpperCase()} ${e.fullPath.replace(/^\/api/, '')}`

describe('staff guardian routes: guards', () => {
  it('registers exactly the routes in the table: none unlisted, none missing', () => {
    expect(routes.map(key).sort()).toEqual(Object.keys(EXPECTED).sort())
  })

  for (const e of routes) {
    const want = EXPECTED[key(e)]
    it(`${key(e)} is authenticated and gated by ${want?.perm}`, () => {
      expect(e.authenticated).toBe(true)
      expect(e.hasGate).toBe(true)
      expect(e.middleware).toContain(`requirePermission('${want!.perm}')`)
      expect(e.middleware.filter((m) => m.startsWith('requirePermission'))).toHaveLength(1)
    })
    it(`${key(e)} ${want?.rate ? `is rate limited by ${want.rate}` : 'is a read and needs no write limit'}`, () => {
      if (want!.rate) expect(e.middleware).toContain(`rateLimit('${want!.rate}')`)
      else expect(e.method.toUpperCase()).toBe('GET')
    })
  }

  it('every write is rate limited', () => {
    for (const e of routes.filter((r) => r.method.toUpperCase() !== 'GET')) {
      expect(e.middleware.some((m) => m.startsWith('rateLimit(')), key(e)).toBe(true)
    }
  })

  it('the permission each decision route needs matches the state machine (easing = approve, tightening = restrict)', () => {
    const byAction: Record<string, string> = {
      approve: 'POST /guardians/links/:id/approve', reject: 'POST /guardians/links/:id/reject',
      reinstate: 'POST /guardians/links/:id/reinstate', reopen: 'POST /guardians/links/:id/reopen',
      suspend: 'POST /guardians/links/:id/suspend', revoke: 'POST /guardians/links/:id/revoke',
    }
    for (const [action, route] of Object.entries(byAction)) {
      expect(EXPECTED[route]!.perm, action).toBe(permissionFor(action as never))
    }
  })

  it('router applies verifyAuth to everything, and is mounted once at /guardians', () => {
    const src = read('src/server/routes/guardians.ts')
    expect(src).toContain('guardiansRouter.use(verifyAuth)')
    const api = read('src/lib/api-app.ts')
    expect(api.match(/app\.use\('\/guardians'/g)).toHaveLength(1)
  })
})

describe('secrets stay contained', () => {
  const src = read('src/server/routes/guardians.ts')
  const emailBranch = src.slice(src.indexOf('// EMAIL: the code goes ONLY'), src.indexOf('guardiansRouter.delete('))

  it('the EMAIL branch never returns the code to staff and revokes the invitation if the mail fails', () => {
    expect(emailBranch).toContain('revokeInvitation(')
    const responses = emailBranch.match(/res\.status\(\d+\)\.json\(\{[^}]*\}\)/g) ?? []
    expect(responses.length).toBeGreaterThan(0)
    for (const r of responses) expect(r, r).not.toMatch(/\bcode:\s*issued\.code|\bcode\b\s*[,}]/)
  })

  it('the SLIP branch is the only response that carries the code', () => {
    const withCode = (src.match(/code:\s*issued\.code/g) ?? []).length
    expect(withCode).toBe(2) // SLIP response + the e-mail builder input
    const slip = src.slice(src.indexOf("if (issued.channel === 'SLIP')"), src.indexOf('// EMAIL: the code goes ONLY'))
    expect(slip).toMatch(/code: issued\.code/)
  })

  it('no log line mentions the code, secret or hash', () => {
    for (const m of src.matchAll(/logger\.\w+\(([\s\S]*?)\)\s*\)?\n/g)) {
      expect(m[1]!).not.toMatch(/issued\.code|secret|Hash/)
    }
  })

  it('the invitation e-mail says nothing about any child', () => {
    const tpl = read('src/server/lib/guardian/invitationEmail.ts')
    // Structural guarantee: the template's input has no field that could hold child data.
    const iface = /export interface InvitationEmailInput \{([\s\S]*?)\n\}/.exec(tpl)![1]!
    const fields = [...iface.matchAll(/^\s*(\w+):/gm)].map((m) => m[1])
    expect(fields).toEqual(['schoolName', 'code', 'claimUrl', 'expiresAt'])
    // And the route passes nothing else into it.
    const call = /buildInvitationEmail\(\{([\s\S]*?)\}\)/.exec(read('src/server/routes/guardians.ts'))![1]!
    expect(call).not.toMatch(/student|child|firstName|lastName|link\./i)
  })
})

describe('architecture: security-critical services stay pure', () => {
  const dirs = ['src/server/services/guardian', 'src/server/lib/guardian']
  // Production adapters only. Everything else (services, libs, controllers) must stay pure.
  const IMPURE_OK = new Set(['prismaDb.ts', 'firebaseIdentity.ts', 'guardianDirectorySync.ts', 'config.ts'])
  const files = dirs.flatMap((d) => fs.readdirSync(path.join(webRoot, d)).filter((f) => f.endsWith('.ts')).map((f) => `${d}/${f}`))

  it('finds the guardian modules', () => expect(files.length).toBeGreaterThan(10))

  it('services and libs never import the Prisma client, Firebase, the logger, or server-only', () => {
    for (const f of files.filter((x) => !IMPURE_OK.has(path.basename(x)))) {
      const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      for (const bad of ["from '@/lib/prisma'", "from '@prisma/client'", "from 'firebase-admin", "from '@/lib/logger'", "import 'server-only'", "from '@/lib/verifyAuth'"]) {
        expect(src.includes(bad), `${f} imports ${bad}`).toBe(false)
      }
    }
  })

  it('only the production adapters import Firebase', () => {
    const users = files.filter((f) => /from 'firebase-admin/.test(read(f)))
    expect(users.map((f) => path.basename(f))).toEqual(['firebaseIdentity.ts'])
  })

  it('only prismaDb.ts touches the Prisma client', () => {
    const users = files.filter((f) => read(f).includes("from '@/lib/prisma'"))
    expect(users.map((f) => path.basename(f))).toEqual(['prismaDb.ts'])
  })
})
