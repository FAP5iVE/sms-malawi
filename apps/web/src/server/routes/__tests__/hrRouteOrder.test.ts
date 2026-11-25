// @vitest-environment node
/**
 * Regression test — HR router registration order.
 *
 * Express matches routes in registration order, and `GET /:id` accepts any
 * single path segment. A single-segment literal GET route (e.g. `/loans`)
 * registered AFTER it is therefore unreachable: the request is answered by
 * `getStaffProfile("loans")`, which found no row and raised Prisma P2025
 * ("No record was found for a query") — the ~600-event Sentry issue on
 * `GET /hr/:id` — while the Loans tab never got its list.
 *
 * This reads hr.ts as text (no database, no Express boot) and asserts that
 * every single-segment literal GET path is registered before `GET /:id`.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(path.resolve(__dirname, '../hr.ts'), 'utf8')

const getRoutes = [...source.matchAll(/hrRouter\.get\(\s*'([^']+)'/g)].map((m, order) => ({ path: m[1]!, order }))

describe('hr router — GET route order', () => {
  const paramIndex = getRoutes.findIndex((r) => r.path === '/:id')

  it('registers GET /:id', () => {
    expect(paramIndex).toBeGreaterThanOrEqual(0)
  })

  it('registers every single-segment literal GET path before GET /:id', () => {
    const singleSegmentLiterals = getRoutes.filter((r) => /^\/[^/:]+$/.test(r.path))
    expect(singleSegmentLiterals.map((r) => r.path)).toContain('/loans')

    const shadowed = singleSegmentLiterals.filter((r) => getRoutes.indexOf(r) > paramIndex).map((r) => r.path)
    expect(shadowed, `shadowed by GET /:id: ${shadowed.join(', ')}`).toEqual([])
  })
})
