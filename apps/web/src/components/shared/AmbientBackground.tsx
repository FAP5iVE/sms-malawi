/**
 * [CHANGE TYPE]: NEW FILE
 * [FILE]: apps/web/src/components/shared/AmbientBackground.tsx
 * [PURPOSE]: Production fix (2026-08-27) — extracts the decorative backdrop
 *   (public)/login/page.tsx renders (a soft vignette plate, five colour glow
 *   orbs, and an organic multi-colour SVG line-art layer) into a standalone,
 *   zero-prop shared component, so apply/page.tsx's requested "same
 *   background as the login page" redesign doesn't copy-paste the ~130 lines
 *   of markup a second time. Geometry, gradient stops, and blur/opacity
 *   values are unchanged from the login page's own art — only the gradient
 *   `id`s are renamed (ambientTeal/Coral/Navy/Purple/Amber/SoftShadow,
 *   was loginTeal/Coral/Navy/Purple/Amber/SoftShadow) since this file no
 *   longer belongs to one page. Renders absolutely positioned, `inset-0`,
 *   `pointer-events-none` — the caller is responsible for giving its own
 *   wrapper `position: relative` and layering real content above this with
 *   its own `relative z-*`, exactly as (public)/login/page.tsx already does
 *   and as apply/page.tsx now does too.
 *
 * [CHANGE TYPE]: TARGETED EDIT (production fix, 2026-08-27).
 * [PURPOSE]: The art underneath was busy/colourful enough in places to
 *   fight with page text sitting directly on top of it (not inside an
 *   opaque bg-surface card) — reported as font colour clashing with the
 *   background. Added one more layer, last in DOM order so it paints over
 *   the glow orbs and SVG line art: a flat `bg-page` scrim, same
 *   `absolute inset-0` footprint as this component's own root (so it's
 *   exactly this background's size, never larger/smaller), letting the
 *   art show through dimmed rather than hiding it outright.
 *   Theme-adaptive for free — `bg-page` resolves to the app's own
 *   `--color-page` CSS variable (globals.css), which next-themes already
 *   flips between a near-white value in light mode and a near-black value
 *   in dark mode (`attribute="class"`, see ThemeProvider.tsx) — the exact
 *   `bg-page/NN` semi-opacity convention already used elsewhere in this
 *   app for theme-aware scrims (e.g. library/page.tsx's `bg-page/70`
 *   table-row overlay). Opacity is heavier in dark mode (`/75` vs `/55`)
 *   because the SVG art itself is far more vivid there (opacity-90 vs.
 *   opacity-[0.18] in light mode, a few lines below) and needs more
 *   dimming to bring text contrast back to the same place.
 * [DEPENDS ON]: apps/web/src/app/globals.css (--color-page light/dark
 *   values), apps/web/src/components/providers/ThemeProvider.tsx
 *   (next-themes attribute="class")
 */
