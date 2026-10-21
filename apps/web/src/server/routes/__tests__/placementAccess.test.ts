/**
 * Who may read placement data, for all nine roles.
 *
 * The student role must reach ONLY its own placement (/placements/me and
 * /reporting/student/placement) plus the advisory calculator; the cohort registry
 * and analytics (named candidates, MSCE numbers/points) are staff-only. The
 * middleware the routes use is invoked directly, then the route files are checked
 * to confirm each endpoint is wired to the permission asserted here.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { requirePermission } from '@/server/middleware/verifyPermission'
import { USER_ROLES } from '@shared/types/roles'
import type { Permission } from '@shared/types/permissions'

function call(permission: Permission, role: string) {
  let status = 200
  let nexted = false
  const req = { user: { uid: 'u', role, superUser: false } } as never
  const res = { status(c: number) { status = c; return this }, json() { return this } } as never
  requirePermission(permission)(req, res, () => { nexted = true })
  return { status, allowed: nexted }
}

const roles = [...USER_ROLES] as string[]
const staff = roles.filter((r) => r !== 'student')

describe('placement permissions by role', () => {
  it('knows all nine roles', () => expect(roles).toHaveLength(9))

  it('registry + cohort analytics (placement.viewAnalytics): every staff role, never the student', () => {
    for (const r of staff) expect(call('placement.viewAnalytics', r).allowed, r).toBe(true)
    const s = call('placement.viewAnalytics', 'student')
    expect(s.allowed).toBe(false)
    expect(s.status).toBe(403)
  })

  it('own placement (placement.viewOwn): the student only', () => {
    expect(call('placement.viewOwn', 'student').allowed).toBe(true)
    for (const r of staff) expect(call('placement.viewOwn', r).allowed, r).toBe(false)
  })

  it('advisory calculator (placement.view) stays open to every role including the student', () => {
    for (const r of roles) expect(call('placement.view', r).allowed, r).toBe(true)
  })

  it('claims desk and staff entry stay with staff; a student cannot verify or record official entries', () => {
    expect(call('placement.verifyOutcome', 'student').allowed).toBe(false)
    expect(call('placement.manage', 'student').allowed).toBe(false)
    expect(call('placement.recordOutcome', 'student').allowed).toBe(false)
    expect(call('placement.verifyOutcome', 'admin').allowed).toBe(true)
    expect(call('placement.verifyOutcome', 'high_rank').allowed).toBe(true)
    expect(call('placement.verifyOutcome', 'lower_rank').allowed).toBe(false)
  })

  it('an unauthenticated caller is refused with 401', () => {
    let status = 0
    requirePermission('placement.viewAnalytics')({} as never, { status(c: number) { status = c; return this }, json() { return this } } as never, () => { status = 200 })
    expect(status).toBe(401)
  })
})

describe('route wiring', () => {
  const src = (p: string) => readFileSync(join(process.cwd(), 'src/server/routes', p), 'utf8')
  const block = (text: string, start: string) => text.slice(text.indexOf(start), text.indexOf(start) + 220)

  it('/placements/registry requires placement.viewAnalytics', () => {
    expect(block(src('placements.ts'), "'/registry'")).toContain("requirePermission('placement.viewAnalytics')")
  })
  it('/analytics/placements requires placement.viewAnalytics', () => {
    expect(block(src('analytics.ts'), "'/placements'")).toContain("requirePermission('placement.viewAnalytics')")
  })
  it('/placements/me and /reporting/student/placement require placement.viewOwn and take no student id', () => {
    expect(block(src('placements.ts'), "'/me'")).toContain("requirePermission('placement.viewOwn')")
    const student = src('reporting/student.ts')
    expect(student).toContain("const placement = [verifyAuth, requirePermission('placement.viewOwn')]")
    const handler = student.slice(student.indexOf("'/placement'"))
    expect(handler).toContain('ownStudentId(req, res)')
    expect(handler).not.toContain('req.query')
    expect(handler).not.toContain('req.params')
  })
})
