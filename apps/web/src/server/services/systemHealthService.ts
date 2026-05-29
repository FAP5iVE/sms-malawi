import { prisma }        from '@/lib/prisma'
import { SCHOOL_BUCKET } from '@/lib/storage'
import * as admin       from 'firebase-admin'
import { logger }        from '@/lib/logger'
import * as sdk from 'node-appwrite'

interface ServiceStatus {
  name: string
  status: 'ok' | 'degraded' | 'down'
  latencyMs?: number
  details?: string
}

async function checkNeon(): Promise<ServiceStatus> {
  const start = Date.now()
  try {
    await prisma.$queryRaw`SELECT 1`
    return { name: 'Neon PostgreSQL', status: 'ok', latencyMs: Date.now() - start }
  } catch (e: unknown) {
    return { name: 'Neon PostgreSQL', status: 'down', details: String(e) }
  }
}

async function checkAppwrite(): Promise<ServiceStatus> {
  const start = Date.now()
  try {
    const client = new sdk.Client()
      .setEndpoint(process.env.APPWRITE_ENDPOINT!)
      .setProject(process.env.APPWRITE_PROJECT_ID!)
      .setKey(process.env.APPWRITE_API_KEY!)
    const storage = new sdk.Storage(client)
    const bucket = await storage.getBucket(SCHOOL_BUCKET)
    const usedMB = Math.round((bucket.totalSize ?? 0) / (1024 * 1024))
    return {
      name: 'Appwrite Storage',
      status: 'ok',
      latencyMs: Date.now() - start,
      details: `${usedMB} MB used`,
    }
  } catch (e: unknown) {
    return { name: 'Appwrite Storage', status: 'degraded', details: String(e) }
  }
}

async function checkFirestore(): Promise<ServiceStatus> {
  const start = Date.now()
  try {
    await admin.firestore().collection('_health').doc('ping').set({ ts: Date.now() })
    return { name: 'Firestore', status: 'ok', latencyMs: Date.now() - start }
  } catch (e: unknown) {
    return { name: 'Firestore', status: 'degraded', details: String(e) }
  }
}

export async function getSystemHealth() {
  const [neon, appwrite, firestore] = await Promise.allSettled([
    checkNeon(), checkAppwrite(), checkFirestore()
  ])
  const services: ServiceStatus[] = [
    neon.status       === 'fulfilled' ? neon.value       : { name: 'Neon PostgreSQL', status: 'down' as const },
    appwrite.status   === 'fulfilled' ? appwrite.value   : { name: 'Appwrite Storage', status: 'down' as const },
    firestore.status  === 'fulfilled' ? firestore.value  : { name: 'Firestore',         status: 'down' as const },
  ]

  // Recent DB stats
  const [recentAudit, activeUsers] = await Promise.allSettled([
    prisma.auditLog.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
    prisma.auditLog.groupBy({ by: ['actorUid'], where: { createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } }),
  ])

  const overall = services.every((s) => s.status === 'ok') ? 'healthy'
               : services.some((s) => s.status === 'down')   ? 'degraded'
               : 'warning'

  logger.info({ event: 'health.check', overall })
  return {
    overall,
    services,
    actionsLast24h:   recentAudit.status === 'fulfilled' ? recentAudit.value   : 0,
    activeUsersLastHr:activeUsers.status  === 'fulfilled' ? activeUsers.value.length  : 0,
    checkedAt:        new Date().toISOString(),
  }
}