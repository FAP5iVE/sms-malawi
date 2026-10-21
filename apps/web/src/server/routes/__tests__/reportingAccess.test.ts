/**
 * Permission review for the reporting API, all nine roles (Phase 5).
 *   1. Every GET in routes/reporting/* and the report routes in analytics.ts is
 *      wired to a permission middleware (no endpoint is open to any signed-in user
 *      except the capabilities probe).
 *   2. The role -> gate matrix is pinned, so widening a gate is a visible diff.
 *   3. Students hold only their own-data report gates, never a staff one.
 *   4. The middleware really answers 403 for a role without the permission.
 * Exports have no server path of their own: they are built in the browser from
 * these same responses, so they inherit this matrix.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROLE_PERMISSIONS } from '@shared/types/permissions'
import type { Permission } from '@shared/types/permissions'
import { USER_ROLES } from '@shared/types/roles'
import { requirePermission } from '@/server/middleware/verifyPermission'

const routesDir = join(process.cwd(), 'src/server/routes')
const holders = (p: string) => [...USER_ROLES].filter((r) => (ROLE_PERMISSIONS as Record<string, ReadonlySet<string>>)[r]?.has(p)).sort()

describe('every reporting endpoint has a permission gate', () => {
  const files = readdirSync(join(routesDir, 'reporting')).filter((f) => f.endsWith('.ts') && !f.startsWith('_') && f !== 'index.ts')
  for (const f of files) {
    it(`reporting/${f}`, () => {
      const src = readFileSync(join(routesDir, 'reporting', f), 'utf8')
      // Gate consts declared at the top of the file, e.g. `const gate = [verifyAuth, requirePermission(..)]`.
      const gateNames = [...src.matchAll(/const (\w+) = \[verifyAuth, require\w*Permissions?\(/g)].map((m) => m[1] as string)
      const handlers = src.split(/\n(?=\w+Router\.(?:get|post|put|patch|delete)\()/).slice(1)
      expect(handlers.length).toBeGreaterThan(0)
      const open = handlers.filter((h) => {
        const head = h.slice(0, h.indexOf('async'))
        const inline = /require(Any|All)?Permissions?\(/.test(head)
        const viaConst = gateNames.some((g) => head.includes(`...${g}`))
        return !inline && !viaConst
      })
      expect(open.map((h) => h.slice(0, 60))).toEqual([])
      // Reporting is read-only.
      expect(handlers.every((h) => h.startsWith(`${h.split('.')[0]}.get(`))).toBe(true)
    })
  }

  it('analytics.ts: only the capabilities probe is ungated by a permission', () => {
    const src = readFileSync(join(routesDir, 'analytics.ts'), 'utf8')
    const handlers = src.split(/\n(?=analyticsRouter\.(?:get|post|put|patch|delete)\()/).slice(1)
    const open = handlers
      .filter((h) => !/requireAnyPermission\(|requirePermission\(|requireAllPermissions\(/.test(h.slice(0, h.indexOf('async'))))
      .map((h) => /\('([^']+)'/.exec(h)?.[1])
    expect(open).toEqual(['/capabilities'])
  })
})

describe('role matrix for the gates the reporting routes use', () => {
  const MATRIX: Record<string, string[]> = {
    'report.viewClassPerformance': ['academic', 'exam_officer', 'high_rank'],
    'report.viewLoginAttempts': ['admin'],
    'userMgmt.viewActiveSessions': ['admin'],
    'report.viewAuditLogs': ['admin', 'high_rank'],
    'report.viewSystemHealth': ['admin'],
    'report.viewAdmissionTrends': ['high_rank', 'lower_rank'],
    'report.viewStudentRegistration': ['high_rank', 'lower_rank'],
    'report.viewAttendanceSummary': ['academic', 'exam_officer', 'high_rank', 'hr', 'lower_rank'],
    'exam.viewSchoolAnalytics': ['admin', 'exam_officer', 'high_rank'],
    'report.viewSchoolPerformance': ['exam_officer', 'high_rank'],
    'report.viewFinanceSummary': ['finance', 'high_rank'],
    'report.viewOutstandingBalances': ['finance', 'high_rank'],
    'report.viewFeeCollection': ['finance', 'high_rank'],
    'report.viewHRReports': ['high_rank', 'hr'],
    'report.viewLibraryUsage': ['high_rank', 'library'],
    'procurement.reviewRequisition': ['finance', 'high_rank'],
    'assets.viewInventoryReports': ['admin', 'finance', 'high_rank'],
    'report.viewOwnPerformance': ['student'],
    'report.viewOwnAttendance': ['student'],
    'report.viewOwnFeeStatement': ['student'],
    'placement.viewOwn': ['student'],
  }
  for (const [perm, expected] of Object.entries(MATRIX)) {
    it(`${perm} → ${expected.join(', ')}`, () => expect(holders(perm)).toEqual([...expected].sort()))
  }

  it('students hold no staff report gate', () => {
    const staffGates = Object.keys(MATRIX).filter((p) => !/^(report\.viewOwn|placement\.viewOwn)/.test(p))
    const leaked = staffGates.filter((p) => holders(p).includes('student'))
    expect(leaked).toEqual([])
    expect(holders('placement.viewAnalytics')).not.toContain('student')
  })

  it('staff roles hold no student-only own-data gate', () => {
    for (const p of ['report.viewOwnPerformance', 'report.viewOwnAttendance', 'report.viewOwnFeeStatement', 'placement.viewOwn']) {
      expect(holders(p)).toEqual(['student'])
    }
  })

  it('every role can export, but only through data it can already read', () => {
    expect(holders('report.export')).toHaveLength(9)
  })
})

describe('middleware answers 403 for a role without the permission', () => {
  const call = (permission: Permission, role: string) => {
    let status = 200
    let allowed = false
    const req = { user: { uid: 'u', role, superUser: false } } as never
    const res = { status(c: number) { status = c; return this }, json() { return this } } as never
    requirePermission(permission)(req, res, () => { allowed = true })
    return { status, allowed }
  }
  it('finance report is closed to academic, library, hr, lower_rank, exam_officer, student, admin', () => {
    for (const r of ['academic', 'library', 'hr', 'lower_rank', 'exam_officer', 'student', 'admin']) {
      const out = call('report.viewFinanceSummary', r)
      expect(out.allowed).toBe(false)
      expect(out.status).toBe(403)
    }
    expect(call('report.viewFinanceSummary', 'finance').allowed).toBe(true)
  })
  it('student own-fee statement is closed to every staff role', () => {
    for (const r of USER_ROLES.filter((x) => x !== 'student')) expect(call('report.viewOwnFeeStatement', r).allowed).toBe(false)
  })
})
