/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: packages/shared/constants/audit.ts
 * [R-PHASE]: R16 — Constants Centralization (Phase 10B Plan)
 * [PURPOSE]: Audit-log reference constants. AUDIT_ENTITY_TYPES (the auditable
 *   Prisma model names, moved from AuditLogViewer.tsx); AUDIT_SEVERITY_CONFIG
 *   (severity label + badge class, moved from AuditLogViewer.tsx); and the
 *   page-size bounds moved from auditService.ts.
 * [DEPENDS ON]: none
 */

// ─── AUDITABLE ENTITY TYPES ──────────────────────────────
export const AUDIT_ENTITY_TYPES = [
  'Student', 'Application', 'Class', 'Assignment',
  'Exam', 'ExamMark', 'TermResult', 'AnnualResult', 'ManebRecord',
  'Invoice', 'Payment', 'Expense', 'Budget', 'Scholarship', 'PayrollRun', 'Payslip',
  'StaffProfile', 'LeaveRequest', 'StaffLoan', 'PerformanceNote',
  'Book', 'Borrowing', 'DigitalResource', 'LibraryFine',
  'TimetableSlot', 'LabBooking',
  'Announcement', 'SystemSettings', 'User',
  'UniversityPlacement',
] as const

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number]

// ─── SEVERITY DISPLAY CONFIG ─────────────────────────────
export type AuditSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'

export const AUDIT_SEVERITY_CONFIG: Record<AuditSeverity, { label: string; badgeClass: string }> = {
  CRITICAL: { label: 'Critical', badgeClass: 'text-status-danger' },
  HIGH:     { label: 'High',     badgeClass: 'text-status-warning' },
  MEDIUM:   { label: 'Medium',   badgeClass: 'text-status-info' },
  LOW:      { label: 'Low',      badgeClass: 'text-status-neutral' },
}

// ─── PAGINATION BOUNDS ───────────────────────────────────
export const AUDIT_DEFAULT_PAGE_SIZE = 25
export const AUDIT_MAX_PAGE_SIZE = 100
