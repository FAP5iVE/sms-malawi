/**
 * apps/web/src/components/brand/StudioWordmark.tsx
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, Phase 4b: home polish)
 * [PURPOSE]: The studio signature for the landing page footer.
 *   <StudioWordmark />  the large name that rises into place above the bottom
 *                       bar. Decorative (aria-hidden); the readable name is the
 *                       credit line.
 *   <StudioCredit />    "The system designed by 5iveStack Labs", the name in the
 *                       studio orange, a link only when studio.url is set.
 *   Styles: globals.css ("HILLS STUDIO"). Which parts show: studio.signature.
 *
 *   Hanken Grotesk has no old-style figures, so the numeral is drawn smaller by
 *   hand (.hills-studio__five) to sit at x-height and read as the word "five".
 */

import { studio } from '@/lib/hills/studio'

export function StudioWordmark() {
  if (studio.signature !== 'wordmark') return null
  return (
    <div className="hills-studio" aria-hidden="true">
      <p className="hills-studio__mark">
        <span className="hills-studio__name">
          <span className="hills-studio__five">5</span>iveStack
        </span>
        <span className="hills-studio__labs">Labs</span>
      </p>
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
