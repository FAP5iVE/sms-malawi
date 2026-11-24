/**
 * harness.itest.ts — P0-01 smoke test.
 * Proves, on a real Postgres: (1) the migrations apply to an isolated database,
 * (2) two parallel transactions locking one row are serialised, and
 * (3) teardown leaves no database behind.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestDb, integrationEnabled, databaseExists, failpoints, type TestDb } from './harness'

describe.skipIf(!integrationEnabled())('integration harness', () => {
  let db: TestDb
  beforeAll(async () => { db = await createTestDb() })

  it('applies the migrations and seeds the chart of accounts', async () => {
    await db.seed()
    expect(await db.prisma.chartOfAccount.count()).toBe(15)
    const cash = await db.prisma.chartOfAccount.findUnique({ where: { code: '1000' } })
    expect(cash?.type).toBe('ASSET')
  })

  it('two parallel transactions on one row serialise (no lost update)', async () => {
    const key = 'itest.counter'
    await db.prisma.systemSettings.create({ data: { key, value: 0, category: 'system' } })

    const spans: Array<{ start: number; end: number }> = []
    const results = await db.runConcurrently(2, async ({ client, barrier }) => {
      await barrier()
      await client.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ value: number }>>`
          SELECT "value" FROM "system_settings" WHERE "key" = ${key} FOR UPDATE
        `
        const start = Date.now()
        await new Promise((r) => setTimeout(r, 250)) // hold the lock
        await tx.systemSettings.update({ where: { key }, data: { value: Number(rows[0]!.value) + 1 } })
        spans.push({ start, end: Date.now() })
      })
    })

    expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
    const final = await db.prisma.systemSettings.findUniqueOrThrow({ where: { key } })
    expect(final.value).toBe(2) // an unlocked read-modify-write would leave 1

    // The critical sections did not overlap.
    const [a, b] = [...spans].sort((x, y) => x.start - y.start)
    expect(b!.start).toBeGreaterThanOrEqual(a!.end - 5)
  })

  it('a failpoint fires once and then disarms', () => {
    failpoints.arm('test.point')
    expect(() => failpoints.hit('test.point')).toThrow(/Injected failure/)
    expect(() => failpoints.hit('test.point')).not.toThrow()
  })

  it('teardown removes the database', async () => {
    const name = db.database
    expect(await databaseExists(name)).toBe(true)
    await db.teardown()
    expect(await databaseExists(name)).toBe(false)
  })

  afterAll(async () => {
    // Idempotent: a failing test must not leave the database behind.
    await db?.teardown().catch(() => undefined)
  })
})
