// ─── USER ROLES ───────────────────────────────────────────
// Single source of truth for all 9 roles across the project.
// Used in:
//   - apps/web/src/store/authStore.ts
//   - apps/web/src/components/shared/RoleGuard.tsx
//   - apps/web/src/components/shared/Sidebar.tsx
//   - apps/functions/src/middleware/auth.ts
//   - Firebase custom JWT claims (set by set-admin-claim.mjs)

export const USER_ROLES = [
  'admin',
  'high_rank',
  'finance',
  'library',
  'lower_rank',
  'academic',
  'hr',
  'exam_officer',
  'student',
] as const

export type UserRole = (typeof USER_ROLES)[number]

// ─── ROLE LABELS ──────────────────────────────────────────
// Human-readable labels for display in UI and reports
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'System Administrator',
  high_rank: 'High Rank Staff',
  finance: 'Finance Staff',
  library: 'Library Staff',
  lower_rank: 'Lower Rank Staff',
  academic: 'Academic Staff',
  hr: 'HR Staff',
  exam_officer: 'Exam Officer',
  student: 'Student',
}

// ─── STAFF ROLES (non-student) ────────────────────────────
export const STAFF_ROLES: UserRole[] = [
  'admin',
  'high_rank',
  'finance',
  'library',
  'lower_rank',
  'academic',
  'hr',
  'exam_officer',
]

// ─── HELPER: check if a role is a staff role ──────────────
export function isStaffRole(role: UserRole): boolean {
  return STAFF_ROLES.includes(role)
}
