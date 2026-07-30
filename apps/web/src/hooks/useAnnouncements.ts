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
  eventDate?: string | null
  publicWebsite?: boolean
  createdByUid: string
  createdAt: Timestamp
}

// Real-time listener for published announcements visible to the current role
export function useAnnouncements() {
  const { role } = useAuthStore()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!role) return

    // Listen to published announcements that target this role or all users
    const q = query(
      collection(db!, COLLECTIONS.ANNOUNCEMENTS),
      where('status', '==', 'PUBLISHED'),
      orderBy('createdAt', 'desc')
    )

    // [PRODUCTION FIX 2026-07-28] onSnapshot had no error callback at all —
    // if the query failed for any reason (missing composite index, a
    // security-rule denial, etc.), the success callback simply never fired:
    // loading stayed true forever and nothing was ever shown to the user,
    // with no way to tell a slow load from a silently broken one. Added the
    // error callback so a failure resolves loading and surfaces a message
    // instead of spinning indefinitely.
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Announcement, 'id'>) }))
          .filter((a) => a.targetAll || (a.targetRoles && a.targetRoles.includes(role)))
        setAnnouncements(docs)
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(err.message || 'Failed to load announcements.')
        setLoading(false)
      },
    )

    return unsubscribe
  }, [role])

  return { announcements, loading, error }
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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = query(
      collection(db!, COLLECTIONS.ANNOUNCEMENTS),
      where('status', '==', 'PENDING_APPROVAL'),
      orderBy('createdAt', 'desc')
    )

    // Same missing-error-callback bug as useAnnouncements() above — fixed
    // the same way.
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setPending(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Announcement, 'id'>) })))
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(err.message || 'Failed to load pending announcements.')
        setLoading(false)
      },
    )

    return unsubscribe
  }, [])

  return { pending, loading, error }
}