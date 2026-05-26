// apps/web/src/lib/prisma.ts
// Fixed: no-explicit-any in Proxy get — use unknown cast chain instead
import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }

function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    // Lazy require so neonConfig.webSocketConstructor = ws runs ONLY on first DB call,
    // not at module load time (avoids Firebase emulator 10-second timeout).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ws = require('ws') as typeof import('ws').default
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { neonConfig } = require('@neondatabase/serverless') as typeof import('@neondatabase/serverless')
    neonConfig.webSocketConstructor = ws

    const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! })
    globalForPrisma.prisma = new PrismaClient({ adapter })
  }
  return globalForPrisma.prisma
}

// Proxy so callers write `prisma.student.findMany()` as normal —
// the actual client is only created on the first property access (first DB call).
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop: string | symbol) {
    return (getPrisma() as unknown as Record<string | symbol, unknown>)[prop]
  },
})