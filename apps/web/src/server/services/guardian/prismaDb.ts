/**
 * [FILE]: apps/web/src/server/services/guardian/prismaDb.ts
 * [PURPOSE]: The single place the real Prisma client is adapted to the narrow GuardianDb
 *   interface. Only production wiring (routes, hooks) imports this file; services and
 *   their tests import `./db` and never load the Prisma client.
 */
import 'server-only'
import { prisma } from '@/lib/prisma'
import type { GuardianDb } from './db'

export function prismaGuardianDb(): GuardianDb {
  return prisma as unknown as GuardianDb
}
