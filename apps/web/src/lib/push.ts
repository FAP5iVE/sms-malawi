import 'server-only'

import * as admin from 'firebase-admin'
import type { App } from 'firebase-admin/app'
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import type {
  Message,
  MulticastMessage,
  BatchResponse,
  TopicMessage,
} from 'firebase-admin/messaging'
import { logger } from '@/lib/logger'

// ─────────────────────────────────────────────────────────
//  ADMIN APP SINGLETON
//  Reuses the same Firebase Admin app as verifyAuth.ts.
//  admin.apps[0] is populated on first use by either module.
// ─────────────────────────────────────────────────────────

function getAdminApp(): App {
  if (admin.apps.length > 0) return admin.app()

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey:  (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
    }),
  })
}

// ─────────────────────────────────────────────────────────
//  FIRESTORE TOKEN STORE
//  Collection: user_fcm_tokens
//  Document:   {uid}
//  Shape:      { tokens: FcmTokenEntry[], updatedAt: Timestamp }
//
//  Rationale for Firestore over PostgreSQL:
//   • FCM tokens are ephemeral client state — they expire, rotate,
//     and are invalidated on browser clear / app uninstall
//   • Firestore's real-time updates allow background token cleanup
//   • Keeps the Prisma schema focused on business data
//   • Max 5 tokens per user (handles multi-device without unbounded growth)
// ─────────────────────────────────────────────────────────

const FCM_TOKENS_COLLECTION = 'user_fcm_tokens'
const MAX_TOKENS_PER_USER   = 5

export interface FcmTokenEntry {
  token:        string
  platform:     'web'
  deviceInfo:   string
  registeredAt: Timestamp
  lastSeenAt:   Timestamp
}

interface FcmTokenDocument {
  tokens:    FcmTokenEntry[]
  updatedAt: Timestamp
}

// ─────────────────────────────────────────────────────────
//  RESULT TYPES
// ─────────────────────────────────────────────────────────

export interface PushSuccess {
  ok:           true
  uid:          string
  sentCount:    number
  failedCount:  number
  messageIds:   string[]
}

export interface PushFailure {
  ok:      false
  uid:     string
  error:   string
  code:    PushErrorCode
}

export type PushResult = PushSuccess | PushFailure

export type PushErrorCode =
  | 'NO_TOKENS'
  | 'ALL_TOKENS_INVALID'
  | 'MESSAGING_NOT_CONFIGURED'
  | 'FCM_API_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR'

export interface PushNotificationPayload {
  /** Short title shown in the system notification. Max ~65 chars. */
  title: string
  /** Body text of the notification. Max ~240 chars. */
  body:  string
  /** Absolute URL to the notification icon (192x192 PNG recommended). */
  icon?: string
  /**
   * URL to navigate to when the user taps the notification.
   * Should be relative to your origin: '/dashboard', '/exams', etc.
   */
  clickAction?: string
  /**
   * Notification tag — prevents duplicate notifications for the same event.
   * e.g. 'fee_reminder_inv_abc123'
   */
  tag?: string
  /**
   * Arbitrary string→string data payload, available in the service worker's
   * notificationclick handler via event.notification.data.
   */
  data?: Record<string, string>
  /**
   * Notification badge count — shown on the app icon (Android only).
   */
  badgeCount?: number
}

export interface BatchPushResult {
  results:      PushResult[]
  successCount: number
  failureCount: number
  totalCount:   number
}

export interface TopicPushResult {
  ok:        boolean
  topic:     string
  messageId?: string
  error?:    string
}

// ─────────────────────────────────────────────────────────
//  TOKEN MANAGEMENT
// ─────────────────────────────────────────────────────────

/**
 * Register an FCM token for a user.
 * If the user already has MAX_TOKENS_PER_USER tokens, the oldest one
 * is evicted to make room (LRU eviction by registeredAt).
 *
 * Called from POST /api/notifications/register-token.
 */
