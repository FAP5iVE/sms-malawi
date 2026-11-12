/**
 * apps/web/src/components/motion/ScrollProgress.tsx
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, Phase 4b: home polish)
 * [PURPOSE]: A thin reading-progress bar along the top of the landing page.
 *   Decorative (aria-hidden), no JavaScript: CSS scroll-driven animation in
 *   globals.css ("HILLS MOTION"). Where that is unsupported (Firefox today) or
 *   motion is reduced, the bar is simply not shown.
 */

export function ScrollProgress() {
  return <div className="hills-progress" aria-hidden="true" />
}
