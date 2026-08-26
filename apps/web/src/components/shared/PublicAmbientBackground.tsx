'use client'

/**
 * apps/web/src/components/shared/PublicAmbientBackground.tsx
 *
 * [PURPOSE]: The exact ambient backdrop from the login page
 *   (apps/web/src/app/(public)/login/page.tsx — vignette + five colour glow
 *   orbs + the nine-shape organic line-art SVG) extracted verbatim into one
 *   shared component, so every other public content page reuses the SAME
 *   artwork instead of the smaller, scattered per-section <ScribbleArt/>
 *   used on the landing page (apps/web/src/app/(public)/page.tsx). Nothing
 *   here is redrawn, rearranged, or thinned out — same gradients, same
 *   paths, same shapes, same opacities as the login page.
 *
 * [WHY `fixed` INSTEAD OF `absolute`]: The login page is a single-viewport
 *   layout, so its background is `absolute inset-0` inside a `min-h-screen`
 *   wrapper and that's never an issue. Several of the pages this component
 *   now backs (Privacy Policy, Terms of Use) scroll well past one viewport.
 *   An `absolute` layer stretched to a tall scrolling container forces
 *   `preserveAspectRatio="xMidYMid slice"` to zoom in to cover the extra
 *   height, which crops most of the artwork's width out of view — the
 *   opposite of "apply the exact scribble background as it is". `fixed`
 *   pins the exact same viewport-sized composition in place behind the
 *   content at every scroll position and on every screen size (mobile
 *   included), so it always renders identically to how it looks on the
 *   login page, with nothing stretched or cropped. This is also why no
 *   extra shapes were added for long pages — full, undistorted coverage
 *   comes from the positioning, not from scattering more artwork.
 *
 * [USAGE]: Render as the very first child inside a page's existing
 *   `bg-page` wrapper (same slot the login page uses for its own background
 *   div), then give the real content wrapper `relative z-10` so it stacks
 *   above the art. The wrapper's own `bg-page` colour still paints first;
 *   this component's shapes are the translucent decoration drawn over it —
 *   do not move this into a layout.tsx outside that wrapper, or it will
 *   render behind the page's opaque background colour and disappear.
 */
