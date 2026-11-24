/**
 * baseline.itest.ts — P0-02 verification on a real Postgres.
 *
 * Loads the synthetic planted-defect fixture into a throwaway database and
 * proves every baseline check reports exactly what it should: the planted
 * defects, nothing for the clean records. Also proves the runner's transaction
 * mode (REPEATABLE READ, READ ONLY) refuses writes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createTestDb, integrationEnabled, type TestDb } from './harness'
import { BASELINE_CHECKS } from '../../../tools/finance-baseline/checks.mjs'
import { EXPECTED_ROWS, FIXTURE_STATEMENTS } from '../../../tools/finance-baseline/fixture.mjs'

describe.skipIf(!integrationEnabled())('finance baseline checks', () => {
  let db: TestDb

  beforeAll(async () => {
    db = await createTestDb()
    for (const statement of FIXTURE_STATEMENTS) await db.prisma.$executeRawUnsafe(statement)
  })
  afterAll(async () => { await db?.teardown().catch(() => undefined) })

  it.each(BASELINE_CHECKS.map((c) => [c.id, c] as const))('%s reports the planted defects', async (id, check) => {
    const rows = await db.prisma.$queryRawUnsafe<unknown[]>(check.sql)
    expect(rows.length).toBe(EXPECTED_ROWS[id] ?? 0)
  })

  it('the runner transaction mode refuses writes', async () => {
    await expect(
      db.prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
          await tx.$executeRawUnsafe(`UPDATE chart_of_accounts SET name = name`)
        },
        { isolationLevel: 'RepeatableRead' },
      ),
    ).rejects.toThrow(/read-only/i)
  })
})
