'use client'

import { useAuthStore } from '@/store/authStore'
import type { UserRole } from '@shared/types/roles'
import { ShieldOff } from 'lucide-react'

interface RoleGuardProps {
  allowed: UserRole[] // roles that can see the content
  children: React.ReactNode
  fallback?: React.ReactNode // optional custom denied view
}

export function RoleGuard({ allowed, children, fallback }: RoleGuardProps) {
  const { role, loading, initialized } = useAuthStore()

  // Show nothing while auth is initialising
  if (!initialized || loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="skeleton h-8 w-48 rounded" />
      </div>
    )
  }

  // Role is permitted — render content
  if (role && allowed.includes(role)) {
    return <>{children}</>
  }

  // Role is not permitted — show fallback or default 403
  if (fallback) return <>{fallback}</>

  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted">
      <ShieldOff className="w-10 h-10 opacity-40" />
      <p className="font-heading font-semibold text-base">Access denied</p>
      <p className="text-sm">You do not have permission to view this section.</p>
    </div>
  )
}
