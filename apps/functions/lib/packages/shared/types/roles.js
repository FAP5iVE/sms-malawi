"use strict";
// ─── USER ROLES ───────────────────────────────────────────
// Single source of truth for all 9 roles across the project.
// Used in:
//   - apps/web/src/store/authStore.ts
//   - apps/web/src/components/shared/RoleGuard.tsx
//   - apps/web/src/components/shared/Sidebar.tsx
//   - apps/functions/src/middleware/auth.ts
//   - Firebase custom JWT claims (set by set-admin-claim.mjs)
Object.defineProperty(exports, "__esModule", { value: true });
exports.STAFF_ROLES = exports.ROLE_LABELS = exports.USER_ROLES = void 0;
exports.isStaffRole = isStaffRole;
exports.USER_ROLES = [
    'admin',
    'high_rank',
    'finance',
    'library',
    'lower_rank',
    'academic',
    'hr',
    'exam_officer',
    'student',
];
// ─── ROLE LABELS ──────────────────────────────────────────
// Human-readable labels for display in UI and reports
exports.ROLE_LABELS = {
    admin: 'System Administrator',
    high_rank: 'High Rank Staff',
    finance: 'Finance Staff',
    library: 'Library Staff',
    lower_rank: 'Lower Rank Staff',
    academic: 'Academic Staff',
    hr: 'HR Staff',
    exam_officer: 'Exam Officer',
    student: 'Student',
};
// ─── STAFF ROLES (non-student) ────────────────────────────
exports.STAFF_ROLES = [
    'admin',
    'high_rank',
    'finance',
    'library',
    'lower_rank',
    'academic',
    'hr',
    'exam_officer',
];
// ─── HELPER: check if a role is a staff role ──────────────
function isStaffRole(role) {
    return exports.STAFF_ROLES.includes(role);
}
//# sourceMappingURL=roles.js.map