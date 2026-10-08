'use client'

import { ROLE_LABELS, STAFF_ROLES, type UserRole } from '@shared/types/roles'

interface SuperUserRoleSwitcherProps {
  value: UserRole
  onChange: (role: UserRole) => void
}

/**
 * "View as" picker shown ONLY to the alpha_admin super user (callers render
 * it behind `superUser`). Several screens (the dashboard, the Reports tabs)
 * are built per role; this lets the super user open any staff role's view.
 * It changes what is DISPLAYED — the data a panel loads is authorised by the
 * super user's own token, which the server lets through for every endpoint.
 *
 * The student view is deliberately not offered: those screens read the
 * signed-in student's own record, which a staff account does not have.
 */
export function SuperUserRoleSwitcher({ value, onChange }: SuperUserRoleSwitcherProps) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      <span className="font-medium">View as</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as UserRole)}
        aria-label="View this page as a role"
        className="border border-base rounded-xl px-3 py-2 text-sm bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-brand-navy/20"
      >
        {STAFF_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
    </label>
  )
}