export async function registerToken(
  uid:        string,
  token:      string,
  deviceInfo: string = 'Unknown browser'
): Promise<void> {
  try {
    const db      = getFirestore(getAdminApp())
    const docRef  = db.collection(FCM_TOKENS_COLLECTION).doc(uid)
    const docSnap = await docRef.get()

    const now       = Timestamp.now()
    const newEntry: FcmTokenEntry = {
      token,
      platform:     'web',
      deviceInfo,
      registeredAt: now,
      lastSeenAt:   now,
    }

    if (!docSnap.exists) {
      await docRef.set({ tokens: [newEntry], updatedAt: now })
      return
    }

    const data          = docSnap.data() as FcmTokenDocument
    const existingTokens = data.tokens ?? []

    // Deduplicate — if this exact token is already registered, update lastSeenAt
    const existingIdx = existingTokens.findIndex((t) => t.token === token)
    if (existingIdx >= 0) {
      existingTokens[existingIdx] = { ...existingTokens[existingIdx]!, lastSeenAt: now }
      await docRef.update({ tokens: existingTokens, updatedAt: now })
      return
    }

    // Evict oldest token if at capacity
    let tokens = [...existingTokens, newEntry]
    if (tokens.length > MAX_TOKENS_PER_USER) {
      tokens.sort(
        (a, b) => a.registeredAt.toMillis() - b.registeredAt.toMillis()
      )
      tokens = tokens.slice(tokens.length - MAX_TOKENS_PER_USER)
    }

    await docRef.update({ tokens, updatedAt: now })

    logger.info({ uid, tokenCount: tokens.length }, '[push] FCM token registered')
  } catch (err) {
    logger.error({ err, uid }, '[push] Failed to register FCM token')
  }
}

/**
 * Remove a specific FCM token for a user.
 * Called on logout or when the user explicitly disables push notifications.
 */
export async function unregisterToken(uid: string, token: string): Promise<void> {
  try {
    const db     = getFirestore(getAdminApp())
    const docRef = db.collection(FCM_TOKENS_COLLECTION).doc(uid)
    const snap   = await docRef.get()

    if (!snap.exists) return

    const data = snap.data() as FcmTokenDocument
    const tokens = (data.tokens ?? []).filter((t) => t.token !== token)

    await docRef.update({ tokens, updatedAt: Timestamp.now() })
    logger.info({ uid }, '[push] FCM token unregistered')
  } catch (err) {
    logger.error({ err, uid }, '[push] Failed to unregister FCM token')
  }
}

/**
 * Remove all FCM tokens for a user.
 * Called on account suspension or archival.
 */
export async function clearTokensForUser(uid: string): Promise<void> {
  try {
    const db     = getFirestore(getAdminApp())
    const docRef = db.collection(FCM_TOKENS_COLLECTION).doc(uid)
    await docRef.delete()
    logger.info({ uid }, '[push] All FCM tokens cleared for user')
  } catch (err) {
    logger.error({ err, uid }, '[push] Failed to clear FCM tokens')
  }
}

/**
 * Retrieve all valid FCM token strings for a user.
 * Returns an empty array if the user has no registered tokens.
 */
export async function getTokensForUser(uid: string): Promise<string[]> {
  try {
    const db     = getFirestore(getAdminApp())
    const docRef = db.collection(FCM_TOKENS_COLLECTION).doc(uid)
    const snap   = await docRef.get()

    if (!snap.exists) return []

    const data = snap.data() as FcmTokenDocument
    return (data.tokens ?? []).map((t) => t.token).filter(Boolean)
  } catch (err) {
    logger.error({ err, uid }, '[push] Failed to retrieve FCM tokens')
    return []
  }
}

/**
 * Remove a set of invalid tokens from a user's token list.
 * Called internally after a batch send reports invalid tokens.
 */
