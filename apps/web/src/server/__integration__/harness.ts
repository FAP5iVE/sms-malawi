/**
 * apps/web/src/server/__integration__/harness.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PLAN]: Finance Hardening Plan — P0-01 (X-45, D-25).
 * [WHY NEW]: Every existing finance test mocks Prisma (accountingService.test.ts,
 *   approvalParity.test.ts), so none can prove atomicity, locking or
 *   concurrency. These tests run against a REAL Postgres.
 *
 * [HOW IT WORKS]
 *   1. TEST_DATABASE_URL must point at a THROWAWAY database: a Neon branch
 *      created for testing (use the DIRECT, non-pooled connection string —
 *      migrations and row locks need a real session) or a local Postgres.
 *      It must differ from DATABASE_URL; the harness refuses to run otherwise.
 *   2. createTestDb() creates a uniquely named DATABASE (it_<random>) on that
 *      server, applies every migration in prisma/migrations to it with
 *      `prisma migrate deploy`, and hands back Prisma clients bound to it.
 *      A separate database (not just a schema) is deliberate: seven of the
 *      repo's migrations guard enum creation with `pg_type` lookups that are
 *      NOT schema-aware, so a schema inside a database that already holds the
 *      app (for example a Neon branch cloned from production) would skip
 *      creating its types and fail. A fresh database is always clean, so the
 *      branch you point at may be a production clone.
 *   3. teardown() drops ONLY that database (WITH FORCE) and disconnects every
 *      client, so nothing is left behind even when a test fails.
 *      The role in TEST_DATABASE_URL therefore needs CREATEDB (the default
 *      owner role on a Neon branch has it).
 *
 * [RUN]    TEST_DATABASE_URL=postgresql://… pnpm --filter web test:integration
 * [SKIPS]  With TEST_DATABASE_URL unset the suites skip (they never touch
 *          DATABASE_URL), so a plain `pnpm test` is unaffected.
 *
 * Files named *.itest.ts are picked up only by the `integration` project in
 * vitest.config.ts, which runs files one at a time.
 */
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

// ─────────────────────────────────────────────────────────
//  ENVIRONMENT
// ─────────────────────────────────────────────────────────

/** True when an integration database has been provided. */
export function integrationEnabled(): boolean {
  return Boolean(process.env.TEST_DATABASE_URL)
}

function baseUrl(): string {
  const url = process.env.TEST_DATABASE_URL
  if (!url) {
    throw new Error('TEST_DATABASE_URL is not set — integration tests need a throwaway Postgres (e.g. a Neon branch).')
  }
  if (process.env.DATABASE_URL && sameDatabase(url, process.env.DATABASE_URL)) {
    throw new Error('TEST_DATABASE_URL points at the same database as DATABASE_URL — refusing to run integration tests against it.')
  }
  return url
}

/** Same host + port + database name (ignores credentials and query string). */
function sameDatabase(a: string, b: string): boolean {
  try {
    const ua = new URL(a)
    const ub = new URL(b)
    return ua.hostname === ub.hostname && (ua.port || '5432') === (ub.port || '5432') && ua.pathname === ub.pathname
  } catch {
    return a === b
  }
}

/** Same server and credentials, different database name. */
function withDatabase(url: string, database: string): string {
  const u = new URL(url)
  u.pathname = `/${database}`
  return u.toString()
}

const DATABASE_NAME = /^it_[a-f0-9]{12}$/

// ─────────────────────────────────────────────────────────
//  FAILURE INJECTION
//  Tests arm a named failpoint; code under test (given a hook, or a later
//  `failpoint()` call site added by the task that needs it) throws when it
//  reaches it. A failpoint fires once, then disarms itself.
// ─────────────────────────────────────────────────────────

const armed = new Map<string, Error>()

export const failpoints = {
  arm(name: string, error: Error = new Error(`Injected failure at "${name}"`)): void {
    armed.set(name, error)
  },
  /** Call at the point where a failure should be injectable. */
  hit(name: string): void {
    const err = armed.get(name)
    if (err) {
      armed.delete(name)
      throw err
    }
  },
  isArmed(name: string): boolean {
    return armed.has(name)
  },
  reset(): void {
    armed.clear()
  },
}

// ─────────────────────────────────────────────────────────
//  TEST DATABASE
// ─────────────────────────────────────────────────────────

export interface ConcurrencyContext {
  /** This worker's own Prisma client (a separate connection per worker). */
  client: PrismaClient
  /** 0-based worker number. */
  index: number
  /**
   * Await this immediately before the contended operation: every worker
   * blocks here until ALL workers have arrived, then they are released
   * together so the operations genuinely race.
   */
  barrier: () => Promise<void>
}

export interface TestDb {
  /** Name of the throwaway database created for this run. */
  database: string
  url: string
  /** Shared client for setup and assertions. */
  prisma: PrismaClient
  /** A new, independent connection (disconnected by teardown). */
  newClient: () => PrismaClient
  /** Minimal reference data: the chart of accounts. */
  seed: () => Promise<void>
  /**
   * Runs `fn` in `n` workers, each on its own client, released together at
   * `ctx.barrier()`. Resolves with every outcome (never rejects on a worker
   * failure, so tests can assert exactly how many succeeded).
   */
  runConcurrently: <T>(n: number, fn: (ctx: ConcurrencyContext) => Promise<T>) => Promise<PromiseSettledResult<T>[]>
  teardown: () => Promise<void>
}

