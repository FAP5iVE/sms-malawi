"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAnnouncement = createAnnouncement;
exports.publishAnnouncement = publishAnnouncement;
exports.listAnnouncements = listAnnouncements;
const firestore_1 = require("firebase-admin/firestore");
const db = (0, firestore_1.getFirestore)();
// Create announcement — starts as DRAFT, published after approval
async function createAnnouncement(data) {
    const ref = db.collection('announcements').doc();
    await ref.set({
        ...data,
        status: 'DRAFT',
        createdAt: firestore_1.Timestamp.now(),
        updatedAt: firestore_1.Timestamp.now(),
    });
    return { id: ref.id, ...data, status: 'DRAFT' };
}
// Approve and publish announcement
async function publishAnnouncement(id, approvedByUid) {
    await db.collection('announcements').doc(id).update({
        status: 'PUBLISHED',
        approvedByUid,
        publishedAt: firestore_1.Timestamp.now(),
        updatedAt: firestore_1.Timestamp.now(),
    });
    return { id, status: 'PUBLISHED' };
}
// List announcements — server-side filtering for admin views
async function listAnnouncements(status) {
    let query = db.collection('announcements').orderBy('createdAt', 'desc');
    if (status)
        query = query.where('status', '==', status);
    const snap = await query.limit(50).get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
//# sourceMappingURL=announcementService.js.map