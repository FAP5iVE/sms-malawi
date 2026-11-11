/**
 * apps/web/src/components/shared/AuthShellSkeleton.tsx
 *
 * [CHANGE TYPE]: NEW FILE (Chikangawa Hills theme, Phase 3)
 * [PURPOSE]: The Suspense fallback for /login: the new two-column sign-in layout
 *   drawn as grey sweeping blocks, so the first paint already has the sky, the
 *   column split and the card, and nothing jumps when the real form arrives.
 *   Static markup, no state. Uses the app's existing `.skeleton` sweep.
 */

import { PublicAmbientBackground } from '@/components/shared/PublicAmbientBackground'

export function AuthShellSkeleton() {
  return (
    <div className="hills hills-auth relative flex flex-1 flex-col font-sans" aria-busy="true">
      <PublicAmbientBackground vivid />
      <main className="hills-auth__main">
        <div className="hills-container">
          <div className="hills-split hills-auth__grid">
            <div className="hills-auth__statement">
              <div className="hills-auth__skyspace" />
              <div className="hills-auth__brand">
                <span className="hills-auth__ph skeleton" style={{ width: 64, height: 64, borderRadius: 999 }} />
                <span className="hills-auth__ph skeleton" style={{ width: 150, height: 18 }} />
              </div>
              <span className="hills-auth__ph skeleton" style={{ width: 'min(70%, 520px)', height: 'clamp(40px, 6vw, 96px)' }} />
              <span className="hills-auth__ph skeleton" style={{ width: 'min(46%, 340px)', height: 'clamp(40px, 6vw, 96px)', marginTop: 12 }} />
            </div>
            <div className="hills-auth__card">
              <span className="hills-auth__ph skeleton" style={{ width: 120, height: 28, marginBottom: 12 }} />
              <span className="hills-auth__ph skeleton" style={{ width: '80%', height: 16, marginBottom: 28 }} />
              <span className="hills-auth__ph skeleton" style={{ height: 44, marginBottom: 22 }} />
              <span className="hills-auth__ph skeleton" style={{ height: 44, marginBottom: 22 }} />
              <span className="hills-auth__ph skeleton" style={{ height: 60 }} />
            </div>
          </div>
        </div>
      </main>
      <span className="sr-only" role="status">Loading the sign-in page…</span>
    </div>
  )
}