async function removeInvalidTokens(
  uid:            string,
  invalidTokens:  Set<string>
): Promise<void> {
  if (invalidTokens.size === 0) return

  try {
    const db     = getFirestore(getAdminApp())
    const docRef = db.collection(FCM_TOKENS_COLLECTION).doc(uid)
    const snap   = await docRef.get()

    if (!snap.exists) return

    const data   = snap.data() as FcmTokenDocument
    const tokens = (data.tokens ?? []).filter(
      (t) => !invalidTokens.has(t.token)
    )

    await docRef.update({ tokens, updatedAt: Timestamp.now() })
    logger.info(
      { uid, removedCount: invalidTokens.size },
      '[push] Removed invalid FCM tokens'
    )
  } catch (err) {
    logger.error({ err, uid }, '[push] Failed to remove invalid FCM tokens')
  }
}

// ─────────────────────────────────────────────────────────
//  SEND HELPERS
// ─────────────────────────────────────────────────────────

/**
 * Build the FCM notification + webpush config from a payload.
 * webpush config ensures correct behaviour on Chrome/Edge/Firefox.
 */
function buildFcmMessage(payload: PushNotificationPayload): {
  notification: NonNullable<Message['notification']>
  webpush:      NonNullable<Message['webpush']>
  data:         Record<string, string>
} {
  const iconUrl = payload.icon ?? '/favicon.ico'

  return {
    notification: {
      title: payload.title,
      body:  payload.body,
    },
    webpush: {
      notification: {
        title:  payload.title,
        body:   payload.body,
        icon:   iconUrl,
        badge:  '/favicon.ico',
        tag:    payload.tag,
        requireInteraction: false,
        ...(payload.clickAction ? {
          actions: [{
            action: 'open',
            title:  'View',
          }],
        } : {}),
      },
      fcmOptions: {
        link: payload.clickAction ?? '/',
      },
    },
    data: {
      ...(payload.data ?? {}),
      ...(payload.clickAction ? { clickAction: payload.clickAction } : {}),
    },
  }
}

function classifyFcmError(err: unknown): {
  message: string
  code:    PushErrorCode
} {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('econnreset')) {
      return { message: err.message, code: 'NETWORK_ERROR' }
    }
    if (msg.includes('not registered') || msg.includes('invalid registration')) {
      return { message: err.message, code: 'ALL_TOKENS_INVALID' }
    }
    return { message: err.message, code: 'FCM_API_ERROR' }
  }
  return { message: String(err), code: 'UNKNOWN_ERROR' }
}

// ─────────────────────────────────────────────────────────
//  SEND TO SINGLE USER
// ─────────────────────────────────────────────────────────

/**
 * Send a push notification to a single user by Firebase UID.
 * Looks up the user's registered FCM tokens from Firestore,
 * sends to all of them, and cleans up invalid tokens.
 *
 * Returns PushFailure with code 'NO_TOKENS' if the user has no
 * registered tokens — this is not an error, just means they
 * haven't enabled push notifications.
 *
 * @example
 *   const result = await sendToUser('firebase-uid-123', {
 *     title: 'Exam results released',
 *     body:  'Your Term 2 results are now available.',
 *     clickAction: '/exams',
 *     tag:   'results_term2_2026',
 *   })
 */
export async function sendToUser(
  uid:     string,
  payload: PushNotificationPayload
): Promise<PushResult> {
  const tokens = await getTokensForUser(uid)

  if (tokens.length === 0) {
    return {
      ok:    false,
      uid,
      error: 'User has no registered FCM tokens.',
      code:  'NO_TOKENS',
    }
  }

  return sendToTokens(uid, tokens, payload)
}

/**
 * Send a push notification to a specific list of FCM tokens for a user.
 * Invalid tokens are automatically removed from Firestore after the send.
 * Internal — prefer sendToUser for external callers.
 */
