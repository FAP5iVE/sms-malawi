'use client'

import { useEffect, useState } from 'react'
import { collection, query, where, orderBy, onSnapshot, type Timestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuthStore } from '@/store/authStore'
import { COLLECTIONS } from '@shared/constants/malawi'

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
      collection(db, COLLECTIONS.ANNOUNCEMENTS),
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
