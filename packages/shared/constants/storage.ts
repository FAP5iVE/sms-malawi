/**
 * [CHANGE TYPE]: NEW FILE (relocated out of malawi.ts)
 * [FILE]: packages/shared/constants/storage.ts
 * [R-PHASE]: R16 — Constants Centralization (Phase 10B Plan)
 * [PURPOSE]: Firestore/Appwrite infrastructure naming — Firestore collection
 *   names and the single Appwrite bucket identifier. Relocated out of
 *   malawi.ts (these are infrastructure constants, not Malawi-regional data);
 *   the six COLLECTIONS consumers are swept from '@shared/constants/malawi'
 *   to '@shared/constants/storage' in the same change. Also centralizes
 *   VIEW_URL_TTL_SECS (signed-file-view URL lifetime), previously duplicated
 *   as an inline literal in DigitalResourceViewer.tsx.
 * [DEPENDS ON]: none
 */

// ─── FIRESTORE COLLECTION NAMES ──────────────────────────
// Use these constants everywhere — never hard-code collection strings in hooks
export const COLLECTIONS = {
  ANNOUNCEMENTS: 'announcements',
  CALENDAR_EVENTS: 'calendar_events',
  ATTENDANCE: 'attendance',
  NOTIFICATIONS: 'notifications',
  AUDIT_LOGS: 'audit_logs',
} as const

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS]

// ─── APPWRITE STORAGE ─────────────────────────────────────
// ONE bucket handles ALL file types (photos, PDFs, eBooks, payslips, report
// cards). Bucket ID: school_files — matches what was created in the Appwrite
// dashboard.
export const SCHOOL_BUCKET_ID = 'school_files' as const

export const STORAGE_BUCKET_IDS = {
  STUDENT_FILES: SCHOOL_BUCKET_ID,
  DIGITAL_LIBRARY: SCHOOL_BUCKET_ID,
  PAYSLIPS: SCHOOL_BUCKET_ID,
  REPORT_CARDS: SCHOOL_BUCKET_ID,
} as const

// ─── SIGNED FILE-VIEW URL LIFETIME ───────────────────────
// Lifetime (seconds) of a signed file-view URL issued through
// /api/files/[fileId]. Must match W/lib/storage.ts's SIGNED_URL_TTL_SECONDS
// (3600). Centralized here so client refresh timers and server issuance draw
// from one source instead of an inline per-file literal.
export const VIEW_URL_TTL_SECS = 3600 as const
