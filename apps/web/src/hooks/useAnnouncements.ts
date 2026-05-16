'use client'

import { useEffect, useState } from 'react'
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuthStore } from '@/store/authStore'

export interface Announcement {
  id: string
  title: string
  body: string
  status: string
  targetAll?: boolean
  targetRoles?: string[]
  createdByUid: string
  createdAt: any
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
      collection(db, 'announcements'),
      where('status', '==', 'PUBLISHED'),
      orderBy('createdAt', 'desc')
    )

    const unsubscribe = onSnapshot(q, (snap) => {
      const docs = snap.docs
        .map((d: QueryDocumentSnapshot) => ({ id: d.id, ...d.data() }) as Announcement)
        .filter((a) => a.targetAll || (a.targetRoles && a.targetRoles.includes(role)))
      setAnnouncements(docs)
      setLoading(false)
    })

    return unsubscribe
  }, [role])

  return { announcements, loading }
}
