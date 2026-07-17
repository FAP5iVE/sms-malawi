/**
 * apps/web/src/server/services/systemHealthService.ts
 *
 * [CHANGE TYPE]: MAJOR REWRITE (R19 — Email/push health + Appwrite client dedup).
 *
 * getSystemHealth() now surfaces email (Resend) and push (FCM) configuration
 * status alongside Neon/Appwrite/Firestore, using lib/email.ts's
 * getEmailHealthStatus() and lib/push.ts's getPushHealthStatus() — both
 * implemented specifically to be called from here but previously zero-caller,
 * leaving the admin System Health view blind to whether the actual delivery
 * mechanism for every notification pipeline is configured.
 *
 * checkAppwrite() now reuses lib/storage.ts's exported getAppwriteClient()
 * builder rather than a second, independently-maintained client construction
 * with unchecked non-null assertions.
 */

import { prisma }              from '@/lib/prisma'
import { SCHOOL_BUCKET, getAppwriteClient } from '@/lib/storage'
import { getEmailHealthStatus } from '@/lib/email'
import { getPushHealthStatus }  from '@/lib/push'
import * as admin               from 'firebase-admin'
import { logger }               from '@/lib/logger'
import * as sdk                 from 'node-appwrite'

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
    const storage = new sdk.Storage(getAppwriteClient())
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

/**
 * Email (Resend) configuration status. Synchronous config check — reports
 * whether the API key and webhook secret are present and which mode the
 * sender is in. A missing API key is 'degraded' (dev-log fallback), not 'down'.
 */
function checkEmail(): ServiceStatus {
  const h = getEmailHealthStatus()
  return {
    name: 'Email (Resend)',
    status: h.configured ? 'ok' : 'degraded',
    details: h.configured
      ? `${h.mode} · from ${h.fromAddress}${h.webhookSecretPresent ? ' · webhook set' : ' · no webhook secret'}`
      : 'RESEND_API_KEY not set — dev-log mode (no mail actually sent)',
  }
}

/**
 * Push (FCM) configuration status. Synchronous config check — reports whether
 * the VAPID key and Firebase Admin app are both available.
 */
function checkPush(): ServiceStatus {
  const h = getPushHealthStatus()
  return {
    name: 'Push (FCM)',
    status: h.configured ? 'ok' : 'degraded',
    details: h.configured
      ? 'live'
      : `not configured — ${h.vapidKeyPresent ? '' : 'VAPID key missing; '}${h.firebaseAdminReady ? '' : 'Firebase Admin not ready'}`.trim(),
  }
}

export async function getSystemHealth() {
  const [neon, appwrite, firestore] = await Promise.allSettled([
    checkNeon(), checkAppwrite(), checkFirestore()
  ])

  const services: ServiceStatus[] = [
    neon.status      === 'fulfilled' ? neon.value      : { name: 'Neon PostgreSQL', status: 'down' as const },
    appwrite.status  === 'fulfilled' ? appwrite.value  : { name: 'Appwrite Storage', status: 'down' as const },
    firestore.status === 'fulfilled' ? firestore.value : { name: 'Firestore',        status: 'down' as const },
    checkEmail(),
    checkPush(),
  ]

  // Recent DB stats
  const [recentAudit, activeUsers] = await Promise.allSettled([
    prisma.auditLog.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } }),
    prisma.auditLog.groupBy({ by: ['actorUid'], where: { createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } }),
  ])

  const overall = services.every((s) => s.status === 'ok') ? 'healthy'
               : services.some((s) => s.status === 'down')  ? 'degraded'
               : 'warning'

  logger.info({ event: 'health.check', overall })
  return {
    overall,
    services,
    actionsLast24h:    recentAudit.status === 'fulfilled' ? recentAudit.value        : 0,
    activeUsersLastHr: activeUsers.status === 'fulfilled' ? activeUsers.value.length : 0,
    checkedAt:         new Date().toISOString(),
  }
}
