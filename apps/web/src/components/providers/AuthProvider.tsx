'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuthStore } from '@/store/authStore'
import type { UserRole } from '@shared/types/roles'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setUser, clearAuth } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        clearAuth()
        return
      }

      const idTokenResult = await user.getIdTokenResult()

      // Force password change if flag is set
      if (idTokenResult.claims.requiresPasswordChange) {
        router.replace('/change-password')
        return
      }

      // Normal flow — set role from custom claims
      const role = idTokenResult.claims.role as UserRole | undefined
      const subtitle = idTokenResult.claims.subtitle as string | undefined
      setUser(user, role ?? null, subtitle ?? null)
    })

    // Clean up listener on unmount
    return () => unsubscribe()
  }, [setUser, clearAuth, router])

  return <>{children}</>
}
