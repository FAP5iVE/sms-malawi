// @vitest-environment node
/**
 * Pins the guardian-facing routers. The decisions themselves are executed in
 * parentController.test.ts / guardianClaim.test.ts; this proves the thin Express layer
 * stays thin, read-only, uncached, and never takes an owner id from the client.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { collectAll } from '../../../../test/security/endpointInventory'
import { ENDPOINT_POLICY } from '../../../../test/security/accessPolicy'

const webRoot = path.resolve(__dirname, '../../../..')
const read = (p: string) => fs.readFileSync(path.join(webRoot, p), 'utf8').replace(/\r\n/g, '\n')
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const inv = collectAll(webRoot).express
const parentRoutes = inv.filter((e) => e.fullPath.startsWith('/api/parent'))
const key = (e: { method: string; fullPath: string }) => `${e.method.toUpperCase()} ${e.fullPath.replace(/^\/api/, '')}`

describe('/parent router', () => {
  it('is exactly these seven read-only routes', () => {
    expect(parentRoutes.map(key).sort()).toEqual([
      'GET /parent/children', 'GET /parent/children/:linkId', 'GET /parent/children/:linkId/attendance',
      'GET /parent/children/:linkId/fees', 'GET /parent/children/:linkId/report-card', 'GET /parent/children/:linkId/results', 'GET /parent/me',
    ])
  })

  for (const e of parentRoutes) {
    it(`${key(e)} is authenticated, restricted to role parent, and rate limited`, () => {
      expect(e.authenticated).toBe(true)
      expect(e.hasGate).toBe(true)
      expect(e.middleware).toContain("requireRole(['parent'])")
      expect(e.middleware).toContain("rateLimit('parent-read')")
    })
  }

  const src = code('src/server/routes/parent.ts')

  it('applies verifyAuth to the whole router and never caches a response', () => {
    expect(src).toContain('parentRouter.use(verifyAuth)')
    expect(src).toMatch(/Cache-Control['"], ['"]no-store/)
  })

  it('takes NO owner id or body from the client: the only identifier is the link id, and the only query fields are the period', () => {
    expect(src).not.toMatch(/req\.body\b/)
    // A period (which year/term to show) is a filter, not an identifier. Nothing else may ever be read from the query.
    expect([...new Set([...src.matchAll(/req\.query\.(\w+)/g)].map((m) => m[1]))].sort()).toEqual(['academicYear', 'term'])
    expect(src).not.toMatch(/req\.query\b(?!\.(academicYear|term)\b)/)
    expect(src).not.toMatch(/req\.params\.(?!linkId\b)/)        // no other client-supplied identifier, ever
    expect(src).not.toMatch(/req\.params\b(?!\.linkId)/)
    expect(src).toMatch(/req\.params\.linkId/)
    expect(src).toMatch(/req\.user!\.uid/)
  })

  it('contains no authorization logic of its own and no staff services', () => {
    for (const bad of ['guardianLinkService', 'guardianInvitationService', 'guardianOnboardingService', 'guardianIdentityService', 'prisma.']) {
      expect(src, bad).not.toContain(bad)
    }
    expect(src).toContain('getChildModule(')
  })

  it('serves the fee gate the same way students get it', () => {
    expect(src).toMatch(/isResultsGateOpen: \(studentId, term, academicYear\) => checkBalanceGate\(studentId, term, academicYear\)/)
  })
})

describe('/guardian-claim router (public)', () => {
  const route = inv.find((e) => key(e) === 'POST /guardian-claim')
  const src = code('src/server/routes/guardianClaim.ts')
  const raw = read('src/server/routes/guardianClaim.ts')

  it('exists exactly once, is deliberately unauthenticated, and is declared in the access-policy registry', () => {
    expect(route).toBeDefined()
    expect(route!.authenticated).toBe(false)
    expect(inv.filter((e) => e.fullPath.startsWith('/api/guardian-claim'))).toHaveLength(1)
    expect(ENDPOINT_POLICY['POST /api/guardian-claim']?.category).toBe('public-site')
    expect(ENDPOINT_POLICY['POST /api/guardian-claim']!.reason.length).toBeGreaterThan(100)
  })

  it('carries the strictest rate-limit policy and never trusts a session', () => {
    expect(route!.middleware).toContain("rateLimit('guardian-claim')")
    expect(src).not.toMatch(/verifyAuth|req\.user/)
  })

  it('answers every validation failure with the generic response, not the zod message', () => {
    expect(src).toContain('ClaimInvitationSchema.safeParse(req.body)')
    expect(src).toMatch(/claimHttpResult\(\{ ok: false, code: 'CLAIM_FAILED' \}\)/)
    expect(src).not.toMatch(/body\.error|issues\[/)
  })

  it('is never cached and never logs or echoes the request, the code, the e-mail or the error text', () => {
    expect(src).toMatch(/Cache-Control['"], ['"]no-store/)
    for (const m of src.matchAll(/logger\.\w+\(([\s\S]*?)\)\n/g)) {
      expect(m[1]!, m[1]).not.toMatch(/req\.|body|password|email|code\b|err\.message|String\(err\)/)
    }
    expect(src).not.toMatch(/res\.[a-z]+\([^)]*err(\.message)?[^)]*\)/)
  })

  it('maps every outcome through claimHttpResult(toPublicResult(...)) and a fixed 503 for crashes', () => {
    expect(src).toContain('claimHttpResult(toPublicResult(result))')
    expect(src).toMatch(/res\.status\(503\)\.json\(\{ error: 'Something went wrong\. Please try again later\.' \}\)/)
  })

  it('the password is passed straight to the claim service and nowhere else', () => {
    expect(raw.match(/password/gi)?.filter((w) => w.length).length ?? 0).toBeLessThanOrEqual(4)   // doc comment mentions only
    expect(src).not.toMatch(/password/i)
  })
})

describe('mounting', () => {
  const api = read('src/lib/api-app.ts')
  it('mounts each router exactly once', () => {
    expect(api.match(/app\.use\('\/parent',/g)).toHaveLength(1)
    expect(api.match(/app\.use\('\/guardian-claim',/g)).toHaveLength(1)
  })
  it('the fence allows /parent for a parent token but not the public claim path or any staff path', async () => {
    const { isParentRequestAllowed } = await import('@/lib/parentFence')
    expect(isParentRequestAllowed('GET', ['/parent/children'])).toBe(true)
    expect(isParentRequestAllowed('POST', ['/guardian-claim'])).toBe(false)
    expect(isParentRequestAllowed('GET', ['/guardians/queue'])).toBe(false)
    expect(isParentRequestAllowed('POST', ['/guardians/links/x/approve'])).toBe(false)
  })
})
