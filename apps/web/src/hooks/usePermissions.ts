'use client'

import { useCallback } from 'react'
import { useAuthStore } from '@/store/authStore'
import {
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  getPermissionsForRole,
  type Permission,
} from '@shared/types/permissions'

// ─── RETURN TYPE ─────────────────────────────────────────

export interface UsePermissionsReturn {
  /**
   * Check whether the current user holds a specific permission.
   * Returns false if the user is not authenticated.
   */
  can: (permission: Permission) => boolean

  /**
   * Check whether the current user holds ALL of the provided permissions.
   * Returns false if the user is not authenticated or any permission is missing.
   */
  canAll: (permissions: readonly Permission[]) => boolean

  /**
   * Check whether the current user holds AT LEAST ONE of the provided permissions.
   * Returns false if the user is not authenticated.
   */
  canAny: (permissions: readonly Permission[]) => boolean

  /**
   * Array of all permissions the current user's role holds.
   * Useful for debugging or rendering capability summaries.
   * Returns empty array if the user is not authenticated.
   */
  allPermissions: Permission[]

  /**
   * Whether the auth state has fully initialised.
   * Permission checks return false while this is false.
   */
  isInitialized: boolean
}

// ─── HOOK ────────────────────────────────────────────────

/**
 * Provides synchronous permission check utilities for client components.
 *
 * All functions are memoized with useCallback and return stable references
 * unless the user's role changes — safe to use in dependency arrays.
 *
 * @example
 *   const { can, canAny } = usePermissions()
 *
 *   if (can('student.create')) {
 *     // show create button
 *   }
 *   if (canAny(['finance.approveExpense', 'finance.rejectExpense'])) {
 *     // show approval controls
 *   }
 */
export function usePermissions(): UsePermissionsReturn {
  const { role, initialized } = useAuthStore()

  // Memoize each checker so callers can safely include them in
  // useEffect / useMemo dependency arrays without triggering re-renders
  // on every render cycle.

  const can = useCallback(
    (permission: Permission): boolean => {
      if (!initialized || !role) return false
      return hasPermission(role, permission)
    },
    [role, initialized]
  )

  const canAll = useCallback(
    (permissions: readonly Permission[]): boolean => {
      if (!initialized || !role) return false
      return hasAllPermissions(role, permissions)
    },
    [role, initialized]
  )

  const canAny = useCallback(
    (permissions: readonly Permission[]): boolean => {
      if (!initialized || !role) return false
      return hasAnyPermission(role, permissions)
    },
    [role, initialized]
  )

  const allPermissions: Permission[] =
    initialized && role ? getPermissionsForRole(role) : []

  return {
    can,
    canAll,
    canAny,
    allPermissions,
    isInitialized: initialized,
  }
}