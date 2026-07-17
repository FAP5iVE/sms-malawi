/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: packages/shared/constants/malawi/identity.ts
 * [R-PHASE]: R16 — Constants Centralization (Phase 10B Plan)
 * [PURPOSE]: One shared LAST-RESORT fallback for school-identity data,
 *   resolving ten independently-hardcoded, mutually-inconsistent copies of
 *   the same values (including two conflicting founding years, 1979 vs 1990,
 *   and two conflicting addresses, "P.O. Box 1" vs "P.O. Box 123"). The
 *   AUTHORITATIVE values always come from settingsService.getIdentitySettings()
 *   at runtime; this constant is used only when a settings read is
 *   unavailable (e.g. a static asset, a build-time context, or a service
 *   worker). Values are aligned with the SETTING_META defaults in
 *   S/types/settings.ts so the fallback and the settings default never
 *   disagree.
 * [DEPENDS ON]: none
 */

export interface SchoolIdentity {
  name: string
  address: string
  phone: string
  email: string
  foundedYear: number
}

/** Last-resort fallback ONLY. Prefer settingsService.getIdentitySettings(). */
export const DEFAULT_SCHOOL_IDENTITY: SchoolIdentity = {
  name: 'Secondary School Management System',
  address: 'P.O. Box 1, Blantyre, Malawi',
  phone: '+265 1 000 000',
  email: 'info@school.mw',
  foundedYear: 1990,
}
