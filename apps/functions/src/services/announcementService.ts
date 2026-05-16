import { getFirestore, Timestamp } from 'firebase-admin/firestore'

const db = getFirestore()

export type AnnouncementTarget =
  | 'ALL_STAFF'
  | 'ALL_STUDENTS'
  | 'ALL'
  | { role: string }
  | { classId: string }

export interface CreateAnnouncementInput {
  title: string
  body: string
  targetAll?: boolean
  targetRoles?: string[]
  targetClassId?: string
  createdByUid: string
  createdByRole: string
}

// Create announcement — starts as DRAFT, published after approval
export async function createAnnouncement(data: CreateAnnouncementInput) {
  const ref = db.collection('announcements').doc()
  await ref.set({
    ...data,
    status: 'DRAFT',
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  return { id: ref.id, ...data, status: 'DRAFT' }
}

// Approve and publish announcement
export async function publishAnnouncement(id: string, approvedByUid: string) {
  await db.collection('announcements').doc(id).update({
    status: 'PUBLISHED',
    approvedByUid,
    publishedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  return { id, status: 'PUBLISHED' }
}

// List announcements — server-side filtering for admin views
export async function listAnnouncements(status?: string) {
  let query = db.collection('announcements').orderBy('createdAt', 'desc')
  if (status) query = query.where('status', '==', status) as any
  const snap = await query.limit(50).get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}
