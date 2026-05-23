'use client'
import { useEffect, useCallback } from 'react'
import { signOut } from 'firebase/auth'
import { useRouter } from 'next/navigation'
import { auth } from '@/lib/firebase'
import { useAuthStore } from '@/store/authStore'

const TIMEOUTS: Record<string, number> = {
  student: 60 * 60 * 1000,       // 1 hour
  default: 5 * 60 * 60 * 1000,   // 5 hours for all staff
}

export function useInactivityTimer() {
  const router = useRouter()
  const { role } = useAuthStore()
  const timeout = role === 'student' ? TIMEOUTS.student : TIMEOUTS.default

  const logout = useCallback(async () => {
    if (!auth) return // auth is only null during SSR; never reached in browser
    await signOut(auth)
    document.cookie = 'sms_session=; path=/; max-age=0'
    router.replace('/login?reason=timeout')
  }, [router])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(logout, timeout)
    }

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }))
    reset()

    return () => {
      clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, reset))
    }
  }, [logout, timeout])
}