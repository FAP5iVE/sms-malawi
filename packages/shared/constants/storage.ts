/**
 * [CHANGE TYPE]: NEW FILE (relocated out of malawi.ts)
 * [FILE]: packages/shared/constants/storage.ts
 * [R-PHASE]: R16 — Constants Centralization (Phase 10B Plan)
 * [PURPOSE]: Firestore infrastructure naming — Firestore collection names.
 *   Relocated out of malawi.ts (these are infrastructure constants, not
 *   Malawi-regional data); file-storage buckets live in apps/web/src/lib/storage.ts;
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

// ─── SIGNED FILE-VIEW URL LIFETIME ───────────────────────
// Lifetime (seconds) of a signed file-view URL issued through
// /api/files/[fileId]. Centralized here so client refresh timers draw from
// one source instead of an inline per-file literal.
export const VIEW_URL_TTL_SECS = 3600 as const
