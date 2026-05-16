import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

// Required for Node.js environments — Neon uses WebSockets
neonConfig.webSocketConstructor = ws

// Prisma 6 + Neon: pass the connection string directly to PrismaNeon
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! })

// Singleton pattern — prevents connection pool exhaustion in Cloud Functions
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
