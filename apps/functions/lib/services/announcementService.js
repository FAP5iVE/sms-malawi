'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
const _createAnnouncement = createAnnouncement
export { _createAnnouncement as createAnnouncement }
const _publishAnnouncement = publishAnnouncement
export { _publishAnnouncement as publishAnnouncement }
const _listAnnouncements = listAnnouncements
export { _listAnnouncements as listAnnouncements }
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
const db = (0, getFirestore)()
// Create announcement — starts as DRAFT, published after approval
async function createAnnouncement(data) {
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
async function publishAnnouncement(id, approvedByUid) {
  await db.collection('announcements').doc(id).update({
    status: 'PUBLISHED',
    approvedByUid,
    publishedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  })
  return { id, status: 'PUBLISHED' }
}
// List announcements — server-side filtering for admin views
async function listAnnouncements(status) {
  let query = db.collection('announcements').orderBy('createdAt', 'desc')
  if (status) query = query.where('status', '==', status)
  const snap = await query.limit(50).get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
}