/** Snapshot of the seeded chart (mirrors accountingService DEFAULT_ACCOUNTS; chart v2 arrives in P2-01). */
const SEED_CHART = [
  { code: '1000', name: 'Cash / Bank',           type: 'ASSET',     category: 'Current Assets' },
  { code: '1100', name: 'Accounts Receivable',   type: 'ASSET',     category: 'Current Assets' },
  { code: '1200', name: 'Library Inventory',     type: 'ASSET',     category: 'Non-Current Assets' },
  { code: '2000', name: 'Accounts Payable',      type: 'LIABILITY', category: 'Current Liabilities' },
  { code: '2100', name: 'Salaries Payable',      type: 'LIABILITY', category: 'Current Liabilities' },
  { code: '3000', name: 'Retained Surplus',      type: 'EQUITY',    category: 'Equity' },
  { code: '4000', name: 'Tuition Fee Revenue',   type: 'REVENUE',   category: 'Operating Revenue' },
  { code: '4100', name: 'Boarding Fee Revenue',  type: 'REVENUE',   category: 'Operating Revenue' },
  { code: '4200', name: 'Exam Fee Revenue',      type: 'REVENUE',   category: 'Operating Revenue' },
  { code: '4300', name: 'Library Fine Revenue',  type: 'REVENUE',   category: 'Other Revenue' },
  { code: '5000', name: 'Staff Salaries Expense', type: 'EXPENSE',  category: 'Operating Expense' },
  { code: '5100', name: 'Utilities Expense',     type: 'EXPENSE',   category: 'Operating Expense' },
  { code: '5200', name: 'Maintenance Expense',   type: 'EXPENSE',   category: 'Operating Expense' },
  { code: '5300', name: 'Procurement Expense',   type: 'EXPENSE',   category: 'Operating Expense' },
  { code: '5900', name: 'Miscellaneous Expense', type: 'EXPENSE',   category: 'Operating Expense' },
] as const

function makeClient(url: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url } }, log: [] })
}

/**
 * Creates an isolated database, migrates it, and returns the handle.
 * Call from `beforeAll`; call `teardown()` from `afterAll`.
 */
export async function createTestDb(): Promise<TestDb> {
  const base = baseUrl()
  const database = `it_${randomBytes(6).toString('hex')}`
  if (!DATABASE_NAME.test(database)) throw new Error(`Unexpected database name "${database}".`)
  const url = withDatabase(base, database)
  const clients = new Set<PrismaClient>()

  // Admin connection on the base URL — only used to create and drop our own
  // database.
  const admin = makeClient(base)

  const teardown = async (): Promise<void> => {
    failpoints.reset()
    await Promise.allSettled([...clients].map((c) => c.$disconnect()))
    clients.clear()
    try {
      // The name is validated against DATABASE_NAME above, so interpolation is safe.
      await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
    } finally {
      await admin.$disconnect()
    }
  }

  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${database}"`)

    // Apply the repo's own migrations, exactly as production would.
    const prismaCli = path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js')
    execFileSync(
      process.execPath,
      [prismaCli, 'migrate', 'deploy', '--schema', path.join(process.cwd(), 'prisma', 'schema.prisma')],
      { env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' },
    )
  } catch (err) {
    await teardown()
    throw err
  }

  const newClient = (): PrismaClient => {
    const c = makeClient(url)
    clients.add(c)
    return c
  }
  const prisma = newClient()

  return {
    database,
    url,
    prisma,
    newClient,
    async seed() {
      await prisma.chartOfAccount.createMany({
        data: SEED_CHART.map((a) => ({ ...a })),
        skipDuplicates: true,
      })
    },
    async runConcurrently<T>(n: number, fn: (ctx: ConcurrencyContext) => Promise<T>) {
      let arrived = 0
      let release!: () => void
      const gate = new Promise<void>((resolve) => { release = resolve })
      const barrier = async (): Promise<void> => {
        arrived += 1
        if (arrived >= n) release()
        await gate
      }
      const workers = Array.from({ length: n }, (_, index) => ({ client: newClient(), index }))
      try {
        return await Promise.allSettled(workers.map((w) => fn({ ...w, barrier })))
      } finally {
        await Promise.allSettled(workers.map((w) => w.client.$disconnect()))
      }
    },
    teardown,
  }
}

/** Base-URL probe used by smoke tests to prove teardown left nothing behind. */
export async function databaseExists(database: string): Promise<boolean> {
  const probe = makeClient(baseUrl())
  try {
    const rows = await probe.$queryRaw<Array<{ n: bigint }>>`
      SELECT count(*)::bigint AS n FROM pg_database WHERE datname = ${database}
    `
    return Number(rows[0]?.n ?? 0) > 0
  } finally {
    await probe.$disconnect()
  }
}
