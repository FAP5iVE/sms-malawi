/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/server/services/approvals/announcementAdapter.ts
 * [PURPOSE]: Hub adapter for announcements. Announcements live in Firestore,
 *   not Postgres, so this is the one adapter that reads a different store —
 *   the hub's shape and decision flow are identical regardless.
 *
 *   Surfaces PENDING_APPROVAL (awaiting a decision) and REJECTED (so the
 *   author can see why). Approved announcements move on to the normal
 *   Announcements feed and are not repeated here.
 *
 *   Queries are kept to shapes that already have a Firestore index
 *   (status + createdAt DESC — the same one listPending() uses) or need none
 *   (equality-only), and are sorted in memory otherwise, so this adapter
 *   never introduces a new composite-index requirement.
 */

import 'server-only'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import type { DocumentData, Query } from 'firebase-admin/firestore'
import { getAdminApp } from '@/lib/verifyAuth'
import { COLLECTIONS } from '@shared/constants/storage'
import * as announcementService from '@/server/services/announcementService'
import type { AdapterItem, ApprovalAdapter } from './types'
import { detailList, emptyCounts, humanize, lookupNames, makeItem, person } from './helpers'

function toDate(v: unknown): Date | null {
  if (!v) return null
  if (v instanceof Timestamp) return v.toDate()
  if (typeof v === 'string') {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const maybe = v as { toDate?: () => Date }
  return typeof maybe.toDate === 'function' ? maybe.toDate() : null
}

function plainText(html: string, max = 220): string {
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}

function toItem(id: string, d: DocumentData, names: Map<string, string>): AdapterItem | null {
  const raw = typeof d.status === 'string' ? d.status : ''
  const status = raw === 'PENDING_APPROVAL' ? 'PENDING' : raw === 'REJECTED' ? 'REJECTED' : null
  if (!status) return null

  const createdByUid = typeof d.createdByUid === 'string' ? d.createdByUid : ''
  const title = typeof d.title === 'string' && d.title ? d.title : 'Untitled announcement'
  const body = typeof d.body === 'string' ? plainText(d.body) : ''
  const roles = Array.isArray(d.targetRoles) ? (d.targetRoles as unknown[]).filter((r): r is string => typeof r === 'string') : []
  const audience = d.targetAll ? 'Everyone' : roles.length ? roles.map(humanize).join(', ') : 'Not specified'
  const rejectedByUid = typeof d.rejectedByUid === 'string' ? d.rejectedByUid : null

  return makeItem('announcement', {
    sourceId: id,
    title,
    summary: body || null,
    status,
    sourceStatus: raw,
    requester: person(
      createdByUid || null,
      (typeof d.authorName === 'string' && d.authorName) || names.get(createdByUid) || '',
      typeof d.createdByRole === 'string' ? d.createdByRole : null,
    ),
    details: detailList([
      ['Title', title],
      ['Post type', typeof d.postType === 'string' ? humanize(d.postType) : 'Announcement'],
      ['Audience', audience],
      ['On public website', d.publicWebsite ? 'Yes' : 'No'],
      ['Event date', typeof d.eventDate === 'string' ? d.eventDate : null],
      ['Preview', body],
    ]),
    createdAt: toDate(d.createdAt) ?? new Date(),
    decidedAt: status === 'REJECTED' ? toDate(d.rejectedAt) : null,
    decidedBy: status === 'REJECTED' && rejectedByUid ? person(rejectedByUid, names.get(rejectedByUid) ?? '') : null,
    decisionNotes: status === 'REJECTED' && typeof d.rejectionReason === 'string' ? d.rejectionReason : null,
  })
}

function col() {
  return getFirestore(getAdminApp()).collection(COLLECTIONS.ANNOUNCEMENTS)
}

async function fetchDocs(status: string, requesterUid: string | null, take: number) {
  let query: Query<DocumentData> = col().where('status', '==', status)
  if (requesterUid) {
    query = query.where('createdByUid', '==', requesterUid)
  } else if (status === 'PENDING_APPROVAL') {
    // Same shape listPending() uses, so its index already exists.
    query = query.orderBy('createdAt', 'desc')
  }
  return (await query.limit(take).get()).docs
}

async function countDocs(status: string, requesterUid: string | null): Promise<number> {
  let query: Query<DocumentData> = col().where('status', '==', status)
  if (requesterUid) query = query.where('createdByUid', '==', requesterUid)
  const snap = await query.count().get()
  return snap.data().count
}

export const announcementAdapter: ApprovalAdapter = {
  source: 'announcement',

  async list(q) {
    const wanted = q.statuses ?? ['PENDING', 'REJECTED']
    const statuses: string[] = []
    if (wanted.includes('PENDING')) statuses.push('PENDING_APPROVAL')
    if (wanted.includes('REJECTED')) statuses.push('REJECTED')
    if (statuses.length === 0) return []

    const batches = await Promise.all(statuses.map((s) => fetchDocs(s, q.requesterUid, q.take)))
    const docs = batches.flat()
    const names = await lookupNames(
      docs.flatMap((d) => {
        const data = d.data()
        return [
          typeof data.createdByUid === 'string' ? data.createdByUid : null,
          typeof data.rejectedByUid === 'string' ? data.rejectedByUid : null,
        ]
      }),
    )
    const from = q.dateFrom?.getTime() ?? null
    const to = q.dateTo?.getTime() ?? null
    const sign = q.order === 'asc' ? 1 : -1
    return docs
      .flatMap((d) => {
        const item = toItem(d.id, d.data(), names)
        return item ? [item] : []
      })
      .filter((i) => {
        const t = Date.parse(i.createdAt)
        return (from === null || t >= from) && (to === null || t <= to)
      })
      .sort((a, b) => sign * (Date.parse(a.createdAt) - Date.parse(b.createdAt)))
      .slice(0, q.take)
  },

  async counts(requesterUid) {
    const [pending, rejected] = await Promise.all([
      countDocs('PENDING_APPROVAL', requesterUid),
      countDocs('REJECTED', requesterUid),
    ])
    return { ...emptyCounts(), PENDING: pending, REJECTED: rejected }
  },

  async get(id) {
    const snap = await col().doc(id).get()
    if (!snap.exists) return null
    const d = snap.data() as DocumentData
    const names = await lookupNames([
      typeof d.createdByUid === 'string' ? d.createdByUid : null,
      typeof d.rejectedByUid === 'string' ? d.rejectedByUid : null,
    ])
    return toItem(snap.id, d, names)
  },

  async approve(id, actor) {
    await announcementService.publishAnnouncement(id, actor.uid)
  },

  async reject(id, actor, input) {
    await announcementService.rejectAnnouncement(id, actor.uid, input.notes)
  },
}