async function sendToTokens(
  uid:     string,
  tokens:  string[],
  payload: PushNotificationPayload
): Promise<PushResult> {
  try {
    const messaging = getMessaging(getAdminApp())
    const { notification, webpush, data } = buildFcmMessage(payload)

    if (tokens.length === 1) {
      // Single token — use send() for best error detail
      const message: Message = {
        token: tokens[0]!,
        notification,
        webpush,
        data,
      }
      const messageId = await messaging.send(message)
      return { ok: true, uid, sentCount: 1, failedCount: 0, messageIds: [messageId] }
    }

    // Multiple tokens — use sendEachForMulticast
    const multicast: MulticastMessage = {
      tokens,
      notification,
      webpush,
      data,
    }

    const batchResponse: BatchResponse = await messaging.sendEachForMulticast(multicast)

    const invalidTokens = new Set<string>()
    const messageIds: string[] = []

    batchResponse.responses.forEach((resp, idx) => {
      if (resp.success && resp.messageId) {
        messageIds.push(resp.messageId)
      } else if (resp.error) {
        const errorCode = resp.error.code
        // These error codes indicate permanently invalid tokens
        if (
          errorCode === 'messaging/registration-token-not-registered' ||
          errorCode === 'messaging/invalid-registration-token' ||
          errorCode === 'messaging/invalid-argument'
        ) {
          const token = tokens[idx]
          if (token) invalidTokens.add(token)
        }
        logger.warn(
          { uid, errorCode: resp.error.code, errorMessage: resp.error.message },
          '[push] FCM token send failed'
        )
      }
    })

    // Clean up invalid tokens asynchronously — don't block the response
    if (invalidTokens.size > 0) {
      void removeInvalidTokens(uid, invalidTokens)
    }

    const sentCount   = batchResponse.successCount
    const failedCount = batchResponse.failureCount

    if (sentCount === 0 && failedCount > 0) {
      return {
        ok:    false,
        uid,
        error: 'All FCM tokens failed.',
        code:  'ALL_TOKENS_INVALID',
      }
    }

    logger.info(
      { uid, sentCount, failedCount, total: tokens.length },
      '[push] Push notification sent'
    )

    return { ok: true, uid, sentCount, failedCount, messageIds }
  } catch (err: unknown) {
    const classified = classifyFcmError(err)
    logger.error({ err, uid, code: classified.code }, '[push] sendToTokens threw')
    return { ok: false, uid, error: classified.message, code: classified.code }
  }
}

// ─────────────────────────────────────────────────────────
//  SEND TO MULTIPLE USERS
// ─────────────────────────────────────────────────────────

/**
 * Send the same push notification to multiple users.
 * Runs sequentially to avoid Firestore read storms.
 * Use sendToTopic instead when all users share a common group
 * (e.g., all students, all academic staff) and are already subscribed.
 *
 * @param uids    Array of Firebase UIDs to notify
 * @param payload Notification content
 */
export async function sendToUsers(
  uids:    string[],
  payload: PushNotificationPayload
): Promise<BatchPushResult> {
  if (uids.length === 0) {
    return { results: [], successCount: 0, failureCount: 0, totalCount: 0 }
  }

  const results: PushResult[] = []
  let successCount = 0
  let failureCount = 0

  for (const uid of uids) {
    const result = await sendToUser(uid, payload)
    results.push(result)
    if (result.ok) {
      successCount++
    } else {
      // NO_TOKENS is not a true failure — user simply hasn't enabled push
      if (result.code !== 'NO_TOKENS') {
        failureCount++
      }
    }
  }

  logger.info(
    { successCount, failureCount, total: uids.length },
    '[push] Batch user push complete'
  )

  return { results, successCount, failureCount, totalCount: uids.length }
}

// ─────────────────────────────────────────────────────────
//  TOPIC MESSAGING
//  Topics allow sending to groups of users without managing
//  individual tokens. Users subscribe their FCM token to a topic
//  and any send to that topic reaches all subscribers.
//
//  Topic naming conventions for this app:
//   • 'announcements_all'           — every authenticated user
//   • 'announcements_staff'         — all staff roles
//   • 'announcements_students'      — all students
//   • 'results_form1', 'results_form2', etc. — per-form results
//   • 'announcements_academic'      — academic staff
//   • 'announcements_class_{classId}' — specific class students
// ─────────────────────────────────────────────────────────

