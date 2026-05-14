'use client'

import { useEffect } from 'react'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuthStore } from '@/store/authStore'
import type { UserRole } from '@/store/authStore'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, clearAuth } = useAuthStore()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        clearAuth()
        return
      }

      // Read custom JWT claims to get role and subtitle
      // Claims set by Cloud Function when admin creates user
      const tokenResult = await firebaseUser.getIdTokenResult()
      const role = tokenResult.claims['role'] as UserRole | null
      const subtitle = tokenResult.claims['subtitle'] as string | null

      setUser(firebaseUser, role, subtitle)
    })

    // Clean up listener on unmount
    return () => unsubscribe()
  }, [setUser, clearAuth])

  return <>{children}</>
}
