/**
 * [CHANGE TYPE]: NEW FILE (barrel — replaces the flat malawi.ts)
 * [FILE]: packages/shared/constants/malawi/index.ts
 * [R-PHASE]: R16 — Constants Centralization (Phase 10B Plan)
 * [PURPOSE]: Barrel re-export preserving the flat `@shared/constants/malawi`
 *   import surface after malawi.ts was split into focused sibling modules.
 *   Every export that previously lived in malawi.ts and was NOT deliberately
 *   relocated is re-exported here, so every existing consumer's
 *   `import { X } from '@shared/constants/malawi'` continues to resolve with
 *   no change.
 *
 *   DELIBERATELY NOT re-exported (relocated to @shared/constants/storage —
 *   these are Firestore/Appwrite infrastructure naming, not Malawi-regional
 *   data; their six COLLECTIONS consumers are swept to the new path):
 *     COLLECTIONS, SCHOOL_BUCKET_ID, STORAGE_BUCKET_IDS
 *   REMOVED (replaced by malawi/holidays.ts's getPublicHolidaysForYear();
 *   confirmed zero importers of the old flat array):
 *     MALAWI_PUBLIC_HOLIDAYS_2026
 * [DEPENDS ON]: ./districts, ./holidays, ./academic, ./currency, ./subjects,
 *   ./finance, ./identity, ./registration
 */

export * from './districts'
export * from './holidays'
export * from './academic'
export * from './currency'
export * from './subjects'
export * from './finance'
export * from './identity'
export * from './registration'
