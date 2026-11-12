/**
 * apps/web/src/lib/hills/studio.ts
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, Phase 4b: home polish)
 * [PURPOSE]: The studio signature in the landing page footer: who built the
 *   system. One place for the name, the optional link and the display switch.
 *   (src/lib/site.ts belongs to the app, so these live here instead.)
 */

export const studio = {
  /** Written exactly like this everywhere: capital S, no space in "5iveStack". */
  name: '5iveStack Labs',
  /** The studio's website. Left out until the owner confirms it: with no URL the
   *  credit is plain text, never a made-up link. */
  url: undefined as string | undefined,
  /** 'wordmark' = large name above the bottom bar plus the credit line;
   *  'credit' = the credit line only. */
  signature: 'wordmark' as 'wordmark' | 'credit',
}
