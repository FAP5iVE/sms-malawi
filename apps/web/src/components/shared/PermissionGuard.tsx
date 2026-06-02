'use client'

import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/store/authStore'
import type { Permission } from '@shared/types/permissions'

// ─── VARIANTS ────────────────────────────────────────────

/**
 * Require a single permission.
 * Most common usage — require exactly one capability.
 */
interface SinglePermissionProps {
  permission: Permission
  any?: never
  all?: never
}

/**
 * Require at least one of several permissions.
 * Use when multiple roles grant access to the same UI element
 * via different permissions.
 */
interface AnyPermissionProps {
  any: readonly Permission[]
  permission?: never
  all?: never
}

/**
 * Require all listed permissions.
 * Use when an action requires concurrent capabilities
 * (e.g., approve AND lock payroll).
 */
interface AllPermissionsProps {
  all: readonly Permission[]
  permission?: never
  any?: never
}

type PermissionSpec = SinglePermissionProps | AnyPermissionProps | AllPermissionsProps

interface PermissionGuardBaseProps {
  children: React.ReactNode
  /**
   * Rendered when the user does not have the required permission(s).
   * If omitted, nothing is rendered (null) — no 403 placeholder.
   * For page-level guards, provide a meaningful fallback.
   */
  fallback?: React.ReactNode
  /**
   * When true, renders a loading skeleton while auth initialises
   * rather than flickering directly to children or fallback.
   * Default: true.
   */
  showLoadingState?: boolean
}

export type PermissionGuardProps = PermissionGuardBaseProps & PermissionSpec

// ─── LOADING SKELETON ────────────────────────────────────

function PermissionLoadingSkeleton() {
  return (
    <div className="flex items-center justify-center h-20" aria-hidden="true">
      <div className="h-5 w-48 rounded-md bg-muted/40 animate-pulse" />
    </div>
  )
}

// ─── COMPONENT ───────────────────────────────────────────

/**
 * Conditionally renders children based on the current user's permissions.
 *
 * @example — single permission
 *   <PermissionGuard permission="student.create">
 *     <AddStudentButton />
 *   </PermissionGuard>
 *
 * @example — any of several permissions
 *   <PermissionGuard any={['finance.approveExpense', 'finance.rejectExpense']}>
 *     <ExpenseApprovalControls />
 *   </PermissionGuard>
 *
 * @example — with fallback
 *   <PermissionGuard permission="userMgmt.viewAuditLogs" fallback={<AccessDeniedPanel />}>
 *     <AuditLogViewer />
 *   </PermissionGuard>
 */
export function PermissionGuard({
  children,
  fallback = null,
  showLoadingState = true,
  ...spec
}: PermissionGuardProps) {
  const { initialized } = useAuthStore()
  const { can, canAny, canAll } = usePermissions()

  // ── Loading state — auth not yet initialised
  if (!initialized) {
    return showLoadingState ? <PermissionLoadingSkeleton /> : null
  }

  // ── Evaluate the permission spec
  let permitted = false

  if ('permission' in spec && spec.permission !== undefined) {
    permitted = can(spec.permission)
  } else if ('any' in spec && spec.any !== undefined) {
    permitted = canAny(spec.any)
  } else if ('all' in spec && spec.all !== undefined) {
    permitted = canAll(spec.all)
  }

  if (permitted) {
    return <>{children}</>
  }

  // ── Not permitted — render fallback (default: null)
  return <>{fallback}</>
}

// ─── CONVENIENCE WRAPPERS ────────────────────────────────

/**
 * Renders children only when the user has ALL listed permissions.
 * Syntactic sugar over <PermissionGuard all={[...]} />.
 */
export function RequireAllPermissions({
  permissions,
  children,
  fallback,
}: {
  permissions: readonly Permission[]
  children: React.ReactNode
  fallback?: React.ReactNode
}) {
  return (
    <PermissionGuard all={permissions} fallback={fallback}>
      {children}
    </PermissionGuard>
  )
}

/**
 * Renders children when the user has AT LEAST ONE of the listed permissions.
 * Syntactic sugar over <PermissionGuard any={[...]} />.
 */
export function RequireAnyPermission({
  permissions,
  children,
  fallback,
}: {
  permissions: readonly Permission[]
  children: React.ReactNode
  fallback?: React.ReactNode
}) {
  return (
    <PermissionGuard any={permissions} fallback={fallback}>
      {children}
    </PermissionGuard>
  )
}