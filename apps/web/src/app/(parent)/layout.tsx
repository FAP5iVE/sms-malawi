/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/app/(parent)/layout.tsx
 * [PHASE]: Guardian Portal — parent UI (T7c)
 * [PURPOSE]: The parent portal's own shell. A guardian never sees the staff pages or any staff
 *   navigation: the proxy already confines the parent role to /parent. Since Phase 10c the frame
 *   (sidebar, header, phone bottom bar) is ParentShell, built to look like the staff frame but
 *   listing only the Dashboard and the guardian's own children.
 *
 *   Idle sign-out and the session heartbeat run here as they do in the staff shell: a guardian
 *   on a shared or borrowed phone must not stay signed in indefinitely.
 *
 *   RoleGuard wraps the inner shell so that nothing here calls the parent API for a signed-in
 *   non-parent (the hooks live in ParentShell, which only mounts for the parent role).
 * [DEPENDS ON]: @/components/shared/{RoleGuard,InactivityWarningDialog}, @/components/parent/ParentShell
 */
'use client'

import { useCallback, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { ParentShell } from '@/components/parent/ParentShell'
import { InactivityWarningDialog } from '@/components/shared/InactivityWarningDialog'
import { logout } from '@/components/providers/AuthProvider'
import { useInactivityTimer } from '@/hooks/useInactivityTimer'
import { useSessionHeartbeat } from '@/hooks/useSessionHeartbeat'

function SessionManager() {
  const router = useRouter()
  const { showWarning, keepAlive } = useInactivityTimer()
  useSessionHeartbeat()
  const handleLogout = useCallback(async () => {
    await logout()
    router.replace('/login')
  }, [router])
  if (!showWarning) return null
  return <InactivityWarningDialog onKeepAlive={keepAlive} onLogout={handleLogout} />
}

function ParentFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <SessionManager />
      <ParentShell>{children}</ParentShell>
    </>
  )
}

export default function ParentLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard allowed={['parent']}>
      <ParentFrame>{children}</ParentFrame>
    </RoleGuard>
  )
}