export function AmbientBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Soft vignette plate for depth */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1600px] h-[1000px] max-w-[94vw] rounded-[80px] blur-3xl bg-gradient-to-br from-brand-teal-light/[0.07] via-transparent to-brand-coral/[0.06] dark:from-brand-navy-mid/25 dark:via-brand-navy/55 dark:to-black/60" />

      {/* Colourful glow orbs, spread and varied */}
      <div className="absolute top-[6%] left-[4%] w-64 h-64 sm:w-[420px] sm:h-[420px] rounded-full bg-brand-teal/15 dark:bg-brand-teal/25 blur-[100px] sm:blur-[130px]" />
      <div className="absolute bottom-[8%] right-[6%] w-64 h-64 sm:w-[420px] sm:h-[420px] rounded-full bg-brand-coral/15 dark:bg-brand-coral/22 blur-[110px] sm:blur-[140px]" />
      <div className="absolute top-[18%] right-[12%] w-52 h-52 sm:w-72 sm:h-72 rounded-full bg-brand-amber/12 dark:bg-brand-amber/20 blur-[90px] sm:blur-[110px]" />
      <div className="absolute bottom-[16%] left-[10%] w-52 h-52 sm:w-72 sm:h-72 rounded-full bg-brand-purple/12 dark:bg-brand-purple/20 blur-[90px] sm:blur-[110px]" />
      <div className="absolute top-[42%] left-[46%] w-56 h-56 sm:w-80 sm:h-80 rounded-full bg-brand-navy-light/10 dark:bg-brand-navy-light/18 blur-[90px] sm:blur-[110px]" />

      {/* Organic tube/ring line art in a full brand colour spread */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.18] dark:opacity-90 transition-opacity duration-300"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="ambientTeal" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--color-brand-teal-light)" />
            <stop offset="100%" stopColor="var(--color-brand-teal)" />
          </linearGradient>
          <linearGradient id="ambientCoral" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--color-brand-coral)" />
            <stop offset="100%" stopColor="var(--color-brand-amber)" />
          </linearGradient>
          <linearGradient id="ambientNavy" x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="var(--color-brand-navy-light)" />
            <stop offset="55%" stopColor="var(--color-brand-navy-mid)" />
            <stop offset="100%" stopColor="var(--color-brand-navy)" />
          </linearGradient>
          <linearGradient id="ambientPurple" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--color-brand-purple)" />
            <stop offset="100%" stopColor="var(--color-brand-navy-mid)" />
          </linearGradient>
          <linearGradient id="ambientAmber" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--color-brand-amber)" />
            <stop offset="100%" stopColor="var(--color-brand-coral)" />
          </linearGradient>
          <filter id="ambientSoftShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="16" stdDeviation="20" floodColor="#000000" floodOpacity="0.32" />
          </filter>
        </defs>

        {/* Top-centre ring — teal */}
        <g filter="url(#ambientSoftShadow)">
          <path
            d="M 590 130 C 590 85 640 50 695 50 C 750 50 790 90 790 145 C 790 200 745 240 690 240 C 640 240 600 200 600 155"
            stroke="url(#ambientTeal)"
            strokeWidth="54"
            strokeLinecap="round"
            fill="none"
          />
        </g>

        {/* Centre-left zigzag pill — navy */}
        <g filter="url(#ambientSoftShadow)" transform="translate(330, 300)">
          <path
            d="M 40 40 L 90 40 C 110 40 120 50 120 70 L 120 100 C 120 120 110 130 90 130 L 40 130 C 20 130 10 140 10 160 L 10 190 C 10 210 20 220 40 220 L 90 220"
            stroke="url(#ambientNavy)"
            strokeWidth="48"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </g>

        {/* Bottom-centre C-curve — coral/amber */}
        <g filter="url(#ambientSoftShadow)" transform="translate(470, 560)">
          <path
            d="M 120 20 C 50 30 10 90 10 150 C 10 215 65 265 140 265 C 200 265 245 225 245 170"
            stroke="url(#ambientCoral)"
            strokeWidth="58"
            strokeLinecap="round"
            fill="none"
          />
        </g>

        {/* Right-side spiral ribbon — purple */}
        <g filter="url(#ambientSoftShadow)">
          <path
            d="M 950 170 C 1040 180 1100 240 1090 330 C 1080 420 990 470 920 460 C 850 450 830 370 860 300 C 890 230 970 200 1050 220 C 1130 240 1170 320 1160 410 C 1150 500 1080 590 1010 650 C 930 720 840 770 760 810"
            stroke="url(#ambientPurple)"
            strokeWidth="50"
            strokeLinecap="round"
            fill="none"
          />
        </g>

        {/* Bottom-right sausage pillow — amber */}
        <g filter="url(#ambientSoftShadow)" transform="translate(1070, 660)">
          <path
            d="M 30 50 C 90 10 180 30 250 90 C 310 140 330 200 280 230"
            stroke="url(#ambientAmber)"
            strokeWidth="66"
            strokeLinecap="round"
            fill="none"
          />
        </g>

        {/* Top-right accent ring — amber */}
        <g filter="url(#ambientSoftShadow)">
          <circle cx="1250" cy="120" r="74" stroke="url(#ambientAmber)" strokeWidth="42" fill="none" />
        </g>

        {/* Bottom-left arc — purple/navy */}
        <g filter="url(#ambientSoftShadow)">
          <path
            d="M 40 830 A 170 170 0 0 1 380 850"
            stroke="url(#ambientPurple)"
            strokeWidth="46"
            strokeLinecap="round"
            fill="none"
          />
        </g>

        {/* Small floating teal ring, upper-mid */}
        <g filter="url(#ambientSoftShadow)">
          <circle cx="240" cy="120" r="46" stroke="url(#ambientTeal)" strokeWidth="34" fill="none" />
        </g>
      </svg>

      {/* Dim scrim — paints over the glow orbs and SVG art above, same
          inset-0 footprint as this component's own root, so text sitting
          directly on this background (outside an opaque bg-surface card)
          keeps enough contrast. bg-page tracks the theme toggle on its
          own (see header comment); dark mode gets a heavier scrim since
          the art above it is far more vivid there. */}
      <div className="absolute inset-0 bg-page/55 dark:bg-page/75" />
    </div>
  )
}