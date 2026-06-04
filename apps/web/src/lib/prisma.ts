import 'server-only'
import { neonConfig } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'
import { PrismaClient } from '@prisma/client'

// ─── NEON SERVERLESS CONFIGURATION ───────────────────────
// poolQueryViaFetch = true  →  each SQL query becomes an HTTP POST to
// Neon's serverless driver endpoint.  No persistent TCP/WebSocket
// connection is held between queries, which means zero connection
// exhaustion across any number of concurrent Vercel Lambda invocations.
//
// fetchConnectionCache = true  →  Neon reuses the underlying HTTP
// keep-alive connection within a single Lambda warm window, reducing
// per-query latency without maintaining a real connection slot in PG.
neonConfig.poolQueryViaFetch = true
neonConfig.fetchConnectionCache = true

// ─── DEV LOGGING HELPER ───────────────────────────────────
type LogLevel = 'query' | 'info' | 'warn' | 'error'

const devLogLevels: LogLevel[] = ['error', 'warn']
const queryLogLevels: LogLevel[] = ['query', 'error', 'warn']

function getLogLevels(): LogLevel[] {
  if (process.env.NODE_ENV === 'production') return devLogLevels
  if (process.env.PRISMA_QUERY_LOG === '1') return queryLogLevels
  return devLogLevels
}

// ─── CLIENT FACTORY ───────────────────────────────────────
function createPrismaClient(): PrismaClient {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      '[prisma] DATABASE_URL is not set. ' +
        'Import env.ts before prisma.ts in your server startup to catch this earlier.'
    )
  }

  // Pool with HTTP mode — connection_limit=1 is intentional:
  // each serverless invocation needs at most one logical connection.
  // Neon's serverless driver multiplexes all queries from a single
  // invocation through its connection pooler on the server side.
 const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL })

  const client = new PrismaClient({
    adapter,
    log: getLogLevels().map((level) => ({
      emit: 'event' as const,
      level,
    })),
  })

  // Structured log events in development
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
      ;(client as any).$on(
        'query',
        (e: { query: string; duration: number }) => {
          console.log(`[prisma:query] ${e.duration}ms — ${e.query}`)
        }
      )
    }
  }

  return client
}

// ─── GLOBAL SINGLETON ─────────────────────────────────────
// In development, Next.js hot-reload re-evaluates modules on every
// file change.  Without the global guard, each reload leaks a new
// PrismaClient instance.  In production this is unnecessary but
// harmless — each warm Lambda reuses the module-level instance.
const globalForPrisma = globalThis as unknown as {
  __prisma?: PrismaClient
}

export const prisma: PrismaClient =
  globalForPrisma.__prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__prisma = prisma
}