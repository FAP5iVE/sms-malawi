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
 *      server as a copy of a migrated template database (it_tpl_<hash of the
 *      migrations>, built once with `prisma migrate deploy` and kept between
 *      runs), and hands back Prisma clients bound to it.
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
import { createHash, randomBytes } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
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
  // The schema has `directUrl = env("DIRECT_URL")`, and migrations use it, so it is guarded like DATABASE_URL.
  for (const name of ['DATABASE_URL', 'DIRECT_URL'] as const) {
    const other = process.env[name]
    if (other && sameDatabase(url, other)) {
      throw new Error(`TEST_DATABASE_URL points at the same database as ${name} — refusing to run integration tests against it.`)
    }
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

/**
 * Neon computes suspend when idle, and a cold start takes longer than Prisma's 5 s default connect timeout
 * ("Can't reach database server"), so give every connection 30 s unless the URL already says otherwise.
 */
function withConnectTimeout(url: string): string {
  const u = new URL(url)
  if (!u.searchParams.has('connect_timeout')) u.searchParams.set('connect_timeout', '30')
  return u.toString()
}

function makeClient(url: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: withConnectTimeout(url) } }, log: [] })
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Wake a suspended compute: retry a trivial query until the server answers (or give up after `ms`). */
async function waitForServer(client: PrismaClient, ms = 90_000): Promise<void> {
  const deadline = Date.now() + ms
  for (;;) {
    try {
      await client.$queryRaw`SELECT 1`
      return
    } catch (err) {
      if (Date.now() > deadline) throw err
      await sleep(2_000)
    }
  }
}

// ─────────────────────────────────────────────────────────
//  MIGRATED TEMPLATE
//  `prisma migrate deploy` replays every migration statement over the network and takes minutes from a
//  laptop, so it is done ONCE per set of migrations. The result is kept as a template database named
//  after a hash of the migration files; every test database is then a fast server-side copy of it.
//  Changing or adding a migration changes the hash, so a stale template is never reused.
//  The template (`it_tpl_<hash>`) is left in place on purpose between runs; it is safe to drop at any time.
// ─────────────────────────────────────────────────────────

const TEMPLATE_NAME = /^it_tpl_[a-f0-9]{12}$/

function migrationsHash(): string {
  const dir = path.join(process.cwd(), 'prisma', 'migrations')
  const hash = createHash('sha256')
  for (const name of readdirSync(dir).filter((n) => !n.includes('.')).sort()) {
    hash.update(name)
    hash.update(readFileSync(path.join(dir, name, 'migration.sql')))
  }
  return hash.digest('hex').slice(0, 12)
}

function migrate(url: string): void {
  const prismaCli = path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js')
  execFileSync(
    process.execPath,
    [prismaCli, 'migrate', 'deploy', '--schema', path.join(process.cwd(), 'prisma', 'schema.prisma')],
    // DIRECT_URL must be overridden too: prisma/schema.prisma declares `directUrl = env("DIRECT_URL")`, and
    // `migrate deploy` prefers it. Overriding only DATABASE_URL sent the migrations to whatever DIRECT_URL
    // pointed at (the app's own database) and left this throwaway database empty.
    { env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url }, stdio: 'pipe' },
  )
}

async function ensureTemplate(base: string, admin: PrismaClient): Promise<string> {
  const name = `it_tpl_${migrationsHash()}`
  if (!TEMPLATE_NAME.test(name)) throw new Error(`Unexpected template name "${name}".`)

  const found = await admin.$queryRaw<Array<{ ready: string | null }>>`
    SELECT shobj_description(oid, 'pg_database') AS ready FROM pg_database WHERE datname = ${name}
  `
  if (found[0]?.ready === 'ready') return name
  // Present but not marked ready: an earlier build was interrupted. Rebuild it from scratch.
  if (found.length > 0) await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)

  const url = withDatabase(base, name)
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`)
    migrate(url)
    await assertMigrated(url, name)
    await admin.$executeRawUnsafe(`COMMENT ON DATABASE "${name}" IS 'ready'`)
  } catch (err) {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`).catch(() => undefined)
    throw err
  }
  return name
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
    await waitForServer(admin)
    const template = await ensureTemplate(base, admin)
    // A server-side copy of the migrated template: seconds, not minutes.
    await admin.$executeRawUnsafe(`CREATE DATABASE "${database}" TEMPLATE "${template}"`)
    await assertMigrated(url, database)
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

/** Fails loudly if `migrate deploy` did not build the schema in OUR database (see the DIRECT_URL note above). */
async function assertMigrated(url: string, database: string): Promise<void> {
  const probe = makeClient(url)
  try {
    const rows = await probe.$queryRaw<Array<{ t: string | null }>>`SELECT to_regclass('public.chart_of_accounts')::text AS t`
    if (!rows[0]?.t) {
      throw new Error(`Migrations did not create the schema in the test database "${database}". Check that nothing redirects prisma migrate (DIRECT_URL, .env).`)
    }
  } finally {
    await probe.$disconnect()
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
