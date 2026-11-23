/**
 * apps/web/src/components/brand/StudioWordmark.tsx
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, Phase 4b: home polish)
 *   Revised: the large watermark name is replaced by the two logos.
 * [PURPOSE]: The studio signature for the landing page footer.
 *   <StudioWordmark /> the 5iveStack Labs and Saviour Digital Solutions logos
 *                      side by side above the bottom bar, logos only, no text.
 *                      Both are the reverse (light-on-dark) artwork on a
 *                      transparent background, since the footer is always dark.
 *                      Files: public/brand/*-reverse.svg
 *   <StudioCredit />   "The system designed by 5iveStack Labs", the name in the
 *                      studio orange, a link only when studio.url is set.
 *   Styles: globals.css ("HILLS STUDIO"). Which parts show: studio.signature.
 */

import { studio } from '@/lib/hills/studio'

export function StudioWordmark() {
  if (studio.signature !== 'wordmark') return null
  return (
    <div className="hills-studio">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/5ivestack-labs-reverse.svg"
        alt="5iveStack Labs"
        className="hills-studio__logo hills-studio__logo--five"
        width={584}
        height={109}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/saviour-digital-solutions-reverse.svg"
        alt="Saviour Digital Solutions"
        className="hills-studio__logo hills-studio__logo--saviour"
        width={310}
        height={237}
      />
    </div>
  )
}

export function StudioCredit({ className = '' }: { className?: string }) {
  const name = studio.url ? (
    <a href={studio.url} target="_blank" rel="noopener noreferrer" className="hills-studio__credit-name">{studio.name}</a>
  ) : (
    <span className="hills-studio__credit-name">{studio.name}</span>
  )
  return <p className={className}>The system designed by {name}</p>
}