export function PublicAmbientBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {/* Soft vignette plate for depth */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1600px] h-[1000px] max-w-[94vw] rounded-[80px] blur-3xl bg-gradient-to-br from-brand-teal-light/[0.07] via-transparent to-brand-coral/[0.06] dark:from-brand-navy-mid/25 dark:via-brand-navy/55 dark:to-black/60" />

      {/* Colourful glow orbs, spread and varied */}
      <div className="absolute top-[6%] left-[4%] w-64 h-64 sm:w-[420px] sm:h-[420px] rounded-full bg-brand-teal/15 dark:bg-brand-teal/25 blur-[100px] sm:blur-[130px]" />
      <div className="absolute bottom-[8%] right-[6%] w-64 h-64 sm:w-[420px] sm:h-[420px] rounded-full bg-brand-coral/15 dark:bg-brand-coral/22 blur-[110px] sm:blur-[140px]" />
      <div className="absolute top-[18%] right-[12%] w-52 h-52 sm:w-72 sm:h-72 rounded-full bg-brand-amber/12 dark:bg-brand-amber/20 blur-[90px] sm:blur-[110px]" />
      <div className="absolute bottom-[16%] left-[10%] w-52 h-52 sm:w-72 sm:h-72 rounded-full bg-brand-purple/12 dark:bg-brand-purple/20 blur-[90px] sm:blur-[110px]" />
      <div className="absolute top-[42%] left-[46%] w-56 h-56 sm:w-80 sm:h-80 rounded-full bg-brand-navy-light/10 dark:bg-brand-navy-light/18 blur-[90px] sm:blur-[110px]" />

      {/* Organic tube/ring line art — identical defs/paths to the login page */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.18] dark:opacity-90 transition-opacity duration-300"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="pageAmbientTeal" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--color-brand-teal-light)" />
            <stop offset="100%" stopColor="var(--color-brand-teal)" />
          </linearGradient>
          <linearGradient id="pageAmbientCoral" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--color-brand-coral)" />
            <stop offset="100%" stopColor="var(--color-brand-amber)" />
          </linearGradient>
          <linearGradient id="pageAmbientNavy" x1="20%" y1="0%" x2="80%" y2="100%">
            <stop offset="0%" stopColor="var(--color-brand-navy-light)" />
            <stop offset="55%" stopColor="var(--color-brand-navy-mid)" />
            <stop offset="100%" stopColor="var(--color-brand-navy)" />
          </linearGradient>
          <linearGradient id="pageAmbientPurple" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--color-brand-purple)" />
            <stop offset="100%" stopColor="var(--color-brand-navy-mid)" />
          </linearGradient>
          <linearGradient id="pageAmbientAmber" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--color-brand-amber)" />
            <stop offset="100%" stopColor="var(--color-brand-coral)" />
          </linearGradient>
          <filter id="pageAmbientSoftShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="16" stdDeviation="20" floodColor="#000000" floodOpacity="0.32" />
          </filter>
        </defs>

        {/* Top-centre ring — teal */}
        <g filter="url(#pageAmbientSoftShadow)">
          <path
            d="M 590 130 C 590 85 640 50 695 50 C 750 50 790 90 790 145 C 790 200 745 240 690 240 C 640 240 600 200 600 155"
            stroke="url(#pageAmbientTeal)"
            strokeWidth="54"
            strokeLinecap="round"
            fill="none"
          />
        </g>

        {/* Centre-left zigzag pill — navy */}
        <g filter="url(#pageAmbientSoftShadow)" transform="translate(330, 300)">
          <path
            d="M 40 40 L 90 40 C 110 40 120 50 120 70 L 120 100 C 120 120 110 130 90 130 L 40 130 C 20 130 10 140 10 160 L 10 190 C 10 210 20 220 40 220 L 90 220"
            stroke="url(#pageAmbientNavy)"
            strokeWidth="48"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </g>

        {/* Bottom-centre C-curve — coral/amber */}
        <g filter="url(#pageAmbientSoftShadow)" transform="translate(470, 560)">
          <path
            d="M 120 20 C 50 30 10 90 10 150 C 10 215 65 265 140 265 C 200 265 245 225 245 170"
            stroke="url(#pageAmbientCoral)"
            strokeWidth="58"
            strokeLinecap="round"
            fill="none"
          />
        </g>

        {/* Right-side spiral ribbon — purple */}
        <g filter="url(#pageAmbientSoftShadow)">
          <path
            d="M 950 170 C 1040 180 1100 240 1090 330 C 1080 420 990 470 920 460 C 850 450 830 370 860 300 C 890 230 970 200 1050 220 C 1130 240 1170 320 1160 410 C 1150 500 1080 590 1010 650 C 930 720 840 770 760 810"
            stroke="url(#pageAmbientPurple)"
            strokeWidth="50"
            strokeLinecap="round"
            fill="none"
          />
        </g>

        {/* Bottom-right sausage pillow — amber */}
        <g filter="url(#pageAmbientSoftShadow)" transform="translate(1070, 660)">
          <path
            d="M 30 50 C 90 10 180 30 250 90 C 310 140 330 200 280 230"
            stroke="url(#pageAmbientAmber)"
            strokeWidth="66"
            strokeLinecap="round"
            fill="none"
          />
        </g>

        {/* Top-right accent ring — amber */}
        <g filter="url(#pageAmbientSoftShadow)">
          <circle cx="1250" cy="120" r="74" stroke="url(#pageAmbientAmber)" strokeWidth="42" fill="none" />
        </g>

        {/* Bottom-left arc — purple/navy */}
        <g filter="url(#pageAmbientSoftShadow)">
          <path d="M 40 830 A 170 170 0 0 1 380 850" stroke="url(#pageAmbientPurple)" strokeWidth="46" strokeLinecap="round" fill="none" />
        </g>

        {/* Small floating teal ring, upper-mid */}
        <g filter="url(#pageAmbientSoftShadow)">
          <circle cx="240" cy="120" r="46" stroke="url(#pageAmbientTeal)" strokeWidth="34" fill="none" />
        </g>
      </svg>
    </div>
  )
}