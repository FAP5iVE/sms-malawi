/**
 * [CHANGE TYPE]: NEW FILE (extracted from packages/shared/constants/malawi.ts)
 * [FILE]: packages/shared/constants/malawi/districts.ts
 * [R-PHASE]: R16 — Constants Centralization (Phase 10B Plan)
 * [PURPOSE]: Malawi administrative geography — the 28 districts (unchanged
 *   from the flat malawi.ts) plus the three-region grouping the districts
 *   were already implicitly organised by in comments. Split out of the
 *   monolithic malawi.ts into a focused, single-concern module; the flat
 *   `@shared/constants/malawi` import surface is preserved by the barrel
 *   index.ts, so no consumer import path changes for these exports.
 * [DEPENDS ON]: none
 */

// ─── MALAWI REGIONS ───────────────────────────────────────
export const MALAWI_REGIONS = ['Northern', 'Central', 'Southern'] as const
export type MalawiRegion = (typeof MALAWI_REGIONS)[number]

// ─── MALAWI DISTRICTS ─────────────────────────────────────
export const MALAWI_DISTRICTS = [
  // Northern Region
  'Chitipa',
  'Karonga',
  'Likoma',
  'Mzimba',
  'Nkhata-Bay',
  'Rumphi',
  // Central Region
  'Dedza',
  'Dowa',
  'Kasungu',
  'Lilongwe',
  'Mchinji',
  'Nkhotakota',
  'Ntcheu',
  'Ntchisi',
  'Salima',
  // Southern Region
  'Balaka',
  'Blantyre',
  'Chikwawa',
  'Chiradzulu',
  'Machinga',
  'Mangochi',
  'Mulanje',
  'Mwanza',
  'Neno',
  'Nsanje',
  'Phalombe',
  'Thyolo',
  'Zomba',
] as const

export type MalawiDistrict = (typeof MALAWI_DISTRICTS)[number]
