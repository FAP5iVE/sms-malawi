/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/app/(parent)/layout.tsx
 * [PHASE]: Guardian Portal — parent UI (T7c)
 * [PURPOSE]: The parent portal's own shell. A guardian never sees the staff sidebar or any staff
 *   navigation: the proxy already confines the parent role to /parent, and this layout gives that
 *   tree a minimal header (title, name, theme, sign out) so there is nothing else to click.
 *
 *   Idle sign-out and the session heartbeat run here as they do in the staff shell: a guardian
 *   on a shared or borrowed phone must not stay signed in indefinitely.
 *
 *   RoleGuard wraps the inner shell so that nothing here calls the parent API for a signed-in
 *   non-parent (the hooks live in ParentShell, which only mounts for the parent role).
 * [DEPENDS ON]: @/components/shared/{RoleGuard,ModeToggle,ErrorBoundary,InactivityWarningDialog}
 */
'use client'

import { useCallback, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { RoleGuard } from '@/components/shared/RoleGuard'
import { ModeToggle } from '@/components/shared/ModeToggle'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { InactivityWarningDialog } from '@/components/shared/InactivityWarningDialog'
import { logout } from '@/components/providers/AuthProvider'
import { useInactivityTimer } from '@/hooks/useInactivityTimer'
import { useSessionHeartbeat } from '@/hooks/useSessionHeartbeat'
import { useParentMe } from '@/hooks/useParentPortal'

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

function ParentShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const me = useParentMe()

  const signOut = async () => {
    await logout()
    router.replace('/login')
  }

  return (
    <div className="min-h-dvh bg-page text-body">
      <SessionManager />
      <header className="sticky top-0 z-30 border-b border-base bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/parent" className="font-heading font-bold text-body">Parent portal</Link>
          <div className="flex items-center gap-1.5">
            {me.data?.displayName && <span className="hidden sm:inline max-w-48 truncate text-sm text-muted">{me.data.displayName}</span>}
            <ModeToggle />
            <button
              type="button" onClick={signOut}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-muted hover:bg-page hover:text-body"
            >
              <LogOut className="h-4 w-4" aria-hidden />Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-5">
        <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
      </main>
    </div>
  )
}

export default function ParentLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard allowed={['parent']}>
      <ParentShell>{children}</ParentShell>
    </RoleGuard>
  )
}
