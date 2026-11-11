/**
 * apps/web/src/components/shared/HillsSigningScene.tsx
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, Phase 3)
 * [PURPOSE]: The dashboard-shaped skeleton that fades in over the sky while a
 *   sign-in is in progress (plan decision 2: a skeleton, never a spinner).
 *
 *   Pure markup with no state and no hooks. It is always in the page but hidden;
 *   globals.css shows it only while a submit button inside the shell is
 *   disabled, which is the login page's own `isBusy` state. When an error or the
 *   "no role assigned" alert re-enables the button, it fades away again, so it
 *   can never get stuck on screen. Each block uses the app's existing
 *   `.skeleton` sweep.
 */

export function HillsSigningScene() {
  return (
    <div className="hills-scene" aria-hidden="true">
      <div className="hills-scene__side">
        <span className="skeleton is-round" style={{ width: 36, height: 36 }} />
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="skeleton" style={{ height: 14, width: `${86 - (i % 3) * 14}%` }} />
        ))}
      </div>
      <div className="hills-scene__top">
        <span className="skeleton" style={{ height: 22, width: '42%' }} />
        <span className="skeleton is-round" style={{ height: 30, width: 30, marginLeft: 'auto' }} />
      </div>
      <div className="hills-scene__body">
        <div className="hills-scene__stats">
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} className="skeleton" style={{ height: 68 }} />
          ))}
        </div>
        <span className="skeleton" style={{ minHeight: 90 }} />
        <div className="hills-scene__rows">
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} className="skeleton" style={{ height: 16, width: `${100 - i * 12}%` }} />
          ))}
        </div>
      </div>
    </div>
  )
}