/**
 * Send a push notification to all subscribers of an FCM topic.
 * More efficient than sendToUsers for large groups.
 *
 * @example
 *   await sendToTopic('announcements_all', {
 *     title: 'School closed tomorrow',
 *     body:  'Due to a public holiday, the school will be closed on 6 July 2026.',
 *     clickAction: '/announcements',
 *   })
 */
export async function sendToTopic(
  topic:   string,
  payload: PushNotificationPayload
): Promise<TopicPushResult> {
  try {
    const messaging = getMessaging(getAdminApp())
    const { notification, webpush, data } = buildFcmMessage(payload)

    const message: TopicMessage = {
      topic,
      notification,
      webpush,
      data,
    }

    const messageId = await messaging.send(message)
    logger.info({ topic, messageId }, '[push] Topic push sent')
    return { ok: true, topic, messageId }
  } catch (err: unknown) {
    const classified = classifyFcmError(err)
    logger.error({ err, topic, code: classified.code }, '[push] sendToTopic threw')
    return { ok: false, topic, error: classified.message }
  }
}

/**
 * Subscribe one or more FCM tokens to a topic.
 * Call this when a user logs in and after registering their FCM token.
 *
 * @example
 *   await subscribeToTopic([token], 'announcements_all')
 *   await subscribeToTopic([token], `announcements_class_${student.classId}`)
 */
export async function subscribeToTopic(
  tokens: string[],
  topic:  string
): Promise<void> {
  if (tokens.length === 0) return

  try {
    const messaging = getMessaging(getAdminApp())
    const response  = await messaging.subscribeToTopic(tokens, topic)

    if (response.failureCount > 0) {
      logger.warn(
        { topic, failureCount: response.failureCount, errors: response.errors },
        '[push] Some tokens failed to subscribe to topic'
      )
    } else {
      logger.info({ topic, tokenCount: tokens.length }, '[push] Tokens subscribed to topic')
    }
  } catch (err) {
    logger.error({ err, topic }, '[push] subscribeToTopic threw')
  }
}

/**
 * Unsubscribe one or more FCM tokens from a topic.
 * Call this on logout, class change, or role change.
 */
export async function unsubscribeFromTopic(
  tokens: string[],
  topic:  string
): Promise<void> {
  if (tokens.length === 0) return

  try {
    const messaging = getMessaging(getAdminApp())
    await messaging.unsubscribeFromTopic(tokens, topic)
    logger.info({ topic, tokenCount: tokens.length }, '[push] Tokens unsubscribed from topic')
  } catch (err) {
    logger.error({ err, topic }, '[push] unsubscribeFromTopic threw')
  }
}

/**
 * Subscribe a user to all topics appropriate for their role and class.
 * Call after FCM token registration and after role changes.
 */
export async function subscribeUserToDefaultTopics(
  uid:     string,
  role:    string,
  classId?: string
): Promise<void> {
  const tokens = await getTokensForUser(uid)
  if (tokens.length === 0) return

  const topics: string[] = ['announcements_all']

  if (role === 'student') {
    topics.push('announcements_students')
    if (classId) topics.push(`announcements_class_${classId}`)
  } else {
    topics.push('announcements_staff')
  }

  if (['academic', 'exam_officer'].includes(role)) {
    topics.push('announcements_academic')
  }

  await Promise.all(topics.map((topic) => subscribeToTopic(tokens, topic)))
}

// ─────────────────────────────────────────────────────────
//  HEALTH CHECK
// ─────────────────────────────────────────────────────────

export interface PushHealthStatus {
  configured:     boolean
  vapidKeyPresent: boolean
  firebaseAdminReady: boolean
  mode: 'live' | 'not-configured'
}

export function getPushHealthStatus(): PushHealthStatus {
  const vapidKeyPresent = Boolean(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY)

  let firebaseAdminReady = false
  try {
    getAdminApp()
    firebaseAdminReady = true
  } catch {
    firebaseAdminReady = false
  }

  const configured = vapidKeyPresent && firebaseAdminReady

  return {
    configured,
    vapidKeyPresent,
    firebaseAdminReady,
    mode: configured ? 'live' : 'not-configured',
  }
}