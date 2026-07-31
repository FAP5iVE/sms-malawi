/*
 * apps/web/src/server/services/notificationFeedService.ts
 *
 * [CHANGE TYPE]: NEW FILE
 * [PHASE]: N4 — Build the real per-user notification feed (AUDIT §2-D, §7)
 * [PURPOSE]: The `notifications/{userId}/items` Firestore collection has had
 *   security rules written for it and a COLLECTIONS.NOTIFICATIONS constant
 *   since Phase B9, but NOTHING read or wrote it — the notification "bell"
 *   faked a feed by re-reading published announcements and tracking unread
 *   state in localStorage (per-device, not per-user). This service is the
 *   real feed: every server-side event generator (fee reminder, result
 *   release, leave update, placement update, announcement) already knows its
 *   recipient uids and already sends email/push; it now also drops a
 *   durable, per-user in-app item via pushToFeed().
 *
 *   Reads/mark-read go through GET/PATCH /notifications/feed (notifications.ts)
 *   so the client never touches Firestore directly — consistent with N2's
 *   move of announcement reads server-side.
 *
 * Document path:  notifications/{uid}/items/{autoId}
 * Document shape:
 *   {
 *     title:     string,
 *     body:      string,
 *     type:      'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR',
 *     category:  string,          // 'announcement' | 'fee_reminder' | ...
 *     read:      boolean,
 *     actionUrl: string | null,
 *     createdAt: Timestamp,
 *     readAt:    Timestamp | null,
 *   }
 * [DEPENDS ON]: apps/web/src/lib/verifyAuth.ts (getAdminApp),
 *   @shared/constants/storage (COLLECTIONS.NOTIFICATIONS)
 */
import 'server-only'

import { getFirestore, Timestamp, FieldValue, type DocumentData } from 'firebase-admin/firestore'
import { getAdminApp } from '@/lib/verifyAuth'
import { logger } from '@/lib/logger'
import { COLLECTIONS } from '@shared/constants/storage'

export type FeedItemType = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR'

export interface FeedItemInput {
  title: string
  body: string
  type?: FeedItemType
  category: string
  actionUrl?: string | null
}

export interface FeedItem {
  id: string
  title: string
  body: string
  type: FeedItemType
  category: string
  read: boolean
  actionUrl: string | null
  createdAt: string | null
  readAt: string | null
}

const MAX_FEED_READ = 50

function itemsCollection(uid: string) {
  return getFirestore(getAdminApp())
    .collection(COLLECTIONS.NOTIFICATIONS)
    .doc(uid)
    .collection('items')
}

function toIso(value: unknown): string | null {
  if (!value) return null
  if (value instanceof Timestamp) return value.toDate().toISOString()
  const maybe = value as { toDate?: () => Date }
  if (typeof maybe?.toDate === 'function') return maybe.toDate().toISOString()
  if (typeof value === 'string') return value
  return null
}

function mapItem(id: string, data: DocumentData): FeedItem {
  return {
    id,
    title: (data.title as string) ?? '',
    body: (data.body as string) ?? '',
    type: (data.type as FeedItemType) ?? 'INFO',
    category: (data.category as string) ?? 'general',
    read: (data.read as boolean | undefined) ?? false,
    actionUrl: (data.actionUrl as string | null | undefined) ?? null,
    createdAt: toIso(data.createdAt),
    readAt: toIso(data.readAt),
  }
}

/**
 * Write one feed item for a single user. Best-effort: a feed-write failure
 * must never roll back or mask the primary action (email/push already sent).
 */
export async function pushToFeed(uid: string, item: FeedItemInput): Promise<void> {
  if (!uid) return
  try {
    await itemsCollection(uid).add({
      title: item.title,
      body: item.body,
      type: item.type ?? 'INFO',
      category: item.category,
      read: false,
      actionUrl: item.actionUrl ?? null,
      createdAt: Timestamp.now(),
      readAt: null,
    })
  } catch (err) {
    logger.error({ err, uid, category: item.category }, '[notificationFeed] pushToFeed failed')
  }
}

/**
 * Fan a single item out to many users. Uses a batched write (chunked to stay
 * within Firestore's 500-op batch limit). Best-effort per the same rationale.
 */
export async function pushToManyFeeds(uids: string[], item: FeedItemInput): Promise<void> {
  const unique = Array.from(new Set(uids.filter(Boolean)))
  if (unique.length === 0) return

  const db = getFirestore(getAdminApp())
  const CHUNK = 400
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK)
    try {
      const batch = db.batch()
      for (const uid of slice) {
        const ref = itemsCollection(uid).doc()
        batch.set(ref, {
          title: item.title,
          body: item.body,
          type: item.type ?? 'INFO',
          category: item.category,
          read: false,
          actionUrl: item.actionUrl ?? null,
          createdAt: Timestamp.now(),
          readAt: null,
        })
      }
      await batch.commit()
    } catch (err) {
      logger.error({ err, count: slice.length, category: item.category }, '[notificationFeed] pushToManyFeeds chunk failed')
    }
  }
}

/** Most-recent feed items for a user, plus the unread count. */
export async function listFeed(uid: string): Promise<{ items: FeedItem[]; unreadCount: number }> {
  const snap = await itemsCollection(uid)
    .orderBy('createdAt', 'desc')
    .limit(MAX_FEED_READ)
    .get()

  const items = snap.docs.map((d) => mapItem(d.id, d.data()))
  const unreadCount = items.filter((i) => !i.read).length
  return { items, unreadCount }
}

/** Mark a single feed item read. */
export async function markRead(uid: string, itemId: string): Promise<void> {
  await itemsCollection(uid).doc(itemId).update({
    read: true,
    readAt: Timestamp.now(),
  })
}

/** Mark every unread feed item read. */
export async function markAllRead(uid: string): Promise<number> {
  const snap = await itemsCollection(uid).where('read', '==', false).limit(500).get()
  if (snap.empty) return 0
  const db = getFirestore(getAdminApp())
  const batch = db.batch()
  snap.docs.forEach((d) => batch.update(d.ref, { read: true, readAt: FieldValue.serverTimestamp() }))
  await batch.commit()
  return snap.size
}