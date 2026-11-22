'use client'

/**
 * apps/web/src/components/shared/AuthShell.tsx
 *
 * [CHANGE TYPE]: REWRITTEN MARKUP (Chikangawa Hills theme, Phase 3). Same file,
 *   same export, same props (`children`, `footer`), plus one optional look prop.
 *
 * [PURPOSE]: The frame shared by the whole sign-in family: /login,
 *   /login?claim=1 (claim account), /forgot-password, /change-password and
 *   /reset-password. Re-skinning this one file moves all five screens.
 *
 *   The centred frosted plate is gone. The page uses the wide container
 *   (.hills-container) split in two from 900px:
 *     left   crest and school name, the time-aware headline ("Rise to the",
 *            "Back to the", "Home to the", "Rest in the" + "hills.") with its
 *            supporting line, then `footer` (login's authorised-access notice),
 *            all on the sky;
 *     right  the page's own form (`children`) on a surface, 340 to 440px wide.
 *   Below 900px it is one column in the order headline, form, notice.
 *
 * [TIME-AWARE HEADLINE]: All four phrases are in the page; CSS shows the one that
 *   matches <html data-sky> (set before paint by the root layout's script and
 *   kept current by HillsSkySync), crossfading when the sky changes. No clock code
 *   lives here, and the headline is decoration (aria-hidden): the page's own <h1>
 *   inside the card is what assistive technology reads.
 *
 * [SURFACE]: Follows the Light/Dark theme, not the sky, so forms written for a
 *   plain white or navy card stay readable on every sky (see globals.css, HILLS
 *   AUTH). Forgot, reset and change-password keep their old field styling inside
 *   it until Phase 7.
 *
 * [TYPING RIPPLE]: useTypingRipple listens for bubbling `input` events on <main>
 *   and draws rings in the fixed layer below. It never touches a form handler.
 *
 * [skeletonOnBusy]: login only. Shows the dashboard-shaped skeleton in place of
 *   the headline while the page's own submit button is disabled (its busy state).
 *
 * [DEPENDS ON]: PublicAmbientBackground (`vivid`), SchoolMark, HillsSigningScene,
 *   useTypingRipple. The header bar comes from (public)/layout.tsx.
 */

import Link from 'next/link'
import { useRef, type ReactNode } from 'react'
import { PublicAmbientBackground } from '@/components/shared/PublicAmbientBackground'
import { SchoolMark } from '@/components/shared/SchoolMark'
import { HillsSigningScene } from '@/components/shared/HillsSigningScene'
import { useTypingRipple } from '@/lib/hills/useTypingRipple'
import { CANVAS, LIT_RING_COUNT, PEAK, RING_SPACING, ringPath } from '@/lib/hills/ripple'

/** The innermost contour lines, drawn once. They sit exactly on the background's own lines and light up as the form fills in. */
const LIT_RINGS = Array.from({ length: LIT_RING_COUNT }, (_, i) => ringPath(PEAK.x, PEAK.y, (i + 1) * RING_SPACING))

/** Phrase and supporting line for each sky (mockup wording). */
const SKY_WORDS = [
  { sky: 'dawn', lead: 'Rise to the', sub: 'A new school day begins. Your timetable and notices are ready.' },
  { sky: 'day', lead: 'Back to the', sub: 'Results, fees, timetables and notices for your school day, in one place.' },
  { sky: 'dusk', lead: 'Home to the', sub: 'The day is winding down. Check results, fees and notices before you go.' },
  { sky: 'night', lead: 'Rest in the', sub: 'Quiet hours. Results, fees and notices will be here when you need them.' },
] as const

interface AuthShellProps {
  /** The page's own content, rendered in the form card (right on desktop). */
  children: ReactNode
  /** Optional note under the headline on desktop and after the form on smaller
   *  screens (e.g. login's "Authorised access" notice). */
  footer?: ReactNode
  /** Show the dashboard-shaped skeleton while a submit button is disabled. */
  skeletonOnBusy?: boolean
}

export function AuthShell({ children, footer, skeletonOnBusy = false }: AuthShellProps) {
  const mainRef = useRef<HTMLElement>(null)
  const ringsRef = useRef<SVGSVGElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  useTypingRipple(mainRef, ringsRef, rootRef)

  return (
    <div ref={rootRef} className="hills hills-auth relative flex flex-1 flex-col font-sans" data-scene={skeletonOnBusy ? '' : undefined}>
      <PublicAmbientBackground vivid />

      {/* Typing response (decorative): behind the content, above the sky. Same 3:2 box and
          artwork canvas as the background's contour lines, so it lines up at every size. */}
      <div className="hills-ripple" aria-hidden="true">
        <svg
          ref={ringsRef}
          className="hills-ripple__cover"
          viewBox={`0 0 ${CANVAS.w} ${CANVAS.h}`}
          preserveAspectRatio="none"
          focusable="false"
        >
          <g>
            {LIT_RINGS.map((d, i) => (
              <path key={i} data-lit-ring className="hills-ripple__lit" d={d} />
            ))}
          </g>
          <g transform={`translate(${PEAK.x} ${PEAK.y})`} data-ripple-waves />
        </svg>
      </div>

      <main ref={mainRef} className="hills-auth__main">
        <div className="hills-container">
          <div className="hills-split hills-auth__grid">
            <div className="hills-auth__statement">
              {skeletonOnBusy && <HillsSigningScene />}
              <div className="hills-auth__statement-copy">
                {/* Room for the sun's arc above the headline on phones. */}
                <div className="hills-auth__skyspace" aria-hidden="true" />

                <div className="hills-auth__brand">
                  <Link href="/" title="Home" className="hills-auth__crest">
                    <SchoolMark kind="logo" tone="onLight" alt="Chikangawa Hills Academy logo" width={176} height={176} priority className="hills-auth__crest-navy" />
                    <SchoolMark kind="logo" tone="onDark" alt="" width={176} height={176} priority className="hills-auth__crest-light" />
                  </Link>
                  <div>
                    <span className="hills-auth__brand-name">SMS Malawi</span>
                    <span className="hills-auth__brand-sub">Chikangawa Hills Academy</span>
                  </div>
                </div>

                <div aria-hidden="true">
                  <p className="hills-auth__hd">
                    <span className="hills-words">
                      {SKY_WORDS.map((w) => (
                        <span key={w.sky} data-sky-word={w.sky}>{w.lead}</span>
                      ))}
                    </span>
                    <span className="hills-auth__acc">hills.</span>
                  </p>
                  <p className="hills-auth__sub hills-words">
                    {SKY_WORDS.map((w) => (
                      <span key={w.sky} data-sky-word={w.sky}>{w.sub}</span>
                    ))}
                  </p>
                </div>
              </div>
            </div>

            <div className="hills-auth__card">{children}</div>

            {footer && <div className="hills-auth__notice">{footer}</div>}
          </div>
        </div>
      </main>
    </div>
  )
}
