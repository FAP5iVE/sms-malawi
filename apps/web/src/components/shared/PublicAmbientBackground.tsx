/**
 * apps/web/src/components/shared/PublicAmbientBackground.tsx
 *
 * [CHANGE TYPE]: REWRITTEN INTERNALS (Chikangawa Hills theme, Phase 2). Same
 *   file name, same export, same call sites: `<PublicAmbientBackground />` and
 *   `<PublicAmbientBackground vivid />` still work exactly as before.
 *
 * [PURPOSE]: The shared backdrop behind every public page, the sign-in family
 *   and (as `calm`) the signed-in app. It now draws the Chikangawa Hills sky
 *   instead of the old colour orbs and tube line art:
 *     sky gradient (dawn / day / dusk / night, from the tokens in globals.css)
 *     + stars at night + a sun or moon + topographic contour lines.
 *   The blur orbs, drop-shadow filters and big blurred plate are gone, which
 *   also makes scrolling cheaper.
 *
 * [VARIANTS]
 *   default  Every public content page today. Keeps an interim readability
 *            scrim (below) so text written for the old plain background stays
 *            readable. The sun and moon are small and shown only on wide
 *            screens, in the margin beside the content column. Static.
 *   vivid    The sign-in family. Full-strength sky, no scrim (the glass card
 *            carries the text). Sun and moon move along their arc in Auto.
 *   home     For the landing page (not switched on in Phase 2). Same as vivid.
 *   calm     The signed-in app. Static: a softened sky that follows Light/Dark
 *            only (never the clock, so dashboards do not change at 4pm), faint
 *            contours, no sun, no stars, no animation.
 *   `vivid` (boolean) is kept for the existing call sites and means variant="vivid".
 *
 * [WHAT RUNS WHERE]: This file is plain markup with no hooks, so it renders on
 *   the server and ships no JavaScript of its own. Contour lines and stars are
 *   static files in public/hills/ (see tools/hills/generate-assets.mts) painted
 *   through CSS masks. The only client code is <HillsCelestial />, mounted for
 *   vivid and home to move the sun and moon.
 *
 * [WHY `fixed`]: Unchanged from before. A viewport-sized layer pinned behind
 *   the content looks the same at every scroll position and screen size.
 *
 * [USAGE]: Unchanged. Render as the first child inside a page's `bg-page`
 *   wrapper and give the real content `relative z-10`.
 *
 * [INTERIM SCRIM]: Existing pages colour their text for a plain light or dark
 *   page (navy in light, white in dark; muted text is only 4.37:1 on the plain
 *   light page). Any sky under that text would lower the contrast, and in Auto
 *   the clock can show a dusk sky on a device in light mode. So `default` covers
 *   the sky with the page's own `--background` colour across the content column
 *   and lets the sky show only in the side margins of wide screens. Narrow
 *   screens read exactly as today. Phase 6 removes this per page as each page is
 *   redesigned for the sky.
 */

import { HillsCelestial } from '@/components/shared/HillsCelestial'

export type AmbientVariant = 'default' | 'vivid' | 'home' | 'calm'

/** Moon artwork from the approved mockup. */
function MoonDisc() {
  return (
    <svg viewBox="0 0 100 100" focusable="false">
      <circle cx="50" cy="50" r="50" fill="#e8eef2" />
      <g fill="#9fb0bd" opacity=".38">
        <circle cx="34" cy="36" r="9" />
        <circle cx="64" cy="60" r="12" />
        <circle cx="61" cy="25" r="5.5" />
        <circle cx="31" cy="66" r="6.5" />
        <circle cx="77" cy="40" r="4" />
      </g>
    </svg>
  )
}

function Contours() {
  return (
    <div className="hills-bg__fade">
      <div className="hills-bg__cover hills-bg__glow" />
      <div className="hills-bg__cover hills-bg__map" />
    </div>
  )
}

export function PublicAmbientBackground({
  vivid = false,
  variant,
}: { vivid?: boolean; variant?: AmbientVariant } = {}) {
  const kind: AmbientVariant = variant ?? (vivid ? 'vivid' : 'default')

  if (kind === 'calm') {
    // Two fixed layers, switched by the app's own `.dark` class in CSS: no
    // script, no flash, and never driven by the clock.
    return (
      <>
        <div className="hills hills-bg hills-bg--calm dark:hidden" data-sky="day" aria-hidden="true">
          <div className="hills-bg__sky" />
          <Contours />
        </div>
        <div className="hills hills-bg hills-bg--calm hidden dark:block" data-sky="night" aria-hidden="true">
          <div className="hills-bg__sky" />
          <Contours />
        </div>
      </>
    )
  }

  const moves = kind === 'vivid' || kind === 'home'

  return (
    <div className={`hills hills-bg hills-bg--${kind}`} aria-hidden="true">
      <div className="hills-bg__sky" />
      {kind === 'default' && <div className="hills-bg__scrim" />}
      <div className="hills-bg__stars">
        <div className="hills-bg__cover hills-bg__stars-a" />
        <div className="hills-bg__cover hills-bg__stars-b" />
      </div>
      <div className="hills-bg__sun">
        <i />
      </div>
      <div className="hills-bg__moon">
        <MoonDisc />
      </div>
      <Contours />
      {moves && <HillsCelestial />}
    </div>
  )
}
