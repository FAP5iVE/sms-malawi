/*
 * apps/web/src/hooks/useAnnouncements.ts
 *
 * [CHANGE TYPE]: TARGETED EDIT
 * [R-PHASE]: R13 — Announcements, Timetable & Calendar Domain
 * [PURPOSE]: Added usePendingAnnouncements() — a real-time listener over
 *   status === 'PENDING_APPROVAL' documents, following the exact same
 *   onSnapshot pattern as the existing useAnnouncements() — for the new
 *   "Pending Approval" tab/view (announcements/page.tsx, same phase).
 *   Before this phase, no approver (admin/high_rank/academic) had any UI
 *   surface to discover what was awaiting their action:
 *   useAnnouncements()'s query has always filtered to
 *   status === 'PUBLISHED' only.
 * [DEPENDS ON]: none
 */
'use client'

import { useEffect, useState } from 'react'
import { collection, query, where, orderBy, onSnapshot, type Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuthStore } from '@/store/authStore'
import { COLLECTIONS } from '@shared/constants/storage'

export interface Announcement {
  id: string
  title: string
  body: string
  status: string
  targetAll?: boolean
  targetRoles?: string[]
  createdByUid: string
  createdAt: Timestamp
}

// Real-time listener for published announcements visible to the current role
export function useAnnouncements() {
  const { role } = useAuthStore()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!role) return

    // Listen to published announcements that target this role or all users
    const q = query(
      collection(db!, COLLECTIONS.ANNOUNCEMENTS),
      where('status', '==', 'PUBLISHED'),
      orderBy('createdAt', 'desc')
    )

    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<Announcement, 'id'>) }))
        .filter((a) => a.targetAll || (a.targetRoles && a.targetRoles.includes(role)))
      setAnnouncements(docs)
      setLoading(false)
    })

    return unsubscribe
  }, [role])

  return { announcements, loading }
}

/**
 * Real-time listener for announcements awaiting approval. Intended for
 * the three roles holding announcement.approvePublish (admin/high_rank/
 * academic) — the page rendering this tab is expected to gate visibility
 * with PermissionGuard, so no role filtering happens here beyond the
 * status query itself.
 */
export function usePendingAnnouncements() {
  const [pending, setPending] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const q = query(
      collection(db!, COLLECTIONS.ANNOUNCEMENTS),
      where('status', '==', 'PENDING_APPROVAL'),
      orderBy('createdAt', 'desc')
    )

    const unsubscribe = onSnapshot(q, (snap) => {
      setPending(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Announcement, 'id'>) })))
      setLoading(false)
    })

    return unsubscribe
  }, [])

  return { pending, loading }
}
