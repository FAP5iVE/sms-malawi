import 'server-only'
import { env } from '@/lib/env'
import { neonConfig } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'
import { PrismaClient } from '@prisma/client'

// ─── NEON SERVERLESS CONFIGURATION ──────────────────────────
neonConfig.poolQueryViaFetch = true
// fetchConnectionCache is deprecated (now always true) — removed

// ─── DEV LOGGING HELPER ──────────────────────────────────────
type LogLevel = 'query' | 'info' | 'warn' | 'error'
const devLogLevels: LogLevel[] = ['error', 'warn']
const queryLogLevels: LogLevel[] = ['query', 'error', 'warn']
function getLogLevels(): LogLevel[] {
  if (process.env.NODE_ENV === 'production') return devLogLevels
  if (process.env.PRISMA_QUERY_LOG === '1') return queryLogLevels
  return devLogLevels
}

// ─── CLIENT FACTORY ──────────────────────────────────────────
function createPrismaClient(): PrismaClient {
  const adapter = new PrismaNeon({ connectionString: env.DATABASE_URL })
  const client = new PrismaClient({
    adapter,
    log: getLogLevels().map((level) => ({
      emit: 'event' as const,
      level,
    })),
  })

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(client as any).$on('error', (e: { message: string; target: string }) => {
      console.error('[prisma:error]', e.target, e.message)
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(client as any).$on('warn', (e: { message: string; target: string }) => {
      console.warn('[prisma:warn]', e.target, e.message)
    })
    if (process.env.PRISMA_QUERY_LOG === '1') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(client as any).$on('query', (e: { query: string; duration: number }) => {
        console.log(`[prisma:query] ${e.duration}ms — ${e.query}`)
      })
    }
  }

  return client
}

// ─── GLOBAL SINGLETON ────────────────────────────────────────
// __prisma persists on globalThis across Next.js HMR re-evaluations in dev.
// In production each warm Lambda reuses the same module-cached instance.
const globalForPrisma = globalThis as unknown as {
  __prisma?: PrismaClient
}

function getPrismaInstance(): PrismaClient {
  if (!globalForPrisma.__prisma) {
    globalForPrisma.__prisma = createPrismaClient()
  }
  return globalForPrisma.__prisma
}

// ─── CONNECTION RESILIENCE ────────────────────────────────────
// `poolQueryViaFetch = true` makes ordinary queries stateless HTTP fetches,
// but `$transaction([...])` still needs a real held-open session. Over an
// unstable path to Neon that session can drop mid-flight, and once it does
// the adapter's client stays permanently unqueryable — every later call on
// the same singleton fails identically until the process is restarted.
// resetPrismaClient()/withRetry() let a caller recover from that instead.

export function resetPrismaClient(): void {
  globalForPrisma.__prisma = undefined
}

function isTransientConnectionError(err: unknown): boolean {
  if (err instanceof Error) {
    return /connection error|not queryable|ECONNRESET|fetch failed/i.test(err.message)
  }
  // A dropped Neon socket can also surface as a bare WebSocket ErrorEvent
  // (type: 'error', timeStamp: ...) rather than an Error instance.
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { type?: unknown }).type === 'error' &&
    'timeStamp' in (err as Record<string, unknown>)
  )
}

/**
 * Run an operation that may open a real DB session (chiefly
 * `prisma.$transaction([...])`) with retry-on-drop. On a transient
 * connection error the shared client is torn down and lazily recreated
 * (via the Proxy below) before retrying, with a short backoff.
 */
export async function withRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (isTransientConnectionError(err) && attempt < retries) {
        console.warn(
          `[prisma] transient connection error — recreating client and retrying (attempt ${attempt + 1}/${retries})`
        )
        resetPrismaClient()
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
        continue
      }
      throw err
    }
  }
}

// Proxy defers createPrismaClient() — and therefore env.DATABASE_URL —
// until the first property access at request time, not at module load.
// All existing call sites (prisma.user.findMany, prisma.$transaction, etc.)
// continue working with zero changes.
export const prisma = new Proxy({} as PrismaClient, {
  get(_: PrismaClient, prop: string | symbol) {
    const client = getPrismaInstance()
    const val = (client as unknown as Record<string | symbol, unknown>)[prop]
    return typeof val === 'function' ? (val as (...args: unknown[]) => unknown).bind(client) : val
  },
})